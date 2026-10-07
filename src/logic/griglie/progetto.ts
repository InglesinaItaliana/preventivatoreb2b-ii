// src/logic/griglie/progetto.ts
//
// La geometria dei pannelli-griglia. Modulo PURO: nessun Vue, nessun Firestore.
// Da qui escono i numeri con cui l'officina taglia il metallo — l'anteprima e le
// distinte leggono entrambe da qui, così il disegno non può mostrare una cosa
// diversa da quella che viene tagliata.
//
// Tutto in millimetri.

import {
  PROFILO_U, BARRA, FONDO_CANALE, SPESSORE_PANNELLO, INGLESINA_26, MINUTERIA_PREMIUM,
} from './materiali';
import { calcolaDiagonale, type Punto } from './diagonale';
import { scassoPremium26, etichettaScasso, type QuoteScasso } from './scasso';
import type { FamigliaFinitura } from './finiture';

/**
 * PREMIUM è un mondo a parte: si fa solo con l'inglesina da 26, la cornice è la
 * stessa inglesina tagliata a 45°, gli interni si INCASTRANO (sormonto) invece di
 * essere rivettati, e le lavorazioni sono scasso + fori sulla cornice + fresatura.
 */
export type Stile = 'LONDRA' | 'MILANO' | 'VENEZIA' | 'PREMIUM';

/**
 * I nomi dei pezzi come li chiama l'officina. Sono anche la CHIAVE con cui
 * anteprima, distinta, scheda e PDF si riconoscono fra loro: usare sempre queste
 * costanti, mai la stringa a mano. b/h come nel foglio calcoli: base e altezza.
 * (Sui rombi le barre restano "Barra tipo A/B/…": ogni tipo è una corda diversa.)
 */
export const PEZZO = {
  B_TELAIO: 'b TELAIO',
  H_TELAIO: 'h TELAIO',
  VERTICALE: 'Verticale',
  ORIZZONTALE: 'Orizzontale',
} as const;

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
  lunghezzaMinima: number;    // filtro estetico: sotto questa la barretta d'angolo si omette
  /**
   * Quale famiglia sta nello strato A VISTA (davanti). Decide la foratura:
   * la famiglia davanti prende il foro CIECO (una parete sola), quella dietro
   * il foro PASSANTE. In LONDRA: 'O' = orizzontali · 'V' = verticali.
   * Sui rombi: 'A' e 'B' sono le due diagonali.
   */
  famigliaAVista: 'V' | 'O' | 'A' | 'B';
  nBarreVerticali?: number | null;   // forzatura manuale del numero di barre (SPAZI_UGUALI)
  nBarreOrizzontali?: number | null;
  /** Solo PREMIUM: decide il sormonto (13 verniciato, 14 rivestito). Assente = verniciato. */
  famigliaFinitura?: FamigliaFinitura;
}

/** Un pezzo del telaio (profilo a U). */
export interface PezzoBordo {
  etichetta: string;
  lunghezza: number;          // sul lato lungo del quartabuono
  quantitaPerTelaio: number;
  taglio: string;
  /** Solo PREMIUM: fori sulla cornice, dalla punta lunga, uno sull'asse di ogni interno che la sormonta. */
  fori?: number[];
}

/**
 * Come si fora una barra.
 *
 * Il profilo è CAVO, e il rivetto entra da un lato solo del pannello: attraversa
 * da parte a parte la barra dello strato NASCOSTO (foro passante, due pareti, e
 * su di essa appoggia la testa), poi buca UNA SOLA parete della barra a vista ed
 * entra nella sua cavità, dove si allarga tirando. La parete esterna di quella
 * barra non viene mai forata: per questo il lato a vista resta pulito, senza
 * teste di rivetto.
 */
export type Foratura = 'PASSANTE' | 'CIECA';

/**
 * Una barra della griglia, con il suo schema di taglio e foratura.
 *
 * La foratura NON separa i pezzi: si tagliano identici, e solo dopo si forano in
 * due modi. Sui rombi le due famiglie di diagonali sono l'una l'immagine
 * speculare dell'altra, quindi ogni forma esce in quantità pari e si divide
 * ESATTAMENTE a metà fra i due strati — è una simmetria, non una coincidenza
 * delle misure. Su Londra invece orizzontali e verticali hanno lunghezze e
 * quantità diverse, e ogni tipo sta tutto da una parte sola.
 */
