// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { nuovaCommessa } from '../../logic/griglie/commessa';

/**
 * L'aggancio a localStorage delle commesse griglie: che si salvino e si
 * rileggano, e che uno storage rotto, pieno o con dati illeggibili non faccia
 * esplodere il configuratore. happy-dom qui non espone `localStorage`: lo
 * installiamo noi (come in useNovita.dom.test.ts).
 */

const CHIAVE = 'pops_griglie_commesse_v1';

function storageFinto(opzioni: { scriviLancia?: boolean; iniziale?: string } = {}) {
  const dati = new Map<string, string>();
  if (opzioni.iniziale !== undefined) dati.set(CHIAVE, opzioni.iniziale);
  return {
    getItem: (k: string) => (dati.has(k) ? dati.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (opzioni.scriviLancia) throw new Error('QuotaExceededError');
      dati.set(k, v);
    },
    removeItem: (k: string) => { dati.delete(k); },
    clear: () => { dati.clear(); },
  };
}

/** Lo stato vive a livello di modulo: ogni test riparte da una postazione nuova. */
async function postazione(storage: ReturnType<typeof storageFinto>) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  vi.resetModules();
  return (await import('../griglie/useCommesseGriglie')).useCommesseGriglie();
}

describe('useCommesseGriglie', () => {
  it('salva e ritrova una commessa, anche ricaricando la pagina', async () => {
    const storage = storageFinto();
    const a = await postazione(storage);
    expect(a.salva({ ...nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'), commessa: '1175-26' })).toBe(true);

    const dopoRicarica = await postazione(storage);
    expect(dopoRicarica.trova('c1')?.commessa).toBe('1175-26');
  });

  it('salvare di nuovo la stessa commessa la sostituisce, non la duplica', async () => {
    const s = await postazione(storageFinto());
    s.salva(nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'));
    s.salva({ ...nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'), cliente: 'Rossi' });
    expect(s.commesse.value).toHaveLength(1);
    expect(s.trova('c1')?.cliente).toBe('Rossi');
  });

  it('elimina', async () => {
    const s = await postazione(storageFinto());
    s.salva(nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'));
    s.elimina('c1');
    expect(s.trova('c1')).toBeNull();
  });

  it('dati illeggibili: si parte vuoti invece di rompere la pagina', async () => {
    const s = await postazione(storageFinto({ iniziale: '{non è json' }));
    expect(s.commesse.value).toEqual([]);
  });

  it('il codice commessa non torna dopo aver eliminato la commessa', async () => {
    const s = await postazione(storageFinto());
    const primo = s.nuovoCodice(2026);
    s.salva({ ...nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'), commessa: primo });
    const secondo = s.nuovoCodice(2026);
    s.salva({ ...nuovaCommessa('c2', '2026-10-06T10:00:00.000Z'), commessa: secondo });
    s.elimina('c2');
    expect([primo, secondo, s.nuovoCodice(2026)]).toEqual(['GR-26-001', 'GR-26-002', 'GR-26-003']);
  });

  it('storage pieno o bloccato: il salvataggio fallisce e lo dice', async () => {
    const s = await postazione(storageFinto({ scriviLancia: true }));
    expect(s.salva(nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'))).toBe(false);
    expect(s.erroreSalvataggio.value).toBe(true);
  });
});
