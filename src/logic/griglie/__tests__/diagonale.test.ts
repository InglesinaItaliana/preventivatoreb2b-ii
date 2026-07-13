import { describe, it, expect } from 'vitest';
import { calcolaProgetto, type ConfigGriglia } from '../progetto';
import { BARRA, FONDO_CANALE } from '../materiali';

const BASE: ConfigGriglia = {
  stile: 'MILANO',
  distribuzione: 'PASSO_FISSO',
  larghezza: 1000,
  altezza: 1600,
  passoOrizzontale: 200,   // diagonale del rombo
  passoVerticale: 200,
  quantita: 1,
  gioco: 1,
  margineMinimo: 10,
  conBordo: true,
  lunghezzaMinima: 0,
  famigliaAVista: 'A',
};

/**
 * Il vincolo fisico che conta: NESSUN punto della barra — spigoli compresi — può
 * superare il fondo del canale, altrimenti il pannello non si chiude.
 * Le barre sono tagliate a 90°, quindi gli spigoli sporgono lateralmente
 * rispetto all'asse: è proprio lì che si annida l'errore.
 */
function spigoli(b: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (BARRA.larghezza / 2);
  const ny = (dx / len) * (BARRA.larghezza / 2);
  return [
    { x: b.x1 + nx, y: b.y1 + ny }, { x: b.x2 + nx, y: b.y2 + ny },
    { x: b.x2 - nx, y: b.y2 - ny }, { x: b.x1 - nx, y: b.y1 - ny },
  ];
}

describe('MILANO — il taglio a 90° su barra inclinata', () => {
  const p = calcolaProgetto(BASE);
  const fondo = FONDO_CANALE + BASE.gioco; // 2,5 mm dal filo esterno

  it('nessuno spigolo di nessuna barra supera il fondo del canale', () => {
    expect(p.disegno.barre.length).toBeGreaterThan(0);
    for (const b of p.disegno.barre) {
      for (const s of spigoli(b)) {
        expect(s.x).toBeGreaterThanOrEqual(fondo - 1e-6);
        expect(s.x).toBeLessThanOrEqual(BASE.larghezza - fondo + 1e-6);
        expect(s.y).toBeGreaterThanOrEqual(fondo - 1e-6);
        expect(s.y).toBeLessThanOrEqual(BASE.altezza - fondo + 1e-6);
      }
    }
  });

  it('e almeno una barra ci arriva davvero: non stiamo tagliando corto per prudenza', () => {
    const tocca = p.disegno.barre.some((b) =>
      spigoli(b).some((s) => Math.abs(s.x - fondo) < 0.01 || Math.abs(s.y - fondo) < 0.01
        || Math.abs(s.x - (BASE.larghezza - fondo)) < 0.01 || Math.abs(s.y - (BASE.altezza - fondo)) < 0.01),
    );
    expect(tocca).toBe(true);
  });

  it('l\'asse si ferma 6,36 mm prima del fondo: è l\'anticipo dello spigolo a 45°', () => {
    // 9 · sin(45°) = 6,364
    const anticipo = (BARRA.larghezza / 2) * Math.SQRT1_2;
    expect(anticipo).toBeCloseTo(6.364, 3);

    const minX = Math.min(...p.disegno.barre.flatMap((b) => [b.x1, b.x2]));
    expect(minX).toBeGreaterThanOrEqual(fondo + anticipo - 1e-6);
  });

  it('le barre sono a 45°', () => {
    for (const b of p.disegno.barre) {
      const ang = Math.abs((Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180) / Math.PI);
      expect([45, 135]).toContain(Math.round(ang));
    }
  });
});

