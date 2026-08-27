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
//    scatta ed è l'unica cosa che ci impedisce di mentire al cliente.
//
// DUE STRADE, da quando le righe si portano dietro lo scontrino (RigaPricing):
//
//  • riga CON scontrino → si LEGGE. Tariffe, supplementi e maggiorazione sono
//    quelli che il motore ha davvero usato quel giorno, congelati sulla riga:
//    nessuna deduzione, nessuna dipendenza dal listino di oggi. La guardia
//    resta accesa lo stesso, costa niente.
//  • riga SENZA scontrino (tutto lo storico, e le righe a prezzo manuale) → si
//    DEDUCE, come prima, col motore indicato da `activeList`. È la strada che
//    può fallire, ed è per questo che la guardia esiste.

import type { RigaPreventivo, RegimePricing, SupplementoPricing } from '../types';
import { metriGriglia, metriPerimetro, roundMm } from './geometry';
import { ricostruisciPrezzoUnitario } from './listini';

// Stessi moltiplicatori dei motori (solo telaio: perimetro × moltiplicatore).
const MOLTIPLICATORI_SOLO_CANALINO: Record<string, number> = {
  'C111': 1.5, 'C112': 2.0, 'C211': 2.5, 'C311': 3.0
};

const PERIMETRALE_CODES: Record<string, Record<string, string>> = {
  'ALLUMINIO':   { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' },
  'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' },
  'FIBRA':       { S: 'S011', M: 'S012', L: 'S013', XL: 'S014' },
};

export type Regime = RegimePricing;

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
  descrizioneGriglia: string;    // "VARSAVIA 26 BIANCO" — il canalino la sua l'ha sempre avuta
  descrizioneCanalino: string;

  // ③ Regola
  regime: Regime;
  regimeLabel: string;
  regimeSpiegazione: string;
  maggiorazionePct: number | null; // 20 = +20% (listini lineari); null = nessuna
  supplementi: VoceSupplemento[];  // voci fisse (2026: attrezzaggio + perimetrale)
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

/**
 * IL BLOCCO ③, IN DUE PEZZI.
 *
 * La discriminante (CHI è questa riga) e il meccanismo (COME si paga) sono
 * scritti separatamente, per due motivi.
 *
 * Primo: la discriminante è l'unica cosa che il cliente può verificare da sé
 * guardando il disegno — quante suddivisioni ci sono e in che direzione — e non
 * ha bisogno di giustificazioni. La vecchia formulazione ("la lavorazione è meno
 * efficiente", "la resa più bassa") spiegava la nostra economia, non il suo
 * prezzo, ed è uscita.
 *
 * Secondo: il meccanismo NON dipende dal regime, dipende dal listino. Nel 2026
 * suddivisioni parallele e singole non prendono nessuna maggiorazione — il
 * canalino esce dal conto al metro e rientra come profilo perimetrale a forfait
 * — mentre nei listini 2025 succede l'opposto. Un testo fisso per regime
 * mentirebbe su metà delle righe. Qui il meccanismo si legge dai numeri della
 * riga (c'è una percentuale? ci sono voci fisse?), quindi non può divergere dal
 * conto che gli sta sotto.
 */
const REGIME: Record<Regime, { label: string; discriminante: string }> = {
  INCROCIO: {
    label: 'Griglia a incrocio',
    discriminante: 'Almeno 1 incrocio.',
  },
  PARALLELE: {
    label: 'Suddivisioni in una sola direzione',
    discriminante: 'Telai con più orizzontali o più verticali.',
  },
  SINGOLA: {
    label: 'Suddivisione singola',
    discriminante: 'Un solo elemento sull\'intero telaio (orizzontale o verticale).',
  },
  SOLO_TELAIO: {
    label: 'Solo telaio',
    discriminante: 'Nessuna griglia interna: si paga il canalino perimetrale.',
  },
  NESSUNA: {
    label: 'Nessuna suddivisione',
    discriminante: 'Il telaio non ha suddivisioni interne.',
  },
};

/** Elenco in italiano: "a", "a e b". */
function elenco(voci: string[]): string {
  if (voci.length <= 1) return voci[0] || '';
  return `${voci.slice(0, -1).join(', ')} e ${voci[voci.length - 1]}`;
}

