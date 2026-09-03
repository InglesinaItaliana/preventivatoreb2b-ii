import { describe, it, expect } from 'vitest';
import { nomeListino, stessoListino, ricostruisciPrezzoUnitario, tariffeLeali, MAGGIORAZIONE_LEALI } from '../listini';
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

// ============================================================================
// LA MAGGIORAZIONE LEALI
//
// È una leva di prezzo che vive nel codice e non nel listino: nessuno la vede
// da Firestore, nessuno se ne accorge se cambia. Questi test dicono ad alta
// voce quanto vale e come si applica, così spegnerla o riaccenderla è una
// decisione esplicita e non un effetto collaterale.
// ============================================================================
describe('maggiorazione LEALI', () => {
  it('vale 1,00 €/m ed è ATTIVA', () => {
    // Se questo test fallisce non è un bug: qualcuno ha mosso la leva. Va
    // aggiornato insieme alla decisione commerciale, mai "per far passare i test".
    expect(MAGGIORAZIONE_LEALI).toBe(1.00);
  });

  it('si somma a entrambe le tariffe: su una riga col canalino pesa il doppio', () => {
    const t = tariffeLeali(14, 2.5, false);
    expect(t.griglia).toBe(15);
    expect(t.canalino).toBe(3.5);
    // +2,00 €/m di sviluppo rispetto alle tariffe di listino (14 + 2,5 = 16,5).
    expect(t.griglia + t.canalino).toBe(18.5);
  });

  it('senza canalino la seconda quota resta nel conto, ma sulla griglia', () => {
    // Il motore somma la quota del canalino anche quando il canalino non c'è:
    // il prezzo la contiene e non si tocca. Esporla come voce "Canalino"
    // mostrerebbe però al cliente una riga che sulla sua inglesina non esiste.
    const t = tariffeLeali(14, 0, true);
    expect(t.canalino).toBe(0);
    expect(t.griglia).toBe(16);
    // Il totale è lo stesso di prima che la quota venisse accorpata.
    expect(t.griglia + t.canalino).toBe((14 + 1) + (0 + 1));
  });

  it('la tariffa concordata parte da sé, non dal listino', () => {
    // Il prezzo/m concordato sostituisce quello di listino, poi la
    // maggiorazione si applica sopra: è la stessa cascata del motore.
    expect(tariffeLeali(23.5, 2.5, false).griglia).toBe(24.5);
  });
});