describe('MILANO — foratura', () => {
  const p = calcolaProgetto(BASE);

  it('i fori sono equidistanti lungo ogni barra', () => {
    for (const b of p.barre) {
      for (let i = 1; i < b.posizioni.length; i++) {
        expect(b.posizioni[i]! - b.posizioni[i - 1]!).toBeCloseTo(b.interasse, 6);
      }
    }
  });

  it('nessun foro cade fuori dalla barra', () => {
    for (const b of p.barre) {
      for (const pos of b.posizioni) {
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThanOrEqual(b.lunghezza + 1e-6);
      }
    }
  });

  it('l\'interasse dei fori è Δ·√2/2, non il passo', () => {
    // Lungo una barra a 45°, gli incroci con l'altra famiglia distano Δ/√2.
    const atteso = (BASE.passoOrizzontale * Math.SQRT2) / 2;
    for (const b of p.barre) expect(b.interasse).toBeCloseTo(atteso, 6);
    expect(atteso).not.toBeCloseTo(BASE.passoOrizzontale, 1);
  });

  it('con misure "fortunate" tutte le barre sono simmetriche', () => {
    // 1000 × 1600, rombo 200: la differenza fra i lati (600) è un multiplo esatto
    // della diagonale del rombo, e questo rende simmetriche anche le barre
    // d'angolo. È una coincidenza delle misure, non una proprietà della griglia.
    for (const b of p.barre.filter((x) => x.nFori > 0)) {
      expect(b.primoForo).toBeCloseTo(b.codaForo, 3);
    }
  });

  it('basta cambiare l\'altezza e le barre d\'angolo diventano ASIMMETRICHE', () => {
    // 1000 × 1550: la differenza (550) non è multipla di 200 → il primo foro non
    // dista dalla testa quanto l'ultimo dalla coda. La testa va dichiarata.
    const s = calcolaProgetto({ ...BASE, altezza: 1550 });
    const asimmetriche = s.barre.filter((b) => Math.abs(b.primoForo - b.codaForo) > 0.05);
    expect(asimmetriche.length).toBeGreaterThan(0);
  });

  it('le barre speculari sono lo stesso pezzo girato: un tipo solo', () => {
    // Una barra coi fori a 94/129 e la sua speculare a 129/94 sono lo stesso pezzo
    // montato al contrario: normalizzando il verso restano un tipo solo.
    const s = calcolaProgetto({ ...BASE, altezza: 1550 });
    const totale = s.barre.reduce((t, b) => t + b.quantitaPerTelaio, 0);
    expect(totale).toBe(s.disegno.barre.length);
  });

  it('col telaio, una barra senza incroci si TIENE: le teste sono nel canale', () => {
    // Correzione a una regola che avevo sbagliato: se una barra ha un foro ha un
    // aggancio, e col telaio anche una senza fori è trattenuta dal canale della U.
    // L'unico caso impossibile è la griglia nuda con zero incroci.
    const nuda = calcolaProgetto({ ...BASE, conBordo: false });
    for (const b of nuda.barre) expect(b.nFori).toBeGreaterThanOrEqual(1);
  });
});

describe('MILANO — distinta e rivetti', () => {
  const p = calcolaProgetto(BASE);

  it('le barre sono raggruppate per schema, e le quantità tornano', () => {
    const totale = p.barre.reduce((t, b) => t + b.quantitaPerTelaio, 0);
    expect(totale).toBe(p.disegno.barre.length);
    expect(p.barre.length).toBeLessThan(p.disegno.barre.length); // la simmetria accorpa
  });

  it('un rivetto solo dove due barre si incrociano davvero', () => {
    expect(p.nRivetti).toBe(p.disegno.rivetti.length);
    expect(p.nRivetti).toBeGreaterThan(0);
    // Ogni rivetto sta dentro la luce del pannello
    for (const r of p.disegno.rivetti) {
      expect(r.x).toBeGreaterThan(0);
      expect(r.x).toBeLessThan(BASE.larghezza);
    }
  });

  it('il disegno è simmetrico rispetto al centro del pannello', () => {
    const chiave = (x: number, y: number) => `${Math.round(x * 10)}|${Math.round(y * 10)}`;
    const rivetti = new Set(p.disegno.rivetti.map((r) => chiave(r.x, r.y)));
    for (const r of p.disegno.rivetti) {
      const specchio = chiave(BASE.larghezza - r.x, BASE.altezza - r.y);
      expect(rivetti.has(specchio), `manca il rivetto speculare di ${r.x},${r.y}`).toBe(true);
    }
  });

  it('il telaio resta quello di sempre: quattro pezzi a 45°', () => {
    expect(p.bordi).toHaveLength(2);
    expect(p.bordi[0]!.lunghezza).toBe(1000);
  });
});

