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
import { calcolaDiagonale, type Punto } from './diagonale';

export type Stile = 'LONDRA' | 'MILANO' | 'VENEZIA';

/**
 * Due modi di distribuire le barre, per due esigenze opposte.
 *
 * PASSO_FISSO — l'interasse chiesto viene rispettato ESATTAMENTE, la griglia si
 *   centra, e il vuoto contro il bordo è quello che avanza (diverso da quelli
 *   interni). Serve quando il passo è un vincolo: pannelli affiancati che devono
 *   continuarsi l'uno nell'altro, o un interasse imposto dal cliente.
 *
 * SPAZI_UGUALI — tutti i vuoti IDENTICI, quello contro il bordo compreso. Qui
 *   l'interasse non è un dato ma una conseguenza: lo decide la geometria del
 *   pannello. Serve quando il pannello vive da solo e deve essere regolare.
 *   Il passo chiesto diventa un desiderata: si sceglie il numero di barre che ci
 *   va più vicino, poi si ridistribuisce in parti uguali.
 */
export type Distribuzione = 'PASSO_FISSO' | 'SPAZI_UGUALI';

export interface ConfigGriglia {
  stile: Stile;
  distribuzione: Distribuzione;
  larghezza: number;          // ingombro ESTERNO
  altezza: number;            // ingombro ESTERNO
  passoOrizzontale: number;   // interasse fra le barre verticali (desiderato, in SPAZI_UGUALI)
  passoVerticale: number;     // interasse fra le barre orizzontali (idem)
  quantita: number;           // telai identici
  gioco: number;              // mm per lato: infilaggio della barra nel canale
  margineMinimo: number;      // vuoto minimo ammesso contro il bordo
  conBordo: boolean;          // false = griglia nuda, senza telaio perimetrale
  lunghezzaMinima: number;    // sotto questa, la barretta d'angolo (rombi) si omette
  nBarreVerticali?: number | null;   // forzatura manuale del numero di barre (SPAZI_UGUALI)
  nBarreOrizzontali?: number | null;
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
  codaForo: number;           // dall'ultimo foro alla coda. Sulle diagonali ≠ primoForo:
                              // la barra NON è simmetrica e va montata per il verso giusto.
}

/** Una barra sul disegno: un segmento che l'anteprima ingrossa a 18 mm. */
export interface SegmentoBarra {
  x1: number; y1: number;
  x2: number; y2: number;
  famiglia: 'V' | 'O' | 'A' | 'B';   // decide la tinta (le due famiglie si distinguono)
  tipo: string;                      // etichetta del pezzo in distinta: serve all'hover
}

export interface Progetto {
  config: ConfigGriglia;

  // Geometria d'insieme
  luceX: number;              // luce interna in larghezza (fra i fili interni della cornice)
  luceY: number;
  margineX: number;           // vuoto contro il bordo (dal filo interno della cornice al bordo della prima barra)
  margineY: number;
  vuotoX: number;             // vuoto fra due barre verticali contigue (la luce che si vede)
  vuotoY: number;
  passoEffettivoX: number;    // interasse REALE (in SPAZI_UGUALI ≠ da quello chiesto)
  passoEffettivoY: number;
  assiVerticali: number[];    // x degli assi delle barre verticali, dal filo ESTERNO
  assiOrizzontali: number[];  // y degli assi delle barre orizzontali, dal filo ESTERNO
  latoTelaio: number;         // 0 se senza bordo perimetrale
  testa: number;              // da dove parte la barra, dal filo esterno (0 se senza bordo)
  spessorePannello: number;   // col telaio = 20; senza = due barre sovrapposte = 16

  // Disegno: unico per tutti gli stili, così l'anteprima non deve sapere quale sta guardando
  disegno: { barre: SegmentoBarra[]; rivetti: Punto[] };

