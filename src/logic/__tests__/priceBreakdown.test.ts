import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCatalogStore } from '../../Data/catalog';
import { calculatePrice, type PricingInput } from '../pricing';
import { costruisciDettaglio } from '../priceBreakdown';
import type { RigaPreventivo } from '../../types';

// ============================================================================
// La modale "come si compone il prezzo" ricostruisce la catena in un modulo suo
// (priceBreakdown.ts), separato dai motori. È una seconda implementazione, e le
// seconde implementazioni divergono: questo test la inchioda al motore.
//
// Invariante: per ogni riga, la catena mostrata al cliente deve riprodurre AL
// CENTESIMO il prezzo che il motore ha effettivamente calcolato. Se un giorno
// non lo fa più, il test fallisce prima che a vederlo sia un cliente.
// ============================================================================

const TARIFFA_GRIGLIA = 14;
const TARIFFA_CANALINO = 2.5;

const LISTINI = ['2025-a', '2025x', '2026-a'];
const MISURE: Array<[number, number]> = [[1010, 1010], [600, 700], [2450, 2000], [1050, 1050]];
// [orizzontali, verticali] — nella riga: colonne = orizzontali, righe = verticali
const SUDDIVISIONI: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 2], [3, 1], [5, 4]];
const CANALINI = ['ALLUMINIO', 'BORDO CALDO', ''];

function rigaDa(
  base: number, altezza: number, oriz: number, vert: number,
  tipoCanalino: string, qty: number, prezzoUnitario: number,
): RigaPreventivo {
  return {
    id: 'x',
    categoria: 'INGLESINA' as any,
    modello: 'VARSAVIA' as any,
    dimensione: '26',
    finitura: 'BIANCO',
    base_mm: base,
    altezza_mm: altezza,
    righe: vert,
    colonne: oriz,
    quantita: qty,
    descrizioneCompleta: 'INGLESINA VARSAVIA 26 - BIANCO',
    infoCanalino: tipoCanalino ? `Canalino: ${tipoCanalino} 16 NATURALE` : '',
    rawCanalino: { tipo: tipoCanalino, dim: tipoCanalino ? '16' : '', fin: tipoCanalino ? 'NATURALE' : '' },
    codice: 'G214',
    prezzo_unitario: prezzoUnitario,
    prezzo_totale: prezzoUnitario * qty,
    curva: false,
    tacca: false,
  };
}

