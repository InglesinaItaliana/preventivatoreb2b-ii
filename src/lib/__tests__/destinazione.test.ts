// ============================================================================
// Destinazione merce: regole condivise FRONTEND ↔ BACKEND.
// ----------------------------------------------------------------------------
// Le stesse regole vivono in due file (il frontend non può importare da
// src/functions). Questo test è la guardia anti-drift: se le due copie si
// separano, un ordine può essere raggruppato in un DDT lato client e rifiutato
// lato server — o peggio, accettato con la destinazione sbagliata. Su CiC la
// fattura nasce dal DDT: uno scarto qui si scopre a fine mese.
//
// Struttura: prima si verifica che le due copie DICANO LA STESSA COSA, poi il
// comportamento, poi i contro-test di non regressione (l'ordine senza
// destinazione deve comportarsi esattamente come prima di questo feature).
// ============================================================================

import { describe, it, expect } from 'vitest';

import {
  SIGLE_PROVINCE,
  normalizzaProvincia as feNormalizza,
  validaDestinazione as feValida,
  destinazioneKey as feKey,
  destinazioneComune as feComune,
  stessaDestinazione,
  hasDestinazione as feHas,
  formatDestinazione as feFormat,
  righeDestinazione,
  type DestinazioneMerce,
} from '../destinazione';

import {
  PROVINCE_CIC,
  normalizzaProvincia as beNormalizza,
  provinciaNumber,
  validaDestinazione as beValida,
  destinazioneKey as beKey,
  destinazioneComune as beComune,
  hasDestinazione as beHas,
  formatDestinazione as beFormat,
  buildDestinationBlock,
} from '../../functions/lib_billing/destinazione';

/** Destinazione valida di riferimento. */
const CANTIERE: DestinazioneMerce = {
  destinatario: 'Cantiere Rossi & C. snc',
  indirizzo: 'Via Giuseppe Verdi 42',
  cap: '20121',
  citta: 'Milano',
  provincia: 'MI',
  telefono: '02 1234567',
  referente: 'Sig. Rossi',
  note: 'Citofono 3, consegne 8-12',
};

/** Casi che devono dare lo stesso risultato di qua e di là. */
const CASI_PROVINCIA = [
  'MI', 'mi', '  MI  ', 'Mi',
  'SU', 'su', 'SD',            // Sud Sardegna: sigla ufficiale vs sigla Reviso
  'CI', 'VS', 'OG', 'OT',      // abolite nel 2016, Reviso le espone ancora
  'XX', 'VICENZA', 'Malta', '', '   ',
  null, undefined, 42,
];

