// src/lib/novita.ts
//
// REGISTRO DELLE NOVITÀ + logica pura del pannello "novità" di POPS.
//
// Il registro sta nel codice (non su Firestore) per scelta: le novità di POPS
// sono illustrate con un componente dedicato (v. AnnuncioPrezzoModal e
// compagnia), non sono testo che si scrive da un pannello admin. Il prezzo da
// pagare è che pubblicare una novità richiede un deploy — che è comunque il
// momento in cui la novità esiste, perché la novità È il deploy.
//
// Questo file NON importa Vue né componenti: resta puro TS testabile in node.
// La mappa id → modale illustrata vive in components/novita/NovitaPanel.vue.
//
// PER AGGIUNGERE UNA NOVITÀ:
//   1. aggiungi una voce in NOVITA qui sotto (id nuovo, mai riusato; `data` =
//      giorno di pubblicazione reale, da cui partono i 7 giorni del badge);
//   2. se ha una modale illustrata, registrala nella mappa MODALI del pannello.
//      Senza modale la novità resta leggibile: la card mostra titolo e sommario.
//
// `tipo` e `icona` sono unioni chiuse, non stringhe libere: il pannello mappa
// ogni valore su un componente e su una tavolozza, e TypeScript si lamenta
// subito se aggiungi un valore senza registrarlo di là.

/** Il tipo dà il colore del medaglione e l'etichetta sopra al titolo. */
export type TipoNovita = 'funzione' | 'miglioramento' | 'avviso';

/**
 * Icona della singola novità: dice DI COSA parla (il segnaposto per la
 * consegna, la lente per il prezzo), mentre il tipo dice CHE COSA È. Sono due
 * informazioni diverse e vale la pena tenerle separate.
 */
export type IconaNovita =
  | 'mappa' | 'lente' | 'stampante' | 'documento' | 'carrello' | 'camion'
  | 'regolazione' | 'stella' | 'avviso' | 'fiamma';

/** Una voce del registro. `id` è la chiave di lettura: mai rinominarlo. */
export interface Novita {
  /** Chiave stabile e irripetibile: è ciò che finisce nello storico "letto". */
  id: string;
  titolo: string;
  /** Riga di riassunto mostrata nella tendina. Due righe al massimo, poi taglia. */
  sommario: string;
  /** Giorno di pubblicazione, 'YYYY-MM-DD'. Una data futura = novità programmata. */
  data: string;
  tipo: TipoNovita;
  /** Se manca si usa quella predefinita del tipo: una novità minore non deve costare una scelta. */
  icona?: IconaNovita;
  /**
   * Due o tre punti di dettaglio, mostrati come elenco nella scheda che si apre
   * al click. Servono alle novità SENZA modale illustrata: senza di loro la
   * scheda ripete il sommario e basta, e il cliente resta con le sue domande.
   */
  punti?: string[];
  /**
   * "Il pulsante che cerchi è questo": mostra la pastiglia col pulsante vero e
   * dice dov'è. Ripreso dal vecchio popup della stampa, che era la sua unica
   * idea davvero utile — leggere "trovi un pulsante" e vederlo sono due cose
   * diverse.
   */
  pulsante?: { icona: IconaNovita; testo: string };
}

/** L'etichetta sopra al titolo. È testo per il cliente: si legge, non è un enum. */
export const ETICHETTA_TIPO: Record<TipoNovita, string> = {
  funzione: 'Nuova funzione',
  miglioramento: 'Miglioramento',
  avviso: 'Avviso',
};

const ICONA_PREDEFINITA: Record<TipoNovita, IconaNovita> = {
  funzione: 'stella',
  miglioramento: 'regolazione',
  avviso: 'avviso',
};

/** L'icona da mostrare: quella scelta a mano o, in mancanza, quella del tipo. */
export function iconaDi(n: Novita): IconaNovita {
  return n.icona ?? ICONA_PREDEFINITA[n.tipo];
}

/** Per quanti giorni una novità porta il badge NOVITÀ. */
export const GIORNI_BADGE_NOVITA = 7;

/**
 * Il registro, in ordine libero: chi legge ordina per data decrescente.
 *
 * Le tre voci iniziali sono le novità già annunciate col popup one-time: entrano
 * qui come storico, così il pannello nasce con dentro qualcosa e il cliente può
 * rileggersele (prima, chiuso il popup, erano irraggiungibili per sempre).
 */
