import { describe, it, expect } from 'vitest';
import { raggruppaPerMese, filtraClienti, estremiCommessa, dataOrdine } from '../archivio';

const consegnato = (commessa: string, data: string) => ({ commessa, stato: 'DELIVERED', dataConsegnaPrevista: data });
const annullato = (commessa: string, secondi: number) => ({ commessa, stato: 'REJECTED', dataCreazione: { seconds: secondi } });

describe('dataOrdine', () => {
  it('legge la data DDT dei consegnati (stringa) e la creazione degli annullati (Timestamp)', () => {
    expect(dataOrdine(consegnato('A', '2026-07-15'))?.getFullYear()).toBe(2026);
    expect(dataOrdine(annullato('B', 1750000000))).toBeInstanceOf(Date);
  });

  it('non esplode su ordini senza data né su date malformate', () => {
    expect(dataOrdine({})).toBeNull();
    expect(dataOrdine({ dataConsegnaPrevista: 'non-una-data' })).toBeNull();
    expect(dataOrdine(null)).toBeNull();
  });
});

describe('raggruppaPerMese', () => {
  it('crea un gruppo per mese preservando l’ordine di arrivo', () => {
    const g = raggruppaPerMese([
      consegnato('A', '2026-07-24'),
      consegnato('B', '2026-07-09'),
      consegnato('C', '2026-06-30'),
      consegnato('D', '2026-02-17'),
    ]);
    expect(g.map(x => x.etichetta)).toEqual(['Luglio 2026', 'Giugno 2026', 'Febbraio 2026']);
    expect(g[0]!.ordini).toHaveLength(2);
  });

  it('distingue lo stesso mese di anni diversi', () => {
    const g = raggruppaPerMese([consegnato('A', '2026-01-10'), consegnato('B', '2025-01-10')]);
    expect(g.map(x => x.etichetta)).toEqual(['Gennaio 2026', 'Gennaio 2025']);
  });

  it('non perde gli ordini senza data e li mette in fondo', () => {
    const g = raggruppaPerMese([{ commessa: 'X' }, consegnato('A', '2026-07-24')]);
    expect(g[g.length - 1]!.etichetta).toBe('Senza data');
    expect(g.flatMap(x => x.ordini)).toHaveLength(2);
  });

  it('su lista vuota non produce gruppi', () => {
    expect(raggruppaPerMese([])).toEqual([]);
  });
});

describe('filtraClienti', () => {
  const clienti = [
    { ragioneSociale: 'VETRERIA STUCCHI S.R.L.', email: 'info@stucchi.it' },
    { ragioneSociale: 'Vetri Rachello S.r.l.', email: 'ordini@rachello.com' },
    { ragioneSociale: '', email: 'senza.ragione@example.com' },
  ];

  it('trova per sottostringa in mezzo al nome, non solo per prefisso', () => {
    expect(filtraClienti(clienti, 'stucchi')).toHaveLength(1);
    expect(filtraClienti(clienti, 'RACHELLO')[0]!.email).toBe('ordini@rachello.com');
  });

  it('trova anche per email quando la ragione sociale manca', () => {
    expect(filtraClienti(clienti, 'senza.ragione')).toHaveLength(1);
  });

  it('sotto i 2 caratteri non propone nulla (evita di listare tutti i clienti)', () => {
    expect(filtraClienti(clienti, 'v')).toEqual([]);
    expect(filtraClienti(clienti, '')).toEqual([]);
  });

  it('rispetta il tetto di risultati', () => {
    const tanti = Array.from({ length: 50 }, (_, i) => ({ ragioneSociale: `VETRERIA ${i}`, email: `v${i}@x.it` }));
    expect(filtraClienti(tanti, 'vetreria')).toHaveLength(10);
    expect(filtraClienti(tanti, 'vetreria', 3)).toHaveLength(3);
  });
});

describe('estremiCommessa', () => {
  it('normalizza a maiuscolo (in archivio le commesse lo sono al 100%)', () => {
    expect(estremiCommessa('maino')?.da).toBe('MAINO');
  });

  it('l’estremo superiore contiene il prefisso e ordina dopo di esso', () => {
    const e = estremiCommessa('MAINO')!;
    expect(e.a.startsWith(e.da)).toBe(true);
    expect(e.a > e.da).toBe(true);
    // Una commessa che estende il prefisso cade dentro l'intervallo...
    expect('MAINO 2' >= e.da && 'MAINO 2' <= e.a).toBe(true);
    // ...una che non lo ha, no.
    expect('MAINZ' <= e.a).toBe(false);
  });

  it('ignora spazi ai bordi e termini troppo corti', () => {
    expect(estremiCommessa('  maino  ')?.da).toBe('MAINO');
    expect(estremiCommessa('M')).toBeNull();
    expect(estremiCommessa('   ')).toBeNull();
  });
});
