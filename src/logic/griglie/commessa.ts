// src/logic/griglie/commessa.ts
//
// Una COMMESSA di griglie: più pannelli diversi (P1, P2, P3…) nello stesso ordine.
// Modulo PURO: nessun Vue, nessuno storage.
//
// Di ogni pannello si salvano i DATI D'INGRESSO (quello che si imposta nel
// configuratore), non i risultati: i risultati si ricalcolano. Finché la commessa
// è in BOZZA, quindi, misure e quote seguono le formule e i parametri d'officina
// di oggi. Quando va IN PRODUZIONE si CONGELA: si fotografano i risultati (con i
// parametri con cui sono usciti e il piano di taglio), così il PDF resta identico a quello stampato
// anche se un domani cambiano formule o parametri — come il listino congelato
// sul preventivo.
//
// I CODICI dei pannelli (P1, P2…) vengono dalla posizione nella lista. In bozza si
// riassegnano se si elimina o riordina un pannello; congelata, la lista non cambia
// più e con lei i codici: i pezzi già marcati in officina restano giusti.

import type { ConfigGriglia, Distribuzione, Progetto, Stile } from './progetto';
import { calcolaProgetto } from './progetto';
import type { FamigliaFinitura } from './finiture';
import type { PianoTaglio } from './nesting';

/** I controlli del configuratore, in unità d'interfaccia (cm). */
export interface InputPannello {
  stile: Stile;
  larghezzaCm: number;
  altezzaCm: number;
  passoOrizzontaleCm: number;   // interasse fra i verticali (desiderato)
  passoVerticaleCm: number;     // interasse fra gli orizzontali (desiderato)
  quantita: number;             // telai identici
  conBordo: boolean;
  distribuzione: Distribuzione;
  nVertOverride: number | null;
  nOrizOverride: number | null;
  tipoFinitura: FamigliaFinitura;
  finitura: string;
  // Solo PREMIUM
  modoPremium: 'PASSO' | 'NUMERO';
  passiUguali: boolean;
  nVertPremium: number;
  nOrizPremium: number;
}

/** Parametri d'officina: GENERALI, non della commessa (salvo la fotografia al congelamento). */
export interface ParametriOfficina {
  gioco: number;
  kerf: number;
  intestatura?: number;                 // mm; assente nelle commesse congelate prima che esistesse
  margineMinimo: number;
  lunghezzaMinima: number;
  pesoBarraKgM: number | null;          // barra 18×8
  steccaInglesina: number | null;       // mm
  pesoSteccaInglesinaG: number | null;  // g per barra
}

export function pesoInglesinaKgM(p: ParametriOfficina): number | null {
  return p.steccaInglesina && p.pesoSteccaInglesinaG != null
    ? (p.pesoSteccaInglesinaG / 1000) / (p.steccaInglesina / 1000)
    : null;
}

const aRombi = (s: Stile) => s === 'MILANO' || s === 'VENEZIA';

/**
 * Dai controlli alla configurazione di calcolo. È la STESSA trasformazione che
 * fa la pagina: il pannello salvato e quello a video non possono divergere.
 */
export function configDa(i: InputPannello, p: ParametriOfficina): ConfigGriglia {
  const premium = i.stile === 'PREMIUM';
  const rombi = aRombi(i.stile);
  const vuotiUguali = premium || i.distribuzione === 'SPAZI_UGUALI';

  // MILANO impone rombi quadrati, VENEZIA l'asse verticale doppio; sul PREMIUM
  // "passo uguale" usa un solo passo per i due versi.
  let passoVerticaleCm = i.passoVerticaleCm;
  if ((premium && i.passiUguali) || i.stile === 'MILANO') passoVerticaleCm = i.passoOrizzontaleCm;
  if (i.stile === 'VENEZIA') passoVerticaleCm = i.passoOrizzontaleCm * 2;

  const numero = (n: number) => Math.max(1, n || 1);
  return {
    stile: i.stile,
    // Sui rombi la distribuzione a vuoti uguali non è definita: si ricade sul passo.
    distribuzione: rombi ? 'PASSO_FISSO' : (vuotiUguali ? 'SPAZI_UGUALI' : i.distribuzione),
    lunghezzaMinima: p.lunghezzaMinima,
    nBarreVerticali: premium
      ? (i.modoPremium === 'NUMERO' ? numero(i.nVertPremium) : null)
      : (vuotiUguali ? i.nVertOverride : null),
    nBarreOrizzontali: premium
      ? (i.modoPremium === 'NUMERO' ? numero(i.nOrizPremium) : null)
      : (vuotiUguali ? i.nOrizOverride : null),
    larghezza: i.larghezzaCm * 10,
    altezza: i.altezzaCm * 10,
    passoOrizzontale: i.passoOrizzontaleCm * 10,
    passoVerticale: passoVerticaleCm * 10,
    quantita: i.quantita,
    gioco: p.gioco,
    margineMinimo: p.margineMinimo,
    conBordo: i.conBordo,
    // Lo strato a vista non si sceglie: su LONDRA sempre le verticali, sui rombi non cambia nulla
    famigliaAVista: rombi ? 'A' : 'V',
    famigliaFinitura: i.tipoFinitura,
  };
}

