"use strict";
// ============================================================================
// CicProvider — implementazione BillingProvider contro Contabilità in Cloud (Reviso)
// ----------------------------------------------------------------------------
// Payload validati sullo spike del 2026-06-05 (trial Inglesina Italiana):
//   • ordine/preventivo: POST /orders | /quotations, righe con discountPercentage
//     + product (obbligatorio) + vatInfo.vatAccount.vatCode → Reviso calcola i
//     totali con la STESSA regola di rounding.ts (verificato al centesimo).
//   • DDT: POST /delivery-notes/sales, modello legacy (id-based), serie 29,
//     prezzi opzionali (documento di trasporto). Ritorna 200 anche su errore →
//     va controllato res.errorCode.
//   • ogni riga DEVE riferire un product → le righe senza codice (Spedizione/
//     Extra) usano il prodotto generico cfg.genericProductNumber.
// NB: questo modulo è ADDITIVO e non ancora cablato nei trigger di index.ts.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CicProvider = void 0;
exports.createCicProvider = createCicProvider;
const cicClient_1 = require("./cicClient");
const cicConfig_1 = require("./cicConfig");
const rounding_1 = require("./rounding");
class CicProvider {
    constructor(client, cfg) {
        this.client = client;
        this.cfg = cfg;
        this.backend = 'cic';
    }
    // --- CLIENTI ---------------------------------------------------------------
    async findOrCreateCustomer(input) {
        const piva = (input.piva || '').trim();
        if (!piva)
            throw new Error('findOrCreateCustomer: P.IVA mancante');
        const filter = encodeURIComponent(`vatNumber$eq:${piva}`);
        const found = await this.client.get(`/customers?filter=${filter}`);
        const list = ((found === null || found === void 0 ? void 0 : found.collection) || []);
        if (list.length > 0) {
            const c = list[0];
            return { id: c.customerNumber, name: c.name, piva: c.vatNumber || piva };
        }
        const created = await this.client.post('/customers', Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ name: input.name, vatNumber: piva, currency: 'EUR', customerGroup: { customerGroupNumber: this.cfg.customerGroupNumber }, vatZone: { vatZoneNumber: this.cfg.domesticVatZone }, paymentTerms: { paymentTermsNumber: this.cfg.defaultPaymentTermsNumber } }, (input.taxCode ? { corporateIdentificationNumber: input.taxCode } : {})), (input.email ? { email: input.email } : {})), (input.address ? { address: input.address } : {})), (input.zip ? { zip: input.zip } : {})), (input.city ? { city: input.city } : {})));
        return { id: created.customerNumber, name: created.name, piva: created.vatNumber || piva };
    }
    // Recupera l'anagrafica COMPLETA di un cliente CiC per P.IVA (per l'import in
    // POPS). Ritorna null se assente. NB: in CiC la P.IVA è memorizzata SENZA il
    // prefisso 'IT' (vedi risorsexCiC/fix-customers.mjs) → lo togliamo, così la
    // ricerca esatta `vatNumber$eq:` fa match anche se l'operatore digita 'IT...'.
    // La provincia su Reviso è un ProvinceReference (non una stringa) → non la
    // esponiamo qui (l'import la lascia vuota).
    async fetchCustomerByVat(piva) {
        const clean = (piva || '').trim().replace(/^IT/i, '');
        if (!clean)
            return null;
        const filter = encodeURIComponent(`vatNumber$eq:${clean}`);
        const found = await this.client.get(`/customers?filter=${filter}`);
        const list = ((found === null || found === void 0 ? void 0 : found.collection) || []);
        if (list.length === 0)
            return null;
        const c = list[0];
        return {
            customerNumber: c.customerNumber,
            name: c.name || '',
            vatNumber: c.vatNumber || clean,
            taxCode: c.corporateIdentificationNumber || '',
            email: c.email || '',
            address: c.address || '',
            zip: c.zip || '',
            city: c.city || '',
        };
    }
    // --- ORDINI / PREVENTIVI ---------------------------------------------------
    async createOrder(doc) {
        return this.createSalesDoc('/orders', doc);
    }
    async createQuotation(doc) {
        return this.createSalesDoc('/quotations', doc);
    }
    // In CiC il prodotto si referenzia col productNumber CiC (auto-assegnato), NON
    // col codice POPS (che è il barCode). Usiamo il cicProductId mappato; se manca,
    // fallback al prodotto generico (cfg.genericProductNumber = productNumber CiC del
    // prodotto "VARIE", da configurare in config/cic).
    productRef(cicProductId) {
        const pn = (cicProductId != null && String(cicProductId).trim())
            ? String(cicProductId).trim()
            : this.cfg.genericProductNumber;
        return { productNumber: pn, self: `${this.cfg.baseUrl}/products/${encodeURIComponent(pn)}` };
    }
    async createSalesDoc(path, doc) {
        var _a, _b;
        // Non inviamo i totali doc: Reviso li calcola con la stessa regola di
        // rounding.ts (provato nello spike → combaciano). La validazione "cifra ==
        // quella vista dal cliente" la fa il chiamante (generaOrdineCiC) contro
        // totaleScontato, così non lasciamo ordini orfani in caso di scarto.
        const payload = Object.assign(Object.assign({ date: doc.date, currency: 'EUR', paymentTerms: { paymentTermsNumber: this.cfg.defaultPaymentTermsNumber }, customer: { customerNumber: Number(doc.customer.id) }, recipient: { name: doc.customer.name, vatZone: { vatZoneNumber: this.cfg.domesticVatZone } }, layout: { layoutNumber: this.cfg.layoutNumber } }, (doc.visibleSubject ? { notes: { heading: doc.visibleSubject } } : {})), { lines: doc.lines.map((l, i) => ({
                lineNumber: i + 1,
                description: l.description,
                quantity: l.qty,
                unitNetPrice: (0, rounding_1.roundTo10)(l.unitNetPrice),
                discountPercentage: doc.discountPercentage,
                product: this.productRef(l.cicProductId),
                vatInfo: { vatAccount: { vatCode: this.cfg.vatCode } },
            })) });
        const res = await this.client.post(path, payload);
        // Anti-orfano: se Reviso non restituisce un id valido, lancia PRIMA che il
        // chiamante persista cic_order_id (evita ordini orfani / ri-trigger).
        if ((res === null || res === void 0 ? void 0 : res.errorCode) || (res === null || res === void 0 ? void 0 : res.id) == null) {
            const msg = ((_b = (_a = res === null || res === void 0 ? void 0 : res.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || (res === null || res === void 0 ? void 0 : res.message) || (res === null || res === void 0 ? void 0 : res.errorCode) || 'risposta senza id';
            throw new Error(`Creazione documento CiC fallita (${path}): ${msg}`);
        }
        return this.toSalesResult(res);
    }
    toSalesResult(res) {
        var _a, _b, _c, _d;
        return {
            id: res.id,
            number: res.number,
            url: (_a = res === null || res === void 0 ? void 0 : res.pdf) === null || _a === void 0 ? void 0 : _a.download,
            netAmount: (_b = res.netAmount) !== null && _b !== void 0 ? _b : 0,
            vatAmount: (_c = res.vatAmount) !== null && _c !== void 0 ? _c : 0,
            grossAmount: (_d = res.grossAmount) !== null && _d !== void 0 ? _d : 0,
        };
    }
    // --- DDT -------------------------------------------------------------------
    // Flusso CONFERMATO sul trial (2026-06-13, da risposta supporto Reviso):
    //   1. POST /delivery-notes/sales                          → crea la BOZZA (status Draft, niente numero)
    //   2. POST /delivery-notes/sales/issue?filter=id$eq:{id}  → EMETTE; Reviso assegna il numero dalla serie
    //   3. GET  /delivery-notes/sales/{id}                     → rilegge il numero definitivo
    // I DDT (come le fatture) hanno stati: il numero definitivo arriva solo con
    // l'emissione. NON forziamo né pre-peschiamo il numero — lo assegna /issue
    // dalla serie cfg.ddtNumberSeries. Lo stato attraversa Draft → BeingIssued →
    // Issued (transitorio), perciò la rilettura tollera qualche tentativo.
    // Payload riga allineato all'esempio ufficiale Postman: product via `product.id`
    // (= productNumber), totali per riga forniti (computeTotals).
    async createDeliveryNote(input) {
        var _a, _b, _c, _d, _e;
        const ownerId = Number(input.customer.id);
        const totals = (0, rounding_1.computeTotals)(input.lines, 0, this.cfg.vatRate); // DDT: nessuno sconto globale
        const productLines = input.lines.map((l, i) => {
            const net = totals.lineNets[i];
            const vat = (0, rounding_1.round2)((net * this.cfg.vatRate) / 100);
            // product.id = productNumber CiC mappato (cicProductId), NON il codice POPS.
            const pid = (l.cicProductId != null && String(l.cicProductId).trim())
                ? String(l.cicProductId).trim()
                : this.cfg.genericProductNumber;
            return {
                product: { name: l.description, id: pid, metaData: null },
                chainId: null,
                lineNr: i + 1,
                location: null,
                description: l.description,
                vatInfo: { vatAccount: { id: this.cfg.vatCode, metaData: null }, vatRate: this.cfg.vatRate },
                quantity: l.qty,
                unit: null,
                unitNetPrice: (0, rounding_1.roundTo10)(l.unitNetPrice),
                unitGrossPrice: (0, rounding_1.round2)(l.unitNetPrice * (1 + this.cfg.vatRate / 100)),
                totalNetAmount: net,
                totalGrossAmount: (0, rounding_1.round2)(net + vat),
                unitCostPrice: null,
                discountPercentage: 0.0,
                totalVatAmount: vat,
                manuallyEditedSalesPrice: true,
            };
        });
        const ddt = {
            references: null, affectsInStockCounter: true, destination: null, quotation: null,
            paymentDetails: {
                date: input.date,
                paymentTerms: { id: this.cfg.defaultPaymentTermsNumber, metaData: null },
                paymentType: null, bankAccount: null,
            },
            notesAndAttachments: null,
            vatAmount: totals.vat, totalAmount: totals.gross,
            deliveryNoteType: 'Sales', deliveryNoteStatus: 'Draft', // bozza: l'emissione (e il numero) avviene via /issue
            owner: {
                address: null, zipCode: null, city: null,
                countryCode: { id: 'IT', metaData: null }, country: 'Italia',
                vatZone: { vatZoneNumber: this.cfg.domesticVatZone, id: this.cfg.domesticVatZone, metaData: null },
                vatAccount: null, name: input.customer.name, id: ownerId, metaData: null,
            },
            numberSeries: {
                prefix: 'DDT', sequenceType: 'Ordered',
                numberSeriesSequenceElement: null, // niente numero forzato: lo assegna /issue dalla serie
                id: this.cfg.ddtNumberSeries, metaData: null,
            },
            invoice: null, order: null,
            productDetails: {
                priceList: { calculatedInNetAmount: true, isBasePriceList: true, number: 0, id: 0, metaData: null },
                priceInGross: false, defaultDiscountPercentage: 0.0, productLines,
            },
            deliveryDetails: {
                deliveredBy: input.shipping.transportType === 'COURIER' ? 'Carrier' : 'Self',
                reasonForDelivery: null, deliveryTerms: null, deliveryStartDate: null, deliveryEndDate: null,
                numberOfPackages: input.shipping.packages, descriptionOfPackages: null,
                netWeight: null, grossWeight: (_a = input.shipping.weight) !== null && _a !== void 0 ? _a : null, carrierInfo: null,
                id: null, metaData: null,
            },
            additionalExpenses: null, date: input.date,
            additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
        };
        // 1) crea la BOZZA
        const created = await this.client.post('/delivery-notes/sales', ddt);
        if (created === null || created === void 0 ? void 0 : created.errorCode) {
            const msg = ((_c = (_b = created.errors) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) || created.message || created.errorCode;
            throw new Error(`DDT CiC: creazione bozza fallita: ${msg}`);
        }
        const id = created === null || created === void 0 ? void 0 : created.id;
        if (id == null)
            throw new Error('DDT CiC: la creazione non ha restituito un id.');
        // 2) EMETTE: Reviso assegna il numero dalla serie. /issue ritorna un array;
        //    in caso di errore torna un oggetto con errorCode (oppure il POST lancia).
        //    Se l'emissione fallisce la BOZZA resterebbe orfana su Reviso → la
        //    cancelliamo (best-effort) prima di propagare l'errore.
        const filter = encodeURIComponent(`id$eq:${id}`);
        try {
            const issued = await this.client.post(`/delivery-notes/sales/issue?filter=${filter}`, undefined);
            if (issued && !Array.isArray(issued) && issued.errorCode) {
                const msg = ((_e = (_d = issued.errors) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) || issued.message || issued.errorCode;
                throw new Error(`emissione rifiutata: ${msg}`);
            }
        }
        catch (e) {
            await this.deleteDraftQuiet(id);
            throw new Error(`DDT CiC: emissione fallita (id ${id}, bozza rimossa): ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
        }
        // 3) rilegge il numero definitivo (tollera il transitorio BeingIssued)
        const number = await this.readIssuedNumber(id);
        return {
            id,
            number: number !== null && number !== void 0 ? number : undefined,
            url: undefined,
            netAmount: totals.net,
            vatAmount: totals.vat,
            grossAmount: totals.gross,
        };
    }
    /** Cancella una bozza DDT rimasta orfana dopo un'emissione fallita (best-effort, non solleva). */
    async deleteDraftQuiet(id) {
        try {
            await this.client.del(`/delivery-notes/sales/${id}`);
        }
        catch (_a) {
            // best-effort: se non si riesce a pulire, l'errore principale resta quello di /issue
        }
    }
    /**
     * Rilegge il DDT finché è `Issued` con un numero assegnato. Dopo /issue lo
     * stato passa per `BeingIssued` (transitorio): qualche tentativo breve basta.
     * Best-effort: ritorna il numero appena disponibile, altrimenti null.
     */
    async readIssuedNumber(id) {
        var _a, _b, _c;
        let num = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            const dn = await this.client.get(`/delivery-notes/sales/${id}`);
            num = (_c = (_b = (_a = dn === null || dn === void 0 ? void 0 : dn.numberSeries) === null || _a === void 0 ? void 0 : _a.numberSeriesSequenceElement) === null || _b === void 0 ? void 0 : _b.number) !== null && _c !== void 0 ? _c : null;
            if (num != null && (dn === null || dn === void 0 ? void 0 : dn.deliveryNoteStatus) === 'Issued')
                return num;
            await new Promise((r) => setTimeout(r, 300));
        }
        return num;
    }
    // --- DELETE / URL ----------------------------------------------------------
    async deleteDocument(ref) {
        if (ref.type === 'delivery_note') {
            // I DDT si cancellano via rest.reviso.com (NON il self, che punta al microservizio azure).
            await this.client.del(`/delivery-notes/sales/${ref.id}`);
            return;
        }
        const base = ref.type === 'quotation' ? '/quotations' : '/orders';
        try {
            await this.client.del(`${base}/${ref.id}`);
        }
        catch (e) {
            // Gli ordini ARCHIVIATI non si cancellano (S_V_87) → de-archivia e ritenta.
            const full = await this.client.get(`${base}/${ref.id}`);
            if (full && full.isArchived) {
                full.isArchived = false;
                await this.client.put(`${base}/${ref.id}`, full);
                await this.client.del(`${base}/${ref.id}`);
            }
            else {
                throw e;
            }
        }
    }
    async getFreshDocUrl(ref) {
        var _a;
        if (ref.type === 'delivery_note') {
            return `${this.cfg.baseUrl}/delivery-notes/sales/${ref.id}`;
        }
        const base = ref.type === 'quotation' ? '/quotations' : '/orders';
        const res = await this.client.get(`${base}/${ref.id}`);
        return ((_a = res === null || res === void 0 ? void 0 : res.pdf) === null || _a === void 0 ? void 0 : _a.download) || `${this.cfg.baseUrl}${base}/${ref.id}/pdf`;
    }
    // --- INDICI MAPPATURE (per il sync chiavi naturali → cic*, Fase 4) --------
    // Scoperta 13/06 (sonda test-mapping.mjs): l'import nativo NON mette il codice
    // POPS in productNumber (auto-assegnato) ma in `barCode`. La chiave naturale
    // prodotti è quindi barCode; quella clienti è vatNumber. Carichiamo l'intero
    // catalogo/anagrafica una volta e costruiamo le mappe in memoria (meno chiamate
    // di una GET filtrata per record).
    /** Mappa barCode(UPPER) → productNumber (id CiC del prodotto). */
    async buildProductBarcodeIndex() {
        const map = new Map();
        let page = 0;
        let hasMore = true;
        while (hasMore && page < 50) {
            const data = await this.client.get(`/products?pagesize=1000&skippages=${page}`);
            const items = ((data === null || data === void 0 ? void 0 : data.collection) || []);
            for (const p of items) {
                if (p.barCode && p.productNumber != null) {
                    map.set(String(p.barCode).toUpperCase().trim(), p.productNumber);
                }
            }
            hasMore = items.length >= 1000;
            page++;
        }
        return map;
    }
    /** Mappa vatNumber → customerNumber per tutti i clienti CiC. */
    async buildCustomerVatIndex() {
        const map = new Map();
        let page = 0;
        let hasMore = true;
        while (hasMore && page < 50) {
            const data = await this.client.get(`/customers?pagesize=1000&skippages=${page}`);
            const items = ((data === null || data === void 0 ? void 0 : data.collection) || []);
            for (const c of items) {
                if (c.vatNumber && c.customerNumber != null) {
                    map.set(String(c.vatNumber).trim(), c.customerNumber);
                }
            }
            hasMore = items.length >= 1000;
            page++;
        }
        return map;
    }
    // --- CREAZIONE PRODOTTO (Fase 2: nuovi articoli del listino da POPS) -------
    /** Cerca un prodotto CiC per barCode (= codice POPS). Ritorna il productNumber o null. */
    async findProductByBarcode(code) {
        var _a;
        const filter = encodeURIComponent(`barCode$eq:${code}`);
        const found = await this.client.get(`/products?filter=${filter}`);
        const list = ((found === null || found === void 0 ? void 0 : found.collection) || []);
        return list.length > 0 ? ((_a = list[0].productNumber) !== null && _a !== void 0 ? _a : null) : null;
    }
    /**
     * Crea un prodotto su Reviso con barCode = codice POPS (chiave naturale).
     * Idempotente: se esiste già un prodotto con quel barCode lo riusa (retry-safe).
     * Ritorna il productNumber CiC (da salvare come cicProductId in products/code).
     */
    async createProduct(input) {
        var _a, _b;
        const existing = await this.findProductByBarcode(input.code);
        if (existing != null)
            return existing;
        const created = await this.client.post('/products', Object.assign({ productNumber: input.code, name: input.name, barCode: input.code, productGroup: { productGroupNumber: this.cfg.productGroupNumber } }, (input.salesPrice != null ? { salesPrice: input.salesPrice } : {})));
        if ((created === null || created === void 0 ? void 0 : created.errorCode) || (created === null || created === void 0 ? void 0 : created.productNumber) == null) {
            const msg = ((_b = (_a = created === null || created === void 0 ? void 0 : created.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || (created === null || created === void 0 ? void 0 : created.message) || (created === null || created === void 0 ? void 0 : created.errorCode) || 'risposta senza productNumber';
            throw new Error(`Creazione prodotto CiC fallita (${input.code}): ${msg}`);
        }
        return created.productNumber;
    }
    // --- PRODOTTI (read-only check) -------------------------------------------
    async syncProducts(codes) {
        const found = new Set();
        let page = 0;
        let hasMore = true;
        while (hasMore && page < 50) {
            const data = await this.client.get(`/products?pagesize=1000&skippages=${page}`);
            const items = ((data === null || data === void 0 ? void 0 : data.collection) || []);
            for (const p of items) {
                if (p.productNumber)
                    found.add(String(p.productNumber).toUpperCase().trim());
            }
            hasMore = items.length >= 1000;
            page++;
        }
        const missing = codes.filter((c) => !found.has(c.toUpperCase().trim()));
        return { updated: codes.length - missing.length, missing };
    }
}
exports.CicProvider = CicProvider;
/** Costruisce un CicProvider leggendo config/cic. */
async function createCicProvider() {
    const cfg = await (0, cicConfig_1.getCicConfig)();
    return new CicProvider(new cicClient_1.CicClient(cfg), cfg);
}
//# sourceMappingURL=cicProvider.js.map