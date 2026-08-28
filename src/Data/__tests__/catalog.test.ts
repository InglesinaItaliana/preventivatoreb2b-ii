import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCatalogStore, voceSupplementoDaListinoBase } from '../catalog';

// ============================================================================
// Sotto una voce fissa della lente del prezzo il cliente legge due testi presi
// dal listino: il NOME della voce e la CASISTICA in cui la riga è caduta. In
// `listino_base` nessuno dei due campi si chiama come ci si aspetterebbe — il
// nome è in `modello`, la casistica in `finitura`, e `dimensione` (il candidato
// ovvio) porta tutt'altro. Leggere il campo sbagliato non rompe niente e non
// fallisce nessun test di prezzo: mostra al cliente "AL" al posto del criterio.
// Questi test inchiodano le caselle.
// ============================================================================

// Righe copiate dai documenti veri di listino_base (sorgente attiva).
const BASE_S001 = { cod: 'S001', sezione: 'SUPPLEMENTI', modello: 'Contributo allestimento telaio', dimensione: '', finitura: 'tot m griglia < 2', prezzo: 5 };
const BASE_S006 = { cod: 'S006', sezione: 'SUPPLEMENTI', modello: 'Contributo materiale perimetrale', dimensione: 'AL', finitura: 'perimetro oltre 7,5m', prezzo: 6 };
const BASE_I111 = { cod: 'I111', sezione: 'GRIGLIA', modello: 'Varsavia', dimensione: '18', finitura: 'BIANCO 9010', prezzo: 10 };

describe('listino_base: il nome sta in `modello`, la casistica in `finitura`', () => {
  it('legge le due caselle giuste', () => {
    expect(voceSupplementoDaListinoBase(BASE_S001))
      .toEqual({ nome: 'Contributo allestimento telaio', casistica: 'tot m griglia < 2' });
    expect(voceSupplementoDaListinoBase(BASE_S006))
      .toEqual({ nome: 'Contributo materiale perimetrale', casistica: 'perimetro oltre 7,5m' });
  });

  it('non scambia la casistica per il tipo di canalino', () => {
    // La trappola: `dimensione` su S006 vale 'AL'. È un dato buono per un campo
    // sbagliato — nessun errore, solo un criterio che non è un criterio.
    expect(voceSupplementoDaListinoBase(BASE_S006)!.casistica).not.toBe('AL');
    expect(Object.values(voceSupplementoDaListinoBase(BASE_S006)!)).not.toContain('AL');
  });

  it('fuori dai supplementi non c\'è nessuna voce da dichiarare', () => {
    // Su una griglia `modello` è "Varsavia" e `finitura` un colore: spacciarli
    // per nome e soglia sarebbe peggio che tacere.
    expect(voceSupplementoDaListinoBase(BASE_I111)).toBeNull();
    expect(voceSupplementoDaListinoBase({ sezione: 'SUPPLEMENTI' })).toBeNull();
    expect(voceSupplementoDaListinoBase(undefined)).toBeNull();
  });
});

describe('Google Sheet (fallback): casistica dalla colonna DIMENSIONE, nome assente', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('indicizza i supplementi con il testo del foglio, non maiuscolizzato', () => {
    const catalog = useCatalogStore();
    // Forma delle righe come escono da _normalizeCsvRow: `dimensione` è la
    // chiave dell'albero (MAIUSCOLA), `descrizione` il testo originale.
    catalog._buildFromRows([
      { categoria: 'SUPPLEMENTI', modello: 'STD', dimensione: 'TOT M GRIGLIA < 2', finitura: 'STD', tipoFinitura: '', cod: 'S001', prezzo: 5, descrizione: 'tot m griglia < 2' },
      { categoria: 'SUPPLEMENTI', modello: 'ALLUMINIO', dimensione: 'PERIMETRO OLTRE 7,5M', finitura: 'STD', tipoFinitura: '', cod: 'S006', prezzo: 6, descrizione: 'perimetro oltre 7,5m' },
      { categoria: 'INGLESINA', modello: 'VARSAVIA', dimensione: '18', finitura: 'BIANCO 9010', tipoFinitura: 'BIANCA', cod: 'I111', prezzo: 10, descrizione: '18' },
    ]);

    // Il foglio il nome della voce non ce l'ha: resta vuoto, e la lente ricade
    // sul suo (NOMI_VOCE), che dev'essere identico ai `modello` di listino_base.
    expect(catalog.supplementiMap['S001']).toEqual({ nome: '', casistica: 'tot m griglia < 2' });
    expect(catalog.supplementiMap['S006']!.casistica).toBe('perimetro oltre 7,5m');
    // Su una griglia la stessa casella è una misura: fuori dall'indice.
    expect(catalog.supplementiMap['I111']).toBeUndefined();
    // E l'albero dei menu resta sulle chiavi maiuscole di sempre.
    expect(catalog.listino.INGLESINA.VARSAVIA['18']['BIANCO 9010'].prezzo).toBe(10);
  });
});
