/**
 * PILOTA functions v2 (2nd gen) — TEMPORANEO, da rimuovere dopo la verifica.
 *
 * Serve a provare sul progetto, prima di scrivere funzioni v2 vere:
 *  - il primo deploy v2 dalla CI (attivazione di Cloud Run / Eventarc, permessi
 *    del service account usato via WIF);
 *  - una callable v2 (pilotV2Ping);
 *  - un trigger Firestore v2 sul database multi-regione eur3 (pilotV2Trigger).
 *
 * Nessuna dipendenza dal resto del codice: solo firebase-admin (import modulare), già inizializzato
 * da index.ts. La collezione `_pilotV2` non è leggibile né scrivibile dal client
 * (catch-all deny in firestore.rules).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const REGION = 'europe-west1';

/** Callable solo admin: restituisce versione di Node e ora del server. */
export const pilotV2Ping = onCall({ region: REGION }, (request) => {
  const email = (request.auth?.token?.email || '').toLowerCase().trim();
  const isAdmin = request.auth?.token?.role === 'ADMIN' || email === 'info@inglesinaitaliana.it';
  if (!request.auth || !isAdmin) {
    throw new HttpsError('permission-denied', 'Riservato agli amministratori.');
  }
  return { ok: true, gen: 2, node: process.version, at: new Date().toISOString() };
});

/** Trigger su _pilotV2/{id}: marca il documento appena creato come ricevuto. */
export const pilotV2Trigger = onDocumentCreated(
  { region: REGION, document: '_pilotV2/{id}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await snap.ref.update({
      ricevuto: FieldValue.serverTimestamp(),
      gen: 2,
      node: process.version,
    });
  },
);
