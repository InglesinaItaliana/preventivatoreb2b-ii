// ============================================================================
// Smoke su billing.ts (risoluzione backend + riferimenti documento unificati)
// + GUARDIA ANTI-DRIFT: il computeTotals del FRONTEND (billingTotals.ts) deve
// restare identico a quello del BACKEND (functions/lib_billing/rounding.ts),
// altrimenti la cifra mostrata al cliente diverge dal documento CiC.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { resolveBackend, billingInfo, ddtElementi, isDeliveryTariff } from '../billing';
import { computeTotals as feTotals, round2 as feRound2 } from '../billingTotals';
import { computeTotals as beTotals, round2 as beRound2 } from '../../functions/lib_billing/rounding';
import { buildDdtLines } from '../../functions/lib_billing/ddtLines';

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
  const scenarios: Array<{ lines: Array<{ qty: number; unitNetPrice: number; discountPct?: number }>; disc: number }> = [
    { lines: [{ qty: 3, unitNetPrice: 127.33 }, { qty: 5, unitNetPrice: 88.17 }, { qty: 1, unitNetPrice: 45.5 }], disc: 7 },
    { lines: [{ qty: 2, unitNetPrice: 10 }], disc: 0 },
    { lines: [{ qty: 7, unitNetPrice: 13.37 }, { qty: 1, unitNetPrice: 0.99 }], disc: 3.5 },
    { lines: [{ qty: 1, unitNetPrice: 0.1 }, { qty: 1, unitNetPrice: 0.1 }], disc: 0 },
    { lines: [], disc: 10 },
    // sconto PER RIGA (il trasporto non prende lo sconto d'ordine): il ramo nuovo
    // deve restare identico fra frontend e backend, o la cifra firmata dal cliente
    // diverge da quella dell'ordine.
    { lines: [{ qty: 2, unitNetPrice: 127.33 }, { qty: 1, unitNetPrice: 35, discountPct: 0 }], disc: 5 },
    { lines: [{ qty: 1, unitNetPrice: 45, discountPct: 0 }], disc: 50 },
    { lines: [{ qty: 3, unitNetPrice: 13.37, discountPct: 2.5 }, { qty: 1, unitNetPrice: 40, discountPct: 0 }], disc: 15 },
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

// ============================================================================
// GUARDIA ANTI-DRIFT #2: le righe del DDT stampato per il cliente (ddtElementi)
// devono essere le STESSE del DDT fiscale su CiC (buildDdtLines del backend).
// Se i due documenti dello stesso trasporto elencano cose diverse, il cliente
// riceve una bolla che smentisce la sua fattura.
// ============================================================================
describe('ddtElementi (PDF cliente) === buildDdtLines (DDT fiscale)', () => {
  const vetro = { categoria: 'DUPLEX', descrizioneCompleta: 'DUPLEX 25', codice: 'D211', quantita: 2, prezzo_unitario: 50 };
  const lav = { categoria: 'EXTRA', descrizioneCompleta: 'CURVATURE E ADATTAMENTI', codice: '', quantita: 3, prezzo_unitario: 20 };
  const cons = (nome: string, prezzo: number, codice = 'L001') =>
    ({ categoria: 'EXTRA', descrizioneCompleta: nome, codice, quantita: 1, prezzo_unitario: prezzo });

  it('tiene merce e lavorazioni, e una sola consegna (la tariffa più alta)', () => {
    const righe = ddtElementi([vetro, lav, cons('Consegna Diretta V1', 35), cons('Consegna Diretta V2', 45, 'L002')]);
    const consegne = righe.filter((r: any) => isDeliveryTariff(r.descrizioneCompleta));
    expect(consegne).toHaveLength(1);
    expect(consegne[0].prezzo_unitario).toBe(45);
    expect(consegne[0].quantita).toBe(1);
    expect(righe.find((r: any) => r.descrizioneCompleta.includes('CURVATURE'))).toBeTruthy();
  });

  it('a mezzo corriere la consegna diventa "Spedizione"/L004, come sul DDT CiC', () => {
    const righe = ddtElementi([vetro, cons('Consegna Diretta V2', 45, 'L002')], 'COURIER');
    const c: any = righe.at(-1);
    expect(c.descrizioneCompleta).toBe('Spedizione');
    expect(c.codice).toBe('L004');
    expect(c.prezzo_unitario).toBe(45);   // il prezzo pattuito resta
  });

  it('coi mezzi interni la consegna non viene rinominata', () => {
    const righe = ddtElementi([vetro, cons('Consegna Diretta V2', 45, 'L002')], 'INTERNAL');
    expect((righe.at(-1) as any).descrizioneCompleta).toBe('Consegna Diretta V2');
  });

  it('la consegna non porta il gruppo del suo ordine (niente banda duplicata nel PDF)', () => {
    const righe = ddtElementi([
      { ...vetro, __group: 'Ordine 1' },
      { ...cons('Consegna Diretta V1', 35), __group: 'Ordine 1' },
      { ...vetro, __group: 'Ordine 2' },
    ]);
    const consegna: any = righe.at(-1);
    expect(isDeliveryTariff(consegna.descrizioneCompleta)).toBe(true);
    expect(consegna.__group).toBeUndefined();
  });
});

// La regola che decide COSA VIENE FATTURATO esiste in due copie (backend buildDdtLines,
// frontend ddtElementi): questa è la guardia che le tiene allineate. Se divergono, il
// DDT che il cliente riceve elenca righe diverse da quelle della sua fattura.
describe('anti-drift: ddtElementi (PDF) === buildDdtLines (DDT fiscale)', () => {
  const elementi = [
    { categoria: 'DUPLEX', descrizioneCompleta: 'DUPLEX 25', codice: 'D211', quantita: 2, prezzo_unitario: 50 },
    { categoria: 'EXTRA', descrizioneCompleta: 'CURVATURE E ADATTAMENTI', codice: '', quantita: 3, prezzo_unitario: 20 },
    { categoria: 'EXTRA', descrizioneCompleta: 'Consegna Diretta V1', codice: 'L001', quantita: 1, prezzo_unitario: 35 },
    { categoria: 'EXTRA', descrizioneCompleta: 'Consegna Diretta V2', codice: 'L002', quantita: 1, prezzo_unitario: 45 },
  ];

  const descrizioniBackend = (trasporto?: 'COURIER' | 'INTERNAL') =>
    buildDdtLines([{ elementi, scontoPercentuale: 5 }], 3, trasporto)
      .filter((l) => !l.isDescriptive)
      .map((l) => l.description.split(' - Dim:')[0]);   // il backend annota le dimensioni

  const descrizioniFrontend = (trasporto?: string) =>
    ddtElementi(elementi, trasporto).map((e: any) => e.descrizioneCompleta);

  it('stesse righe, stesso ordine (mezzi interni)', () => {
    expect(descrizioniFrontend('INTERNAL')).toEqual(descrizioniBackend('INTERNAL'));
  });

  it('stesse righe anche a mezzo corriere (rinomina inclusa)', () => {
    expect(descrizioniFrontend('COURIER')).toEqual(descrizioniBackend('COURIER'));
    expect(descrizioniFrontend('COURIER').at(-1)).toBe('Spedizione');
  });

  it('entrambi tengono una sola consegna, la tariffa più alta', () => {
    const fe = ddtElementi(elementi, 'INTERNAL').filter((e: any) => isDeliveryTariff(e.descrizioneCompleta));
    expect(fe).toHaveLength(1);
    expect(fe[0].prezzo_unitario).toBe(45);
  });
});
