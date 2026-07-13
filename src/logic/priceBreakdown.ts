// src/logic/priceBreakdown.ts
//
// Ricostruisce la CATENA che ha prodotto il prezzo di una riga, per mostrarla al
// cliente ("come si compone il prezzo").
//
// Due principi, entrambi non negoziabili:
//
// 1. IL PREZZO SALVATO È LA VERITÀ. Questo modulo non ricalcola il prezzo: lo
//    spiega. Ricostruisce la catena e poi verifica di riottenere il
//    `prezzo_unitario` che sta sulla riga. Se non ci riesce (`riconcilia:
//    false`) NON mostra una scomposizione plausibile e falsa: si limita ai metri
//    e alla tariffa effettiva, che sono sempre veri perché derivano dai dati
//    della riga.
//
// 2. LA RICONCILIAZIONE NON È PARANOIA. I motori possono cambiare sotto i piedi
//    dei preventivi vecchi: la maggiorazione LEALI è stata azzerata il
//    2026-06-26 (era +1,00 €/m), quindi una riga LEALI battuta prima di quella
//    data NON è più riproducibile dal motore di oggi. Su quelle righe la guardia
//    scatta ed è l'unica cosa che ci impedisce di mentire al cliente. Quando
//    arriverà il listino versionato (snapshot di prezzi + regole salvato sul
//    preventivo), questo modulo smetterà di dedurre e comincerà a leggere.

import type { RigaPreventivo } from '../types';
import { metriGriglia, metriPerimetro, roundMm } from './geometry';

// Stessi moltiplicatori dei motori (solo telaio: perimetro × moltiplicatore).
const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5, 'C112': 2.0, 'C211': 2.5, 'C311': 3.0
};

const PERIMETRALE_CODES: Record<string, Record<string, string>> = {
  'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
  'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' },
  'FIBRA':       { S: 'S011', M: 'S012', L: 'S013', XL: 'S014' },
};

export type Regime = 'INCROCIO' | 'PARALLELE' | 'SINGOLA' | 'SOLO_TELAIO' | 'NESSUNA';

export interface VoceSupplemento {
  label: string;
  importo: number;
}

export interface Dettaglio {
  // ① Geometria
  baseInserita: number;
  altezzaInserita: number;
  baseCalcolo: number;
  altezzaCalcolo: number;
  arrotondata: boolean;          // true se il calcolo ha alzato almeno una misura
  verticali: number;
  orizzontali: number;
  metrica: 'sviluppo' | 'perimetro';
  metriPezzo: number;
  quantita: number;
  metriTotali: number;

  // ② Tariffe
  tariffaGriglia: number;
  tariffaCanalino: number;
  tariffaConcordata: boolean;    // profilo senza prezzo di listino → prezzo/m concordato
  descrizioneCanalino: string;

  // ③ Regola
  regime: Regime;
  regimeLabel: string;
  regimeSpiegazione: string;
  moltiplicatore: number | null; // maggiorazione (listino lineare)
  supplementi: VoceSupplemento[];// voci fisse (listino con supplementi)
  taglia: 'S' | 'M' | 'L' | 'XL' | null;

  // ④ Totali
  prezzoPezzo: number;           // quello SALVATO sulla riga
  totaleRiga: number;            // quello SALVATO sulla riga
  tariffaEffettiva: number | null; // totale ÷ metri: il numero che il cliente confronta

  // Guardia
  riconcilia: boolean;           // la catena ricostruita riproduce il prezzo salvato?
  prezzoRicostruito: number;

  // Lavorazioni speciali: NON entrano nel prezzo, sono quotate a parte (riga
  // Supplemento). Le elenchiamo perché il cliente le vede spuntate e si aspetta
  // una spiegazione.
  lavorazioni: string[];
}