describe('VENEZIA — stesso reticolo, rombi allungati', () => {
  const v = calcolaProgetto({ ...BASE, stile: 'VENEZIA' });

  it('le barre stanno a ~63,4°: l\'asse verticale del rombo è il doppio', () => {
    for (const b of v.disegno.barre) {
      const ang = Math.abs((Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180) / Math.PI);
      const acuto = ang > 90 ? 180 - ang : ang;
      expect(acuto).toBeCloseTo(63.435, 1); // atan(2)
    }
  });

  it('lo spigolo anticipa di più contro i lati verticali che contro quelli orizzontali', () => {
    // 9·r/√(1+r²) = 8,05 contro i montanti · 9/√(1+r²) = 4,02 contro traverse
    const sx = (BARRA.larghezza / 2) * 2 / Math.sqrt(5);
    const sy = (BARRA.larghezza / 2) / Math.sqrt(5);
    expect(sx).toBeCloseTo(8.05, 2);
    expect(sy).toBeCloseTo(4.02, 2);
    expect(sx).toBeGreaterThan(sy);
  });

  it('e nessuno spigolo supera comunque il fondo del canale', () => {
    const fondo = FONDO_CANALE + BASE.gioco;
    for (const b of v.disegno.barre) {
      for (const s of spigoli(b)) {
        expect(s.x).toBeGreaterThanOrEqual(fondo - 1e-6);
        expect(s.x).toBeLessThanOrEqual(BASE.larghezza - fondo + 1e-6);
        expect(s.y).toBeGreaterThanOrEqual(fondo - 1e-6);
        expect(s.y).toBeLessThanOrEqual(BASE.altezza - fondo + 1e-6);
      }
    }
  });
});

describe('rombi — nessun foro orfano', () => {
  // L'INVARIANTE che regge tutto: ogni rivetto unisce esattamente due barre,
  // quindi la somma di TUTTI i fori deve fare esattamente il DOPPIO dei rivetti.
  // Se non torna, da qualche parte c'è un foro senza partner sotto — un buco nel
  // vuoto che l'officina farebbe e che indebolisce la barra per niente.
  const foriTotali = (p: ReturnType<typeof calcolaProgetto>) =>
    p.barre.reduce((t, b) => t + b.nFori * b.quantitaPerTelaio, 0);

  it('col telaio, di serie: nessuno scarto e nessun orfano', () => {
    const p = calcolaProgetto(BASE);
    expect(p.barreScartate).toBe(0);          // col telaio le teste sono nel canale: si tiene tutto
    expect(foriTotali(p)).toBe(2 * p.nRivetti);
  });

  it('con il filtro estetico acceso, i fori delle barre tolte spariscono dai compagni', () => {
    const p = calcolaProgetto({ ...BASE, lunghezzaMinima: 500 });
    expect(p.barreScartate).toBeGreaterThan(0);
    expect(foriTotali(p)).toBe(2 * p.nRivetti);
  });

  it('griglia nuda: si scarta solo l\'impossibile, e neanche lì restano orfani', () => {
    const p = calcolaProgetto({ ...BASE, conBordo: false });
    expect(foriTotali(p)).toBe(2 * p.nRivetti);
    for (const b of p.barre) expect(b.nFori).toBeGreaterThanOrEqual(1); // senza telaio, zero incroci = cade
  });

  it('anche su Venezia, e con misure sfortunate', () => {
    for (const cfg of [
      { ...BASE, stile: 'VENEZIA' as const },
      { ...BASE, altezza: 1550 },
      { ...BASE, stile: 'VENEZIA' as const, altezza: 1330, passoOrizzontale: 150 },
      { ...BASE, conBordo: false, lunghezzaMinima: 300 },
    ]) {
      const p = calcolaProgetto(cfg);
      expect(foriTotali(p), JSON.stringify({ h: cfg.altezza, s: cfg.stile })).toBe(2 * p.nRivetti);
    }
  });

  it('i fori restano equidistanti anche dopo aver tolto gli orfani', () => {
    const p = calcolaProgetto({ ...BASE, lunghezzaMinima: 500 });
    for (const b of p.barre) {
      for (let i = 1; i < b.posizioni.length; i++) {
        expect(b.posizioni[i]! - b.posizioni[i - 1]!).toBeCloseTo(b.interasse, 6);
      }
    }
  });
});