export interface PezzoBarra {
  etichetta: string;
  lunghezza: number;
  quantitaPerTelaio: number;   // pezzi da tagliare, in tutto
  quantitaCieca: number;       // ...di cui forati su UNA parete (strato a vista)
  quantitaPassante: number;    // ...e di cui forati da parte a parte (strato dietro)
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
  /**
   * Solo PREMIUM: smusso a 45° sui due spigoli di ENTRAMBE le teste, lungo quanto
   * la parte che sormonta (6,5 / 6 mm). Viene dalla fresatura: la punta che si
   * appoggia sulla barra sormontata si restringe da 26 a 26 − 2×smusso.
   */
  smusso?: number;
}

/** Un pezzo di cornice PREMIUM sul disegno: il trapezio del taglio a 45°. */
export interface PezzoCorniceDisegno {
  punti: Punto[];
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
  larghezzaBarra: number;     // 18 (barra da giardino) o 26 (inglesina PREMIUM): serve all'anteprima
  spessorePannello: number;   // col telaio = 20; senza = due barre sovrapposte = 16; PREMIUM = 8, a filo

  // Disegno: unico per tutti gli stili, così l'anteprima non deve sapere quale sta guardando.
  // `cornice` c'è solo sul PREMIUM: la cornice è fatta di pezzi veri, non del profilo a U.
  disegno: { barre: SegmentoBarra[]; rivetti: Punto[]; cornice?: PezzoCorniceDisegno[] };

  // Distinte
  bordi: PezzoBordo[];
  barre: PezzoBarra[];
  nRivetti: number;           // un rivetto per incrocio
  barreScartate: number;      // barrette d'angolo omesse (rombi): troppo corte o senza incroci

  // Materiale (metri lineari EFFETTIVI nel pannello, non le stecche da comprare)
  metriU: number;             // per telaio
  metriBarra: number;         // per telaio

  premium?: DettaglioPremium; // solo stile PREMIUM

  avvisi: string[];
}

/**
 * Le lavorazioni dello stile PREMIUM, che negli altri stili non esistono.
 * Le misure di taglio stanno comunque in `bordi` (cornice) e `barre` (interni).
 */
