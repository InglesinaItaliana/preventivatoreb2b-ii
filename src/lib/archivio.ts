/**
 * Helper puri dell'archivio (nessun Vue, nessun Firestore): raggruppamento per
 * mese, filtro locale dei clienti per l'autocomplete, normalizzazione del
 * termine di ricerca commessa. Stanno qui per essere testabili da soli.
 */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

/** Ordini archiviati: `dataConsegnaPrevista` è una stringa 'YYYY-MM-DD' (data DDT),
 *  `dataCreazione` un Timestamp Firestore. Qui servono entrambe. */
export function dataOrdine(order: any): Date | null {
  const s = order?.dataConsegnaPrevista;
  if (typeof s === 'string' && s.length >= 7) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const sec = order?.dataCreazione?.seconds;
  if (typeof sec === 'number') return new Date(sec * 1000);
  return null;
}

export interface GruppoMese {
  chiave: string; // 'YYYY-MM', oppure 'senza-data'
  etichetta: string; // 'Luglio 2026'
  ordini: any[];
}

/**
 * Raggruppa per mese preservando l'ordine di arrivo (la lista è già ordinata
 * dal server): i gruppi escono nell'ordine in cui compaiono i mesi, quindi dal
 * più recente al più vecchio. Chi non ha data finisce in coda, mai perso.
 */
export function raggruppaPerMese(ordini: any[]): GruppoMese[] {
  const gruppi: GruppoMese[] = [];
  const indice = new Map<string, GruppoMese>();

  for (const o of ordini) {
    const d = dataOrdine(o);
    const chiave = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'senza-data';
    const etichetta = d ? `${MESI[d.getMonth()]} ${d.getFullYear()}` : 'Senza data';
    let g = indice.get(chiave);
    if (!g) {
      g = { chiave, etichetta, ordini: [] };
      indice.set(chiave, g);
      gruppi.push(g);
    }
    g.ordini.push(o);
  }

  // 'senza-data' in fondo, qualunque sia stato l'ordine di arrivo.
  return gruppi.sort((a, b) => Number(a.chiave === 'senza-data') - Number(b.chiave === 'senza-data'));
}

/**
 * Filtro locale dei clienti per l'autocomplete. Stessa semantica del
 * preventivatore: "contiene", case-insensitive, su ragione sociale ed email.
 */
export function filtraClienti(clienti: any[], termine: string, max = 10): any[] {
  const t = (termine || '').trim().toLowerCase();
  if (t.length < 2) return [];
  return clienti
    .filter(c => {
      const rs = (c?.ragioneSociale || '').toLowerCase();
      const em = (c?.email || '').toLowerCase();
      return rs.includes(t) || em.includes(t);
    })
    .slice(0, max);
}

// Ultimo carattere dell'area a uso privato Unicode: ordina dopo qualunque
// carattere normale. Scritto con fromCharCode e non come letterale, perché un
// carattere invisibile nel sorgente è facile da mangiare in un merge o in un
// reformat, e il guasto sarebbe silenzioso (ricerca che non trova più nulla).
const FINE_PREFISSO = String.fromCharCode(0xf8ff);

/**
 * Estremi per la ricerca per PREFISSO su `commessa`.
 *
 * Firestore non ha il "contiene": il massimo ottenibile lato server su un solo
 * campo è un range [prefisso, prefisso+]. In archivio le commesse sono
 * maiuscole al 100%, quindi normalizzare a maiuscolo rende il confronto
 * affidabile invece che dipendente da come l'utente ha digitato.
 * Ritorna null se il termine è troppo corto per valere una query.
 */
export function estremiCommessa(termine: string): { da: string; a: string } | null {
  const t = (termine || '').trim().toUpperCase();
  if (t.length < 2) return null;
  return { da: t, a: t + FINE_PREFISSO };
}
