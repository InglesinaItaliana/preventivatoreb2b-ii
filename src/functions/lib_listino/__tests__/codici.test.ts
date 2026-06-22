import { describe, it, expect } from 'vitest';
import { nextCodice, nextCodiciForTiers, type BaseEntry } from '../codici';

// Fixture basato sui codici reali del listino.
const EXISTING: BaseEntry[] = [
  // Inglesina · Varsavia · dim 18
  { cod: 'I111', modello: 'VARSAVIA', dimensione: '18' },
  { cod: 'I112', modello: 'VARSAVIA', dimensione: '18' },
  { cod: 'I113', modello: 'VARSAVIA', dimensione: '18' },
  { cod: 'I114', modello: 'VARSAVIA', dimensione: '18' },
  { cod: 'I115', modello: 'VARSAVIA', dimensione: '18' },
  // Varsavia · dim 26
  { cod: 'I121', modello: 'VARSAVIA', dimensione: '26' },
  { cod: 'I125', modello: 'VARSAVIA', dimensione: '26' },
  // Varsavia · dim 45
  { cod: 'I131', modello: 'VARSAVIA', dimensione: '45' },
  { cod: 'I133', modello: 'VARSAVIA', dimensione: '45' },
  // Inglesina · Germanella
  { cod: 'I211', modello: 'GERMANELLA', dimensione: 'STD' },
  { cod: 'I212', modello: 'GERMANELLA', dimensione: 'STD' },
  // Duplex
  { cod: 'D111', modello: 'ALLUMINIO', dimensione: 'TUTTE' },
  { cod: 'D112', modello: 'ALLUMINIO', dimensione: 'TUTTE' },
  { cod: 'D211', modello: 'BORDO CALDO', dimensione: 'TUTTE' },
  { cod: 'D311', modello: 'FIBRA', dimensione: 'TUTTE' },
];

describe('nextCodice', () => {
  it('nuova finitura su (modello,dimensione) esistente → append cifra finitura', () => {
    expect(nextCodice('INGLESINA', 'VARSAVIA', '18', EXISTING)).toBe('I116'); // dopo I115
    expect(nextCodice('INGLESINA', 'VARSAVIA', '45', EXISTING)).toBe('I134'); // dopo I133
  });

  it('nuova dimensione su modello esistente → nuova cifra dimensione, finitura 1', () => {
    expect(nextCodice('INGLESINA', 'VARSAVIA', '60', EXISTING)).toBe('I141'); // dim 18=1,26=2,45=3 → 4
  });

  it('nuovo modello su categoria esistente → nuova cifra modello, dim 1, finitura 1', () => {
    expect(nextCodice('INGLESINA', 'ROMANA', '20', EXISTING)).toBe('I311'); // Varsavia=1,Germanella=2 → 3
    expect(nextCodice('DUPLEX', 'PVC', 'TUTTE', EXISTING)).toBe('D411'); // Alluminio/BordoCaldo/Fibra → 4
  });

  it('matching case-insensitive su modello e dimensione', () => {
    expect(nextCodice('inglesina', 'varsavia', '18', EXISTING)).toBe('I116');
  });

  it('categoria non gestita → errore', () => {
    expect(() => nextCodice('SUA FINESTRE', 'X', 'Y', EXISTING)).toThrow(/Categoria non gestita/);
  });

  it('overflow finitura (10°) → errore', () => {
    const full: BaseEntry[] = Array.from({ length: 9 }, (_, i) => ({ cod: `I11${i + 1}`, modello: 'VARSAVIA', dimensione: '18' }));
    expect(() => nextCodice('INGLESINA', 'VARSAVIA', '18', full)).toThrow(/Overflow/);
  });

  it('overflow modello (10°) → errore', () => {
    const full: BaseEntry[] = Array.from({ length: 9 }, (_, i) => ({ cod: `I${i + 1}11`, modello: `M${i + 1}`, dimensione: 'X' }));
    expect(() => nextCodice('INGLESINA', 'NUOVO', 'X', full)).toThrow(/Overflow/);
  });
});

describe('nextCodiciForTiers (accumulo)', () => {
  it('più tier sulla stessa nuova dimensione → cifre finitura successive', () => {
    const out = nextCodiciForTiers([
      { categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '60', tipoFinitura: 'BIANCA' },
      { categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '60', tipoFinitura: 'COLORE STANDARD' },
      { categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '60', tipoFinitura: 'RIVESTITA' },
    ], EXISTING);
    expect(out.map((t) => t.cod)).toEqual(['I141', 'I142', 'I143']);
  });

  it('nuovo modello con 2 dimensioni → cifra modello stabile, dimensioni progressive', () => {
    const out = nextCodiciForTiers([
      { categoria: 'INGLESINA', modello: 'ROMANA', dimensione: '20', tipoFinitura: 'BIANCA' },
      { categoria: 'INGLESINA', modello: 'ROMANA', dimensione: '20', tipoFinitura: 'COLORE STANDARD' },
      { categoria: 'INGLESINA', modello: 'ROMANA', dimensione: '30', tipoFinitura: 'BIANCA' },
    ], EXISTING);
    expect(out.map((t) => t.cod)).toEqual(['I311', 'I312', 'I321']);
  });
});
