"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pilotV2Trigger = exports.pilotV2Ping = void 0;
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
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const REGION = 'europe-west1';
/** Callable solo admin: restituisce versione di Node e ora del server. */
exports.pilotV2Ping = (0, https_1.onCall)({ region: REGION }, (request) => {
    var _a, _b, _c, _d;
    const email = (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) || '').toLowerCase().trim();
    const isAdmin = ((_d = (_c = request.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.role) === 'ADMIN' || email === 'info@inglesinaitaliana.it';
    if (!request.auth || !isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Riservato agli amministratori.');
    }
    return { ok: true, gen: 2, node: process.version, at: new Date().toISOString() };
});
/** Trigger su _pilotV2/{id}: marca il documento appena creato come ricevuto. */
exports.pilotV2Trigger = (0, firestore_1.onDocumentCreated)({ region: REGION, document: '_pilotV2/{id}' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    await snap.ref.update({
        ricevuto: firestore_2.FieldValue.serverTimestamp(),
        gen: 2,
        node: process.version,
    });
});
//# sourceMappingURL=pilotV2.js.map