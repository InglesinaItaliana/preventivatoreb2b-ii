import { describe, it, expect } from 'vitest';
import { nomeListino, stessoListino, ricostruisciPrezzoUnitario, tariffeLeali, maggiorazioneCongelata, maggiorazioneDelPreventivo, prezziDiAltraEpoca, MAGGIORAZIONE_LEALI } from '../listini';
import type { RigaPricing } from '../../types';

describe('anagrafica listini', () => {
  it('dà un nome leggibile ai listini che girano davvero', () => {
    expect(nomeListino('2026-a')).toBe('Listino 2026');
    expect(nomeListino('2025-a')).toBe('Listino 2025');
    expect(nomeListino('2025x')).toBe('Listino LEALI');
    expect(nomeListino('2025-x')).toBe('Listino LEALI');
  });

  it('un listino sconosciuto si mostra com\'è, non si inventa', () => {
    expect(nomeListino('2027-b')).toBe('2027-b');
    expect(nomeListino(null)).toBe('non registrato');
    expect(nomeListino(undefined)).toBe('non registrato');
  });

  // '2025x' e '2025-x' sono la stessa cosa scritta in due modi (il disallineamento
  // che faceva cadere i clienti LEALI nel listino 2026, v. pricing.ts). Il
  // confronto che decide se mostrare "listino divergente" non deve ricascarci.
  it('riconosce le due scritture dello stesso listino LEALI', () => {
    expect(stessoListino('2025x', '2025-x')).toBe(true);
    expect(stessoListino('2025-x', '2025x')).toBe(true);
    expect(stessoListino('2025-a', '2025x')).toBe(false);
    expect(stessoListino('2026-a', '2026-a')).toBe(true);
    expect(stessoListino(null, '2026-a')).toBe(false);
    expect(stessoListino('2026-a', undefined)).toBe(false);
  });
});

describe('la formula unica dello scontrino', () => {
  const base: RigaPricing = {
    listino: '2026-a', regime: 'INCROCIO', metrica: 'sviluppo', metriPezzo: 2,
    tariffe: [], maggiorazionePct: null, supplementi: [], taglia: null,
  };

  it('somma le tariffe e le moltiplica per i metri', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 14 }, { tipo: 'canalino', valore: 2.5 }],
    })).toBeCloseTo(33, 10);
  });

  it('la maggiorazione è una percentuale, non un moltiplicatore', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 10 }], maggiorazionePct: 20,
    })).toBeCloseTo(24, 10);
    expect(ricostruisciPrezzoUnitario({
      ...base, tariffe: [{ tipo: 'griglia', valore: 10 }], maggiorazionePct: 50,
    })).toBeCloseTo(30, 10);
  });

  it('i supplementi si sommano a valle, fuori dai metri e fuori dalla maggiorazione', () => {
    expect(ricostruisciPrezzoUnitario({
      ...base,
      tariffe: [{ tipo: 'griglia', valore: 10 }],
      supplementi: [{ tipo: 'attrezzaggio', codice: 'S002', importo: 12 }, { tipo: 'perimetrale', codice: 'S004', importo: 14 }],
    })).toBeCloseTo(46, 10);
  });

  it('nessuna tariffa = nessun prezzo', () => {
    expect(ricostruisciPrezzoUnitario(base)).toBe(0);
  });
});

// ============================================================================
// LA MAGGIORAZIONE LEALI
//
// È una leva di prezzo che vive nel codice e non nel listino: nessuno la vede
// da Firestore, nessuno se ne accorge se cambia. Questi test dicono ad alta
// voce quanto vale e come si applica, così spegnerla o riaccenderla è una
// decisione esplicita e non un effetto collaterale.
// ============================================================================
describe('maggiorazione LEALI', () => {
  it('vale 1,00 €/m ed è ATTIVA', () => {
    // Se questo test fallisce non è un bug: qualcuno ha mosso la leva. Va
    // aggiornato insieme alla decisione commerciale, mai "per far passare i test".
    expect(MAGGIORAZIONE_LEALI).toBe(1.00);
  });

  it('si somma a entrambe le tariffe: su una riga col canalino pesa il doppio', () => {
    const t = tariffeLeali(14, 2.5, false);
    expect(t.griglia).toBe(15);
    expect(t.canalino).toBe(3.5);
    // +2,00 €/m di sviluppo rispetto alle tariffe di listino (14 + 2,5 = 16,5).
    expect(t.griglia + t.canalino).toBe(18.5);
  });

  it('senza canalino la seconda quota resta nel conto, ma sulla griglia', () => {
    // Il motore somma la quota del canalino anche quando il canalino non c'è:
    // il prezzo la contiene e non si tocca. Esporla come voce "Canalino"
    // mostrerebbe però al cliente una riga che sulla sua inglesina non esiste.
    const t = tariffeLeali(14, 0, true);
    expect(t.canalino).toBe(0);
    expect(t.griglia).toBe(16);
    // Il totale è lo stesso di prima che la quota venisse accorpata.
    expect(t.griglia + t.canalino).toBe((14 + 1) + (0 + 1));
  });

  it('con la leva spenta le tariffe sono quelle nude del listino', () => {
    // È il caso dei preventivi nati prima della riaccensione.
    expect(tariffeLeali(14, 2.5, false, 0)).toEqual({ griglia: 14, canalino: 2.5 });
    // E senza canalino l'accorpamento non inventa niente: 0 + 0.
    expect(tariffeLeali(14, 0, true, 0)).toEqual({ griglia: 14, canalino: 0 });
  });

  it('la tariffa concordata parte da sé, non dal listino', () => {
    // Il prezzo/m concordato sostituisce quello di listino, poi la
    // maggiorazione si applica sopra: è la stessa cascata del motore.
    expect(tariffeLeali(23.5, 2.5, false).griglia).toBe(24.5);
  });
});

