import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { calcolaProgetto, type ConfigGriglia } from '../../../logic/griglie/progetto';
import { INGLESINA_26 } from '../../../logic/griglie/materiali';
import {
  disegnaSchedaProduzione, creaSchedaProduzione, nomeScheda, righePicking, pianiDiTaglio, codificaPezzi,
  type OpzioniScheda, type PannelloScheda,
} from '../schedaProduzionePdf';

// Pannello di prova: 350×700, 1V × 3O, verniciato, 2 telai.
const config: ConfigGriglia = {
  stile: 'PREMIUM', distribuzione: 'SPAZI_UGUALI', larghezza: 350, altezza: 700,
  passoOrizzontale: 170, passoVerticale: 170, quantita: 2, gioco: 1, margineMinimo: 10,
  conBordo: true, lunghezzaMinima: 0, famigliaAVista: 'O', famigliaFinitura: 'VERNICIATO',
  nBarreVerticali: 1, nBarreOrizzontali: 3,
};
const opzioni: OpzioniScheda = {
  commessa: '1175-26', cliente: 'Cliente di prova', data: '06/10/2026',
  kerf: 2, steccaInglesina: INGLESINA_26.stecca,
  pesoBarraKgM: 0.085, pesoInglesinaKgM: INGLESINA_26.pesoSteccaKg / 3,
};

const pannello = (codice: string, c: ConfigGriglia, finitura = 'BIANCO 9010'): PannelloScheda =>
  ({ codice, progetto: calcolaProgetto(c), finitura, telai: c.quantita });
const A = pannello('P1', config);

/** Il testo del PDF: jsPDF non comprime, quindi le stringhe stanno in chiaro. */
function testoPdf(pannelli: PannelloScheda[], o: OpzioniScheda = opzioni): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  disegnaSchedaProduzione(doc, pannelli, o);
  return doc.output();
}

describe('scheda di produzione — un pannello', () => {
  it('porta le stesse quote della distinta: taglio, scasso, fori', () => {
    const pdf = testoPdf([A]);
    for (const atteso of ['1175-26', 'Cliente di prova', '661 mm', '149 mm', '16,35 - 16,10', '181,5 · 350 · 518,5']) {
      expect(pdf).toContain(atteso);
    }
  });

  it('picking: barre e minuteria moltiplicate per i telai, metri totali del profilo', () => {
    const righe = righePicking([A], opzioni);
    const q = (voce: string) => righe.find((r) => r.voce.startsWith(voce))!.quantita;
    expect(q('Giunzioni interne')).toBe('6');   // 3 × 2 telai
    expect(q('Perni tondi')).toBe('16');        // 8 × 2
    expect(q('Giunzioni a L')).toBe('8');       // 4 × 2
    expect(q('Inglesina 26')).toBe('3');   // barre
  });

  it('codici: tipo + numero, dal più lungo al più corto in ogni tipo', () => {
    const { tipi, codice } = codificaPezzi([A]);
    expect(tipi.map((t) => [t.codice, t.nomi.join('/'), t.lunghezza])).toEqual([
      ['T1', 'h TELAIO', 700], ['T2', 'b TELAIO', 350], ['V1', 'Verticale', 661], ['O1', 'Orizzontale', 149],
    ]);
    expect(codice(A, 'Verticale')).toBe('V1');
    const pdf = testoPdf([A]);
    expect(pdf).toContain('SCHEMA DI MONTAGGIO');
    expect(pdf).toContain('661 mm');
  });

  it('telaio quadrato con griglia simmetrica: b e h sono lo stesso pezzo, un codice solo', () => {
    const quadrato = pannello('P1', { ...config, larghezza: 600, altezza: 600, nBarreVerticali: 2, nBarreOrizzontali: 2 });
    const telaio = codificaPezzi([quadrato]).tipi.filter((t) => t.gruppo === 'T');
    expect(telaio).toHaveLength(1);
    expect(telaio[0]!.nomi).toEqual(['b TELAIO', 'h TELAIO']);
    expect(telaio[0]!.quantita).toBe(4 * 2);   // 4 lati × 2 telai
    // Nella legenda dello schema di montaggio: una riga sola per il codice
    expect(testoPdf([quadrato]).split('b TELAIO / h TELAIO').length - 1).toBeGreaterThanOrEqual(1);
    // Con i fori in punti diversi (1 verticale, 3 orizzontali) restano due pezzi
    const asimmetrico = pannello('P1', { ...config, larghezza: 600, altezza: 600 });
    expect(codificaPezzi([asimmetrico]).tipi.filter((t) => t.gruppo === 'T')).toHaveLength(2);
  });

  it('picking: se un pezzo è più lungo della barra lo dice nella riga, non solo nel piano', () => {
    const largo = pannello('P1', { ...config, larghezza: 3100 });
    const riga = righePicking([largo], opzioni)[0]!;
    expect(riga.voce).toContain('ATTENZIONE');
    expect(riga.voce).toContain('T1');
  });

  it('senza barra impostata non inventa un piano di taglio', () => {
    const righe = righePicking([A], { ...opzioni, steccaInglesina: null });
    expect(righe[0]!.voce).toContain('non impostata');
  });

  it('funziona anche sugli altri stili, con la foratura per rivetti', () => {
    const pdf = testoPdf([pannello('P1', { ...config, stile: 'LONDRA', distribuzione: 'PASSO_FISSO', passoOrizzontale: 100, passoVerticale: 200 })]);
    expect(pdf).toContain('FORATURA');
    expect(pdf).not.toContain('SCASSI');
  });
});

