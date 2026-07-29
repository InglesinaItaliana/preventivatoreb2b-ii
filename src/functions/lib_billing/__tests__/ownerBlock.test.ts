// ============================================================================
// Blocco `owner` del DDT CiC = destinatario stampato sul documento di trasporto.
// ----------------------------------------------------------------------------
// Il difetto che questi test presidiano: il layout Reviso stampa i campi DEL
// DOCUMENTO, non quelli del master cliente. POPS leggeva il cliente da Reviso
// (anagrafica completa) ma teneva solo id/nome/P.IVA → ogni DDT usciva col solo
// nome del destinatario e senza indirizzo, su un documento di trasporto fiscale.
// Verificato sul DDT #88 del 28/07/2026: owner.address = null sul documento,
// "Via Berlinguer 67/69 — 29020 Settima di Gossolengo (PC)" sul master.
//
// I payload qui sotto sono record REALI letti da Reviso il 2026-07-29, ridotti
// ai campi che contano.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { mapCustomerRef, buildOwnerBlock } from '../cicProvider';

/** Cliente italiano completo (customerNumber 75). */
const NURITH = {
  customerNumber: 75,
  name: 'NURITH SPA',
  vatNumber: '01785690734',
  defaultDiscountPct: 5,
  address: 'C.DA S.M. Dattoli SN',
  zip: '74013',
  city: 'Ginosa',
  province: { provinceNumber: 94, provinceCode: 'TA', countryCode: { code: 'IT' } },
  countryCode: { code: 'IT' },
  country: 'Italia',
};

/** Cliente ESTERO (customerNumber 41): niente provincia, paese diverso. */
const FRAMEGRIP = {
  customerNumber: 41,
  name: 'Framegrip Industries Limited',
  vatNumber: '12146510',
  address: 'Mosta Road',
  zip: 'LJA 9010',
  city: 'Lija',
  countryCode: { code: 'MT' },
  country: 'Malta',
};

/** Cliente con la sola ragione sociale: è il caso che deve restare com'era. */
const SPOGLIO = { customerNumber: 212, name: 'Vetreria Romagna s.r.l.', vatNumber: '00000000000' };

const VAT_ZONE = 1;

describe('mapCustomerRef', () => {
  it('porta con sé l\'anagrafica, non solo id e nome', () => {
    expect(mapCustomerRef(NURITH)).toEqual({
      id: 75,
      name: 'NURITH SPA',
      piva: '01785690734',
      defaultDiscountPct: 5,
      address: 'C.DA S.M. Dattoli SN',
      zip: '74013',
      city: 'Ginosa',
      provinceNumber: 94,
      countryCode: 'IT',
      country: 'Italia',
    });
  });

  it('prende il NUMERO della provincia, non la sigla', () => {
    // Sul documento la provincia è un id numerico: mandare 'TA' non risolve.
    expect(mapCustomerRef(NURITH).provinceNumber).toBe(94);
  });

  it('cliente estero: nessuna provincia, paese suo', () => {
    const ref = mapCustomerRef(FRAMEGRIP);
    expect(ref.provinceNumber).toBeUndefined();
    expect(ref.countryCode).toBe('MT');
    expect(ref.country).toBe('Malta');
  });

  it('anagrafica assente: campi non valorizzati, nessun crash', () => {
    const ref = mapCustomerRef(SPOGLIO);
    expect(ref.id).toBe(212);
    expect(ref.address).toBeUndefined();
    expect(ref.zip).toBeUndefined();
    expect(ref.city).toBeUndefined();
    expect(ref.provinceNumber).toBeUndefined();
  });

  it('usa la P.IVA di fallback quando il record non ce l\'ha', () => {
    expect(mapCustomerRef({ customerNumber: 9, name: 'X' }, '12345678901').piva).toBe('12345678901');
  });

  it('scarta le stringhe vuote invece di stampare campi vuoti sul DDT', () => {
    const ref = mapCustomerRef({ customerNumber: 9, name: 'X', address: '   ', city: '' });
    expect(ref.address).toBeUndefined();
    expect(ref.city).toBeUndefined();
  });
});

describe('buildOwnerBlock', () => {
  it('mette indirizzo e provincia sul documento (il DDT #88 non li aveva)', () => {
    expect(buildOwnerBlock(mapCustomerRef(NURITH), VAT_ZONE)).toEqual({
      address: 'C.DA S.M. Dattoli SN',
      zipCode: '74013',
      city: 'Ginosa',
      countryCode: { province: { id: 94, metaData: null }, id: 'IT', metaData: null },
      country: 'Italia',
      vatZone: { vatZoneNumber: 1, id: 1, metaData: null },
      vatAccount: null,
      name: 'NURITH SPA',
      id: 75,
      metaData: null,
    });
  });

  it('la provincia va DENTRO countryCode, com\'è sui documenti reali', () => {
    const owner = buildOwnerBlock(mapCustomerRef(NURITH), VAT_ZONE) as any;
    expect(owner.countryCode.province.id).toBe(94);
    expect(owner.province).toBeUndefined();
  });

  it('cliente estero: niente provincia e il paese giusto, non "Italia"', () => {
    const owner = buildOwnerBlock(mapCustomerRef(FRAMEGRIP), VAT_ZONE) as any;
    expect(owner.countryCode).toEqual({ id: 'MT', metaData: null });
    expect(owner.country).toBe('Malta');
  });

  it('`country` non è mai vuoto: se lo fosse il PDF stamperebbe "undefined"', () => {
    // Regressione dal DDT #89, dove country era null e il layout scriveva
    // "Bari, undefined" accanto alla provincia.
    expect(buildOwnerBlock({ id: 1, name: 'X', piva: '1' }, VAT_ZONE).country).toBe('Italia');
    expect(buildOwnerBlock({ id: 1, name: 'X', piva: '1', countryCode: 'DE' }, VAT_ZONE).country).toBe('DE');
  });

  it('senza anagrafica produce ESATTAMENTE il payload storico (nessuna regressione)', () => {
    // Il blocco che POPS inviava prima di questa modifica, verbatim: un cliente
    // senza indirizzo sul master deve continuare a partire com'è sempre partito.
    expect(buildOwnerBlock(mapCustomerRef(SPOGLIO), VAT_ZONE)).toEqual({
      address: null, zipCode: null, city: null,
      countryCode: { id: 'IT', metaData: null }, country: 'Italia',
      vatZone: { vatZoneNumber: 1, id: 1, metaData: null },
      vatAccount: null, name: 'Vetreria Romagna s.r.l.', id: 212, metaData: null,
    });
  });

  it('id e nome restano l\'aggancio al cliente: da lì nasce la fattura', () => {
    const owner = buildOwnerBlock(mapCustomerRef(NURITH), VAT_ZONE);
    expect(owner.id).toBe(75);
    expect(owner.name).toBe('NURITH SPA');
  });

  it('id numerico anche se il customerNumber arriva come stringa', () => {
    expect(buildOwnerBlock({ id: '75', name: 'X', piva: '1' }, VAT_ZONE).id).toBe(75);
  });
});