const LABEL: Record<Regime, { label: string; spiegazione: string }> = {
  INCROCIO: {
    label: 'Griglia a incrocio',
    spiegazione: 'La griglia ha sia montanti verticali sia traversi orizzontali: le tariffe di griglia e canalino si sommano, senza maggiorazioni.',
  },
  PARALLELE: {
    label: 'Suddivisioni parallele',
    spiegazione: 'Le suddivisioni corrono tutte nella stessa direzione: la lavorazione è meno efficiente e la tariffa viene maggiorata.',
  },
  SINGOLA: {
    label: 'Suddivisione singola',
    spiegazione: 'Una sola suddivisione sull\'intero telaio: è la lavorazione con la resa più bassa e la maggiorazione più alta.',
  },
  SOLO_TELAIO: {
    label: 'Solo telaio',
    spiegazione: 'Nessuna griglia: si paga il canalino perimetrale, quindi il metro di riferimento è il perimetro del telaio.',
  },
  NESSUNA: {
    label: 'Nessuna suddivisione',
    spiegazione: 'Il telaio non ha suddivisioni interne: non c\'è sviluppo di griglia da quotare.',
  },
};

function prezzoDaListino(catalog: any, categoria: string, modello: string, dimensione: string, finitura: string): number {
  return catalog?.listino?.[categoria]?.[modello]?.[dimensione]?.[finitura]?.prezzo || 0;
}

function supplemento(catalog: any, code: string): number {
  const p = catalog?.codiciMap?.[code.toUpperCase()];
  return p !== undefined ? p : 0;
}

/**
 * Costruisce il dettaglio di una riga. Ritorna null per le righe che un prezzo
 * "costruito" non ce l'hanno (EXTRA, spedizioni, supplementi manuali): lì il
 * prezzo è deciso a mano e non c'è nessuna catena da spiegare.
 */
