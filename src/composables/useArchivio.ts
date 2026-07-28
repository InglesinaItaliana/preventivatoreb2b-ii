import { ref } from 'vue';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ARCHIVIO_QUERIES,
  ARCHIVE_STATUSES,
  LIMITE_ARCHIVIO_CLIENTE,
  LIMITE_ARCHIVIO_COMMESSA,
} from '../types';
import { estremiCommessa } from '../lib/archivio';

/**
 * Caricamento dell'archivio storico (ordini consegnati e annullati).
 *
 * Estratto da ArchiveModal.vue: la modale è condivisa fra admin e cliente e la
 * logica di query è cresciuta con la ricerca, quindi vive qui e non nel template.
 *
 * Tre modalità, mutuamente esclusive:
 *  - 'recenti'  → gli ultimi archiviati, una query per stato (v. ARCHIVIO_QUERIES)
 *  - 'cliente'  → tutto lo storico archiviato di un cliente, limite più alto
 *  - 'commessa' → ricerca per prefisso su `commessa`, lista piatta
 *
 * Una query PER STATO e non una sola su ARCHIVE_STATUSES: stati diversi hanno
 * campo di ordinamento e capienza propri, e sommarli in un solo `limit` è il
 * motivo per cui l'archivio mostrava pochi clienti.
 */
export type ModalitaArchivio = 'recenti' | 'cliente' | 'commessa';
/** Gli stati d'archivio, come chiavi tipizzate di cursori e flag di paginazione. */
export type StatoArchivio = 'DELIVERED' | 'REJECTED';

