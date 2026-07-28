import type { Router } from 'vue-router';

/**
 * Recupero automatico dopo un deploy, per le schede rimaste aperte.
 *
 * Dopo ogni rilascio i chunk hanno nomi nuovi e i vecchi non esistono più sul
 * server; il service worker, con `skipWaiting`, prende subito il controllo e
 * ripulisce la precache. Una scheda aperta da prima esegue ancora il codice
 * vecchio: alla prima navigazione su una rotta lazy (ce ne sono 57) chiede un
 * chunk che non c'è più e si pianta con "Failed to fetch dynamically imported
 * module". Finora l'unica uscita era il ricaricamento forzato a mano.
 *
 * Qui l'errore viene intercettato e la pagina ricaricata sulla DESTINAZIONE
 * richiesta, non su quella di partenza: chi clicca "Amministrazione" e incappa
 * nel chunk mancante si ritrova in Amministrazione, aggiornata.
 *
 * Funziona solo perché l'HTML non è più servito da cache di frontiera (v.
 * regole `headers` in firebase.json): con l'index.html vecchio in cache il
 * ricaricamento avrebbe ripescato gli stessi chunk mancanti, all'infinito.
 */

export const CHIAVE_RECUPERO = 'pops:recupero-chunk';
/** Oltre questo numero si smette di ricaricare e l'errore viene a galla. */
export const MAX_TENTATIVI = 3;
/** Due tentativi più ravvicinati di così sono un ciclo, non un recupero. */
export const FINESTRA_MS = 10_000;

export interface StatoRecupero {
  tentativi: number;
  ultimo: number;
}

/** Tollera valori assenti o corrotti: in dubbio si riparte da zero. */
export function leggiStato(grezzo: string | null): StatoRecupero | null {
  if (!grezzo) return null;
  try {
    const v = JSON.parse(grezzo);
    const tentativi = Number(v?.tentativi);
    const ultimo = Number(v?.ultimo);
    if (!Number.isFinite(tentativi) || !Number.isFinite(ultimo)) return null;
    return { tentativi, ultimo };
  } catch {
    return null;
  }
}

/**
 * Il cuore della guardia anti-ciclo: un errore che il ricaricamento NON risolve
 * (deploy rotto, rete assente) non deve tradursi in ricaricamenti a ripetizione,
 * che sono peggio del sintomo che curano.
 */
export function deveRicaricare(
  ora: number,
  stato: StatoRecupero | null,
  max = MAX_TENTATIVI,
  finestraMs = FINESTRA_MS
): boolean {
  if (!stato) return true;
  if (stato.tentativi >= max) return false;
  return ora - stato.ultimo > finestraMs;
}

/** Riconosce il fallimento di un import dinamico fra i tanti errori di rotta. */
export function eErroreDiChunk(errore: unknown): boolean {
  const messaggio = String((errore as any)?.message ?? errore ?? '');
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module/i
    .test(messaggio);
}

/**
 * Aggancia il recupero. Tutto è protetto: un guasto qui non deve poter
 * impedire l'avvio dell'app, che è il motivo per cui vive in main.ts.
 */
export function installaRecuperoChunk(router: Router): void {
  const recupera = (destinazione?: string): boolean => {
    try {
      const ora = Date.now();
      const stato = leggiStato(sessionStorage.getItem(CHIAVE_RECUPERO));
      if (!deveRicaricare(ora, stato)) {
        console.warn('[recupero] chunk mancante, ma i tentativi sono esauriti: non ricarico.');
        return false;
      }
      sessionStorage.setItem(CHIAVE_RECUPERO, JSON.stringify({
        tentativi: (stato?.tentativi ?? 0) + 1,
        ultimo: ora,
      }));
      const dove = destinazione || (window.location.pathname + window.location.search);
      console.warn(`[recupero] chunk mancante dopo un deploy: ricarico su ${dove}`);
      window.location.assign(dove);
      return true;
    } catch (e) {
      console.error('[recupero] non riuscito:', e);
      return false;
    }
  };

  try {
    // Fallimento del preload di un chunk: Vite lo emette prima di lanciare.
    // preventDefault SOLO se stiamo davvero ricaricando, altrimenti l'errore
    // va lasciato emergere invece di essere inghiottito.
    window.addEventListener('vite:preloadError', (evento: Event) => {
      if (recupera()) evento.preventDefault();
    });

    // Fallimento dell'import() del componente di rotta.
    router.onError((errore, to) => {
      if (eErroreDiChunk(errore)) recupera(to?.fullPath);
    });
  } catch (e) {
    console.error('[recupero] aggancio non riuscito:', e);
  }
}