export function costruisciDettaglio(
  r: RigaPreventivo,
  activeList: string,
  catalog: any,
): Dettaglio | null {
  if (r.categoria === 'EXTRA') return null;

  const qty = r.quantita || 1;
  const soloTelaio = r.categoria === 'CANALINO';

  const baseCalcolo = roundMm(r.base_mm);
  const altezzaCalcolo = roundMm(r.altezza_mm);
  const perimetro = metriPerimetro(r.base_mm, r.altezza_mm);
  const sviluppo = metriGriglia({
    base_mm: r.base_mm,
    altezza_mm: r.altezza_mm,
    num_orizzontali: r.colonne,
    num_verticali: r.righe,
  });

  const metriPezzo = soloTelaio ? perimetro : sviluppo;
  const metriTotali = metriPezzo * qty;

  const lavorazioni: string[] = [];
  if (r.curva) lavorazioni.push('Curva');
  if (r.tacca) lavorazioni.push('Tacca');
  if (r.nonEquidistanti) lavorazioni.push('Suddivisioni non equidistanti');

  const comune = {
    baseInserita: r.base_mm,
    altezzaInserita: r.altezza_mm,
    baseCalcolo,
    altezzaCalcolo,
    arrotondata: baseCalcolo !== r.base_mm || altezzaCalcolo !== r.altezza_mm,
    verticali: r.righe,
    orizzontali: r.colonne,
    quantita: qty,
    metriPezzo,
    metriTotali,
    prezzoPezzo: r.prezzo_unitario,
    totaleRiga: r.prezzo_totale,
    tariffaEffettiva: metriTotali > 0 ? r.prezzo_totale / metriTotali : null,
    lavorazioni,
  };

  // --- SOLO TELAIO: perimetro × moltiplicatore del canalino ------------------
  if (soloTelaio) {
    const molt = r.codice ? (MOLTIPLICATORI_SOLO_CANALINO[r.codice.toUpperCase()] ?? 0) : 0;
    const ricostruito = perimetro * molt;
    return {
      ...comune,
      metrica: 'perimetro',
      tariffaGriglia: 0,
      tariffaCanalino: molt,
      tariffaConcordata: false,
      descrizioneCanalino: r.infoCanalino || '',
      regime: 'SOLO_TELAIO',
      regimeLabel: LABEL.SOLO_TELAIO.label,
      regimeSpiegazione: LABEL.SOLO_TELAIO.spiegazione,
      moltiplicatore: null,
      supplementi: [],
      taglia: null,
      riconcilia: Math.abs(ricostruito - r.prezzo_unitario) < 0.005,
      prezzoRicostruito: ricostruito,
    };
  }

  // --- GRIGLIA --------------------------------------------------------------
  // Tariffa griglia: il prezzo/m concordato (profili senza prezzo di listino)
  // vince sul listino, esattamente come nel motore.
  const tariffaConcordata = !!r.customVarPrice && Number(r.customVarPrice) > 0;
  const tariffaGriglia = tariffaConcordata
    ? Number(r.customVarPrice)
    : prezzoDaListino(catalog, r.categoria, r.modello, r.dimensione, r.finitura);

  const tipoCanalino = r.rawCanalino?.tipo || '';
  const tariffaCanalino = r.rawCanalino
    ? prezzoDaListino(catalog, 'CANALINO', r.rawCanalino.tipo, r.rawCanalino.dim, r.rawCanalino.fin)
    : 0;

  // Regime: stessa cascata dei motori (righe = verticali, colonne = orizzontali).
  let regime: Regime = 'NESSUNA';
  if (r.righe > 0 && r.colonne > 0) regime = 'INCROCIO';
  else if ((r.righe > 1 && !r.colonne) || (!r.righe && r.colonne > 1)) regime = 'PARALLELE';
  else if ((r.righe === 1 && !r.colonne) || (!r.righe && r.colonne === 1)) regime = 'SINGOLA';

  // Override: solo orizzontali e nessun canalino → torna alla regola standard.
  const senzaCanalino = !tipoCanalino || tipoCanalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = r.righe === 0 && r.colonne >= 1;
  if (senzaCanalino && soloOrizzontali) regime = 'INCROCIO';

  let taglia: 'S' | 'M' | 'L' | 'XL' | null = null;
  let moltiplicatore: number | null = null;
  const supplementi: VoceSupplemento[] = [];
  let ricostruito = 0;

  const listinoLineare = activeList === '2025-a' || activeList === '2025x' || activeList === '2025-x';

  if (listinoLineare) {
    // Tutto al metro: nessun costo fisso, la lavorazione pesa come maggiorazione.
    // (Il listino "LEALI" oggi non applica alcun rincaro sulle tariffe: la voce
    // esiste nel motore ma vale 0 dal 2026-06-26.)
    const leali = activeList === '2025x' || activeList === '2025-x';
    if (regime === 'PARALLELE') moltiplicatore = 1.2;
    else if (regime === 'SINGOLA') moltiplicatore = leali ? 1.2 : 1.5;

    const tariffaSomma = tariffaGriglia + tariffaCanalino;
    ricostruito = regime === 'NESSUNA' ? 0 : metriPezzo * tariffaSomma * (moltiplicatore ?? 1);
  } else {
    // Listino con costi fissi: incrocio resta al metro puro; parallele e singola
    // pagano attrezzaggio + profilo perimetrale, dimensionati sulla taglia.
    if (perimetro < 2.5) taglia = 'S';
    else if (perimetro < 5.0) taglia = 'M';
    else if (perimetro < 7.5) taglia = 'L';
    else taglia = 'XL';

    if (regime === 'INCROCIO') {
      ricostruito = metriPezzo * (tariffaGriglia + tariffaCanalino);
    } else if (regime === 'PARALLELE' || regime === 'SINGOLA') {
      const setup = sviluppo < 2.0 ? supplemento(catalog, 'S001') : supplemento(catalog, 'S002');
      const codePerimetrale = PERIMETRALE_CODES[tipoCanalino.toUpperCase()]?.[taglia];
      const perimetrale = codePerimetrale ? supplemento(catalog, codePerimetrale) : 0;

      if (setup) supplementi.push({ label: 'Contributo di attrezzaggio', importo: setup });
      if (perimetrale) supplementi.push({ label: `Profilo perimetrale (taglia ${taglia})`, importo: perimetrale });

      ricostruito = (metriPezzo * tariffaGriglia) + perimetrale + setup;
    }
  }

  return {
    ...comune,
    metrica: 'sviluppo',
    tariffaGriglia,
    tariffaCanalino,
    tariffaConcordata,
    descrizioneCanalino: r.infoCanalino || '',
    regime,
    regimeLabel: LABEL[regime].label,
    regimeSpiegazione: LABEL[regime].spiegazione,
    moltiplicatore,
    supplementi,
    taglia,
    riconcilia: Math.abs(ricostruito - r.prezzo_unitario) < 0.005,
    prezzoRicostruito: ricostruito,
  };
}
