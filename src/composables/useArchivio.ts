import { ref } from 'vue';
import { collection, query, where, orderBy, limit, getDocs, type QueryConstraint } from 'firebase/firestore';
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

export function useArchivio() {
  const consegnati = ref<any[]>([]);
  const annullati = ref<any[]>([]);
  const risultatiCommessa = ref<any[]>([]);
  const modalita = ref<ModalitaArchivio>('recenti');
  const loading = ref(false);
  const errore = ref<string | null>(null);
  /** true quando una lista ha toccato il proprio limite: la modale lo dichiara. */
  const troncato = ref(false);

  const svuota = () => {
    consegnati.value = [];
    annullati.value = [];
    risultatiCommessa.value = [];
    troncato.value = false;
    errore.value = null;
  };

  const caricaStato = async (
    stato: string,
    campoOrdine: string,
    limite: number,
    clienteUID?: string
  ) => {
    const vincoli: QueryConstraint[] = [];
    if (clienteUID) vincoli.push(where('clienteUID', '==', clienteUID));
    vincoli.push(where('stato', '==', stato), orderBy(campoOrdine, 'desc'), limit(limite));

    const snap = await getDocs(query(collection(db, 'preventivi'), ...vincoli));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  };

  /**
   * Modalità 'recenti' (nessun cliente) o 'cliente' (vincolata a clienteUID).
   * Il percorso dashboard cliente passa sempre il proprio UID: serve anche alle
   * regole Firestore, che senza vincolo rifiutano la lettura di collezione.
   */
  const carica = async (clienteUID?: string) => {
    loading.value = true;
    svuota();
    modalita.value = clienteUID ? 'cliente' : 'recenti';
    try {
      const risultati = await Promise.all(
        ARCHIVIO_QUERIES.map(async q => {
          const limite = clienteUID ? LIMITE_ARCHIVIO_CLIENTE : q.limite;
          const righe = await caricaStato(q.stato, q.campoOrdine, limite, clienteUID);
          if (righe.length >= limite) troncato.value = true;
          return [q.stato, righe] as const;
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
    errore,
    troncato,
    carica,
    cercaPerCommessa,
  };
}
