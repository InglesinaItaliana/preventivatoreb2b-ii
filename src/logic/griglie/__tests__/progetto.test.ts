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
  distribuzione: 'PASSO_FISSO',
  larghezza: 1000,
  altezza: 2000,
  passoOrizzontale: 100,
  passoVerticale: 200,
  quantita: 1,
  gioco: 1,
  margineMinimo: 10,
  conBordo: true,
  lunghezzaMinima: 80,
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

describe('LONDRA — distribuzione a SPAZI UGUALI', () => {
  // Stesso pannello di prima (luce 960), passo CHIESTO 100.
  //
  // Il passo è un desiderata: si sceglie il numero di barre che produce
  // l'interasse più vicino a quello chiesto.
  //    9 barre → vuoto (960 − 162)/10 = 79,8  → interasse 97,8  (scarto 2,2)
  //   10 barre → vuoto (960 − 180)/11 = 70,9  → interasse 88,9  (scarto 11,1)
  // Vincono le 9: la griglia regolare più vicina a quello che hai chiesto.
  const p = calcolaProgetto({ ...BASE, distribuzione: 'SPAZI_UGUALI' });

  /** I vuoti VISTI: bordo→prima barra, poi fra barra e barra, poi ultima barra→bordo. */
  const vuotiVisti = (assi: number[], ingombro: number, latoTelaio: number) => {
    const mezza = BARRA.larghezza / 2;
    const vuoti = [assi[0]! - mezza - latoTelaio];
    for (let i = 1; i < assi.length; i++) vuoti.push((assi[i]! - mezza) - (assi[i - 1]! + mezza));
    vuoti.push((ingombro - latoTelaio) - (assi[assi.length - 1]! + mezza));
    return vuoti;
  };

  it('TUTTI i vuoti sono identici, quello contro il bordo compreso', () => {
    const vuoti = vuotiVisti(p.assiVerticali, BASE.larghezza, PROFILO_U.lato);
    expect(p.assiVerticali).toHaveLength(9);
    expect(vuoti).toHaveLength(10); // 9 barre → 10 vuoti
    for (const v of vuoti) expect(v).toBeCloseTo(vuoti[0]!, 9);
    expect(vuoti[0]).toBeCloseTo((960 - 9 * 18) / 10, 9); // 79,8
  });

  it('vale anche in verticale', () => {
    const vuoti = vuotiVisti(p.assiOrizzontali, BASE.altezza, PROFILO_U.lato);
    for (const v of vuoti) expect(v).toBeCloseTo(vuoti[0]!, 9);
  });

  it('l\'interasse è una CONSEGUENZA, e insegue il passo chiesto invece di subirlo', () => {
    expect(p.vuotoX).toBeCloseTo(79.8, 9);
    expect(p.passoEffettivoX).toBeCloseTo(97.8, 9);   // vuoto + larghezza barra
    expect(p.passoEffettivoX).not.toBe(BASE.passoOrizzontale); // i 100 chiesti non sono ottenibili a vuoti uguali
    expect(p.vuotoX + BARRA.larghezza).toBeCloseTo(p.passoEffettivoX, 9);

    // Ed è la scelta MIGLIORE: 10 barre darebbero 88,9, molto più lontano da 100.
    const dieci = calcolaProgetto({ ...BASE, distribuzione: 'SPAZI_UGUALI', nBarreVerticali: 10 });
    expect(Math.abs(p.passoEffettivoX - 100)).toBeLessThan(Math.abs(dieci.passoEffettivoX - 100));
  });

  it('i fori usano il passo EFFETTIVO, non quello digitato col cursore', () => {
    const verticale = p.barre.find((b) => b.etichetta === 'Barra verticale')!;
    expect(verticale.interasse).toBeCloseTo(p.passoEffettivoY, 9);
    expect(verticale.interasse).not.toBe(BASE.passoVerticale);
    for (let i = 1; i < verticale.posizioni.length; i++) {
      expect(verticale.posizioni[i]! - verticale.posizioni[i - 1]!).toBeCloseTo(verticale.interasse, 9);
    }
  });

  it('a differenza del passo fisso, dove il vuoto sul bordo è diverso da quelli interni', () => {
    const fisso = calcolaProgetto(BASE);
    const vuoti = vuotiVisti(fisso.assiVerticali, BASE.larghezza, PROFILO_U.lato);
    expect(vuoti[0]).toBe(21);   // contro il telaio
    expect(vuoti[1]).toBe(82);   // fra due barre
    expect(vuoti[0]).not.toBe(vuoti[1]);
  });

  it('resta simmetrico e dentro la luce', () => {
    for (const x of p.assiVerticali) {
      expect(x - BARRA.larghezza / 2).toBeGreaterThanOrEqual(PROFILO_U.lato - 1e-9);
      expect(x + BARRA.larghezza / 2).toBeLessThanOrEqual(BASE.larghezza - PROFILO_U.lato + 1e-9);
    }
  });

  it('il numero di barre si può forzare a mano', () => {
    const forzato = calcolaProgetto({ ...BASE, distribuzione: 'SPAZI_UGUALI', nBarreVerticali: 4 });
    expect(forzato.assiVerticali).toHaveLength(4);
    const vuoti = vuotiVisti(forzato.assiVerticali, BASE.larghezza, PROFILO_U.lato);
    for (const v of vuoti) expect(v).toBeCloseTo(vuoti[0]!, 9);
  });

  it('il vuoto minimo è rispettato: non si stipano barre fino a toccarsi', () => {
    const fitto = calcolaProgetto({ ...BASE, distribuzione: 'SPAZI_UGUALI', passoOrizzontale: 20, margineMinimo: 30 });
    expect(fitto.vuotoX).toBeGreaterThanOrEqual(30 - 1e-9);
  });

  it('griglia nuda: i vuoti uguali si misurano dal filo del pannello, e le teste sporgono', () => {
    const nuda = calcolaProgetto({ ...BASE, distribuzione: 'SPAZI_UGUALI', conBordo: false });
    const vuoti = vuotiVisti(nuda.assiVerticali, BASE.larghezza, 0);
    for (const v of vuoti) expect(v).toBeCloseTo(vuoti[0]!, 9);
    // Le barre restano lunghe quanto l'ingombro: le teste sporgono oltre
    // l'ultima barra incrociata, come d'uso nelle griglie da giardino.
    const o = nuda.barre.find((b) => b.etichetta === 'Barra orizzontale')!;
    expect(o.lunghezza).toBe(1000);
    expect(nuda.assiVerticali[0]! - BARRA.larghezza / 2).toBeGreaterThan(0);
  });
});

