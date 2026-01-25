// src/logic/pricing2025.ts

import { useCatalogStore } from '../Data/catalog';
import type { PricingInput } from './pricing'; 

// --- HELPER E COSTANTI (Duplicati qui per mantenere il file indipendente) ---

const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5,
  'C112': 2.0,
  'C211': 2.5,
  'C311': 3.0
};

// --- LOGICA DI CALCOLO 2025 (Identica alla 2026 per ora) ---

export function calculateLogic2025(input: PricingInput) {
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
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      
      if (moltiplicatore) {
        prezzo_unitario = metri_perimetro * moltiplicatore;
      }
    }
    
    const prezzo_totale = prezzo_unitario * input.qty;
    return { prezzo_unitario, prezzo_totale };
  }
  // --------------------------------------

  // Sviluppo lineare della griglia
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;

  // Logica di Complessità
  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1; // INCROCIO
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2; // PARALLELE
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3; // SINGOLA

  // --- OVERRIDE: GRIGLIA SOLO ORIZZONTALE SENZA CANALINO ---
  // Se non c'è canalino (campo vuoto o "NESSUNO") e ci sono solo orizzontali (1 o più), forziamo la logica standard (no maggiorazione)
  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;

  if (senzaCanalino && soloOrizzontali) {
    complessita = 1;
  }
  // ----------------------------------------------------------

  // Recupero Costi Accessori
  

  // Formula Finale del Prezzo Standard
  let prezzo_unitario = 0;

  switch (complessita) {
    case 1: // INCROCIO
      prezzo_unitario = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
      break;
    case 2: // PARALLELE
        prezzo_unitario = (metri_griglia * ((input.prezzo_unitario_griglia + input.prezzo_unitario_canalino)* 1.2));
      break;
    case 3: // SINGOLA
      prezzo_unitario = (metri_griglia * ((input.prezzo_unitario_griglia + input.prezzo_unitario_canalino)* 1.5));
      break;
    default:
      prezzo_unitario = 0;
      break;
  }
  
  const prezzo_totale = prezzo_unitario * input.qty;

  return { prezzo_unitario, prezzo_totale };
}