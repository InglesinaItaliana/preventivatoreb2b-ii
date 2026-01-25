// src/logic/pricing2025x.ts

import { useCatalogStore } from '../Data/catalog';
import type { PricingInput } from './pricing'; 

const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5, 'C112': 2.0, 'C211': 2.5, 'C311': 3.0
};

export function calculateLogic2025x(input: PricingInput) {
  const catalog = useCatalogStore();
  if (!catalog.isLoaded) return { prezzo_unitario: 0, prezzo_totale: 0 };

  // --- PUNTO CHIAVE: MAGGIORAZIONE DI 1€ ---
  // Definiamo i nuovi prezzi base unitari
  const pGrigliaAumentato = input.prezzo_unitario_griglia + 1.00;
  const pCanalinoAumentato = input.prezzo_unitario_canalino + 1.00;
  // ----------------------------------------

  // Normalizzazione Misure
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;

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
  
  // Logica Complessità
  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1; 
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2; 
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3; 

  // --- OVERRIDE: GRIGLIA SOLO ORIZZONTALE SENZA CANALINO ---
  // Se non c'è canalino (campo vuoto o "NESSUNO") e ci sono solo orizzontali (1 o più), forziamo la logica standard (no maggiorazione)
  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;

  if (senzaCanalino && soloOrizzontali) {
    complessita = 1;
  }
  // ----------------------------------------------------------
  
  // Costi Accessori
 

  // --- CALCOLO FINALE (Usando le variabili aumentate) ---
  let prezzo_unitario = 0;

  switch (complessita) {
    case 1: // INCROCIO
      prezzo_unitario = metri_griglia * (pGrigliaAumentato + pCanalinoAumentato);
      break;
    case 2: // PARALLELE
        prezzo_unitario = (metri_griglia * ((pGrigliaAumentato + pCanalinoAumentato)* 1.2));
      break;
    case 3: // SINGOLA
      prezzo_unitario = (metri_griglia * ((pGrigliaAumentato + pCanalinoAumentato)* 1.2));
      break;
    default:
      prezzo_unitario = 0;
      break;
  }

  const prezzo_totale = prezzo_unitario * input.qty;
  return { prezzo_unitario, prezzo_totale };
}