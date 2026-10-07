// src/logic/griglie/scasso.ts
//
// Le quote della pressetta che scassa i verticali dell'inglesina da 26.
// Modulo PURO: nessun Vue, nessun Firestore. Tutto in millimetri; i centimetri
// esistono solo nell'etichetta che legge chi sta alla macchina.
//
// COME LAVORA LA PRESSETTA
// - Prima quota: la barra va a battuta con la TESTA su un elemento fisso.
// - Quote successive: l'elemento si ruota ed entra nello scasso precedente, quindi
//   il passo NON è la distanza fra gli assi degli orizzontali (è più corto).
// - INIZ: con due soli orizzontali non si cambia misura: si estrae la barra, la
//   si gira e si rifà la prima quota dall'altra testa.
//
// LA FORMULA viene dal foglio "calcoliLAVORAZIONI" (colonna "scasso V", ramo 26),
// per una barra standard lunga Q che attraversa n orizzontali:
//
//   passo        = (Q + 10 − 4·n) / (n + 1)
//   prima quota  = passo − 5
//
// 10, 4 e 5 sono costanti della pressetta PER IL PROFILO 26 (sul 18 e sul 45 il
// foglio ne usa altre): valgono per qualunque barra da 26 e non vanno ricavate
// dalla geometria della griglia.

/** Costanti del ramo 26 del foglio. */
export const SCASSO_26 = {
  aggiunta: 10,          // mm sommati alla lunghezza della barra
  perOrizzontale: 4,     // mm tolti per ogni orizzontale attraversato
  rientroPrimaQuota: 5,  // la prima quota è il passo meno questo
} as const;

/**
 * Inglesina STANDARD (per vetrocamera): il terminale sborda 1 mm per estremità,
 * per questo nel foglio la barra è lunga quanto la luce − 2. La barra standard
 * comincia quindi 1 mm DENTRO la luce: è il riferimento su cui la formula è tarata.
 */
export const TERMINALE_STANDARD = 1;

export interface QuoteScasso {
  primaQuota: number;   // mm dalla testa, battuta fissa
  passo: number;        // mm, battuta ruotata nello scasso precedente
}

/** La formula del foglio, così com'è, per una barra standard da 26 lunga Q. */
export function scassoStandard26(lunghezzaBarra: number, nOrizzontali: number): QuoteScasso {
  const n = nOrizzontali;
  const passo = (lunghezzaBarra + SCASSO_26.aggiunta - SCASSO_26.perOrizzontale * n) / (n + 1);
  return { primaQuota: passo - SCASSO_26.rientroPrimaQuota, passo };
}

/**
 * Le quote per un verticale PREMIUM.
 *
 * Il verticale PREMIUM non comincia 1 mm dentro la luce come quello standard: si
 * infila sotto la cornice per `sormontoPerLato` (6,5 / 6 mm) PRIMA della luce.
 * Si calcola quindi la barra standard che avrebbe la STESSA luce (luce − 2) e si
 * sposta la sola prima quota di quanto si è spostata la testa:
 *
 *   spostamento = TERMINALE_STANDARD + sormontoPerLato   (7,5 verniciato · 7 rivestito)
 *
 * Il passo non cambia: si misura dallo scasso precedente, e la distanza fra gli
 * orizzontali dipende dalla luce, non da dove comincia la barra. Così la relazione
 * quota ↔ asse dell'orizzontale resta IDENTICA a quella dello standard, e gli
 * scassi cadono sugli stessi assi dei fori della cornice.
 *
 * NB: mettere nella formula la lunghezza vera del verticale PREMIUM (Q = luce +
 * sormonto) sembra equivalente ma non lo è: allarga anche il passo, e il primo e
 * l'ultimo scasso escono di qualche mm verso le teste (−3,5/+3,5 su un 800×1800
 * con 3 orizzontali).
 *
 * ⚠️ Lo spostamento è DA VERIFICARE con il pannello di prova 350×700 (ottobre
 * 2026): se il prototipo non monta pulito, si corregge qui e solo qui.
 */
export function scassoPremium26(luce: number, nOrizzontali: number, sormontoPerLato: number): QuoteScasso {
  const standard = scassoStandard26(luce - 2 * TERMINALE_STANDARD, nOrizzontali);
  return {
    primaQuota: standard.primaQuota + TERMINALE_STANDARD + sormontoPerLato,
    passo: standard.passo,
  };
}

/** Arrotondamento a 2 decimali di cm come ROUND(x/10; 2) del foglio (half-up). */
function cm2(mm: number): string {
  const centesimi = Math.round(mm * 10 + 1e-9);
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/**
 * L'etichetta per chi sta alla pressetta, in cm come nel foglio:
 *   1 orizzontale  → "16,35"           (un solo scasso)
 *   2 orizzontali  → "46,97 - INIZ"    (si gira la barra)
 *   3 o più        → "54,75 - 55,25"   (prima quota - passo)
 *
 * Il foglio scrive INIZ anche con un solo orizzontale; qui no: girare la barra
 * farebbe un secondo scasso a pochi mm dal primo.
 */
export function etichettaScasso(q: QuoteScasso, nOrizzontali: number): string {
  if (nOrizzontali <= 0) return '';
  if (nOrizzontali === 1) return cm2(q.primaQuota);
  if (nOrizzontali === 2) return `${cm2(q.primaQuota)} - INIZ`;
  return `${cm2(q.primaQuota)} - ${cm2(q.passo)}`;
}
