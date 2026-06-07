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
    // --- ORDINI / PREVENTIVI ---------------------------------------------------
    async createOrder(doc) {
        return this.createSalesDoc('/orders', doc);
    }
    async createQuotation(doc) {
        return this.createSalesDoc('/quotations', doc);
    }
    productRef(code) {
        const pn = code && code.trim() ? code.trim() : this.cfg.genericProductNumber;
        return { productNumber: pn, self: `${this.cfg.baseUrl}/products/${encodeURIComponent(pn)}` };
    }
    async createSalesDoc(path, doc) {
        // Non inviamo i totali doc: Reviso li calcola con la stessa regola di
        // rounding.ts (provato nello spike → combaciano). La validazione "cifra ==
        // quella vista dal cliente" la fa il chiamante (generaOrdineCiC) contro
        // totaleScontato, così non lasciamo ordini orfani in caso di scarto.
        const payload = Object.assign(Object.assign({ date: doc.date, currency: 'EUR', paymentTerms: { paymentTermsNumber: this.cfg.defaultPaymentTermsNumber }, customer: { customerNumber: Number(doc.customer.id) }, recipient: { name: doc.customer.name, vatZone: { vatZoneNumber: this.cfg.domesticVatZone } }, layout: { layoutNumber: this.cfg.layoutNumber } }, (doc.visibleSubject ? { notes: { heading: doc.visibleSubject } } : {})), { lines: doc.lines.map((l, i) => ({
                lineNumber: i + 1,
                description: l.description,
                quantity: l.qty,
                unitNetPrice: l.unitNetPrice,
                discountPercentage: doc.discountPercentage,
                product: this.productRef(l.code),
                vatInfo: { vatAccount: { vatCode: this.cfg.vatCode } },
            })) });
        const res = await this.client.post(path, payload);
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
    // Payload allineato all'esempio ufficiale della Postman collection Reviso:
    //  • product si referenzia con `product.id` (= productNumber), NON productNumber;
    //  • i totali per riga vanno forniti (computeTotals);
    //  • il numero va in numberSeries.numberSeriesSequenceElement.number.
    // ⚠️ NUMERAZIONE: nel trial Reviso NON assegna il numero al DDT via API
    //    (collezione number-series-sequence-elements vuota, /peek 404) anche
    //    fornendo `number`. Gli ORDINI invece si auto-numerano. Da chiarire col
    //    supporto Reviso (api@reviso.com) per l'agreement di produzione.
    async createDeliveryNote(input) {
        var _a, _b, _c, _d, _e, _f;
        const ownerId = Number(input.customer.id);
        const totals = (0, rounding_1.computeTotals)(input.lines, 0, this.cfg.vatRate); // DDT: nessuno sconto globale
        const year = (input.date || '').slice(0, 4);
        const nextNum = await this.nextSeriesNumber(this.cfg.ddtNumberSeries, year);
        const productLines = input.lines.map((l, i) => {
            const net = totals.lineNets[i];
            const vat = (0, rounding_1.round2)((net * this.cfg.vatRate) / 100);
            const code = (l.code && l.code.trim()) ? l.code.trim() : this.cfg.genericProductNumber;
            return {
                product: { name: l.description, id: code, metaData: null },
                chainId: null,
                lineNr: i + 1,
                location: null,
                description: l.description,
                vatInfo: { vatAccount: { id: this.cfg.vatCode, metaData: null }, vatRate: this.cfg.vatRate },
                quantity: l.qty,
                unit: null,
                unitNetPrice: l.unitNetPrice,
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
            deliveryNoteType: 'Sales', deliveryNoteStatus: 'Issued',
            owner: {
                address: null, zipCode: null, city: null,
                countryCode: { id: 'IT', metaData: null }, country: 'Italia',
                vatZone: { vatZoneNumber: this.cfg.domesticVatZone, id: this.cfg.domesticVatZone, metaData: null },
                vatAccount: null, name: input.customer.name, id: ownerId, metaData: null,
            },
            numberSeries: {
                prefix: 'DDT', sequenceType: 'Ordered',
                numberSeriesSequenceElement: nextNum != null ? { number: nextNum, metaData: null } : null,
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
        const res = await this.client.post('/delivery-notes/sales', ddt);
        if (res === null || res === void 0 ? void 0 : res.errorCode) {
            const msg = ((_c = (_b = res.errors) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) || res.message || res.errorCode;
            throw new Error(`DDT CiC fallito: ${msg}`);
        }
        const assigned = (_f = (_e = (((_d = res === null || res === void 0 ? void 0 : res.numberSeries) === null || _d === void 0 ? void 0 : _d.numberSeriesSequenceElement) || {}).number) !== null && _e !== void 0 ? _e : nextNum) !== null && _f !== void 0 ? _f : undefined;
        return {
            id: res.id,
            number: assigned,
            url: undefined,
            netAmount: totals.net,
            vatAmount: totals.vat,
            grossAmount: totals.gross,
        };
    }
    /** Prossimo numero della serie per l'anno (da number-series.peeks). */
    async nextSeriesNumber(seriesId, year) {
        try {
            const ns = await this.client.get(`/number-series/${seriesId}`);
            const peeks = ((ns === null || ns === void 0 ? void 0 : ns.peeks) || []);
            const pk = peeks.find((p) => (p.accountingYear || {}).year === year) || peeks[0];
            return pk && pk.nextVoucherNumber != null ? pk.nextVoucherNumber : null;
        }
        catch (_a) {
            return null;
        }
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