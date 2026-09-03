// src/logic/listini.ts
//
// Anagrafica dei listini e ricostruzione del prezzo dallo scontrino di riga.
// Puro TS, nessuna dipendenza da Vue/Firestore: lo usano il preventivatore, la
// lente del prezzo e i test.

import type { RigaPricing, RegimePricing } from '../types';

/**
 * Nomi leggibili. Le chiavi sono i valori che girano davvero:
 * `settings/pricing.active_global_default` e `users/{uid}.price_list_mode`.
 * '2025x' e '2025-x' sono lo STESSO listino (LEALI) con due scritture storiche
 * diverse — il dispatcher le tollera entrambe (v. pricing.ts), e qui anche.
 */
const NOMI: Record<string, string> = {
  '2026-a': 'Listino 2026',
  '2025-a': 'Listino 2025',
  '2025x': 'Listino LEALI',
  '2025-x': 'Listino LEALI',
};

/** Nome da mostrare. Un listino sconosciuto si mostra com'è, non si inventa. */
export function nomeListino(id?: string | null): string {
  if (!id) return 'non registrato';
  return NOMI[id] || id;
}

/** Due id che indicano lo stesso listino ('2025x' e '2025-x'). */
export function stessoListino(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const norm = (x: string) => (x === '2025-x' ? '2025x' : x);
  return norm(a) === norm(b);
}

/**
 * MAGGIORAZIONE LEALI — la leva di prezzo del listino '2025x'/'2025-x'.
 *
 * Sta nel CODICE e non nel listino, quindi la sua storia va scritta qui o non
 * la sa più nessuno:
 *
 *   attiva 1,00 → fino al 2026-06-26
 *   azzerata 0  → dal 2026-06-26 al 2026-09-03
 *   attiva 1,00 → dal 2026-09-03. Per spegnerla di nuovo: 0 QUI, e basta.
 */
export const MAGGIORAZIONE_LEALI = 1.00;

/**
 * Le tariffe EFFETTIVE di una riga LEALI: quelle che il prezzo usa davvero.
 *
 * Due cose che sembrano dettagli e non lo sono.
 *
 * 1. La maggiorazione si somma a ENTRAMBE le tariffe, quindi su una riga con
 *    canalino pesa il doppio (+2,00 €/m di sviluppo, +2,40 nei regimi al 20%).
 * 2. Il motore la somma anche quando il canalino NON c'è: lì entra due volte
 *    lo stesso. È sempre stato così — con la leva a 0 la seconda quota valeva 0
 *    e non si vedeva. Il prezzo è quello e non si tocca; ma la quota "del
 *    canalino" su una riga che il canalino non ce l'ha va sommata alla griglia,
 *    unica voce vera della riga, o la lente mostrerebbe al cliente una voce
 *    "Canalino 1,00 €/m" su una riga senza canalino.
 *
 * Una sola implementazione, condivisa dal motore e dalla lente: sono due strade
 * sullo stesso prezzo e devono dire la stessa cifra. L'associazione delle somme
 * è quella storica del motore, così il totale resta identico al centesimo di
 * bit rispetto a prima che questa funzione esistesse.
 */
export function tariffeLeali(
  griglia: number,
  canalino: number,
  senzaCanalino: boolean,
): { griglia: number; canalino: number } {
  const g = griglia + MAGGIORAZIONE_LEALI;
  const c = canalino + MAGGIORAZIONE_LEALI;
  return senzaCanalino ? { griglia: g + c, canalino: 0 } : { griglia: g, canalino: c };
}

/**
 * LA formula, unica per tutti i motori:
 *
 *     metri × (somma delle tariffe al metro) × (1 + maggiorazione) + supplementi
 *
 * Ogni caso di ogni listino è un caso particolare di questa riga: l'incrocio ha
 * due tariffe e nient'altro, le parallele del 2026 hanno una tariffa e due
 * supplementi, quelle del 2025 hanno due tariffe e una maggiorazione, il solo
 * telaio ha il perimetro al posto dello sviluppo. Chi legge lo scontrino non ha
 * quindi bisogno di sapere quale motore l'ha scritto — che è tutto il punto.
 */
export function ricostruisciPrezzoUnitario(p: RigaPricing): number {
  // Difensivo di proposito: lo scontrino arriva da Firestore, dove le righe del
  // preventivo sono scrivibili dal client. Un campo storto deve dare un numero
  // che non riconcilia (e quindi la modale non mostra niente), non un'eccezione
  // che rompe la lente.
  const tariffe = Array.isArray(p?.tariffe) ? p.tariffe.reduce((t, x) => t + (Number(x?.valore) || 0), 0) : 0;
  const fattore = p?.maggiorazionePct ? 1 + Number(p.maggiorazionePct) / 100 : 1;
  const supplementi = Array.isArray(p?.supplementi) ? p.supplementi.reduce((t, x) => t + (Number(x?.importo) || 0), 0) : 0;
  return (Number(p?.metriPezzo) || 0) * tariffe * fattore + supplementi;
}

/**
 * Scontrino del "solo telaio": il perimetro moltiplicato per il coefficiente
 * del canalino. Identico nei tre motori, quindi sta qui una volta sola — e sta
 * qui, non in pricing.ts, per non creare un import circolare fra il dispatcher
 * e i motori 2025 che lo usano.
 */
export function pricingSoloTelaio(
  metriPerimetro: number,
  codice: string | undefined,
  moltiplicatore: number,
  listino: string,
): RigaPricing {
  return {
    listino,
    regime: 'SOLO_TELAIO',
    metrica: 'perimetro',
    metriPezzo: metriPerimetro,
    tariffe: moltiplicatore ? [{ tipo: 'telaio', codice: codice || '', valore: moltiplicatore }] : [],
    maggiorazionePct: null,
    supplementi: [],
    taglia: null,
  };
}

/** Da `complessita` (numero interno ai motori) al regime dello scontrino. */
export function regimeDaComplessita(complessita: number): RegimePricing {
  if (complessita === 1) return 'INCROCIO';
  if (complessita === 2) return 'PARALLELE';
  if (complessita === 3) return 'SINGOLA';
  return 'NESSUNA';
}
