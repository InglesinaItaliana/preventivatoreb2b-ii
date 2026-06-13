// ============================================================================
// Smoke su billing.ts (risoluzione backend + riferimenti documento unificati)
// + GUARDIA ANTI-DRIFT: il computeTotals del FRONTEND (billingTotals.ts) deve
// restare identico a quello del BACKEND (functions/lib_billing/rounding.ts),
// altrimenti la cifra mostrata al cliente diverge dal documento CiC.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { resolveBackend, billingInfo } from '../billing';
import { computeTotals as feTotals, round2 as feRound2 } from '../billingTotals';
import { computeTotals as beTotals, round2 as beRound2 } from '../../functions/lib_billing/rounding';

describe('resolveBackend', () => {
  it('flag esplicito ha la precedenza', () => {
    expect(resolveBackend({ billingBackend: 'cic' })).toBe('cic');
    expect(resolveBackend({ billingBackend: 'fic', cic_order_id: 9 })).toBe('fic');
  });
  it('senza flag, la presenza di id CiC implica cic', () => {
    expect(resolveBackend({ cic_order_id: 5 })).toBe('cic');
    expect(resolveBackend({ cic_ddt_id: 8 })).toBe('cic');
  });
  it('default e null → fic', () => {
    expect(resolveBackend({})).toBe('fic');
    expect(resolveBackend(null)).toBe('fic');
    expect(resolveBackend(undefined)).toBe('fic');
  });
});

describe('billingInfo — pesca i campi del backend giusto', () => {
  it('preventivo FiC', () => {
    const info = billingInfo({
      fic_order_id: 100, fic_order_url: 'http://fic/o',
      fic_ddt_id: 200, fic_ddt_number: 7, fic_ddt_url: 'http://fic/d',
      cic_ddt_id: 999, // non deve essere pescato: backend è fic
    } as any);
    // cic_ddt_id presente farebbe risolvere cic → forziamo il caso fic con flag
    const ficInfo = billingInfo({
      billingBackend: 'fic',
      fic_order_id: 100, fic_ddt_id: 200, fic_ddt_number: 7,
    } as any);
    expect(ficInfo.backend).toBe('fic');
    expect(ficInfo.hasOrder).toBe(true);
    expect(ficInfo.hasDdt).toBe(true);
    expect(ficInfo.ddtId).toBe(200);
    expect(ficInfo.ddtNumber).toBe(7);
    expect(info.backend).toBe('cic'); // perché cic_ddt_id presente senza flag
  });

  it('preventivo CiC', () => {
    const info = billingInfo({
      billingBackend: 'cic',
      cic_order_id: 5, cic_order_url: 'http://cic/o',
      cic_ddt_id: 8, cic_ddt_number: 1, cic_ddt_url: 'http://cic/d',
      billingError: 'boom',
    } as any);
    expect(info.backend).toBe('cic');
    expect(info.orderId).toBe(5);
    expect(info.ddtId).toBe(8);
    expect(info.ddtNumber).toBe(1);
    expect(info.billingError).toBe('boom');
  });

  it('preventivo vuoto: nessun documento, default fic', () => {
    const info = billingInfo({});
    expect(info.backend).toBe('fic');
    expect(info.hasOrder).toBe(false);
    expect(info.hasDdt).toBe(false);
  });
});

describe('anti-drift: computeTotals FE === BE (rischio #1 migrazione)', () => {
  const scenarios: Array<{ lines: Array<{ qty: number; unitNetPrice: number }>; disc: number }> = [
    { lines: [{ qty: 3, unitNetPrice: 127.33 }, { qty: 5, unitNetPrice: 88.17 }, { qty: 1, unitNetPrice: 45.5 }], disc: 7 },
    { lines: [{ qty: 2, unitNetPrice: 10 }], disc: 0 },
    { lines: [{ qty: 7, unitNetPrice: 13.37 }, { qty: 1, unitNetPrice: 0.99 }], disc: 3.5 },
    { lines: [{ qty: 1, unitNetPrice: 0.1 }, { qty: 1, unitNetPrice: 0.1 }], disc: 0 },
    { lines: [], disc: 10 },
  ];

  it.each(scenarios)('stessi totali per %o', ({ lines, disc }) => {
    expect(feTotals(lines, disc, 22)).toEqual(beTotals(lines, disc, 22));
  });

  it('round2 identico sui casi-limite', () => {
    for (const n of [42.315, 1.005, 2.675, -1.005, 0.005, 199.995]) {
      expect(feRound2(n)).toBe(beRound2(n));
    }
  });
});
