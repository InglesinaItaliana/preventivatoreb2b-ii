/**
 * Helper puri dell'archivio (nessun Vue, nessun Firestore): raggruppamento per
 * mese, filtro locale dei clienti per l'autocomplete, normalizzazione del
 * termine di ricerca commessa. Stanno qui per essere testabili da soli.
 */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

/** `dataConsegnaPrevista` è una stringa 'YYYY-MM-DD', `dataCreazione` un
 *  Timestamp Firestore: qui diventano entrambe una Date, o null. */
function aData(v: any): Date | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.length >= 7) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const sec = v?.seconds;
  if (typeof sec === 'number') return new Date(sec * 1000);
  return null;
}

/**
 * La data che qualifica un ordine archiviato, e su cui l'archivio lo ordina.
 *
 * Dipende dallo STATO: per un consegnato è la data del DDT, per un annullato
 * il DDT non esiste e resta la creazione. Deve corrispondere al campo su cui
 * quella query è ordinata (v. ARCHIVIO_QUERIES), altrimenti la fusione dei due
 * elenchi mescolerebbe liste ordinate per criteri diversi — e la data mostrata
 * in card non sarebbe quella che determina la posizione della riga.
 */
export function dataOrdine(order: any): Date | null {
  const consegnato = order?.stato === 'DELIVERED';
  const primaria = consegnato ? order?.dataConsegnaPrevista : order?.dataCreazione;
  const ripiego = consegnato ? order?.dataCreazione : order?.dataConsegnaPrevista;
  return aData(primaria) ?? aData(ripiego);
}

/**
 * Fonde N elenchi GIÀ ordinati per data decrescente in un'unica pagina, sempre
 * ordinata per data decrescente, e restituisce ciò che avanza.
 *
 * Serve perché consegnati e annullati arrivano da due query separate (campi di
 * ordinamento diversi) ma vanno mostrati in una lista sola. Chi chiama deve
 * garantire che ogni elenco contenga almeno `quanti` elementi oppure sia
 * esaurito: così la pagina fusa non può contenere un elemento più vecchio di
 * uno rimasto fuori.
 */
export function fondiOrdinati(elenchi: any[][], quanti: number): { pagina: any[]; resti: any[][] } {
  const code = elenchi.map(l => [...l]);
  const pagina: any[] = [];

  while (pagina.length < quanti) {
    let migliore = -1;
    let miglioreT = -Infinity;
    for (let i = 0; i < code.length; i++) {
      const testa = code[i]![0];
      if (!testa) continue;
      // Senza data va in fondo, ma non si perde: -Infinity la tiene ultima.
      const t = dataOrdine(testa)?.getTime() ?? -Infinity;
      if (migliore === -1 || t > miglioreT) {
        migliore = i;
        miglioreT = t;
      }
    }
    if (migliore === -1) break; // tutte le code vuote
    pagina.push(code[migliore]!.shift());
  }

  return { pagina, resti: code };
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
