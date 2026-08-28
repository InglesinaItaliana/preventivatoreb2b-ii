import { describe, it, expect } from 'vitest';
import { nomeListino, stessoListino, ricostruisciPrezzoUnitario } from '../listini';
import type { RigaPricing } from '../../types';

describe('anagrafica listini', () => {
  it('dà un nome leggibile ai listini che girano davvero', () => {
    expect(nomeListino('2026-a')).toBe('Listino 2026');
    expect(nomeListino('2025-a')).toBe('Listino 2025');
    expect(nomeListino('2025x')).toBe('Listino LEALI');
    expect(nomeListino('2025-x')).toBe('Listino LEALI');
  });

  it('un listino sconosciuto si mostra com\'è, non si inventa', () => {
    expect(nomeListino('2027-b')).toBe('2027-b');
    expect(nomeListino(null)).toBe('non registrato');
    expect(nomeListino(undefined)).toBe('non registrato');
  });

  // '2025x' e '2025-x' sono la stessa cosa scritta in due modi (il disallineamento
  // che faceva cadere i clienti LEALI nel listino 2026, v. pricing.ts). Il
  // confronto che decide se mostrare "listino divergente" non deve ricascarci.
  it('riconosce le due scritture dello stesso listino LEALI', () => {
    expect(stessoListino('2025x', '2025-x')).toBe(true);
    expect(stessoListino('2025-x', '2025x')).toBe(true);
    expect(stessoListino('2025-a', '2025x')).toBe(false);
    expect(stessoListino('2026-a', '2026-a')).toBe(true);
    expect(stessoListino(null, '2026-a')).toBe(false);
    expect(stessoListino('2026-a', undefined)).toBe(false);
  });
});

describe('la formula unica dello scontrino', () => {
  const base: RigaPricing = {
    listino: '2026-a', regime: 'INCROCIO', metrica: 'sviluppo', metriPezzo: 2,
    tariffe: [], maggiorazionePct: null, supplementi: [], taglia: null,
  };

  it('somma le tariffe e le moltiplica per i metri', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 14 }, { tipo: 'canalino', valore: 2.5 }],
    })).toBeCloseTo(33, 10);
  });

  it('la maggiorazione è una percentuale, non un moltiplicatore', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 10 }], maggiorazionePct: 20,
    })).toBeCloseTo(24, 10);
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 10 }], maggiorazionePct: 50,
    })).toBeCloseTo(30, 10);
  });

  it('i supplementi si sommano a valle, fuori dai metri e fuori dalla maggiorazione', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base,
      tariffe: [{ tipo: 'griglia', valore: 10 }],
      supplementi: [{ tipo: 'attrezzaggio', codice: 'S002', importo: 12 }, { tipo: 'perimetrale', codice: 'S004', importo: 14 }],
    })).toBeCloseTo(46, 10);
  });

  it('nessuna tariffa = nessun prezzo', () => {
    expect(ricostruisciPrezzoUnitario(base)).toBe(0);
  });
});
