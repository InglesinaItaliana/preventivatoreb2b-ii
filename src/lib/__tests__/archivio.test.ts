import { describe, it, expect } from 'vitest';
import { raggruppaPerMese, filtraClienti, dataOrdine, fondiOrdinati } from '../archivio';

const consegnato = (commessa: string, data: string) => ({ commessa, stato: 'DELIVERED', dataConsegnaPrevista: data });
const annullato = (commessa: string, secondi: number) => ({ commessa, stato: 'REJECTED', dataCreazione: { seconds: secondi } });

describe('dataOrdine', () => {
  it('legge la data DDT dei consegnati (stringa) e la creazione degli annullati (Timestamp)', () => {
    expect(dataOrdine(consegnato('A', '2026-07-15'))?.getFullYear()).toBe(2026);
    expect(dataOrdine(annullato('B', 1750000000))).toBeInstanceOf(Date);
  });

  it('per un annullato usa la creazione ANCHE se ha una data di consegna prevista', () => {
    // Metà degli annullati ha una dataConsegnaPrevista residua: usarla
    // ordinerebbe la riga su un campo diverso da quello della sua query,
    // e la fusione mescolerebbe liste ordinate per criteri diversi.
    const misto = { stato: 'REJECTED', dataConsegnaPrevista: '2026-12-31', dataCreazione: { seconds: 1750000000 } };
    expect(dataOrdine(misto)?.getFullYear()).toBe(new Date(1750000000 * 1000).getFullYear());
  });

  it('ripiega sull\'altra data se la primaria manca', () => {
    expect(dataOrdine({ stato: 'DELIVERED', dataCreazione: { seconds: 1750000000 } })).toBeInstanceOf(Date);
    expect(dataOrdine({ stato: 'REJECTED', dataConsegnaPrevista: '2026-03-01' })?.getMonth()).toBe(2);
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

describe('fondiOrdinati', () => {
  const D = (commessa: string, data: string) => consegnato(commessa, data);
  const R = (commessa: string, iso: string) => annullato(commessa, new Date(iso).getTime() / 1000);

  it('intercala due elenchi mantenendo l’ordine decrescente per data', () => {
    const { pagina } = fondiOrdinati([
      [D('d1', '2026-07-20'), D('d2', '2026-07-10'), D('d3', '2026-06-01')],
      [R('r1', '2026-07-15'), R('r2', '2026-07-05')],
    ], 10);
    expect(pagina.map(o => o.commessa)).toEqual(['d1', 'r1', 'd2', 'r2', 'd3']);
  });

  it('si ferma a `quanti` e lascia il resto negli avanzi, senza perdere nulla', () => {
    const a = [D('d1', '2026-07-20'), D('d2', '2026-07-10')];
    const b = [R('r1', '2026-07-15'), R('r2', '2026-07-05')];
    const { pagina, resti } = fondiOrdinati([a, b], 2);
    expect(pagina.map(o => o.commessa)).toEqual(['d1', 'r1']);
    expect(resti.flat().map(o => o.commessa)).toEqual(['d2', 'r2']);
    expect(pagina.length + resti.flat().length).toBe(a.length + b.length);
  });

  it('non altera gli elenchi in ingresso', () => {
    const a = [D('d1', '2026-07-20')];
    const b = [R('r1', '2026-07-15')];
    fondiOrdinati([a, b], 2);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('gestisce elenchi vuoti e chiede più di quanti ce ne siano', () => {
    expect(fondiOrdinati([[], []], 10).pagina).toEqual([]);
    expect(fondiOrdinati([[D('solo', '2026-07-20')], []], 10).pagina).toHaveLength(1);
  });

  it('mette in fondo chi non ha data, ma non lo perde', () => {
    const senzaData = { stato: 'DELIVERED', commessa: 'x' };
    const { pagina } = fondiOrdinati([[senzaData], [R('r1', '2026-07-15')]], 10);
    expect(pagina.map((o: any) => o.commessa)).toEqual(['r1', 'x']);
  });
});
