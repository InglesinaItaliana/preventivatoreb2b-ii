import { useCatalogStore } from '../Data/catalog';
import { calculateLogic2025 } from './pricing2025'; // <--- Importiamo la logica vecchia
import { calculateLogic2025x } from './pricing2025x';
import { metriGriglia, metriPerimetro } from './geometry';
import type { RigaPricing, TariffaPricing, SupplementoPricing } from '../types';
import { pricingSoloTelaio, regimeDaComplessita } from './listini';

// Esportiamo l'interfaccia così la può usare anche il file 2025
export interface PricingInput {
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

/**
 * Risultato del calcolo. `pricing` è lo SCONTRINO della catena che ha prodotto
 * il prezzo (v. RigaPricing in types.ts): viene congelato sulla riga, così fra
 * sei mesi il prezzo si spiega leggendo invece di dedurlo con il motore di
 * allora. È opzionale solo perché manca quando il catalogo non è ancora carico
 * (prezzo 0, niente da spiegare).
 */
export interface PricingResult {
  prezzo_unitario: number;
  prezzo_totale: number;
  pricing?: RigaPricing;
}

// Funzione Helper (invariata)
function getSupplementoPrice(catalog: any, code: string): number {
  if (!catalog.codiciMap) return 0;
  const price = catalog.codiciMap[code.toUpperCase()];
  return price !== undefined ? price : 0;
}

// MAPPA DEI MOLTIPLICATORI PER SOLO CANALINO
const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5,
  'C112': 2.0,
  'C211': 2.5,
  'C311': 3.0
};

/**
 * LOGICA 2026 (Attuale Standard)
 * Questa funzione contiene esattamente la logica che avevi prima.
 */
function calculateLogic2026(input: PricingInput, catalog: any): PricingResult {
  // 1. Metri lineari del perimetro (misure arrotondate ai 50mm dentro geometry.ts)
  const metri_perimetro = metriPerimetro(input.base_mm, input.altezza_mm);

  // --- LOGICA DEDICATA: SOLO CANALINO ---
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
      pricing: pricingSoloTelaio(metri_perimetro, input.codice_canalino, moltiplicatoreUsato, '2026-a'),
    };
  }
  // --------------------------------------

  // Sviluppo lineare della griglia
  const metri_griglia = metriGriglia(input);

  // Determinazione Taglia (S, M, L, XL)
  let taglia: 'S' | 'M' | 'L' | 'XL' = 'XL';
  if (metri_perimetro < 2.5) taglia = 'S';
  else if (metri_perimetro < 5.0) taglia = 'M';
  else if (metri_perimetro < 7.5) taglia = 'L';

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
  const codice_setup = metri_griglia < 2.0 ? 'S001' : 'S002';
  const costo_setup = getSupplementoPrice(catalog, codice_setup);
  
  const perimetraleCodes: any = {
    'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
    'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' },
    'FIBRA':       { S: 'S011', M: 'S012', L: 'S013', XL: 'S014' },
  };
  const tipoCanalinoKey = input.tipo_canalino ? input.tipo_canalino.toUpperCase() : '';
  
  let costo_perimetrale = 0;
  let codice_perimetrale = '';
  if (perimetraleCodes[tipoCanalinoKey]) {
    const codeToFetch = perimetraleCodes[tipoCanalinoKey][taglia];
    codice_perimetrale = codeToFetch;
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

  // --- SCONTRINO --------------------------------------------------------
  // Le voci qui sotto sono le stesse che hanno appena fatto il prezzo: si
  // registrano, non si ricalcolano. La somma la rifà ricostruisciPrezzoUnitario()
  // e un test pretende che coincida con `prezzo_unitario` su tutta la matrice.
  const tariffe: TariffaPricing[] = [];
  const supplementi: SupplementoPricing[] = [];

  if (complessita === 1 || complessita === 0) {
    // (complessita 0 = nessuna suddivisione: i metri sono 0, quindi le tariffe
    //  registrate non spostano il prezzo, ma restano quelle applicabili.)
    tariffe.push({ tipo: 'griglia', valore: input.prezzo_unitario_griglia });
    if (input.prezzo_unitario_canalino) {
      tariffe.push({ tipo: 'canalino', valore: input.prezzo_unitario_canalino });
    }
  } else if (complessita === 2 || complessita === 3) {
    // Nel 2026 le suddivisioni in una sola direzione non prendono maggiorazioni:
    // il canalino esce dal conto al metro e rientra come profilo perimetrale a
    // forfait, più il contributo di attrezzaggio.
    tariffe.push({ tipo: 'griglia', valore: input.prezzo_unitario_griglia });
    // Ordine: come le mostra la modale (prima l'attrezzaggio, poi il profilo).
    if (costo_setup) supplementi.push({ tipo: 'attrezzaggio', codice: codice_setup, importo: costo_setup });
    if (costo_perimetrale) supplementi.push({ tipo: 'perimetrale', codice: codice_perimetrale, importo: costo_perimetrale });
  }

  return {
    prezzo_unitario,
    prezzo_totale,
    pricing: {
      listino: '2026-a',
      regime: regimeDaComplessita(complessita),
      metrica: 'sviluppo',
      metriPezzo: metri_griglia,
      tariffe,
      maggiorazionePct: null,
      supplementi,
      taglia,
    },
  };
}

/**
 * MAIN CALCULATOR (DISPATCHER)
 * Riceve l'input e il nome del listino, decide chi deve fare i calcoli.
 */
export function calculatePrice(input: PricingInput, activeList: string = '2026-a'): PricingResult {
  const catalog = useCatalogStore();
  
  if (!catalog.isLoaded) return { prezzo_unitario: 0, prezzo_totale: 0 };

  // 1. SE È IL LISTINO VECCHIO -> Delega al file esterno
  // NB: tolleriamo sia '2025x' (pricelistOptions globale) sia '2025-x' (valore
  // salvato dal modale cliente, opzione "LEALI") — erano disallineati e i clienti
  // LEALI cadevano nel default 2026 (prezzo sbagliato).
  if (activeList === '2025x' || activeList === '2025-x') {
    return calculateLogic2025x(input);
  }

  if (activeList === '2025-a') {
    return calculateLogic2025(input);
  }

  // 2. DEFAULT (2026-a o sconosciuto) -> Usa logica interna
  return calculateLogic2026(input, catalog);
}