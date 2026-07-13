// src/logic/griglie/progetto.ts
//
// La geometria dei pannelli-griglia. Modulo PURO: nessun Vue, nessun Firestore.
// Da qui escono i numeri con cui l'officina taglia il metallo — l'anteprima e le
// distinte leggono entrambe da qui, così il disegno non può mostrare una cosa
// diversa da quella che viene tagliata.
//
// Tutto in millimetri.

import {
  PROFILO_U, BARRA, FONDO_CANALE, SPESSORE_PANNELLO,
} from './materiali';

export type Stile = 'LONDRA' | 'MILANO' | 'VENEZIA';

export interface ConfigGriglia {
  stile: Stile;
  larghezza: number;          // ingombro ESTERNO
  altezza: number;            // ingombro ESTERNO
  passoOrizzontale: number;   // interasse fra le barre verticali
  passoVerticale: number;     // interasse fra le barre orizzontali
  quantita: number;           // telai identici
  gioco: number;              // mm per lato: infilaggio della barra nel canale
  margineMinimo: number;      // mm fra il filo interno della cornice e il bordo dell'ultima barra
  conBordo: boolean;          // false = griglia nuda, senza telaio perimetrale
}

/** Un pezzo del telaio (profilo a U). */
export interface PezzoBordo {
  etichetta: string;
  lunghezza: number;          // sul lato lungo del quartabuono
  quantitaPerTelaio: number;
  taglio: string;
}

/** Una barra della griglia, con il suo schema di foratura. */
export interface PezzoBarra {
  etichetta: string;
  lunghezza: number;
  quantitaPerTelaio: number;
  taglio: string;
  primoForo: number;          // dalla testa della barra
  interasse: number;          // costante fra un foro e il successivo
  nFori: number;
  posizioni: number[];        // tutti i fori, dalla testa della barra
}

export interface Progetto {
  config: ConfigGriglia;

  // Geometria d'insieme
  luceX: number;              // luce interna in larghezza (fra i fili interni della cornice)
  luceY: number;
  margineX: number;           // dal filo interno della cornice al bordo della prima barra verticale
  margineY: number;
  assiVerticali: number[];    // x degli assi delle barre verticali, dal filo ESTERNO
  assiOrizzontali: number[];  // y degli assi delle barre orizzontali, dal filo ESTERNO
  latoTelaio: number;         // 0 se senza bordo perimetrale
  testa: number;              // da dove parte la barra, dal filo esterno (0 se senza bordo)
  spessorePannello: number;   // col telaio = 20; senza = due barre sovrapposte = 16

  // Distinte
  bordi: PezzoBordo[];
  barre: PezzoBarra[];
  nRivetti: number;           // un rivetto per incrocio

  // Materiale (metri lineari EFFETTIVI nel pannello, non le stecche da comprare)
  metriU: number;             // per telaio
  metriBarra: number;         // per telaio

  avvisi: string[];
}

/**
 * Quante barre entrano in una luce, a passo fisso e griglia CENTRATA, e dove
 * cadono i loro assi.
 *
 * La regola concordata: il passo comanda, la griglia si centra, e il margine
 * che avanza è quello che viene (purché non scenda sotto il minimo).
 */
function distribuisci(
  ingombro: number,
  margineMinimo: number,
  passo: number,
  latoTelaio: number,
): { n: number; assi: number[]; margine: number; luce: number } {
  const luce = ingombro - 2 * latoTelaio;
  const mezzaBarra = BARRA.larghezza / 2;

  // Spazio in cui possono cadere gli ASSI: la barra più esterna deve restare
  // dentro la luce, staccata almeno del margine minimo dalla cornice.
  // Senza telaio (latoTelaio = 0) la luce è tutto il pannello.
  const primoAsseMin = latoTelaio + margineMinimo + mezzaBarra;
  const ultimoAsseMax = ingombro - latoTelaio - margineMinimo - mezzaBarra;
  const corsa = ultimoAsseMax - primoAsseMin;

  if (corsa < 0 || passo <= 0) return { n: 0, assi: [], margine: 0, luce };

  const n = Math.floor(corsa / passo) + 1;
  const span = (n - 1) * passo;
  const primoAsse = ingombro / 2 - span / 2; // centrata sul pannello

  const assi: number[] = [];
  for (let i = 0; i < n; i++) assi.push(primoAsse + i * passo);

  const margine = (primoAsse - mezzaBarra) - latoTelaio;
  return { n, assi, margine, luce };
}

