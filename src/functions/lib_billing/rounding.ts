// ============================================================================
// Algoritmo canonico dei totali — UNA sola regola in tutto POPS
// ----------------------------------------------------------------------------
// Validato sullo spike CiC del 2026-06-05 (trial Inglesina Italiana, V022 22%):
//   righe: 3×127,33 ; 5×88,17 ; 1×45,50  con sconto globale 7%
//   → net 807,56 · IVA 177,66 · lordo 985,22  (identici a quanto restituito da Reviso)
//   caso-limite: 45,50 × 0,93 = 42,315 → 42,32  (half-up DECIMALE, non binario)
//
// Reviso calcola in decimale: 45,50×0,93 dà esattamente 42,315 → half-up 42,32.
// In JavaScript 45.50*0.93 = 42.31499999999999772 (errore binario) → Math.round
// darebbe 42,31. Per COMBACIARE con Reviso applichiamo un nudge di 1e-9 che
// ricostruisce l'intento decimale prima dell'arrotondamento.
//
// Regola completa:
//   net riga  = round2(qty × unitNetPrice × (1 − sconto%/100))
//   net doc   = round2(Σ net riga)
//   IVA doc   = round2(net doc × aliquota/100)      ← sul totale, non somma per-riga
//   lordo doc = round2(net doc + IVA doc)
// Se POPS usa QUESTA funzione sia a video sia nel payload → cifra cliente == documento.
// ============================================================================

/** Half-up a 2 decimali, robusto all'errore di virgola mobile (match Reviso). */
export function round2(n: number): number {
  return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
}

export interface ComputedTotals {
  /** Netto per riga, arrotondato (stesso ordine dell'input). */
  lineNets: number[];
  net: number;
  vat: number;
  gross: number;
}

/**
 * Calcola i totali canonici di un documento.
 * @param lines righe con quantità e prezzo unitario netto
 * @param discountPct sconto globale in percentuale (0 = nessuno)
 * @param vatRate aliquota IVA in percentuale (es. 22)
 */
export function computeTotals(
  lines: ReadonlyArray<{ qty: number; unitNetPrice: number }>,
  discountPct: number,
  vatRate: number,
): ComputedTotals {
  const factor = 1 - discountPct / 100;
  const lineNets = lines.map((l) => round2(l.qty * l.unitNetPrice * factor));
  const net = round2(lineNets.reduce((a, b) => a + b, 0));
  const vat = round2((net * vatRate) / 100);
  const gross = round2(net + vat);
  return { lineNets, net, vat, gross };
}
