import { ref } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { filtraClienti } from '../lib/archivio';

/**
 * Autocomplete clienti: cache locale di `users` caricata una volta sola, poi
 * filtro in memoria "contiene" su ragione sociale ed email.
 *
 * È la stessa strategia del preventivatore (BuilderView, "crea ordine per
 * cliente"): la collezione è piccola (121 documenti, ~64 KB in tutto), quindi
 * una query per tasto premuto sarebbe sprecata — e Firestore non saprebbe
 * comunque fare il "contiene", solo il prefisso.
 *
 * La cache è a livello di MODULO, quindi condivisa fra tutti i consumatori e
 * scaricata una volta per sessione. Vive qui perché BuilderView possa un giorno
 * adottarla al posto della propria copia: oggi non lo tocchiamo, è il percorso
 * caldo di POPS e non vale il rischio per una deduplicazione.
 */
const cacheClienti = ref<any[]>([]);
let caricamentoInCorso: Promise<void> | null = null;

async function assicuraCache() {
  if (cacheClienti.value.length) return;
  // Chiamate concorrenti (digitazione veloce) condividono lo stesso fetch.
  if (!caricamentoInCorso) {
    caricamentoInCorso = (async () => {
      const snap = await getDocs(collection(db, 'users'));
      cacheClienti.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    })().finally(() => {
      caricamentoInCorso = null;
    });
  }
  await caricamentoInCorso;
}

export function useClientiSuggeriti() {
  const suggeriti = ref<any[]>([]);
  const caricando = ref(false);

  const cerca = async (termine: string) => {
    if ((termine || '').trim().length < 2) {
      suggeriti.value = [];
      return;
    }
    caricando.value = true;
    try {
      await assicuraCache();
      suggeriti.value = filtraClienti(cacheClienti.value, termine);
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
