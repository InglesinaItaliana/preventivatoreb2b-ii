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