function calcolaLondra(c: ConfigGriglia): Progetto {
  const avvisi: string[] = [];

  // Senza bordo perimetrale: niente telaio, niente canale, niente rientro.
  // La griglia è nuda e la barra vale l'ingombro pieno.
  const latoTelaio = c.conBordo ? PROFILO_U.lato : 0;
  const testa = c.conBordo ? FONDO_CANALE + c.gioco : 0;

  // Le barre VERTICALI si distribuiscono in larghezza (passo orizzontale) e
  // corrono in altezza. E viceversa.
  const vert = distribuisci(c.larghezza, c.margineMinimo, c.passoOrizzontale, latoTelaio);
  const oriz = distribuisci(c.altezza, c.margineMinimo, c.passoVerticale, latoTelaio);

  // Con il bordo, la barra va a battuta sul fondo del canale meno il gioco.
  const lunghezzaVerticale = c.altezza - 2 * testa;
  const lunghezzaOrizzontale = c.larghezza - 2 * testa;

  // I fori cadono sugli incroci. Su una barra verticale, il foro k sta
  // sull'asse della k-esima barra orizzontale — misurato dalla TESTA della barra,
  // che è infilata nel canale e quindi non parte dal filo esterno del pannello.
  const foriSuVerticale = oriz.assi.map((y) => y - testa);
  const foriSuOrizzontale = vert.assi.map((x) => x - testa);

  const bordi: PezzoBordo[] = c.conBordo ? [
    { etichetta: 'Montante orizzontale (sopra/sotto)', lunghezza: c.larghezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
    { etichetta: 'Montante verticale (dx/sx)', lunghezza: c.altezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
  ] : [];

  const barre: PezzoBarra[] = [];
  if (vert.n > 0) {
    barre.push({
      etichetta: 'Barra verticale',
      lunghezza: lunghezzaVerticale,
      quantitaPerTelaio: vert.n,
      taglio: '90°',
      primoForo: foriSuVerticale[0] ?? 0,
      interasse: c.passoVerticale,
      nFori: oriz.n,
      posizioni: foriSuVerticale,
    });
  }
  if (oriz.n > 0) {
    barre.push({
      etichetta: 'Barra orizzontale',
      lunghezza: lunghezzaOrizzontale,
      quantitaPerTelaio: oriz.n,
      taglio: '90°',
      primoForo: foriSuOrizzontale[0] ?? 0,
      interasse: c.passoOrizzontale,
      nFori: vert.n,
      posizioni: foriSuOrizzontale,
    });
  }

  // --- Controlli che salvano materiale -------------------------------------
  if (vert.n === 0 || oriz.n === 0) {
    avvisi.push('Con questo passo non entra nessuna barra: riduci il passo o aumenta le misure del pannello.');
  }
  if (lunghezzaVerticale > BARRA.stecca || lunghezzaOrizzontale > BARRA.stecca) {
    avvisi.push(`Una barra supera i ${BARRA.stecca / 1000} m della stecca commerciale: il pezzo non è ricavabile intero.`);
  }
  if (c.conBordo && (c.larghezza > PROFILO_U.stecca || c.altezza > PROFILO_U.stecca)) {
    avvisi.push(`Un lato del telaio supera i ${PROFILO_U.stecca / 1000} m della stecca di profilo a U.`);
  }
  if (!c.conBordo) {
    avvisi.push('Senza bordo perimetrale: le barre restano a vista e la griglia è centrata sull\'ingombro. Se le barre esterne devono invece stare a filo del bordo, il passo non può essere rispettato esattamente — dimmelo e cambio la regola.');
  }
  if (vert.n > 0 && vert.margine < c.margineMinimo - 0.001) {
    avvisi.push('Il margine laterale è sotto il minimo impostato.');
  }
  if (oriz.n > 0 && oriz.margine < c.margineMinimo - 0.001) {
    avvisi.push('Il margine verticale è sotto il minimo impostato.');
  }

  const metriU = c.conBordo ? (2 * c.larghezza + 2 * c.altezza) / 1000 : 0;
  const metriBarra = (vert.n * lunghezzaVerticale + oriz.n * lunghezzaOrizzontale) / 1000;

  return {
    config: c,
    luceX: vert.luce,
    luceY: oriz.luce,
    margineX: vert.margine,
    margineY: oriz.margine,
    assiVerticali: vert.assi,
    assiOrizzontali: oriz.assi,
    latoTelaio,
    testa,
    // Senza telaio il pannello è spesso quanto due barre sovrapposte, non quanto la U.
    spessorePannello: c.conBordo ? SPESSORE_PANNELLO : BARRA.spessore * 2,
    bordi,
    barre,
    nRivetti: vert.n * oriz.n,
    metriU,
    metriBarra,
    avvisi,
  };
}

export function calcolaProgetto(c: ConfigGriglia): Progetto {
  switch (c.stile) {
    case 'LONDRA':
      return calcolaLondra(c);
    default:
      // MILANO e VENEZIA (griglie a rombi) arrivano dopo la validazione di LONDRA
      // in officina: la matematica delle diagonali si appoggia a questo modello,
      // e conviene sapere che il modello è giusto prima di costruirci sopra.
      throw new Error(`Stile ${c.stile} non ancora implementato`);
  }
}

/** Peso e ingombro di una fornitura di N telai identici. */
export function calcolaImballaggio(p: Progetto, pesoBarraKgM: number | null) {
  const n = p.config.quantita;
  const pesoU = p.metriU * PROFILO_U.pesoKgM;
  const pesoBarre = pesoBarraKgM !== null ? p.metriBarra * pesoBarraKgM : null;
  const pesoTelaio = pesoBarre !== null ? pesoU + pesoBarre : null;

  return {
    pesoU,
    pesoBarre,
    pesoTelaio,
    pesoTotale: pesoTelaio !== null ? pesoTelaio * n : null,
    ingombro: {
      larghezza: p.config.larghezza,
      altezza: p.config.altezza,
      spessore: p.spessorePannello * n,
    },
  };
}
