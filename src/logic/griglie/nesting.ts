// src/logic/griglie/nesting.ts
//
// Piano di taglio da stecca commerciale (U da 4 m, barra da 3 m): quante stecche
// servono, quanto sfrido si fa, e in che ordine tagliare.
//
// UNA BATTUTA PER MISURA: la misura alla sega si imposta a mano, quindi il piano
// procede per misure, dalla più lunga alla più corta, e ogni misura si taglia
// tutta con la battuta ferma. Non costa materiale: su un taglio dritto l'ordine
// in cui si ricavano i pezzi da una stecca non cambia lo sfrido. Costa invece
// gli SPEZZONI, cioè quello che avanza da una misura e aspetta la successiva sul
// banco: il piano dice quali tenere.
//
// DUE ALGORITMI, stessa forma del piano:
// - Best-Fit Decreasing (di serie): per ogni misura prima gli spezzoni, dal più
//   corto in cui il pezzo ci sta, ricavandone quanti più pezzi possibile; poi le
//   stecche nuove. Vicino all'ottimo per numero di stecche, ma non guarda cosa avanza.
// - Ottimizzato (`ottimizza`): ricerca a fascio misura per misura. Prova anche a
//   ricavare un pezzo in meno da uno spezzone, a usarne un altro o a lasciarlo per
//   una misura successiva, e sceglie: meno mm di SCARTO (avanzi sotto
//   AVANZO_MINIMO + rifilo delle stecche aperte) → meno stecche → meno scarti →
//   meno righe. Lo scarto viene PRIMA delle stecche: può aprirne una in più se
//   così si butta meno, e l'avanzo va a magazzino. Conviene sul profilo che si usa
//   sempre (il bianco), non sui colori, dove un avanzo a magazzino resta lì.
//   Se non batte il Best-Fit con lo stesso criterio, vale il Best-Fit.
//
// IL MATERIALE CHE SE NE VA:
// - INTESTATURA: la testa di una stecca nuova si rifila prima del primo pezzo.
//   Gli spezzoni no: la loro testa è già un taglio della lama.
// - LAMA (kerf): ogni pezzo si stacca con un taglio che consuma il suo spessore.
//   Anche l'ultimo: la coda grezza della stecca non fa da testa a un pezzo.

import { DEFAULT_INTESTATURA } from './materiali';

export interface PezzoDaTagliare {
  etichetta: string;
  lunghezza: number;
  quantita: number;
}

/** Fonti IDENTICHE da cui si tagliano pezzi della stessa misura, accorpate. */
export interface Prelievo {
  da: 'NUOVA' | 'SPEZZONE';
  lunghezza: number;    // della fonte prima del taglio: la stecca nuova si conta intera
  pezzi: number;        // pezzi ricavati da CIASCUNA fonte
  avanzo: number;       // quello che resta di ciascuna fonte, trucioli già sottratti
  alBanco: boolean;     // l'avanzo torna come spezzone in una misura successiva
  ripetizioni: number;
}

/** Un'impostazione della battuta: tutti i pezzi di quella misura, in fila. */
export interface PassoTaglio {
  lunghezza: number;
  quantita: number;
  codici: { etichetta: string; quantita: number }[];
  prelievi: Prelievo[];
}

export interface PianoTaglio {
  passi: PassoTaglio[];
  nStecche: number;
  lunghezzaStecca: number;
  intestatura: number;
  materialeUtile: number;     // somma dei pezzi: diventa profilo
  materialeAcquistato: number;
  materialeMagazzino: number; // avanzi finali da AVANZO_MINIMO in su
  materialeScarto: number;    // il resto: avanzi corti + trucioli + intestature
  sfrido: number;             // intestature + trucioli + avanzi
  sfridoPerc: number;
  avanzi: number[];           // pezzi di stecca che restano a fine taglio, dal più lungo
  ottimizzato: boolean;       // cercato il piano con meno scarto (anche se poi vale il Best-Fit)
  nonRicavabili: PezzoDaTagliare[]; // pezzi che non escono da una stecca nuova
}