  // Distinte
  bordi: PezzoBordo[];
  barre: PezzoBarra[];
  nRivetti: number;           // un rivetto per incrocio
  barreScartate: number;      // barrette d'angolo omesse (rombi): troppo corte o senza incroci

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
interface Distribuita {
  n: number;
  assi: number[];
  margine: number;   // vuoto contro il bordo (dal filo interno del telaio al bordo della barra)
  vuoto: number;     // vuoto fra due barre contigue (luce netta, quella che si vede)
  passo: number;     // interasse EFFETTIVO (in SPAZI_UGUALI è derivato, non quello chiesto)
  luce: number;
}

const VUOTA: Distribuita = { n: 0, assi: [], margine: 0, vuoto: 0, passo: 0, luce: 0 };

/**
 * PASSO_FISSO: il passo comanda, la griglia si centra, il margine è quello che avanza.
 */
function distribuisciAPasso(
  ingombro: number, margineMinimo: number, passo: number, latoTelaio: number,
): Distribuita {
  const luce = ingombro - 2 * latoTelaio;
  const mezzaBarra = BARRA.larghezza / 2;

  const primoAsseMin = latoTelaio + margineMinimo + mezzaBarra;
  const ultimoAsseMax = ingombro - latoTelaio - margineMinimo - mezzaBarra;
  const corsa = ultimoAsseMax - primoAsseMin;

  if (corsa < 0 || passo <= 0) return { ...VUOTA, luce };

  const n = Math.floor(corsa / passo) + 1;
  const span = (n - 1) * passo;
  const primoAsse = ingombro / 2 - span / 2; // centrata sul pannello

  const assi: number[] = [];
  for (let i = 0; i < n; i++) assi.push(primoAsse + i * passo);

  return {
    n, assi,
    margine: (primoAsse - mezzaBarra) - latoTelaio,
    vuoto: passo - BARRA.larghezza,
    passo,
    luce,
  };
}

/**
 * SPAZI_UGUALI: n barre dividono la luce in n+1 vuoti TUTTI IDENTICI — quello
 * contro il bordo vale quanto quelli interni. Il vuoto è la luce che si vede,
 * cioè da bordo a bordo di barra:
 *
 *     luce = (n + 1) × vuoto + n × larghezza_barra
 *
 * Il passo chiesto è solo un desiderata: si prende l'n che produce l'interasse
 * più vicino. (Con nForzato si salta la scelta e si usa quello.)
 */
function distribuisciAVuotiUguali(
  ingombro: number, vuotoMinimo: number, passoDesiderato: number, latoTelaio: number,
  nForzato?: number | null,
): Distribuita {
  const luce = ingombro - 2 * latoTelaio;
  const larghezza = BARRA.larghezza;
  const mezzaBarra = larghezza / 2;

  const vuotoDi = (n: number) => (luce - n * larghezza) / (n + 1);

  // n ammissibili: il vuoto che ne esce non deve scendere sotto il minimo.
  const nMax = Math.floor((luce - vuotoMinimo) / (larghezza + vuotoMinimo));
  if (nMax < 1 || passoDesiderato <= 0) return { ...VUOTA, luce };

  let n: number;
  if (nForzato != null) {
    n = Math.max(1, Math.min(nMax, Math.round(nForzato)));
  } else {
    // L'interasse prodotto da n barre è vuoto(n) + larghezza: prendiamo l'n che
    // avvicina di più il passo chiesto.
    n = 1;
    let scarto = Infinity;
    for (let k = 1; k <= nMax; k++) {
      const s = Math.abs((vuotoDi(k) + larghezza) - passoDesiderato);
      if (s < scarto) { scarto = s; n = k; }
    }
  }

  const vuoto = vuotoDi(n);
  const passo = vuoto + larghezza;
  const primoAsse = latoTelaio + vuoto + mezzaBarra;

  const assi: number[] = [];
  for (let i = 0; i < n; i++) assi.push(primoAsse + i * passo);

  return { n, assi, margine: vuoto, vuoto, passo, luce };
}

function distribuisci(
  c: ConfigGriglia, ingombro: number, passo: number, latoTelaio: number, nForzato?: number | null,
): Distribuita {
  return c.distribuzione === 'SPAZI_UGUALI'
    ? distribuisciAVuotiUguali(ingombro, c.margineMinimo, passo, latoTelaio, nForzato)
    : distribuisciAPasso(ingombro, c.margineMinimo, passo, latoTelaio);
}

function calcolaLondra(c: ConfigGriglia): Progetto {
  const avvisi: string[] = [];

  // Senza bordo perimetrale: niente telaio, niente canale, niente rientro.
  // La griglia è nuda e la barra vale l'ingombro pieno.
  const latoTelaio = c.conBordo ? PROFILO_U.lato : 0;
  const testa = c.conBordo ? FONDO_CANALE + c.gioco : 0;

  // Le barre VERTICALI si distribuiscono in larghezza (passo orizzontale) e
  // corrono in altezza. E viceversa.
  const vert = distribuisci(c, c.larghezza, c.passoOrizzontale, latoTelaio, c.nBarreVerticali);
  const oriz = distribuisci(c, c.altezza, c.passoVerticale, latoTelaio, c.nBarreOrizzontali);

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
  // NB: l'interasse dei fori è quello EFFETTIVO. In SPAZI_UGUALI il passo chiesto
  // col cursore è solo un desiderata: chi fora deve leggere il passo vero, non
  // quello che è stato digitato.
  if (vert.n > 0) {
    barre.push({
      etichetta: 'Barra verticale',
      lunghezza: lunghezzaVerticale,
      quantitaPerTelaio: vert.n,
      taglio: '90°',
      primoForo: foriSuVerticale[0] ?? 0,
      interasse: oriz.passo,
      nFori: oriz.n,
      posizioni: foriSuVerticale,
      codaForo: lunghezzaVerticale - (foriSuVerticale[foriSuVerticale.length - 1] ?? 0),
    });
  }
  if (oriz.n > 0) {
    barre.push({
      etichetta: 'Barra orizzontale',
      lunghezza: lunghezzaOrizzontale,
      quantitaPerTelaio: oriz.n,
      taglio: '90°',
      primoForo: foriSuOrizzontale[0] ?? 0,
      interasse: vert.passo,
      nFori: vert.n,
      posizioni: foriSuOrizzontale,
      codaForo: lunghezzaOrizzontale - (foriSuOrizzontale[foriSuOrizzontale.length - 1] ?? 0),
    });
  }

  const disegno = {
    barre: [
      ...oriz.assi.map((y): SegmentoBarra => ({
        x1: testa, y1: y, x2: c.larghezza - testa, y2: y, famiglia: 'O', tipo: 'Barra orizzontale',
      })),
      ...vert.assi.map((x): SegmentoBarra => ({
        x1: x, y1: testa, x2: x, y2: c.altezza - testa, famiglia: 'V', tipo: 'Barra verticale',
      })),
    ],
    rivetti: vert.assi.flatMap((x) => oriz.assi.map((y): Punto => ({ x, y }))),
  };

  // --- Controlli che salvano materiale -------------------------------------
  if (vert.n === 0 || oriz.n === 0) {
    avvisi.push('Con questo passo non entra nessuna barra: riduci il passo o aumenta le misure del pannello.');
  }
  if (lunghezzaVerticale > BARRA.stecca || lunghezzaOrizzontale > BARRA.stecca) {
    avvisi.push(`Una barra supera i ${BARRA.stecca / 1000} m della barra commerciale: il pezzo non è ricavabile intero.`);
  }
  if (c.conBordo && (c.larghezza > PROFILO_U.stecca || c.altezza > PROFILO_U.stecca)) {
    avvisi.push(`Un lato del telaio supera i ${PROFILO_U.stecca / 1000} m della barra di profilo a U.`);
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
    vuotoX: vert.vuoto,
    vuotoY: oriz.vuoto,
    passoEffettivoX: vert.passo,
    passoEffettivoY: oriz.passo,
    assiVerticali: vert.assi,
    assiOrizzontali: oriz.assi,
    latoTelaio,
    testa,
    // Senza telaio il pannello è spesso quanto due barre sovrapposte, non quanto la U.
    spessorePannello: c.conBordo ? SPESSORE_PANNELLO : BARRA.spessore * 2,
    disegno,
    bordi,
    barre,
    nRivetti: vert.n * oriz.n,
    barreScartate: 0,
    metriU,
    metriBarra,
    avvisi,
  };
}

/** MILANO (rombi quadrati) e VENEZIA (asse verticale doppio): stesso reticolo, rapporto diverso. */
function calcolaRombi(c: ConfigGriglia, rapporto: number): Progetto {
  const avvisi: string[] = [];
  const latoTelaio = c.conBordo ? PROFILO_U.lato : 0;
  const testa = c.conBordo ? FONDO_CANALE + c.gioco : 0;

  const d = calcolaDiagonale({
    larghezza: c.larghezza,
    altezza: c.altezza,
    rapporto,
    diagonale: c.passoOrizzontale,   // Δ: la diagonale orizzontale del rombo
    testa,
    lunghezzaMinima: c.lunghezzaMinima,
  });

  // Su una griglia a rombi ogni barra è una corda diversa del rettangolo: le
  // lunghezze sono tutte diverse. Le accorpiamo per SCHEMA — ma prima le
  // NORMALIZZIAMO nel verso.
  //
  // Sulle barre d'angolo la foratura è asimmetrica (il primo foro non dista dalla
  // testa quanto l'ultimo dalla coda), e le barre arrivano in coppie speculari:
  // una con i fori 129/94, l'altra con 94/129. Ma quelle due sono LO STESSO PEZZO
  // girato: stessa lunghezza, stessa foratura, montato al contrario. Tenerle
  // separate significherebbe far tagliare e forare all'officina il doppio degli
  // schemi per niente. Quindi le portiamo tutte nello stesso verso (foro più
  // vicino verso la testa) e poi accorpiamo.
  const perSchema = new Map<string, PezzoBarra>();
  const chiaveDi: string[] = [];   // la chiave di ogni barra DISEGNATA, nello stesso ordine

  for (const b of d.barre) {
    let fori = b.fori;
    let primo = fori[0] ?? 0;
    let coda = b.codaForo;

    if (primo > coda + 1e-6) {
      fori = fori.map((f) => b.lunghezza - f).reverse();
      primo = fori[0] ?? 0;
      coda = b.lunghezza - (fori[fori.length - 1] ?? 0);
    }

    const chiave = [
      Math.round(b.lunghezza * 10),
      Math.round(primo * 10),
      fori.length,
    ].join('|');
    chiaveDi.push(chiave);

    const esistente = perSchema.get(chiave);
    if (esistente) {
      esistente.quantitaPerTelaio++;
      continue;
    }
    perSchema.set(chiave, {
      etichetta: '',
      lunghezza: b.lunghezza,
      quantitaPerTelaio: 1,
      taglio: '90°',
      primoForo: primo,
      interasse: b.interasse,
      nFori: fori.length,
      posizioni: fori,
      codaForo: coda,
    });
  }

  // Dalla più lunga alla più corta: è l'ordine in cui si taglia.
  const barre = [...perSchema.values()].sort((a, b) => b.lunghezza - a.lunghezza);
  barre.forEach((b, i) => { b.etichetta = `Barra tipo ${String.fromCharCode(65 + i)}`; });

  // Ogni barra disegnata sa a quale tipo appartiene: è così che l'hover sulla
  // distinta accende i pezzi giusti nell'anteprima.
  const etichettaPerChiave = new Map<string, string>();
  for (const [chiave, pezzo] of perSchema) etichettaPerChiave.set(chiave, pezzo.etichetta);

  const bordi: PezzoBordo[] = c.conBordo ? [
    { etichetta: 'Montante orizzontale (sopra/sotto)', lunghezza: c.larghezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
    { etichetta: 'Montante verticale (dx/sx)', lunghezza: c.altezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
  ] : [];

  const metriBarra = d.barre.reduce((t, b) => t + b.lunghezza, 0) / 1000;
  const lunghezzaMax = d.barre.reduce((t, b) => Math.max(t, b.lunghezza), 0);

  if (d.barre.length === 0) {
    avvisi.push('Con questo passo non entra nessuna barra: riduci il passo o aumenta le misure del pannello.');
  }
  if (d.vuoto < 0) {
    avvisi.push('Con questo passo le barre si sovrappongono: il rombo è più stretto della barra stessa.');
  }
  if (lunghezzaMax > BARRA.stecca) {
    avvisi.push(`Una barra supera i ${BARRA.stecca / 1000} m della barra commerciale: il pezzo non è ricavabile intero.`);
  }
  if (c.conBordo && (c.larghezza > PROFILO_U.stecca || c.altezza > PROFILO_U.stecca)) {
    avvisi.push(`Un lato del telaio supera i ${PROFILO_U.stecca / 1000} m della barra di profilo a U.`);
  }

  return {
    config: c,
    luceX: c.larghezza - 2 * latoTelaio,
    luceY: c.altezza - 2 * latoTelaio,
    margineX: 0,
    margineY: 0,
    vuotoX: d.vuoto,
    vuotoY: d.vuoto,
    passoEffettivoX: d.perpendicolare,
    passoEffettivoY: d.perpendicolare,
    assiVerticali: [],
    assiOrizzontali: [],
    latoTelaio,
    testa,
    spessorePannello: c.conBordo ? SPESSORE_PANNELLO : BARRA.spessore * 2,
    disegno: {
      barre: d.barre.map((b, i): SegmentoBarra => ({
        ...b.segmento,
        famiglia: b.famiglia,
        tipo: etichettaPerChiave.get(chiaveDi[i]!) ?? '',
      })),
      rivetti: d.rivetti,
    },
    bordi,
    barre,
    nRivetti: d.rivetti.length,
    barreScartate: d.scartate,
    metriU: c.conBordo ? (2 * c.larghezza + 2 * c.altezza) / 1000 : 0,
    metriBarra,
    avvisi,
  };
}

export function calcolaProgetto(c: ConfigGriglia): Progetto {
  switch (c.stile) {
    case 'LONDRA':
      return calcolaLondra(c);
    case 'MILANO':
      return calcolaRombi(c, 1);   // rombi quadrati → barre a 45°
    case 'VENEZIA':
      return calcolaRombi(c, 2);   // asse verticale doppio → barre a ~63,4°
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
