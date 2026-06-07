// ============================================================================
// BillingProvider — astrazione del backend di fatturazione (Fase 2 migrazione)
// ----------------------------------------------------------------------------
// Interfaccia comune ai due backend amministrativi di POPS:
//   - FiC  = Fatture in Cloud   (legacy, vecchia P.IVA)
//   - CiC  = Contabilità in Cloud / Reviso (nuova P.IVA, dal 20/6/2026)
// Il resto di POPS non deve sapere quale backend gira sotto: chiede al provider
// di creare/eliminare documenti e basta. La selezione avviene a runtime in base
// a config/billing.activeBackend e al campo billingBackend congelato sul
// preventivo. Vedi docs/risorsexCiC/piano-migrazione-cic.html.
// ============================================================================

export type BillingBackend = 'fic' | 'cic';

export type DocType = 'order' | 'quotation' | 'delivery_note';

/** Dati anagrafici cliente (da Firestore users/*) per lookup/creazione. */
export interface CustomerInput {
  piva: string;
  name: string;
  email?: string;
  taxCode?: string;
  address?: string;
  zip?: string;
  city?: string;
  province?: string;
}

/** Riferimento al cliente nel backend (FiC: id numerico; CiC: customerNumber). */
export interface CustomerRef {
  id: string | number;
  name: string;
  piva: string;
}

/** Riga documento, prima dell'arrotondamento (prezzi unitari netti). */
export interface LineInput {
  code: string;            // codice prodotto (mappato su un product del backend)
  description: string;
  qty: number;
  unitNetPrice: number;
  category?: string;       // EXTRA/Spedizione/... per la logica POPS
}

/** Input per creare ordine/preventivo. */
export interface DocumentInput {
  customer: CustomerRef;
  date: string;            // ISO YYYY-MM-DD
  lines: LineInput[];
  discountPercentage: number;   // sconto globale POPS (%)
  visibleSubject?: string;      // commessa / riferimento
}

/** Dati di spedizione per il DDT. */
export interface ShippingInput {
  packages: number;        // colli
  weight?: number;
  carrier?: string;        // corriere (se COURIER)
  tracking?: string;
  transportType: 'COURIER' | 'INTERNAL';
}

/** Input per creare un DDT (POPS assembla le righe da Firestore). */
export interface DeliveryNoteInput {
  customer: CustomerRef;
  date: string;
  lines: LineInput[];      // su CiC i prezzi sono opzionali: serve prodotto + qty
  shipping: ShippingInput;
  visibleSubject?: string;
}

/** Esito creazione documento. */
export interface DocumentResult {
  id: string | number;
  number?: string | number;
  url?: string;            // link/identificatore per il PDF (CiC: endpoint REST autenticato)
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

export interface DocRef {
  id: string | number;
  type: DocType;
}

export interface SyncResult {
  updated: number;
  missing: string[];
}

/**
 * Contratto comune. FicProvider incapsula il codice attuale (invariato);
 * CicProvider parla con Reviso. I numeri tornano identici perché i totali
 * usano l'algoritmo canonico in rounding.ts (validato sullo spike 2026-06-05).
 */
export interface BillingProvider {
  readonly backend: BillingBackend;
  findOrCreateCustomer(input: CustomerInput): Promise<CustomerRef>;
  createQuotation(doc: DocumentInput): Promise<DocumentResult>;
  createOrder(doc: DocumentInput): Promise<DocumentResult>;
  createDeliveryNote(input: DeliveryNoteInput): Promise<DocumentResult>;
  deleteDocument(ref: DocRef): Promise<void>;
  getFreshDocUrl(ref: DocRef): Promise<string>;
  syncProducts(codes: string[]): Promise<SyncResult>;
}
