import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCatalogStore } from '../../Data/catalog';
import { calculatePrice, type PricingInput } from '../pricing';
import { costruisciDettaglio } from '../priceBreakdown';
import type { RigaPreventivo } from '../../types';

// ============================================================================
// La modale "come si compone il prezzo" ricostruisce la catena in un modulo suo
// (priceBreakdown.ts), separato dai motori. È una seconda implementazione, e le
// seconde implementazioni divergono: questo test la inchioda al motore.
//
// Invariante: per ogni riga, la catena mostrata al cliente deve riprodurre AL
// CENTESIMO il prezzo che il motore ha effettivamente calcolato. Se un giorno
// non lo fa più, il test fallisce prima che a vederlo sia un cliente.
// ============================================================================

const TARIFFA_GRIGLIA = 14;
const TARIFFA_CANALINO = 2.5;

// '2025-x' è la scrittura che salva davvero il modale cliente per LEALI: sta
// nella matrice perché è quella che gira in produzione.
const LISTINI = ['2025-a', '2025x', '2025-x', '2026-a'];
const MISURE: Array<[number, number]> = [[1010, 1010], [600, 700], [2450, 2000], [1050, 1050]];
// [orizzontali, verticali] — nella riga: colonne = orizzontali, righe = verticali
const SUDDIVISIONI: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 2], [3, 1], [5, 4]];
const CANALINI = ['ALLUMINIO', 'BORDO CALDO', ''];

function rigaDa(
  base: number, altezza: number, oriz: number, vert: number,
  tipoCanalino: string, qty: number, prezzoUnitario: number,
): RigaPreventivo {
  return {
    id: 'x',
    categoria: 'INGLESINA' as any,
    modello: 'VARSAVIA' as any,
    dimensione: '26',
    finitura: 'BIANCO',
    base_mm: base,
    altezza_mm: altezza,
    righe: vert,
    colonne: oriz,
    quantita: qty,
    descrizioneCompleta: 'INGLESINA VARSAVIA 26 - BIANCO',
    infoCanalino: tipoCanalino ? `Canalino: ${tipoCanalino} 16 NATURALE` : '',
    rawCanalino: { tipo: tipoCanalino, dim: tipoCanalino ? '16' : '', fin: tipoCanalino ? 'NATURALE' : '' },
    codice: 'G214',
    prezzo_unitario: prezzoUnitario,
    prezzo_totale: prezzoUnitario * qty,
    curva: false,
    tacca: false,
  };
}