export interface OpzioniTaglio {
  intestatura?: number;
  ottimizza?: boolean;
}

/**
 * Tutto quello che serve a calcolare un piano, in dati semplici: è ciò che la
 * pagina manda al worker e che il PDF riceve già risolto. `chiave` identifica il
 * materiale (profilo + finitura).
 */
export interface RichiestaPiano {
  chiave: string;
  pezzi: PezzoDaTagliare[];
  lunghezzaStecca: number;
  kerf: number;
  opzioni: OpzioniTaglio;
}

export const calcolaRichiesta = (r: RichiestaPiano): PianoTaglio =>
  pianificaTaglio(r.pezzi, r.lunghezzaStecca, r.kerf, r.opzioni);

const EPS = 1e-9;

/** Sotto questa lunghezza (mm) un avanzo che non torna al banco è sfrido, non si conserva. */
export const AVANZO_MINIMO = 200;

// Ricerca a fascio: stati tenuti a ogni misura, e modi di tagliare una misura
// provati per stato. Il tempo cresce coi pezzi per misura: ~15 ms sulle commesse
// piccole, da mezzo secondo a ~2 s su quelle grosse (400 pezzi, 10 telai di un
// rombo): per questo a video il piano si calcola in un worker (pianiTaglio.worker.ts).
// Allargarla non conviene: su una commessa reale (24 barre, 169 pezzi) un fascio da
// 600 con stecche nuove riempite anche a metà toglieva 7 cm di scarto in 14 secondi.
const FASCIO = 100;
const OPZIONI_PER_STATO = 200;

interface Misura { lunghezza: number; quantita: number; codici: Map<string, number> }

/** Un taglio di una fonte: `id` dell'avanzo che ne resta, per sapere se torna in gioco. */
interface Taglio {
  misura: number;
  da: Prelievo['da'];
  lunghezza: number;
  pezzi: number;
  avanzo: number;
  idFonte: number | null;   // spezzone consumato (null: stecca nuova)
  idAvanzo: number;
}

interface Esito { tagli: Taglio[]; nStecche: number; avanzi: { id: number; l: number }[] }

export function pianificaTaglio(
  pezzi: PezzoDaTagliare[],
  lunghezzaStecca: number,
  kerf: number,
  o: OpzioniTaglio = {},
): PianoTaglio {
  const testa = Math.max(0, o.intestatura ?? DEFAULT_INTESTATURA);
  const utileNuova = lunghezzaStecca - testa;
  const ricavabile = (l: number) => l + kerf <= utileNuova + EPS;
  // Una lunghezza non numerica è un errore a monte nella distinta: si segnala con gli altri, non si perde.
  // Una lunghezza zero o negativa invece vuol dire «niente da tagliare».
  const nonRicavabili = pezzi.filter((p) => p.quantita > 0 && (!Number.isFinite(p.lunghezza) || (p.lunghezza > 0 && !ricavabile(p.lunghezza))));

  // Le misure: pezzi con codici diversi ma lunghi uguali sono UNA battuta.
  // Il decimo di millimetro è la risoluzione della distinta: sotto, è rumore di calcolo.
  const perMisura = new Map<number, Misura>();
  for (const p of pezzi) {
    if (p.lunghezza <= 0 || p.quantita <= 0 || !ricavabile(p.lunghezza)) continue;
    const chiave = Math.round(p.lunghezza * 10);
    const m = perMisura.get(chiave) ?? { lunghezza: p.lunghezza, quantita: 0, codici: new Map() };
    m.lunghezza = Math.max(m.lunghezza, p.lunghezza);
    m.quantita += p.quantita;
    m.codici.set(p.etichetta, (m.codici.get(p.etichetta) ?? 0) + p.quantita);
    perMisura.set(chiave, m);
  }
  const misure = [...perMisura.values()].sort((a, b) => b.lunghezza - a.lunghezza);

  const base = bestFit(misure, lunghezzaStecca, utileNuova, kerf);
  let esito = base;
  if (o.ottimizza) {
    const ott = aFascio(misure, lunghezzaStecca, utileNuova, kerf, testa);
    if (ott && confronta(punteggioEsito(ott, testa), punteggioEsito(esito, testa)) < 0) esito = ott;
  }
  return { ...componi(misure, esito, lunghezzaStecca, testa, nonRicavabili), ottimizzato: !!o.ottimizza };
}