export interface DettaglioPremium {
  sormonto: number;           // 13 verniciato · 14 rivestito
  sormontoPerLato: number;    // quanto un pezzo entra nella barra che sormonta: (26 − sormonto)/2
  scasso: QuoteScasso & {
    nScassi: number;          // uno per orizzontale attraversato
    etichetta: string;        // come la legge chi sta alla pressetta: "16,35 - 16,10"
    assi: number[];           // dove cadono gli assi degli orizzontali, dalla testa del verticale
  };
  /** Minuteria per telaio (v. MINUTERIA_PREMIUM). */
  minuteria: {
    giunzioni: number;        // una per incrocio: nV × nO
    perni: number;            // uno per testa incastrata nella cornice: 2·nV + 2·nO
    giunzioniL: number;       // una per angolo: 4
    pesoKg: number;
  };
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
  nForzato?: number | null, larghezza: number = BARRA.larghezza,
): Distribuita {
  const luce = ingombro - 2 * latoTelaio;
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
    { etichetta: PEZZO.B_TELAIO, lunghezza: c.larghezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
    { etichetta: PEZZO.H_TELAIO, lunghezza: c.altezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
  ] : [];

  const barre: PezzoBarra[] = [];
  // NB: l'interasse dei fori è quello EFFETTIVO. In SPAZI_UGUALI il passo chiesto
  // col cursore è solo un desiderata: chi fora deve leggere il passo vero, non
  // quello che è stato digitato.
  // La famiglia davanti prende il foro CIECO (il rivetto entra da dietro e si
  // allarga nella sua cavità, senza bucarne la parete esterna): è così che il
  // lato a vista resta senza teste di rivetto.
  const vistaV = c.famigliaAVista === 'V';

  if (vert.n > 0) {
    barre.push({
      etichetta: PEZZO.VERTICALE,
      lunghezza: lunghezzaVerticale,
      quantitaPerTelaio: vert.n,
      quantitaCieca: vistaV ? vert.n : 0,
      quantitaPassante: vistaV ? 0 : vert.n,
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
      etichetta: PEZZO.ORIZZONTALE,
      lunghezza: lunghezzaOrizzontale,
      quantitaPerTelaio: oriz.n,
      quantitaCieca: vistaV ? 0 : oriz.n,
      quantitaPassante: vistaV ? oriz.n : 0,
      taglio: '90°',
      primoForo: foriSuOrizzontale[0] ?? 0,
      interasse: vert.passo,
      nFori: vert.n,
      posizioni: foriSuOrizzontale,
      codaForo: lunghezzaOrizzontale - (foriSuOrizzontale[foriSuOrizzontale.length - 1] ?? 0),
    });
  }

  // Ordine di disegno: la famiglia a vista va SOPRA, come nel pannello vero.
  const segOriz = oriz.assi.map((y): SegmentoBarra => ({
    x1: testa, y1: y, x2: c.larghezza - testa, y2: y, famiglia: 'O', tipo: PEZZO.ORIZZONTALE,
  }));
  const segVert = vert.assi.map((x): SegmentoBarra => ({
    x1: x, y1: testa, x2: x, y2: c.altezza - testa, famiglia: 'V', tipo: PEZZO.VERTICALE,
  }));

  const disegno = {
    barre: vistaV ? [...segOriz, ...segVert] : [...segVert, ...segOriz],
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
    larghezzaBarra: BARRA.larghezza,
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
    conBordo: c.conBordo,
  });

  const famVista = c.famigliaAVista === 'B' ? 'B' : 'A';

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

    // La famiglia NON entra nella chiave: i pezzi si TAGLIANO identici, e solo
    // dopo si forano in due modi. Le due famiglie sono l'una lo specchio
    // dell'altra, quindi ogni forma esce in quantità pari e si divide esattamente
    // a metà fra foro cieco (strato a vista) e foro passante (strato dietro).
    const aVista = b.famiglia === famVista;
    const chiave = [
      Math.round(b.lunghezza * 10),
      Math.round(primo * 10),
      fori.length,
    ].join('|');
    chiaveDi.push(chiave);

    const esistente = perSchema.get(chiave);
    if (esistente) {
      esistente.quantitaPerTelaio++;
      if (aVista) esistente.quantitaCieca++;
      else esistente.quantitaPassante++;
      continue;
    }
    perSchema.set(chiave, {
      etichetta: '',
      lunghezza: b.lunghezza,
      quantitaPerTelaio: 1,
      quantitaCieca: aVista ? 1 : 0,
      quantitaPassante: aVista ? 0 : 1,
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
    { etichetta: PEZZO.B_TELAIO, lunghezza: c.larghezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
    { etichetta: PEZZO.H_TELAIO, lunghezza: c.altezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità' },
  ] : [];

  const metriBarra = d.barre.reduce((t, b) => t + b.lunghezza, 0) / 1000;
  const lunghezzaMax = d.barre.reduce((t, b) => Math.max(t, b.lunghezza), 0);

  if (d.barre.length === 0) {
    avvisi.push('Con questo passo non entra nessuna barra: riduci il passo o aumenta le misure del pannello.');
  }
  if (d.vuoto < 0) {
    avvisi.push('Con questo passo le barre si sovrappongono: il rombo è più stretto della barra stessa.');
  }
  if (d.pivotanti > 0 && !c.conBordo) {
    avvisi.push(`${d.pivotanti} barre sono tenute da un solo rivetto: senza telaio girano attorno a quel perno.`);
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
    larghezzaBarra: BARRA.larghezza,
    spessorePannello: c.conBordo ? SPESSORE_PANNELLO : BARRA.spessore * 2,
    disegno: {
      // La famiglia a vista si disegna per ULTIMA, così sta sopra come nel pannello.
      barre: d.barre
        .map((b, i): SegmentoBarra => ({
          ...b.segmento,
          famiglia: b.famiglia,
          tipo: etichettaPerChiave.get(chiaveDi[i]!) ?? '',
        }))
        .sort((a, b) => Number(a.famiglia === famVista) - Number(b.famiglia === famVista)),
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

/**
 * PREMIUM: griglia ortogonale in inglesina da 26, dentro una cornice della stessa
 * inglesina. Verticali interi e scassati, orizzontali a spezzoni, luci uguali.
 *
 * LA REGOLA UNICA: ogni pezzo interno è lungo quanto la distanza fra gli ASSI
 * delle due barre su cui si incastra, meno il sormonto. La cornice si comporta
 * esattamente come un verticale in più: gli interni la sormontano anche lei.
 *
 *   verticale  = (H − 26) − s                  asse cornice sopra → asse cornice sotto
 *   spezzone   = (B − 26) / (nV + 1) − s       a luci uguali tutti gli interassi sono pari
 *
 * Con s = 13: 350×700, 1V×3O → verticale 661, spezzoni 149 × 6 (pannello di prova).
 * Niente detrazione e niente terminali da 1 mm: quelli sono del vetrocamera.
 *
 * Cornice: 4 pezzi a 45° con la sola misura lunga (la taglierina fa il 45°), un
 * foro sull'asse di ogni interno che la sormonta, quotato dalla punta lunga — cioè
 * dal filo esterno, che è dove stanno già gli assi calcolati.
 */
function calcolaPremium(c: ConfigGriglia): Progetto {
  const avvisi: string[] = [];
  const L = INGLESINA_26.larghezza;
  const s = INGLESINA_26.sormonto[c.famigliaFinitura ?? 'VERNICIATO'];
  const sormontoPerLato = (L - s) / 2;

  // Luci uguali sempre: è la regola dello stile, il passo è solo un desiderata.
  const vert = distribuisciAVuotiUguali(c.larghezza, c.margineMinimo, c.passoOrizzontale, L, c.nBarreVerticali, L);
  const oriz = distribuisciAVuotiUguali(c.altezza, c.margineMinimo, c.passoVerticale, L, c.nBarreOrizzontali, L);

  // Gli assi delle barre su cui si incastrano gli interni, cornice compresa.
  const assiCorniceX = [L / 2, c.larghezza - L / 2];
  const assiCorniceY = [L / 2, c.altezza - L / 2];
  const appoggiX = [assiCorniceX[0]!, ...vert.assi, assiCorniceX[1]!];

  const lunghezzaVerticale = (c.altezza - L) - s;
  const spezzoniPerFila = vert.n + 1;
  const lunghezzaSpezzone = (c.larghezza - L) / spezzoniPerFila - s;

  // Il verticale comincia sotto la cornice: dal filo esterno, la sua testa sta a
  // 26 − 6,5 = 19,5 (verniciato). Da lì si misurano gli assi degli orizzontali.
  const testa = L - sormontoPerLato;
  const quote = scassoPremium26(oriz.luce, oriz.n, sormontoPerLato);

  const bordi: PezzoBordo[] = [
    { etichetta: PEZZO.B_TELAIO, lunghezza: c.larghezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità', fori: vert.assi },
    { etichetta: PEZZO.H_TELAIO, lunghezza: c.altezza, quantitaPerTelaio: 2, taglio: '45° alle due estremità', fori: oriz.assi },
  ];

  // Gli interni NON si forano: si scassano (verticali) e si fresano (tutti).
  const senzaFori = { quantitaCieca: 0, quantitaPassante: 0, primoForo: 0, interasse: 0, nFori: 0, posizioni: [], codaForo: 0 };
  const barre: PezzoBarra[] = [];
  if (vert.n > 0 && oriz.n > 0) {
    barre.push({ etichetta: PEZZO.VERTICALE, lunghezza: lunghezzaVerticale, quantitaPerTelaio: vert.n, taglio: '90°', ...senzaFori });
    barre.push({ etichetta: PEZZO.ORIZZONTALE, lunghezza: lunghezzaSpezzone, quantitaPerTelaio: oriz.n * spezzoniPerFila, taglio: '90°', ...senzaFori });
  }

  // Disegno: ogni pezzo con la sua lunghezza VERA, sormonti compresi, nell'ordine
  // in cui si sovrappone nel pannello montato: la cornice sotto, i verticali sopra
  // la cornice, gli spezzoni sopra tutto. Ogni testa che sormonta è smussata.
  const segSpezzoni = oriz.assi.flatMap((y) => appoggiX.slice(0, -1).map((x, i): SegmentoBarra => ({
    x1: x + s / 2, y1: y, x2: appoggiX[i + 1]! - s / 2, y2: y, famiglia: 'O', tipo: PEZZO.ORIZZONTALE,
    smusso: sormontoPerLato,
  })));
  const segVerticali = vert.assi.map((x): SegmentoBarra => ({
    x1: x, y1: assiCorniceY[0]! + s / 2, x2: x, y2: assiCorniceY[1]! - s / 2, famiglia: 'V', tipo: PEZZO.VERTICALE,
    smusso: sormontoPerLato,
  }));

  // I quattro pezzi della cornice: trapezi, perché le teste sono tagliate a 45°.
  const W = c.larghezza, H = c.altezza;
  const [traverso, montante] = [bordi[0]!.etichetta, bordi[1]!.etichetta];
  const cornice: PezzoCorniceDisegno[] = [
    { tipo: traverso, punti: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W - L, y: L }, { x: L, y: L }] },
    { tipo: traverso, punti: [{ x: 0, y: H }, { x: W, y: H }, { x: W - L, y: H - L }, { x: L, y: H - L }] },
    { tipo: montante, punti: [{ x: 0, y: 0 }, { x: L, y: L }, { x: L, y: H - L }, { x: 0, y: H }] },
    { tipo: montante, punti: [{ x: W, y: 0 }, { x: W - L, y: L }, { x: W - L, y: H - L }, { x: W, y: H }] },
  ];

  if (vert.n === 0 || oriz.n === 0) {
    avvisi.push('Con queste misure non entra nessun elemento interno: aumenta le misure del pannello o riduci il margine minimo.');
  }

  const giunzioni = vert.n * oriz.n;
  const perni = barre.length ? 2 * vert.n + 2 * oriz.n : 0;
  const giunzioniL = 4;
  const minuteria = {
    giunzioni, perni, giunzioniL,
    pesoKg: giunzioni * MINUTERIA_PREMIUM.giunzionePesoKg
      + perni * MINUTERIA_PREMIUM.pernoPesoKg
      + giunzioniL * MINUTERIA_PREMIUM.giunzioneLPesoKg,
  };

  const metriCornice = (2 * c.larghezza + 2 * c.altezza) / 1000;
  const metriInterni = barre.reduce((t, b) => t + b.lunghezza * b.quantitaPerTelaio, 0) / 1000;

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
    latoTelaio: L,
    testa,
    larghezzaBarra: L,
    // Pannello finito spesso quanto il profilo: con la fresatura gli incastri stanno a filo.
    spessorePannello: INGLESINA_26.spessore,
    disegno: { barre: [...segVerticali, ...segSpezzoni], rivetti: [], cornice },
    bordi,
    barre,
    nRivetti: 0,
    barreScartate: 0,
    // La cornice è inglesina, non profilo a U: tutto il materiale sta in metriBarra.
    metriU: 0,
    metriBarra: metriCornice + metriInterni,
    premium: {
      sormonto: s,
      sormontoPerLato,
      scasso: {
        ...quote,
        nScassi: oriz.n,
        etichetta: etichettaScasso(quote, oriz.n),
        assi: oriz.assi.map((y) => y - testa),
      },
      minuteria,
    },
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
    case 'PREMIUM':
      return calcolaPremium(c);
  }
}

/** Peso e ingombro di una fornitura di N telai identici. */
export function calcolaImballaggio(p: Progetto, pesoBarraKgM: number | null) {
  const n = p.config.quantita;
  const pesoU = p.metriU * PROFILO_U.pesoKgM;
  const pesoBarre = pesoBarraKgM !== null ? p.metriBarra * pesoBarraKgM : null;
  const pesoMinuteria = p.premium?.minuteria.pesoKg ?? 0;   // giunzioni e perni del PREMIUM
  const pesoTelaio = pesoBarre !== null ? pesoU + pesoBarre + pesoMinuteria : null;

  return {
    pesoU,
    pesoBarre,
    pesoMinuteria,
    pesoTelaio,
    pesoTotale: pesoTelaio !== null ? pesoTelaio * n : null,
    ingombro: {
      larghezza: p.config.larghezza,
      altezza: p.config.altezza,
      spessore: p.spessorePannello * n,
    },
  };
}
