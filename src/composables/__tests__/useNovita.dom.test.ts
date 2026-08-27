// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOVITA, contaNonLette, idStorici, novitaVisibili, oggiISO, type Novita } from '../../lib/novita';

/**
 * Verifica l'AGGANCIO a localStorage, non la logica (coperta in
 * lib/__tests__/novita.test.ts): che il seeding avvenga UNA volta sola per
 * postazione, che le letture si salvino, e che uno storage rotto o negato non
 * faccia esplodere la dashboard.
 *
 * Il comportamento si prova su un REGISTRO FINTO (una novità di oggi + una del
 * 2020), non su quello vero: un test che pretende "esiste una novità recente"
 * passerebbe oggi e cadrebbe fra una settimana, quando l'ultima novità diventa
 * arretrato. Sul registro vero restano solo le attese calcolate con le funzioni
 * pure, che valgono a qualsiasi data.
 *
 * happy-dom in questa configurazione NON espone `localStorage` (v. il test in
 * fondo): lo installiamo noi, ed è anche il gancio per simulare uno storage che
 * rifiuta di funzionare.
 */

const CHIAVE = 'pops_novita_lette';

const REGISTRO_FINTO: Novita[] = [
  { id: 'recente', titolo: 'Recente', sommario: 'di oggi', data: oggiISO(), tipo: 'funzione' },
  { id: 'vecchia', titolo: 'Vecchia', sommario: 'di anni fa', data: '2020-01-01', tipo: 'avviso' },
];

function storageFinto(opzioni: { leggiLancia?: boolean; scriviLancia?: boolean } = {}) {
  const dati = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (opzioni.leggiLancia) throw new Error('SecurityError');
      return dati.has(k) ? dati.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (opzioni.scriviLancia) throw new Error('QuotaExceededError');
      dati.set(k, v);
    },
    removeItem: (k: string) => { dati.delete(k); },
    clear: () => { dati.clear(); },
  };
}

function installa(storage: unknown) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

/**
 * Una postazione "nuova": lo stato del composable vive a livello di modulo (il
 * seeding non deve rifarsi a ogni mount), quindi va riazzerato a mano.
 * Con `registro` si sostituisce il registro vero.
 */
async function nuovaPostazione(registro?: typeof REGISTRO_FINTO) {
  vi.resetModules();
  if (registro) {
    vi.doMock('../../lib/novita', async () => {
      const vero = await vi.importActual<typeof import('../../lib/novita')>('../../lib/novita');
      return { ...vero, NOVITA: registro };
    });
  }
  return (await import('../useNovita')).useNovita;
}

const leggiSalvato = (): string[] | null => {
  const raw = localStorage.getItem(CHIAVE);
  return raw === null ? null : JSON.parse(raw);
};

beforeEach(() => {
  installa(storageFinto());
});

afterEach(() => {
  vi.doUnmock('../../lib/novita');
});

describe('useNovita — primo avvio su una postazione', () => {
  it('dà per letto l\'arretrato e lascia da leggere solo il recente', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette, isLetta } = useNovita();

    expect(leggiSalvato()).toEqual(['vecchia']);
    expect(isLetta('vecchia')).toBe(true);
    expect(nonLette.value).toBe(1);
  });

  it('sul registro vero il contatore non parte acceso su tutto', async () => {
    const useNovita = await nuovaPostazione();
    const { nonLette } = useNovita();

    const seed = idStorici(NOVITA, oggiISO());
    expect(leggiSalvato()).toEqual(seed);
    expect(nonLette.value).toBe(contaNonLette(NOVITA, seed, oggiISO()));
    expect(nonLette.value).toBeLessThanOrEqual(novitaVisibili(NOVITA, oggiISO()).length);
  });

  it('scrive la chiave anche se l\'arretrato è vuoto: è il segnale "già inizializzato"', async () => {
    const useNovita = await nuovaPostazione([REGISTRO_FINTO[0]!]);
    const { nonLette } = useNovita();

    expect(leggiSalvato()).toEqual([]);
    expect(nonLette.value).toBe(1);
  });
});

