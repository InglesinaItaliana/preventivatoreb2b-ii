import { describe, it, expect } from 'vitest';
import { ARCHIVE_STATUSES, ARCHIVIO_QUERIES } from '../types';

/**
 * Guardia anti-drift: l'archivio carica una query per stato, quindi uno stato
 * aggiunto ad ARCHIVE_STATUSES e non ad ARCHIVIO_QUERIES sparirebbe dalla
 * modale senza alcun errore — proprio il tipo di buco che questa fase chiude.
 */
describe('spec query archivio', () => {
  it('copre esattamente gli stati di archivio', () => {
    expect([...ARCHIVIO_QUERIES.map(q => q.stato)].sort()).toEqual([...ARCHIVE_STATUSES].sort());
  });

  it('ordina i consegnati sulla data del DDT, non sulla data di spedizione', () => {
    // dataSpedizione manca sugli ordini chiusi senza DDT: un orderBy su un campo
    // assente li escluderebbe dalla query in silenzio.
    const consegnati = ARCHIVIO_QUERIES.find(q => q.stato === 'DELIVERED');
    expect(consegnati?.campoOrdine).toBe('dataConsegnaPrevista');
  });

  it('ha una capienza propria per stato', () => {
    for (const q of ARCHIVIO_QUERIES) expect(q.limite).toBeGreaterThan(0);
  });
});
