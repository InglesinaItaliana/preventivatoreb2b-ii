import { describe, it, expect } from 'vitest';
import {
  deveRicaricare, leggiStato, eErroreDiChunk, MAX_TENTATIVI, FINESTRA_MS,
} from '../recuperoChunk';

describe('deveRicaricare (guardia anti-ciclo)', () => {
  const ORA = 1_800_000_000_000;

  it('al primo errore ricarica', () => {
    expect(deveRicaricare(ORA, null)).toBe(true);
  });

  it('non ricarica due volte a distanza ravvicinata', () => {
    // Un errore che il ricaricamento non risolve produrrebbe un cappio.
    expect(deveRicaricare(ORA, { tentativi: 1, ultimo: ORA - 1_000 })).toBe(false);
    expect(deveRicaricare(ORA, { tentativi: 1, ultimo: ORA })).toBe(false);
  });

  it('ricarica di nuovo se è passato abbastanza tempo (deploy successivo)', () => {
    expect(deveRicaricare(ORA, { tentativi: 1, ultimo: ORA - FINESTRA_MS - 1 })).toBe(true);
  });

  it('smette del tutto dopo il massimo dei tentativi, anche a distanza di ore', () => {
    const vecchio = { tentativi: MAX_TENTATIVI, ultimo: ORA - 3_600_000 };
    expect(deveRicaricare(ORA, vecchio)).toBe(false);
  });

  it('un orologio che va indietro non sblocca il limite', () => {
    // ora < ultimo ⇒ differenza negativa ⇒ nessun ricaricamento.
    expect(deveRicaricare(ORA, { tentativi: 1, ultimo: ORA + 60_000 })).toBe(false);
  });
});

describe('leggiStato', () => {
  it('legge uno stato valido', () => {
    expect(leggiStato('{"tentativi":2,"ultimo":123}')).toEqual({ tentativi: 2, ultimo: 123 });
  });

  it('in dubbio riparte da zero invece di bloccare il recupero', () => {
    for (const grezzo of [null, '', 'non-json', '{}', '{"tentativi":"x","ultimo":1}', '[]']) {
      expect(leggiStato(grezzo)).toBeNull();
    }
  });
});

describe('eErroreDiChunk', () => {
  it('riconosce i messaggi dei browser per un import dinamico fallito', () => {
    const messaggi = [
      'Failed to fetch dynamically imported module: https://x/assets/AdminView-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
    ];
    for (const m of messaggi) {
      expect(eErroreDiChunk(new Error(m))).toBe(true);
      expect(eErroreDiChunk(m)).toBe(true);
    }
  });

  it('non scambia per chunk mancante un errore di rotta qualsiasi', () => {
    // Ricaricare su un errore diverso nasconderebbe il vero problema.
    expect(eErroreDiChunk(new Error('Navigation aborted'))).toBe(false);
    expect(eErroreDiChunk(new Error('permission-denied'))).toBe(false);
    expect(eErroreDiChunk(null)).toBe(false);
    expect(eErroreDiChunk(undefined)).toBe(false);
  });
});
