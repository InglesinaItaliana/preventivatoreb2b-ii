import { ref } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { filtraClienti } from '../lib/archivio';

/**
 * Autocomplete clienti: cache dei documenti `users` caricata una volta sola,
 * poi filtro in memoria "contiene" su ragione sociale ed email.
 *
 * La collezione è piccola (121 documenti, ~64 KB in tutto), quindi una query
 * per tasto premuto sarebbe sprecata — e Firestore non saprebbe comunque fare
 * il "contiene", solo il prefisso.
 *
 * La cache è per ISTANZA, non di modulo: vive quanto il componente che chiama
 * questo composable. È deliberato — una cache di sessione farebbe sparire dai
 * suggerimenti un cliente appena creato finché non si ricarica la pagina, e il
 * preventivatore è esattamente il posto dove si va subito dopo aver creato un
 * cliente. Il risparmio sarebbe una manciata di KB; il costo, un ordine
 * intestato al cliente sbagliato.
 */
export function useClientiSuggeriti() {
  const cache = ref<any[]>([]);
  const suggeriti = ref<any[]>([]);
  const caricando = ref(false);
  let caricamentoInCorso: Promise<void> | null = null;

  const assicuraCache = async () => {
    if (cache.value.length) return;
    // Chiamate concorrenti (digitazione veloce) condividono lo stesso fetch.
    if (!caricamentoInCorso) {
      caricamentoInCorso = (async () => {
        const snap = await getDocs(collection(db, 'users'));
        cache.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      })().finally(() => {
        caricamentoInCorso = null;
      });
    }
    await caricamentoInCorso;
  };

  const cerca = async (termine: string) => {
    if ((termine || '').trim().length < 2) {
      suggeriti.value = [];
      return;
    }
    caricando.value = true;
    try {
      await assicuraCache();
      suggeriti.value = filtraClienti(cache.value, termine);
    } catch (e) {
      console.error('Errore caricamento clienti:', e);
      suggeriti.value = [];
    } finally {
      caricando.value = false;
    }
  };

  const pulisci = () => {
    suggeriti.value = [];
  };

  return { suggeriti, caricando, cerca, pulisci };
}
