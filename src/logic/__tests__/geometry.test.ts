import { describe, it, expect } from 'vitest';
import { roundMm, metriGriglia, metriPerimetro } from '../geometry';

// Formule storiche, copiate alla lettera da come stavano inline dentro
// pricing.ts / pricing2025.ts / pricing2025x.ts prima dell'estrazione in
// geometry.ts. Servono da oracolo: se qualcuno tocca geometry.ts e cambia i
// metri, cambia anche il prezzo di tutti i preventivi — questi test lo fermano.
const legacyMetriGriglia = (b: number, h: number, oriz: number, vert: number) => {
  const base_round = Math.ceil(b / 50) * 50;
  const altezza_round = Math.ceil(h / 50) * 50;
  return ((oriz * base_round) + (vert * altezza_round)) / 1000;
};
const legacyMetriPerimetro = (b: number, h: number) => {
  const base_round = Math.ceil(b / 50) * 50;
  const altezza_round = Math.ceil(h / 50) * 50;
  return ((base_round * 2) + (altezza_round * 2)) / 1000;
};

const CASI: Array<[number, number, number, number]> = [
  [1000, 1000, 2, 2],   // misure tonde
  [1010, 1010, 2, 2],   // arrotondamento per eccesso (→ 1050)
  [1049, 1051, 3, 1],   // a cavallo dello scatto dei 50mm
  [800, 1200, 0, 3],    // solo verticali
  [1500, 700, 4, 0],    // solo orizzontali
  [600, 600, 0, 0],     // nessuna suddivisione
  [2450, 1050, 5, 4],   // formato grande
];

describe('geometry: parità con le formule storiche dei motori di prezzo', () => {
  it.each(CASI)('metriGriglia(%i x %i, %i oriz, %i vert)', (b, h, oriz, vert) => {
    expect(metriGriglia({ base_mm: b, altezza_mm: h, num_orizzontali: oriz, num_verticali: vert }))
      .toBe(legacyMetriGriglia(b, h, oriz, vert));
  });

  it.each(CASI)('metriPerimetro(%i x %i)', (b, h) => {
    expect(metriPerimetro(b, h)).toBe(legacyMetriPerimetro(b, h));
  });
});

describe('geometry: arrotondamento ai 50mm', () => {
  it('arrotonda per eccesso, non al più vicino', () => {
    expect(roundMm(1000)).toBe(1000);
    expect(roundMm(1001)).toBe(1050);
    expect(roundMm(1049)).toBe(1050);
    expect(roundMm(1050)).toBe(1050);
  });
});

describe('la colonna "m" riconcilia col totale riga', () => {
  // Il senso della feature: il cliente divide il totale della riga per i metri e
  // deve ritrovare il €/m. Vale sul listino 2025, che è lineare (incrocio =
  // metri × (griglia + canalino), senza supplementi fissi).
  it('totale ÷ metri = €/m, con la maggiorazione già inglobata', () => {
    const qty = 3;
    const metriPezzo = metriGriglia({ base_mm: 1000, altezza_mm: 1000, num_orizzontali: 2, num_verticali: 2 });
    const metriTotaliRiga = metriPezzo * qty;

    const tariffa = 14; // €/m di listino (griglia + canalino)
    const prezzoUnitario = metriPezzo * tariffa;
    const totaleRiga = prezzoUnitario * qty;

    expect(totaleRiga / metriTotaliRiga).toBeCloseTo(tariffa, 10);
  });

  it('solo canalino: totale ÷ metri di perimetro = moltiplicatore del codice', () => {
    const qty = 2;
    const perimetroPezzo = metriPerimetro(1000, 1000); // 4,00 m
    const metriTotaliRiga = perimetroPezzo * qty;

    const moltiplicatore = 2.5; // C211
    const totaleRiga = (perimetroPezzo * moltiplicatore) * qty;

    expect(totaleRiga / metriTotaliRiga).toBeCloseTo(moltiplicatore, 10);
  });
});
