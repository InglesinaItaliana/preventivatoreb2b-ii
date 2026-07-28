// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installaRecuperoChunk, CHIAVE_RECUPERO, MAX_TENTATIVI } from '../recuperoChunk';

/**
 * Verifica l'AGGANCIO, non la logica (già coperta a parte): che gli ascoltatori
 * siano davvero registrati e che portino a un ricaricamento sulla destinazione
 * giusta. È la parte che un test sulla sola funzione pura non tocca, e che in
 * produzione si scopre rotta solo dopo un deploy.
 */

/** Router finto: cattura il gestore d'errore e permette di scatenarlo. */
function routerFinto() {
  let gestore: ((e: unknown, to?: any) => void) | null = null;
  return {
    router: { onError: (fn: any) => { gestore = fn; } } as any,
    scatena: (errore: unknown, to?: any) => gestore?.(errore, to),
    agganciato: () => gestore !== null,
  };
}

let destinazione: string | null;

beforeEach(() => {
  sessionStorage.clear();
  destinazione = null;
  // window.location.assign non è implementata in happy-dom: la sostituiamo.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard', search: '', assign: (u: string) => { destinazione = u; } },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('installaRecuperoChunk', () => {
  it('registra il gestore d’errore del router', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);
    expect(f.agganciato()).toBe(true);
  });

  it('su chunk mancante ricarica sulla DESTINAZIONE richiesta, non sulla pagina corrente', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);
    f.scatena(new Error('Failed to fetch dynamically imported module: /assets/AdminView-x.js'), { fullPath: '/admin' });
    expect(destinazione).toBe('/admin');
  });

  it('senza destinazione ricarica il percorso corrente', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(destinazione).toBe('/dashboard');
  });

  it('annulla l’evento di preload SOLO quando ricarica davvero', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);

    const primo = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(primo);
    expect(primo.defaultPrevented).toBe(true);

    // Tentativi esauriti: l'errore deve tornare a galla invece di essere inghiottito.
    sessionStorage.setItem(CHIAVE_RECUPERO, JSON.stringify({ tentativi: MAX_TENTATIVI, ultimo: Date.now() }));
    destinazione = null;
    const secondo = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(secondo);
    expect(secondo.defaultPrevented).toBe(false);
    expect(destinazione).toBeNull();
  });

  it('non ricarica su un errore di rotta che non sia un chunk mancante', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);
    f.scatena(new Error('Navigation aborted'), { fullPath: '/admin' });
    expect(destinazione).toBeNull();
  });

  it('registra il tentativo, così il successivo è frenato dalla guardia', () => {
    const f = routerFinto();
    installaRecuperoChunk(f.router);
    f.scatena(new Error('Failed to fetch dynamically imported module'), { fullPath: '/admin' });

    const stato = JSON.parse(sessionStorage.getItem(CHIAVE_RECUPERO)!);
    expect(stato.tentativi).toBe(1);

    destinazione = null;
    f.scatena(new Error('Failed to fetch dynamically imported module'), { fullPath: '/admin' });
    expect(destinazione).toBeNull(); // troppo ravvicinato
  });

  it('se sessionStorage non è disponibile non esplode e non blocca l’app', () => {
    const f = routerFinto();
    const originale = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage disabilitato'); },
    });
    expect(() => {
      installaRecuperoChunk(f.router);
      f.scatena(new Error('Failed to fetch dynamically imported module'), { fullPath: '/admin' });
    }).not.toThrow();
    if (originale) Object.defineProperty(window, 'sessionStorage', originale);
  });
});