describe('priceBreakdown: la catena mostrata riproduce il prezzo del motore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const catalog = useCatalogStore();
    catalog.listino = {
      INGLESINA: { VARSAVIA: { '26': { BIANCO: { prezzo: TARIFFA_GRIGLIA, cod: 'G214' } } } },
      CANALINO: {
        'ALLUMINIO':   { '16': { NATURALE: { prezzo: TARIFFA_CANALINO, cod: 'C111' } } },
        'BORDO CALDO': { '16': { NATURALE: { prezzo: TARIFFA_CANALINO, cod: 'C211' } } },
      },
    };
    catalog.codiciMap = {
      S001: 8, S002: 12,
      S003: 10, S004: 14, S005: 18, S006: 22,
      S007: 11, S008: 15, S009: 19, S010: 23,
      S011: 9,  S012: 13, S013: 17, S014: 21,
    };
    catalog.isLoaded = true;
  });

  it.each(LISTINI)('listino %s: riconcilia su tutta la matrice griglia', (listino) => {
    const catalog = useCatalogStore();
    const qty = 3;
    let controllate = 0;

    for (const [base, altezza] of MISURE) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        for (const tipoCanalino of CANALINI) {
          const input: PricingInput = {
            base_mm: base, altezza_mm: altezza, qty,
            num_orizzontali: oriz, num_verticali: vert,
            tipo_canalino: tipoCanalino,
            isSoloCanalino: false,
            prezzo_unitario_griglia: TARIFFA_GRIGLIA,
            prezzo_unitario_canalino: tipoCanalino ? TARIFFA_CANALINO : 0,
          };
          const { prezzo_unitario } = calculatePrice(input, listino);
          const riga = rigaDa(base, altezza, oriz, vert, tipoCanalino, qty, prezzo_unitario);

          const d = costruisciDettaglio(riga, listino, catalog);
          expect(d).not.toBeNull();
          expect(d!.prezzoRicostruito).toBeCloseTo(prezzo_unitario, 10);
          expect(d!.riconcilia).toBe(true);

          // I metri mostrati sono quelli su cui si regge la verifica del cliente.
          expect(d!.metriTotali).toBeCloseTo(d!.metriPezzo * qty, 10);
          controllate++;
        }
      }
    }
    expect(controllate).toBe(MISURE.length * SUDDIVISIONI.length * CANALINI.length);
  });

  it.each(LISTINI)('listino %s: riconcilia sul solo telaio', (listino) => {
    const catalog = useCatalogStore();
    for (const codice of ['C111', 'C112', 'C211', 'C311']) {
      const input: PricingInput = {
        base_mm: 1010, altezza_mm: 1200, qty: 2,
        num_orizzontali: 0, num_verticali: 0,
        tipo_canalino: 'ALLUMINIO',
        codice_canalino: codice,
        isSoloCanalino: true,
        prezzo_unitario_griglia: 0,
        prezzo_unitario_canalino: TARIFFA_CANALINO,
      };
      const { prezzo_unitario } = calculatePrice(input, listino);

      const riga = rigaDa(1010, 1200, 0, 0, 'ALLUMINIO', 2, prezzo_unitario);
      riga.categoria = 'CANALINO' as any;
      riga.codice = codice;

      const d = costruisciDettaglio(riga, listino, catalog);
      expect(d!.metrica).toBe('perimetro');
      expect(d!.prezzoRicostruito).toBeCloseTo(prezzo_unitario, 10);
      expect(d!.riconcilia).toBe(true);
    }
  });

  it('prezzo/m concordato (profilo fuori listino): riconcilia e non usa il listino', () => {
    const catalog = useCatalogStore();
    const concordata = 23.5;
    const input: PricingInput = {
      base_mm: 1000, altezza_mm: 1000, qty: 1,
      num_orizzontali: 2, num_verticali: 2,
      tipo_canalino: 'ALLUMINIO',
      isSoloCanalino: false,
      prezzo_unitario_griglia: concordata, // l'admin sovrascrive la tariffa
      prezzo_unitario_canalino: TARIFFA_CANALINO,
    };
    const { prezzo_unitario } = calculatePrice(input, '2025-a');

    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, prezzo_unitario);
    riga.customVarPrice = concordata;

    const d = costruisciDettaglio(riga, '2025-a', catalog)!;
    expect(d.tariffaConcordata).toBe(true);
    expect(d.tariffaGriglia).toBe(concordata);
    expect(d.riconcilia).toBe(true);
  });

  it('righe EXTRA: nessuna catena da spiegare', () => {
    const catalog = useCatalogStore();
    const riga = rigaDa(0, 0, 0, 0, '', 1, 40);
    riga.categoria = 'EXTRA' as any;
    expect(costruisciDettaglio(riga, '2025-a', catalog)).toBeNull();
  });

  // --- LA GUARDIA ----------------------------------------------------------
  it('listino cambiato dopo l\'offerta: NON riconcilia, e la modale non inventa', () => {
    const catalog = useCatalogStore();
    const input: PricingInput = {
      base_mm: 1000, altezza_mm: 1000, qty: 1,
      num_orizzontali: 2, num_verticali: 2,
      tipo_canalino: 'ALLUMINIO',
      isSoloCanalino: false,
      prezzo_unitario_griglia: TARIFFA_GRIGLIA,
      prezzo_unitario_canalino: TARIFFA_CANALINO,
    };
    const { prezzo_unitario } = calculatePrice(input, '2025-a');
    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, prezzo_unitario);

    // Il preventivo è stato battuto a 14,00 €/m. Poi il listino sale a 15,50.
    catalog.listino.INGLESINA.VARSAVIA['26'].BIANCO.prezzo = 15.5;

    const d = costruisciDettaglio(riga, '2025-a', catalog)!;
    expect(d.riconcilia).toBe(false);

    // Quello che resta vero anche così: i metri e la tariffa effettivamente pagata.
    expect(d.metriTotali).toBeGreaterThan(0);
    expect(d.tariffaEffettiva).toBeCloseTo(prezzo_unitario / d.metriTotali, 10);
  });
});
