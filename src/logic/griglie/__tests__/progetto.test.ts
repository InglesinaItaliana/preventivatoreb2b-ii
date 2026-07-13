import { describe, it, expect } from 'vitest';
import { calcolaProgetto, calcolaImballaggio, type ConfigGriglia } from '../progetto';
import { pianificaTaglio } from '../nesting';
import { BARRA, PROFILO_U } from '../materiali';

// Caso di riferimento, ricontrollabile a mano:
// pannello 1000 × 2000 (esterno), passo 100 × 200, gioco 1 mm, margine minimo 10.
//
//   luce in larghezza      = 1000 − 40  = 960
//   assi possibili         = da 39 a 961 → corsa 922 → 10 barre verticali a passo 100
//   span                   = 900 → centrato: assi a 50, 150, … 950
//   margine laterale       = (50 − 9) − 20 = 21 mm
//   testa della barra      = 1,5 (fondo canale) + 1 (gioco) = 2,5 dal filo esterno
//   barra verticale        = 2000 − 5 = 1995 mm
//   barra orizzontale      = 1000 − 5 =  995 mm
//   primo foro su verticale = 100 (primo asse orizzontale) − 2,5 = 97,5
const BASE: ConfigGriglia = {
  stile: 'LONDRA',
  larghezza: 1000,
  altezza: 2000,
  passoOrizzontale: 100,
  passoVerticale: 200,
  quantita: 1,
  gioco: 1,
  margineMinimo: 10,
};

describe('LONDRA — geometria', () => {
  const p = calcolaProgetto(BASE);

  it('la barra va a battuta sul fondo del canale, meno il gioco', () => {
    const verticale = p.barre.find((b) => b.etichetta === 'Barra verticale')!;
    const orizzontale = p.barre.find((b) => b.etichetta === 'Barra orizzontale')!;
    // ingombro − 2×(spessore U + gioco)
    expect(verticale.lunghezza).toBe(2000 - 2 * (1.5 + 1)); // 1995
    expect(orizzontale.lunghezza).toBe(1000 - 2 * (1.5 + 1)); // 995
  });

  it('quante barre entrano, e dove cadono gli assi', () => {
    expect(p.assiVerticali).toHaveLength(10);
    expect(p.assiOrizzontali).toHaveLength(10);
    expect(p.assiVerticali[0]).toBe(50);
    expect(p.assiVerticali[9]).toBe(950);
    expect(p.assiOrizzontali[0]).toBe(100);
    expect(p.assiOrizzontali[9]).toBe(1900);
  });

  it('la griglia è CENTRATA: il margine a sinistra è uguale a quello a destra', () => {
    const primo = p.assiVerticali[0]!;
    const ultimo = p.assiVerticali[p.assiVerticali.length - 1]!;
    const margineSx = primo - BARRA.larghezza / 2 - PROFILO_U.lato;
    const margineDx = BASE.larghezza - PROFILO_U.lato - (ultimo + BARRA.larghezza / 2);
    expect(margineSx).toBeCloseTo(margineDx, 9);
    expect(margineSx).toBe(21);
  });

  it('nessuna barra sborda dalla luce, e il margine minimo è rispettato', () => {
    for (const x of p.assiVerticali) {
      expect(x - BARRA.larghezza / 2).toBeGreaterThanOrEqual(PROFILO_U.lato + BASE.margineMinimo);
      expect(x + BARRA.larghezza / 2).toBeLessThanOrEqual(BASE.larghezza - PROFILO_U.lato - BASE.margineMinimo);
    }
    for (const y of p.assiOrizzontali) {
      expect(y - BARRA.larghezza / 2).toBeGreaterThanOrEqual(PROFILO_U.lato + BASE.margineMinimo);
      expect(y + BARRA.larghezza / 2).toBeLessThanOrEqual(BASE.altezza - PROFILO_U.lato - BASE.margineMinimo);
    }
  });

  it('i fori cadono sugli incroci, misurati dalla testa della barra', () => {
    const verticale = p.barre.find((b) => b.etichetta === 'Barra verticale')!;
    expect(verticale.primoForo).toBe(97.5);        // asse 100 − testa 2,5
    expect(verticale.interasse).toBe(200);
    expect(verticale.nFori).toBe(10);
    expect(verticale.posizioni[0]).toBe(97.5);
    expect(verticale.posizioni[9]).toBe(1897.5);
  });

  it('i fori sono equidistanti: fra il primo e il secondo c\'è lo stesso passo che fra tutti gli altri', () => {
    for (const barra of p.barre) {
      for (let i = 1; i < barra.posizioni.length; i++) {
        expect(barra.posizioni[i]! - barra.posizioni[i - 1]!).toBeCloseTo(barra.interasse, 9);
      }
    }
  });

  it('la foratura è simmetrica: il primo foro dista dalla testa quanto l\'ultimo dalla coda', () => {
    for (const barra of p.barre) {
      const ultimo = barra.posizioni[barra.posizioni.length - 1]!;
      expect(barra.lunghezza - ultimo).toBeCloseTo(barra.primoForo, 9);
    }
  });

  it('nessun foro cade fuori dalla barra', () => {
    for (const barra of p.barre) {
      for (const pos of barra.posizioni) {
        expect(pos).toBeGreaterThan(0);
        expect(pos).toBeLessThan(barra.lunghezza);
      }
    }
  });

  it('un rivetto per incrocio', () => {
    expect(p.nRivetti).toBe(10 * 10);
  });

  it('il telaio è quattro pezzi a 45°, lunghi quanto l\'ingombro esterno', () => {
    expect(p.bordi).toHaveLength(2);
    expect(p.bordi[0]!.lunghezza).toBe(1000);
    expect(p.bordi[0]!.quantitaPerTelaio).toBe(2);
    expect(p.bordi[1]!.lunghezza).toBe(2000);
    expect(p.bordi[1]!.quantitaPerTelaio).toBe(2);
  });

  it('nessun avviso su un pannello sano', () => {
    expect(p.avvisi).toEqual([]);
  });
});

