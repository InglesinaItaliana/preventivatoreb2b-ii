import { describe, it, expect } from 'vitest';
import {
  NOVITA, GIORNI_BADGE_NOVITA, ETICHETTA_TIPO,
  contaNonLette, dataRelativa, giorniTra, iconaDi, idStorici, isNuova, isPubblicata,
  novitaVisibili, oggiISO,
  type Novita,
} from '../novita';

/**
 * Logica del pannello novità. Vale la pena testarla perché sbagliarla non si
 * vede: un contatore che parte acceso su tutto l'arretrato, o un badge NOVITÀ
 * che non scade mai, sono difetti che scopri solo dai clienti.
 */

const n = (id: string, data: string): Novita =>
  ({ id, data, titolo: `t-${id}`, sommario: `s-${id}`, tipo: 'funzione' });

describe('giorniTra', () => {
  it('conta i giorni interi tra due date', () => {
    expect(giorniTra('2026-07-29', '2026-07-30')).toBe(1);
    expect(giorniTra('2026-07-30', '2026-07-30')).toBe(0);
    expect(giorniTra('2026-06-18', '2026-07-30')).toBe(42);
  });

  it('non salta un giorno attraverso il cambio di ora legale', () => {
    // 2026: ora legale dal 29 marzo al 25 ottobre in Italia.
    expect(giorniTra('2026-03-28', '2026-03-30')).toBe(2);
    expect(giorniTra('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('torna NaN su input malformato invece di inventare un numero', () => {
    expect(Number.isNaN(giorniTra('ieri', '2026-07-30'))).toBe(true);
  });
});

describe('novitaVisibili', () => {
  const lista = [n('vecchia', '2026-01-01'), n('futura', '2026-12-31'), n('media', '2026-07-01')];

  it('nasconde le novità con data futura (= programmate)', () => {
    expect(novitaVisibili(lista, '2026-07-30').map((x) => x.id)).toEqual(['media', 'vecchia']);
  });

  it('include la novità pubblicata oggi', () => {
    expect(isPubblicata(n('oggi', '2026-07-30'), '2026-07-30')).toBe(true);
  });

  it('ordina dalla più recente', () => {
    const out = novitaVisibili([n('a', '2026-05-01'), n('b', '2026-07-01'), n('c', '2026-06-01')], '2026-07-30');
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('non muta la lista di partenza', () => {
    const originale = [n('a', '2026-05-01'), n('b', '2026-07-01')];
    novitaVisibili(originale, '2026-07-30');
    expect(originale.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('isNuova (badge NOVITÀ)', () => {
  it('copre esattamente i 7 giorni dalla pubblicazione', () => {
    expect(isNuova(n('x', '2026-07-30'), '2026-07-30')).toBe(true);  // giorno 0
    expect(isNuova(n('x', '2026-07-23'), '2026-07-30')).toBe(true);  // giorno 7, ultimo
    expect(isNuova(n('x', '2026-07-22'), '2026-07-30')).toBe(false); // giorno 8, scaduto
  });

  it('non dipende da chi legge: una novità vecchia e mai letta non ha il badge', () => {
    expect(isNuova(n('x', '2026-01-01'), '2026-07-30')).toBe(false);
  });
});

describe('idStorici (stato al primo avvio su un PC)', () => {
  const lista = [n('vecchia', '2026-06-01'), n('recente', '2026-07-29'), n('futura', '2026-12-01')];

  it('dà per lette solo le novità che hanno già perso il badge NOVITÀ', () => {
    expect(idStorici(lista, '2026-07-30')).toEqual(['vecchia']);
  });

  it('lascia acceso il contatore su ciò che è recente', () => {
    expect(contaNonLette(lista, idStorici(lista, '2026-07-30'), '2026-07-30')).toBe(1);
  });

  it('non tocca le novità programmate: quando escono sono da leggere', () => {
    const seed = idStorici(lista, '2026-07-30');
    expect(seed).not.toContain('futura');
    expect(contaNonLette(lista, seed, '2026-12-01')).toBe(2); // recente + futura ormai uscita
  });

  it('è coerente con il badge: al primo avvio "non letto" e NOVITÀ combaciano', () => {
    const oggi = '2026-07-30';
    const seed = idStorici(lista, oggi);
    const nonLette = novitaVisibili(lista, oggi).filter((x) => !seed.includes(x.id));
    expect(nonLette.every((x) => isNuova(x, oggi))).toBe(true);
  });
});

describe('contaNonLette', () => {
  const lista = [n('a', '2026-07-01'), n('b', '2026-07-02'), n('futura', '2026-12-31')];

  it('conta solo le pubblicate', () => {
    expect(contaNonLette(lista, [], '2026-07-30')).toBe(2);
  });

  it('scende man mano che si leggono', () => {
    expect(contaNonLette(lista, ['a'], '2026-07-30')).toBe(1);
    expect(contaNonLette(lista, ['a', 'b'], '2026-07-30')).toBe(0);
  });

  it('ignora gli id di novità cancellate dal registro', () => {
    expect(contaNonLette(lista, ['a', 'b', 'novita-tolta-dal-codice'], '2026-07-30')).toBe(0);
  });
});

describe('dataRelativa', () => {
  it('usa le parole per la settimana appena passata', () => {
    expect(dataRelativa(n('x', '2026-07-30'), '2026-07-30')).toBe('oggi');
    expect(dataRelativa(n('x', '2026-07-29'), '2026-07-30')).toBe('ieri');
    expect(dataRelativa(n('x', '2026-07-27'), '2026-07-30')).toBe('3 giorni fa');
  });

  it('oltre la settimana passa alla data', () => {
    expect(dataRelativa(n('x', '2026-06-18'), '2026-07-30')).toMatch(/2026/);
  });
});

describe('oggiISO', () => {
  it('formatta il giorno LOCALE, non quello UTC', () => {
    // 1 gennaio 01:00 in Italia (UTC+1) è ancora 31 dicembre in UTC: se qui
    // uscisse la data UTC, una novità pubblicata "oggi" sparirebbe di notte.
    const capodanno = new Date(2026, 0, 1, 1, 0, 0);
    expect(oggiISO(capodanno)).toBe('2026-01-01');
  });
});

describe('iconaDi', () => {
  it('usa l\'icona scelta a mano quando c\'è', () => {
    expect(iconaDi({ ...n('x', '2026-07-30'), icona: 'mappa' })).toBe('mappa');
  });

  it('ripiega su quella del tipo, così una novità minore non costa una scelta', () => {
    expect(iconaDi({ ...n('x', '2026-07-30'), tipo: 'funzione' })).toBe('stella');
    expect(iconaDi({ ...n('x', '2026-07-30'), tipo: 'miglioramento' })).toBe('regolazione');
    expect(iconaDi({ ...n('x', '2026-07-30'), tipo: 'avviso' })).toBe('avviso');
  });
});

describe('il registro NOVITA', () => {
  it('ha un tipo con etichetta leggibile su ogni voce', () => {
    for (const x of NOVITA) {
      expect(ETICHETTA_TIPO[x.tipo], x.id).toBeTruthy();
      expect(iconaDi(x), x.id).toBeTruthy();
    }
  });

  it('ha id unici: un doppione azzererebbe due voci insieme', () => {
    const ids = NOVITA.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ha date scritte bene: una data illeggibile spegne il badge in silenzio', () => {
    for (const x of NOVITA) {
      expect(x.data, x.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${x.data}T00:00:00Z`)), x.id).toBe(false);
    }
  });

  it('ha titolo e sommario compilati', () => {
    for (const x of NOVITA) {
      expect(x.titolo.trim().length, x.id).toBeGreaterThan(0);
      expect(x.sommario.trim().length, x.id).toBeGreaterThan(0);
    }
  });

  it('non contiene novità postdatate per sbaglio di anno', () => {
    // Una data tipo '2062-07-29' passa i controlli di forma ma la novità non
    // comparirebbe mai. Limite volutamente larghissimo.
    for (const x of NOVITA) expect(x.data < '2030-01-01', x.id).toBe(true);
  });

  it('GIORNI_BADGE_NOVITA resta 7 (il numero promesso ai clienti)', () => {
    expect(GIORNI_BADGE_NOVITA).toBe(7);
  });
});