// --- Commessa ----------------------------------------------------------------

export interface PannelloCommessa {
  id: string;
  input: InputPannello;
}

export type StatoCommessa = 'BOZZA' | 'IN_PRODUZIONE';

export interface CommessaGriglie {
  id: string;
  commessa: string;
  cliente: string;
  stato: StatoCommessa;
  pannelli: PannelloCommessa[];
  creata: string;      // ISO
  aggiornata: string;  // ISO
  /** Solo IN_PRODUZIONE: la fotografia presa al congelamento. */
  congelata?: {
    il: string;                    // ISO
    parametri: ParametriOfficina;
    progetti: Progetto[];          // nello stesso ordine dei pannelli
    /** Il piano di taglio, per materiale: il PDF resta quello stampato anche se cambia l'algoritmo. */
    piani?: [string, PianoTaglio][];   // assente nelle commesse congelate prima che esistesse
  };
}

/** Il codice del pannello dalla sua posizione: 0 → P1, 1 → P2… */
export function codicePannello(indice: number): string {
  return `P${indice + 1}`;
}

/** Il contrario: P2 → 1; -1 se non è un codice di pannello. */
export function indiceDaCodice(codice: string | null): number {
  const m = codice?.match(/^P(\d+)$/);
  return m ? Number(m[1]) - 1 : -1;
}

export function nuovaCommessa(id: string, adesso: string, codice = ''): CommessaGriglie {
  return { id, commessa: codice, cliente: '', stato: 'BOZZA', pannelli: [], creata: adesso, aggiornata: adesso };
}

/**
 * Il codice di una nuova commessa: GR-AA-NNN, progressivo nell'anno fra le commesse
 * salvate (GR = griglie, per non confondersi coi numeri d'ordine). Si assegna alla
 * creazione e non si modifica.
 */
export function prossimoCodiceCommessa(esistenti: readonly string[], anno: number): string {
  const aa = String(anno % 100).padStart(2, '0');
  const formato = new RegExp(`^GR-${aa}-(\\d+)$`);
  const ultimo = esistenti.reduce((max, c) => {
    const m = formato.exec(c);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `GR-${aa}-${String(ultimo + 1).padStart(3, '0')}`;
}

/** Un pannello della commessa pronto per la scheda: codice, progetto e finitura. */
export interface PannelloCalcolato {
  codice: string;
  progetto: Progetto;
  finitura: string;   // nome dal listino ('' se non scelta)
  telai: number;
}

/**
 * I pannelli calcolati: dalla FOTOGRAFIA se la commessa è congelata, altrimenti
 * ricalcolati adesso con i parametri d'officina correnti.
 */
export function pannelliCalcolati(c: CommessaGriglie, p: ParametriOfficina): PannelloCalcolato[] {
  return c.pannelli.map((pn, i) => {
    const progetto = c.stato === 'IN_PRODUZIONE' && c.congelata?.progetti[i]
      ? c.congelata.progetti[i]!
      : calcolaProgetto(configDa(pn.input, p));
    return { codice: codicePannello(i), progetto, finitura: pn.input.finitura, telai: pn.input.quantita };
  });
}

/** I parametri con cui leggere la commessa: quelli fotografati se congelata. */
export function parametriDi(c: CommessaGriglie, correnti: ParametriOfficina): ParametriOfficina {
  return c.stato === 'IN_PRODUZIONE' && c.congelata ? c.congelata.parametri : correnti;
}

/**
 * In produzione: si fotografano risultati, parametri e — se calcolato — il piano di
 * taglio (calcolarlo costa: lo passa chi lo ha già, calcolato con questi stessi
 * parametri). Le copie sono profonde: niente riferimenti condivisi.
 */
export function congela(c: CommessaGriglie, p: ParametriOfficina, adesso: string, piani?: ReadonlyMap<string, PianoTaglio>): CommessaGriglie {
  const progetti = c.pannelli.map((pn) => calcolaProgetto(configDa(pn.input, p)));
  return {
    ...c,
    stato: 'IN_PRODUZIONE',
    aggiornata: adesso,
    congelata: {
      il: adesso,
      parametri: { ...p },
      progetti: JSON.parse(JSON.stringify(progetti)),
      ...(piani ? { piani: JSON.parse(JSON.stringify([...piani])) } : {}),
    },
  };
}

/** Il piano fotografato, se la commessa è congelata e lo ha. */
export function pianiCongelati(c: CommessaGriglie): ReadonlyMap<string, PianoTaglio> | null {
  return c.stato === 'IN_PRODUZIONE' && c.congelata?.piani ? new Map(c.congelata.piani) : null;
}

/** Torna in bozza: la fotografia si scarta, i pannelli si ricalcolano. */
export function sblocca(c: CommessaGriglie, adesso: string): CommessaGriglie {
  const { congelata: _scartata, ...resto } = c;
  return { ...resto, stato: 'BOZZA', aggiornata: adesso };
}