export function useArchivio() {
  const consegnati = ref<any[]>([]);
  const annullati = ref<any[]>([]);
  const risultatiCommessa = ref<any[]>([]);
  const modalita = ref<ModalitaArchivio>('recenti');
  const loading = ref(false);
  const caricandoAltri = ref(false);
  const errore = ref<string | null>(null);
  /** Solo per la ricerca commessa, che non è paginata: la modale lo dichiara. */
  const troncato = ref(false);
  /** Esiste (forse) un'altra pagina per quello stato → si mostra "Carica altri". */
  const altri = ref<Record<StatoArchivio, boolean>>({ DELIVERED: false, REJECTED: false });

  // Cursore per stato: l'ULTIMO documento della pagina già caricata. Serve il
  // DocumentSnapshot vero, non il dato: `startAfter` su un valore sarebbe
  // ambiguo con date ripetute (più DDT nello stesso giorno), sullo snapshot no.
  const cursori: Record<StatoArchivio, QueryDocumentSnapshot | null> = { DELIVERED: null, REJECTED: null };
  // Il cliente in vigore, per far ripartire le pagine successive dallo stesso filtro.
  let clienteCorrente: string | undefined;

  const svuota = () => {
    consegnati.value = [];
    annullati.value = [];
    risultatiCommessa.value = [];
    troncato.value = false;
    errore.value = null;
    altri.value = { DELIVERED: false, REJECTED: false };
    cursori.DELIVERED = null;
    cursori.REJECTED = null;
  };

  const paginaDi = async (
    stato: string,
    campoOrdine: string,
    limite: number,
    clienteUID?: string,
    dopo?: QueryDocumentSnapshot | null
  ) => {
    const vincoli: QueryConstraint[] = [];
    if (clienteUID) vincoli.push(where('clienteUID', '==', clienteUID));
    vincoli.push(where('stato', '==', stato), orderBy(campoOrdine, 'desc'));
    if (dopo) vincoli.push(startAfter(dopo));
    vincoli.push(limit(limite));

    const snap = await getDocs(query(collection(db, 'preventivi'), ...vincoli));
    return {
      righe: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      ultimo: snap.docs[snap.docs.length - 1] ?? null,
      // Pagina piena ⇒ POTREBBERO essercene altre. Se il totale è un multiplo
      // esatto del limite, l'ultimo "Carica altri" non troverà nulla e sparirà:
      // è il compromesso normale di questa paginazione.
      pienaVuolDirePossibiliAltri: snap.docs.length === limite,
    };
  };

  const limitePer = (stato: string) => {
    const q = ARCHIVIO_QUERIES.find(x => x.stato === stato)!;
    return clienteCorrente ? LIMITE_ARCHIVIO_CLIENTE : q.limite;
  };

  /**
   * Modalità 'recenti' (nessun cliente) o 'cliente' (vincolata a clienteUID).
   * Il percorso dashboard cliente passa sempre il proprio UID: serve anche alle
   * regole Firestore, che senza vincolo rifiutano la lettura di collezione.
   */
  const carica = async (clienteUID?: string) => {
    loading.value = true;
    svuota();
    clienteCorrente = clienteUID;
    modalita.value = clienteUID ? 'cliente' : 'recenti';
    try {
      const risultati = await Promise.all(
        ARCHIVIO_QUERIES.map(async q => {
          const pagina = await paginaDi(q.stato, q.campoOrdine, limitePer(q.stato), clienteUID);
          cursori[q.stato] = pagina.ultimo;
          altri.value[q.stato] = pagina.pienaVuolDirePossibiliAltri;
          return [q.stato, pagina.righe] as const;
        })
      );
      const perStato = new Map(risultati);
      consegnati.value = perStato.get('DELIVERED') ?? [];
      annullati.value = perStato.get('REJECTED') ?? [];
    } catch (e: any) {
      console.error('Errore caricamento archivio:', e);
      errore.value = 'Impossibile caricare l’archivio. Riprova.';
    } finally {
      loading.value = false;
    }
  };

  /**
   * Pagina successiva di uno dei due elenchi, APPESA a quella già a video.
   * Ripercorre la stessa query con lo stesso filtro cliente, ripartendo dal
   * cursore: senza, un "carica altri" rifarebbe la prima pagina.
   */
  const caricaAltri = async (stato: StatoArchivio) => {
    if (caricandoAltri.value || !altri.value[stato]) return;
    const q = ARCHIVIO_QUERIES.find(x => x.stato === stato);
    if (!q) return;

    caricandoAltri.value = true;
    try {
      const pagina = await paginaDi(stato, q.campoOrdine, limitePer(stato), clienteCorrente, cursori[stato]);
      cursori[stato] = pagina.ultimo ?? cursori[stato];
      altri.value[stato] = pagina.pienaVuolDirePossibiliAltri;
      const destinazione = stato === 'DELIVERED' ? consegnati : annullati;
      destinazione.value = [...destinazione.value, ...pagina.righe];
    } catch (e: any) {
      console.error('Errore caricamento pagina successiva:', e);
      errore.value = 'Impossibile caricare altri ordini. Riprova.';
    } finally {
      caricandoAltri.value = false;
    }
  };

  /**
   * Ricerca per prefisso su `commessa`.
   *
   * Un solo vincolo di range, niente altri filtri lato server: `commessa` da
   * sola usa l'indice automatico di campo singolo, mentre aggiungere lo stato
   * (o il cliente) richiederebbe un indice composito nuovo. Gli stati non
   * d'archivio si scartano qui, e sono pochi perché la commessa è quasi univoca.
   *
   * Per questo la ricerca è riservata all'admin: un cliente non può interrogare
   * `preventivi` senza vincolo su clienteUID (le regole Firestore rifiutano), e
   * aggiungerlo reintrodurrebbe l'indice composito.
   */
  const cercaPerCommessa = async (termine: string) => {
    const estremi = estremiCommessa(termine);
    if (!estremi) return;

    loading.value = true;
    svuota();
    modalita.value = 'commessa';
    try {
      const snap = await getDocs(query(
        collection(db, 'preventivi'),
        where('commessa', '>=', estremi.da),
        where('commessa', '<=', estremi.a),
        orderBy('commessa'),
        limit(LIMITE_ARCHIVIO_COMMESSA)
      ));
      if (snap.size >= LIMITE_ARCHIVIO_COMMESSA) troncato.value = true;

      risultatiCommessa.value = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(o => ARCHIVE_STATUSES.includes(o.stato));
    } catch (e: any) {
      console.error('Errore ricerca commessa:', e);
      errore.value = 'Impossibile cercare la commessa. Riprova.';
    } finally {
      loading.value = false;
    }
  };

  return {
    consegnati,
    annullati,
    risultatiCommessa,
    modalita,
    loading,
    caricandoAltri,
    errore,
    troncato,
    altri,
    carica,
    caricaAltri,
    cercaPerCommessa,
  };
}