describe('LONDRA — casi che salvano materiale', () => {
  it('passo enorme: resta la sola barra centrale, ed è geometricamente corretto', () => {
    const p = calcolaProgetto({ ...BASE, passoOrizzontale: 2000, passoVerticale: 3000 });
    expect(p.assiVerticali).toEqual([500]);   // centrata sul pannello
    expect(p.assiOrizzontali).toEqual([1000]);
    expect(p.nRivetti).toBe(1);
    expect(p.avvisi).toEqual([]);
  });

  it('pannello troppo piccolo perché una barra ci stia: nessuna barra, e lo dice', () => {
    // luce 30 mm: tolti i 10+10 di margine minimo restano 10 mm per una barra da 18.
    const vuoto = calcolaProgetto({ ...BASE, larghezza: 70, altezza: 70, passoOrizzontale: 50, passoVerticale: 50 });
    expect(vuoto.assiVerticali).toHaveLength(0);
    expect(vuoto.nRivetti).toBe(0);
    expect(vuoto.avvisi.join(' ')).toContain('nessuna barra');
  });

  it('barra più lunga della stecca commerciale: avvisa invece di far tagliare un pezzo che non esiste', () => {
    const p = calcolaProgetto({ ...BASE, altezza: 3200 });
    expect(p.avvisi.join(' ')).toContain('stecca commerciale');
  });

  it('lato del telaio più lungo della stecca di profilo', () => {
    const p = calcolaProgetto({ ...BASE, larghezza: 4200, altezza: 2000 });
    expect(p.avvisi.join(' ')).toContain('profilo a U');
  });
});

describe('nesting — piano di taglio dalla stecca', () => {
  it('non riempie una stecca oltre la sua lunghezza, trucioli inclusi', () => {
    const piano = pianificaTaglio(
      [{ etichetta: 'barra', lunghezza: 995, quantita: 10 }],
      3000,
      2,
    );
    for (const s of piano.stecche) {
      const consumato = s.tagli.reduce((t, x) => t + x.lunghezza + 2, 0);
      expect(consumato).toBeLessThanOrEqual(3000 + 1e-9);
    }
    // 995 × 3 = 2985, più due tagli (4 mm) = 2989 → tre pezzi per stecca
    expect(piano.stecche[0]!.tagli).toHaveLength(3);
    expect(piano.nStecche).toBe(4); // 10 pezzi → 3+3+3+1
  });

  it('non perde né inventa pezzi', () => {
    const piano = pianificaTaglio(
      [
        { etichetta: 'verticale', lunghezza: 1995, quantita: 10 },
        { etichetta: 'orizzontale', lunghezza: 995, quantita: 10 },
      ],
      3000, 2,
    );
    const tagliati = piano.stecche.flatMap((s) => s.tagli);
    expect(tagliati).toHaveLength(20);
    expect(piano.materialeUtile).toBe(10 * 1995 + 10 * 995);
  });

  it('sfrido = materiale comprato − materiale nei pezzi', () => {
    const piano = pianificaTaglio([{ etichetta: 'x', lunghezza: 1000, quantita: 3 }], 3000, 2);
    // 1000×3 = 3000, ma due tagli da 2 mm non ci stanno → 2 pezzi + 1
    expect(piano.materialeAcquistato).toBe(piano.nStecche * 3000);
    expect(piano.sfrido).toBe(piano.materialeAcquistato - piano.materialeUtile);
  });

  it('un pezzo più lungo della stecca non viene tagliato di nascosto: viene segnalato', () => {
    const piano = pianificaTaglio([{ etichetta: 'enorme', lunghezza: 3500, quantita: 2 }], 3000, 2);
    expect(piano.nonRicavabili).toHaveLength(1);
    expect(piano.nStecche).toBe(0);
  });
});

describe('imballaggio', () => {
  it('peso e ingombro scalano col numero di telai', () => {
    const p = calcolaProgetto({ ...BASE, quantita: 5 });
    const i = calcolaImballaggio(p, 0.39);

    // perimetro = 2×(1000+2000) = 6000 mm = 6 m × 0,300 kg/m = 1,8 kg
    expect(i.pesoU).toBeCloseTo(1.8, 9);
    expect(i.pesoTelaio).toBeCloseTo(1.8 + p.metriBarra * 0.39, 9);
    expect(i.pesoTotale).toBeCloseTo(i.pesoTelaio! * 5, 9);
    expect(i.ingombro.spessore).toBe(20 * 5); // i pannelli si impilano
  });

  it('senza il peso della barra non inventa un totale', () => {
    const i = calcolaImballaggio(calcolaProgetto(BASE), null);
    expect(i.pesoBarre).toBeNull();
    expect(i.pesoTotale).toBeNull();
    expect(i.pesoU).toBeGreaterThan(0); // quello del telaio lo sappiamo comunque
  });
});
