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
import { computeTotals, round2 } from './rounding';
import {
  BillingProvider, CustomerInput, CustomerRef, DocumentInput, DocumentResult,
  DeliveryNoteInput, DocRef, SyncResult,
} from './types';

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

  // --- ORDINI / PREVENTIVI ---------------------------------------------------
  async createOrder(doc: DocumentInput): Promise<DocumentResult> {
    return this.createSalesDoc('/orders', doc);
  }

  async createQuotation(doc: DocumentInput): Promise<DocumentResult> {
    return this.createSalesDoc('/quotations', doc);
  }

  private productRef(code: string) {
    const pn = code && code.trim() ? code.trim() : this.cfg.genericProductNumber;
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
        unitNetPrice: l.unitNetPrice,
        discountPercentage: doc.discountPercentage,
        product: this.productRef(l.code),
        vatInfo: { vatAccount: { vatCode: this.cfg.vatCode } },
      })),
    };

    const res = await this.client.post(path, payload);
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
  // Payload allineato all'esempio ufficiale della Postman collection Reviso:
  //  • product si referenzia con `product.id` (= productNumber), NON productNumber;
  //  • i totali per riga vanno forniti (computeTotals);
  //  • il numero va in numberSeries.numberSeriesSequenceElement.number.
  // ⚠️ NUMERAZIONE: nel trial Reviso NON assegna il numero al DDT via API
  //    (collezione number-series-sequence-elements vuota, /peek 404) anche
  //    fornendo `number`. Gli ORDINI invece si auto-numerano. Da chiarire col
  //    supporto Reviso (api@reviso.com) per l'agreement di produzione.
  async createDeliveryNote(input: DeliveryNoteInput): Promise<DocumentResult> {
    const ownerId = Number(input.customer.id);
    const totals = computeTotals(input.lines, 0, this.cfg.vatRate); // DDT: nessuno sconto globale
    const year = (input.date || '').slice(0, 4);
    const nextNum = await this.nextSeriesNumber(this.cfg.ddtNumberSeries, year);

    const productLines = input.lines.map((l, i) => {
      const net = totals.lineNets[i];
      const vat = round2((net * this.cfg.vatRate) / 100);
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
        netWeight: null, grossWeight: input.shipping.weight ?? null, carrierInfo: null,
        id: null, metaData: null,
      },
      additionalExpenses: null, date: input.date,
      additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
    };

    const res = await this.client.post('/delivery-notes/sales', ddt);
    if (res?.errorCode) {
      const msg = res.errors?.[0]?.message || res.message || res.errorCode;
      throw new Error(`DDT CiC fallito: ${msg}`);
    }
    const assigned = (res?.numberSeries?.numberSeriesSequenceElement || {}).number ?? nextNum ?? undefined;
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
  private async nextSeriesNumber(seriesId: number, year: string): Promise<number | null> {
    try {
      const ns = await this.client.get(`/number-series/${seriesId}`);
      const peeks = (ns?.peeks || []) as any[];
      const pk = peeks.find((p) => (p.accountingYear || {}).year === year) || peeks[0];
      return pk && pk.nextVoucherNumber != null ? pk.nextVoucherNumber : null;
    } catch {
      return null;
    }
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
