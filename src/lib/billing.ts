// ============================================================================
// Helper unificante FiC / CiC lato frontend (Fase 2 migrazione).
// Data un preventivo, restituisce i riferimenti documento del backend giusto
// (FiC legacy o CiC), così la UI non deve sapere quale sistema c'è sotto.
// Funzioni pure: nessun side-effect (l'apertura documento è in FE-2).
// ============================================================================

import type { PreventivoDocumento } from '../types';

export type BillingBackend = 'fic' | 'cic';

export interface BillingInfo {
  backend: BillingBackend;
  hasOrder: boolean;
  hasDdt: boolean;
  orderId?: string | number;
  orderUrl?: string;
  ddtId?: string | number;
  ddtUrl?: string;
  ddtNumber?: string | number;
  billingError?: string;
}

/** Tipo lasco: i componenti spesso passano oggetti parziali (non l'intera interfaccia). */
type PreventivoLike = Partial<PreventivoDocumento> & Record<string, any>;

/**
 * Tariffe di consegna/spedizione: righe EXTRA "speciali". Specchio di
 * DELIVERY_TARIFF_CODES (functions/index.ts) — se cambia una lista, cambia l'altra.
 */
export const DELIVERY_TARIFF_NAMES = [
  'Consegna Diretta V1', 'Consegna Diretta V2', 'Consegna Diretta V3', 'Consegna Diretta V4',
  'Consegna Diretta V5', 'Consegna Diretta V6', 'Consegna Diretta V7', 'Consegna Diretta V8',
  'Ritiro in sede', 'Spedizione',
];

export function isDeliveryTariff(descrizione?: string): boolean {
  const d = String(descrizione || '').trim().toLowerCase();
  return DELIVERY_TARIFF_NAMES.some((t) => t.toLowerCase() === d);
}

/**
 * Riga di trasporto di un preventivo. UN SOLO predicato per tutti i punti che
 * maneggiano soldi (cifra a video, PDF, ordine, DDT): se ognuno decide a modo suo
 * cos'è una consegna, il totale firmato e quello fatturato divergono in silenzio.
 * Stessa definizione del backend (lib_billing/ddtLines.ts).
 */
export function isRigaConsegna(e: any): boolean {
  return e?.categoria === 'EXTRA' && isDeliveryTariff(e?.descrizioneCompleta);
}

/** Tariffa "spedizione a mezzo corriere" — specchio di SPEDIZIONE_NAME/CODE (functions/lib_billing/ddtLines.ts). */
const SPEDIZIONE_NAME = 'Spedizione';
const SPEDIZIONE_CODE = 'L004';

/**
 * Righe che vanno sul DDT, a partire dagli elementi di uno o più ordini:
 * merce + lavorazioni di tutti gli ordini, più UNA sola consegna (la tariffa più
 * alta, quantità 1) — se più ordini viaggiano insieme il trasporto si paga una
 * volta sola. Se il trasporto è a mezzo corriere la riga diventa "Spedizione".
 *
 * Deve restare allineata a buildDdtLines() del backend: il PDF che il cliente
 * scarica e il DDT fiscale su CiC devono elencare le STESSE righe, altrimenti i
 * due documenti dello stesso trasporto si smentiscono a vicenda.
 */
export function ddtElementi(elementi: any[], metodoSpedizione?: string): any[] {
  const merceELavorazioni = elementi.filter((e) => !isRigaConsegna(e));
  const consegne = elementi.filter((e) => isRigaConsegna(e));
  if (consegne.length === 0) return merceELavorazioni;

  const vincente = [...consegne].sort(
    (a, b) => (Number(b?.prezzo_unitario) || 0) - (Number(a?.prezzo_unitario) || 0),
  )[0];

  // `__group` viene da un ordine specifico, ma la consegna è del DDT nel suo insieme
  // e sta in coda a tutte le righe: tenerlo stamperebbe una banda d'ordine duplicata.
  const { __group, ...riga } = vincente;
  void __group;
  const corriere = String(metodoSpedizione || '').toUpperCase() === 'COURIER';
  const rinominata = corriere && String(riga.descrizioneCompleta || '').trim() !== SPEDIZIONE_NAME;

  return [...merceELavorazioni, {
    ...riga,
    quantita: 1,
    ...(rinominata ? { descrizioneCompleta: SPEDIZIONE_NAME, codice: SPEDIZIONE_CODE } : {}),
  }];
}

/** Risolve il backend: flag esplicito → presenza id CiC → default FiC. */
export function resolveBackend(p: PreventivoLike | null | undefined): BillingBackend {
  if (!p) return 'fic';
  if (p.billingBackend === 'cic' || p.billingBackend === 'fic') return p.billingBackend;
  if (p.cic_order_id || p.cic_ddt_id) return 'cic';
  return 'fic';
}

/** Riferimenti documento unificati per il preventivo. */
export function billingInfo(p: PreventivoLike | null | undefined): BillingInfo {
  const backend = resolveBackend(p);
  const cic = backend === 'cic';
  const pick = <T>(ficVal: T, cicVal: T): T => (cic ? cicVal : ficVal);
  return {
    backend,
    hasOrder: !!(cic ? p?.cic_order_id : p?.fic_order_id),
    hasDdt: !!(cic ? p?.cic_ddt_id : p?.fic_ddt_id),
    orderId: pick(p?.fic_order_id, p?.cic_order_id),
    orderUrl: pick(p?.fic_order_url, p?.cic_order_url),
    ddtId: pick(p?.fic_ddt_id, p?.cic_ddt_id),
    ddtUrl: pick(p?.fic_ddt_url, p?.cic_ddt_url),
    ddtNumber: pick(p?.fic_ddt_number, p?.cic_ddt_number),
    billingError: p?.billingError,
  };
}
