// src/lib/griglie/schedaProduzionePdf.ts
//
// La scheda di produzione di una COMMESSA di griglie (uno o più pannelli P1, P2,
// P3…): UN documento continuo da consultare in officina, nell'ordine in cui si
// lavora:
//
//   testata → pannelli → picking → taglio → piano di taglio → scassi → fori
//   → fresatura e smusso (PREMIUM) → foratura (altri stili)
//   → schema di montaggio, uno per pannello → packaging
//
// CODICI: il codice identifica il PEZZO, non il pannello. Pezzi intercambiabili —
// stesso profilo e finitura, stesso tipo, stessa misura, stesse lavorazioni (fori,
// scassi, smusso) — hanno lo stesso codice in tutta la commessa, anche se stanno in
// pannelli diversi: si tagliano e si lavorano una volta sola, con le quantità
// sommate. Formato: tipo + numero, dal più lungo al più corto — T telaio,
// V verticali, O orizzontali, B barre dei rombi ("V1" è il verticale più lungo).
// Due verticali lunghi uguali ma con gli scassi in punti diversi NON sono
// intercambiabili: codici diversi. Il pannello conta solo nello schema di montaggio.
//
// MATERIALI: il piano di taglio è uno per profilo E finitura (un pezzo BIANCO non
// si ricava da una barra NOCE), e raccoglie i pezzi di tutti i pannelli che usano
// quel materiale: è lì che la commessa fa risparmiare sfrido.
//
// Legge SOLO dai Progetti e dai piani di taglio: gli stessi numeri della distinta
// a video, mai ricalcolati qui. I disegni quotati ci sono sempre e sono SCHEMATICI in
// larghezza (il profilo è disegnato più largo per leggerci le lavorazioni), in
// scala sulla lunghezza. Le quote scritte fanno fede.
//
// SCHERMO E STAMPA: a schermo la scheda è UNA pagina alta quanto il contenuto, da
// scorrere senza interruzioni; le pagine A4 servono solo per stampare
// (`creaSchedaProduzione`). Il disegno è lo stesso, cambia solo dove si va a capo.
//
// jsPDF con i font standard: solo caratteri WinAnsi (niente ⌀ ≈ →; si usa Ø).

import { jsPDF } from 'jspdf';
import { calcolaImballaggio, PEZZO, type Progetto, type PezzoBarra, type PezzoBordo } from '../../logic/griglie/progetto';
import { calcolaRichiesta, AVANZO_MINIMO, type PianoTaglio, type PezzoDaTagliare, type RichiestaPiano } from '../../logic/griglie/nesting';
import { poligonoBarra } from '../../logic/griglie/disegno';
import { eBiancoDiSerie } from '../../logic/griglie/finiture';
import { BARRA, PROFILO_U, INGLESINA_26 } from '../../logic/griglie/materiali';
import type { Punto } from '../../logic/griglie/diagonale';

/** Un pannello della commessa, già calcolato. */
export interface PannelloScheda {
  codice: string;      // P1, P2, P3…
  progetto: Progetto;
  finitura: string;    // nome dal listino, '' se non scelta
  telai: number;       // telai identici di questo pannello
}

export interface OpzioniScheda {
  commessa: string;
  cliente: string;
  data: string;                      // gg/mm/aaaa
  kerf: number;                      // mm per taglio
  intestatura?: number;              // mm rifilati in testa a ogni barra nuova; assente = di serie
  steccaInglesina: number | null;    // PREMIUM: senza, niente piano di taglio
  pesoBarraKgM: number | null;       // barra 18×8
  pesoInglesinaKgM: number | null;   // inglesina 26
  congelataIl?: string;              // gg/mm/aaaa: commessa in produzione, quote fotografate
  /** Piani già calcolati dalla pagina, per chiave di materiale (v. richiestePiani): il PDF non li ricalcola. */
  piani?: ReadonlyMap<string, PianoTaglio>;
}

type Rgb = [number, number, number];
// Palette dei PDF POPS (billingPdfDraw.ts)
const INK: Rgb = [26, 24, 21];
const MID: Rgb = [106, 101, 96];
const DIM: Rgb = [150, 145, 138];
const AMBER: Rgb = [251, 191, 36];
const LINE: Rgb = [224, 221, 215];
const TINT: Rgb = [248, 247, 243];
const COLORE_PEZZO: Rgb = [236, 232, 222];
const SCURO: Rgb = [60, 56, 50];
const VERDE: Rgb = [167, 228, 196];       // avanzo che resta al banco
const VERDE_SCURO: Rgb = [4, 120, 87];
const AMBRA_SCURO: Rgb = [180, 83, 9];
const ROSA: Rgb = [251, 207, 216];        // avanzo troppo corto: sfrido
const ROSSO: Rgb = [190, 18, 60];

/**
 * Nello schema di montaggio ogni codice ha un colore: i pezzi uguali si riconoscono a
 * colpo d'occhio. I colori si assegnano PER PANNELLO, nell'ordine dei codici: ogni
 * schema riparte dal primo e 12 colori bastano quasi sempre. Lo stesso codice può
 * quindi avere colori diversi in schemi diversi: fuori dagli schemi il colore non
 * compare, il collegamento lo fa il codice scritto. Tinte chiare, perché sopra ci sono
 * linee e bollini. Oltre i 12 colori (un rombo grande arriva a 24 codici) il colore si
 * ripete con una TRAMA: puntini, poi quadrettato +, poi quadrettato ×. Trame senza una
 * direzione sola, così si vedono anche sulle barre in diagonale.
 */
const COLORI_CODICE: Rgb[] = [
  [253, 186, 116], [147, 197, 253], [134, 239, 172], [249, 168, 212],
  [196, 181, 253], [253, 224, 71], [94, 234, 212], [252, 165, 165],
  [165, 180, 252], [190, 242, 100], [216, 180, 254], [125, 211, 252],
];

const M = 16;
const LARGH = 210 - 2 * M;   // 178
const FONDO = 282;           // oltre si va a pagina nuova
const ALTEZZA_MAX = 5000;    // mm: oltre, i lettori PDF non aprono la pagina (limite 14400 pt)

