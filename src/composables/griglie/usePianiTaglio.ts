// src/composables/griglie/usePianiTaglio.ts
//
// I piani di taglio calcolati in background. Il calcolo (soprattutto quello
// ottimizzato sul bianco) può durare secondi: gira in un worker, così la pagina
// resta libera mentre si disegnano i pannelli. Si riparte quando i dati smettono
// di cambiare per `ritardo` ms (un cursore trascinato non lancia un calcolo a
// ogni scatto); un calcolo superato da dati nuovi viene buttato.
//
// `pronto` dice se i piani corrispondono ai dati di ADESSO: finché è falso, chi
// usa i piani (PDF, stampa) aspetta.

import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { calcolaRichiesta, type PianoTaglio, type RichiestaPiano } from '../../logic/griglie/nesting';
import type { DomandaPiani, RispostaPiani } from '../../lib/griglie/pianiTaglio.worker';

export function usePianiTaglio(richieste: () => RichiestaPiano[], ritardo = 400) {
  // Le richieste come testo: confronto per valore, e dati semplici da spedire al worker
  const firma = computed(() => JSON.stringify(richieste()));
  const piani = shallowRef<ReadonlyMap<string, PianoTaglio>>(new Map());
  const firmaPiani = ref<string | null>(null);
  const pronto = computed(() => firmaPiani.value === firma.value);

  let worker: Worker | null = null;
  let inVolo: { id: number; firma: string } | null = null;
  let prossimoId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const consegna = (f: string, risultati: [string, PianoTaglio][]) => {
    piani.value = new Map(risultati);
    firmaPiani.value = f;
  };
  // Calcolo nel thread della pagina: v. avvia, e se il worker si rompe
  const calcolaQui = (f: string) => {
    const lista: RichiestaPiano[] = JSON.parse(f);
    consegna(f, lista.map((r) => [r.chiave, calcolaRichiesta(r)]));
  };

  function avvia(f: string) {
    if (inVolo?.firma === f) return;   // già in calcolo
    if (f === firmaPiani.value) {      // i dati sono tornati quelli dei piani che ci sono
      if (inVolo) { worker?.terminate(); worker = null; inVolo = null; }
      return;
    }
    // Niente da calcolare (nessuna commessa, nessuna barra impostata), o niente worker
    // (test, browser vecchi): si fa qui
    if (f === '[]' || typeof Worker === 'undefined') { calcolaQui(f); return; }
    // Un calcolo ancora in corso è già superato: lo si ferma invece di aspettarlo
    if (inVolo && worker) { worker.terminate(); worker = null; }
    if (!worker) {
      worker = new Worker(new URL('../../lib/griglie/pianiTaglio.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<RispostaPiani>) => {
        if (!inVolo || e.data.id !== inVolo.id) return;
        const { firma: f2 } = inVolo;
        inVolo = null;
        consegna(f2, e.data.piani);
      };
      worker.onerror = () => {
        const f2 = inVolo?.firma;
        inVolo = null;
        worker?.terminate();
        worker = null;
        if (f2) calcolaQui(f2);
      };
    }
    inVolo = { id: ++prossimoId, firma: f };
    const domanda: DomandaPiani = { id: inVolo.id, richieste: JSON.parse(f) };
    worker.postMessage(domanda);
  }

  watch(firma, (f) => {
    clearTimeout(timer);
    // La prima volta subito; dopo, quando i dati smettono di cambiare
    timer = setTimeout(() => avvia(f), firmaPiani.value === null ? 0 : ritardo);
  }, { immediate: true });

  onScopeDispose(() => {
    clearTimeout(timer);
    worker?.terminate();
  });

  return { piani, pronto };
}
