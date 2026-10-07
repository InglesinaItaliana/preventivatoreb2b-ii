import { describe, it, expect } from 'vitest';
import { calcolaProgetto, calcolaImballaggio, type ConfigGriglia } from '../progetto';
import { scassoStandard26, scassoPremium26, etichettaScasso, TERMINALE_STANDARD } from '../scasso';

// Riferimenti:
// - foglio "calcoliLAVORAZIONI - 2026", tab "test Gionata" (inglesina standard 26 BIANCO 9010)
// - pannelli A e B calcolati a mano in officina (ottobre 2026): misure e fori coincidono
// - pannello di prova 350×700 da realizzare per verificare lo spostamento dello scasso

const premium = (over: Partial<ConfigGriglia>): ConfigGriglia => ({
  stile: 'PREMIUM',
  distribuzione: 'SPAZI_UGUALI',
  larghezza: 600,
  altezza: 1200,
  passoOrizzontale: 300,
  passoVerticale: 400,
  quantita: 1,
  gioco: 1,
  margineMinimo: 10,
  conBordo: true,
  lunghezzaMinima: 0,
  famigliaAVista: 'O',
  famigliaFinitura: 'VERNICIATO',
  ...over,
});

const pezzo = (p: ReturnType<typeof calcolaProgetto>, etichetta: string) =>
  p.barre.find((b) => b.etichetta === etichetta)!;

describe('scasso 26 — la formula del foglio, così com\'è', () => {
  it('riga 10: barra 1422, 2 orizzontali → 46,97 - INIZ', () => {
    const q = scassoStandard26(1422, 2);
    expect(q.primaQuota).toBeCloseTo(469.667, 3);
    expect(etichettaScasso(q, 2)).toBe('46,97 - INIZ');
  });

  it('riga 11: barra 2212, 3 orizzontali → 54,75 - 55,25', () => {
    const q = scassoStandard26(2212, 3);
    expect(q.primaQuota).toBe(547.5);
    expect(q.passo).toBe(552.5);
    expect(etichettaScasso(q, 3)).toBe('54,75 - 55,25');
  });

  it('con un solo orizzontale una quota sola: girare la barra farebbe un secondo scasso', () => {
    expect(etichettaScasso(scassoStandard26(1000, 1), 1)).not.toContain('INIZ');
    expect(etichettaScasso(scassoStandard26(1000, 0), 0)).toBe('');
  });
});

describe('scasso PREMIUM — stessa relazione quota ↔ asse dello standard', () => {
  // Nello standard la barra comincia 1 mm DENTRO la luce; nel PREMIUM comincia
  // sormontoPerLato mm PRIMA della luce. A parità di luce gli orizzontali stanno
  // negli stessi punti: la quota deve seguire la testa, il passo no.
  const assiDallaLuce = (luce: number, n: number) =>
    Array.from({ length: n }, (_, i) => (i + 1) * (luce + 26) / (n + 1) - 13);

  for (const [luce, n, perLato] of [[648, 3, 6.5], [1748, 3, 6], [1148, 2, 6.5], [2000, 5, 6.5]] as const) {
    it(`luce ${luce}, ${n} orizzontali, sormonto ${perLato}/lato`, () => {
      const std = scassoStandard26(luce - 2 * TERMINALE_STANDARD, n);
      const pre = scassoPremium26(luce, n, perLato);
      const asse1Std = assiDallaLuce(luce, n)[0]! - TERMINALE_STANDARD;
      const asse1Pre = assiDallaLuce(luce, n)[0]! + perLato;
      expect(pre.primaQuota - asse1Pre).toBeCloseTo(std.primaQuota - asse1Std, 9);
      expect(pre.passo).toBe(std.passo);
    });
  }
});

