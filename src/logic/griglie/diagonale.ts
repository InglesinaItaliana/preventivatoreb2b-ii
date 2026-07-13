// src/logic/griglie/diagonale.ts
//
// Le griglie a rombi (MILANO e VENEZIA). Sono lo STESSO reticolo: cambia solo il
// rapporto fra le diagonali del rombo.
//
//   MILANO   rombi quadrati        → diagonale verticale = orizzontale   (r = 1) → barre a 45°
//   VENEZIA  asse verticale doppio → diagonale verticale = 2 × orizz.    (r = 2) → barre a ~63,4°
//
// ┌── IL RETICOLO ────────────────────────────────────────────────────────────
// Con Δ = diagonale orizzontale del rombo e r = rapporto, le due famiglie di
// barre sono le rette
//        A:  r·x − y = costante        (direzione (1,  r))
//        B:  r·x + y = costante        (direzione (1, −r))
// con le costanti spaziate di S = r·Δ. Ne esce un rombo largo Δ e alto r·Δ.
// Il reticolo è ancorato al CENTRO del pannello (lì cade un incrocio), così il
// disegno è simmetrico sui due assi.
//
// ┌── IL TAGLIO A 90° (il punto delicato) ────────────────────────────────────
// Le barre sono tagliate a squadro, non in obliquo. Su una barra inclinata questo
// vuol dire che LO SPIGOLO arriva sul fondo del canale PRIMA dell'asse: se
// calcolassimo la lunghezza sull'asse, uno spigolo sbatterebbe contro il fondo e
// la barra non entrerebbe.
//
// Quindi l'asse della barra si ferma prima. Di quanto, dipende dalla direzione:
//        contro i lati verticali:   9 · r / √(1+r²)      (MILANO 6,36 · VENEZIA 8,05 mm)
//        contro i lati orizzontali: 9     / √(1+r²)      (MILANO 6,36 · VENEZIA 4,02 mm)
// Basta rimpicciolire di quelle due quote il rettangolo entro cui tagliamo gli
// assi: così TUTTO il corpo della barra — spigoli compresi — resta dentro il
// fondo del canale, per costruzione.

import { BARRA } from './materiali';

export interface Punto { x: number; y: number }

