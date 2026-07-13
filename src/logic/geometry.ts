// src/logic/geometry.ts
//
// Geometria condivisa dai motori di prezzo (2025, 2025x, 2026) e dalla colonna
// "m" della BuilderView. Sta qui, in un modulo a sé, perché il cliente legge i
// metri accanto al totale e fa la divisione a mano per ricavare il €/m: se la
// colonna calcolasse i metri con misure diverse da quelle usate dal prezzo, il
// suo conto non tornerebbe. Unica fonte, nessuna possibilità di divergere.

/**
 * Normalizzazione misure: arrotondamento ai 50 mm per eccesso.
 * È il primo passo di ogni motore di prezzo — una finestra da 1010 mm viene
 * quotata come 1050.
 */
export function roundMm(mm: number): number {
  return Math.ceil(mm / 50) * 50;
}

export interface GeometriaInput {
  base_mm: number;
  altezza_mm: number;
  num_orizzontali: number;
  num_verticali: number;
}

/**
 * Sviluppo lineare della griglia, in metri, per UN pannello.
 * (orizzontali × base) + (verticali × altezza), sulle misure arrotondate.
 */
export function metriGriglia(input: GeometriaInput): number {
  const base_round = roundMm(input.base_mm);
  const altezza_round = roundMm(input.altezza_mm);
  return ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;
}

/**
 * Perimetro del telaio, in metri, per UN pannello. (base + altezza) × 2.
 * Usato dalla logica "solo canalino" e dalla determinazione della taglia (2026).
 */
export function metriPerimetro(base_mm: number, altezza_mm: number): number {
  return ((roundMm(base_mm) * 2) + (roundMm(altezza_mm) * 2)) / 1000;
}
