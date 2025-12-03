import { useCatalogStore } from '../Data/catalog';

interface PricingInput {
  base_mm: number;
  altezza_mm: number;
  qty: number;
  num_orizzontali: number;
  num_verticali: number;
  tipo_canalino: string;
  codice_canalino?: string; // Codice univoco (es. C111)
  isSoloCanalino?: boolean; // Flag per attivare la logica dedicata
  prezzo_unitario_griglia: number;
  prezzo_unitario_canalino: number;
}

// Funzione Helper (invariata)
function getSupplementoPrice(catalog: any, code: string): number {
  if (!catalog.codiciMap) return 0;
  const price = catalog.codiciMap[code.toUpperCase()];
  return price !== undefined ? price : 0;
}

// MAPPA DEI MOLTIPLICATORI PER SOLO CANALINO (Prezzo al metro lineare)
const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5,
  'C112': 2.0,
  'C211': 2.5,
  'C311': 3.0
};

export function calculatePrice(input: PricingInput) {
  const catalog = useCatalogStore();
  
  if (!catalog.isLoaded) return { prezzo_unitario: 0, prezzo_totale: 0 };

  // 1. Normalizzazione Misure (Arrotondamento ai 50mm)
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;

  // Calcolo Metri Lineari del Perimetro (Base + Altezza) * 2
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;

  // --- LOGICA DEDICATA: SOLO CANALINO ---
  if (input.isSoloCanalino) {
    let prezzo_unitario = 0;
    
    if (input.codice_canalino) {
      const code = input.codice_canalino.toUpperCase();
      // Cerchiamo il moltiplicatore nella mappa
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      
      if (moltiplicatore) {
        // Calcolo: Perimetro * Moltiplicatore
        prezzo_unitario = metri_perimetro * moltiplicatore;
      } else {
        console.warn(`Codice canalino '${code}' non trovato nella mappa moltiplicatori.`);
      }
    }
    
    const prezzo_totale = prezzo_unitario * input.qty;
    return { prezzo_unitario, prezzo_totale };
  }
  // --------------------------------------

  // ... SE NON È SOLO CANALINO, PROSEGUE CON LA LOGICA STANDARD ...

  // Sviluppo lineare della griglia
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;
  
  // Determinazione Taglia (S, M, L, XL) basata sul perimetro
  let taglia: 'S' | 'M' | 'L' | 'XL' = 'XL';
  if (metri_perimetro < 2.5) taglia = 'S';
  else if (metri_perimetro < 5.0) taglia = 'M';
  else if (metri_perimetro < 7.5) taglia = 'L';

  // Logica di Complessità
  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1; // INCROCIO
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2; // PARALLELE
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3; // SINGOLA

  // Recupero Costi Accessori
  const costo_setup = metri_griglia < 2.0 ? getSupplementoPrice(catalog, 'S001') : getSupplementoPrice(catalog, 'S002');
  
  const perimetraleCodes: any = {
    'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
    'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' },
  };
  const tipoCanalinoKey = input.tipo_canalino ? input.tipo_canalino.toUpperCase() : '';
  
  let costo_perimetrale = 0;
  if (perimetraleCodes[tipoCanalinoKey]) {
    const codeToFetch = perimetraleCodes[tipoCanalinoKey][taglia];
    costo_perimetrale = getSupplementoPrice(catalog, codeToFetch);
  }

  // Formula Finale del Prezzo Standard
  let prezzo_unitario = 0;

  switch (complessita) {
    case 1: // INCROCIO
      prezzo_unitario = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
      break;
    case 2: // PARALLELE
    case 3: // SINGOLA
      prezzo_unitario = (metri_griglia * input.prezzo_unitario_griglia) + costo_perimetrale + costo_setup;
      break;
    default:
      prezzo_unitario = 0;
      break;
  }
  
  const prezzo_totale = prezzo_unitario * input.qty;

  return { prezzo_unitario, prezzo_totale };
}