const CASI_DESTINAZIONE: Array<Partial<DestinazioneMerce> | null | undefined> = [
  CANTIERE,
  { ...CANTIERE, provincia: 'SU' },
  { ...CANTIERE, provincia: 'SD' },
  { ...CANTIERE, provincia: undefined },
  { ...CANTIERE, telefono: undefined, referente: undefined, note: undefined },
  { destinatario: 'Solo nome' },
  { destinatario: '  SPAZI   MULTIPLI  ', indirizzo: 'Via   Roma   1', cap: '00100', citta: 'Roma', provincia: 'RM' },
  {},
  null,
  undefined,
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. ANTI-DRIFT: le due copie devono dire la stessa cosa
// ─────────────────────────────────────────────────────────────────────────────
describe('anti-drift frontend ↔ backend', () => {
  it('la tendina province del client contiene esattamente le sigle note al backend', () => {
    expect([...SIGLE_PROVINCE]).toEqual(Object.keys(PROVINCE_CIC).sort());
  });

  it('le sigle sono 111: le 107 attuali meno SU, più SD e le 4 abolite', () => {
    // Numero fissato di proposito: se cambia, qualcuno ha toccato la tabella e
    // deve passare da qui a spiegare perché.
    expect(SIGLE_PROVINCE.length).toBe(111);
    expect(SIGLE_PROVINCE).not.toContain('SU');
    expect(SIGLE_PROVINCE).toContain('SD');
  });

  it('normalizzaProvincia dà lo stesso esito su entrambi i lati', () => {
    for (const c of CASI_PROVINCIA) {
      expect(feNormalizza(c), `provincia ${JSON.stringify(c)}`).toBe(beNormalizza(c));
    }
  });

  it('destinazioneKey dà la stessa chiave su entrambi i lati', () => {
    for (const d of CASI_DESTINAZIONE) {
      expect(feKey(d), `key di ${JSON.stringify(d)}`).toBe(beKey(d));
      expect(feHas(d)).toBe(beHas(d));
    }
  });

  it('validaDestinazione dà gli stessi errori su entrambi i lati', () => {
    for (const d of CASI_DESTINAZIONE) {
      expect(feValida(d), `validazione di ${JSON.stringify(d)}`).toEqual(beValida(d));
    }
  });

  it('formatDestinazione produce la stessa stringa su entrambi i lati', () => {
    for (const d of CASI_DESTINAZIONE) {
      expect(feFormat(d)).toBe(beFormat(d));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROVINCE
// ─────────────────────────────────────────────────────────────────────────────
describe('province', () => {
  it('traduce la sigla nel NUMERO che vuole Reviso', () => {
    expect(provinciaNumber('MI')).toBe(58);
    expect(provinciaNumber('TA')).toBe(94);
    expect(provinciaNumber('PC')).toBe(74);
  });

  it('SU (sigla ufficiale) finisce su SD, che è quella che Reviso conosce', () => {
    // Senza questo alias un indirizzo del Sud Sardegna scritto correttamente
    // uscirebbe sul DDT senza provincia.
    expect(feNormalizza('SU')).toBe('SD');
    expect(provinciaNumber('SU')).toBe(111);
    expect(provinciaNumber('SD')).toBe(111);
  });

  it('una sigla inventata non diventa una provincia a caso', () => {
    expect(feNormalizza('XX')).toBeUndefined();
    expect(provinciaNumber('XX')).toBeUndefined();
    expect(provinciaNumber('VICENZA')).toBeUndefined(); // il nome esteso NON è una sigla
  });

  it('non inventa una provincia quando il campo è vuoto', () => {
    for (const v of ['', '   ', null, undefined]) expect(provinciaNumber(v)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VALIDAZIONE
// ─────────────────────────────────────────────────────────────────────────────
describe('validaDestinazione', () => {
  it('una destinazione completa non ha errori', () => {
    expect(feValida(CANTIERE)).toEqual([]);
  });

  it('il telefono NON è obbligatorio (decisione esplicita)', () => {
    expect(feValida({ ...CANTIERE, telefono: undefined })).toEqual([]);
    expect(feValida({ ...CANTIERE, telefono: '' })).toEqual([]);
  });

  it('la provincia può mancare: Reviso accetta un documento senza', () => {
    expect(feValida({ ...CANTIERE, provincia: undefined })).toEqual([]);
  });

  it('ma una provincia SBAGLIATA è un errore, non un campo da ignorare', () => {
    expect(feValida({ ...CANTIERE, provincia: 'XX' })).toContain('Provincia non riconosciuta: XX');
  });

  it('destinatario, indirizzo, CAP e città sono obbligatori', () => {
    expect(feValida({ ...CANTIERE, destinatario: '  ' })).toContain('Manca il destinatario');
    expect(feValida({ ...CANTIERE, indirizzo: '' })).toContain("Manca l'indirizzo");
    expect(feValida({ ...CANTIERE, citta: '' })).toContain('Manca la città');
  });

  it('il CAP deve essere di 5 cifre', () => {
    for (const cap of ['2012', '201211', 'ABCDE', '', '2012A']) {
      expect(feValida({ ...CANTIERE, cap })).toContain('Il CAP deve essere di 5 cifre');
    }
    expect(feValida({ ...CANTIERE, cap: '00100' })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHIAVE DI RAGGRUPPAMENTO — decide cosa può stare sullo stesso DDT
// ─────────────────────────────────────────────────────────────────────────────
describe('destinazioneKey', () => {
  it('due ordini per lo stesso posto viaggiano insieme', () => {
    expect(feKey(CANTIERE)).toBe(feKey({ ...CANTIERE }));
  });

  it('telefono, referente e note non spezzano il DDT: descrivono il contatto, non il luogo', () => {
    expect(feKey({ ...CANTIERE, telefono: '333', referente: 'Altro', note: 'x' })).toBe(feKey(CANTIERE));
  });

  it('un indirizzo diverso NON può finire sullo stesso DDT', () => {
    expect(feKey({ ...CANTIERE, indirizzo: 'Via Verdi 43' })).not.toBe(feKey(CANTIERE));
    expect(feKey({ ...CANTIERE, citta: 'Roma' })).not.toBe(feKey(CANTIERE));
    expect(feKey({ ...CANTIERE, cap: '20122' })).not.toBe(feKey(CANTIERE));
    expect(feKey({ ...CANTIERE, destinatario: 'Altro cantiere' })).not.toBe(feKey(CANTIERE));
  });

  it('maiuscole e spazi doppi non spezzano il DDT', () => {
    expect(feKey({ ...CANTIERE, citta: '  MILANO ', indirizzo: 'Via  Giuseppe   Verdi 42' }))
      .toBe(feKey({ ...CANTIERE, citta: 'milano', indirizzo: 'via giuseppe verdi 42' }));
  });

  it('SU e SD sono lo stesso posto: non devono generare due DDT', () => {
    expect(feKey({ ...CANTIERE, provincia: 'SU' })).toBe(feKey({ ...CANTIERE, provincia: 'SD' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONTRO-TEST: la consegna standard deve restare identica a oggi
// ─────────────────────────────────────────────────────────────────────────────
describe('consegna standard (nessuna destinazione) — non deve cambiare nulla', () => {
  it('nessuna destinazione = chiave vuota, su entrambi i lati', () => {
    for (const v of [null, undefined, {}, { destinatario: '', indirizzo: '', cap: '', citta: '' }]) {
      expect(feKey(v)).toBe('');
      expect(beKey(v)).toBe('');
      expect(feHas(v)).toBe(false);
      expect(beHas(v)).toBe(false);
    }
  });

  it('tutti gli ordini senza destinazione restano raggruppabili insieme', () => {
    // È il comportamento di oggi: un DDT cumulativo per cliente. Se questa
    // chiave non fosse uguale per tutti, il feature spezzerebbe i DDT esistenti.
    const ordini = [{}, { destinazione: null }, { destinazione: undefined }, {}];
    const chiavi = new Set(ordini.map((o: any) => feKey(o.destinazione)));
    expect(chiavi.size).toBe(1);
    expect([...chiavi][0]).toBe('');
  });

  it('senza destinazione il DDT non porta il blocco: il layout ricopia il destinatario', () => {
    expect(buildDestinationBlock(null)).toBeNull();
    expect(buildDestinationBlock(undefined)).toBeNull();
    expect(buildDestinationBlock({})).toBeNull();
  });

  it('formatDestinazione di una consegna standard è vuoto, non "undefined"', () => {
    expect(feFormat(null)).toBe('');
    expect(feFormat({})).toBe('');
    expect(righeDestinazione(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5-bis. destinazioneComune — LA regola critica: cosa può stare su un DDT
// ─────────────────────────────────────────────────────────────────────────────
const ALTRO_CANTIERE: DestinazioneMerce = {
  destinatario: 'Cantiere Bianchi',
  indirizzo: 'Corso Italia 7',
  cap: '10121',
  citta: 'Torino',
  provincia: 'TO',
};

describe('destinazioneComune', () => {
  it('tutti senza destinazione: DDT cumulativo normale (è il caso di oggi)', () => {
    const esito = feComune([undefined, null, undefined]);
    expect(esito).toEqual({ ok: true });
    expect(beComune([undefined, null, undefined])).toEqual(esito);
  });

  it('tutti verso lo stesso posto: un DDT solo, con quella destinazione', () => {
    const esito = feComune([CANTIERE, { ...CANTIERE }, { ...CANTIERE, telefono: 'altro' }]);
    expect(esito.ok).toBe(true);
    expect((esito as any).destinazione).toEqual(CANTIERE);
  });

  it('destinazioni DIVERSE: rifiutato, e con lo stesso messaggio dei due lati', () => {
    const fe = feComune([CANTIERE, ALTRO_CANTIERE]);
    const be = beComune([CANTIERE, ALTRO_CANTIERE]);
    expect(fe.ok).toBe(false);
    expect(fe).toEqual(be);
    expect((fe as any).errore).toMatch(/luoghi di consegna diversi/);
  });

  it('MISTO standard + alternativa: rifiutato', () => {
    // Il caso subdolo: due ordini dello stesso cliente, uno va in sede e uno in
    // cantiere. Oggi AdminView li selezionerebbe entrambi in automatico.
    const fe = feComune([undefined, CANTIERE]);
    expect(fe.ok).toBe(false);
    expect(fe).toEqual(beComune([undefined, CANTIERE]));
  });

  it('una destinazione non valida non arriva mai al DDT', () => {
    const rotta = { ...CANTIERE, cap: '123' };
    const fe = feComune([rotta, rotta]);
    expect(fe.ok).toBe(false);
    expect((fe as any).errore).toMatch(/Destinazione non valida/);
    expect(fe).toEqual(beComune([rotta, rotta]));
  });

  it('SU e SD non spezzano il DDT: è lo stesso posto scritto in due modi', () => {
    expect(feComune([{ ...CANTIERE, provincia: 'SU' }, { ...CANTIERE, provincia: 'SD' }]).ok).toBe(true);
  });

  it('lista vuota: nessuna destinazione, nessun errore', () => {
    expect(feComune([])).toEqual({ ok: true });
    expect(beComune([])).toEqual({ ok: true });
  });

  it('un solo ordine: passa sempre, con o senza destinazione', () => {
    expect(feComune([undefined]).ok).toBe(true);
    expect(feComune([CANTIERE]).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5-ter. La selezione degli ordini da spedire (AdminView)
// ─────────────────────────────────────────────────────────────────────────────
describe('stessaDestinazione — quali ordini AdminView può selezionare insieme', () => {
  /** Ordini READY dello stesso cliente, come li vede la board spedizioni. */
  const ORDINI = [
    { id: 'A', destinazione: undefined },
    { id: 'B', destinazione: undefined },
    { id: 'C', destinazione: CANTIERE },
    { id: 'D', destinazione: { ...CANTIERE, telefono: '333' } },
    { id: 'E', destinazione: ALTRO_CANTIERE },
  ];
  const selezionabiliCon = (rif: any) =>
    ORDINI.filter((o) => stessaDestinazione(o.destinazione, rif.destinazione)).map((o) => o.id);

  it('cliccando un ordine standard prende SOLO gli altri standard', () => {
    // Prima di questo feature li prendeva tutti: è il bug che stiamo chiudendo.
    expect(selezionabiliCon(ORDINI[0])).toEqual(['A', 'B']);
  });

  it('cliccando un ordine con destinazione prende quelli diretti nello stesso posto', () => {
    expect(selezionabiliCon(ORDINI[2])).toEqual(['C', 'D']);
  });

  it('un ordine per un altro cantiere resta fuori, e viaggia da solo', () => {
    expect(selezionabiliCon(ORDINI[4])).toEqual(['E']);
  });

  it('ogni gruppo così formato supera la validazione del server', () => {
    // La coerenza che conta: ciò che il client seleziona, il server lo accetta.
    for (const rif of ORDINI) {
      const gruppo = ORDINI.filter((o) => stessaDestinazione(o.destinazione, rif.destinazione));
      expect(beComune(gruppo.map((o) => o.destinazione)).ok).toBe(true);
    }
  });

  it('un gruppo formato IGNORANDO la regola viene invece rifiutato dal server', () => {
    // Contro-prova: senza il filtro (il comportamento di prima) il server blocca.
    expect(beComune(ORDINI.map((o) => o.destinazione)).ok).toBe(false);
  });

  it('è simmetrica: l\'ordine in cui si clicca non cambia il gruppo', () => {
    expect(stessaDestinazione(CANTIERE, undefined)).toBe(stessaDestinazione(undefined, CANTIERE));
    expect(stessaDestinazione(CANTIERE, ALTRO_CANTIERE)).toBe(stessaDestinazione(ALTRO_CANTIERE, CANTIERE));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PAYLOAD REVISO (solo backend)
// ─────────────────────────────────────────────────────────────────────────────
describe('buildDestinationBlock', () => {
  it('costruisce il blocco che il layout stampa in LUOGO DI DESTINAZIONE', () => {
    expect(buildDestinationBlock(CANTIERE)).toEqual({
      companyName: 'Cantiere Rossi & C. snc',
      address: 'Via Giuseppe Verdi 42',
      zipCode: '20121',
      city: 'Milano',
      country: 'Italia',
      countryCode: { province: { id: 58, metaData: null }, id: 'IT', metaData: null },
      id: null,
      metaData: null,
    });
  });

  it('la provincia va DENTRO countryCode ed è un numero', () => {
    const b = buildDestinationBlock(CANTIERE) as any;
    expect(b.countryCode.province.id).toBe(58);
    expect(b.province).toBeUndefined();
    expect(b.countryCode.province.id).not.toBe('MI');
  });

  it('`country` non è mai vuoto: il DDT #89 stampava "Bari, undefined"', () => {
    expect(buildDestinationBlock({ ...CANTIERE, provincia: undefined })!.country).toBe('Italia');
  });

  it('senza provincia il blocco esiste lo stesso, solo senza quel campo', () => {
    const b = buildDestinationBlock({ ...CANTIERE, provincia: undefined }) as any;
    expect(b.countryCode).toEqual({ id: 'IT', metaData: null });
    expect(b.address).toBe('Via Giuseppe Verdi 42');
  });

  it('telefono, referente e note NON finiscono sul documento fiscale', () => {
    const b = JSON.stringify(buildDestinationBlock(CANTIERE));
    expect(b).not.toContain('1234567');
    expect(b).not.toContain('Citofono');
    expect(b).not.toContain('Sig. Rossi');
  });

  it('gli spazi in eccesso non finiscono stampati sul DDT', () => {
    const b = buildDestinationBlock({ ...CANTIERE, destinatario: '  Cantiere  ', citta: ' Milano ' }) as any;
    expect(b.companyName).toBe('Cantiere');
    expect(b.city).toBe('Milano');
  });
});
