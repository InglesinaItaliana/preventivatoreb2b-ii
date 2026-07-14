// ============================================================================
// Costruzione delle righe di un DDT (CiC) a partire dagli ordini POPS.
// ----------------------------------------------------------------------------
// Funzione PURA (nessun I/O) → testabile: è la regola che decide cosa viene
// fatturato, perché su CiC la FATTURA NASCE DAL DDT. Ciò che non entra qui non
// viene mai fatturato a nessuno.
//
// Regole:
//  - MERCE e LAVORAZIONI (curvature/adattamenti): entrano tutte.
//  - CONSEGNE: se più ordini viaggiano insieme il trasporto si paga UNA volta
//    sola → ne sopravvive una, quella con la TARIFFA PIÙ ALTA, con quantità 1
//    (stessa regola del path FiC legacy in index.ts).
//  - SCONTI: una riga CiC ha un solo campo sconto e i due sconti si compongono
//    in cascata → lo sconto concordato sull'ORDINE finisce dentro `unitNetPrice`
//    (prezzo già netto), mentre il campo sconto di riga resta allo sconto di
//    PAGAMENTO del cliente (da CiC), che la fattura eredita così com'è.
//  - Una RIGA DESCRITTIVA apre le righe di ogni ordine quando il DDT è cumulativo
//    o quando l'ordine aveva uno sconto (in quel caso lo dichiara, perché i
//    prezzi unitari sono già netti).
// ============================================================================

import type { LineInput } from './types';

/** Tariffe di consegna/spedizione: righe EXTRA "speciali", soggette all'unificazione. */
export const DELIVERY_TARIFF_CODES = [
  'Consegna Diretta V1',
  'Consegna Diretta V2',
  'Consegna Diretta V3',
  'Consegna Diretta V4',
  'Consegna Diretta V5',
  'Consegna Diretta V6',
  'Consegna Diretta V7',
  'Consegna Diretta V8',
  'Ritiro in sede',
  'Spedizione',
];

export function isDeliveryTariff(nome: unknown): boolean {
  const n = String(nome ?? '').trim().toLowerCase();
  return DELIVERY_TARIFF_CODES.some((t) => t.toLowerCase() === n);
}

/**
 * Riga di trasporto. UN SOLO predicato per tutti i punti che maneggiano soldi
 * (cifra a video, PDF, ordine, DDT): se ognuno decide a modo suo cos'è una
 * consegna, il totale firmato e quello fatturato divergono in silenzio.
 * Specchio di isRigaConsegna() in src/lib/billing.ts.
 */
export function isRigaConsegna(item: any): boolean {
  return item?.categoria === 'EXTRA' && isDeliveryTariff(item?.descrizioneCompleta);
}

/** Tariffa "spedizione a mezzo corriere" (codice POPS, vedi CODICI_SPEDIZIONE in BuilderView). */
export const SPEDIZIONE_NAME = 'Spedizione';
export const SPEDIZIONE_CODE = 'L004';

export type TransportType = 'COURIER' | 'INTERNAL';

/** Ordine POPS visto dal costruttore di righe (sottoinsieme del preventivo). */
export interface DdtOrderInput {
  elementi?: any[];
  scontoPercentuale?: number | string;
  commessa?: string;
  codice?: string;
  cic_order_number?: string | number;
  cic_order_id?: string | number;
}

export function buildDdtLines(
  orders: ReadonlyArray<DdtOrderInput>,
  scontoPagamento = 0,
  transportType?: TransportType,
): LineInput[] {
  const pagamento = Number(scontoPagamento) || 0;
  const isCumulativo = orders.length > 1;
  const lines: LineInput[] = [];
  const consegne: Array<LineInput & { tariffa: number }> = [];

  for (const o of orders) {
    const cicNum = o.cic_order_number ?? o.cic_order_id ?? o.codice ?? '';
    const commessa = o.commessa ? ` - ${o.commessa}` : '';
    const scontoOrdine = Number(o.scontoPercentuale) || 0;
    const scontato = (prezzo: any) => (Number(prezzo) || 0) * (1 - scontoOrdine / 100);

    const orderItems: LineInput[] = [];
    for (const item of (o.elementi || [])) {
      const nome = item?.descrizioneCompleta || '';
      const code = item?.codice ? String(item.codice).toUpperCase().trim() : '';

      // Le consegne si raccolgono a parte: ne sopravvive una sola per DDT.
      // ⚠️ La consegna NON prende lo sconto dell'ordine (regola commerciale): resta a
      // tariffa piena e accetta solo lo sconto di pagamento del cliente. Perciò la
      // tariffa con cui si sceglie il vincitore è anche quella che viene addebitata.
      if (isRigaConsegna(item)) {
        const tariffa = Number(item.prezzo_unitario) || 0;
        consegne.push({
          code,
          description: nome,
          qty: 1,
          tariffa,
          unitNetPrice: tariffa,        // prezzo PIENO: nessuno sconto d'ordine sul trasporto
          category: 'EXTRA',
          discountPercentage: pagamento,
        });
        continue;
      }

      let desc = nome || 'Articolo Vetrata';
      if (item?.categoria !== 'EXTRA' && (item?.base_mm > 0 || item?.altezza_mm > 0)) {
        desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`;
      }
      orderItems.push({
        code,
        description: desc,
        qty: Number(item?.quantita) || 1,
        unitNetPrice: scontato(item?.prezzo_unitario),
        category: item?.categoria,
        discountPercentage: pagamento,
      });
    }

    const notaSconto = scontoOrdine > 0
      ? ` - prezzi già scontati del ${scontoOrdine}% come da accordi`
      : '';
    if (orderItems.length > 0 && (isCumulativo || notaSconto)) {
      lines.push({
        code: '',
        description: `Ordine ${cicNum}${commessa}${notaSconto}`,
        qty: 0,
        unitNetPrice: 0,
        category: 'HEADER',
        isDescriptive: true,
      });
    }
    lines.push(...orderItems);
  }

  // Nessuna merce da spedire → nessun DDT (la consegna da sola non è un trasporto).
  if (lines.length === 0) return [];

  consegne.sort((a, b) => b.tariffa - a.tariffa);
  const migliore = consegne[0];
  if (migliore) {
    const { tariffa, ...vincente } = migliore;
    void tariffa;
    // Trasporto a mezzo corriere: "Consegna Diretta" sarebbe una contraddizione stampata
    // sul documento. La riga diventa "Spedizione" (nome + prodotto a catalogo) ma CONSERVA
    // il prezzo pattuito sull'ordine: è quello che il cliente ha accettato di pagare.
    // La difformità fra tariffa d'ordine e trasporto reale è segnalata all'operatore
    // nella modale DDT (DdtModal.vue) — la decisione resta umana.
    if (transportType === 'COURIER' && vincente.description !== SPEDIZIONE_NAME) {
      vincente.description = SPEDIZIONE_NAME;
      vincente.code = SPEDIZIONE_CODE;
    }
    lines.push(vincente);
  }
  return lines;
}
