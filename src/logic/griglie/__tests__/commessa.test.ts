import { describe, it, expect } from 'vitest';
import {
  codicePannello, indiceDaCodice, configDa, nuovaCommessa, prossimoCodiceCommessa, pannelliCalcolati, congela, sblocca, parametriDi, pianiCongelati,
  type InputPannello, type ParametriOfficina, type CommessaGriglie,
} from '../commessa';
import { pianificaTaglio } from '../nesting';

const PARAMETRI: ParametriOfficina = {
  gioco: 1, kerf: 2, margineMinimo: 10, lunghezzaMinima: 0,
  pesoBarraKgM: 0.085, steccaInglesina: 3000, pesoSteccaInglesinaG: 304,
};

// Il pannello di prova: PREMIUM 35 × 70 cm, 1 verticale × 3 orizzontali.
const PROVA: InputPannello = {
  stile: 'PREMIUM', larghezzaCm: 35, altezzaCm: 70, passoOrizzontaleCm: 17, passoVerticaleCm: 17,
  quantita: 2, conBordo: true, distribuzione: 'PASSO_FISSO',
  nVertOverride: null, nOrizOverride: null,
  tipoFinitura: 'VERNICIATO', finitura: 'BIANCO 9010',
  modoPremium: 'NUMERO', passiUguali: true, nVertPremium: 1, nOrizPremium: 3,
};

const conPannelli = (...input: InputPannello[]): CommessaGriglie => ({
  ...nuovaCommessa('c1', '2026-10-06T10:00:00.000Z'),
  commessa: '1175-26',
  pannelli: input.map((i, n) => ({ id: `p${n}`, input: i })),
});

describe('commessa griglie', () => {
  it('codici dei pannelli: P1, P2… dalla posizione', () => {
    expect([0, 1, 9, 25].map(codicePannello)).toEqual(['P1', 'P2', 'P10', 'P26']);
    expect(['P1', 'P10', 'A', null].map(indiceDaCodice)).toEqual([0, 9, -1, -1]);
  });

  it('configDa traduce i controlli come il configuratore (cm → mm, numero di elementi)', () => {
    const c = configDa(PROVA, PARAMETRI);
    expect(c).toMatchObject({ larghezza: 350, altezza: 700, distribuzione: 'SPAZI_UGUALI', nBarreVerticali: 1, nBarreOrizzontali: 3, famigliaFinitura: 'VERNICIATO' });
    // Sui rombi: passo fisso, e VENEZIA ha l'asse verticale doppio
    const v = configDa({ ...PROVA, stile: 'VENEZIA' }, PARAMETRI);
    expect(v.distribuzione).toBe('PASSO_FISSO');
    expect(v.passoVerticale).toBe(2 * v.passoOrizzontale);
  });

  it('i pannelli si calcolano con il loro codice, nell\'ordine della lista', () => {
    const c = conPannelli(PROVA, { ...PROVA, larghezzaCm: 60, altezzaCm: 120, nOrizPremium: 2 });
    const [a, b] = pannelliCalcolati(c, PARAMETRI);
    expect(a!.codice).toBe('P1');
    expect(a!.progetto.barre.find((x) => x.etichetta === 'Verticale')!.lunghezza).toBe(661);
    expect(b!.codice).toBe('P2');
    expect(b!.progetto.barre.find((x) => x.etichetta === 'Verticale')!.lunghezza).toBe(1161);
    expect(a!.telai).toBe(2);
  });

  it('congelata, la commessa non segue più i parametri d\'officina', () => {
    const bozza = conPannelli(PROVA);
    const prima = pannelliCalcolati(bozza, PARAMETRI)[0]!.progetto;
    const inProduzione = congela(bozza, PARAMETRI, '2026-10-07T08:00:00.000Z');
    expect(inProduzione.stato).toBe('IN_PRODUZIONE');

    // Cambia un parametro che sposta la geometria (la luce minima): la bozza si
    // ricalcola, la commessa congelata resta quella fotografata.
    const altri = { ...PARAMETRI, margineMinimo: 200 };
    expect(pannelliCalcolati(inProduzione, altri)[0]!.progetto).toEqual(prima);
    expect(parametriDi(inProduzione, altri)).toEqual(PARAMETRI);
    expect(pannelliCalcolati(bozza, altri)[0]!.progetto).not.toEqual(prima);
  });

  it('la fotografia è una copia: modificare la bozza dopo non la tocca', () => {
    const c = congela(conPannelli(PROVA), PARAMETRI, '2026-10-07T08:00:00.000Z');
    const foto = JSON.stringify(c.congelata);
    c.pannelli[0]!.input.larghezzaCm = 999;
    expect(JSON.stringify(c.congelata)).toBe(foto);
  });

  it('sbloccata torna in bozza e scarta la fotografia', () => {
    const c = sblocca(congela(conPannelli(PROVA), PARAMETRI, '2026-10-07T08:00:00.000Z'), '2026-10-08T08:00:00.000Z');
    expect(c.stato).toBe('BOZZA');
    expect(c.congelata).toBeUndefined();
  });

  it('il piano di taglio si fotografa con la commessa, e si scarta sbloccandola', () => {
    const piano = pianificaTaglio([{ etichetta: 'V1', lunghezza: 661, quantita: 2 }], 3000, 2, { intestatura: 20 });
    const piani = new Map([['Inglesina 26 BIANCO 9010', piano]]);
    const c = congela(conPannelli(PROVA), PARAMETRI, '2026-10-07T09:00:00.000Z', piani);
    const letti = pianiCongelati(c)!;
    expect(letti.get('Inglesina 26 BIANCO 9010')).toEqual(piano);
    expect(letti.get('Inglesina 26 BIANCO 9010')).not.toBe(piano);   // copia, non riferimento
    expect(pianiCongelati(sblocca(c, '2026-10-07T10:00:00.000Z'))).toBeNull();
    // Congelata senza piano (prima che esistesse): niente piano, si ricalcola
    expect(pianiCongelati(congela(conPannelli(PROVA), PARAMETRI, '2026-10-07T09:00:00.000Z'))).toBeNull();
  });
});

describe('prossimoCodiceCommessa', () => {
  it('progressivo nell\'anno, a tre cifre', () => {
    expect(prossimoCodiceCommessa([], 2026)).toBe('GR-26-001');
    expect(prossimoCodiceCommessa(['GR-26-001', 'GR-26-007', 'GR-26-003'], 2026)).toBe('GR-26-008');
  });
  it('ignora gli altri anni e i nomi liberi delle commesse vecchie', () => {
    expect(prossimoCodiceCommessa(['GR-25-040', '1175-26', ''], 2026)).toBe('GR-26-001');
  });
});
