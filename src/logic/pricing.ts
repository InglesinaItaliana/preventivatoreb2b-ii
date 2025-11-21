import { useCatalogStore } from '../Data/catalog';

interface PricingInput {
  base_mm: number;
  altezza_mm: number;
  qty: number;
  num_orizzontali: number;
  num_verticali: number;
  tipo_canalino: string; // Es: "ALLUMINIO" o "BORDO CALDO"
  prezzo_unitario_griglia: number;
  prezzo_unitario_canalino: number;
}

// Funzione Helper per recuperare il prezzo navigando l'albero dinamico
// Cerca dentro: SUPPLEMENTI -> Codice (es. S001) -> Qualsiasi Dim -> Qualsiasi Fin -> Prezzo
// Funzione Semplificata: Cerca direttamente per CODICE
function getSupplementoPrice(catalog: any, code: string): number {
  if (!catalog.codiciMap) return 0;
  
  // Cerca il codice (assicurandosi che sia maiuscolo)
  const price = catalog.codiciMap[code.toUpperCase()];
  
  if (price === undefined) {
    console.warn(`Codice supplemento '${code}' non trovato nel CSV.`);
    return 0;
  }
  
  return price;
}

export function calculatePrice(input: PricingInput) {
  const catalog = useCatalogStore();
  
  // Controllo sicurezza
  if (!catalog.isLoaded) return { prezzo_unitario: 0, prezzo_totale: 0 };

  // 1. Normalizzazione Misure (Arrotondamento ai 50mm)
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;

  // 2. Calcolo Metrico
  // Sviluppo lineare della griglia
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;
  // Sviluppo perimetrale del canalino
  const metri_canalino = ((base_round * 2) + (altezza_round * 2)) / 1000;

  // Determinazione Taglia (S, M, L, XL)
  let taglia: 'S' | 'M' | 'L' | 'XL' = 'XL';
  if (metri_canalino < 2.5) taglia = 'S';
  else if (metri_canalino < 5.0) taglia = 'M';
  else if (metri_canalino < 7.5) taglia = 'L';

  // 3. Logica di Complessità
  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) {
    complessita = 1; // INCROCIO
  } else if ((input.num_verticali > 1 && input.num_orizzontali === 0) || (input.num_verticali === 0 && input.num_orizzontali > 1)) {
    complessita = 2; // PARALLELE MULTIPLE
  } else if ((input.num_verticali === 1 && input.num_orizzontali === 0) || (input.num_verticali === 0 && input.num_orizzontali === 1)) {
    complessita = 3; // SINGOLA SBARRA
  }

  // 4. Recupero Costi Accessori (Per Complessità 2 e 3)
  
  // A. Costo Allestimento Telaio
  const costo_setup = metri_griglia < 2.0 
    ? getSupplementoPrice(catalog, 'S001') 
    : getSupplementoPrice(catalog, 'S002');

  // B. Costo Materiale Perimetrale (Spacer)
  // Mappa codici corretti (assicurati che nel CSV ci siano questi codici S003...S010 sotto CATEGORIA=SUPPLEMENTI)
  const perimetraleCodes: any = {
    'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
    'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' }, // Nota lo spazio!
  };
  
  // Normalizziamo il tipo canalino per evitare errori (es. "Bordo Caldo" -> "BORDO CALDO")
  const tipoCanalinoKey = input.tipo_canalino ? input.tipo_canalino.toUpperCase() : '';
  
  let costo_perimetrale = 0;
  if (perimetraleCodes[tipoCanalinoKey]) {
    const codeToFetch = perimetraleCodes[tipoCanalinoKey][taglia];
    costo_perimetrale = getSupplementoPrice(catalog, codeToFetch);
  } else {
    console.warn(`Tipo canalino '${input.tipo_canalino}' non mappato nei codici supplementari.`);
  }

  // 5. Formula Finale del Prezzo
  let prezzo_unitario = 0;

  switch (complessita) {
    case 1: // INCROCIO: Metri totali x (Prezzo Griglia + Prezzo Canalino Lineare)
      prezzo_unitario = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
      break;

    case 2: // PARALLELE
    case 3: // SINGOLA
      // Formula: (Metri Griglia * Prezzo Griglia) + Costo Fisso Perimetrale + Costo Setup
      prezzo_unitario = (metri_griglia * input.prezzo_unitario_griglia) + costo_perimetrale + costo_setup;
      break;

    default:
      // Nessuna griglia (Solo telaio vuoto? Opzionale)
      prezzo_unitario = 0;
      break;
  }
  
  const prezzo_totale = prezzo_unitario * input.qty;

  return { prezzo_unitario, prezzo_totale };
}