describe('PREMIUM — pannello di prova 350×700, 1V × 3O, verniciato', () => {
  const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));

  it('interni: verticale 661, spezzoni 149 × 6', () => {
    expect(pezzo(p, 'Verticale')).toMatchObject({ lunghezza: 661, quantitaPerTelaio: 1 });
    expect(pezzo(p, 'Orizzontale')).toMatchObject({ lunghezza: 149, quantitaPerTelaio: 6 });
  });

  it('cornice: misura lunga = esterno, fori sugli assi dalla punta lunga', () => {
    expect(p.bordi[0]).toMatchObject({ lunghezza: 350, quantitaPerTelaio: 2 });
    expect(p.bordi[0]!.fori).toEqual([175]);
    expect(p.bordi[1]).toMatchObject({ lunghezza: 700, quantitaPerTelaio: 2 });
    expect(p.bordi[1]!.fori).toEqual([181.5, 350, 518.5]);
  });

  it('luci uguali: 142,5 in verticale, 136 in orizzontale', () => {
    expect(p.vuotoY).toBeCloseTo(142.5, 9);
    expect(p.vuotoX).toBeCloseTo(136, 9);
  });

  it('scasso 16,35 - 16,10; gli assi degli orizzontali a 162 / 330,5 / 499 dalla testa', () => {
    expect(p.premium!.scasso.etichetta).toBe('16,35 - 16,10');
    expect(p.premium!.scasso.primaQuota).toBeCloseTo(163.5, 9);
    expect(p.premium!.scasso.passo).toBe(161);
    expect(p.premium!.scasso.assi).toEqual([162, 330.5, 499]);
  });
});

describe('PREMIUM — pannelli verificati in officina', () => {
  it('A: 600×1200, 1V × 2O, verniciato', () => {
    const p = calcolaProgetto(premium({ nBarreVerticali: 1, nBarreOrizzontali: 2 }));
    expect(pezzo(p, 'Verticale')).toMatchObject({ lunghezza: 1161, quantitaPerTelaio: 1 });
    expect(pezzo(p, 'Orizzontale')).toMatchObject({ lunghezza: 274, quantitaPerTelaio: 4 });
    expect(p.bordi[0]!.fori).toEqual([300]);
    expect(p.bordi[1]!.fori!.map((f) => Math.round(f * 10) / 10)).toEqual([404.3, 795.7]);
    expect(p.premium!.scasso.etichetta).toBe('38,52 - INIZ');
  });

  it('B: 800×1800, 2V × 3O, rivestito — sormonto 14, cioè 6 mm per lato', () => {
    const p = calcolaProgetto(premium({
      larghezza: 800, altezza: 1800, famigliaFinitura: 'RIVESTITO', nBarreVerticali: 2, nBarreOrizzontali: 3,
    }));
    expect(p.premium!.sormontoPerLato).toBe(6);
    expect(pezzo(p, 'Verticale')).toMatchObject({ lunghezza: 1760, quantitaPerTelaio: 2 });
    expect(pezzo(p, 'Orizzontale')).toMatchObject({ lunghezza: 244, quantitaPerTelaio: 9 });
    expect(p.bordi[0]!.fori).toEqual([271, 529]);
    expect(p.bordi[1]!.fori).toEqual([456.5, 900, 1343.5]);
    expect(p.premium!.scasso.etichetta).toBe('43,80 - 43,60');
  });
});

