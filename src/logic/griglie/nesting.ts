// src/logic/griglie/nesting.ts
//
// Piano di taglio da stecca commerciale (U da 4 m, barra da 3 m): quante stecche
// servono, quanto sfrido si fa, e cosa ricavare da ciascuna.
//
// Algoritmo: First-Fit Decreasing. Non è l'ottimo teorico — quello è un problema
// NP-hard — ma sui pezzi lunghi e pochi tipi di una griglia arriva a un pelo
// dall'ottimo, ed è prevedibile: chi sta alla sega vede i pezzi lunghi per primi.
//
// LA LAMA MANGIA: ogni taglio consuma il suo spessore (kerf). Su una stecca da
// cui ricavi dieci pezzi se ne vanno due centimetri in trucioli — ignorarli
// significa consegnare un piano di taglio che all'ultimo pezzo non torna.

export interface PezzoDaTagliare {
  etichetta: string;
  lunghezza: number;
  quantita: number;
}

export interface Stecca {
  tagli: { etichetta: string; lunghezza: number }[];
  usato: number;    // materiale nei pezzi (senza contare i trucioli)
  avanzo: number;   // quello che resta della stecca, trucioli già sottratti
}

/** Stecche con la STESSA sequenza di taglio, accorpate: alla sega interessa lo schema, non l'elenco. */
export interface GruppoStecche {
  tagli: { etichetta: string; lunghezza: number }[];
  avanzo: number;
  ripetizioni: number;
}

export interface PianoTaglio {
  stecche: Stecca[];
  gruppi: GruppoStecche[];
  nStecche: number;
  lunghezzaStecca: number;
  materialeUtile: number;   // somma dei pezzi
  materialeAcquistato: number;
  sfrido: number;
  sfridoPerc: number;
  nonRicavabili: PezzoDaTagliare[]; // pezzi più lunghi della stecca
}

export function pianificaTaglio(
  pezzi: PezzoDaTagliare[],
  lunghezzaStecca: number,
  kerf: number,
): PianoTaglio {
  const nonRicavabili = pezzi.filter((p) => p.lunghezza > lunghezzaStecca && p.quantita > 0);

  // Espandi e ordina dal più lungo: è il cuore del First-Fit Decreasing.
  const lista: { etichetta: string; lunghezza: number }[] = [];
  for (const p of pezzi) {
    if (p.lunghezza > lunghezzaStecca || p.lunghezza <= 0) continue;
    for (let i = 0; i < p.quantita; i++) lista.push({ etichetta: p.etichetta, lunghezza: p.lunghezza });
  }
  lista.sort((a, b) => b.lunghezza - a.lunghezza);

  const stecche: Stecca[] = [];

  for (const pezzo of lista) {
    // Il kerf si paga per SEPARARE un pezzo da quello dopo: l'ultimo pezzo di una
    // stecca può finire a filo, quindi il taglio si conta solo se resta materiale
    // da tagliare ancora. Modello: consumo = pezzi già messi (lunghezza + kerf),
    // e il nuovo pezzo deve starci per la sola lunghezza.
    let messo = false;
    for (const s of stecche) {
      const consumato = s.tagli.reduce((t, x) => t + x.lunghezza + kerf, 0);
      if (consumato + pezzo.lunghezza <= lunghezzaStecca + 1e-9) {
        s.tagli.push(pezzo);
        messo = true;
        break;
      }
    }
    if (!messo) stecche.push({ tagli: [pezzo], usato: 0, avanzo: 0 });
  }

  for (const s of stecche) {
    s.usato = s.tagli.reduce((t, x) => t + x.lunghezza, 0);
    const consumato = s.tagli.reduce((t, x) => t + x.lunghezza + kerf, 0);
    s.avanzo = Math.max(0, lunghezzaStecca - consumato);
  }

  // Accorpa le stecche con la stessa sequenza di tagli: su cento telai identici
  // il piano è una manciata di schemi ripetuti, non cento righe da leggere.
  const perFirma = new Map<string, GruppoStecche>();
  for (const s of stecche) {
    const firma = s.tagli.map((t) => `${t.etichetta}:${t.lunghezza}`).join('|');
    const g = perFirma.get(firma);
    if (g) g.ripetizioni++;
    else perFirma.set(firma, { tagli: s.tagli, avanzo: s.avanzo, ripetizioni: 1 });
  }
  const gruppi = [...perFirma.values()].sort((a, b) => b.ripetizioni - a.ripetizioni);

  const materialeUtile = lista.reduce((t, x) => t + x.lunghezza, 0);
  const materialeAcquistato = stecche.length * lunghezzaStecca;
  const sfrido = materialeAcquistato - materialeUtile;

  return {
    stecche,
    gruppi,
    nStecche: stecche.length,
    lunghezzaStecca,
    materialeUtile,
    materialeAcquistato,
    sfrido,
    sfridoPerc: materialeAcquistato > 0 ? (sfrido / materialeAcquistato) * 100 : 0,
    nonRicavabili,
  };
}