describe('useNovita — postazione già inizializzata', () => {
  it('non riseeda: un elenco vuoto salvato significa "tutto da leggere"', async () => {
    localStorage.setItem(CHIAVE, '[]'); // p.es. ho svuotato lo storico a mano
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette } = useNovita();

    expect(nonLette.value).toBe(2);
    expect(leggiSalvato()).toEqual([]);
  });

  it('segnaLetta abbassa il contatore e persiste', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette, isLetta, segnaLetta } = useNovita();

    segnaLetta('recente');

    expect(nonLette.value).toBe(0);
    expect(isLetta('recente')).toBe(true);
    expect(leggiSalvato()).toContain('recente');
  });

  it('segnaLetta due volte non duplica l\'id', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { segnaLetta } = useNovita();

    segnaLetta('recente');
    segnaLetta('recente');

    expect(leggiSalvato()!.filter((x) => x === 'recente')).toHaveLength(1);
  });

  it('segnaTutteLette spegne il badge', async () => {
    localStorage.setItem(CHIAVE, '[]');
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette, segnaTutteLette } = useNovita();
    expect(nonLette.value).toBe(2);

    segnaTutteLette();

    expect(nonLette.value).toBe(0);
    expect(leggiSalvato()).toHaveLength(2);
  });
});

describe('useNovita — storage ostile', () => {
  it('con un JSON corrotto si comporta come un primo avvio, non come "tutto da leggere"', async () => {
    localStorage.setItem(CHIAVE, '{non json');
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette, isLetta } = useNovita();

    expect(nonLette.value).toBe(1);
    expect(isLetta('vecchia')).toBe(true);
  });

  it('scarta i valori non stringa dentro l\'elenco salvato', async () => {
    localStorage.setItem(CHIAVE, JSON.stringify(['recente', 42, null, { a: 1 }]));
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { isLetta } = useNovita();

    expect(isLetta('recente')).toBe(true);
    expect(isLetta('42')).toBe(false);
  });

  it('se lo storage è negato non lancia e il contatore resta ragionevole', async () => {
    installa(storageFinto({ leggiLancia: true, scriviLancia: true }));

    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    let nonLette = -1;
    expect(() => {
      const api = useNovita();
      nonLette = api.nonLette.value;
      api.segnaTutteLette();
    }).not.toThrow();

    expect(nonLette).toBe(1); // nessuno stato leggibile = primo avvio
  });

  it('se localStorage non esiste affatto non lancia', async () => {
    installa(undefined);

    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    expect(() => useNovita().segnaLetta('recente')).not.toThrow();
  });
});

describe('useNovita — due schede sullo stesso PC', () => {
  it('quello che leggi in una scheda si spegne anche nell\'altra', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { isLetta, nonLette } = useNovita();
    expect(isLetta('recente')).toBe(false);

    // L'altra scheda ha scritto: il browser ci notifica con l'evento storage.
    localStorage.setItem(CHIAVE, JSON.stringify(['vecchia', 'recente']));
    window.dispatchEvent(new StorageEvent('storage', { key: CHIAVE }));

    expect(isLetta('recente')).toBe(true);
    expect(nonLette.value).toBe(0);
  });

  it('ignora gli eventi storage di altre chiavi', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { nonLette } = useNovita();

    localStorage.setItem('altra_chiave', 'x');
    window.dispatchEvent(new StorageEvent('storage', { key: 'altra_chiave' }));

    expect(nonLette.value).toBe(1);
  });

  it('se l\'altra scheda cancella la chiave, il badge non si riaccende a metà sessione', async () => {
    const useNovita = await nuovaPostazione(REGISTRO_FINTO);
    const { isLetta, segnaLetta } = useNovita();
    segnaLetta('recente');

    localStorage.removeItem(CHIAVE);
    window.dispatchEvent(new StorageEvent('storage', { key: CHIAVE }));

    expect(isLetta('recente')).toBe(true);
  });
});
