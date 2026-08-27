import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCatalogStore } from '../../Data/catalog';
import { calculatePrice, type PricingInput } from '../pricing';
import { ricostruisciPrezzoUnitario } from '../listini';

// ============================================================================
// LO SCONTRINO DEVE RIFARE IL PREZZO.
//
// Ogni riga si porta dietro la catena che l'ha prodotta (RigaPricing). Se la
// catena registrata non riproduce il prezzo che il motore ha calcolato, la
// lente mostrerà al cliente una scomposizione che non torna — cioè il difetto
// che lo scontrino esiste per eliminare.
//
// Una sola formula per tutti i motori:
//   metri × Σtariffe × (1 + maggiorazione) + Σsupplementi
// ============================================================================

const TARIFFA_GRIGLIA = 14;
const TARIFFA_CANALINO = 2.5;

const LISTINI = ['2025-a', '2025x', '2025-x', '2026-a', 'listino-inesistente'];
const MISURE: Array<[number, number]> = [[1010, 1010], [600, 700], [2450, 2000], [1050, 1050]];
// [orizzontali, verticali]
const SUDDIVISIONI: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 2], [3, 1], [5, 4]];
const CANALINI = ['ALLUMINIO', 'BORDO CALDO', ''];

function inputDa(base: number, altezza: number, oriz: number, vert: number, tipoCanalino: string, qty = 3): PricingInput {
  return {
    base_mm: base, altezza_mm: altezza, qty,
    num_orizzontali: oriz, num_verticali: vert,
    tipo_canalino: tipoCanalino,
    isSoloCanalino: false,
    prezzo_unitario_griglia: TARIFFA_GRIGLIA,
    prezzo_unitario_canalino: tipoCanalino ? TARIFFA_CANALINO : 0,
  };
}

describe('scontrino di riga', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const catalog = useCatalogStore();
    catalog.codiciMap = {
      S001: 8, S002: 12,
      S003: 10, S004: 14, S005: 18, S006: 22,
      S007: 11, S008: 15, S009: 19, S010: 23,
      S011: 9,  S012: 13, S013: 17, S014: 21,
    };
    catalog.isLoaded = true;
  });

  it.each(LISTINI)('listino %s: lo scontrino rifà il prezzo su tutta la matrice', (listino) => {
    let controllate = 0;
    for (const [base, altezza] of MISURE) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        for (const tipoCanalino of CANALINI) {
          const { prezzo_unitario, pricing } = calculatePrice(inputDa(base, altezza, oriz, vert, tipoCanalino), listino);
          expect(pricing).toBeDefined();
          expect(ricostruisciPrezzoUnitario(pricing!)).toBeCloseTo(prezzo_unitario, 10);
          controllate++;
        }
      }
    }
    expect(controllate).toBe(MISURE.length * SUDDIVISIONI.length * CANALINI.length);
  });

  it.each(LISTINI)('listino %s: lo scontrino rifà il prezzo del solo telaio', (listino) => {
    for (const codice of ['C111', 'C112', 'C211', 'C311']) {
      const { prezzo_unitario, pricing } = calculatePrice({
        base_mm: 1010, altezza_mm: 1200, qty: 2,
        num_orizzontali: 0, num_verticali: 0,
        tipo_canalino: 'ALLUMINIO',
        codice_canalino: codice,
        isSoloCanalino: true,
        prezzo_unitario_griglia: 0,
        prezzo_unitario_canalino: TARIFFA_CANALINO,
      }, listino);
      expect(pricing!.regime).toBe('SOLO_TELAIO');
      expect(pricing!.metrica).toBe('perimetro');
      expect(ricostruisciPrezzoUnitario(pricing!)).toBeCloseTo(prezzo_unitario, 10);
    }
  });

  it('il regime registrato è quello che il motore ha davvero applicato', () => {
    const casi: Array<[number, number, string, string]> = [
      // [orizzontali, verticali, canalino, regime atteso]
      [2, 2, 'ALLUMINIO', 'INCROCIO'],
      [0, 2, 'ALLUMINIO', 'PARALLELE'],
      [0, 1, 'ALLUMINIO', 'SINGOLA'],
      [0, 0, 'ALLUMINIO', 'NESSUNA'],
      // Override storico: solo orizzontali e nessun canalino → torna a incrocio.
      [1, 0, '', 'INCROCIO'],
      [3, 0, '', 'INCROCIO'],
      // Con il canalino, invece, gli orizzontali restano paralleli/singoli.
      [1, 0, 'ALLUMINIO', 'SINGOLA'],
      [3, 0, 'ALLUMINIO', 'PARALLELE'],
    ];
    for (const listino of LISTINI) {
      for (const [oriz, vert, canalino, atteso] of casi) {
        const { pricing } = calculatePrice(inputDa(1010, 1010, oriz, vert, canalino), listino);
        expect(`${listino} ${oriz}x${vert} ${canalino}: ${pricing!.regime}`)
          .toBe(`${listino} ${oriz}x${vert} ${canalino}: ${atteso}`);
      }
    }
  });

  // I due vocabolari non devono incrociarsi: il 2026 paga con voci fisse, i
  // listini lineari con una percentuale. Se un giorno qualcuno rimette una
  // maggiorazione nel 2026 (o un costo fisso nel 2025) questo test lo dice
  // prima che lo dica la lente al cliente.
  it('2026: nessuna maggiorazione, mai', () => {
    for (const [base, altezza] of MISURE) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        const { pricing } = calculatePrice(inputDa(base, altezza, oriz, vert, 'ALLUMINIO'), '2026-a');
        expect(pricing!.maggiorazionePct).toBeNull();
      }
    }
  });

  it('listini lineari: nessun costo fisso, mai', () => {
    for (const listino of ['2025-a', '2025x', '2025-x']) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        const { pricing } = calculatePrice(inputDa(1010, 1010, oriz, vert, 'ALLUMINIO'), listino);
        expect(pricing!.supplementi).toEqual([]);
        expect(pricing!.taglia).toBeNull();
      }
    }
  });

  it('lo scontrino dichiara il MOTORE che ha calcolato, non l\'etichetta chiesta', () => {
    // '2025-x' è la scrittura salvata dal modale cliente per LEALI: il motore è
    // lo stesso di '2025x' e lo scontrino registra quello.
    expect(calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), '2025-x').pricing!.listino).toBe('2025x');
    expect(calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), '2025x').pricing!.listino).toBe('2025x');
    expect(calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), '2025-a').pricing!.listino).toBe('2025-a');
    expect(calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), '2026-a').pricing!.listino).toBe('2026-a');
    // Listino sconosciuto: il dispatcher cade sul 2026 e lo scontrino lo dice.
    expect(calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), 'boh').pricing!.listino).toBe('2026-a');
  });

  it('catalogo non caricato: nessun prezzo e nessuno scontrino da mostrare', () => {
    const catalog = useCatalogStore();
    catalog.isLoaded = false;
    for (const listino of LISTINI) {
      const r = calculatePrice(inputDa(1010, 1010, 2, 2, 'ALLUMINIO'), listino);
      expect(r.prezzo_unitario).toBe(0);
      expect(r.pricing).toBeUndefined();
    }
  });
});
