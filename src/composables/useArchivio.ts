import { ref } from 'vue';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { ARCHIVIO_QUERIES, PAGINA_ARCHIVIO } from '../types';
import { fondiOrdinati } from '../lib/archivio';

/**
 * Caricamento dell'archivio storico (ordini consegnati e annullati).
 *
 * Estratto da ArchiveModal.vue: la modale è condivisa fra admin e cliente e la
 * logica di query è cresciuta con la ricerca, quindi vive qui e non nel template.
 *
 * Tre modalità, mutuamente esclusive:
 *  - 'recenti'  → gli ultimi archiviati
 *  - 'cliente'  → lo storico archiviato di un cliente
 *  - 'commessa' → ricerca per contenuto su `commessa`, senza paginazione
 *
 * UNA LISTA SOLA, ma DUE QUERY. I due stati si ordinano su campi diversi
 * (v. ARCHIVIO_QUERIES), quindi arrivano separati e vengono fusi qui per data.
 * Un'unica query `stato in [...]` ordinata su un campo solo perderebbe in
 * silenzio i documenti che quel campo non ce l'hanno.
 */
export type ModalitaArchivio = 'recenti' | 'cliente' | 'commessa';

interface Flusso {
  stato: string;
  campoOrdine: string;
  /** Righe già lette dal server ma non ancora entrate in una pagina fusa. */
  avanzo: any[];
  cursore: QueryDocumentSnapshot | null;
  /** Il server potrebbe averne altre (l'ultima pagina letta era piena). */
  altreSulServer: boolean;
}

export function useArchivio() {
  const ordini = ref<any[]>([]);
  const risultatiCommessa = ref<any[]>([]);
  const modalita = ref<ModalitaArchivio>('recenti');
  const loading = ref(false);
  const caricandoAltri = ref(false);
  const errore = ref<string | null>(null);
  /** Solo per la ricerca commessa, che non è paginata. */
  const troncato = ref(false);

  /** Esiste (forse) altro da caricare: la modale mostra l'invito a scorrere. */
  const altri = ref(false);

  let flussi: Flusso[] = [];
  let clienteCorrente: string | undefined;

  const nuoviFlussi = (): Flusso[] =>
    ARCHIVIO_QUERIES.map(q => ({
      stato: q.stato,
      campoOrdine: q.campoOrdine,
      avanzo: [],
      cursore: null,
      altreSulServer: true,
    }));

  const svuota = () => {
    ordini.value = [];
    risultatiCommessa.value = [];
    troncato.value = false;
    errore.value = null;
    altri.value = false;
    flussi = nuoviFlussi();
  };

  /** Una pagina del singolo flusso, ripartendo dal proprio cursore. */
  const leggiDalServer = async (f: Flusso) => {
    const vincoli: QueryConstraint[] = [];
    if (clienteCorrente) vincoli.push(where('clienteUID', '==', clienteCorrente));
    vincoli.push(where('stato', '==', f.stato), orderBy(f.campoOrdine, 'desc'));
    // Il cursore è il DocumentSnapshot, non il valore: con più DDT nello stesso
    // giorno un cursore per valore sarebbe ambiguo e salterebbe o ripeterebbe righe.
    if (f.cursore) vincoli.push(startAfter(f.cursore));
    vincoli.push(limit(PAGINA_ARCHIVIO));

    const snap = await getDocs(query(collection(db, 'preventivi'), ...vincoli));
    f.avanzo.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    f.cursore = snap.docs[snap.docs.length - 1] ?? f.cursore;
    f.altreSulServer = snap.docs.length === PAGINA_ARCHIVIO;
  };

  /**
   * Prossima pagina fusa, appesa a quella già a video.
   *
   * Prima riempie ogni flusso fino ad avere almeno una pagina in avanzo (o a
   * esaurirlo): è la condizione che rende corretta la fusione, perché una
   * pagina di N elementi non può pescarne più di N da un solo flusso, quindi
   * nessuna riga rimasta sul server può essere più recente di una già mostrata.
   */
  const caricaAltri = async () => {
    if (caricandoAltri.value || !altri.value) return;
    caricandoAltri.value = true;
    try {
      for (const f of flussi) {
        while (f.avanzo.length < PAGINA_ARCHIVIO && f.altreSulServer) {
          await leggiDalServer(f);
        }
      }
      const { pagina, resti } = fondiOrdinati(flussi.map(f => f.avanzo), PAGINA_ARCHIVIO);
      flussi.forEach((f, i) => { f.avanzo = resti[i] ?? []; });
      ordini.value = [...ordini.value, ...pagina];
      altri.value = flussi.some(f => f.avanzo.length > 0 || f.altreSulServer);
    } catch (e: any) {
      console.error('Errore caricamento archivio:', e);
      errore.value = 'Impossibile caricare altri ordini. Riprova.';
      // Senza questo, lo scroll infinito ritenterebbe a ogni pixel.
      altri.value = false;
    } finally {
      caricandoAltri.value = false;
    }
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
    altri.value = true; // sbloccato per la prima pagina
    try {
      await caricaAltri();
    } finally {
      loading.value = false;
    }
  };

  /**
   * Ricerca commessa per CONTENUTO: `1260895` trova `RIF. SALVALAIO 1260895`.
   *
   * Firestore non sa cercare una sottostringa — su un campo fa uguaglianza o
   * intervallo, e l'intervallo dà solo il prefisso — quindi l'unico modo è
   * scorrere le commesse e confrontarle. Lo fa la callable
   * `cercaCommessaArchivio` e non il browser, perché l'Admin SDK sa proiettare
   * i campi: scorrere l'archivio costa lì 84 KB e ~260 ms invece dei 1296 KB e
   * ~1550 ms che dovrebbe scaricare il client, e torna indietro solo la
   * manciata di KB dei risultati.
   *
   * Il prefisso è stato tolto del tutto, non tenuto come primo stadio: era più
   * rapido ma incompleto, e cercando `RIF` avrebbe restituito 8 commesse
   * lasciandone fuori 12 senza dirlo. Meglio qualche centinaio di ms in più
   * che un risultato parziale che sembra completo.
   */
  const cercaPerCommessa = async (termine: string) => {
    const t = (termine || '').trim();
    if (t.length < 2) return;

    loading.value = true;
    const cercata = t.toUpperCase();
    svuota();
    modalita.value = 'commessa';
    try {
      const chiama = httpsCallable(functions, 'cercaCommessaArchivio');
      const esito: any = (await chiama({ termine: cercata })).data;
      risultatiCommessa.value = esito?.risultati ?? [];
      troncato.value = !!esito?.troncato;
    } catch (e: any) {
      console.error('Errore ricerca commessa estesa:', e);
      errore.value = 'Ricerca non riuscita. Riprova.';
    } finally {
      loading.value = false;
    }
  };

  return {
    ordini,
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