const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const n1 = (v: number) => nf.format(v);
const mm = (v: number) => `${nf.format(v)} mm`;
const kg = (v: number) => `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const metri = (vMm: number) => `${(vMm / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const plurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

// --- Dati (puri): cosa va nel documento -------------------------------------

export type GruppoPezzo = 'T' | 'V' | 'O' | 'B';

/** Un pezzo della commessa: tutti gli esemplari intercambiabili, sotto un codice. */
export interface TipoPezzo {
  codice: string;
  gruppo: GruppoPezzo;
  nomi: string[];             // b TELAIO, h TELAIO… (un telaio quadrato li unisce)
  lunghezza: number;
  quantita: number;           // su tutta la commessa
  quantitaCieca: number;      // barre forate (altri stili): di cui a foro cieco…
  quantitaPassante: number;   // …e a foro passante
  // Un esemplare: misure e lavorazioni sono le stesse per tutti
  pezzo: PezzoBordo | PezzoBarra;
  pannello: PannelloScheda;
}

export interface Codifica {
  tipi: TipoPezzo[];
  codice(pn: PannelloScheda, etichetta: string): string;
}

const gruppoDi = (etichetta: string, bordo: boolean): GruppoPezzo =>
  bordo ? 'T' : etichetta === PEZZO.VERTICALE ? 'V' : etichetta === PEZZO.ORIZZONTALE ? 'O' : 'B';

/** I pezzi della commessa, con i pezzi intercambiabili riuniti sotto un codice (v. CODICI). */
export function codificaPezzi(pannelli: PannelloScheda[]): Codifica {
  const r = (v: number) => v.toFixed(1);
  const perFirma = new Map<string, TipoPezzo>();
  const firmaDi = new Map<PannelloScheda, Map<string, string>>();

  for (const pn of pannelli) {
    const p = pn.progetto, firme = new Map<string, string>();
    firmaDi.set(pn, firme);
    const pezzi = [...p.bordi.map((b) => ({ b, bordo: true })), ...p.barre.map((b) => ({ b, bordo: false }))];
    for (const { b, bordo } of pezzi) {
      const gruppo = gruppoDi(b.etichetta, bordo);
      // Cosa rende due pezzi NON intercambiabili
      const firma = [p.premium ? 'PREMIUM' : 'STD', finituraDi(pn), gruppo, r(b.lunghezza), b.taglio];
      if ('fori' in b) firma.push((b.fori ?? []).map(r).join(','));
      if ('posizioni' in b) {
        if (p.premium) firma.push(r(p.premium.sormontoPerLato), gruppo === 'V' ? p.premium.scasso.assi.map(r).join(',') : '');
        else firma.push(b.posizioni.map(r).join(','));
      }
      const chiave = firma.join('|');
      firme.set(b.etichetta, chiave);
      const n = b.quantitaPerTelaio * pn.telai;
      const tipo = perFirma.get(chiave);
      if (tipo) {
        tipo.quantita += n;
        if (!tipo.nomi.includes(b.etichetta)) tipo.nomi.push(b.etichetta);
      } else {
        perFirma.set(chiave, { codice: '', gruppo, nomi: [b.etichetta], lunghezza: b.lunghezza, quantita: n, quantitaCieca: 0, quantitaPassante: 0, pezzo: b, pannello: pn });
      }
      if ('quantitaCieca' in b) {
        const t = perFirma.get(chiave)!;
        t.quantitaCieca += b.quantitaCieca * pn.telai;
        t.quantitaPassante += b.quantitaPassante * pn.telai;
      }
    }
  }

  // Numerati per gruppo, dal più lungo al più corto
  const ordine: GruppoPezzo[] = ['T', 'V', 'O', 'B'];
  const tipi = [...perFirma.values()].sort((a, b) => ordine.indexOf(a.gruppo) - ordine.indexOf(b.gruppo) || b.lunghezza - a.lunghezza);
  const contatori = new Map<GruppoPezzo, number>();
  for (const t of tipi) {
    const n = (contatori.get(t.gruppo) ?? 0) + 1;
    contatori.set(t.gruppo, n);
    t.codice = `${t.gruppo}${n}`;
  }
  return {
    tipi,
    codice: (pn, etichetta) => {
      const chiave = firmaDi.get(pn)?.get(etichetta);
      return chiave ? perFirma.get(chiave)!.codice : '';
    },
  };
}

const finituraDi = (pn: PannelloScheda) => pn.finitura || pn.progetto.config.famigliaFinitura || '';

/** Un materiale della commessa (profilo + finitura) e la richiesta del suo piano di taglio. */
export interface MaterialeTaglio {
  nome: string;                       // «Inglesina 26 BIANCO 9010»: è anche la chiave del piano
  profilo: 'INGLESINA' | 'U' | 'BARRA';
  metri: number;                      // somma dei pezzi
  richiesta: RichiestaPiano | null;   // null: manca la lunghezza della barra
}

/**
 * I materiali della commessa, ognuno con i suoi pezzi (codificati): uno per
 * profilo e finitura. Sul PREMIUM cornice e interni sono la stessa inglesina.
 * Sul bianco di serie il piano è ottimizzato sullo scarto (v. nesting.ts).
 */
export function materialiDiTaglio(pannelli: PannelloScheda[], o: Pick<OpzioniScheda, 'kerf' | 'intestatura' | 'steccaInglesina'>): MaterialeTaglio[] {
  const codifica = codificaPezzi(pannelli);
  const perNome = new Map<string, { m: MaterialeTaglio; stecca: number | null; bianco: boolean; pezzi: PezzoDaTagliare[] }>();
  const aggiungi = (nomeProfilo: string, profilo: MaterialeTaglio['profilo'], stecca: number | null, pn: PannelloScheda, pezzi: (PezzoBordo | PezzoBarra)[]) => {
    const fin = finituraDi(pn);
    const nome = fin ? `${nomeProfilo} ${fin}` : nomeProfilo;
    const voce = perNome.get(nome) ?? { m: { nome, profilo, metri: 0, richiesta: null }, stecca, bianco: eBiancoDiSerie(fin), pezzi: [] };
    for (const b of pezzi) voce.pezzi.push({ etichetta: codifica.codice(pn, b.etichetta), lunghezza: b.lunghezza, quantita: b.quantitaPerTelaio * pn.telai });
    perNome.set(nome, voce);
  };
  for (const pn of pannelli) {
    const p = pn.progetto;
    if (p.premium) {
      aggiungi('Inglesina 26', 'INGLESINA', o.steccaInglesina, pn, [...p.bordi, ...p.barre]);
    } else {
      if (p.bordi.length) aggiungi('Profilo a U', 'U', PROFILO_U.stecca, pn, p.bordi);
      aggiungi(`Barra ${BARRA.larghezza}x${BARRA.spessore}`, 'BARRA', BARRA.stecca, pn, p.barre);
    }
  }
  return [...perNome.values()].map(({ m, stecca, bianco, pezzi }) => ({
    ...m,
    metri: pezzi.reduce((t, x) => t + x.lunghezza * x.quantita, 0),
    richiesta: stecca
      ? { chiave: m.nome, pezzi, lunghezzaStecca: stecca, kerf: o.kerf, opzioni: { intestatura: o.intestatura, ottimizza: bianco } }
      : null,
  }));
}

/** I piani da calcolare per questi pannelli: è ciò che la pagina manda al worker. */
export const richiestePiani = (pannelli: PannelloScheda[], o: Pick<OpzioniScheda, 'kerf' | 'intestatura' | 'steccaInglesina'>): RichiestaPiano[] =>
  materialiDiTaglio(pannelli, o).flatMap((m) => (m.richiesta ? [m.richiesta] : []));

/**
 * I piani di taglio, uno per materiale; `null` se manca la lunghezza della barra.
 * Quelli già calcolati dalla pagina (`o.piani`) si usano così come sono; gli altri
 * si calcolano qui.
 */
export function pianiDiTaglio(pannelli: PannelloScheda[], o: OpzioniScheda): { nome: string; piano: PianoTaglio | null; metri: number }[] {
  return materialiDiTaglio(pannelli, o).map((m) => ({
    nome: m.nome,
    piano: m.richiesta ? (o.piani?.get(m.richiesta.chiave) ?? calcolaRichiesta(m.richiesta)) : null,
    metri: m.metri,
  }));
}

export interface RigaPicking { voce: string; quantita: string }

export function righePicking(pannelli: PannelloScheda[], o: OpzioniScheda, piani = pianiDiTaglio(pannelli, o)): RigaPicking[] {
  const righe: RigaPicking[] = piani.map(({ nome, piano, metri: tot }) => {
    if (!piano) return { voce: `${nome} · lunghezza della barra non impostata`, quantita: metri(tot) };
    // Le barre contate non bastano se un pezzo è più lungo della barra: lo si dice qui, non solo nel piano
    const fuori = [...new Set(piano.nonRicavabili.map((p) => p.etichetta))];
    return {
      voce: fuori.length ? `${nome} · ATTENZIONE: ${fuori.join(', ')} più lungh${fuori.length > 1 ? 'i' : 'o'} della barra, esclus${fuori.length > 1 ? 'i' : 'o'}` : nome,
      quantita: String(piano.nStecche),
    };
  });

  // Minuteria: sommata su tutti i pannelli
  const somma = (f: (pn: PannelloScheda) => number) => pannelli.reduce((t, pn) => t + f(pn) * pn.telai, 0);
  const giunzioni = somma((pn) => pn.progetto.premium?.minuteria.giunzioni ?? 0);
  const perni = somma((pn) => pn.progetto.premium?.minuteria.perni ?? 0);
  const giunzioniL = somma((pn) => pn.progetto.premium?.minuteria.giunzioniL ?? 0);
  const rivetti = somma((pn) => pn.progetto.premium ? 0 : pn.progetto.nRivetti);
  if (giunzioni) righe.push({ voce: 'Giunzioni interne', quantita: String(giunzioni) });
  if (perni) righe.push({ voce: 'Perni tondi', quantita: String(perni) });
  if (giunzioniL) righe.push({ voce: 'Giunzioni a L', quantita: String(giunzioniL) });
  if (rivetti) righe.push({ voce: 'Rivetti', quantita: String(rivetti) });
  return righe;
}

const pesoKgM = (pn: PannelloScheda, o: OpzioniScheda) => pn.progetto.premium ? o.pesoInglesinaKgM : o.pesoBarraKgM;

// --- Documento ---------------------------------------------------------------

/** Il nome della scheda: titolo del PDF e, con «.pdf», nome del file scaricato. */
export function nomeScheda(o: Pick<OpzioniScheda, 'commessa' | 'cliente' | 'data'>): string {
  const parti = ['Scheda produzione', o.commessa, o.cliente, o.data.replace(/\//g, '-')].map((x) => x.trim()).filter(Boolean);
  // Niente caratteri che un file system rifiuta
  return parti.join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * La scheda pronta da aprire. A schermo una pagina sola, alta quanto serve: si
 * disegna una volta per misurarla e una volta sulla pagina giusta. Se la commessa
 * è troppo lunga per una pagina sola, si torna alle A4.
 * In stampa: A4, e il lettore apre subito la finestra di stampa.
 */
export function creaSchedaProduzione(pannelli: PannelloScheda[], opzioni: OpzioniScheda, per: 'schermo' | 'stampa'): jsPDF {
  // I piani si calcolano una volta sola, anche se a schermo si disegna due volte
  const o = opzioni.piani ? opzioni : { ...opzioni, piani: new Map(richiestePiani(pannelli, opzioni).map((r) => [r.chiave, calcolaRichiesta(r)])) };
  if (per === 'schermo') {
    const altezza = disegnaSchedaProduzione(new jsPDF({ unit: 'mm', format: [210, ALTEZZA_MAX] }), pannelli, o, true);
    if (altezza <= ALTEZZA_MAX) {
      const doc = new jsPDF({ unit: 'mm', format: [210, Math.max(altezza, 297)] });
      disegnaSchedaProduzione(doc, pannelli, o, true);
      return doc;
    }
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  disegnaSchedaProduzione(doc, pannelli, o);
  if (per === 'stampa') doc.autoPrint();
  return doc;
}

// --- Disegno -----------------------------------------------------------------

/** `continua`: niente salti pagina, la pagina deve essere alta abbastanza. Torna l'altezza usata (mm). */
export function disegnaSchedaProduzione(doc: any, pannelli: PannelloScheda[], o: OpzioniScheda, continua = false): number {
  const setText = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (stile: 'normal' | 'bold', size: number, colore: Rgb = INK) => {
    doc.setFont('helvetica', stile); doc.setFontSize(size); setText(colore);
  };

  /** Poligono chiuso dai punti assoluti (mm sulla pagina). */
  const poligono = (pts: Punto[], stile: 'F' | 'S' | 'FD') => {
    if (pts.length < 2) return;
    const deltas = pts.slice(1).map((q, i) => [q.x - pts[i]!.x, q.y - pts[i]!.y]);
    doc.lines(deltas, pts[0]!.x, pts[0]!.y, [1, 1], stile, true);
  };

  let y = 0;
  const nuovaPagina = () => { doc.addPage(); y = 18; };
  const spazio = (h: number) => { if (!continua && y + h > FONDO) nuovaPagina(); };

  /** `minimo`: lo spazio che serve al contenuto subito sotto, così il titolo non resta orfano a fondo pagina. */
  const titoloSezione = (titolo: string, sottotitolo?: string, minimo = 16) => {
    spazio(minimo + 25);
    y += 22;   // aria sopra ogni sezione: si vede dove ne comincia un'altra
    setFill(AMBER); doc.rect(M, y - 5, 2.2, 6.6, 'F');
    font('bold', 15); doc.text(titolo.toUpperCase(), M + 5.5, y);
    const larghezzaTitolo = doc.getTextWidth(titolo.toUpperCase());   // misurata col carattere del titolo
    if (sottotitolo) {
      font('normal', 8.5, MID);
      // Accanto al titolo se ci sta, altrimenti sotto
      if (M + 5.5 + larghezzaTitolo + 3 + doc.getTextWidth(sottotitolo) <= M + LARGH) {
        doc.text(sottotitolo, M + 5.5 + larghezzaTitolo + 3, y);
      } else {
        y += 4.5;
        doc.text(sottotitolo, M + 5.5, y);
      }
    }
    y += 2.5;
    setDraw(INK); doc.setLineWidth(0.5); doc.line(M, y, M + LARGH, y);
    y += 6;
  };

  /** Intestazione di un pezzo dentro una sezione (pressetta, trapano, foratura). */
  const titoloPezzo = (testo: string) => {
    font('bold', 9.5); doc.text(testo, M, y);
    y += 4.5;
  };

  type Colonna = { titolo: string; larghezza: number; destra?: boolean; campione?: boolean };   // campione: la cella è un codice, col suo colore
  /** Una riga `{ gruppo }` è un'intestazione dentro la tabella (es. TELAIO, VERTICALI). */
  const tabella = (colonne: Colonna[], righe: (string[] | { gruppo: string })[], spunta = false, forti = 1) => {
    const xSpunta = M;
    const x0 = spunta ? M + 7 : M;
    const riga = 6.2;
    spazio(riga * 2);
    font('bold', 7, DIM);
    let x = x0;
    for (const c of colonne) {
      doc.text(c.titolo.toUpperCase(), c.destra ? x + c.larghezza : x, y, c.destra ? { align: 'right' } : undefined);
      x += c.larghezza;
    }
    y += 2;
    setDraw(LINE); doc.setLineWidth(0.3); doc.line(M, y, M + LARGH, y);
    for (const r of righe) {
      if (!Array.isArray(r)) {
        spazio(riga * 2);
        y += riga + 0.4;
        font('bold', 7.5, AMBRA_SCURO); doc.text(r.gruppo.toUpperCase(), x0, y);
        y += 1.6;
        setDraw(LINE); doc.setLineWidth(0.2); doc.line(M, y, M + LARGH, y);
        continue;
      }
      spazio(riga);
      y += riga - 1.6;
      if (spunta) { setDraw(MID); doc.setLineWidth(0.3); doc.rect(xSpunta, y - 3.2, 3.6, 3.6); }
      x = x0;
      r.forEach((testo, i) => {
        const c = colonne[i]!;
        const forte = i < forti || c.destra;
        const carattere = () => font(forte ? 'bold' : 'normal', 9, forte ? INK : MID);
        carattere();
        // Un codice col suo colore: il quadratino prima del testo
        let xTesto = c.destra ? x + c.larghezza : x;
        if (c.campione && coloreCodice(testo)) {
          campione(testo, c.destra ? xTesto - doc.getTextWidth(testo) - 4.2 : x, y);
          carattere();
          if (!c.destra) xTesto += 4.5;
        }
        doc.text(testo, xTesto, y, c.destra ? { align: 'right' } : undefined);
        x += c.larghezza;
      });
      y += 1.6;
      setDraw(LINE); doc.setLineWidth(0.2); doc.line(M, y, M + LARGH, y);
    }
    y += 5;
  };

  const paragrafo = (testo: string, size = 8.5, colore: Rgb = MID) => {
    font('normal', size, colore);
    const righe: string[] = doc.splitTextToSize(testo, LARGH);
    spazio(righe.length * size * 0.42 + 2);
    doc.text(righe, M, y);
    y += righe.length * size * 0.42 + 2;
  };

  const unico = pannelli.length === 1;
  const codifica = codificaPezzi(pannelli);
  const codicePezzo = codifica.codice;
  const piani = pianiDiTaglio(pannelli, o);   // una volta sola: servono al picking e al piano
  type Trama = 0 | 1 | 2 | 3;   // nessuna, puntini, quadrettato +, quadrettato ×
  type Stile = { colore: Rgb; trama: Trama };
  /** Colori e trame dei codici di UN pannello, nell'ordine dei codici (v. COLORI_CODICE). */
  const stiliDi = (pn: PannelloScheda): Map<string, Stile> => {
    const presenti = new Set([...pn.progetto.bordi, ...pn.progetto.barre].map((b) => codicePezzo(pn, b.etichetta)));
    return new Map(codifica.tipi.filter((t) => presenti.has(t.codice)).map((t, i) => [t.codice, {
      colore: COLORI_CODICE[i % COLORI_CODICE.length]!,
      trama: (Math.floor(i / COLORI_CODICE.length) % 4) as Trama,
    }]));
  };
  // Valgono solo mentre si disegna lo schema di un pannello (e la sua legenda)
  let stili = new Map<string, Stile>();
  const coloreCodice = (codice: string) => stili.get(codice)?.colore;
  /** La trama di un codice sopra il poligono `pts`, già riempito del suo colore. */
  const trama = (codice: string, pts: Punto[]) => {
    const tipo = stili.get(codice)?.trama;
    if (!tipo || pts.length < 3) return;
    doc.saveGraphicsState();
    doc.moveTo(pts[0]!.x, pts[0]!.y);
    for (const q of pts.slice(1)) doc.lineTo(q.x, q.y);
    doc.close(); doc.clip(); doc.discardPath();
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), h = y1 - y0;
    const passo = 1.4;
    setDraw(SCURO); setFill(SCURO); doc.setLineWidth(0.2);
    if (tipo === 1) {
      for (let yy = y0 + passo / 2; yy < y1; yy += passo) for (let xx = x0 + passo / 2; xx < x1; xx += passo) doc.circle(xx, yy, 0.14, 'F');
    } else if (tipo === 2) {
      for (let yy = y0 + passo / 2; yy < y1; yy += passo) doc.line(x0, yy, x1, yy);
      for (let xx = x0 + passo / 2; xx < x1; xx += passo) doc.line(xx, y0, xx, y1);
    } else {
      for (let x = x0 - h; x <= x1; x += passo) { doc.line(x, y1, x + h, y0); doc.line(x, y0, x + h, y1); }
    }
    doc.restoreGraphicsState();
  };
  const rettangolo = (x: number, y: number, w: number, h: number): Punto[] =>
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  /** Il quadratino del colore di un codice, con l'angolo in alto a sinistra in (x, yTesto - 2,7). */
  const campione = (codice: string, x: number, yTesto: number) => {
    const c = coloreCodice(codice);
    if (!c) return;
    setFill(c); setDraw(MID); doc.setLineWidth(0.2);
    doc.rect(x, yTesto - 2.7, 3, 3, 'FD');
    trama(codice, rettangolo(x, yTesto - 2.7, 3, 3));
  };
  const nomeTipo = (t: TipoPezzo) => t.nomi.join(' / ');
  const NOMI_GRUPPO: Record<GruppoPezzo, string> = { T: 'Telaio', V: 'Verticali', O: 'Orizzontali', B: 'Barre' };
  const descriviPannello = (pn: PannelloScheda) => {
    const c = pn.progetto.config;
    const nV = pn.progetto.assiVerticali.length, nO = pn.progetto.assiOrizzontali.length;
    return {
      stile: c.stile + (pn.progetto.premium ? ' · inglesina 26' : ''),
      misure: `${n1(c.larghezza)} x ${n1(c.altezza)} mm`,
      composizione: nV || nO ? `${plurale(nV, 'verticale', 'verticali')} x ${plurale(nO, 'orizzontale', 'orizzontali')}` : '',
      compatta: nV || nO ? `${nV} V x ${nO} O` : '',
      finitura: finituraDi(pn) || '—',
    };
  };

  // ── TESTATA ────────────────────────────────────────────────────────────────
  y = 14;
  font('bold', 14, AMBER);
  const titolo = 'SCHEDA DI PRODUZIONE';
  const bw = doc.getTextWidth(titolo) + 12;
  setFill(INK); doc.roundedRect(M, y, bw, 11, 1.8, 1.8, 'F');
  doc.text(titolo, M + 6, y + 7.4);
  if (o.congelataIl) {
    font('bold', 7.5, MID);
    doc.text(`IN PRODUZIONE · quote congelate il ${o.congelataIl}`, M, y + 16);
  }

  // Commessa / cliente / data, a destra
  const campi: [string, string][] = [['Commessa', o.commessa || '—'], ['Cliente', o.cliente || '—'], ['Data', o.data]];
  let yc = y + 3;
  for (const [k, v] of campi) {
    font('normal', 8, MID); doc.text(k, 210 - M - 62, yc);
    font('bold', 9.5); doc.text(doc.splitTextToSize(v, 46)[0], 210 - M, yc, { align: 'right' });
    yc += 5;
  }
  y = Math.max(y + (o.congelataIl ? 18 : 11), yc) + 4;
  setDraw(LINE); doc.setLineWidth(0.3); doc.line(M, y, 210 - M, y);
  y += 6;

  if (unico) {
    // Un pannello: dati a sinistra, disegno montato a destra
    const pn = pannelli[0]!;
    const p = pn.progetto, d = descriviPannello(pn);
    const dati: [string, string][] = [['Pannello', pn.codice], ['Stile', d.stile], ['Misure esterne', d.misure]];
    if (d.composizione) dati.push(['Composizione', d.composizione]);
    dati.push(['Finitura', d.finitura]);
    if (p.premium) dati.push(['Sormonto', `${n1(p.premium.sormonto)} mm (${n1(p.premium.sormontoPerLato)} per lato)`]);
    if (p.assiVerticali.length) dati.push(['Luce fra i verticali', `${mm(p.vuotoX)} · interasse ${mm(p.passoEffettivoX)}`]);
    if (p.assiOrizzontali.length) dati.push(['Luce fra gli orizzontali', `${mm(p.vuotoY)} · interasse ${mm(p.passoEffettivoY)}`]);
    dati.push(['Telai identici', String(pn.telai)]);

    const yDati = y;
    for (const [k, v] of dati) {
      font('normal', 7.5, DIM); doc.text(k.toUpperCase(), M, y);
      font('bold', 10); doc.text(v, M, y + 4.6);
      y += 10;
    }

    const box = { x: 112, y: yDati - 3, w: 82, h: Math.max(y - yDati, 92) };
    disegnaPannello(pn, box, false);
    y = Math.max(y, box.y + box.h) + 4;
  } else {
    // Più pannelli: l'elenco
    titoloSezione('Pannelli');
    tabella(
      [{ titolo: 'Q.tà', larghezza: 14 }, { titolo: 'Stile', larghezza: 46 }, { titolo: 'Finitura', larghezza: 42 }, { titolo: 'Misure (mm)', larghezza: 32 }, { titolo: 'Griglia', larghezza: 26 }, { titolo: 'Cod.', larghezza: 18 }],
      pannelli.map((pn) => {
        const d = descriviPannello(pn);
        return [String(pn.telai), d.stile, d.finitura, d.misure.replace(' mm', ''), d.compatta, pn.codice];
      }),
      false,
    );
  }

  // ── PICKING ────────────────────────────────────────────────────────────────
  titoloSezione('Picking');
  tabella(
    [{ titolo: 'Q.tà', larghezza: 20 }, { titolo: 'Materiale', larghezza: 151 }],
    righePicking(pannelli, o, piani).map((r) => [r.quantita, r.voce]),
    true,
    2,
  );

  // ── TAGLIO ────────────────────────────────────────────────────────────────
  titoloSezione('Taglio');
  // Un riga per codice, per gruppo, dal più lungo al più corto (l'ordine dei codici)
  {
    const righe: (string[] | { gruppo: string })[] = [];
    let gruppo: GruppoPezzo | null = null;
    for (const t of codifica.tipi) {
      if (t.gruppo !== gruppo) { gruppo = t.gruppo; righe.push({ gruppo: NOMI_GRUPPO[gruppo] }); }
      righe.push([String(t.quantita), nomeTipo(t), mm(t.lunghezza), t.codice]);
    }
    tabella(
      [{ titolo: 'Q.tà', larghezza: 20 }, { titolo: 'Pezzo', larghezza: 70 }, { titolo: 'Misura', larghezza: 40, destra: true }, { titolo: 'Cod.', larghezza: 41, destra: true }],
      righe,
      true,
      4,
    );
  }

  // ── PIANO DI TAGLIO: una sezione per materiale, una battuta per misura ───────
  for (const { nome, piano } of piani) {
    if (!piano) {
      titoloSezione('Piano di taglio');
      paragrafo(`${nome}: piano di taglio non calcolato, manca la lunghezza della barra.`);
      continue;
    }
    if (!piano.passi.length && !piano.nonRicavabili.length) continue;
    titoloSezione('Piano di taglio', undefined, 40);
    // Il materiale e quante barre prelevare
    font('bold', 11); doc.text(nome.toUpperCase(), M, y);
    doc.text(`${plurale(piano.nStecche, 'barra', 'barre')} da ${metri(piano.lunghezzaStecca)}`, M + LARGH, y, { align: 'right' });
    if (piano.ottimizzato) {
      // Si vede a colpo d'occhio quale piano è: solo il bianco di serie è ottimizzato
      const x = M + doc.getTextWidth(nome.toUpperCase()) + 4, testo = 'ottimizzato sullo scarto';
      font('bold', 7.5, VERDE_SCURO);
      const w = doc.getTextWidth(testo) + 4;
      setFill(VERDE); setDraw(VERDE_SCURO); doc.setLineWidth(0.3);
      doc.roundedRect(x, y - 3.6, w, 4.8, 1, 1, 'FD');
      doc.text(testo, x + 2, y - 0.2);
    }
    y += 6;

    // Blocchetti: tutti col bordo. La fonte porta scritta la sua lunghezza (lo spezzone si
    // cerca sul banco per misura), l'avanzo la sua; cosa vogliono dire lo dice la legenda.
    type Stile = 'nuova' | 'pezzo' | 'spezzone' | 'banco' | 'magazzino' | 'scarto';
    const STILE: Record<Stile, { fondo: Rgb; tratto: Rgb }> = {
      nuova: { fondo: [255, 255, 255], tratto: INK },
      pezzo: { fondo: AMBER, tratto: AMBRA_SCURO },
      spezzone: { fondo: VERDE, tratto: VERDE_SCURO },
      banco: { fondo: VERDE, tratto: VERDE_SCURO },
      magazzino: { fondo: LINE, tratto: MID },
      scarto: { fondo: ROSA, tratto: ROSSO },
    };
    const blocco = (stile: Stile, x: number, yc: number, w: number, testo: string, peso: 'bold' | 'normal' = 'bold', size = 8.5) => {
      const h = 5, { fondo, tratto } = STILE[stile];
      const su = yc - h / 2, giu = yc + h / 2;
      setFill(fondo); setDraw(tratto); doc.setLineWidth(0.4);
      const storta = stile === 'spezzone' || stile === 'banco';
      if (storta) {
        // Coda tagliata in diagonale: è in lavorazione, esce dal banco e ci torna (stesso pezzo)
        poligono([{ x, y: su }, { x: x + w, y: su }, { x: x + w - 2, y: giu }, { x, y: giu }], 'FD');
      } else {
        doc.rect(x, su, w, h, 'FD');
      }
      const centro = storta ? (w - 1.2) / 2 : w / 2;
      font(peso, size, tratto);
      doc.text(testo, x + centro, yc + size * 0.13, { align: 'center' });
    };

    // Dove vanno i metri comprati, fatto 100 il totale delle barre: profilo, magazzino,
    // scarto (avanzi corti + lama + rifilo). In scala, ma ogni blocco presente resta
    // largo abbastanza da leggerne i numeri.
    {
      const voci = ([
        ['pezzo', piano.materialeUtile], ['magazzino', piano.materialeMagazzino], ['scarto', piano.materialeScarto],
      ] as [Stile, number][]).filter(([, v]) => v > 0.5);
      const totale = piano.materialeAcquistato, minimo = 30, h = 7;
      const larghezze = voci.map(([, v]) => (v / totale) * LARGH);
      const corti = larghezze.filter((w) => w < minimo);
      const daTogliere = corti.reduce((t, w) => t + (minimo - w), 0);
      const lunghi = larghezze.filter((w) => w >= minimo).reduce((t, w) => t + w, 0);
      let x = M;
      voci.forEach(([stile, v], i) => {
        const w0 = larghezze[i]!, w = w0 < minimo ? minimo : w0 - (daTogliere * w0) / lunghi;
        const { fondo, tratto } = STILE[stile];
        setFill(fondo); setDraw(tratto); doc.setLineWidth(0.4);
        doc.rect(x + 0.3, y, w - 0.6, h, 'FD');
        font('bold', 9, tratto);
        doc.text(`${n1((v / totale) * 100)}%  ·  ${metri(v)}`, x + w / 2, y + h / 2 + 1.2, { align: 'center' });
        x += w;
      });
      y += h + 6;
    }

    // Colonne, come le tabelle di picking e taglio
    const wIcona = 17;
    const xRip = M + 6, xIcona = xRip + 8.5, xb = xIcona + wIcona + 3;
    const wPezzi = 20;
    // L'avanzo è un blocchetto sempre largo uguale: quanto basta per «0000,0», più testa e coda
    font('bold', 9); const wAvanzo = doc.getTextWidth('0000,0') + 7;
    const xAvanzo = M + LARGH - wAvanzo, xPezzi = xAvanzo - 4;
    const wb = xPezzi - wPezzi - xb;
    const scala = wb / piano.lunghezzaStecca;
    font('bold', 7, DIM);
    doc.text('DA', xRip, y);
    doc.text('SCHEMA DI TAGLIO', xb, y);
    doc.text('TAGLI', xPezzi, y, { align: 'right' });
    doc.text('AVANZO', xAvanzo, y);
    y += 2;
    setDraw(LINE); doc.setLineWidth(0.3); doc.line(M, y, M + LARGH, y);

    for (const passo of piano.passi) {
      // La misura: la si imposta una volta sola, deve saltare all'occhio
      spazio(9 + 7 * Math.min(passo.prelievi.length, 3));
      setFill(TINT); doc.rect(M, y, LARGH, 8, 'F');
      font('bold', 13); doc.text(mm(passo.lunghezza), xIcona, y + 5.8);
      font('bold', 12, AMBRA_SCURO); doc.text(`${passo.quantita} pz`, xPezzi, y + 5.8, { align: 'right' });
      y += 8;

      for (const p of passo.prelievi) {
        spazio(7.5);
        const yc = y + 3.75;
        setDraw(MID); doc.setLineWidth(0.3); doc.rect(M, yc - 1.8, 3.6, 3.6);
        blocco(p.da === 'NUOVA' ? 'nuova' : 'spezzone', xIcona, yc, wIcona, n1(p.lunghezza));
        font('bold', 10); doc.text(`${p.ripetizioni} x`, xRip, yc + 1.3);

        // La fonte in scala sulla barra commerciale: lo spezzone si vede corto
        setFill(TINT); doc.rect(xb, yc - 2.2, wb, 4.4, 'F');
        let x = xb;
        const STACCO = 1;   // mm fra un pezzo e l'altro nel disegno
        for (let k = 0; k < p.pezzi; k++) {
          // Ogni pezzo col suo bordo, staccato dal successivo: si contano a colpo d'occhio.
          // Il distacco si ricava accorciando il disegno del pezzo, non spostando i
          // successivi: le posizioni restano in scala.
          setFill(STILE.pezzo.fondo); setDraw(STILE.pezzo.tratto); doc.setLineWidth(0.4);
          doc.rect(x, yc - 2.2, Math.max(passo.lunghezza * scala - STACCO, 0.4), 4.4, 'FD');
          x += (passo.lunghezza + o.kerf) * scala;
        }
        // Dove va l'avanzo: banco (verde), magazzino (grigio), scarto sotto AVANZO_MINIMO (rosa)
        const dest: Stile = p.alBanco ? 'banco' : p.avanzo < AVANZO_MINIMO ? 'scarto' : 'magazzino';
        // Anche nella barretta l'avanzo ha il bordo del suo colore: banco, magazzino o scarto
        if (p.avanzo > 0) {
          setFill(STILE[dest].fondo); setDraw(STILE[dest].tratto); doc.setLineWidth(0.4);
          doc.rect(x, yc - 2.2, p.avanzo * scala, 4.4, 'FD');
        }

        // Tagli da fare su OGNI fonte di questa riga; «cad.» sempre, così le cifre stanno in colonna
        font('normal', 7, MID); doc.text('cad.', xPezzi, yc + 1.3, { align: 'right' });
        const wCad = doc.getTextWidth('cad.');
        font('bold', 11); doc.text(String(p.pezzi), xPezzi - wCad - 1.2, yc + 1.5, { align: 'right' });

        // Il blocchetto dell'avanzo: la sola misura, il colore dice dove va
        if (p.avanzo > 0) {
          blocco(dest, xAvanzo, yc, wAvanzo, n1(p.avanzo), 'bold', 9);
        } else {
          setDraw(LINE); doc.setLineWidth(0.3); doc.rect(xAvanzo, yc - 2.5, wAvanzo, 5);
          font('normal', 8, DIM); doc.text('nessuno', xAvanzo + wAvanzo / 2, yc + 1.1, { align: 'center' });
        }
        y += 7.5;
        setDraw(LINE); doc.setLineWidth(0.2); doc.line(M, y, M + LARGH, y);
      }
    }
    y += 5;

    // Legenda: blocchetti tutti uguali, col significato scritto dentro
    const wLegenda = 30;
    // Spezzone e avanzo al banco sono lo stesso pezzo: una voce sola, BANCO
    const legenda: [Stile, string][] = [['nuova', 'NUOVA'], ['pezzo', 'PEZZO'], ['banco', 'BANCO'], ['magazzino', 'MAGAZZINO'], ['scarto', 'SCARTO']];
    legenda.forEach(([stile, testo], i) => blocco(stile, M + i * (wLegenda + 5), y + 2.5, wLegenda, testo, 'bold', 7.5));
    y += 9;

    if (piano.nonRicavabili.length) {
      paragrafo(`Pezzi che non escono da una barra nuova: ${piano.nonRicavabili.map((p) => p.etichetta).join(', ')}.`, 8.5, SCURO);
    }
  }

  // ── LAVORAZIONI: un disegno per codice, dal pezzo più lungo al più corto ─────
  // I tipi sono già in quest'ordine (v. codificaPezzi). Disegni in scala comune
  // per sezione: il pezzo più lungo occupa tutta la larghezza.
  const premium = (t: TipoPezzo) => t.pannello.progetto.premium;
  const piuLungo = (tipi: TipoPezzo[]) => Math.max(...tipi.map((t) => t.lunghezza));

  const scassi = codifica.tipi.filter((t) => t.gruppo === 'V' && premium(t)?.scasso.nScassi);
  if (scassi.length) {
    titoloSezione('Scassi', undefined, 75);
    const riferimento = piuLungo(scassi);
    for (const t of scassi) {
      const pr = premium(t)!;
      spazio(50);
      y += 2;
      titoloPezzo(`${t.codice} · ${plurale(t.quantita, 'pezzo', 'pezzi')} da ${mm(t.lunghezza)}`);
      font('bold', 18); doc.text(pr.scasso.etichetta, M, y + 5);
      y += 9;
      paragrafo(`Assi degli orizzontali dalla testa (verifica): ${pr.scasso.assi.map(n1).join(' · ')} mm`);
      pezzoQuotato({
        lunghezza: t.lunghezza, smusso: pr.sormontoPerLato, mitra: false,
        tacche: pr.scasso.assi.map((a) => ({ pos: a, larghezza: 4, lati: 'entrambi' as const })),
        quote: pr.scasso.assi, riferimento,
      });
    }
  }

  const telaiForati = codifica.tipi.filter((t) => t.gruppo === 'T' && premium(t));
  if (telaiForati.length) {
    titoloSezione('Fori', undefined, 50);
    const riferimento = piuLungo(telaiForati);
    for (const t of telaiForati) {
      const fori = ('fori' in t.pezzo && t.pezzo.fori) || [];
      spazio(45);   // intestazione e disegno del pezzo restano insieme
      titoloPezzo(`${t.codice} · ${nomeTipo(t)} · ${mm(t.lunghezza)} · ${plurale(t.quantita, 'pezzo', 'pezzi')}`);
      font('normal', 9, MID); doc.text(`Fori a: ${fori.map(n1).join(' · ')} mm`, M, y);
      y += 4;
      pezzoQuotato({
        lunghezza: t.lunghezza, mitra: true,
        tacche: fori.map((f) => ({ pos: f, larghezza: 2, lati: 'interno' as const })),
        quote: fori, riferimento,
      });
    }
  }

  const fresati = codifica.tipi.filter((t) => t.gruppo !== 'T' && premium(t));
  if (fresati.length) {
    titoloSezione('Fresatura e smusso', undefined, 35);
    tabella(
      [{ titolo: 'Q.tà', larghezza: 20 }, { titolo: 'Pezzo', larghezza: 120 }, { titolo: 'Cod.', larghezza: 31 }],
      fresati.map((t) => [String(t.quantita), `${nomeTipo(t)} ${mm(t.lunghezza)}`, t.codice]),
      true,
      3,
    );
  }

  const forate = codifica.tipi.filter((t) => t.gruppo !== 'T' && !premium(t) && 'nFori' in t.pezzo && t.pezzo.nFori);
  if (forate.length) {
    titoloSezione('Foratura', 'quote dalla testa della barra', 50);
    const riferimento = piuLungo(forate);
    for (const t of forate) {
      const b = t.pezzo as PezzoBarra;
      spazio(45);   // intestazione e disegno del pezzo restano insieme
      titoloPezzo(`${t.codice} · ${nomeTipo(t)} · ${mm(t.lunghezza)} · ${plurale(t.quantita, 'pezzo', 'pezzi')}`);
      const tipi = [t.quantitaCieca ? `${t.quantitaCieca} a foro cieco (strato a vista)` : '', t.quantitaPassante ? `${t.quantitaPassante} a foro passante` : ''].filter(Boolean).join(' · ');
      font('normal', 9, MID);
      doc.text(`${b.nFori} fori · primo ${mm(b.primoForo)} · interasse ${mm(b.interasse)} · coda ${mm(b.codaForo)}${tipi ? ' · ' + tipi : ''}`, M, y);
      y += 4;
      pezzoQuotato({ lunghezza: t.lunghezza, mitra: false, tacche: b.posizioni.map((f) => ({ pos: f, larghezza: 4, lati: 'foro' as const })), quote: b.posizioni, nota: 'TESTA', riferimento });
    }
  }

  // ── SCHEMA DI MONTAGGIO: una sezione per pannello ───────────────────────────
  for (const pn of pannelli) {
    const c = pn.progetto.config;
    const pezzi = [...pn.progetto.bordi, ...pn.progetto.barre];
    // Disegno e legenda sulla STESSA pagina: il disegno prende lo spazio che la legenda lascia.
    const legenda = 6.2 * (pezzi.length + 1) + 8;
    // Con una legenda lunghissima il disegno non scende sotto i 60 mm: la legenda va a capo pagina
    const altezza = Math.max(60, Math.min(170, FONDO - 18 - 18 - legenda, Math.max(90, (LARGH - 6) * (c.altezza / c.larghezza) + 6)));
    const d = descriviPannello(pn);
    titoloSezione(
      `Schema di montaggio · ${pn.codice}`,
      `${d.misure} · ${plurale(pn.telai, 'telaio', 'telai')} · codici della distinta di taglio`,
      altezza + legenda,
    );
    stili = stiliDi(pn);   // i colori di questo schema e della sua legenda
    disegnaPannello(pn, { x: M, y, w: LARGH, h: altezza }, true);
    y += altezza + 9;
    tabella(
      [{ titolo: 'Cod.', larghezza: 16, campione: true }, { titolo: 'Pezzo', larghezza: 58 }, { titolo: 'Lunghezza', larghezza: 40, destra: true }, { titolo: 'Per telaio', larghezza: 64, destra: true }],
      // Una riga per codice: b e h uguali (telaio quadrato) stanno insieme
      [...pezzi.reduce((righe, b) => {
        const codice = codicePezzo(pn, b.etichetta), r = righe.get(codice);
        if (r) { r.nomi.push(b.etichetta); r.n += b.quantitaPerTelaio; }
        else righe.set(codice, { nomi: [b.etichetta], lunghezza: b.lunghezza, n: b.quantitaPerTelaio });
        return righe;
      }, new Map<string, { nomi: string[]; lunghezza: number; n: number }>())]
        .map(([codice, r]) => [codice, r.nomi.join(' / '), mm(r.lunghezza), String(r.n)]),
      false,
      2,
    );
  }
  stili = new Map();   // fuori dagli schemi i codici non hanno colore

  // ── PACKAGING: ingombro e peso di ogni pannello, poi della commessa ─────────
  // I telai identici di un pannello si impilano: lo spessore si somma. La commessa
  // intera è la pila di tutti i pannelli, larga e alta quanto il più grande.
  if (pannelli.length) {
    titoloSezione('Packaging', undefined, 30);
    const cm = (vMm: number) => n1(vMm / 10);
    const colli = pannelli.map((pn) => {
      const imb = calcolaImballaggio(pn.progetto, pesoKgM(pn, o));
      return {
        pn,
        larghezza: pn.progetto.config.larghezza,
        altezza: pn.progetto.config.altezza,
        spessore: pn.progetto.spessorePannello * pn.telai,
        peso: imb.pesoTelaio !== null ? imb.pesoTelaio * pn.telai : null,
      };
    });
    const pesoNoto = colli.every((x) => x.peso !== null);
    const totale = {
      larghezza: Math.max(...colli.map((x) => x.larghezza)),
      altezza: Math.max(...colli.map((x) => x.altezza)),
      spessore: colli.reduce((t, x) => t + x.spessore, 0),
      peso: colli.reduce((t, x) => t + (x.peso ?? 0), 0),
    };
    const ingombro = (x: { larghezza: number; altezza: number; spessore: number }) => `${cm(x.larghezza)} x ${cm(x.altezza)} x ${cm(x.spessore)}`;
    tabella(
      [{ titolo: 'Cod.', larghezza: 20 }, { titolo: 'Q.tà', larghezza: 20 }, { titolo: 'Ingombro (cm)', larghezza: 90 }, { titolo: 'Peso', larghezza: 48, destra: true }],
      [
        ...colli.map((x) => [x.pn.codice, String(x.pn.telai), ingombro(x), x.peso !== null ? kg(x.peso) : 'n.d.']),
        { gruppo: 'Totale commessa' },
        ['', String(colli.reduce((t, x) => t + x.pn.telai, 0)), ingombro(totale), pesoNoto ? kg(totale.peso) : 'n.d.'],
      ],
      false,
      3,
    );
    if (!pesoNoto) paragrafo('Peso non calcolabile: manca il peso al metro di un profilo nei parametri d\'officina.');
  }

  // ── Piè di pagina ───────────────────────────────────────────────────────────
  const piede = `Scheda di produzione${o.commessa ? ' · commessa ' + o.commessa : ''}${o.cliente ? ' · ' + o.cliente : ''}`;
  if (continua) {
    y += 6;
    font('normal', 7.5, DIM); doc.text(piede, M, y);
    return y + 8;
  }
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    font('normal', 7.5, DIM);
    doc.text(piede, M, 290);
    doc.text(`pagina ${i} di ${pagine}`, 210 - M, 290, { align: 'right' });
  }
  return 297;

  // ── Disegni ─────────────────────────────────────────────────────────────────

  /** Il pannello montato, in scala nel riquadro; con i codici, è lo schema di montaggio. */
  function disegnaPannello(pn: PannelloScheda, b: { x: number; y: number; w: number; h: number }, conCodici: boolean) {
    const p = pn.progetto, c = p.config;
    const quota = 6;
    const s = Math.min((b.w - quota) / c.larghezza, (b.h - quota) / c.altezza);
    const ox = b.x + quota + (b.w - quota - c.larghezza * s) / 2;
    const oy = b.y + quota + (b.h - quota - c.altezza * s) / 2;
    const t = (q: Punto): Punto => ({ x: ox + q.x * s, y: oy + q.y * s });

    setFill(TINT); setDraw(LINE); doc.setLineWidth(0.2);
    doc.rect(ox, oy, c.larghezza * s, c.altezza * s, 'F');
    // Con i codici, ogni pezzo prende il colore del suo codice: i pezzi uguali si vedono insieme
    const fondo = (tipo: string): Rgb => (conCodici && coloreCodice(codicePezzo(pn, tipo))) || COLORE_PEZZO;
    setDraw(MID); doc.setLineWidth(0.15);
    const pezzo = (tipo: string, pts: Punto[]) => {
      setFill(fondo(tipo)); setDraw(MID); doc.setLineWidth(0.15);
      poligono(pts, 'FD');
      if (conCodici) trama(codicePezzo(pn, tipo), pts);
    };
    for (const pz of p.disegno.cornice ?? []) pezzo(pz.tipo, pz.punti.map(t));
    for (const bar of p.disegno.barre) pezzo(bar.tipo, poligonoBarra(bar, p.larghezzaBarra).map(t));
    setFill(SCURO);
    for (const r of p.disegno.rivetti) { const q = t(r); doc.circle(q.x, q.y, Math.max(0.25, BARRA.larghezza * 0.17 * s), 'F'); }
    if (p.latoTelaio > 0 && !p.disegno.cornice) {
      // Telaio a U sopra le teste delle barre
      const l = p.latoTelaio * s, w = c.larghezza * s, h = c.altezza * s;
      const lato = (tipo: string, x: number, y: number, lw: number, lh: number) => {
        setFill(fondo(tipo)); doc.rect(x, y, lw, lh, 'F');
        if (conCodici) trama(codicePezzo(pn, tipo), rettangolo(x, y, lw, lh));
      };
      lato(PEZZO.B_TELAIO, ox, oy, w, l); lato(PEZZO.B_TELAIO, ox, oy + h - l, w, l);
      lato(PEZZO.H_TELAIO, ox, oy, l, h); lato(PEZZO.H_TELAIO, ox + w - l, oy, l, h);
      setDraw(MID); doc.rect(ox, oy, w, h); doc.rect(ox + l, oy + l, w - 2 * l, h - 2 * l);
    }

    if (conCodici) {
      // UN bollino per codice, su un pezzo solo: gli altri uguali li dice il colore.
      // Va a metà di una LUCE (fra il bordo e il primo pezzo che lo incrocia o vi si
      // appoggia), mai su un incrocio, dove coprirebbe l'altro pezzo. Fra le barre
      // dello stesso codice si sceglie la più vicina al centro del pannello.
      const primaLuce = (da: number, a: number, incroci: number[]) => {
        const dentro = incroci.filter((v) => v > Math.min(da, a) + 1e-6 && v < Math.max(da, a) - 1e-6).sort((x, z) => x - z);
        return dentro.length ? (Math.min(da, a) + dentro[0]!) / 2 : (da + a) / 2;
      };
      const meta = p.latoTelaio / 2;
      const scelti = new Map<string, { q: Punto; distanza: number }>();
      const candida = (testo: string, q: Punto, distanza: number) => {
        const ora = scelti.get(testo);
        if (testo && (!ora || distanza < ora.distanza)) scelti.set(testo, { q, distanza });
      };
      if (p.latoTelaio > 0) {
        // Telaio: il lato in alto per la b, quello a sinistra per la h (b e h uguali: resta la b)
        const lontano = 1e9;
        candida(codicePezzo(pn, PEZZO.B_TELAIO), t({ x: primaLuce(0, c.larghezza, p.assiVerticali), y: meta }), lontano);
        candida(codicePezzo(pn, PEZZO.H_TELAIO), t({ x: meta, y: primaLuce(0, c.altezza, p.assiOrizzontali) }), lontano);
      }
      for (const bar of p.disegno.barre) {
        const q = bar.famiglia === 'V'
          ? { x: bar.x1, y: primaLuce(bar.y1, bar.y2, p.assiOrizzontali) }
          : bar.famiglia === 'O'
            ? { x: primaLuce(bar.x1, bar.x2, p.assiVerticali), y: bar.y1 }
            : { x: (bar.x1 + bar.x2) / 2, y: (bar.y1 + bar.y2) / 2 };
        const distanza = Math.hypot((bar.x1 + bar.x2) / 2 - c.larghezza / 2, (bar.y1 + bar.y2) / 2 - c.altezza / 2);
        candida(codicePezzo(pn, bar.tipo), t(q), distanza);
      }
      for (const [testo, { q }] of scelti) {
        font('bold', 6.5);
        const r = Math.max(2.4, doc.getTextWidth(testo) / 2 + 1);
        setFill(coloreCodice(testo) ?? [255, 255, 255]); setDraw(INK); doc.setLineWidth(0.35);
        doc.circle(q.x, q.y, r, 'FD');
        doc.text(testo, q.x, q.y + 0.8, { align: 'center' });
      }
    }

    // Quote d'ingombro
    font('bold', 7, DIM);
    doc.text(`${n1(c.larghezza)} mm`, ox + (c.larghezza * s) / 2, oy - 2, { align: 'center' });
    doc.text(`${n1(c.altezza)} mm`, ox - 2, oy + (c.altezza * s) / 2, { align: 'center', angle: 90 });
  }

  /**
   * Un pezzo steso in orizzontale, testa a sinistra. Lunghezza in scala, larghezza
   * schematica (8 mm sul foglio), tacche delle lavorazioni sui bordi e catena di
   * quote dalla testa (o dalla punta lunga) sotto il pezzo.
   * `riferimento`: la lunghezza che occupa tutta la larghezza del foglio. Con il pezzo
   * più lungo della sezione, i pezzi si confrontano a occhio, distanze fra i fori comprese.
   */
  function pezzoQuotato(a: {
    lunghezza: number; smusso?: number; mitra: boolean;
    tacche: { pos: number; larghezza: number; lati: 'entrambi' | 'interno' | 'foro' }[];
    quote: number[]; nota?: string; riferimento?: number;
  }) {
    const h = 8;
    font('normal', 6.5, MID);   // le quote ruotate: la loro "altezza" è la larghezza del testo
    const altezzaQuote = 2 + Math.max(4, ...a.quote.map((q) => doc.getTextWidth(n1(q))));
    spazio(h + altezzaQuote + 14);
    const s = a.riferimento ? (LARGH - 4) / a.riferimento : Math.min((LARGH - 4) / a.lunghezza, 1);
    const x0 = M + 2, y0 = y + 6, L = a.lunghezza * s;

    // Quota totale sopra
    setDraw(DIM); doc.setLineWidth(0.15);
    doc.line(x0, y0 - 3, x0 + L, y0 - 3);
    doc.line(x0, y0 - 4.2, x0, y0 - 1.8); doc.line(x0 + L, y0 - 4.2, x0 + L, y0 - 1.8);
    font('bold', 7.5); doc.text(mm(a.lunghezza), x0 + L / 2, y0 - 4, { align: 'center' });

    // Il pezzo: trapezio a 45° (telaio, punta lunga in alto = lato esterno) o barra con smussi
    let pts: Punto[];
    if (a.mitra) {
      pts = [{ x: x0, y: y0 }, { x: x0 + L, y: y0 }, { x: x0 + L - h, y: y0 + h }, { x: x0 + h, y: y0 + h }];
    } else {
      const c = a.smusso ? Math.min(h / 2, (a.smusso / INGLESINA_26.larghezza) * h) : 0;
      pts = c > 0
        ? [{ x: x0, y: y0 + c }, { x: x0 + c, y: y0 }, { x: x0 + L - c, y: y0 }, { x: x0 + L, y: y0 + c },
           { x: x0 + L, y: y0 + h - c }, { x: x0 + L - c, y: y0 + h }, { x: x0 + c, y: y0 + h }, { x: x0, y: y0 + h - c }]
        : [{ x: x0, y: y0 }, { x: x0 + L, y: y0 }, { x: x0 + L, y: y0 + h }, { x: x0, y: y0 + h }];
    }
    setFill(COLORE_PEZZO); setDraw(MID); doc.setLineWidth(0.25);
    poligono(pts, 'FD');

    // Tacche delle lavorazioni
    setFill(SCURO);
    for (const tc of a.tacche) {
      const cx = x0 + tc.pos * s, w = Math.max(tc.larghezza * s, 0.9), d = 1.4;
      if (tc.lati === 'foro') { doc.circle(cx, y0 + h / 2, Math.max(0.6, w / 2), 'F'); continue; }
      if (tc.lati === 'entrambi') doc.rect(cx - w / 2, y0, w, d, 'F');
      doc.rect(cx - w / 2, y0 + h - d, w, d, 'F');   // lato interno = in basso
    }

    // Catena di quote dal riferimento, sotto il pezzo
    const yq = y0 + h + 2.5;
    setDraw(DIM); doc.setLineWidth(0.15);
    doc.line(x0, y0 + h + 0.8, x0, yq + 1.5);
    font('normal', 6.5, MID);
    for (const q of a.quote) {
      const x = x0 + q * s;
      doc.line(x, y0 + h + 0.8, x, yq + 1.5);
      doc.text(n1(q), x + 0.9, yq + 1.8, { angle: -90 });
    }
    if (a.nota) { font('bold', 6, DIM); doc.text(a.nota, x0, yq + altezzaQuote + 1); }
    y = yq + altezzaQuote + 6;
  }
}