export interface Segmento {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface BarraDiagonale {
  famiglia: 'A' | 'B';
  segmento: Segmento;       // asse della barra (già accorciato per il taglio a 90°)
  lunghezza: number;
  fori: number[];           // posizioni sull'asse, dalla TESTA (l'estremità con y minore)
  puntiFori: Punto[];       // gli stessi fori, in coordinate pannello (per l'anteprima)
  interasse: number;        // costante lungo la barra
  codaForo: number;         // dall'ultimo foro alla CODA: su una diagonale ≠ dal primo foro
}

const EPS = 1e-9;

/**
 * Ritaglia la retta P + t·u dentro il rettangolo. Liang–Barsky.
 * Ritorna null se la retta non lo attraversa.
 */
function clip(
  p: Punto, u: Punto,
  xmin: number, xmax: number, ymin: number, ymax: number,
): { t0: number; t1: number } | null {
  let t0 = -Infinity, t1 = Infinity;
  const prove: Array<[number, number]> = [
    [-u.x, p.x - xmin],
    [u.x, xmax - p.x],
    [-u.y, p.y - ymin],
    [u.y, ymax - p.y],
  ];
  for (const [den, num] of prove) {
    if (Math.abs(den) < EPS) {
      if (num < -EPS) return null; // parallela e fuori
      continue;
    }
    const t = num / den;
    if (den > 0) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
  }
  return t1 - t0 > EPS ? { t0, t1 } : null;
}

export interface ParametriDiagonale {
  larghezza: number;        // ingombro esterno
  altezza: number;
  rapporto: number;         // 1 = MILANO (rombi quadrati) · 2 = VENEZIA
  diagonale: number;        // Δ: diagonale orizzontale del rombo (il "passo")
  testa: number;            // quanto la barra può spingersi oltre il filo (fondo canale − gioco)
  lunghezzaMinima: number;  // filtro facoltativo: sotto questa la barretta si omette
  conBordo: boolean;        // col telaio le teste sono infilate nel canale, che le TRATTIENE
}

export interface RisultatoDiagonale {
  barre: BarraDiagonale[];
  scartate: number;         // barre omesse (solo l'impossibile, o il filtro estetico)
  pivotanti: number;        // barre tenute da UN SOLO rivetto: agganciate, ma girano
  rivetti: Punto[];
  perpendicolare: number;   // distanza fra due barre parallele (asse-asse)
  vuoto: number;            // la luce che si vede fra due barre parallele
  angolo: number;           // gradi sull'orizzontale
  interasseFori: number;    // passo dei fori lungo una barra
}

export function calcolaDiagonale(p: ParametriDiagonale): RisultatoDiagonale {
  const { larghezza: W, altezza: H, rapporto: r, diagonale: D, testa } = p;
  const mezza = BARRA.larghezza / 2;
  const norma = Math.sqrt(1 + r * r);

  // Rettangolo in cui può stare il CORPO della barra: fino al fondo del canale.
  const bx0 = testa, bx1 = W - testa;
  const by0 = testa, by1 = H - testa;

  // Rettangolo in cui possono finire gli ASSI: rimpicciolito di quanto lo spigolo
  // anticipa l'asse. È tutta qui la gestione del taglio a 90°.
  const sx = mezza * r / norma;
  const sy = mezza / norma;
  const ax0 = bx0 + sx, ax1 = bx1 - sx;
  const ay0 = by0 + sy, ay1 = by1 - sy;

  const perpendicolare = r * D / norma;
  const risultato: RisultatoDiagonale = {
    barre: [],
    scartate: 0,
    pivotanti: 0,
    rivetti: [],
    perpendicolare,
    vuoto: perpendicolare - BARRA.larghezza,
    angolo: (Math.atan(r) * 180) / Math.PI,
    interasseFori: (D * norma) / 2,
  };

  if (ax1 - ax0 < EPS || ay1 - ay0 < EPS || D <= 0 || r <= 0) return risultato;

  const S = r * D;                       // passo delle costanti delle rette
  const cA0 = r * (W / 2) - H / 2;       // la retta A che passa per il centro
  const cB0 = r * (W / 2) + H / 2;       // idem per la B

  // Quante rette servono per coprire il rettangolo, in entrambi i versi.
  const estensione = Math.ceil((Math.abs(r) * W + H) / S) + 2;

  const uA: Punto = { x: 1 / norma, y: r / norma };   // direzione famiglia A
  const uB: Punto = { x: 1 / norma, y: -r / norma };  // direzione famiglia B

  /** Un punto qualsiasi sulla retta della famiglia, per la costante c. */
  const puntoA = (c: number): Punto => ({ x: (c + H / 2) / r, y: H / 2 }); // r·x − y = c, con y = H/2
  const puntoB = (c: number): Punto => ({ x: (c - H / 2) / r, y: H / 2 }); // r·x + y = c

  interface Retta { c: number; punto: Punto; u: Punto; famiglia: 'A' | 'B' }
  const rette: Retta[] = [];
  for (let i = -estensione; i <= estensione; i++) {
    rette.push({ c: cA0 + i * S, punto: puntoA(cA0 + i * S), u: uA, famiglia: 'A' });
    rette.push({ c: cB0 + i * S, punto: puntoB(cB0 + i * S), u: uB, famiglia: 'B' });
  }

  // Costante dell'altra famiglia in un punto: serve per trovare gli incroci.
  const cAltra = (fam: 'A' | 'B', q: Punto) => (fam === 'A' ? r * q.x + q.y : r * q.x - q.y);

  const candidate: BarraDiagonale[] = [];

  for (const retta of rette) {
    const tagliata = clip(retta.punto, retta.u, ax0, ax1, ay0, ay1);
    if (!tagliata) continue;

    const P1: Punto = { x: retta.punto.x + retta.u.x * tagliata.t0, y: retta.punto.y + retta.u.y * tagliata.t0 };
    const P2: Punto = { x: retta.punto.x + retta.u.x * tagliata.t1, y: retta.punto.y + retta.u.y * tagliata.t1 };

    // La TESTA è l'estremità più in basso (y minore): convenzione unica, così chi
    // fora sa da che parte partire. Su una diagonale il primo foro e l'ultimo NON
    // sono simmetrici, quindi la testa va dichiarata.
    const [testaP, codaP] = P1.y <= P2.y ? [P1, P2] : [P2, P1];
    const dir: Punto = { x: codaP.x - testaP.x, y: codaP.y - testaP.y };
    const lunghezza = Math.hypot(dir.x, dir.y);
    if (lunghezza < EPS) continue;
    const u: Punto = { x: dir.x / lunghezza, y: dir.y / lunghezza };

    // I fori sono gli incroci con l'ALTRA famiglia: lungo la barra sono
    // equidistanti (interasse costante), ma il primo non cade a metà strada.
    const cTesta = cAltra(retta.famiglia, testaP);
    const cCoda = cAltra(retta.famiglia, codaP);
    const cBase = retta.famiglia === 'A' ? cB0 : cA0;

    const cMin = Math.min(cTesta, cCoda);
    const cMax = Math.max(cTesta, cCoda);
    const kMin = Math.ceil((cMin - cBase) / S - 1e-6);
    const kMax = Math.floor((cMax - cBase) / S + 1e-6);

    const fori: number[] = [];
    const puntiFori: Punto[] = [];
    const derivata = (cCoda - cTesta) / lunghezza; // quanto cresce c per mm percorso
    for (let k = kMin; k <= kMax; k++) {
      const c = cBase + k * S;
      const t = Math.abs(derivata) < EPS ? 0 : (c - cTesta) / derivata;
      if (t < -1e-6 || t > lunghezza + 1e-6) continue;
      const tt = Math.min(Math.max(t, 0), lunghezza);
      fori.push(tt);
      puntiFori.push({ x: testaP.x + u.x * tt, y: testaP.y + u.y * tt });
    }
    fori.sort((a, b) => a - b);
    puntiFori.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    candidate.push({
      famiglia: retta.famiglia,
      segmento: { x1: testaP.x, y1: testaP.y, x2: codaP.x, y2: codaP.y },
      lunghezza,
      fori,
      puntiFori,
      interasse: risultato.interasseFori,
      codaForo: lunghezza - (fori[fori.length - 1] ?? 0),
    });
  }

  // ┌── CHI SI SCARTA, E PERCHÉ ────────────────────────────────────────────────
  // Il pezzo delicato, e per un po' l'ho sbagliato.
  //
  // Se una barra ha un foro, ha un aggancio: NON va buttata. E col telaio anche
  // una barra senza nessun incrocio è tenuta, perché le sue due teste sono
  // infilate nel canale della U, che le trattiene. L'unico caso davvero
  // impossibile è la GRIGLIA NUDA con ZERO incroci: quella cade per terra.
  //
  // La lunghezza minima resta, ma è un filtro estetico facoltativo (di serie 0,
  // cioè si tiene tutto). E qualunque cosa venga tolta, i suoi fori spariscono
  // anche dalle barre che la incrociavano: un foro senza partner sotto è un buco
  // nel vuoto, che l'officina farebbe e che indebolisce la barra per niente.
  //
  // Togliere una barra può lasciarne un'altra senza incroci, che a sua volta va
  // rivalutata: si itera fino a quando la situazione non si stabilizza.
  const chiave = (q: Punto) => `${Math.round(q.x * 100)}|${Math.round(q.y * 100)}`;
  let vive = candidate;

  for (let giro = 0; giro < 20; giro++) {
    // Un rivetto esiste solo dove DUE barre vive si incrociano.
    const conteggio = new Map<string, { punto: Punto; n: number }>();
    for (const b of vive) {
      for (const q of b.puntiFori) {
        const k = chiave(q);
        const e = conteggio.get(k);
        if (e) e.n++;
        else conteggio.set(k, { punto: q, n: 1 });
      }
    }
    const rivetti = new Set(
      [...conteggio.entries()].filter(([, e]) => e.n >= 2).map(([k]) => k),
    );

    // Ogni barra tiene solo i fori che hanno davvero un partner.
    for (const b of vive) {
      const tenuti: number[] = [];
      const punti: Punto[] = [];
      for (let i = 0; i < b.puntiFori.length; i++) {
        if (rivetti.has(chiave(b.puntiFori[i]!))) {
          tenuti.push(b.fori[i]!);
          punti.push(b.puntiFori[i]!);
        }
      }
      b.fori = tenuti;
      b.puntiFori = punti;
      b.codaForo = b.lunghezza - (tenuti[tenuti.length - 1] ?? 0);
    }

    const sopravvissute = vive.filter((b) =>
      b.lunghezza >= p.lunghezzaMinima &&      // filtro estetico (di serie: nessuno)
      (p.conBordo || b.fori.length > 0)        // senza telaio, zero incroci = cade
    );

    if (sopravvissute.length === vive.length) {
      vive = sopravvissute;
      risultato.rivetti = [...conteggio.values()].filter((e) => e.n >= 2).map((e) => e.punto);
      break;
    }
    vive = sopravvissute;
  }

  risultato.barre = vive;
  risultato.scartate = candidate.length - vive.length;
  risultato.pivotanti = vive.filter((b) => b.fori.length === 1).length;

  return risultato;
}
