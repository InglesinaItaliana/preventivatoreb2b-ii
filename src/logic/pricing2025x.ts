// src/logic/pricing2025x.ts

import { useCatalogStore } from '../Data/catalog';
import type { PricingInput, PricingResult } from './pricing';
import type { TariffaPricing } from '../types';
import { metriGriglia, metriPerimetro } from './geometry';
import { pricingSoloTelaio, regimeDaComplessita, tariffeLeali } from './listini';

const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5, 'C112': 2.0, 'C211': 2.5, 'C311': 3.0
};

export function calculateLogic2025x(input: PricingInput): PricingResult {
  const catalog = useCatalogStore();
  if (!catalog.isLoaded) return { prezzo_unitario: 0, prezzo_totale: 0 };

  // Metri lineari (misure arrotondate ai 50mm dentro geometry.ts)
  const metri_perimetro = metriPerimetro(input.base_mm, input.altezza_mm);
  const metri_griglia = metriGriglia(input);

  if (input.isSoloCanalino) {
    let prezzo_unitario = 0;
    let moltiplicatoreUsato = 0;
    
    if (input.codice_canalino) {
      const code = input.codice_canalino.toUpperCase();
      const moltiplicatore = MOLTIPLICATORI_SOLO_CANALINO[code];
      
      if (moltiplicatore) {
        prezzo_unitario = metri_perimetro * moltiplicatore;
        moltiplicatoreUsato = moltiplicatore;
      }
    }
    
    const prezzo_totale = prezzo_unitario * input.qty;
    return {
      prezzo_unitario,
      prezzo_totale,
      pricing: pricingSoloTelaio(metri_perimetro, input.codice_canalino, moltiplicatoreUsato, '2025x'),
    };
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
 

  // --- MAGGIORAZIONE LEALI (+€/ml su griglia e canalino) ---
  // La leva, la sua storia e la regola del canalino mancante stanno in
  // listini.ts, condivise con la lente del prezzo: qui si applicano e basta.
  // `input.maggiorazioneLeali` è quella congelata sul preventivo che si sta
  // quotando; assente = leva di oggi (v. PricingInput).
  const t = tariffeLeali(
    input.prezzo_unitario_griglia,
    input.prezzo_unitario_canalino,
    senzaCanalino,
    input.maggiorazioneLeali,
  );
  const tariffaSomma = t.griglia + t.canalino;
  // ----------------------------------------

  // --- CALCOLO FINALE (Usando le tariffe maggiorate) ---
  let prezzo_unitario = 0;

  switch (complessita) {
    case 1: // INCROCIO
      prezzo_unitario = metri_griglia * tariffaSomma;
      break;
    case 2: // PARALLELE
        prezzo_unitario = (metri_griglia * (tariffaSomma * 1.2));
      break;
    case 3: // SINGOLA
      prezzo_unitario = (metri_griglia * (tariffaSomma * 1.2));
      break;
    default:
      prezzo_unitario = 0;
      break;
  }

  const prezzo_totale = prezzo_unitario * input.qty;

  // --- SCONTRINO ---
  // Le tariffe registrate sono quelle EFFETTIVAMENTE usate, cioè comprensive
  // della maggiorazione LEALI: lo scontrino resta vero qualunque valore abbia
  // la leva, e resta vero anche dopo che la leva cambia ancora.
  const tariffe: TariffaPricing[] = [{ tipo: 'griglia', valore: t.griglia }];
  if (t.canalino) tariffe.push({ tipo: 'canalino', valore: t.canalino });

  return {
    prezzo_unitario,
    prezzo_totale,
    pricing: {
      listino: '2025x',
      regime: regimeDaComplessita(complessita),
      metrica: 'sviluppo',
      metriPezzo: metri_griglia,
      tariffe,
      maggiorazionePct: complessita === 2 || complessita === 3 ? 20 : null,
      supplementi: [],
      taglia: null,
    },
  };
}