import { describe, it, expect } from 'vitest';
import { appartiene, coloreFinitura, tinta, COLORE_NEUTRO } from '../finiture';

// I gruppi qui sotto sono quelli VERI del listino POPS (letti dal foglio, non
// immaginati): il primo tentativo filtrava su "VERNICIAT" — che nel listino non
// esiste — e la tendina dei verniciati restava vuota. Questi test lo impediscono.

describe('famiglie di finitura: i nomi veri del listino', () => {
  it('"verniciato" nel listino si chiama COLORE STANDARD / PERSONALIZZATO', () => {
    expect(appartiene('COLORE STANDARD', 'VERNICIATO')).toBe(true);
    expect(appartiene('COLORE PERSONALIZZATO', 'VERNICIATO')).toBe(true);
    expect(appartiene('RIVESTITA', 'VERNICIATO')).toBe(false);
  });

  it('"rivestito" nel listino si chiama RIVESTITA', () => {
    expect(appartiene('RIVESTITA', 'RIVESTITO')).toBe(true);
    expect(appartiene('COLORE STANDARD', 'RIVESTITO')).toBe(false);
  });

  it('i gruppi estranei (canalini, supplementi) non finiscono nelle finiture', () => {
    for (const estraneo of ['TUTTE', 'NEUTRA', 'COLORATA', 'x', 'perimetro < di 5m']) {
      expect(appartiene(estraneo, 'VERNICIATO')).toBe(false);
      expect(appartiene(estraneo, 'RIVESTITO')).toBe(false);
    }
  });
});

describe('colore della finitura', () => {
  it('legge il RAL dal nome, come è scritto in listino', () => {
    expect(coloreFinitura('BIANCO 9010')).toBe('#F1EDE1');
    expect(coloreFinitura('NERO 9005')).toBe('#0A0A0A');
    expect(coloreFinitura('GRIGIO ANTRACITE 7016')).toBe('#383E42');
    expect(coloreFinitura('VERDE MUSCHIO 6005')).toBe('#2F4538');
  });

  it('le finiture senza RAL hanno una voce esplicita', () => {
    expect(coloreFinitura('NOCE LE10')).toBe('#5C4033');
    expect(coloreFinitura('ROVERE DORATO LE07')).toBe('#A9762F');
    expect(coloreFinitura('PINO')).toBe('#C8A165');
  });

  it('una finitura sconosciuta non si inventa un colore: resta neutra', () => {
    expect(coloreFinitura('COLORE CHE NON ESISTE')).toBe(COLORE_NEUTRO);
    expect(coloreFinitura('')).toBe(COLORE_NEUTRO);
  });

  it('tutte le finiture del listino hanno un colore (nessuna cade nel neutro per sbaglio)', () => {
    const listino = [
      'AVORIO 1013', 'BIANCO 9010', 'GRIGIO 7035', 'GRIGIO ANTRACITE 7016',
      'GRIGIO ARGENTO OPACO 7001', 'GRIGIO MAREZZATO 007', 'MARRONE CIOCCOLATO 8017',
      'MARRONE MAREZZATO', 'NERO 9005', 'VERDE MUSCHIO 6005', 'VERDE PALLIDO 6021',
      'GRIGIO 7032', 'GRIGIO OPACO 7022', 'GRIGIO OPACO 7035', 'MARRONE OPACO 8019',
      'ORO', 'ORO 1036', 'PINO', 'VERDE ABETE 6009',
      'BIANCO LE11', 'DOUGLAS LE01', 'MACORÈ LE08', 'NOCE LE10',
      'ROVERE CHIARO LE04', 'ROVERE DORATO LE07', 'WINCHESTER',
    ];
    for (const f of listino) {
      expect(coloreFinitura(f), `${f} non ha un colore`).not.toBe(COLORE_NEUTRO);
    }
    // Il RAL personalizzato è l'unico che resta volutamente neutro: il colore
    // vero lo decide il cliente, non lo sappiamo qui.
    expect(coloreFinitura('RAL PERSONALIZZATO')).toBe(COLORE_NEUTRO);
  });
});

describe('tinta: distinguere le barre dal telaio senza cambiare colore', () => {
  it('scurisce e schiarisce restando un colore valido', () => {
    expect(tinta('#808080', -0.5)).toMatch(/^#[0-9a-f]{6}$/);
    expect(tinta('#000000', -0.5)).toBe('#000000');
    expect(tinta('#FFFFFF', 0.5)).toBe('#ffffff');
  });

  it('un bianco scurito resta visibile su fondo chiaro', () => {
    const bordo = tinta('#F1EDE1', -0.45);
    expect(bordo).not.toBe('#f1ede1');
  });
});