export const NOVITA: Novita[] = [
  {
    id: 'pannello-novita-v1',
    titolo: 'Le novità di POPS ora sono tutte qui',
    sommario: 'Il pulsante con la fiamma raccoglie le novità: quando ne pubblichiamo una si accende il pallino, e le vecchie restano consultabili.',
    data: '2026-08-27',
    tipo: 'funzione',
    icona: 'fiamma',
    punti: [
      'Il pallino conta le novità che non hai ancora aperto su questo computer: da un altro PC si riaccende.',
      'La pastiglia NOVITÀ resta per sette giorni dalla pubblicazione.',
      'Le novità di prima non spariscono più dopo il primo avviso: le ritrovi qui quando vuoi.',
    ],
    pulsante: { icona: 'fiamma', testo: 'È questo, qui in alto accanto a GUIDA.' },
  },
  {
    id: 'destinazione-merce-v1',
    titolo: 'Consegna a un indirizzo diverso dalla tua sede',
    sommario: 'Quando ordini puoi indicare un altro luogo di consegna e salvarlo in rubrica per riusarlo.',
    data: '2026-07-29',
    tipo: 'funzione',
    icona: 'mappa',
  },
  {
    id: 'dettaglio-prezzo-v1',
    titolo: 'Come nasce ogni prezzo',
    sommario: 'Nel preventivatore, la lente accanto al totale di ogni riga apre il dettaglio del calcolo: metri, tariffa e verifica finale.',
    data: '2026-07-13',
    tipo: 'miglioramento',
    icona: 'lente',
  },
  {
    id: 'stampa-documenti-v1',
    titolo: 'Stampa i tuoi documenti',
    sommario: 'Su ogni card c\'è il pulsante con la stampante: apre il PDF del preventivo o dell\'ordine, pronto da salvare o da stampare.',
    data: '2026-06-18',
    tipo: 'funzione',
    icona: 'stampante',
    punti: [
      'Il pulsante con la stampante è su ogni card, tranne i preventivi ancora da quotare.',
      'Il PDF si apre in una nuova scheda: da lì lo salvi o lo stampi.',
      'Per il documento di trasporto c\'è il pulsante dedicato VEDI DDT, sulle spedizioni.',
    ],
    pulsante: { icona: 'stampante', testo: 'È questo, sulla card di ogni preventivo e ordine.' },
  },
];

/** Giorno locale in formato 'YYYY-MM-DD' (le date del registro sono giorni, non istanti). */
export function oggiISO(adesso: Date = new Date()): string {
  const y = adesso.getFullYear();
  const m = String(adesso.getMonth() + 1).padStart(2, '0');
  const d = String(adesso.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Giorni interi tra due date 'YYYY-MM-DD'. Il conto passa da UTC di proposito:
 * con l'ora locale un cambio d'ora legale sposta il risultato di un giorno.
 * Torna NaN su input malformato — chi chiama lo tratta come "non recente".
 */
export function giorniTra(dataISO: string, riferimentoISO: string): number {
  const a = Date.parse(`${dataISO}T00:00:00Z`);
  const b = Date.parse(`${riferimentoISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Una novità è visibile solo dal giorno della sua data (le date future sono programmate). */
export function isPubblicata(n: Novita, oggi: string): boolean {
  return n.data <= oggi; // 'YYYY-MM-DD' si confronta bene anche come stringa
}

/** Il registro filtrato e ordinato dal più recente: è l'ordine della tendina. */
export function novitaVisibili(lista: Novita[] = NOVITA, oggi: string = oggiISO()): Novita[] {
  return lista
    .filter((n) => isPubblicata(n, oggi))
    .slice()
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

/**
 * Badge NOVITÀ: dipende SOLO dalla data di pubblicazione, non da chi legge.
 * Quindi una novità vecchia e mai letta pesa sul contatore ma non porta il
 * badge: sono due segnali diversi, e la tendina li mostra entrambi.
 */
export function isNuova(n: Novita, oggi: string = oggiISO(), giorni: number = GIORNI_BADGE_NOVITA): boolean {
  const g = giorniTra(n.data, oggi);
  return !Number.isNaN(g) && g >= 0 && g <= giorni;
}

/**
 * Le novità da dare per già lette al PRIMO avvio su un PC: tutte quelle che
 * hanno perso il badge NOVITÀ. Senza questo passaggio, il giorno del rilascio
 * ogni cliente si troverebbe il contatore acceso su tutto l'arretrato.
 *
 * Il conto parte dallo stesso limite del badge: quando il pannello si apre per
 * la prima volta, "non letto" e "NOVITÀ" coincidono.
 */
export function idStorici(
  lista: Novita[] = NOVITA,
  oggi: string = oggiISO(),
  giorni: number = GIORNI_BADGE_NOVITA,
): string[] {
  return novitaVisibili(lista, oggi)
    .filter((n) => !isNuova(n, oggi, giorni))
    .map((n) => n.id);
}

/** Quante novità pubblicate non risultano lette su questo PC. */
export function contaNonLette(
  lista: Novita[] = NOVITA,
  lette: readonly string[] = [],
  oggi: string = oggiISO(),
): number {
  const viste = new Set(lette);
  return novitaVisibili(lista, oggi).filter((n) => !viste.has(n.id)).length;
}

/** "oggi" / "ieri" / "3 giorni fa" e, oltre la settimana, la data breve. */
export function dataRelativa(n: Novita, oggi: string = oggiISO()): string {
  const g = giorniTra(n.data, oggi);
  if (Number.isNaN(g)) return n.data;
  if (g <= 0) return 'oggi';
  if (g === 1) return 'ieri';
  if (g <= GIORNI_BADGE_NOVITA) return `${g} giorni fa`;
  const d = new Date(`${n.data}T00:00:00Z`);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