describe('PREMIUM — la regola unica regge su qualunque composizione', () => {
  const casi = [
    { larghezza: 430, altezza: 1446, nBarreVerticali: 2, nBarreOrizzontali: 2, famigliaFinitura: 'VERNICIATO' as const },
    { larghezza: 1000, altezza: 2000, nBarreVerticali: 4, nBarreOrizzontali: 6, famigliaFinitura: 'RIVESTITO' as const },
  ];

  for (const caso of casi) {
    const p = calcolaProgetto(premium(caso));
    const s = p.premium!.sormonto;

    it(`${caso.larghezza}×${caso.altezza}: ogni spezzone = distanza fra gli assi d'appoggio − sormonto`, () => {
      const appoggi = [13, ...p.assiVerticali, caso.larghezza - 13];
      const spezzone = pezzo(p, 'Orizzontale').lunghezza;
      for (let i = 1; i < appoggi.length; i++) {
        expect(appoggi[i]! - appoggi[i - 1]! - s).toBeCloseTo(spezzone, 9);
      }
      expect(pezzo(p, 'Verticale').lunghezza).toBe(caso.altezza - 26 - s);
    });

    it(`${caso.larghezza}×${caso.altezza}: un foro di cornice per ogni interno, simmetrici`, () => {
      const [traverso, montante] = p.bordi;
      expect(traverso!.fori).toHaveLength(caso.nBarreVerticali);
      expect(montante!.fori).toHaveLength(caso.nBarreOrizzontali);
      for (const b of p.bordi) {
        const f = b.fori!;
        expect(f[0]!).toBeCloseTo(b.lunghezza - f[f.length - 1]!, 9);
      }
    });

    it(`${caso.larghezza}×${caso.altezza}: il disegno porta le lunghezze vere`, () => {
      const lunghezze = p.disegno.barre.map((b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1));
      for (const l of lunghezze) {
        expect([pezzo(p, 'Verticale').lunghezza, pezzo(p, 'Orizzontale').lunghezza]
          .some((x) => Math.abs(x - l) < 1e-9)).toBe(true);
      }
      expect(p.disegno.barre).toHaveLength(caso.nBarreVerticali + caso.nBarreOrizzontali * (caso.nBarreVerticali + 1));
    });
  }

  it('niente rivetti, niente profilo a U: tutto il materiale è inglesina', () => {
    const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));
    expect(p.nRivetti).toBe(0);
    expect(p.metriU).toBe(0);
    // cornice 2,1 m + verticale 0,661 + 6 spezzoni da 0,149
    expect(p.metriBarra).toBeCloseTo(2.1 + 0.661 + 6 * 0.149, 9);
  });

  it('disegno: cornice sotto, verticali sopra la cornice, spezzoni sopra tutto', () => {
    const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));
    const famiglie = p.disegno.barre.map((b) => b.famiglia);
    expect(famiglie.lastIndexOf('V')).toBeLessThan(famiglie.indexOf('O'));
    // Ogni testa che sormonta è smussata quanto la parte che sormonta
    for (const b of p.disegno.barre) expect(b.smusso).toBe(6.5);
  });

  it('cornice: quattro trapezi a 45°, uno per pezzo, con l\'etichetta della distinta', () => {
    const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));
    const cornice = p.disegno.cornice!;
    expect(cornice).toHaveLength(4);
    for (const b of p.bordi) expect(cornice.filter((c) => c.tipo === b.etichetta)).toHaveLength(b.quantitaPerTelaio);
    // Il traverso in alto: lato lungo = esterno, lato corto = esterno − 2×26
    const [a, b, c, d] = cornice[0]!.punti;
    expect(b!.x - a!.x).toBe(350);
    expect(c!.x - d!.x).toBe(350 - 52);
    // il taglio è a 45°: rientra di 26 in x mentre scende di 26 in y
    expect(d!.x - a!.x).toBe(d!.y - a!.y);
  });

  it('gli altri stili non hanno cornice disegnata né smussi', () => {
    const p = calcolaProgetto({ ...premium({}), stile: 'LONDRA', distribuzione: 'PASSO_FISSO' });
    expect(p.disegno.cornice).toBeUndefined();
    expect(p.disegno.barre.every((b) => b.smusso === undefined)).toBe(true);
  });

  it('minuteria: una giunzione per incrocio, un perno per foro di cornice, 4 giunzioni a L', () => {
    const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));
    const m = p.premium!.minuteria;
    expect(m.giunzioni).toBe(3);         // 1 × 3
    expect(m.perni).toBe(8);             // 2·1 + 2·3
    expect(m.giunzioniL).toBe(4);
    // un perno per ogni foro della cornice
    const fori = p.bordi.reduce((t, b) => t + b.fori!.length * b.quantitaPerTelaio, 0);
    expect(m.perni).toBe(fori);
    expect(m.pesoKg).toBeCloseTo(3 * 0.169 + 8 * 0.015 + 4 * 0.169, 9); // 1,303 kg
  });

  it('peso del telaio: inglesina + minuteria', () => {
    const p = calcolaProgetto(premium({ larghezza: 350, altezza: 700, nBarreVerticali: 1, nBarreOrizzontali: 3 }));
    const kgM = 0.304 / 3;
    const i = calcolaImballaggio(p, kgM);
    expect(i.pesoU).toBe(0);
    expect(i.pesoBarre).toBeCloseTo(p.metriBarra * kgM, 9);
    expect(i.pesoMinuteria).toBeCloseTo(1.303, 9);
    expect(i.pesoTelaio).toBeCloseTo(p.metriBarra * kgM + 1.303, 9);
  });

  it('il pannello finito è spesso quanto il profilo: 8 mm, e si impila', () => {
    const p = calcolaProgetto(premium({ quantita: 5 }));
    expect(p.spessorePannello).toBe(8);
    expect(calcolaImballaggio(p, null).ingombro.spessore).toBe(40);
  });
});
