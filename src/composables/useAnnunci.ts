// src/composables/useAnnunci.ts
//
// Annunci "una volta sola": il cliente vede la novità al primo accesso utile e
// mai più.
//
// Lo stato NON sta in localStorage ma su users/{uid}.annunciVisti: localStorage
// è per-browser, quindi lo stesso cliente si rivedrebbe il popup dal telefono,
// dal PC dell'ufficio e a ogni svuotamento della cache. Sul doc utente l'annuncio
// è visto una volta e basta — ed è anche ripristinabile a mano, se un giorno
// volete rimostrarlo.
//
// È una LISTA di chiavi, non un booleano: il prossimo annuncio si lancia
// aggiungendo una chiave nuova, senza toccare schema né regole.

import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

/** Chiavi degli annunci. Una chiave nuova = un annuncio nuovo da mostrare. */
export const ANNUNCIO_DETTAGLIO_PREZZO = 'dettaglio-prezzo-v1';
/** Destinazione merce — versione per il CLIENTE (users/*). */
export const ANNUNCIO_DESTINAZIONE = 'destinazione-merce-v1';
/** Destinazione merce — versione per lo STAFF admin (team/*). */
export const ANNUNCIO_DESTINAZIONE_ADMIN = 'destinazione-merce-admin-v1';

/**
 * ANNUNCIO RITIRATO — 'stampa-documenti-v1' (con la sua chiave localStorage
 * storica 'pops_print_feature_seen') non è più un popup: la novità vive nel
 * pannello, in `lib/novita.ts`, dove resta consultabile invece di sparire dopo
 * il primo "Ho capito". La stringa resta negli `annunciVisti` dei clienti che
 * l'avevano già chiuso: è innocua, nessuno la legge più.
 */

/**
 * Funzione pura sui dati del doc utente che il chiamante ha già in mano: così
 * l'annuncio non costa una lettura in più.
 */
export function annuncioDaMostrare(userData: any, key: string): boolean {
  const visti: string[] = userData?.annunciVisti || [];
  return !visti.includes(key);
}

/**
 * Dove vive lo stato "già visto".
 *  - `users` → clienti (doc id = uid del cliente)
 *  - `team`  → staff interno, che in `users` NON ha alcun documento: scriverlo lì
 *    creerebbe clienti fantasma nell'anagrafica, che poi compaiono negli elenchi.
 * Sul doc di team può scrivere solo un ADMIN (`allow write: if isAdmin()` in
 * firestore.rules) — ed è esattamente il pubblico degli annunci interni.
 */
export type AnnuncioCollezione = 'users' | 'team';

/**
 * Segna l'annuncio come visto. Se la scrittura fallisce non rompiamo niente: il
 * popup si ripresenterà al prossimo accesso, che è il modo giusto di fallire.
 */
export async function segnaAnnuncioVisto(
  uid: string,
  key: string,
  collezione: AnnuncioCollezione = 'users',
): Promise<void> {
  try {
    await setDoc(doc(db, collezione, uid), { annunciVisti: arrayUnion(key) }, { merge: true });
  } catch (e) {
    console.warn('[annunci] non sono riuscito a salvare la conferma di lettura', e);
  }
}
