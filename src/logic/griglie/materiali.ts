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

/**
 * Barra della griglia: 18 mm di larghezza, 8 mm di spessore, stecche da 3 m.
 *
 * 85 g/m: è un peso da profilo CAVO. Un pieno 18×8 in alluminio ne peserebbe ~390,
 * in acciaio oltre 1100 — quindi la sezione utile è di una trentina di mm², cioè
 * un tubolare a parete sottile. Per la geometria non cambia nulla (gli 8 mm sono
 * l'ingombro in profondità, ed è quello che conta per il canale): cambia solo il
 * peso. Il valore è modificabile nei parametri d'officina.
 */
export const BARRA = {
  larghezza: 18,
  spessore: 8,
  stecca: 3000,
  pesoKgM: 0.085,
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

/**
 * Filtro ESTETICO facoltativo: sotto questa lunghezza la barretta d'angolo di una
 * griglia a rombi si omette. Di serie 0, cioè si tiene tutto.
 *
 * Se una barra ha un foro, ha un aggancio: buttarla è una scelta, non una
 * necessità. E col telaio anche una barra senza NESSUN incrocio è tenuta, perché
 * le sue teste sono infilate nel canale della U, che le trattiene. L'unico caso
 * davvero impossibile è la griglia nuda con zero incroci — quella cade per terra,
 * e viene tolta comunque.
 */
export const DEFAULT_LUNGHEZZA_MINIMA = 0;
