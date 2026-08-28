import { describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Il percorso Firestore (`catalogSource === 'firestore'`) è quello vivo, e non
// passa dal CSV: qui si controlla che da 48 righe di prezzi + N righe di menu
// escano l'albero delle tendine, l'indice dei prezzi e le voci della lente —
// tre cose costruite in tre punti diversi della stessa funzione.
const BASE = [
  { cod: 'I111', sezione: 'GRIGLIA', modello: 'Varsavia', dimensione: '18', finitura: 'BIANCO 9010', prezzo: 10 },
  { cod: 'C111', sezione: 'CANALINO', modello: 'Alluminio', dimensione: '16', finitura: 'Neutro', prezzo: 2 },
  { cod: 'S001', sezione: 'SUPPLEMENTI', modello: 'Contributo allestimento telaio', dimensione: '', finitura: 'tot m griglia < 2', prezzo: 5 },
  { cod: 'S006', sezione: 'SUPPLEMENTI', modello: 'Contributo materiale perimetrale', dimensione: 'AL', finitura: 'perimetro oltre 7,5m', prezzo: 6 },
  // Prezzo "a richiesta": deve restare NaN, non diventare 0 (= "gratis").
  { cod: 'I132', sezione: 'GRIGLIA', modello: 'Varsavia', dimensione: '40', finitura: 'SPECIALE', prezzo: NaN },
];
// I supplementi NON sono voci di menu su tutte le installazioni: l'indice della
// lente non può dipendere dalla loro presenza qui.
const CATALOGO = [
  { cod: 'I111', categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '18', finitura: 'BIANCO 9010', tipoFinitura: 'BIANCA', prezzo: 999 },
  { cod: 'C111', categoria: 'CANALINO', modello: 'ALLUMINIO', dimensione: '16', finitura: 'NEUTRO', tipoFinitura: 'NEUTRO', prezzo: 999 },
  { cod: 'I132', categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '40', finitura: 'SPECIALE', tipoFinitura: 'ALTRO', prezzo: 999 },
];

vi.mock('firebase/firestore', () => {
  const snap = (r: any[]) => ({ empty: r.length === 0, docs: r.map((x) => ({ data: () => x })) });
  return {
    collection: (_db: any, nome: string) => ({ __coll: nome }),
    doc: (_db: any, c: string, id: string) => ({ __doc: `${c}/${id}` }),
    query: (c: any) => c,
    orderBy: () => ({}),
    getDoc: async () => ({ exists: () => true, data: () => ({ catalogSource: 'firestore' }) }),
    getDocs: async (ref: any) => snap(ref.__coll === 'listino_base' ? BASE : CATALOGO),
  };
});
vi.mock('../../firebase', () => ({ db: {}, auth: {}, storage: {}, functions: {} }));

const { useCatalogStore } = await import('../catalog');

describe('fetchCatalog, percorso Firestore', () => {
  it('costruisce albero, prezzi e voci della lente dalle caselle giuste', async () => {
    setActivePinia(createPinia());
    const c = useCatalogStore();
    await c.fetchCatalog();

    expect(c.source).toBe('firestore');

    // Albero: chiavi MAIUSCOLE, sono quelle che riempiono le tendine del builder.
    expect(Object.keys(c.listino).sort()).toEqual(['CANALINO', 'INGLESINA']);
    expect(c.listino.INGLESINA.VARSAVIA['18']['BIANCO 9010'].prezzo).toBe(10);

    // Prezzi: le righe di menu EREDITANO dalla base (999 non deve sopravvivere).
    expect(c.codiciMap['I111']).toBe(10);
    expect(c.codiciMap['C111']).toBe(2);
    expect(Number.isNaN(c.codiciMap['I132'])).toBe(true);
    // ...e i codici non a menu ci sono lo stesso.
    expect(c.codiciMap['S001']).toBe(5);
    expect(c.codiciMap['S006']).toBe(6);

    // Voci della lente: solo supplementi, nome da `modello`, casistica da
    // `finitura`. Su S006 `dimensione` vale 'AL' ed è la trappola.
    expect(c.supplementiMap['S001']).toEqual({ nome: 'Contributo allestimento telaio', casistica: 'tot m griglia < 2' });
    expect(c.supplementiMap['S006']).toEqual({ nome: 'Contributo materiale perimetrale', casistica: 'perimetro oltre 7,5m' });
    expect(Object.keys(c.supplementiMap).sort()).toEqual(['S001', 'S006']);
  });
});
