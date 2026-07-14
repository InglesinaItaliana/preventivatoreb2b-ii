// ============================================================================
// Algoritmo canonico dei totali — lato FRONTEND (specchio di
// src/functions/lib_billing/rounding.ts). DEVE restare identico a quello del
// backend: così la cifra mostrata al cliente coincide al centesimo col
// documento creato su CiC. Regola validata sullo spike 2026-06-05 (V022 22%):
//   45,50 × 0,93 = 42,315 → 42,32 (half-up decimale, nudge 1e-9 per l'errore binario).
// ============================================================================

/** Half-up a 2 decimali, robusto all'errore di virgola mobile (match Reviso). */
export function round2(n: number): number {
  return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
}

export interface ComputedTotals {
  lineNets: number[];
  net: number;
  vat: number;
  gross: number;
}

/**
 * Totali canonici del documento.
 * @param lines righe con quantità e prezzo unitario netto
 * @param discountPct sconto globale in % (0 = nessuno)
 * @param vatRate aliquota IVA in % (es. 22)
 */
export function computeTotals(
  lines: ReadonlyArray<{ qty: number; unitNetPrice: number; discountPct?: number }>,
  discountPct: number,
  vatRate: number,
): ComputedTotals {
  // `discountPct` di riga sovrascrive quello globale: il trasporto non prende mai lo
  // sconto d'ordine (le righe di consegna passano 0). Specchio di lib_billing/rounding.ts.
  const lineNets = lines.map((l) => {
    const pct = l.discountPct ?? discountPct;
    return round2(l.qty * l.unitNetPrice * (1 - pct / 100));
  });
  const net = round2(lineNets.reduce((a, b) => a + b, 0));
  const vat = round2((net * vatRate) / 100);
  const gross = round2(net + vat);
  return { lineNets, net, vat, gross };
}
