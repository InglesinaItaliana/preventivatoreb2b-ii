"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.roundTo10 = roundTo10;
exports.computeTotals = computeTotals;
/** Half-up a 2 decimali, robusto all'errore di virgola mobile (match Reviso). */
function round2(n) {
    return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
}
/**
 * Pulisce gli artefatti binari di virgola mobile portando il numero a max 10
 * decimali. Reviso RIFIUTA (400 E04740) `unitNetPrice` con >10 decimali: un
 * prezzo POPS come 8,40 può arrivare come 8.399999999999999 (16 decimali) e va
 * normalizzato prima dell'invio. Non altera il valore reale (prezzi unitari ≪ 9e5).
 */
function roundTo10(n) {
    return Math.round(n * 1e10) / 1e10;
}
/**
 * Calcola i totali canonici di un documento.
 * @param lines righe con quantità e prezzo unitario netto. `discountPct` sulla riga
 *   SOVRASCRIVE lo sconto globale: serve al trasporto, che per regola commerciale non
 *   prende mai lo sconto d'ordine (le righe di consegna passano `discountPct: 0`).
 * @param discountPct sconto globale in percentuale (0 = nessuno)
 * @param vatRate aliquota IVA in percentuale (es. 22)
 */
function computeTotals(lines, discountPct, vatRate) {
    const lineNets = lines.map((l) => {
        var _a;
        const pct = (_a = l.discountPct) !== null && _a !== void 0 ? _a : discountPct;
        return round2(l.qty * l.unitNetPrice * (1 - pct / 100));
    });
    const net = round2(lineNets.reduce((a, b) => a + b, 0));
    const vat = round2((net * vatRate) / 100);
    const gross = round2(net + vat);
    return { lineNets, net, vat, gross };
}
//# sourceMappingURL=rounding.js.map