// ============================================================================
// "CAMPO ASSENTE = PREVENTIVO DI PRIMA"
//
// Tutta la gestione dei preventivi aperti al momento della riaccensione poggia
// su questa lettura. I preventivi nascono in UN solo punto del codebase
// (addDoc in BuilderView), quindi da lì in poi il campo c'è sempre: l'assenza
// identifica esattamente i documenti nati prima. Se qualcuno aggiungesse un
// secondo punto di creazione senza scrivere il campo, quei preventivi
// quoterebbero sotto listino in silenzio — ed è per questo che la regola sta
// scritta in un test e non solo in un commento.
// ============================================================================
describe('leva congelata sul documento', () => {
  it('campo assente = leva spenta (documento nato prima)', () => {
    expect(maggiorazioneCongelata(undefined)).toBe(0);
    expect(maggiorazioneCongelata(null)).toBe(0);
  });

  it('un numero vale quello che dice, zero compreso', () => {
    expect(maggiorazioneCongelata(1)).toBe(1);
    expect(maggiorazioneCongelata(0)).toBe(0);
    expect(maggiorazioneCongelata(0.5)).toBe(0.5);
  });

  it('un campo storto non diventa un prezzo storto', () => {
    // Il documento arriva da Firestore, dove le righe del preventivo sono
    // scrivibili dal client: un valore assurdo deve cadere sul caso prudente,
    // non moltiplicare il prezzo.
    expect(maggiorazioneCongelata('1.00')).toBe(0);
    expect(maggiorazioneCongelata(NaN)).toBe(0);
    expect(maggiorazioneCongelata(Infinity)).toBe(0);
    expect(maggiorazioneCongelata({})).toBe(0);
  });
});

describe('quando avvisare che il preventivo quota a prezzi vecchi', () => {
  it('lo dice sul preventivo LEALI fermo alla leva spenta', () => {
    expect(prezziDiAltraEpoca('2025x', 0)).toBe(true);
    // '2025-x' è la scrittura che salva il modale cliente: stesso listino.
    expect(prezziDiAltraEpoca('2025-x', 0)).toBe(true);
  });

  it('tace sul preventivo LEALI già allineato', () => {
    expect(prezziDiAltraEpoca('2025x', MAGGIORAZIONE_LEALI)).toBe(false);
  });

  it('TACE su tutti gli altri listini, anche a leva 0', () => {
    // È il caso che conta: quasi tutto l'archivio è su 2025-a e non ha il
    // campo, quindi risolve a leva 0. Se questo test diventasse `true`, il
    // banner si accenderebbe su ogni preventivo vecchio del team per una leva
    // che su quei listini non esiste — e nessuno lo leggerebbe più il giorno
    // in cui serve davvero.
    expect(prezziDiAltraEpoca('2025-a', 0)).toBe(false);
    expect(prezziDiAltraEpoca('2026-a', 0)).toBe(false);
    expect(prezziDiAltraEpoca('default', 0)).toBe(false);
  });

  it('un listino mancante non accende niente', () => {
    expect(prezziDiAltraEpoca(null, 0)).toBe(false);
    expect(prezziDiAltraEpoca(undefined, 0)).toBe(false);
    expect(prezziDiAltraEpoca('', 0)).toBe(false);
  });
});

describe('con che leva quota il preventivo che ho davanti', () => {
  it('un preventivo nuovo nasce col prezzo di oggi', () => {
    // Il documento non esiste ancora: qualunque cosa ci sia nello stato locale,
    // si quota al listino corrente. Sbagliare qui = vendere sotto listino.
    expect(maggiorazioneDelPreventivo(false, null)).toBe(MAGGIORAZIONE_LEALI);
    expect(maggiorazioneDelPreventivo(false, 0)).toBe(MAGGIORAZIONE_LEALI);
  });

  it('un preventivo salvato prima della riaccensione resta al prezzo suo', () => {
    // Sbagliare qui = riprezzare un preventivo che il cliente ha già visto.
    expect(maggiorazioneDelPreventivo(true, undefined)).toBe(0);
    expect(maggiorazioneDelPreventivo(true, null)).toBe(0);
  });

  it('un preventivo salvato dopo porta con sé la sua leva', () => {
    expect(maggiorazioneDelPreventivo(true, 1)).toBe(1);
  });
});