describe('scheda di produzione — nome del file', () => {
  it('commessa, cliente e data, senza caratteri che un file system rifiuta', () => {
    expect(nomeScheda({ commessa: 'BOMBA', cliente: 'Pronti Claudio', data: '06/10/2026' })).toBe('Scheda produzione - BOMBA - Pronti Claudio - 06-10-2026');
    expect(nomeScheda({ commessa: '', cliente: 'A/B: "srl"', data: '06/10/2026' })).toBe('Scheda produzione - A B srl - 06-10-2026');
  });
});

describe('scheda di produzione — commessa con più pannelli', () => {
  const B = pannello('P2', { ...config, larghezza: 600, altezza: 1200, nBarreOrizzontali: 2, quantita: 1 });

  it('stesso materiale: UN piano di taglio con i pezzi di tutti i pannelli, ognuno col suo codice', () => {
    const piani = pianiDiTaglio([A, B], opzioni);
    expect(piani).toHaveLength(1);
    const codici = piani[0]!.piano!.passi.flatMap((p) => p.codici);
    expect(codici.map((c) => c.etichetta)).toContain('V1');   // il 1161 di B
    expect(codici.map((c) => c.etichetta)).toContain('V2');   // il 661 di A
    // Niente pezzi persi o inventati: 8+2+12 di A (2 telai) + 4+1+4 di B
    expect(codici.reduce((t, c) => t + c.quantita, 0)).toBe(2 * (4 + 1 + 6) + (4 + 1 + 4));
  });

  it('finiture diverse: piani di taglio separati (un pezzo BIANCO non esce da una barra NOCE)', () => {
    const noce = pannello('P2', { ...config, famigliaFinitura: 'RIVESTITO' }, 'NOCE LE10');
    const piani = pianiDiTaglio([A, noce], opzioni);
    expect(piani.map((p) => p.nome)).toEqual(['Inglesina 26 BIANCO 9010', 'Inglesina 26 NOCE LE10']);
    // Ottimizzato solo il bianco di serie
    expect(piani.map((p) => p.piano!.ottimizzato)).toEqual([true, false]);
  });

  it('pezzi identici in pannelli diversi: un codice solo, quantità sommate', () => {
    const gemello = pannello('P2', config);
    const { tipi, codice } = codificaPezzi([A, gemello]);
    expect(tipi).toHaveLength(4);
    expect(codice(A, 'Verticale')).toBe(codice(gemello, 'Verticale'));
    expect(tipi.find((t) => t.codice === 'V1')!.quantita).toBe(2 + 2);
    const pdf = testoPdf([A, gemello]);
    expect(pdf.split('16,35 - 16,10').length - 1).toBe(1);   // uno scasso solo
  });

  it('lunghi uguali ma con gli scassi in punti diversi: codici diversi', () => {
    const dueOrizzontali = pannello('P2', { ...config, nBarreOrizzontali: 2 });
    const { codice } = codificaPezzi([A, dueOrizzontali]);
    expect(A.progetto.barre[0]!.lunghezza).toBe(dueOrizzontali.progetto.barre[0]!.lunghezza);
    expect(codice(A, 'Verticale')).not.toBe(codice(dueOrizzontali, 'Verticale'));
  });

  it('stessa misura, finiture diverse: codici diversi', () => {
    const noce = pannello('P2', { ...config, famigliaFinitura: 'RIVESTITO' }, 'NOCE LE10');
    const { codice } = codificaPezzi([A, noce]);
    expect(codice(A, 'Orizzontale')).not.toBe(codice(noce, 'Orizzontale'));
  });

  it('il PDF dà il piano per misura, in una sezione per materiale', () => {
    const pdf = testoPdf([A, B]);
    expect(pdf).toContain('PIANO DI TAGLIO');
    expect(pdf).toContain('INGLESINA 26 BIANCO 9010');
    expect(pdf).toContain('ottimizzato sullo scarto');   // bianco di serie
    expect(pdf).toContain('1200 mm');
    expect(pdf).toContain('MAGAZZINO');   // la legenda delle destinazioni
  });

  it('a schermo una pagina sola alta quanto serve, in stampa pagine A4', () => {
    const schermo = creaSchedaProduzione([A, B], opzioni, 'schermo');
    const stampa = creaSchedaProduzione([A, B], opzioni, 'stampa');
    expect(schermo.getNumberOfPages()).toBe(1);
    expect(schermo.internal.pageSize.getHeight()).toBeGreaterThan(297);
    expect(stampa.getNumberOfPages()).toBeGreaterThan(1);
    expect(stampa.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
  });

  it('il PDF elenca i pannelli, ha gli scassi di ognuno e uno schema di montaggio per ognuno', () => {
    const pdf = testoPdf([A, B]);
    expect(pdf).toContain('PANNELLI');
    expect(pdf).toContain('SCASSI');
    expect(pdf).toContain('V1 · 1 pezzo da 1161 mm');   // il verticale di B
    expect(pdf).toContain('V2 · 2 pezzi da 661 mm');    // quello di A
    expect(pdf).not.toContain('cod. ');
    expect(pdf).toContain('SCHEMA DI MONTAGGIO · P1');
    expect(pdf).toContain('SCHEMA DI MONTAGGIO · P2');
    expect(pdf).toContain('38,52 - INIZ');   // lo scasso del pannello B (600×1200, 2 orizzontali)
  });

  it('packaging: ingombro e peso di ogni pannello, poi la pila di tutta la commessa', () => {
    const pdf = testoPdf([A, B]);
    expect(pdf).toContain('PACKAGING');
    expect(pdf).toContain('35 x 70 x 1,6');    // P1: 2 telai premium da 8 mm impilati
    expect(pdf).toContain('60 x 120 x 0,8');   // P2: 1 telaio
    expect(pdf).toContain('TOTALE COMMESSA');
    expect(pdf).toContain('60 x 120 x 2,4');   // il più grande, con tutti gli spessori sommati
  });

  it('minuteria sommata su tutta la commessa', () => {
    const righe = righePicking([A, B], opzioni);
    const q = (voce: string) => righe.find((r) => r.voce.startsWith(voce))!.quantita;
    expect(q('Giunzioni interne')).toBe(String(3 * 2 + 2 * 1));
    expect(q('Giunzioni a L')).toBe(String(4 * 2 + 4 * 1));
  });

  it('commessa congelata: la testata lo dichiara', () => {
    expect(testoPdf([A, B], { ...opzioni, congelataIl: '07/10/2026' })).toContain('quote congelate il 07/10/2026');
  });
});
