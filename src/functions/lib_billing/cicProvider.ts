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

import { CicClient } from './cicClient';
import { CicConfig, getCicConfig } from './cicConfig';
import { computeTotals, round2, roundTo10 } from './rounding';
import {
  BillingProvider, CustomerInput, CustomerRef, DocumentInput, DocumentResult,
  DeliveryNoteInput, DocRef, SyncResult,
} from './types';

/** Anagrafica cliente CiC normalizzata, per l'import in POPS (users/*). */
export interface CicCustomerRecord {
  customerNumber: string | number;
  name: string;
  vatNumber: string;   // senza prefisso 'IT'
  taxCode: string;
  email: string;
  address: string;
  zip: string;
  city: string;
}

export class CicProvider implements BillingProvider {
  readonly backend = 'cic' as const;

  constructor(private readonly client: CicClient, private readonly cfg: CicConfig) {}

  // --- CLIENTI ---------------------------------------------------------------
  async findOrCreateCustomer(input: CustomerInput): Promise<CustomerRef> {
    const piva = (input.piva || '').trim();
    if (!piva) throw new Error('findOrCreateCustomer: P.IVA mancante');

    const filter = encodeURIComponent(`vatNumber$eq:${piva}`);
    const found = await this.client.get(`/customers?filter=${filter}`);
    const list = (found?.collection || []) as any[];
    if (list.length > 0) {
      const c = list[0];
      return { id: c.customerNumber, name: c.name, piva: c.vatNumber || piva };
    }

    const created = await this.client.post('/customers', {
      name: input.name,
      vatNumber: piva,
      currency: 'EUR',
      customerGroup: { customerGroupNumber: this.cfg.customerGroupNumber },
      vatZone: { vatZoneNumber: this.cfg.domesticVatZone },
      paymentTerms: { paymentTermsNumber: this.cfg.defaultPaymentTermsNumber },
      ...(input.taxCode ? { corporateIdentificationNumber: input.taxCode } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.zip ? { zip: input.zip } : {}),
      ...(input.city ? { city: input.city } : {}),
    });
    return { id: created.customerNumber, name: created.name, piva: created.vatNumber || piva };
  }