// --- Best-Fit Decreasing ------------------------------------------------------

function bestFit(misure: Misura[], lunghezzaStecca: number, utileNuova: number, kerf: number): Esito {
  const banco: { id: number; l: number }[] = [];   // in ordine crescente
  const tagli: Taglio[] = [];
  let nStecche = 0, prossimo = 0;

  misure.forEach((misura, i) => {
    const ingombro = misura.lunghezza + kerf;
    let mancano = misura.quantita;
    const taglia = (da: Taglio['da'], lunghezza: number, disponibile: number, idFonte: number | null) => {
      const n = Math.min(mancano, Math.floor((disponibile + EPS) / ingombro));
      mancano -= n;
      const avanzo = Math.max(0, disponibile - n * ingombro);
      const idAvanzo = prossimo++;
      tagli.push({ misura: i, da, lunghezza, pezzi: n, avanzo, idFonte, idAvanzo });
      if (avanzo > EPS) { banco.push({ id: idAvanzo, l: avanzo }); banco.sort((a, b) => a.l - b.l); }
    };
    // Prima gli spezzoni, dal più corto che basta (best fit) …
    while (mancano > 0) {
      const j = banco.findIndex((s) => s.l + EPS >= ingombro);
      if (j < 0) break;
      const [s] = banco.splice(j, 1);
      taglia('SPEZZONE', s!.l, s!.l, s!.id);
    }
    // … poi le stecche nuove, rifilate in testa.
    while (mancano > 0) {
      nStecche++;
      taglia('NUOVA', lunghezzaStecca, utileNuova, null);
    }
  });
  return { tagli, nStecche, avanzi: banco };
}

// --- Ottimizzato: ricerca a fascio ---------------------------------------------

/** I tagli di uno stato come catena all'indietro: gli stati figli condividono quella del padre. */
interface Catena { t: Taglio; prec: Catena | null }
interface Stato { banco: { id: number; l: number }[]; nStecche: number; coda: Catena | null; nTagli: number; prossimo: number }

const accoda = (coda: Catena | null, tagli: Taglio[]) => tagli.reduce<Catena | null>((c, t) => ({ t, prec: c }), coda);
function srotola(coda: Catena | null): Taglio[] {
  const out: Taglio[] = [];
  for (let c = coda; c; c = c.prec) out.push(c.t);
  return out.reverse();
}