describe('priceBreakdown: la catena mostrata riproduce il prezzo del motore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const catalog = useCatalogStore();
    catalog.listino = {
      INGLESINA: { VARSAVIA: { '26': { BIANCO: { prezzo: TARIFFA_GRIGLIA, cod: 'G214' } } } },
      CANALINO: {
        'ALLUMINIO':   { '16': { NATURALE: { prezzo: TARIFFA_CANALINO, cod: 'C111' } } },
        'BORDO CALDO': { '16': { NATURALE: { prezzo: TARIFFA_CANALINO, cod: 'C211' } } },
      },
    };
    catalog.codiciMap = {
      S001: 8, S002: 12,
      S003: 10, S004: 14, S005: 18, S006: 22,
      S007: 11, S008: 15, S009: 19, S010: 23,
      S011: 9,  S012: 13, S013: 17, S014: 21,
    };
    catalog.isLoaded = true;
  });

  it.each(LISTINI)('listino %s: riconcilia su tutta la matrice griglia', (listino) => {
    const catalog = useCatalogStore();
    const qty = 3;
    let controllate = 0;

    for (const [base, altezza] of MISURE) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        for (const tipoCanalino of CANALINI) {
          const input: PricingInput = {
            base_mm: base, altezza_mm: altezza, qty,
            num_orizzontali: oriz, num_verticali: vert,
            tipo_canalino: tipoCanalino,
            isSoloCanalino: false,
            prezzo_unitario_griglia: TARIFFA_GRIGLIA,
            prezzo_unitario_canalino: tipoCanalino ? TARIFFA_CANALINO : 0,
          };
          const { prezzo_unitario } = calculatePrice(input, listino);
          const riga = rigaDa(base, altezza, oriz, vert, tipoCanalino, qty, prezzo_unitario);

          const d = costruisciDettaglio(riga, listino, catalog);
          expect(d).not.toBeNull();
          expect(d!.prezzoRicostruito).toBeCloseTo(prezzo_unitario, 10);
          expect(d!.riconcilia).toBe(true);

          // I metri mostrati sono quelli su cui si regge la verifica del cliente.
          expect(d!.metriTotali).toBeCloseTo(d!.metriPezzo * qty, 10);
          controllate++;
        }
      }
    }
    expect(controllate).toBe(MISURE.length * SUDDIVISIONI.length * CANALINI.length);
  });

  it.each(LISTINI)('listino %s: riconcilia sul solo telaio', (listino) => {
    const catalog = useCatalogStore();
    for (const codice of ['C111', 'C112', 'C211', 'C311']) {
      const input: PricingInput = {
        base_mm: 1010, altezza_mm: 1200, qty: 2,
        num_orizzontali: 0, num_verticali: 0,
        tipo_canalino: 'ALLUMINIO',
        codice_canalino: codice,
        isSoloCanalino: true,
        prezzo_unitario_griglia: 0,
        prezzo_unitario_canalino: TARIFFA_CANALINO,
      };
      const { prezzo_unitario } = calculatePrice(input, listino);

      const riga = rigaDa(1010, 1200, 0, 0, 'ALLUMINIO', 2, prezzo_unitario);
      riga.categoria = 'CANALINO' as any;
      riga.codice = codice;

      const d = costruisciDettaglio(riga, listino, catalog);
      expect(d!.metrica).toBe('perimetro');
      expect(d!.prezzoRicostruito).toBeCloseTo(prezzo_unitario, 10);
      expect(d!.riconcilia).toBe(true);
    }
  });

  it('prezzo/m concordato (profilo fuori listino): riconcilia e non usa il listino', () => {
    const catalog = useCatalogStore();
    const concordata = 23.5;
    const input: PricingInput = {
      base_mm: 1000, altezza_mm: 1000, qty: 1,
      num_orizzontali: 2, num_verticali: 2,
      tipo_canalino: 'ALLUMINIO',
      isSoloCanalino: false,
      prezzo_unitario_griglia: concordata, // l'admin sovrascrive la tariffa
      prezzo_unitario_canalino: TARIFFA_CANALINO,
    };
    const { prezzo_unitario } = calculatePrice(input, '2025-a');

    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, prezzo_unitario);
    riga.customVarPrice = concordata;

    const d = costruisciDettaglio(riga, '2025-a', catalog)!;
    expect(d.tariffaConcordata).toBe(true);
    expect(d.tariffaGriglia).toBe(concordata);
    expect(d.riconcilia).toBe(true);
  });

  it('righe EXTRA: nessuna catena da spiegare', () => {
    const catalog = useCatalogStore();
    const riga = rigaDa(0, 0, 0, 0, '', 1, 40);
    riga.categoria = 'EXTRA' as any;
    expect(costruisciDettaglio(riga, '2025-a', catalog)).toBeNull();
  });

  // --- LA STRADA NUOVA: LO SCONTRINO ---------------------------------------
  // Da quando la riga si porta dietro la catena (RigaPricing), la modale legge
  // invece di dedurre. Le due strade devono raccontare la STESSA cosa, o il
  // cliente vedrebbe cambiare la spiegazione di un prezzo che non è cambiato.
  it.each(LISTINI)('listino %s: leggere lo scontrino dice quanto dedurre', (listino) => {
    const catalog = useCatalogStore();
    for (const [base, altezza] of MISURE) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        for (const tipoCanalino of CANALINI) {
          const input: PricingInput = {
            base_mm: base, altezza_mm: altezza, qty: 2,
            num_orizzontali: oriz, num_verticali: vert,
            tipo_canalino: tipoCanalino,
            isSoloCanalino: false,
            prezzo_unitario_griglia: TARIFFA_GRIGLIA,
            prezzo_unitario_canalino: tipoCanalino ? TARIFFA_CANALINO : 0,
          };
          const { prezzo_unitario, pricing } = calculatePrice(input, listino);

          const dedotto = costruisciDettaglio(rigaDa(base, altezza, oriz, vert, tipoCanalino, 2, prezzo_unitario), listino, catalog)!;
          const conScontrino = rigaDa(base, altezza, oriz, vert, tipoCanalino, 2, prezzo_unitario);
          conScontrino.pricing = pricing;
          const letto = costruisciDettaglio(conScontrino, listino, catalog)!;

          expect(letto.riconcilia).toBe(true);
          expect(letto.prezzoRicostruito).toBeCloseTo(dedotto.prezzoRicostruito, 10);
          expect(letto.regime).toBe(dedotto.regime);
          expect(letto.metriPezzo).toBeCloseTo(dedotto.metriPezzo, 10);
          expect(letto.metriTotali).toBeCloseTo(dedotto.metriTotali, 10);
          expect(letto.metrica).toBe(dedotto.metrica);
          expect(letto.maggiorazionePct).toBe(dedotto.maggiorazionePct);
          expect(letto.taglia).toBe(dedotto.taglia);
          expect(letto.supplementi).toEqual(dedotto.supplementi);
          expect(letto.tariffaGriglia).toBe(dedotto.tariffaGriglia);

          // Sulle righe con costi fissi il canalino non entra nel prezzo (rientra
          // come profilo perimetrale a forfait): nessuna delle due strade lo
          // espone come tariffa al metro, o il cliente sommerebbe una voce che
          // nel conto non c'è.
          expect(letto.tariffaCanalino).toBe(dedotto.tariffaCanalino);
          if (letto.supplementi.length) expect(letto.tariffaCanalino).toBe(0);
        }
      }
    }
  });

  it.each(LISTINI)('listino %s: scontrino del solo telaio', (listino) => {
    const catalog = useCatalogStore();
    for (const codice of ['C111', 'C112', 'C211', 'C311']) {
      const { prezzo_unitario, pricing } = calculatePrice({
        base_mm: 1010, altezza_mm: 1200, qty: 2,
        num_orizzontali: 0, num_verticali: 0,
        tipo_canalino: 'ALLUMINIO',
        codice_canalino: codice,
        isSoloCanalino: true,
        prezzo_unitario_griglia: 0,
        prezzo_unitario_canalino: TARIFFA_CANALINO,
      }, listino);

      const riga = rigaDa(1010, 1200, 0, 0, 'ALLUMINIO', 2, prezzo_unitario);
      riga.categoria = 'CANALINO' as any;
      riga.codice = codice;
      riga.pricing = pricing;

      const d = costruisciDettaglio(riga, listino, catalog)!;
      expect(d.regime).toBe('SOLO_TELAIO');
      expect(d.metrica).toBe('perimetro');
      expect(d.tariffaCanalino).toBeGreaterThan(0);
      expect(d.riconcilia).toBe(true);
    }
  });

  it('scontrino: il listino di oggi non lo tocca (è la ragione per cui esiste)', () => {
    const catalog = useCatalogStore();
    const input: PricingInput = {
      base_mm: 1000, altezza_mm: 1000, qty: 1,
      num_orizzontali: 2, num_verticali: 2,
      tipo_canalino: 'ALLUMINIO',
      isSoloCanalino: false,
      prezzo_unitario_griglia: TARIFFA_GRIGLIA,
      prezzo_unitario_canalino: TARIFFA_CANALINO,
    };
    const { prezzo_unitario, pricing } = calculatePrice(input, '2025-a');
    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, prezzo_unitario);
    riga.pricing = pricing;

    // Stesso scenario del test della guardia qui sotto: il listino sale dopo
    // l'offerta. Con lo scontrino la riga continua a spiegarsi da sé.
    catalog.listino.INGLESINA.VARSAVIA['26'].BIANCO.prezzo = 15.5;

    const d = costruisciDettaglio(riga, '2025-a', catalog)!;
    expect(d.riconcilia).toBe(true);
    expect(d.tariffaGriglia).toBe(TARIFFA_GRIGLIA);
  });

  it('scontrino malformato: non esplode, semplicemente non riconcilia', () => {
    const catalog = useCatalogStore();
    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, 42);
    // Le righe del preventivo sono scrivibili dal client: uno scontrino storto
    // deve degradare, non far saltare la modale.
    riga.pricing = { listino: '2026-a', regime: 'BOH', metrica: 'boh', metriPezzo: null, taglia: undefined } as any;

    const d = costruisciDettaglio(riga, '2026-a', catalog)!;
    expect(d).not.toBeNull();
    expect(d.riconcilia).toBe(false);
    expect(d.regimeLabel).toBeTruthy();
    expect(d.supplementi).toEqual([]);
    expect(d.metrica).toBe('sviluppo');
  });

  // --- LA GUARDIA ----------------------------------------------------------
  it('listino cambiato dopo l\'offerta: NON riconcilia, e la modale non inventa', () => {
    const catalog = useCatalogStore();
    const input: PricingInput = {
      base_mm: 1000, altezza_mm: 1000, qty: 1,
      num_orizzontali: 2, num_verticali: 2,
      tipo_canalino: 'ALLUMINIO',
      isSoloCanalino: false,
      prezzo_unitario_griglia: TARIFFA_GRIGLIA,
      prezzo_unitario_canalino: TARIFFA_CANALINO,
    };
    const { prezzo_unitario } = calculatePrice(input, '2025-a');
    const riga = rigaDa(1000, 1000, 2, 2, 'ALLUMINIO', 1, prezzo_unitario);

    // Il preventivo è stato battuto a 14,00 €/m. Poi il listino sale a 15,50.
    catalog.listino.INGLESINA.VARSAVIA['26'].BIANCO.prezzo = 15.5;

    const d = costruisciDettaglio(riga, '2025-a', catalog)!;
    expect(d.riconcilia).toBe(false);

    // Quello che resta vero anche così: i metri e la tariffa effettivamente pagata.
    expect(d.metriTotali).toBeGreaterThan(0);
    expect(d.tariffaEffettiva).toBeCloseTo(prezzo_unitario / d.metriTotali, 10);
  });

  // --- IL BLOCCO ③: QUELLO CHE SI LEGGE È QUELLO CHE SI PAGA ---------------
  // Il testo del regime non è decorazione: è la frase che il cliente confronta
  // con la cifra. Questi test la inchiodano ai numeri della riga.

  function dettaglioDa(listino: string, oriz: number, vert: number, canalino = 'ALLUMINIO', conScontrino = false) {
    const catalog = useCatalogStore();
    const input: PricingInput = {
      base_mm: 1010, altezza_mm: 1010, qty: 1,
      num_orizzontali: oriz, num_verticali: vert,
      tipo_canalino: canalino,
      isSoloCanalino: false,
      prezzo_unitario_griglia: TARIFFA_GRIGLIA,
      prezzo_unitario_canalino: canalino ? TARIFFA_CANALINO : 0,
    };
    const { prezzo_unitario, pricing } = calculatePrice(input, listino);
    const riga = rigaDa(1010, 1010, oriz, vert, canalino, 1, prezzo_unitario);
    if (conScontrino) riga.pricing = pricing;
    return costruisciDettaglio(riga, listino, catalog)!;
  }

  it('2026: le suddivisioni in una direzione NON sono maggiorate, sono a voci fisse', () => {
    for (const conScontrino of [false, true]) {
      for (const [oriz, vert] of [[0, 2], [0, 1]] as Array<[number, number]>) {
        const d = dettaglioDa('2026-a', oriz, vert, 'ALLUMINIO', conScontrino);
        expect(d.maggiorazionePct).toBeNull();
        expect(d.regimeSpiegazione).not.toMatch(/maggiorat/i);
        expect(d.regimeSpiegazione).toMatch(/attrezzaggio/);
        expect(d.regimeSpiegazione).toMatch(/profilo perimetrale/);
      }
    }
  });

  it('2026: parallele e singola costano con la stessa regola, e il testo lo dice', () => {
    const parallele = dettaglioDa('2026-a', 0, 2);
    const singola = dettaglioDa('2026-a', 0, 1);
    // Stesso meccanismo (la frase dopo la discriminante), discriminante diversa.
    expect(parallele.regimeSpiegazione.split('. ')[1]).toBe(singola.regimeSpiegazione.split('. ')[1]);
    expect(parallele.regimeLabel).not.toBe(singola.regimeLabel);
  });

  it('la suddivisione singola dice solo chi è, non quanto rende', () => {
    const d = dettaglioDa('2025-a', 0, 1);
    expect(d.regimeLabel).toBe('Suddivisione singola');
    expect(d.regimeSpiegazione).toMatch(/Un solo elemento sull'intero telaio \(orizzontale o verticale\)\./);
    expect(d.regimeSpiegazione).not.toMatch(/resa|efficien/i);
  });

  it('listini lineari: la maggiorazione si dice in percentuale', () => {
    expect(dettaglioDa('2025-a', 0, 2).regimeSpiegazione).toMatch(/maggiorata del 20%/);
    expect(dettaglioDa('2025-a', 0, 1).regimeSpiegazione).toMatch(/maggiorata del 50%/);
    // Su LEALI la singola costa come le parallele.
    expect(dettaglioDa('2025x', 0, 1).regimeSpiegazione).toMatch(/maggiorata del 20%/);
    expect(dettaglioDa('2025x', 0, 2).regimeSpiegazione).toMatch(/maggiorata del 20%/);
  });

  it('nessun testo parla più di moltiplicatori', () => {
    for (const listino of LISTINI) {
      for (const [oriz, vert] of SUDDIVISIONI) {
        const d = dettaglioDa(listino, oriz, vert);
        expect(d.regimeSpiegazione).not.toMatch(/× ?1[,.]/);
      }
    }
  });

  it('INVARIANTE: la frase e i numeri della riga dicono la stessa cosa', () => {
    for (const conScontrino of [false, true]) {
      for (const listino of LISTINI) {
        for (const [oriz, vert] of SUDDIVISIONI) {
          for (const canalino of CANALINI) {
            const d = dettaglioDa(listino, oriz, vert, canalino, conScontrino);
            const dicePercentuale = /maggiorata del ([\d,]+)%/.exec(d.regimeSpiegazione);
            const diceVociFisse = /attrezzaggio|profilo perimetrale/.test(d.regimeSpiegazione);

            expect(!!dicePercentuale).toBe(d.maggiorazionePct !== null);
            if (dicePercentuale) {
              expect(Number(dicePercentuale[1]!.replace(',', '.'))).toBe(d.maggiorazionePct);
            }
            expect(diceVociFisse).toBe(d.supplementi.length > 0);

            // E se dice "griglia + canalino", il canalino deve davvero entrare
            // nel conto al metro.
            if (/griglia \+ canalino/.test(d.regimeSpiegazione)) {
              expect(d.tariffaCanalino).toBeGreaterThan(0);
              expect(d.supplementi.length).toBe(0);
            }
          }
        }
      }
    }
  });

  it('le discriminanti sono il criterio, non la descrizione del disegno', () => {
    for (const conScontrino of [false, true]) {
      expect(dettaglioDa('2026-a', 2, 2, 'ALLUMINIO', conScontrino).regimeSpiegazione)
        .toMatch(/^Almeno 1 incrocio\./);
      expect(dettaglioDa('2026-a', 0, 2, 'ALLUMINIO', conScontrino).regimeSpiegazione)
        .toMatch(/^Telai con più orizzontali o più verticali\./);
      expect(dettaglioDa('2025-a', 0, 2, 'ALLUMINIO', conScontrino).regimeSpiegazione)
        .toMatch(/^Telai con più orizzontali o più verticali\./);
    }
  });

  // L'override storico: soli orizzontali e nessun canalino vengono quotati con la
  // regola dell'incrocio pur non avendo nessun incrocio. Dire "almeno 1 incrocio"
  // lì sarebbe falso, e il cliente ha il disegno davanti.
  it('soli orizzontali senza canalino: non si dice che c\'è un incrocio', () => {
    for (const conScontrino of [false, true]) {
      for (const listino of LISTINI) {
        const d = dettaglioDa(listino, 3, 0, '', conScontrino);
        expect(d.regime).toBe('INCROCIO');
        expect(d.regimeSpiegazione).not.toMatch(/Almeno 1 incrocio/);
        expect(d.regimeSpiegazione).toMatch(/senza canalino/);
      }
    }
  });

  it('la tariffa della griglia porta il profilo a cui si riferisce', () => {
    for (const conScontrino of [false, true]) {
      expect(dettaglioDa('2026-a', 2, 2, 'ALLUMINIO', conScontrino).descrizioneGriglia)
        .toBe('VARSAVIA 26 BIANCO');
    }
    // Sul solo telaio non c'è nessuna griglia da nominare.
    const catalog = useCatalogStore();
    const riga = rigaDa(1010, 1200, 0, 0, 'ALLUMINIO', 1, 6.3);
    riga.categoria = 'CANALINO' as any;
    riga.modello = 'MANUALE' as any;
    riga.dimensione = '-';
    riga.finitura = '-';
    riga.codice = 'C111';
    expect(costruisciDettaglio(riga, '2026-a', catalog)!.descrizioneGriglia).toBe('');
  });
});
