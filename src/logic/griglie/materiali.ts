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

/**
 * Inglesina da 26: l'unico profilo con cui si fa lo stile PREMIUM, sia per la
 * cornice sia per gli elementi interni.
 *
 * SORMONTO (dal foglio "calcoliLAVORAZIONI", tab Supporto): quanto della corsa di
 * un orizzontale "mangia" ogni barra che attraversa. Vale 13 sulle verniciate e
 * 14 sulle rivestite. Il pezzo che si incastra entra nella barra sormontata per
 * (26 − sormonto)/2 per lato: 6,5 sulle verniciate, 6 sulle rivestite. Con 13 le
 * due grandezze coincidono per caso (13/2 = 6,5): non scambiarle.
 *
 * Sezione 26×8 (scheda Varsavia), stecche da 3 m da 304 g l'una (≈ 101 g/m).
 */
export const INGLESINA_26 = {
  larghezza: 26,
  spessore: 8,
  sormonto: { VERNICIATO: 13, RIVESTITO: 14 },
  stecca: 3000,
  pesoSteccaKg: 0.304,
} as const;

/**
 * Minuteria del PREMIUM, per pezzo:
 * - giunzione interna: una per INCROCIO verticale × orizzontale;
 * - perno tondo: uno per ogni testa che si incastra nella cornice (cioè uno per
 *   foro della cornice: 2 per verticale, 2 per fila di orizzontali);
 * - giunzione a L: una per angolo della cornice, pesa come quella interna.
 */
export const MINUTERIA_PREMIUM = {
  giunzionePesoKg: 0.169,
  pernoPesoKg: 0.015,
  giunzioneLPesoKg: 0.169,
} as const;

export const DEFAULT_GIOCO = 1;          // mm per lato, infilaggio barra nel canale
export const DEFAULT_KERF = 3;           // mm, spessore della lama
export const DEFAULT_INTESTATURA = 20;   // mm rifilati in testa a ogni stecca nuova
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