describe('foratura: i pezzi si tagliano identici, si forano in due modi', () => {
  // Le due famiglie di diagonali sono l'una l'IMMAGINE SPECULARE dell'altra (lo
  // specchio verticale del pannello manda la A nella B, e il reticolo è ancorato
  // al centro). Ne segue una proprietà forte: ogni forma esce in quantità PARI e
  // si divide ESATTAMENTE a metà fra i due strati. Non è una coincidenza delle
  // misure — è una simmetria. Per questo la foratura non separa i pezzi in
  // distinta: si tagliano uguali, e solo dopo metà vanno passanti e metà ciechi.

  it('ogni forma esce in quantità PARI, divisa esattamente a metà', () => {
    for (const cfg of [
      BASE,
      { ...BASE, altezza: 1550 },
      { ...BASE, stile: 'VENEZIA' as const },
      { ...BASE, conBordo: false },
      { ...BASE, passoOrizzontale: 150, altezza: 1330 },
    ]) {
      const p = calcolaProgetto(cfg);
      for (const b of p.barre) {
        expect(b.quantitaPerTelaio % 2, `${b.etichetta} ha quantità dispari`).toBe(0);
        expect(b.quantitaCieca).toBe(b.quantitaPassante);
        expect(b.quantitaCieca + b.quantitaPassante).toBe(b.quantitaPerTelaio);
      }
    }
  });

  it('cambiando lo strato a vista, i totali si scambiano', () => {
    const a = calcolaProgetto(BASE);
    const b = calcolaProgetto({ ...BASE, famigliaAVista: 'B' });
    const somma = (p: typeof a, k: 'quantitaCieca' | 'quantitaPassante') =>
      p.barre.reduce((t, x) => t + x[k], 0);

    // Essendo 50/50 per simmetria, invertire lo strato non cambia i totali...
    expect(somma(a, 'quantitaCieca')).toBe(somma(b, 'quantitaCieca'));
    // ...ma cambia QUALI barre vanno cieche: il disegno mette l'altra famiglia sopra.
    expect(a.disegno.barre[a.disegno.barre.length - 1]!.famiglia)
      .not.toBe(b.disegno.barre[b.disegno.barre.length - 1]!.famiglia);
  });

  it('a parità di lunghezza esiste UN SOLO tipo: il taglio non si sdoppia', () => {
    const p = calcolaProgetto({ ...BASE, altezza: 1550 });
    const perLunghezza = new Map<number, number>();
    for (const b of p.barre) {
      const k = Math.round(b.lunghezza * 10);
      perLunghezza.set(k, (perLunghezza.get(k) ?? 0) + 1);
    }
    for (const [, n] of perLunghezza) expect(n).toBe(1);
  });
});

describe('rombi — casi che salvano materiale', () => {
  it('senza telaio, le barre senza incroci non finiscono in distinta: cadrebbero', () => {
    const p = calcolaProgetto({ ...BASE, conBordo: false, lunghezzaMinima: 0 });
    for (const b of p.barre) expect(b.nFori).toBeGreaterThanOrEqual(1);
  });

  it('gli scarti vengono CONTATI, non nascosti', () => {
    // Non è più un avviso (faceva rumore), ma il numero resta esposto: una barra
    // che sparisce dalla distinta senza che nessuno lo dica è un guaio in officina.
    const p = calcolaProgetto({ ...BASE, lunghezzaMinima: 400 });
    expect(p.barreScartate).toBeGreaterThan(0);

    const totale = p.barre.reduce((t, b) => t + b.quantitaPerTelaio, 0);
    expect(totale).toBe(p.disegno.barre.length); // e quelle rimaste tornano tutte
  });

  it('passo più stretto della barra: avvisa invece di produrre una griglia impossibile', () => {
    const p = calcolaProgetto({ ...BASE, passoOrizzontale: 20 });
    expect(p.avvisi.join(' ')).toContain('si sovrappongono');
  });

  it('griglia nuda: le barre arrivano al filo del pannello', () => {
    const p = calcolaProgetto({ ...BASE, conBordo: false });
    expect(p.bordi).toEqual([]);
    for (const b of p.disegno.barre) {
      for (const s of spigoli(b)) {
        expect(s.x).toBeGreaterThanOrEqual(-1e-6);
        expect(s.x).toBeLessThanOrEqual(BASE.larghezza + 1e-6);
      }
    }
  });

  it('un pannello sano non produce nessun avviso', () => {
    expect(calcolaProgetto(BASE).avvisi).toEqual([]);
  });
});
