// ============================================================================
// Test di regressione sulla regola canonica dei totali (rounding.ts).
// Blinda il nodo #1 della migrazione CiC: "cifra-cliente == documento Reviso".
// I casi-limite erano finora validati solo a mano sullo spike 2026-06-05.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { round2, computeTotals, roundTo10 } from '../rounding';

describe('round2 — half-up decimale (match Reviso, robusto all\'errore binario)', () => {
  // Casi .xx5 dove Math.round ingenuo sbaglia per l'errore di virgola mobile.
  const cases: Array<[number, number]> = [
    [42.315, 42.32],   // 45,50 × 0,93 — il caso dello spike (45.50*0.93 = 42.31499…)
    [1.005, 1.01],     // classico: 1.005*100 = 100.4999… → senza nudge darebbe 1.00
    [2.675, 2.68],     // classico: 2.675*100 = 267.4999…
    [0.005, 0.01],
    [0.015, 0.02],
    [0.125, 0.13],
    [5.555, 5.56],
    [10.005, 10.01],
    [199.995, 200.0],
    [0.014999, 0.01],  // sotto la soglia: NON deve salire
    [42.314, 42.31],   // appena sotto: resta giù
    [100, 100],        // interi invariati
  ];
  it.each(cases)('round2(%f) = %f', (input, expected) => {
    expect(round2(input)).toBe(expected);
  });

  it('è simmetrica sui negativi (riga sconto correttiva)', () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-42.315)).toBe(-42.32);
    expect(round2(-0.014)).toBe(-0.01);
  });
});

describe('roundTo10 — pulizia artefatti float per unitNetPrice (Reviso max 10 decimali)', () => {
  // Reviso rifiuta unitNetPrice con >10 decimali (400 E04740): questi prezzi POPS
  // arrivano con artefatti binari e vanno normalizzati senza alterarne il valore.
  const cases: Array<[number, number]> = [
    [8.399999999999999, 8.4],
    [31.679999999999996, 31.68],
    [13.44, 13.44],
    [23.04, 23.04],
    [48, 48],
    [0, 0],
  ];
  it.each(cases)('roundTo10(%f) = %f', (input, expected) => {
    expect(roundTo10(input)).toBe(expected);
  });
  it('non lascia mai più di 10 decimali', () => {
    for (const v of [8.399999999999999, 31.679999999999996, 17.279999999999998]) {
      const decimals = (String(roundTo10(v)).split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(10);
    }
  });
});

describe('computeTotals — netto per riga → IVA su totale → lordo', () => {
  it('riproduce lo spike validato su Reviso (3 righe, sconto 7%, IVA 22%)', () => {
    const lines = [
      { qty: 3, unitNetPrice: 127.33 },
      { qty: 5, unitNetPrice: 88.17 },
      { qty: 1, unitNetPrice: 45.5 },
    ];
    const t = computeTotals(lines, 7, 22);
    expect(t.lineNets).toEqual([355.25, 409.99, 42.32]); // 42.32 = caso half-up
    expect(t.net).toBe(807.56);
    expect(t.vat).toBe(177.66);
    expect(t.gross).toBe(985.22);
  });

  it('senza sconto: il netto è la somma piena delle righe', () => {
    const t = computeTotals([{ qty: 2, unitNetPrice: 10 }], 0, 22);
    expect(t.net).toBe(20);
    expect(t.vat).toBe(4.4);
    expect(t.gross).toBe(24.4);
  });

  it('IVA calcolata sul TOTALE documento, non come somma per-riga', () => {
    // Due righe il cui IVA per-riga arrotondata divergerebbe dall'IVA sul totale.
    const lines = [
      { qty: 1, unitNetPrice: 0.1 },
      { qty: 1, unitNetPrice: 0.1 },
    ];
    const t = computeTotals(lines, 0, 22);
    expect(t.net).toBe(0.2);
    expect(t.vat).toBe(round2(0.2 * 0.22)); // 0.044 → 0.04, sul totale
    expect(t.gross).toBe(round2(t.net + t.vat));
  });

  it('documento vuoto → tutti zero, nessun NaN', () => {
    const t = computeTotals([], 10, 22);
    expect(t).toEqual({ lineNets: [], net: 0, vat: 0, gross: 0 });
  });

  it('lordo = net + vat ricomposto (coerenza interna)', () => {
    const t = computeTotals([{ qty: 7, unitNetPrice: 13.37 }], 3.5, 22);
    expect(t.gross).toBe(round2(t.net + t.vat));
  });
});

// ============================================================================
// REGOLA COMMERCIALE: il trasporto non prende MAI lo sconto d'ordine — né sul
// preventivo, né sull'ordine CiC, né sul DDT. Lo sconto di riga (0) sovrascrive
// quello globale. Se questa regola si rompe, la cifra che il cliente firma non
// coincide più con quella che gli viene fatturata.
// ============================================================================
describe('computeTotals — sconto di riga (trasporto escluso dallo sconto)', () => {
  it('la riga con discountPct: 0 resta a prezzo pieno, le altre sono scontate', () => {
    const t = computeTotals([
      { qty: 2, unitNetPrice: 100 },                    // merce → sconto globale 10%
      { qty: 1, unitNetPrice: 35, discountPct: 0 },     // consegna → nessuno sconto
    ], 10, 22);
    expect(t.lineNets).toEqual([180, 35]);
    expect(t.net).toBe(215);
  });

  it('senza discountPct di riga vale lo sconto globale (comportamento storico invariato)', () => {
    const t = computeTotals([{ qty: 2, unitNetPrice: 100 }, { qty: 1, unitNetPrice: 35 }], 10, 22);
    expect(t.lineNets).toEqual([180, 31.5]);
    expect(t.net).toBe(211.5);
  });

  it('sconto 0: la riga esclusa non cambia nulla', () => {
    const t = computeTotals([{ qty: 1, unitNetPrice: 35, discountPct: 0 }], 0, 22);
    expect(t.net).toBe(35);
  });
});