function aFascio(misure: Misura[], lunghezzaStecca: number, utileNuova: number, kerf: number, testa: number): Esito | null {
  if (!misure.length) return null;
  const chiave = (s: Stato) => s.nStecche + '|' + s.banco.map((b) => Math.round(b.l * 10)).sort((a, b) => a - b).join(',');

  /** Tutti i modi (fino a un tetto) di tagliare la misura `mi` partendo da `s`. */
  const espandi = (s: Stato, mi: number): Stato[] => {
    const { lunghezza, quantita } = misure[mi]!;
    const ingombro = lunghezza + kerf;
    const perStecca = Math.floor((utileNuova + EPS) / ingombro);
    const candidati = s.banco.filter((b) => b.l + EPS >= ingombro).sort((a, b) => a.l - b.l);
    const out: Stato[] = [];

    const ricorri = (j: number, mancano: number, scelte: { s: { id: number; l: number }; k: number }[], kPrima: number) => {
      if (out.length >= OPZIONI_PER_STATO) return;
      if (j === candidati.length || mancano === 0) {
        const tagliSpezzoni: Taglio[] = [];
        let prossimo = s.prossimo;
        const usati = new Set<number>();
        const bancoSpezzoni: Stato['banco'] = [];
        for (const { s: sp, k } of scelte) {
          if (!k) continue;
          usati.add(sp.id);
          const avanzo = Math.max(0, sp.l - k * ingombro), id = prossimo++;
          tagliSpezzoni.push({ misura: mi, da: 'SPEZZONE', lunghezza: sp.l, pezzi: k, avanzo, idFonte: sp.id, idAvanzo: id });
          if (avanzo > EPS) bancoSpezzoni.push({ id, l: avanzo });
        }
        const restaBanco = s.banco.filter((b) => !usati.has(b.id));
        // I pezzi che mancano escono da stecche nuove: piene, l'ultima col resto.
        // (Provare anche stecche riempite a metà non paga: v. nota su FASCIO.)
        const perNuova = Array.from({ length: Math.ceil(mancano / perStecca) }, (_, i) => Math.min(perStecca, mancano - i * perStecca));
        const tagli = [...tagliSpezzoni], banco = [...restaBanco, ...bancoSpezzoni];
        let id = prossimo;
        for (const k of perNuova) {
          const avanzo = Math.max(0, utileNuova - k * ingombro);
          tagli.push({ misura: mi, da: 'NUOVA', lunghezza: lunghezzaStecca, pezzi: k, avanzo, idFonte: null, idAvanzo: id });
          if (avanzo > EPS) banco.push({ id, l: avanzo });
          id++;
        }
        out.push({ banco, nStecche: s.nStecche + perNuova.length, coda: accoda(s.coda, tagli), nTagli: s.nTagli + tagli.length, prossimo: id });
        return;
      }
      const c = candidati[j]!;
      // Spezzoni lunghi uguali sono intercambiabili: si provano solo scelte non crescenti
      const gemello = j > 0 && Math.abs(candidati[j - 1]!.l - c.l) < 0.05;
      const massimo = Math.min(Math.floor((c.l + EPS) / ingombro), mancano, gemello ? kPrima : Infinity);
      for (let k = massimo; k >= 0; k--) ricorri(j + 1, mancano - k, [...scelte, { s: c, k }], k);
    };
    ricorri(0, quantita, [], Infinity);
    return out;
  };

  // Valutazione a metà strada: prima lo scarto, poi le stecche. Le stecche: già usate
  // + quante ne servono ancora come minimo. Lo scarto: spezzoni corti che nessuna
  // misura userà + il rifilo di TUTTE quelle stecche, anche delle future — contare
  // solo quelle già aperte premierebbe le strade che rimandano l'apertura, non
  // quelle che finiscono meglio. (Una seconda ricerca guidata «prima le stecche» non
  // trovava mai di meglio: misurato su commesse reali e 600 casi casuali.)
  const restante = misure.map((_, i) => misure.slice(i).reduce((t, m) => t + m.quantita * (m.lunghezza + kerf), 0));
  const corta = misure[misure.length - 1]!.lunghezza + kerf;
  const valuta = (s: Stato, prossima: number): number[] => {
    if (prossima >= misure.length) return punteggio(s.nStecche, s.banco, s.nTagli, testa);
    const vivo = s.banco.filter((b) => b.l + EPS >= corta).reduce((t, b) => t + b.l, 0);
    const ancora = Math.max(0, Math.ceil((restante[prossima]! - vivo) / utileNuova - 1e-9));
    const morti = s.banco.filter((b) => b.l + EPS < corta && b.l < AVANZO_MINIMO);
    const stecche = s.nStecche + ancora;
    const scarto = morti.reduce((t, b) => t + b.l, 0) + stecche * testa;
    return [scarto, stecche, morti.length, s.nTagli];
  };

  let fascia: Stato[] = [{ banco: [], nStecche: 0, coda: null, nTagli: 0, prossimo: 0 }];
  for (let mi = 0; mi < misure.length; mi++) {
    const visti = new Map<string, Stato>();
    for (const s of fascia) {
      for (const n of espandi(s, mi)) {
        const k = chiave(n), v = visti.get(k);
        if (!v || n.nTagli < v.nTagli) visti.set(k, n);
      }
    }
    fascia = [...visti.values()]
      .map((s) => ({ s, v: valuta(s, mi + 1) }))
      .sort((a, b) => confronta(a.v, b.v))
      .slice(0, FASCIO)
      .map((x) => x.s);
  }
  const migliore = fascia[0]!;
  return { tagli: srotola(migliore.coda), nStecche: migliore.nStecche, avanzi: migliore.banco };
}