describe('LONDRA — griglia nuda (senza bordo perimetrale)', () => {
  const nuda = calcolaProgetto({ ...BASE, conBordo: false, margineMinimo: 0 });

  it('niente telaio in distinta, e niente profilo da comprare', () => {
    expect(nuda.bordi).toEqual([]);
    expect(nuda.metriU).toBe(0);
    expect(nuda.latoTelaio).toBe(0);
  });

  it('senza canale non c\'è rientro: la barra vale l\'ingombro pieno', () => {
    expect(nuda.testa).toBe(0);
    const v = nuda.barre.find((b) => b.etichetta === 'Barra verticale')!;
    const o = nuda.barre.find((b) => b.etichetta === 'Barra orizzontale')!;
    expect(v.lunghezza).toBe(2000);
    expect(o.lunghezza).toBe(1000);
  });

  it('la luce è tutto il pannello, non solo quello che il telaio lascia scoperto', () => {
    const conTelaio = calcolaProgetto({ ...BASE, margineMinimo: 0 });
    expect(nuda.luceX).toBe(1000);      // tutto l'ingombro
    expect(conTelaio.luceX).toBe(960);  // meno i due lati da 20 della U
  });

  it('i 40 mm di luce in più producono barre in più, quando il passo ce le fa entrare', () => {
    // Col passo 100 i 40 mm avanzati non bastano per un\'altra barra: 10 e 10.
    // Col passo 50 sì — ed è la prova che la luce è davvero cresciuta.
    const nuda50 = calcolaProgetto({ ...BASE, conBordo: false, margineMinimo: 0, passoOrizzontale: 50 });
    const telaio50 = calcolaProgetto({ ...BASE, margineMinimo: 0, passoOrizzontale: 50 });
    expect(nuda50.assiVerticali.length).toBeGreaterThan(telaio50.assiVerticali.length);
  });

  it('il pannello è spesso due barre sovrapposte, non quanto la U', () => {
    expect(nuda.spessorePannello).toBe(16);
    expect(calcolaProgetto(BASE).spessorePannello).toBe(20);
    expect(calcolaImballaggio(nuda, 0.39).ingombro.spessore).toBe(16);
  });

  it('i fori partono dal filo del pannello, non dal fondo di un canale che non c\'è', () => {
    const v = nuda.barre.find((b) => b.etichetta === 'Barra verticale')!;
    expect(v.primoForo).toBe(nuda.assiOrizzontali[0]);
  });
});

describe('nesting — stecche accorpate per schema', () => {
  it('cento pezzi identici non diventano cento righe da leggere', () => {
    const piano = pianificaTaglio([{ etichetta: 'barra', lunghezza: 995, quantita: 30 }], 3000, 2);
    // 10 stecche da 3 pezzi ciascuna → un solo schema, ripetuto 10 volte
    expect(piano.nStecche).toBe(10);
    expect(piano.gruppi).toHaveLength(1);
    expect(piano.gruppi[0]!.ripetizioni).toBe(10);
    expect(piano.gruppi[0]!.tagli).toHaveLength(3);
  });

  it('gli schemi diversi restano distinti, e le ripetizioni tornano', () => {
    const piano = pianificaTaglio(
      [
        { etichetta: 'lunga', lunghezza: 1995, quantita: 4 },
        { etichetta: 'corta', lunghezza: 995, quantita: 4 },
      ],
      3000, 2,
    );
    const totale = piano.gruppi.reduce((t, g) => t + g.ripetizioni, 0);
    expect(totale).toBe(piano.nStecche);
    const pezziNeiGruppi = piano.gruppi.reduce((t, g) => t + g.tagli.length * g.ripetizioni, 0);
    expect(pezziNeiGruppi).toBe(8);
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