/**
 * Il meccanismo, ricavato dai numeri della riga e non da una tabella per
 * listino: quello che si legge qui è quello che si vede nella formula sotto.
 */
function spiegaMeccanismo(
  regime: Regime,
  maggiorazionePct: number | null,
  voci: SupplementoPricing[],
  conCanalino: boolean,
): string {
  if (regime === 'SOLO_TELAIO') return 'Il metro di riferimento è il perimetro del telaio.';
  if (regime === 'NESSUNA') return 'Non c\'è sviluppo di griglia da quotare.';

  const tariffa = conCanalino ? 'Tariffa griglia + canalino' : 'Tariffa griglia';

  if (maggiorazionePct) return `${tariffa} al metro, maggiorata del ${formattaPct(maggiorazionePct)}.`;

  if (voci.length) {
    const nomi = voci.map(v => v.tipo === 'attrezzaggio'
      ? 'il contributo di attrezzaggio'
      : 'il profilo perimetrale (in base alla taglia del telaio)');
    return `${tariffa} al metro, più ${elenco(nomi)}.`;
  }

  return `${tariffa} al metro, senza maggiorazioni.`;
}

/** 20 → "20%", 12.5 → "12,5%". Le percentuali si leggono meglio dei ×1,2. */
function formattaPct(pct: number): string {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(pct)}%`;
}

/**
 * L'eccezione storica: un telaio con SOLI orizzontali e SENZA canalino viene
 * quotato con la regola dell'incrocio pur non avendo nessun incrocio (l'override
 * sta in tutti e tre i motori). Su quelle righe "Almeno 1 incrocio" sarebbe
 * falso, e il cliente ha il disegno davanti: lo vedrebbe.
 */
function discriminanteDi(regime: Regime, verticali: number, orizzontali: number): string {
  if (regime === 'INCROCIO' && (!verticali || !orizzontali)) {
    return 'Telai con soli orizzontali e senza canalino: si applica la regola dell\'incrocio.';
  }
  return REGIME[regime].discriminante;
}

function descriviRegime(
  regime: Regime,
  maggiorazionePct: number | null,
  voci: SupplementoPricing[],
  conCanalino: boolean,
  verticali: number,
  orizzontali: number,
): { regimeLabel: string; regimeSpiegazione: string } {
  return {
    regimeLabel: REGIME[regime].label,
    regimeSpiegazione: `${discriminanteDi(regime, verticali, orizzontali)} ${spiegaMeccanismo(regime, maggiorazionePct, voci, conCanalino)}`,
  };
}

/**
 * Il testo delle voci fisse vive nel frontend, non nello scontrino: sullo
 * scontrino si salva il TIPO (e il codice), così riscrivere una dicitura non
 * costringe a riscrivere i preventivi già salvati.
 */
function labelSupplemento(v: SupplementoPricing, taglia: string | null): string {
  if (v.tipo === 'attrezzaggio') return 'Contributo di attrezzaggio';
  return taglia ? `Profilo perimetrale (taglia ${taglia})` : 'Profilo perimetrale';
}

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

  // Il profilo scelto, accanto alla sua tariffa: il canalino la sua descrizione
  // ce l'ha sempre avuta (infoCanalino), la griglia no — e due tariffe al metro
  // affiancate senza sapere a cosa si riferiscono non si controllano.
  const descrizioneGriglia = [r.modello, r.dimensione, r.finitura]
    .filter(x => x && x !== '-' && x !== 'MANUALE')
    .join(' ');

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
    descrizioneGriglia,
    prezzoPezzo: r.prezzo_unitario,
    totaleRiga: r.prezzo_totale,
    tariffaEffettiva: metriTotali > 0 ? r.prezzo_totale / metriTotali : null,
    lavorazioni,
  };

  // --- STRADA 1: LA RIGA HA LO SCONTRINO → SI LEGGE -------------------------
  if (r.pricing) {
    const p = r.pricing;
    const metri = Number(p.metriPezzo) || 0;
    const tariffe = Array.isArray(p.tariffe) ? p.tariffe : [];
    const voci = Array.isArray(p.supplementi) ? p.supplementi : [];
    // Un regime che non conosciamo (doc scritto a mano, formato futuro) non deve
    // far esplodere la modale: si degrada a "nessuna suddivisione" e la guardia
    // penserà al resto.
    const regime: Regime = REGIME[p.regime] ? p.regime : 'NESSUNA';
    const ricostruito = ricostruisciPrezzoUnitario(p);
    const maggiorazionePct = Number(p.maggiorazionePct) || null;
    const tariffaCanalino = tariffe.find(t => t.tipo === 'canalino' || t.tipo === 'telaio')?.valore ?? 0;
    return {
      ...comune,
      metriPezzo: metri,
      metriTotali: metri * qty,
      tariffaEffettiva: metri * qty > 0 ? r.prezzo_totale / (metri * qty) : null,
      metrica: p.metrica === 'perimetro' ? 'perimetro' : 'sviluppo',
      tariffaGriglia: tariffe.find(t => t.tipo === 'griglia')?.valore ?? 0,
      // Il 'telaio' (moltiplicatore del solo canalino) occupa la stessa casella
      // del canalino: è lì che la modale va a prenderlo per il solo telaio.
      tariffaCanalino,
      tariffaConcordata: !!r.customVarPrice && Number(r.customVarPrice) > 0,
      descrizioneCanalino: r.infoCanalino || '',
      regime,
      ...descriviRegime(regime, maggiorazionePct, voci, tariffaCanalino > 0 && !voci.length, r.righe, r.colonne),
      maggiorazionePct,
      supplementi: voci.map(v => ({ label: labelSupplemento(v, p.taglia), importo: v.importo })),
      taglia: p.taglia ?? null,
      riconcilia: Math.abs(ricostruito - r.prezzo_unitario) < 0.005,
      prezzoRicostruito: ricostruito,
    };
  }

  // --- STRADA 2: DEDUZIONE (righe storiche) ---------------------------------
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
      ...descriviRegime('SOLO_TELAIO', null, [], false, r.righe, r.colonne),
      maggiorazionePct: null,
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
  let maggiorazionePct: number | null = null;
  const voci: SupplementoPricing[] = [];
  let ricostruito = 0;

  const listinoLineare = activeList === '2025-a' || activeList === '2025x' || activeList === '2025-x';

  if (listinoLineare) {
    // Tutto al metro: nessun costo fisso, la lavorazione pesa come maggiorazione.
    // (Il listino "LEALI" oggi non applica alcun rincaro sulle tariffe: la voce
    // esiste nel motore ma vale 0 dal 2026-06-26.)
    const leali = activeList === '2025x' || activeList === '2025-x';
    if (regime === 'PARALLELE') maggiorazionePct = 20;
    else if (regime === 'SINGOLA') maggiorazionePct = leali ? 20 : 50;

    const tariffaSomma = tariffaGriglia + tariffaCanalino;
    const fattore = maggiorazionePct ? 1 + maggiorazionePct / 100 : 1;
    ricostruito = regime === 'NESSUNA' ? 0 : metriPezzo * tariffaSomma * fattore;
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

      if (setup) voci.push({ tipo: 'attrezzaggio', codice: sviluppo < 2.0 ? 'S001' : 'S002', importo: setup });
      if (perimetrale) voci.push({ tipo: 'perimetrale', codice: codePerimetrale || '', importo: perimetrale });

      ricostruito = (metriPezzo * tariffaGriglia) + perimetrale + setup;
    }
  }

  return {
    ...comune,
    metrica: 'sviluppo',
    tariffaGriglia,
    // Col canalino a forfait (voci fisse) la sua tariffa al metro NON entra nel
    // prezzo: mostrarla nel blocco ② farebbe sballare il conto a chi la somma.
    // Il suo costo è già dentro il profilo perimetrale, elencato nel blocco ③.
    tariffaCanalino: voci.length ? 0 : tariffaCanalino,
    tariffaConcordata,
    descrizioneCanalino: r.infoCanalino || '',
    regime,
    ...descriviRegime(regime, maggiorazionePct, voci, tariffaCanalino > 0 && !voci.length, r.righe, r.colonne),
    maggiorazionePct,
    supplementi: voci.map(v => ({ label: labelSupplemento(v, taglia), importo: v.importo })),
    taglia,
    riconcilia: Math.abs(ricostruito - r.prezzo_unitario) < 0.005,
    prezzoRicostruito: ricostruito,
  };
}