  // Recupera l'anagrafica COMPLETA di un cliente CiC per P.IVA (per l'import in
  // POPS). Ritorna null se assente. NB: in CiC la P.IVA è memorizzata SENZA il
  // prefisso 'IT' (vedi risorsexCiC/fix-customers.mjs) → lo togliamo, così la
  // ricerca esatta `vatNumber$eq:` fa match anche se l'operatore digita 'IT...'.
  // La provincia su Reviso è un ProvinceReference (non una stringa) → non la
  // esponiamo qui (l'import la lascia vuota).
  async fetchCustomerByVat(piva: string): Promise<CicCustomerRecord | null> {
    const clean = (piva || '').trim().replace(/^IT/i, '');
    if (!clean) return null;
    const filter = encodeURIComponent(`vatNumber$eq:${clean}`);
    const found = await this.client.get(`/customers?filter=${filter}`);
    const list = (found?.collection || []) as any[];
    if (list.length === 0) return null;
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
  async createOrder(doc: DocumentInput): Promise<DocumentResult> {
    return this.createSalesDoc('/orders', doc);
  }

  async createQuotation(doc: DocumentInput): Promise<DocumentResult> {
    return this.createSalesDoc('/quotations', doc);
  }

  // In CiC il prodotto si referenzia col productNumber CiC (auto-assegnato), NON
  // col codice POPS (che è il barCode). Usiamo il cicProductId mappato; se manca,
  // fallback al prodotto generico (cfg.genericProductNumber = productNumber CiC del
  // prodotto "VARIE", da configurare in config/cic).
  private productRef(cicProductId?: string | number) {
    const pn = (cicProductId != null && String(cicProductId).trim())
      ? String(cicProductId).trim()
      : this.cfg.genericProductNumber;
    return { productNumber: pn, self: `${this.cfg.baseUrl}/products/${encodeURIComponent(pn)}` };
  }

  private async createSalesDoc(path: string, doc: DocumentInput): Promise<DocumentResult> {
    // Non inviamo i totali doc: Reviso li calcola con la stessa regola di
    // rounding.ts (provato nello spike → combaciano). La validazione "cifra ==
    // quella vista dal cliente" la fa il chiamante (generaOrdineCiC) contro
    // totaleScontato, così non lasciamo ordini orfani in caso di scarto.
    const payload = {
      date: doc.date,
      currency: 'EUR',
      paymentTerms: { paymentTermsNumber: this.cfg.defaultPaymentTermsNumber },
      customer: { customerNumber: Number(doc.customer.id) },
      recipient: { name: doc.customer.name, vatZone: { vatZoneNumber: this.cfg.domesticVatZone } },
      layout: { layoutNumber: this.cfg.layoutNumber },
      ...(doc.visibleSubject ? { notes: { heading: doc.visibleSubject } } : {}),
      lines: doc.lines.map((l, i) => ({
        lineNumber: i + 1,
        description: l.description,
        quantity: l.qty,
        unitNetPrice: roundTo10(l.unitNetPrice),
        discountPercentage: doc.discountPercentage,
        product: this.productRef(l.cicProductId),
        vatInfo: { vatAccount: { vatCode: this.cfg.vatCode } },
      })),
    };

    const res = await this.client.post(path, payload);
    // Anti-orfano: se Reviso non restituisce un id valido, lancia PRIMA che il
    // chiamante persista cic_order_id (evita ordini orfani / ri-trigger).
    if (res?.errorCode || res?.id == null) {
      const msg = res?.errors?.[0]?.message || res?.message || res?.errorCode || 'risposta senza id';
      throw new Error(`Creazione documento CiC fallita (${path}): ${msg}`);
    }
    return this.toSalesResult(res);
  }

  private toSalesResult(res: any): DocumentResult {
    return {
      id: res.id,
      number: res.number,
      url: res?.pdf?.download,
      netAmount: res.netAmount ?? 0,
      vatAmount: res.vatAmount ?? 0,
      grossAmount: res.grossAmount ?? 0,
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
  async createDeliveryNote(input: DeliveryNoteInput): Promise<DocumentResult> {
    const ownerId = Number(input.customer.id);
    const totals = computeTotals(input.lines, 0, this.cfg.vatRate); // DDT: nessuno sconto globale

    const productLines = input.lines.map((l, i) => {
      // Riga descrittiva (intestazione ordine nel DDT cumulativo): solo testo,
      // nessun prodotto/quantità/prezzo. Reviso la accetta come "text line".
      if (l.isDescriptive) {
        return {
          product: null, chainId: null, lineNr: i + 1, location: null,
          description: l.description, vatInfo: null, quantity: null, unit: null,
          unitNetPrice: null, unitGrossPrice: null, totalNetAmount: null,
          totalGrossAmount: null, unitCostPrice: null, discountPercentage: null,
          totalVatAmount: null, manuallyEditedSalesPrice: false,
        };
      }
      const net = totals.lineNets[i];
      const vat = round2((net * this.cfg.vatRate) / 100);
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
        unitNetPrice: roundTo10(l.unitNetPrice),
        unitGrossPrice: round2(l.unitNetPrice * (1 + this.cfg.vatRate / 100)),
        totalNetAmount: net,
        totalGrossAmount: round2(net + vat),
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
        // Reviso accetta SOLO 'Self' su deliveredBy ('Carrier' → 400 E00500,
        // verificato sul prod 2026-06-25). Il trasporto a mezzo corriere si
        // esprime valorizzando carrierInfo (con deliveredBy:'Self').
        deliveredBy: 'Self',
        reasonForDelivery: null, deliveryTerms: null, deliveryStartDate: null, deliveryEndDate: null,
        numberOfPackages: input.shipping.packages, descriptionOfPackages: null,
        netWeight: null, grossWeight: input.shipping.weight ?? null,
        carrierInfo: input.shipping.transportType === 'COURIER' && input.shipping.carrier
          ? {
              name: input.shipping.carrier,
              notes: input.shipping.tracking ?? null,
              address: null, city: null, zipCode: null, country: null,
              phoneNumber: null, email: null, id: null, metaData: null, self: null,
            }
          : null,
        id: null, metaData: null,
      },
      additionalExpenses: null, date: input.date,
      additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
    };

    // 1) crea la BOZZA
    const created = await this.client.post('/delivery-notes/sales', ddt);
    if (created?.errorCode) {
      const msg = created.errors?.[0]?.message || created.message || created.errorCode;
      throw new Error(`DDT CiC: creazione bozza fallita: ${msg}`);
    }
    const id = created?.id;
    if (id == null) throw new Error('DDT CiC: la creazione non ha restituito un id.');

    // 2) EMETTE: Reviso assegna il numero dalla serie. /issue ritorna un array;
    //    in caso di errore torna un oggetto con errorCode (oppure il POST lancia).
    //    Se l'emissione fallisce la BOZZA resterebbe orfana su Reviso → la
    //    cancelliamo (best-effort) prima di propagare l'errore.
    const filter = encodeURIComponent(`id$eq:${id}`);
    try {
      const issued = await this.client.post(`/delivery-notes/sales/issue?filter=${filter}`, undefined);
      if (issued && !Array.isArray(issued) && issued.errorCode) {
        const msg = issued.errors?.[0]?.message || issued.message || issued.errorCode;
        throw new Error(`emissione rifiutata: ${msg}`);
      }
    } catch (e: any) {
      await this.deleteDraftQuiet(id);
      throw new Error(`DDT CiC: emissione fallita (id ${id}, bozza rimossa): ${e?.message || e}`);
    }

    // 3) rilegge il numero definitivo (tollera il transitorio BeingIssued)
    const number = await this.readIssuedNumber(id);

    return {
      id,
      number: number ?? undefined,
      url: undefined,
      netAmount: totals.net,
      vatAmount: totals.vat,
      grossAmount: totals.gross,
    };
  }

  /** Cancella una bozza DDT rimasta orfana dopo un'emissione fallita (best-effort, non solleva). */
  private async deleteDraftQuiet(id: number | string): Promise<void> {
    try {
      await this.client.del(`/delivery-notes/sales/${id}`);
    } catch {
      // best-effort: se non si riesce a pulire, l'errore principale resta quello di /issue
    }
  }

  /**
   * Rilegge il DDT finché è `Issued` con un numero assegnato. Dopo /issue lo
   * stato passa per `BeingIssued` (transitorio): qualche tentativo breve basta.
   * Best-effort: ritorna il numero appena disponibile, altrimenti null.
   */
  private async readIssuedNumber(id: number | string): Promise<number | null> {
    let num: number | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const dn = await this.client.get(`/delivery-notes/sales/${id}`);
      num = dn?.numberSeries?.numberSeriesSequenceElement?.number ?? null;
      if (num != null && dn?.deliveryNoteStatus === 'Issued') return num;
      await new Promise((r) => setTimeout(r, 300));
    }
    return num;
  }

  // --- DELETE / URL ----------------------------------------------------------
  async deleteDocument(ref: DocRef): Promise<void> {
    if (ref.type === 'delivery_note') {
      // I DDT si cancellano via rest.reviso.com (NON il self, che punta al microservizio azure).
      await this.client.del(`/delivery-notes/sales/${ref.id}`);
      return;
    }
    const base = ref.type === 'quotation' ? '/quotations' : '/orders';
    try {
      await this.client.del(`${base}/${ref.id}`);
    } catch (e) {
      // Gli ordini ARCHIVIATI non si cancellano (S_V_87) → de-archivia e ritenta.
      const full = await this.client.get(`${base}/${ref.id}`);
      if (full && full.isArchived) {
        full.isArchived = false;
        await this.client.put(`${base}/${ref.id}`, full);
        await this.client.del(`${base}/${ref.id}`);
      } else {
        throw e;
      }
    }
  }

  async getFreshDocUrl(ref: DocRef): Promise<string> {
    if (ref.type === 'delivery_note') {
      return `${this.cfg.baseUrl}/delivery-notes/sales/${ref.id}`;
    }
    const base = ref.type === 'quotation' ? '/quotations' : '/orders';
    const res = await this.client.get(`${base}/${ref.id}`);
    return res?.pdf?.download || `${this.cfg.baseUrl}${base}/${ref.id}/pdf`;
  }

  // --- INDICI MAPPATURE (per il sync chiavi naturali → cic*, Fase 4) --------
  // Scoperta 13/06 (sonda test-mapping.mjs): l'import nativo NON mette il codice
  // POPS in productNumber (auto-assegnato) ma in `barCode`. La chiave naturale
  // prodotti è quindi barCode; quella clienti è vatNumber. Carichiamo l'intero
  // catalogo/anagrafica una volta e costruiamo le mappe in memoria (meno chiamate
  // di una GET filtrata per record).

  /** Mappa barCode(UPPER) → productNumber (id CiC del prodotto). */
  async buildProductBarcodeIndex(): Promise<Map<string, string | number>> {
    const map = new Map<string, string | number>();
    let page = 0;
    let hasMore = true;
    while (hasMore && page < 50) {
      const data = await this.client.get(`/products?pagesize=1000&skippages=${page}`);
      const items = (data?.collection || []) as any[];
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
  async buildCustomerVatIndex(): Promise<Map<string, string | number>> {
    const map = new Map<string, string | number>();
    let page = 0;
    let hasMore = true;
    while (hasMore && page < 50) {
      const data = await this.client.get(`/customers?pagesize=1000&skippages=${page}`);
      const items = (data?.collection || []) as any[];
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
  async findProductByBarcode(code: string): Promise<string | number | null> {
    const filter = encodeURIComponent(`barCode$eq:${code}`);
    const found = await this.client.get(`/products?filter=${filter}`);
    const list = (found?.collection || []) as any[];
    return list.length > 0 ? (list[0].productNumber ?? null) : null;
  }

  /**
   * Crea un prodotto su Reviso con barCode = codice POPS (chiave naturale).
   * Idempotente: se esiste già un prodotto con quel barCode lo riusa (retry-safe).
   * Ritorna il productNumber CiC (da salvare come cicProductId in products/code).
   */
  async createProduct(input: { code: string; name: string; salesPrice?: number }): Promise<string | number> {
    const existing = await this.findProductByBarcode(input.code);
    if (existing != null) return existing;
    const created = await this.client.post('/products', {
      productNumber: input.code,
      name: input.name,
      barCode: input.code,
      productGroup: { productGroupNumber: this.cfg.productGroupNumber },
      ...(input.salesPrice != null ? { salesPrice: input.salesPrice } : {}),
    });
    if (created?.errorCode || created?.productNumber == null) {
      const msg = created?.errors?.[0]?.message || created?.message || created?.errorCode || 'risposta senza productNumber';
      throw new Error(`Creazione prodotto CiC fallita (${input.code}): ${msg}`);
    }
    return created.productNumber;
  }

  // --- PRODOTTI (read-only check) -------------------------------------------
  async syncProducts(codes: string[]): Promise<SyncResult> {
    const found = new Set<string>();
    let page = 0;
    let hasMore = true;
    while (hasMore && page < 50) {
      const data = await this.client.get(`/products?pagesize=1000&skippages=${page}`);
      const items = (data?.collection || []) as any[];
      for (const p of items) {
        if (p.productNumber) found.add(String(p.productNumber).toUpperCase().trim());
      }
      hasMore = items.length >= 1000;
      page++;
    }
    const missing = codes.filter((c) => !found.has(c.toUpperCase().trim()));
    return { updated: codes.length - missing.length, missing };
  }
}

/** Costruisce un CicProvider leggendo config/cic. */
export async function createCicProvider(): Promise<CicProvider> {
  const cfg = await getCicConfig();
  return new CicProvider(new CicClient(cfg), cfg);
}
