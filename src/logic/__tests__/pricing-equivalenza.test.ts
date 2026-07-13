import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCatalogStore } from '../../Data/catalog';
import { calculatePrice, type PricingInput } from '../pricing';

// ============================================================================
// TEST DIFFERENZIALE — l'estrazione della geometria in geometry.ts non deve aver
// cambiato NEMMENO UN CENTESIMO dei prezzi.
//
// Qui sotto ci sono i tre motori COPIATI ALLA LETTERA da main (il commit prima
// dell'estrazione), con le formule geometriche ancora inline. Il test li esegue
// in parallelo ai motori attuali sugli stessi input e pretende uguaglianza
// esatta (toBe, non toBeCloseTo: le operazioni sono nello stesso ordine, quindi
// anche il float deve coincidere bit a bit).
//
// Se qualcuno in futuro tocca la geometria credendo di fare un refactoring
// innocuo, questo test glielo impedisce.
// ============================================================================

const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5, 'C112': 2.0, 'C211': 2.5, 'C311': 3.0
};

function getSupplementoPrice(catalog: any, code: string): number {
  if (!catalog.codiciMap) return 0;
  const price = catalog.codiciMap[code.toUpperCase()];
  return price !== undefined ? price : 0;
}

// --- RIFERIMENTO: pricing.ts @ main (logica 2026) ---------------------------
function refLogic2026(input: PricingInput, catalog: any) {
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;

  if (input.isSoloCanalino) {
    let prezzo_unitario = 0;
    if (input.codice_canalino) {
      const code = input.codice_canalino.toUpperCase();
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      if (moltiplicatore) prezzo_unitario = metri_perimetro * moltiplicatore;
    }
    return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
  }

  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;

  let taglia: 'S' | 'M' | 'L' | 'XL' = 'XL';
  if (metri_perimetro < 2.5) taglia = 'S';
  else if (metri_perimetro < 5.0) taglia = 'M';
  else if (metri_perimetro < 7.5) taglia = 'L';

  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1;
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2;
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3;

  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;
  if (senzaCanalino && soloOrizzontali) complessita = 1;

  const costo_setup = metri_griglia < 2.0 ? getSupplementoPrice(catalog, 'S001') : getSupplementoPrice(catalog, 'S002');

  const perimetraleCodes: any = {
    'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
    'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' },
    'FIBRA':       { S: 'S011', M: 'S012', L: 'S013', XL: 'S014' },
  };
  const tipoCanalinoKey = input.tipo_canalino ? input.tipo_canalino.toUpperCase() : '';
  let costo_perimetrale = 0;
  if (perimetraleCodes[tipoCanalinoKey]) {
    costo_perimetrale = getSupplementoPrice(catalog, perimetraleCodes[tipoCanalinoKey][taglia]);
  }

  let prezzo_unitario = 0;
  switch (complessita) {
    case 1:
      prezzo_unitario = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
      break;
    case 2:
    case 3:
      prezzo_unitario = (metri_griglia * input.prezzo_unitario_griglia) + costo_perimetrale + costo_setup;
      break;
    default:
      prezzo_unitario = 0;
      break;
  }
  return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
}

// --- RIFERIMENTO: pricing2025.ts @ main -------------------------------------
function refLogic2025(input: PricingInput) {
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;

  if (input.isSoloCanalino) {
    let prezzo_unitario = 0;
    if (input.codice_canalino) {
      const code = input.codice_canalino.toUpperCase();
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      if (moltiplicatore) prezzo_unitario = metri_perimetro * moltiplicatore;
    }
    return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
  }

  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;

  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1;
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2;
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3;

  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;
  if (senzaCanalino && soloOrizzontali) complessita = 1;

  let prezzo_unitario = 0;
  switch (complessita) {
    case 1:
      prezzo_unitario = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
      break;
    case 2:
      prezzo_unitario = (metri_griglia * ((input.prezzo_unitario_griglia + input.prezzo_unitario_canalino) * 1.2));
      break;
    case 3:
      prezzo_unitario = (metri_griglia * ((input.prezzo_unitario_griglia + input.prezzo_unitario_canalino) * 1.5));
      break;
    default:
      prezzo_unitario = 0;
      break;
  }
  return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
}

