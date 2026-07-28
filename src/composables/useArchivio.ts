import { ref } from 'vue';
import { collection, query, where, orderBy, limit, getDocs, type QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { ARCHIVIO_QUERIES } from '../types';

/**
 * Caricamento dell'archivio storico (ordini consegnati e annullati).
 *
 * Estratto da ArchiveModal.vue: la modale è condivisa fra admin e cliente e
 * la logica di query sta per crescere (Fase 2: ricerca cliente/commessa),
 * quindi vive qui e non dentro il template.
 *
 * Una query per stato (v. ARCHIVIO_QUERIES): stati diversi hanno campo di
 * ordinamento e capienza propri, e sommarli in un solo `limit` è esattamente
 * il motivo per cui l'archivio mostrava pochi clienti.
 *
 * Se `clienteUID` è valorizzato la query è vincolata a quel cliente (percorso
 * dashboard cliente: serve anche alle regole Firestore, che senza vincolo
 * rifiutano la lettura di collezione).
 */
export function useArchivio() {
  const consegnati = ref<any[]>([]);
  const annullati = ref<any[]>([]);
  const loading = ref(false);
  const errore = ref<string | null>(null);

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

  const carica = async (clienteUID?: string) => {
    loading.value = true;
    errore.value = null;
    // Pulizia immediata: feedback visivo + niente residui della vista precedente.
    consegnati.value = [];
    annullati.value = [];
    try {
      const risultati = await Promise.all(
        ARCHIVIO_QUERIES.map(async q => [q.stato, await caricaStato(q.stato, q.campoOrdine, q.limite, clienteUID)] as const)
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

  return { consegnati, annullati, loading, errore, carica };
}