/**
 * Più basso è meglio: mm di scarto, stecche, numero di scarti, righe del piano.
 * La lama non conta: a parità di pezzi i tagli sono gli stessi in ogni piano.
 */
function punteggio(nStecche: number, avanzi: { l: number }[], nTagli: number, testa: number): number[] {
  const scarti = avanzi.filter((a) => a.l < AVANZO_MINIMO);
  const scarto = scarti.reduce((t, a) => t + a.l, 0) + nStecche * testa;
  return [scarto, nStecche, scarti.length, nTagli];
}
const punteggioEsito = (e: Esito, testa: number) => punteggio(e.nStecche, e.avanzi, e.tagli.length, testa);

function confronta(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 1e-6) return a[i]! - b[i]!;
  return 0;
}

// --- Dal percorso al piano -------------------------------------------------------

function componi(misure: Misura[], e: Esito, lunghezzaStecca: number, testa: number, nonRicavabili: PezzoDaTagliare[]): Omit<PianoTaglio, 'ottimizzato'> {
  // «Al banco» è un fatto, non una stima: l'avanzo torna come fonte più avanti
  const ripresi = new Set(e.tagli.map((t) => t.idFonte).filter((id): id is number => id !== null));

  const passi: PassoTaglio[] = misure.map((m) => ({
    lunghezza: m.lunghezza,
    quantita: m.quantita,
    codici: [...m.codici].map(([etichetta, quantita]) => ({ etichetta, quantita })),
    prelievi: [],
  }));
  for (const t of e.tagli) {
    const prelievi = passi[t.misura]!.prelievi;
    const alBanco = ripresi.has(t.idAvanzo);
    const ultimo = prelievi[prelievi.length - 1];
    if (ultimo && ultimo.da === t.da && Math.abs(ultimo.lunghezza - t.lunghezza) < 1e-6 && ultimo.pezzi === t.pezzi && ultimo.alBanco === alBanco) {
      ultimo.ripetizioni++;
    } else {
      prelievi.push({ da: t.da, lunghezza: t.lunghezza, pezzi: t.pezzi, avanzo: t.avanzo, alBanco, ripetizioni: 1 });
    }
  }

  const avanzi = e.avanzi.map((a) => a.l).sort((a, b) => b - a);
  const materialeUtile = misure.reduce((t, m) => t + m.lunghezza * m.quantita, 0);
  const materialeAcquistato = e.nStecche * lunghezzaStecca;
  const materialeMagazzino = avanzi.filter((a) => a >= AVANZO_MINIMO).reduce((t, a) => t + a, 0);
  const sfrido = materialeAcquistato - materialeUtile;

  return {
    passi,
    nStecche: e.nStecche,
    lunghezzaStecca,
    intestatura: testa,
    materialeUtile,
    materialeAcquistato,
    materialeMagazzino,
    materialeScarto: sfrido - materialeMagazzino,
    sfrido,
    sfridoPerc: materialeAcquistato > 0 ? (sfrido / materialeAcquistato) * 100 : 0,
    avanzi,
    nonRicavabili,
  };
}