// --- RIFERIMENTO: pricing2025x.ts @ main (LEALI) ----------------------------
function refLogic2025x(input: PricingInput) {
  const MAGGIORAZIONE_LEALI = 0; // disattivata il 2026-06-26, come in prod
  const pGrigliaAumentato = input.prezzo_unitario_griglia + MAGGIORAZIONE_LEALI;
  const pCanalinoAumentato = input.prezzo_unitario_canalino + MAGGIORAZIONE_LEALI;

  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;

  if (input.isSoloCanalino) {
    let prezzo_unitario = 0;
    if (input.codice_canalino) {
      const code = input.codice_canalino.toUpperCase();
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      if (moltiplicatore) prezzo_unitario = metri_perimetro * moltiplicatore;
    }
    return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
  }

  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1;
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2;
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3;

  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;
  if (senzaCanalino && soloOrizzontali) complessita = 1;

  let prezzo_unitario = 0;
  switch (complessita) {
    case 1:
      prezzo_unitario = metri_griglia * (pGrigliaAumentato + pCanalinoAumentato);
      break;
    case 2:
      prezzo_unitario = (metri_griglia * ((pGrigliaAumentato + pCanalinoAumentato) * 1.2));
      break;
    case 3:
      prezzo_unitario = (metri_griglia * ((pGrigliaAumentato + pCanalinoAumentato) * 1.2));
      break;
    default:
      prezzo_unitario = 0;
      break;
  }
  return { prezzo_unitario, prezzo_totale: prezzo_unitario * input.qty };
}

// --- Generazione dei casi ---------------------------------------------------
const BASI = [600, 1000, 1010, 1049, 1050, 1500, 2450];
const ALTEZZE = [700, 1000, 1051, 1600, 2000];
const SUDDIVISIONI: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 2], [3, 1], [5, 4]];
const CANALINI = ['', 'NESSUNO', 'ALLUMINIO', 'BORDO CALDO', 'FIBRA'];

function casiGriglia(): PricingInput[] {
  const out: PricingInput[] = [];
  for (const base_mm of BASI) {
    for (const altezza_mm of ALTEZZE) {
      for (const [num_orizzontali, num_verticali] of SUDDIVISIONI) {
        for (const tipo_canalino of CANALINI) {
          out.push({
            base_mm, altezza_mm, qty: 3,
            num_orizzontali, num_verticali,
            tipo_canalino,
            isSoloCanalino: false,
            prezzo_unitario_griglia: 14,
            prezzo_unitario_canalino: 2.5,
          });
        }
      }
    }
  }
  return out;
}

function casiSoloCanalino(): PricingInput[] {
  const out: PricingInput[] = [];
  for (const base_mm of BASI) {
    for (const altezza_mm of ALTEZZE) {
      for (const codice_canalino of ['C111', 'C112', 'C211', 'C311', 'C999']) {
        out.push({
          base_mm, altezza_mm, qty: 2,
          num_orizzontali: 0, num_verticali: 0,
          tipo_canalino: 'ALLUMINIO',
          codice_canalino,
          isSoloCanalino: true,
          prezzo_unitario_griglia: 0,
          prezzo_unitario_canalino: 2.5,
        });
      }
    }
  }
  return out;
}

describe('equivalenza motori di prezzo: main vs geometry.ts estratta', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const catalog = useCatalogStore();
    catalog.codiciMap = {
      S001: 8, S002: 12,                       // setup
      S003: 10, S004: 14, S005: 18, S006: 22,  // perimetrale alluminio
      S007: 11, S008: 15, S009: 19, S010: 23,  // bordo caldo
      S011: 9,  S012: 13, S013: 17, S014: 21,  // fibra
    };
    catalog.isLoaded = true;
  });

  it('2026-a: stesso prezzo su tutte le combinazioni griglia', () => {
    const catalog = useCatalogStore();
    for (const input of casiGriglia()) {
      const atteso = refLogic2026(input, catalog);
      const ottenuto = calculatePrice(input, '2026-a');
      expect(ottenuto.prezzo_unitario).toBe(atteso.prezzo_unitario);
      expect(ottenuto.prezzo_totale).toBe(atteso.prezzo_totale);
    }
  });

  it('2025-a: stesso prezzo su tutte le combinazioni griglia', () => {
    for (const input of casiGriglia()) {
      const atteso = refLogic2025(input);
      const ottenuto = calculatePrice(input, '2025-a');
      expect(ottenuto.prezzo_unitario).toBe(atteso.prezzo_unitario);
      expect(ottenuto.prezzo_totale).toBe(atteso.prezzo_totale);
    }
  });

  it('2025x (LEALI): stesso prezzo su tutte le combinazioni griglia', () => {
    for (const input of casiGriglia()) {
      const atteso = refLogic2025x(input);
      for (const alias of ['2025x', '2025-x']) {
        const ottenuto = calculatePrice(input, alias);
        expect(ottenuto.prezzo_unitario).toBe(atteso.prezzo_unitario);
        expect(ottenuto.prezzo_totale).toBe(atteso.prezzo_totale);
      }
    }
  });

  it('solo canalino: stesso prezzo su tutti i listini', () => {
    const catalog = useCatalogStore();
    for (const input of casiSoloCanalino()) {
      expect(calculatePrice(input, '2026-a').prezzo_totale).toBe(refLogic2026(input, catalog).prezzo_totale);
      expect(calculatePrice(input, '2025-a').prezzo_totale).toBe(refLogic2025(input).prezzo_totale);
      expect(calculatePrice(input, '2025x').prezzo_totale).toBe(refLogic2025x(input).prezzo_totale);
    }
  });
});
