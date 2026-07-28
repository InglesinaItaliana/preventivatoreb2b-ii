// ============================================================================
// Anagrafica emittente: mappatura della risposta Reviso /self.
// Il payload di riferimento è quello reale dell'agreement Inglesina Italiana
// (letto il 2026-07-28), ridotto ai campi che finiscono sui documenti.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { mapSelfToCompany, diffCompany } from '../companyInfo';

const SELF_REVISO = {
  company: {
    addressLine1: 'Via Cav. Angelo Manzoni 18',
    attention: '.',
    city: "Sant'Angelo Lodigiano (LO)",
    companyIdentificationNumber: '14614580968',
    countryCode: 'IT',
    email: 'info@inglesinaitaliana.it',
    contactEmail: 'info@inglesinaitaliana.it',
    invoiceEmail: 'info@inglesinaitaliana.it',
    name: 'Inglesina Italiana S.r.l.',
    phoneNumber: '0371843883',
    vatNumber: '14614580968',
    zip: '26866',
    province: { provinceCode: 'LO', provinceNumber: 50 },
    fiscalRegime: 'RF01',
  },
  // rumore che NON deve finire sui documenti
  user: { name: 'Eva Pastorin', email: 'info@inglesinaitaliana.it' },
  bankInformation: { ibanNumber: 'IT90C0515612601CC0010024081' },
};

describe('mapSelfToCompany', () => {
  it('estrae i campi stampati sul documento', () => {
    expect(mapSelfToCompany(SELF_REVISO)).toEqual({
      name: 'Inglesina Italiana S.r.l.',
      address: 'Via Cav. Angelo Manzoni 18',
      zip: '26866',
      city: "Sant'Angelo Lodigiano (LO)",
      province: 'LO',
      country: 'IT',
      piva: '14614580968',
      tel: '0371843883',
      email: 'info@inglesinaitaliana.it',
    });
  });

  it('unisce le due righe di indirizzo quando la seconda esiste', () => {
    const out = mapSelfToCompany({
      company: { ...SELF_REVISO.company, addressLine2: 'Zona industriale Maiano' },
    });
    expect(out.address).toBe('Via Cav. Angelo Manzoni 18 Zona industriale Maiano');
  });

  it('ripiega su companyIdentificationNumber e email quando i preferiti mancano', () => {
    const out = mapSelfToCompany({
      company: {
        name: 'X', vatNumber: '', companyIdentificationNumber: '999',
        contactEmail: '', email: 'fallback@x.it',
      },
    });
    expect(out.piva).toBe('999');
    expect(out.email).toBe('fallback@x.it');
  });

  it('non produce undefined sui campi assenti (righe vuote, non "undefined" stampato)', () => {
    const out = mapSelfToCompany({});
    expect(Object.values(out).every((v) => v === '')).toBe(true);
  });
});

describe('diffCompany', () => {
  const base = mapSelfToCompany(SELF_REVISO);

  it('segnala il primo sync', () => {
    expect(diffCompany(null, base)).toEqual(['(primo sync)']);
  });

  it('non segnala nulla se nulla è cambiato', () => {
    expect(diffCompany({ ...base }, base)).toEqual([]);
  });

  it('elenca solo i campi cambiati', () => {
    expect(diffCompany({ ...base, tel: '+39 348 7293897' }, base)).toEqual(['tel']);
  });
});
