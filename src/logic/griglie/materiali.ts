// src/logic/griglie/materiali.ts
//
// I materiali dei pannelli-griglia da giardino. Tutto in MILLIMETRI: l'officina
// taglia in mm, l'interfaccia mostra i cm. La conversione avviene ai bordi, mai
// nei calcoli.

/** Profilo a U del telaio: 20×20 mm, spessore 1,5 mm, stecche da 4 m. */
export const PROFILO_U = {
  lato: 20,
  spessore: 1.5,
  stecca: 4000,
  pesoKgM: 0.300,
} as const;

/** Barra piatta della griglia: 18 mm di larghezza, 8 mm di spessore, stecche da 3 m. */
export const BARRA = {
  larghezza: 18,
  spessore: 8,
  stecca: 3000,
} as const;

/**
 * Larghezza interna del canale della U: 17 mm.
 * Ci entrano DUE barre sovrapposte (8 + 8 = 16 mm) con 1 mm di gioco — il
 * profilo è dimensionato apposta per ricevere la maglia già rivettata.
 */
export const CANALE_INTERNO = PROFILO_U.lato - 2 * PROFILO_U.spessore; // 17

/**
 * Distanza fra il filo esterno del pannello e il fondo del canale: 1,5 mm.
 * È il punto in cui la barra va a battuta, e quindi la quota da cui si ricava
 * la lunghezza di taglio.
 */
export const FONDO_CANALE = PROFILO_U.spessore; // 1.5

/** Profondità utile del canale: quanto può entrare una barra. */
export const PROFONDITA_CANALE = PROFILO_U.lato - PROFILO_U.spessore; // 18.5

/** Spessore del pannello finito = profondità del telaio. Serve per gli ingombri. */
export const SPESSORE_PANNELLO = PROFILO_U.lato; // 20

export const DEFAULT_GIOCO = 1;          // mm per lato, infilaggio barra nel canale
export const DEFAULT_KERF = 2;           // mm, spessore della lama
export const DEFAULT_MARGINE_MINIMO = 10; // mm fra il filo interno della cornice e il bordo dell'ultima barra
