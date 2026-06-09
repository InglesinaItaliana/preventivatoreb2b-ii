"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoDeliveredAfter7Days = exports.backfillMessageMembers = exports.backfillAssigneeUids = exports.auditAssigneeUids = exports.changeTeamMemberEmail = exports.createTeamMember = void 0;
const dotenv = __importStar(require("dotenv")); // <--- AGGIUNGI QUESTO
dotenv.config(); // <--- E QUESTO (Carica subito il file .env)
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const nodemailer = __importStar(require("nodemailer"));
// Layer di fatturazione (migrazione FiC→CiC). Vedi src/functions/lib_billing/.
const lib_billing_1 = require("./lib_billing");
const bugs_1 = require("./lib_bugs/bugs");
// Inizializza Firebase
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// --- AVATAR STELLARI: mappa ruolo Auth -> categoria di default ---
// La categoria definisce la FORMA della stella. L'admin può sovrascriverla da NEBULA.
// I role auth restano invariati: questo è solo un default iniziale.
const ROLE_TO_CATEGORY = {
    ADMIN: 'direzione',
    PRODUZIONE: 'produzione',
    LOGISTICA: 'logistica',
    COMMERCIALE: 'commerciale',
};
function defaultCategoryForRole(role) {
    return (role && ROLE_TO_CATEGORY[role]) || 'amministrazione';
}
// ... (codice esistente)
// --- FUNZIONE 4: ANNULLA E CANCELLA ORDINE ---
// Imposta stato a REJECTED ed elimina il documento su FiC se esistente
// Bloccata se l'ordine è già READY o successivo
exports.cancelOrder = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const orderId = data.orderId;
    if (!orderId)
        throw new functions.https.HttpsError('invalid-argument', 'ID ordine mancante');
    const db = admin.firestore();
    const docRef = db.collection('preventivi').doc(orderId);
    try {
        const docSnap = await docRef.get();
        if (!docSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Ordine non trovato');
        const orderData = docSnap.data();
        const statoAttuale = (orderData === null || orderData === void 0 ? void 0 : orderData.stato) || 'DRAFT';
        // 1. VERIFICA VINCOLO DI STATO
        // Non si può annullare se è READY, DELIVERY, SHIPPED, DELIVERED
        const statiBloccati = ['READY', 'DELIVERY', 'SHIPPED', 'DELIVERED'];
        if (statiBloccati.includes(statoAttuale)) {
            throw new functions.https.HttpsError('failed-precondition', `Impossibile annullare l'ordine: lo stato '${statoAttuale}' è troppo avanzato (Pronto o Spedito).`);
        }
        const ficId = orderData === null || orderData === void 0 ? void 0 : orderData.fic_order_id;
        // 2. ELIMINAZIONE SU FATTURE IN CLOUD (Se esiste)
        if (ficId) {
            try {
                const token = await getValidFicToken();
                console.log(`[CANCEL] Eliminazione ordine FiC ID: ${ficId}...`);
                await axios_1.default.delete(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/${ficId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log(`[CANCEL] Ordine FiC eliminato correttamente.`);
            }
            catch (ficError) {
                console.error("[CANCEL] Errore eliminazione FiC (procedo comunque all'annullamento locale):", ficError.message);
                // Non blocchiamo: se l'ordine non esiste più su FiC, va bene lo stesso.
            }
        }
        // 2b. ELIMINAZIONE SU CONTABILITÀ IN CLOUD (Se esiste)
        const cicId = orderData === null || orderData === void 0 ? void 0 : orderData.cic_order_id;
        if (cicId) {
            try {
                console.log(`[CANCEL] Eliminazione ordine CiC ID: ${cicId}...`);
                const provider = await (0, lib_billing_1.createCicProvider)();
                await provider.deleteDocument({ id: cicId, type: 'order' });
                console.log(`[CANCEL] Ordine CiC eliminato correttamente.`);
            }
            catch (cicError) {
                console.error("[CANCEL] Errore eliminazione CiC (procedo comunque all'annullamento locale):", cicError.message);
            }
        }
        // 3. AGGIORNAMENTO STATO FIRESTORE -> REJECTED
        await docRef.update({
            stato: 'REJECTED',
            fic_order_id: admin.firestore.FieldValue.delete(),
            fic_order_url: admin.firestore.FieldValue.delete(),
            cic_order_id: admin.firestore.FieldValue.delete(),
            cic_order_url: admin.firestore.FieldValue.delete(),
            billingBackend: admin.firestore.FieldValue.delete(),
            // Manteniamo traccia di chi ha annullato
            annullatoDa: context.auth.token.email || context.auth.uid,
            dataAnnullamento: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: "Ordine annullato correttamente." };
    }
    catch (e) {
        console.error("[CANCEL] Errore critico:", e);
        throw new functions.https.HttpsError('internal', e.message);
    }
});
// --- SYNC RUOLI (Database -> Auth Claims) — key-agnostic + migration-safe ---
// Trigger su team/{docId}. La doc-id puo' essere EMAIL (legacy) o UID (post
// re-key Strada B, vedi docs/STELLA-GRAFO.md). L'identita' Auth si risolve
// SEMPRE dal campo `uid` del documento, non dalla chiave -> il trigger funziona
// durante la coesistenza dei due schemi (Fasi 2-4 della migrazione).
//
// CANCELLAZIONE — doppia salvaguardia anti-lockout dello staff POPS:
//   (a) se esiste ancora un ALTRO doc team con lo stesso uid (es. il doc
//       uid-keyed convive col mail-keyed che stai cancellando) -> NON azzerare;
//   (b) kill-switch esplicito core/migration.teamRekey == true -> NON azzerare.
// Solo una rimozione "vera" (nessun doc residuo per quell'uid, flag spento)
// azzera i custom claims.
exports.syncTeamRoleToAuth = functions
    .region('europe-west1')
    .firestore
    .document('team/{docId}')
    .onWrite(async (change, context) => {
    var _a, _b;
    const docId = context.params.docId;
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const data = after !== null && after !== void 0 ? after : before;
    // Identita' Auth = campo `uid` del doc (robusto alla chiave). Fallback:
    // risolvi via email (doc legacy senza uid), o usa la chiave se e' gia' un uid.
    let uid = data === null || data === void 0 ? void 0 : data.uid;
    try {
        if (!uid) {
            const lookupEmail = ((_a = data === null || data === void 0 ? void 0 : data.email) !== null && _a !== void 0 ? _a : docId);
            uid = (lookupEmail && lookupEmail.includes('@'))
                ? (await admin.auth().getUserByEmail(lookupEmail)).uid
                : docId;
        }
        if (!after) {
            // CASO CANCELLAZIONE — applica le due salvaguardie prima del wipe.
            const dup = await admin.firestore()
                .collection('team').where('uid', '==', uid).limit(1).get();
            if (!dup.empty) {
                console.log(`[ROLE SYNC] Esiste ancora un doc team per uid=${uid}: skip wipe (${docId}).`);
                return;
            }
            const mig = await admin.firestore().doc('core/migration').get();
            if (mig.exists && ((_b = mig.data()) === null || _b === void 0 ? void 0 : _b.teamRekey) === true) {
                console.log(`[ROLE SYNC] Migrazione attiva (teamRekey): skip wipe per ${docId}.`);
                return;
            }
            await admin.auth().setCustomUserClaims(uid, null);
            console.log(`[ROLE SYNC] Rimossi ruoli per ${docId} (uid=${uid})`);
            return;
        }
        // Imposta/aggiorna il custom claim del ruolo (idempotente).
        await admin.auth().setCustomUserClaims(uid, { role: after.role });
        console.log(`[ROLE SYNC] Assegnato ruolo '${after.role}' a uid=${uid} (doc ${docId})`);
    }
    catch (e) {
        if (e.code === 'auth/user-not-found') {
            console.warn(`[ROLE SYNC] Utente Auth non trovato per doc ${docId}. Il documento team esiste ma l'utente no.`);
        }
        else {
            console.error(`[ROLE SYNC] Errore sincronizzazione ${docId}:`, e);
        }
    }
    // --- AVATAR STELLARI: assegna hueIndex + category di default se mancanti ---
    // Counter PER-CATEGORIA (`counters/teamHue_${category}`): garantisce rank
    // sequenziale entro ogni famiglia (produzione: 0,1,2,...). Combinato col
    // tone-cycle nell'engine, i primi 6 workers di una categoria avranno hue
    // tutti diversi (palette 6) e dal 7 in poi stesso hue ma intensita' diversa.
    if (after) {
        const needsHue = typeof after.hueIndex !== 'number';
        const needsCategory = !after.category;
        if (needsHue || needsCategory) {
            const db = admin.firestore();
            const teamRef = change.after.ref; // key-agnostic (email o uid)
            try {
                await db.runTransaction(async (tx) => {
                    var _a, _b;
                    // Rileggi dentro la transazione: se nel frattempo i campi sono
                    // stati popolati (doppio onWrite concorrente), non fare nulla.
                    const fresh = await tx.get(teamRef);
                    if (!fresh.exists)
                        return;
                    const fd = fresh.data();
                    const patch = {};
                    // Categoria effettiva: gia' su Firestore oppure derivata dal role.
                    const effectiveCategory = fd.category || defaultCategoryForRole(fd.role);
                    const counterRef = db.collection('counters').doc(`teamHue_${effectiveCategory}`);
                    if (typeof fd.hueIndex !== 'number') {
                        const counterSnap = await tx.get(counterRef);
                        const next = counterSnap.exists ? ((_b = (_a = counterSnap.data()) === null || _a === void 0 ? void 0 : _a.next) !== null && _b !== void 0 ? _b : 0) : 0;
                        patch.hueIndex = next;
                        tx.set(counterRef, { next: next + 1 }, { merge: true });
                    }
                    if (!fd.category) {
                        patch.category = effectiveCategory;
                    }
                    if (Object.keys(patch).length > 0) {
                        tx.update(teamRef, patch);
                    }
                });
                console.log(`[AVATAR SYNC] ${docId}: hue/category assegnati (needsHue=${needsHue}, needsCategory=${needsCategory})`);
            }
            catch (e) {
                console.error(`[AVATAR SYNC] Errore assegnazione avatar ${docId}:`, e);
            }
        }
    }
});
// --- HELPER DI MIGRAZIONE (DA ESEGUIRE UNA VOLTA SOLA) ---
// Chiama questa funzione dal client o dalla shell per aggiornare TUTTI gli utenti esistenti
exports.migrateAllTeamClaims = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    // Verifica che chi chiama sia un super-admin o l'email hardcodata per sicurezza iniziale
    // (Opzionale, ma consigliato per evitare abusi)
    const db = admin.firestore();
    const teamSnap = await db.collection('team').get();
    let count = 0;
    for (const doc of teamSnap.docs) {
        const d = doc.data();
        const email = d.email;
        const role = d.role;
        if (email && role) {
            try {
                const user = await admin.auth().getUserByEmail(email);
                await admin.auth().setCustomUserClaims(user.uid, { role: role });
                count++;
            }
            catch (e) {
                console.error(`Errore migrazione ${email}`, e);
            }
        }
    }
    return { success: true, updated: count };
});
// --- BACKFILL AVATAR STELLARI (RE-MIGRAZIONE per-categoria) ---
// Assegna direttamente hueIndex sequenziale entro ogni categoria, ordinando
// per email (stabile). Allinea i counter teamHue_${category} a docs.length
// cosi' i nuovi assunti continuano la sequenza. Cancella il vecchio counter
// globale `teamHue` se presente. Idempotente: ri-eseguendola gli hueIndex
// restano [0..N-1] per categoria (stesso ordering).
exports.backfillTeamAvatars = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const db = admin.firestore();
    const teamSnap = await db.collection('team').get();
    // 1. Raggruppa per categoria effettiva (preesistente o derivata dal role)
    const byCategory = {};
    for (const doc of teamSnap.docs) {
        const d = doc.data();
        const cat = d.category || defaultCategoryForRole(d.role);
        if (!byCategory[cat])
            byCategory[cat] = [];
        byCategory[cat].push(doc);
    }
    // 2. Per ogni categoria: ordina per email, assegna hueIndex 0..N-1
    let updated = 0;
    const categoriesTouched = {};
    for (const [cat, docs] of Object.entries(byCategory)) {
        docs.sort((a, b) => a.id.localeCompare(b.id));
        for (let i = 0; i < docs.length; i++) {
            try {
                await docs[i].ref.update({
                    hueIndex: i,
                    category: cat,
                });
                updated++;
            }
            catch (e) {
                console.error(`[AVATAR BACKFILL] Errore update ${docs[i].id}`, e);
            }
        }
        // Allinea counter per assegnazioni future (nuovi assunti)
        try {
            await db.collection('counters').doc(`teamHue_${cat}`).set({ next: docs.length });
        }
        catch (e) {
            console.error(`[AVATAR BACKFILL] Errore set counter teamHue_${cat}`, e);
        }
        categoriesTouched[cat] = docs.length;
    }
    // 3. Cleanup: cancella vecchio counter globale se presente
    try {
        await db.collection('counters').doc('teamHue').delete();
    }
    catch (e) {
        // ok se non esiste
    }
    return { success: true, updated, categoriesTouched };
});
// --- FUNZIONE UNA TANTUM: AGGIORNAMENTO INDIRIZZI DA FIC ---
exports.syncAddressesFromFiC = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540 })
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const db = admin.firestore();
    const results = { total: 0, updated: 0, skipped: 0, errors: 0 };
    try {
        const token = await getValidFicToken();
        const usersSnap = await db.collection('users').get();
        results.total = usersSnap.size;
        console.log(`[ADDR SYNC] Inizio per ${results.total} utenti...`);
        for (const doc of usersSnap.docs) {
            const userData = doc.data();
            const piva = userData.piva;
            // Salta se manca P.IVA o se ha già indirizzo E cap
            if (!piva || (userData.indirizzo && userData.cap)) {
                results.skipped++;
                continue;
            }
            try {
                // Recupera l'oggetto DETTAGLIATO (con address_street e postal_code)
                const ficClient = await fetchFicClientByVat(piva, token);
                if (ficClient) {
                    const updates = {};
                    // --- MAPPATURA RICHIESTA ---
                    // Indirizzo -> address_street
                    if (!userData.indirizzo && ficClient.address_street) {
                        updates.indirizzo = ficClient.address_street;
                    }
                    // CAP -> address_postal_code
                    if (!userData.cap && ficClient.address_postal_code) {
                        updates.cap = ficClient.address_postal_code;
                    }
                    // Extra utili
                    if (!userData.citta && ficClient.address_city) {
                        updates.citta = ficClient.address_city;
                    }
                    if (!userData.provincia && ficClient.address_province) {
                        updates.provincia = ficClient.address_province;
                    }
                    if (Object.keys(updates).length > 0) {
                        await doc.ref.update(updates);
                        results.updated++;
                        console.log(`[ADDR SYNC] ✅ Aggiornato ${userData.ragioneSociale}`);
                    }
                    else {
                        // Se entra qui, significa che anche su FiC i campi sono vuoti
                        console.log(`[ADDR SYNC] ⚠️ Trovato ${piva} ma dati indirizzo vuoti su FiC.`);
                    }
                }
                else {
                    console.log(`[ADDR SYNC] ❌ P.IVA ${piva} non trovata su FiC.`);
                }
                // Pausa anti-rate-limit
                await new Promise(r => setTimeout(r, 200));
            }
            catch (innerErr) {
                console.error(`Errore utente ${doc.id}`, innerErr);
                results.errors++;
            }
        }
        console.log(`[ADDR SYNC] Terminato.`, results);
        return results;
    }
    catch (error) {
        console.error("Errore critico sync:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// --- NUOVA FUNZIONE: SINCRONIZZAZIONE PRODOTTI ---
// --- FUNZIONE SINCRONIZZAZIONE POTENZIATA ---
exports.syncProductsWithFic = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540, memory: '512MB' }) // Timeout aumentato per la ricerca mirata
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    // Codici richiesti dal CSV
    const targetCodes = (data.codes || []).map((c) => c.toUpperCase().trim());
    if (targetCodes.length === 0) {
        return { success: false, message: "Nessun codice fornito." };
    }
    const db = admin.firestore();
    const token = await getValidFicToken();
    const results = { updated: 0, created: 0, skipped: 0, missing_codes: [] };
    try {
        console.log(`[SYNC] Inizio sync per ${targetCodes.length} codici.`);
        // 1. SCARICA TUTTI I PRODOTTI (Strategia Massiva)
        let allFicProducts = [];
        let page = 1;
        let hasMore = true;
        // Scarica a blocchi di 50
        while (hasMore) {
            try {
                const res = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/products`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { page: page, per_page: 50 }
                });
                const fetched = res.data.data || [];
                allFicProducts = [...allFicProducts, ...fetched];
                // Se la pagina corrente ha meno di 50 elementi, è l'ultima
                if (fetched.length < 50 || !res.data.next_page_url) {
                    hasMore = false;
                }
                else {
                    page++;
                }
            }
            catch (e) {
                console.warn(`[SYNC] Errore paginazione pagina ${page}`, e);
                hasMore = false; // Interrompe loop in caso di errore API
            }
        }
        console.log(`[SYNC] Scaricati ${allFicProducts.length} prodotti da FiC.`);
        // Mappa veloce
        const ficMap = new Map();
        allFicProducts.forEach(p => {
            if (p.code)
                ficMap.set(p.code.toUpperCase().trim(), p);
        });
        // 2. ELABORAZIONE E FALLBACK (Strategia Mirata)
        const batch = db.batch();
        let batchCount = 0;
        for (const code of targetCodes) {
            let ficProduct = ficMap.get(code);
            // --- FALLBACK: Se non trovato nella lista massiva, cercalo specificamente ---
            if (!ficProduct) {
                console.log(`[SYNC] Codice ${code} non trovato in massa. Tento ricerca mirata...`);
                try {
                    // Piccola pausa per non intasare l'API (rate limit)
                    await new Promise(r => setTimeout(r, 100));
                    const lookupRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/products`, {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { q: `code = '${code}'` } // Query specifica
                    });
                    if (lookupRes.data.data && lookupRes.data.data.length > 0) {
                        ficProduct = lookupRes.data.data[0];
                        console.log(`[SYNC] TROVATO col fallback: ${code}`);
                    }
                }
                catch (e) {
                    console.warn(`[SYNC] Errore lookup fallback per ${code}`);
                }
            }
            // --------------------------------------------------------------------------
            if (!ficProduct) {
                results.skipped++;
                results.missing_codes.push(code); // Salviamo chi manca
                continue;
            }
            // Scrittura su Firestore (con protezione campi undefined)
            const docRef = db.collection('products').doc(code);
            const productData = {
                id: ficProduct.id,
                code: ficProduct.code || "",
                name: ficProduct.name || "",
                net_price: ficProduct.net_price || 0,
                gross_price: ficProduct.gross_price || 0,
                category: ficProduct.category || null, // Fix undefined
                description: ficProduct.description || null, // Fix undefined
                uom: ficProduct.uom || null, // Fix undefined
                default_vat: ficProduct.default_vat || null,
                raw_data: ficProduct || {},
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            };
            batch.set(docRef, productData, { merge: true });
            batchCount++;
            results.updated++;
            if (batchCount >= 400) {
                await batch.commit();
                batchCount = 0;
            }
        }
        if (batchCount > 0) {
            await batch.commit();
        }
        console.log(`[SYNC] Completato. Aggiornati: ${results.updated}, Mancanti: ${results.skipped}`);
        return results;
    }
    catch (error) {
        console.error("[SYNC] Errore critico:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// ... (altre importazioni e codice esistente)
// --- FUNZIONE RECUPERO URL AGGIORNATO (FIX "Accesso scaduto") ---
exports.getFreshFicUrl = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const { fic_id } = data;
    if (!fic_id)
        throw new functions.https.HttpsError('invalid-argument', 'ID documento mancante');
    try {
        // 1. Ottieni un token valido (usa la tua funzione esistente)
        const token = await getValidFicToken();
        // 2. Chiedi a FiC i dettagli del documento
        const response = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/${fic_id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        // 3. Restituisci il nuovo URL
        return { url: response.data.data.url };
    }
    catch (error) {
        console.error("Errore recupero URL aggiornato:", error.message);
        throw new functions.https.HttpsError('internal', 'Impossibile recuperare il documento aggiornato.');
    }
});
// --- CONFIGURAZIONE ---
const FIC_API_URL = process.env.FIC_API_URL || "https://api-v2.fattureincloud.it";
const COMPANY_ID = process.env.FIC_COMPANY_ID;
const FIC_CLIENT_ID = process.env.FIC_CLIENT_ID;
const FIC_CLIENT_SECRET = process.env.FIC_CLIENT_SECRET;
// Controllo di sicurezza all'avvio (opzionale ma consigliato)
if (!COMPANY_ID || !FIC_CLIENT_ID || !FIC_CLIENT_SECRET) {
    console.warn("⚠️ Attenzione: Credenziali FiC mancanti nel file .env");
}
const DELIVERY_TARIFF_CODES = [
    'Consegna Diretta V1',
    'Consegna Diretta V2',
    'Consegna Diretta V3',
    'Spedizione'
];
const VAT_ID = 0;
const VAT_VALUE = 22;
exports.createTeamMember = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Verifica che chi chiama sia loggato (e idealmente Admin)
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Devi essere loggato per creare un membro del team.");
    }
    const { email, password, firstName, lastName, role, phone, category, position, managerUid } = data;
    const cleanManagerUid = typeof managerUid === 'string' && managerUid.trim() ? managerUid.trim() : undefined;
    if (!email || !password || !role) {
        throw new functions.https.HttpsError("invalid-argument", "Dati mancanti.");
    }
    // Creazione "funzione-first" (opzione B): category/position opzionali. Se
    // assenti, il trigger syncTeamRoleToAuth deriva category da defaultCategoryForRole.
    // Validazione blanda della category (6 forme avatar note).
    const VALID_CATEGORIES = ['direzione', 'amministrazione', 'produzione', 'tecnico', 'logistica', 'commerciale'];
    const cleanCategory = typeof category === 'string' && VALID_CATEGORIES.includes(category) ? category : undefined;
    const cleanPosition = typeof position === 'string' && position.trim() ? position.trim() : undefined;
    try {
        // 2. Crea l'utente in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password, // La password scelta dall'Admin
            displayName: `${firstName} ${lastName}`,
            disabled: false,
        });
        // 3. Crea il documento nel Database 'team' UID-KEYED (re-key Strada B,
        //    docs/STELLA-GRAFO.md). L'email resta come campo (mutabile via updateUser).
        await admin.firestore().collection("team").doc(userRecord.uid).set(Object.assign(Object.assign(Object.assign(Object.assign({ uid: userRecord.uid, email: email.toLowerCase().trim(), firstName,
            lastName,
            role, phone: phone || "", active: true }, (cleanCategory ? { category: cleanCategory } : {})), (cleanPosition ? { position: cleanPosition } : {})), (cleanManagerUid ? { managerUid: cleanManagerUid } : {})), { createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: context.auth.uid }));
        return { success: true, message: `Utente ${email} creato con successo.` };
    }
    catch (error) {
        console.error("Errore creazione team member:", error);
        // Se l'utente esiste già in Auth ma non nel DB, potremmo gestire l'errore qui
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "L'email è già in uso.");
        }
        throw new functions.https.HttpsError("internal", "Impossibile creare l'utente: " + error.message);
    }
});
// --- CAMBIO EMAIL AGENTE (preserva l'UID) — docs/STELLA-GRAFO.md ---
// Ora che /team è uid-keyed, cambiare l'email è banale: updateUser({email})
// preserva l'UID (l'identità canonica) e si aggiorna solo il CAMPO email del doc.
// v1 minimale: NON riscrive i riferimenti storici per-email (assignees, ACL,
// chat) — i cambi-email sono rari e il display degrada via fallback.
// Gate: solo ADMIN (token.role) o super-admin info@.
exports.changeTeamMemberEmail = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const callerEmail = (((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) || '').toLowerCase().trim();
    const callerRole = (_d = (_c = context.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.role;
    const isAdminCaller = callerRole === 'ADMIN' || callerEmail === 'info@inglesinaitaliana.it';
    if (!context.auth || !isAdminCaller) {
        throw new functions.https.HttpsError('permission-denied', 'Riservato agli amministratori.');
    }
    const uid = data === null || data === void 0 ? void 0 : data.uid;
    const newEmailRaw = data === null || data === void 0 ? void 0 : data.newEmail;
    if (!uid || !newEmailRaw) {
        throw new functions.https.HttpsError('invalid-argument', 'uid e newEmail obbligatori.');
    }
    const newEmail = newEmailRaw.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        throw new functions.https.HttpsError('invalid-argument', 'Email non valida.');
    }
    try {
        // 1. Il doc /team deve essere uid-keyed (post re-key).
        const teamRef = admin.firestore().collection('team').doc(uid);
        const teamSnap = await teamRef.get();
        if (!teamSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Agente non trovato (doc /team uid-keyed assente).');
        }
        const oldEmail = (((_e = teamSnap.data()) === null || _e === void 0 ? void 0 : _e.email) || '').toLowerCase().trim();
        // 2. Cambia l'email su Auth PRESERVANDO l'UID.
        await admin.auth().updateUser(uid, { email: newEmail });
        // 3. Aggiorna il campo email del doc (la chiave uid resta invariata).
        //    Il trigger syncTeamRoleToAuth ri-applica il claim ruolo (idempotente).
        await teamRef.update({ email: newEmail, emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
        // 4. Sincronizza l'allowlist core/admins (email-keyed): se il vecchio
        //    indirizzo era Admin CORE, sostituiscilo col nuovo (evita entry stale).
        if (oldEmail && oldEmail !== newEmail) {
            const adminsRef = admin.firestore().doc('core/admins');
            const adminsSnap = await adminsRef.get();
            const list = adminsSnap.exists ? ((_g = (_f = adminsSnap.data()) === null || _f === void 0 ? void 0 : _f.emails) !== null && _g !== void 0 ? _g : []) : [];
            if (list.includes(oldEmail)) {
                await adminsRef.update({ emails: [...list.filter((e) => e !== oldEmail), newEmail] });
            }
        }
        return { success: true, uid, newEmail };
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError)
            throw error;
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', "L'email è già in uso.");
        }
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError('not-found', 'Utente Auth non trovato per questo UID.');
        }
        console.error('[changeTeamMemberEmail]', error);
        throw new functions.https.HttpsError('internal', 'Cambio email fallito: ' + error.message);
    }
});
/**
 * A0 — Audit assignees email→UID (migrazione STELLA-GRAFO Strada B).
 * READ-ONLY: nessuna scrittura. Costruisce la mappa email→uid da /team (uid-keyed
 * post re-key) e scansiona TUTTE le task (collectionGroup: root tasks +
 * projects/{id}/tasks), classificando ogni voce di `assignees`:
 *   - emailMappable:    email con uid noto → migrabile in backfill;
 *   - emailOrphan:      email SENZA uid (esterni/ex-staff) → resterà email;
 *   - alreadyUid:       già un uid noto (idempotenza, dual-run);
 *   - unknownNonEmail:  stringa né email né uid noto (anomalia da indagare).
 * Gate `readyForBackfill` = nessuna anomalia non-email. Nessun rischio.
 */
exports.auditAssigneeUids = functions
    .region('europe-west1')
    .https.onCall(async (_data, context) => {
    var _a, _b, _c, _d;
    const callerEmail = (((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) || '').toLowerCase().trim();
    const callerRole = (_d = (_c = context.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.role;
    const isAdminCaller = callerRole === 'ADMIN' || callerEmail === 'info@inglesinaitaliana.it';
    if (!context.auth || !isAdminCaller) {
        throw new functions.https.HttpsError('permission-denied', 'Riservato agli amministratori.');
    }
    const db = admin.firestore();
    // 1. Mappa email→uid da /team (uid-keyed).
    const teamSnap = await db.collection('team').get();
    const emailToUid = new Map();
    const knownUids = new Set();
    teamSnap.forEach((d) => {
        var _a;
        knownUids.add(d.id);
        const email = String(((_a = d.data()) === null || _a === void 0 ? void 0 : _a.email) || '').toLowerCase().trim();
        if (email)
            emailToUid.set(email, d.id);
    });
    // 2. Sweep di tutte le task (root + sotto-progetto via collectionGroup).
    const tasksSnap = await db.collectionGroup('tasks').get();
    let taskCount = 0, tasksWithAssignees = 0, assigneeRefs = 0;
    let emailMappable = 0, emailOrphan = 0, alreadyUid = 0, unknownNonEmail = 0;
    const orphanEmails = new Set();
    const unknownRefs = new Set();
    tasksSnap.forEach((d) => {
        var _a;
        taskCount++;
        const a = (_a = d.data()) === null || _a === void 0 ? void 0 : _a.assignees;
        if (!Array.isArray(a) || a.length === 0)
            return;
        tasksWithAssignees++;
        for (const raw of a) {
            if (typeof raw !== 'string' || !raw.trim())
                continue;
            assigneeRefs++;
            const v = raw.toLowerCase().trim();
            if (v.includes('@')) {
                if (emailToUid.has(v))
                    emailMappable++;
                else {
                    emailOrphan++;
                    orphanEmails.add(v);
                }
            }
            else if (knownUids.has(raw)) {
                alreadyUid++;
            }
            else {
                unknownNonEmail++;
                unknownRefs.add(raw);
            }
        }
    });
    return {
        teamMembers: teamSnap.size,
        taskCount,
        tasksWithAssignees,
        assigneeRefs,
        emailMappable,
        emailOrphan,
        alreadyUid,
        unknownNonEmail,
        orphanEmails: [...orphanEmails].sort(),
        unknownRefs: [...unknownRefs].slice(0, 50),
        readyForBackfill: unknownNonEmail === 0,
    };
});
/**
 * A3 — Backfill assignees email→UID (migrazione Strada B). Converte ogni assignee
 * email (con uid noto in /team) in uid, su tutte le task (collectionGroup: root
 * tasks e projects/{id}/tasks). Idempotente: riscrive SOLO gli array effettivamente
 * cambiati; voci già uid o non risolvibili (orfani esterni) restano invariate.
 * `dryRun` (default true): conta cosa cambierebbe SENZA scrivere.
 */
exports.backfillAssigneeUids = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e;
    const callerEmail = (((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) || '').toLowerCase().trim();
    const callerRole = (_d = (_c = context.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.role;
    const isAdminCaller = callerRole === 'ADMIN' || callerEmail === 'info@inglesinaitaliana.it';
    if (!context.auth || !isAdminCaller) {
        throw new functions.https.HttpsError('permission-denied', 'Riservato agli amministratori.');
    }
    const dryRun = (data === null || data === void 0 ? void 0 : data.dryRun) !== false; // default: anteprima senza scrivere
    const db = admin.firestore();
    // Mappa email→uid da /team (uid-keyed).
    const teamSnap = await db.collection('team').get();
    const emailToUid = new Map();
    teamSnap.forEach((d) => {
        var _a;
        const email = String(((_a = d.data()) === null || _a === void 0 ? void 0 : _a.email) || '').toLowerCase().trim();
        if (email)
            emailToUid.set(email, d.id);
    });
    const tasksSnap = await db.collectionGroup('tasks').get();
    let tasksScanned = 0, tasksChanged = 0, refsConverted = 0, refsUnresolved = 0;
    const unresolvedSamples = new Set();
    let batch = db.batch();
    let pending = 0;
    const commits = [];
    for (const taskDoc of tasksSnap.docs) {
        tasksScanned++;
        const a = (_e = taskDoc.data()) === null || _e === void 0 ? void 0 : _e.assignees;
        if (!Array.isArray(a) || a.length === 0)
            continue;
        let changed = false;
        const next = a.map((raw) => {
            if (typeof raw !== 'string' || !raw)
                return raw;
            const v = raw.toLowerCase().trim();
            if (v.includes('@')) {
                const uid = emailToUid.get(v);
                if (uid) {
                    changed = true;
                    refsConverted++;
                    return uid;
                }
                refsUnresolved++;
                unresolvedSamples.add(v);
                return raw; // orfano: resta email
            }
            return raw; // già uid (o stringa non-email)
        });
        if (changed) {
            tasksChanged++;
            if (!dryRun) {
                batch.update(taskDoc.ref, { assignees: next });
                pending++;
                if (pending >= 400) {
                    commits.push(batch.commit());
                    batch = db.batch();
                    pending = 0;
                }
            }
        }
    }
    if (!dryRun && pending > 0)
        commits.push(batch.commit());
    await Promise.all(commits);
    return {
        dryRun,
        tasksScanned,
        tasksChanged,
        refsConverted,
        refsUnresolved,
        unresolvedSamples: [...unresolvedSamples].slice(0, 50),
    };
});
/**
 * (N2) Backfill `members` sui messaggi esistenti.
 * La regola del collectionGroup `messages` concede la read solo a chi è in
 * `resource.data.members`. I messaggi creati prima del fix non hanno il campo →
 * questo backfill lo copia dai `members` della chat di origine (parent path),
 * con cache per-chat per evitare letture ripetute.
 * Admin-only. Default dryRun. Idempotente (scrive solo dove manca/diverge).
 */
exports.backfillMessageMembers = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f;
    const callerEmail = (((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) || '').toLowerCase().trim();
    const callerRole = (_d = (_c = context.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.role;
    const isAdminCaller = callerRole === 'ADMIN' || callerEmail === 'info@inglesinaitaliana.it';
    if (!context.auth || !isAdminCaller) {
        throw new functions.https.HttpsError('permission-denied', 'Riservato agli amministratori.');
    }
    const dryRun = (data === null || data === void 0 ? void 0 : data.dryRun) !== false; // default: anteprima senza scrivere
    const db = admin.firestore();
    const chatMembersCache = new Map();
    const msgsSnap = await db.collectionGroup('messages').get();
    let scanned = 0, changed = 0, skippedNoParent = 0, skippedNoMembers = 0;
    let batch = db.batch();
    let pending = 0;
    const commits = [];
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    for (const msgDoc of msgsSnap.docs) {
        scanned++;
        const chatRef = msgDoc.ref.parent.parent; // chats/{chatId}
        if (!chatRef) {
            skippedNoParent++;
            continue;
        }
        let members = chatMembersCache.get(chatRef.id);
        if (members === undefined) {
            const chatSnap = await chatRef.get();
            const m = (_e = chatSnap.data()) === null || _e === void 0 ? void 0 : _e.members;
            members = Array.isArray(m) ? m : [];
            chatMembersCache.set(chatRef.id, members);
        }
        if (members.length === 0) {
            skippedNoMembers++;
            continue;
        }
        const current = (_f = msgDoc.data()) === null || _f === void 0 ? void 0 : _f.members;
        if (Array.isArray(current) && sameSet(current, members))
            continue; // già allineato
        changed++;
        if (!dryRun) {
            batch.update(msgDoc.ref, { members });
            pending++;
            if (pending >= 400) {
                commits.push(batch.commit());
                batch = db.batch();
                pending = 0;
            }
        }
    }
    if (!dryRun && pending > 0)
        commits.push(batch.commit());
    await Promise.all(commits);
    return { dryRun, scanned, changed, skippedNoParent, skippedNoMembers, chatsRead: chatMembersCache.size };
});
// --- FUNZIONE RINNOVO TOKEN (ACCESS TOKEN MANAGER) ---
async function getValidFicToken() {
    var _a;
    const db = admin.firestore();
    const docRef = db.collection('config').doc('fic');
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new Error("Documento config/fic non trovato nel DB!");
    }
    const data = docSnap.data();
    if (!data)
        throw new Error("Dati mancanti in config/fic");
    const now = new Date();
    // Verifica se esiste una data di scadenza valida
    const expiryDate = data.token_scadenza ? data.token_scadenza.toDate() : new Date(0);
    // Se il token è ancora valido (mancano più di 5 minuti), usalo
    if (expiryDate > new Date(now.getTime() + 5 * 60000)) {
        return data.access_token;
    }
    console.log("[FIC] Token scaduto. Rinnovo in corso...");
    try {
        const response = await axios_1.default.post(`${FIC_API_URL}/oauth/token`, {
            grant_type: 'refresh_token',
            refresh_token: data.refresh_token,
            client_id: FIC_CLIENT_ID,
            client_secret: FIC_CLIENT_SECRET
        });
        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token; // FiC potrebbe ruotarlo
        const expiresIn = response.data.expires_in; // di solito 86400 (24h)
        // Calcola nuova scadenza
        const nuovaScadenza = new Date(now.getTime() + (expiresIn * 1000));
        // Salva tutto nel DB
        await docRef.update({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_scadenza: admin.firestore.Timestamp.fromDate(nuovaScadenza)
        });
        console.log("[FIC] Token rinnovato con successo.");
        return newAccessToken;
    }
    catch (error) {
        console.error("❌ ERRORE CRITICO rinnovo token:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        throw new Error("Impossibile rinnovare il token FiC");
    }
}
// --- FUNZIONE PRINCIPALE: GENERA ORDINE ---
exports.generaOrdineFIC = functions
    .region('europe-west1')
    .firestore
    .document('preventivi/{docId}')
    .onWrite(async (change, _context) => {
    var _a, _b, _c, _d, _e;
    const newData = change.after.data();
    if (!newData)
        return null;
    // 1. CONTROLLO TRIGGER (ORDER_REQ -> WAITING...)
    const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
    const eAttivato = statiAttivazione.includes(newData.stato);
    if (!eAttivato || newData.fic_order_id || newData.cic_order_id)
        return null;
    const clienteUID = newData.clienteUID;
    if (!clienteUID) {
        console.error("[FIC] ERRORE: Manca clienteUID nel preventivo.");
        return null;
    }
    // --- SELETTORE BACKEND (migrazione FiC→CiC) ---
    // Default ASSOLUTO = FiC (comportamento storico invariato). Il ramo CiC
    // parte SOLO se l'ordine è già marcato 'cic' o se config/billing.activeBackend='cic'.
    // Errori di lettura del flag → fallback 'fic'. Vedi resolveBillingBackend().
    const billingBackend = await resolveBillingBackend(newData);
    if (billingBackend === 'cic') {
        await generaOrdineCiC(change, newData, clienteUID);
        return null;
    }
    // --- da qui in giù: path FiC ESISTENTE, INVARIATO ---
    try {
        // RECUPERA TOKEN VALIDO (Nuova logica)
        const accessToken = await getValidFicToken();
        // 2. RECUPERA DATI UTENTE DA FIREBASE
        const userDoc = await admin.firestore().collection('users').doc(clienteUID).get();
        const userData = userDoc.data();
        // Usiamo la P.IVA salvata nell'utente
        const pivaCliente = userData === null || userData === void 0 ? void 0 : userData.piva;
        const ragioneSociale = (userData === null || userData === void 0 ? void 0 : userData.ragioneSociale) || newData.cliente;
        if (!pivaCliente) {
            console.error("[FIC] P.IVA mancante nell'anagrafica utente.");
            return null;
        }
        // 3. 🔥 RICERCA INTELLIGENTE SU FIC (LOOKUP)
        console.log(`[FIC] Cerco cliente con P.IVA: ${pivaCliente}...`);
        let ficId = null;
        // A. Ricerca esistente
        const searchRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { "q": `vat_number = '${pivaCliente}'` }
        });
        if (searchRes.data.data && searchRes.data.data.length > 0) {
            // TROVATO!
            ficId = searchRes.data.data[0].id;
            console.log(`[FIC] Cliente TROVATO. ID: ${ficId}`);
        }
        else {
            // B. NON TROVATO -> CREAZIONE
            console.log("[FIC] Cliente non trovato. Creazione in corso...");
            const createRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                data: {
                    name: ragioneSociale,
                    vat_number: pivaCliente,
                    email: (userData === null || userData === void 0 ? void 0 : userData.email) || "",
                    type: 'company'
                }
            }, { headers: { Authorization: `Bearer ${accessToken}` } });
            ficId = createRes.data.data.id;
            console.log(`[FIC] Nuovo Cliente creato. ID: ${ficId}`);
        }
        // 4. 🔥 RECUPERO DETTAGLI COMPLETI CLIENTE (GET Client)
        // Utilizziamo l'ID ottenuto per fare una chiamata GET specifica e ottenere indirizzi, codice fiscale, etc.
        console.log(`[FIC] Recupero dettagli completi cliente ID: ${ficId}...`);
        const clientDetailRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${ficId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { fieldset: 'detailed' } // 'detailed' per avere indirizzi e dati extra
        });
        const detailedClient = clientDetailRes.data.data;
        // 5. ESTRAZIONE DATI PAGAMENTO (Dai dettagli completi)
        const defaultPaymentMethodId = ((_a = detailedClient.default_payment_method) === null || _a === void 0 ? void 0 : _a.id) || null;
        // 6. CALCOLI ECONOMICI
        //const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
        const dataOrdine = newData.dataConsegnaPrevista || new Date().toISOString().split('T')[0];
        const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
        // --- FIX MATEMATICO FATTURE IN CLOUD ---
        // 1. Calcolo IVA arrotondata al centesimo (usando Math.round per evitare problemi di virgola mobile in JS)
        // 2. Somma Netto + IVA (esattamente come fa FiC)
        // ---------------------------------------
        const productsSnap = await admin.firestore().collection('products').get();
        const productMap = new Map();
        productsSnap.forEach(doc => {
            const p = doc.data();
            if (p.code)
                productMap.set(p.code.toUpperCase().trim(), p.id); // Mappa CODICE -> ID_FIC
        });
        // 7. PREPARAZIONE RIGHE ORDINE
        const itemsList = (newData.elementi || []).map((item) => {
            // --- MODIFICA: Gestione Descrizione Intelligente ---
            // Se è un EXTRA (Spedizione, Lavorazioni) o ha misure a 0, lasciamo la descrizione vuota
            // altrimenti mettiamo le dimensioni come sempre.
            let desc = "";
            if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) {
                desc = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            }
            // --------------------------------------------------
            // Cerchiamo il codice prodotto
            const itemCode = item.codice ? item.codice.toUpperCase().trim() : null;
            const ficProductId = itemCode ? productMap.get(itemCode) : null;
            const lineItem = {
                code: itemCode || "",
                name: item.descrizioneCompleta || "Articolo Vetrata",
                description: desc, // <--- Ora sarà vuota per la spedizione
                qty: item.quantita || 1,
                net_price: item.prezzo_unitario || 0,
                category: item.categoria,
                vat: { id: VAT_ID, value: VAT_VALUE }
            };
            if (ficProductId) {
                lineItem.product_id = ficProductId;
            }
            return lineItem;
        });
        // Fix Sconto: Calcolo discrepanza tra somma righe e totale atteso
        const sumItemsNet = itemsList.reduce((acc, cur) => acc + (cur.net_price * cur.qty), 0);
        // Se la somma delle righe supera l'importo netto atteso (con tolleranza 0.05), aggiungi riga sconto
        if (sumItemsNet > importoNetto + 0.05) {
            const discountValue = parseFloat((sumItemsNet - importoNetto).toFixed(2));
            console.log(`[FIC] Rilevato sconto globale. Aggiungo riga correttiva di -${discountValue}€`);
            itemsList.push({
                code: "SCONTO",
                name: "Sconto Commerciale",
                qty: 1,
                net_price: -discountValue,
                vat: { id: VAT_ID, value: VAT_VALUE }
            });
        }
        // 8. PREPARAZIONE PAYLOAD BASE (Senza payments_list inizialmente)
        const orderPayload = {
            data: {
                type: "order",
                entity: {
                    id: ficId,
                    name: detailedClient.name,
                    vat_number: detailedClient.vat_number || "",
                    tax_code: detailedClient.tax_code || "",
                    address_street: detailedClient.address_street || "",
                    address_postal_code: detailedClient.address_postal_code || "",
                    address_city: detailedClient.address_city || "",
                    address_province: detailedClient.address_province || "",
                    country: detailedClient.country || "Italia"
                },
                date: dataOrdine,
                visible_subject: newData.commessa || `Rif: ${newData.codice}`,
                items_list: itemsList,
                stock: false,
                show_payments: false,
                show_payment_method: false
            }
        };
        // Impostiamo il metodo di pagamento globale se presente
        if (defaultPaymentMethodId) {
            orderPayload.data.payment_method = { id: defaultPaymentMethodId };
        }
        // 9. INVIO A FATTURE IN CLOUD CON LOGICA "RETRY" (Anti-errore 422)
        let orderRes;
        try {
            console.log("[FIC] Tentativo 1: Creazione ordine (calcolo automatico)...");
            orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }
        catch (firstError) {
            // Verifichiamo se è l'errore specifico "Il totale dei pagamenti non corrisponde..."
            const errorData = (_b = firstError.response) === null || _b === void 0 ? void 0 : _b.data;
            const isPaymentMismatch = ((_c = firstError.response) === null || _c === void 0 ? void 0 : _c.status) === 422 &&
                ((_e = (_d = errorData === null || errorData === void 0 ? void 0 : errorData.extra) === null || _d === void 0 ? void 0 : _d.totals) === null || _e === void 0 ? void 0 : _e.amount_gross);
            if (isPaymentMismatch) {
                // 🔥 QUI STA IL TRUCCO:
                // Non calcoliamo nulla. Leggiamo il numero che FIC ci ha appena detto essere quello giusto.
                const ficCalculatedTotal = errorData.extra.totals.amount_gross;
                console.warn(`[FIC] Tentativo 1 fallito. FIC richiede totale: ${ficCalculatedTotal}€. Applico fix e riprovo.`);
                // Modifichiamo il payload aggiungendo la lista pagamenti forzata con il LORO numero
                orderPayload.data.payments_list = [
                    {
                        amount: ficCalculatedTotal, // Usiamo il valore esatto restituito dall'errore
                        due_date: dataOrdine, // Usiamo la data ordine come scadenza
                        status: 'not_paid',
                        payment_method: defaultPaymentMethodId ? { id: defaultPaymentMethodId } : null
                    }
                ];
                // TENTATIVO 2: Invio con i dati corretti forniti da FIC stesso
                console.log("[FIC] Tentativo 2: Creazione ordine con totale forzato...");
                orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
            }
            else {
                // Se è un errore diverso (es. autenticazione, server down), lo lanciamo e basta
                throw firstError;
            }
        }
        console.log(`✅ [FIC] ORDINE CREATO SUCCESSO! ID FIC: ${orderRes.data.data.id}`);
        await change.after.ref.update({
            fic_order_id: orderRes.data.data.id,
            fic_order_url: orderRes.data.data.url,
        });
    }
    catch (error) {
        console.error("❌ [FIC] Errore:", error.message);
        if (error.response) {
            console.error("Dettaglio errore API:", JSON.stringify(error.response.data, null, 2));
        }
    }
    return null;
});
// --- Risoluzione backend di fatturazione (frozen sul preventivo, default FiC) ---
// Se l'ordine ha già billingBackend → si rispetta (scelta congelata). Altrimenti
// si legge config/billing.activeBackend. Qualunque errore → 'fic' (mai rompere il flusso).
async function resolveBillingBackend(_newData) {
    // Il routing dei NUOVI documenti dipende SOLO dal flag globale config/billing,
    // NON dal campo billingBackend del preventivo (scrivibile dal client → potrebbe
    // forzare il ramo CiC bypassando la dormienza). Gli ordini già creati non
    // ri-arrivano qui (guard fic_order_id/cic_order_id nel trigger).
    try {
        return await (0, lib_billing_1.getActiveBackend)();
    }
    catch (e) {
        console.warn('[BILLING] lettura config/billing fallita, fallback FiC', e);
        return 'fic';
    }
}
// --- GENERA ORDINE SU CONTABILITÀ IN CLOUD (CiC/Reviso) ---
// Gemello di generaOrdineFIC per il nuovo backend. ADDITIVO: invocato SOLO quando
// billingBackend === 'cic'. Anti-duplicato: scrive cic_order_id appena disponibile
// (il guard di re-entry blocca i ri-trigger). In caso di errore PRIMA di avere l'id
// NON scrive nulla sul doc (come il path FiC) → niente loop, niente ordini doppi.
async function generaOrdineCiC(change, newData, clienteUID) {
    try {
        const userDoc = await admin.firestore().collection('users').doc(clienteUID).get();
        const userData = userDoc.data();
        const pivaCliente = userData === null || userData === void 0 ? void 0 : userData.piva;
        if (!pivaCliente) {
            console.error('[CIC] P.IVA mancante nell\'anagrafica utente.');
            return;
        }
        const provider = await (0, lib_billing_1.createCicProvider)();
        const customer = await provider.findOrCreateCustomer({
            piva: pivaCliente,
            name: (userData === null || userData === void 0 ? void 0 : userData.ragioneSociale) || newData.cliente || 'Cliente',
            email: userData === null || userData === void 0 ? void 0 : userData.email,
            taxCode: userData === null || userData === void 0 ? void 0 : userData.codiceFiscale,
            address: userData === null || userData === void 0 ? void 0 : userData.indirizzo,
            zip: userData === null || userData === void 0 ? void 0 : userData.cap,
            city: userData === null || userData === void 0 ? void 0 : userData.citta,
            province: userData === null || userData === void 0 ? void 0 : userData.provincia,
        });
        const lines = (newData.elementi || []).map((item) => {
            let desc = item.descrizioneCompleta || 'Articolo Vetrata';
            if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) {
                desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            }
            return {
                code: item.codice ? String(item.codice).toUpperCase().trim() : '',
                description: desc,
                qty: item.quantita || 1,
                unitNetPrice: item.prezzo_unitario || 0,
                category: item.categoria,
            };
        });
        const result = await provider.createOrder({
            customer,
            date: newData.dataConsegnaPrevista || new Date().toISOString().split('T')[0],
            lines,
            discountPercentage: Number(newData.scontoPercentuale) || 0,
            visibleSubject: newData.commessa || `Rif: ${newData.codice}`,
        });
        // id salvato SUBITO → blocca i ri-trigger (anti-duplicato)
        await change.after.ref.update({
            cic_order_id: result.id,
            cic_order_url: result.url || null,
            billingBackend: 'cic',
            billingError: admin.firestore.FieldValue.delete(),
        });
        // validazione totali NON bloccante: la cifra cliente deve combaciare al centesimo.
        // Confronto contro netCanonico (regola CiC, salvato sempre) → metodologia coerente,
        // niente falsi errori per doc salvati prima del cutover. Fallback per doc vecchi.
        const expectedNet = (typeof newData.netCanonico === 'number')
            ? newData.netCanonico
            : (typeof newData.totaleScontato === 'number')
                ? newData.totaleScontato
                : (newData.totaleImponibile || 0);
        if (Math.abs((result.netAmount || 0) - expectedNet) > 0.01) {
            await change.after.ref.update({
                billingError: `Totale CiC ${result.netAmount} ≠ atteso POPS ${expectedNet}`,
            });
            console.warn(`[CIC] Discrepanza totale: CiC ${result.netAmount} vs atteso ${expectedNet}`);
        }
        console.log(`✅ [CIC] ORDINE CREATO! ID: ${result.id}`);
    }
    catch (error) {
        // come il path FiC: logga e basta, NESSUNA scrittura sul doc → niente
        // ri-trigger e niente ordini duplicati su CiC.
        console.error('❌ [CIC] Errore creazione ordine:', (error === null || error === void 0 ? void 0 : error.message) || error);
        if (error === null || error === void 0 ? void 0 : error.response) {
            console.error('Dettaglio errore API CiC:', JSON.stringify(error.response.data, null, 2));
        }
    }
}
// --- DDT CUMULATIVO SU CONTABILITÀ IN CLOUD (CiC) ---
// Gemello CiC di creaDdtCumulativo. Reviso non ha il "join" ordini→DDT: POPS
// assembla le righe dai preventivi in Firestore. Il DDT è un documento di
// trasporto → elenca la MERCE (righe non-EXTRA); i prezzi non sono rilevanti.
async function creaDdtCumulativoCiC(orderIds, data) {
    var _a, _b;
    const { date, colli, weight, tipoTrasporto, corriere, tracking } = data;
    const db = admin.firestore();
    try {
        const snaps = await Promise.all(orderIds.map((id) => db.collection('preventivi').doc(id).get()));
        const orders = snaps
            .map((s) => ({ firestoreId: s.id, data: s.data() }))
            .filter((o) => !!o.data && !!o.data.cic_order_id);
        if (orders.length === 0)
            return { success: false, message: 'Nessun ordine CiC valido trovato.' };
        // Cliente dal primo ordine (un DDT cumulativo è per singolo cliente)
        const clienteUID = orders[0].data.clienteUID;
        const userData = clienteUID
            ? (await db.collection('users').doc(clienteUID).get()).data()
            : undefined;
        const piva = userData === null || userData === void 0 ? void 0 : userData.piva;
        if (!piva)
            return { success: false, message: 'P.IVA cliente mancante.' };
        const provider = await (0, lib_billing_1.createCicProvider)();
        const customer = await provider.findOrCreateCustomer({
            piva,
            name: (userData === null || userData === void 0 ? void 0 : userData.ragioneSociale) || orders[0].data.cliente || 'Cliente',
            email: userData === null || userData === void 0 ? void 0 : userData.email,
            taxCode: userData === null || userData === void 0 ? void 0 : userData.codiceFiscale,
            address: userData === null || userData === void 0 ? void 0 : userData.indirizzo,
            zip: userData === null || userData === void 0 ? void 0 : userData.cap,
            city: userData === null || userData === void 0 ? void 0 : userData.citta,
            province: userData === null || userData === void 0 ? void 0 : userData.provincia,
        });
        // Righe = merce trasportata (escludo gli EXTRA: spedizione/lavorazioni).
        const lines = [];
        for (const o of orders) {
            for (const item of (o.data.elementi || [])) {
                if (item.categoria === 'EXTRA')
                    continue;
                let desc = item.descrizioneCompleta || 'Articolo Vetrata';
                if (item.base_mm > 0 || item.altezza_mm > 0) {
                    desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`;
                }
                lines.push({
                    code: item.codice ? String(item.codice).toUpperCase().trim() : '',
                    description: desc,
                    qty: item.quantita || 1,
                    unitNetPrice: item.prezzo_unitario || 0,
                    category: item.categoria,
                });
            }
        }
        if (lines.length === 0)
            return { success: false, message: 'Nessuna riga merce da spedire.' };
        const ddt = await provider.createDeliveryNote({
            customer,
            date,
            lines,
            shipping: {
                packages: Number(colli) || 1,
                weight: weight ? Number(weight) : undefined,
                carrier: tipoTrasporto === 'COURIER' ? corriere : undefined,
                tracking: tipoTrasporto === 'COURIER' ? tracking : undefined,
                transportType: tipoTrasporto === 'COURIER' ? 'COURIER' : 'INTERNAL',
            },
        });
        const batch = db.batch();
        const nuovoStato = tipoTrasporto === 'COURIER' ? 'SHIPPED' : 'DELIVERY';
        for (const o of orders) {
            const ref = db.collection('preventivi').doc(o.firestoreId);
            batch.update(ref, {
                cic_ddt_id: ddt.id,
                cic_ddt_number: (_a = ddt.number) !== null && _a !== void 0 ? _a : null,
                cic_ddt_url: (_b = ddt.url) !== null && _b !== void 0 ? _b : null,
                stato: nuovoStato,
                dataConsegnaPrevista: date,
                colli: colli != null ? Number(colli) : null,
                metodoSpedizione: tipoTrasporto,
                corriere: tipoTrasporto === 'COURIER' ? corriere : null,
                trackingCode: tipoTrasporto === 'COURIER' ? tracking : null,
                dataSpedizione: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
        return { success: true, cic_id: ddt.id };
    }
    catch (error) {
        console.error('❌ [CIC DDT] Errore:', (error === null || error === void 0 ? void 0 : error.response) ? JSON.stringify(error.response.data) : error === null || error === void 0 ? void 0 : error.message);
        return { success: false, message: 'Errore CiC: ' + ((error === null || error === void 0 ? void 0 : error.message) || 'sconosciuto') };
    }
}
// --- FUNZIONE CREAZIONE DDT (UNIFICATA) ---
exports.creaDdtCumulativo = functions
    .region('europe-west1')
    .https.onCall(async (data, _context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const { orderIds, date, colli, weight, tipoTrasporto, corriere, tracking } = data;
    if (!orderIds || orderIds.length === 0) {
        return { success: false, message: "Nessun ordine selezionato." };
    }
    try {
        const db = admin.firestore();
        // --- SELETTORE BACKEND: tutti gli ordini devono stare sullo stesso backend ---
        const allSnaps = await Promise.all(orderIds.map((id) => db.collection('preventivi').doc(id).get()));
        const backends = allSnaps.map((s) => {
            const dd = s.data();
            return dd && (dd.billingBackend === 'cic' || dd.cic_order_id) ? 'cic' : 'fic';
        });
        if (backends.includes('cic') && backends.includes('fic')) {
            return { success: false, message: 'Ordini di backend diversi (FiC/CiC) nello stesso DDT.' };
        }
        if (backends[0] === 'cic') {
            return await creaDdtCumulativoCiC(orderIds, data);
        }
        const accessToken = await getValidFicToken();
        // 1. Recupera i documenti da Firestore
        const orderSnapshots = await Promise.all(orderIds.map((id) => db.collection('preventivi').doc(id).get()));
        const ordersData = [];
        for (const snap of orderSnapshots) {
            const d = snap.data();
            if (d && d.fic_order_id) {
                ordersData.push({ firestoreId: snap.id, ficId: d.fic_order_id, data: d });
            }
        }
        if (ordersData.length === 0) {
            return { success: false, message: "Nessun ID FiC valido trovato." };
        }
        // Calcolo Oggetto
        const listCommesse = ordersData.map(o => (o.data.commessa && o.data.commessa.trim() !== "") ? o.data.commessa : o.data.codice);
        const uniqueCommesse = [...new Set(listCommesse)];
        const visibleSubject = uniqueCommesse.join(' - ');
        const ficIdsToJoin = ordersData.map(o => o.ficId);
        const joinUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/join`;
        // 2. CHIAMATA JOIN
        const joinResponse = await axios_1.default.get(joinUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                ids: ficIdsToJoin.join(','),
                type: 'delivery_note'
            }
        });
        const joinedData = joinResponse.data.data;
        // =================================================================================
        // 🔥 LOGICA UNIFICAZIONE SPEDIZIONI (MODIFICA RICHIESTA)
        // =================================================================================
        let finalItems = joinedData.items_list || [];
        // 1. Troviamo tutte le righe che corrispondono ai codici di consegna noti
        const shippingItems = finalItems.filter((item) => DELIVERY_TARIFF_CODES.includes(item.name) // Controlla se il nome è uno dei codici
        );
        // 2. Se abbiamo trovato spedizioni, procediamo all'unificazione
        if (shippingItems.length > 0) {
            // A. Rimuoviamo TUTTE le righe spedizione dalla lista principale
            finalItems = finalItems.filter((item) => !DELIVERY_TARIFF_CODES.includes(item.name));
            // B. Troviamo la spedizione con il prezzo più alto (Logica: nel cumulativo paga la tariffa maggiore)
            // Ordiniamo decrescente per prezzo
            shippingItems.sort((a, b) => (b.net_price || 0) - (a.net_price || 0));
            // C. Prendiamo la "vincente"
            const bestShippingItem = shippingItems[0];
            // D. Forziamo quantità a 1 e la aggiungiamo in coda
            bestShippingItem.qty = 1;
            // Opzionale: Se vuoi che il nome cambi dinamicamente in base alla selezione della modale:
            if (tipoTrasporto === 'COURIER') {
                bestShippingItem.name = 'Spedizione'; // Uniforma il nome se è corriere
            }
            // Se è INTERNAL, manteniamo il nome originale (es. "Consegna Diretta V2") che ha il prezzo corretto
            finalItems.push(bestShippingItem);
        }
        // =================================================================================
        // 3. RECUPERO DETTAGLI CLIENTE (Strategia Ibrida: ID o P.IVA)
        let detailedClient = null;
        // A. Tentativo per ID (se presente nel join)
        if (joinedData.entity && joinedData.entity.id) {
            try {
                const clientDetailRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${joinedData.entity.id}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { fieldset: 'detailed' } // Fondamentale per avere via e CAP
                });
                detailedClient = clientDetailRes.data.data;
            }
            catch (err) {
                console.warn("[FIC] Recupero cliente per ID fallito, tento fallback P.IVA...");
            }
        }
        // B. Tentativo per P.IVA (Se ID mancante o fetch fallita)
        // Utilizziamo l'helper 'fetchFicClientByVat' che ora è robusto e scarica i dettagli
        if (!detailedClient && joinedData.entity && joinedData.entity.vat_number) {
            console.log(`[DDT] Tento recupero indirizzo tramite P.IVA: ${joinedData.entity.vat_number}`);
            detailedClient = await fetchFicClientByVat(joinedData.entity.vat_number, accessToken);
        }
        // C. Costruzione Dati Entity (con Indirizzo Garantito)
        const entityData = detailedClient ? {
            id: detailedClient.id,
            name: detailedClient.name,
            vat_number: detailedClient.vat_number || "",
            tax_code: detailedClient.tax_code || "",
            // Mappatura esplicita campi indirizzo
            address_street: detailedClient.address_street || "",
            address_postal_code: detailedClient.address_postal_code || "",
            address_city: detailedClient.address_city || "",
            address_province: detailedClient.address_province || "",
            country: detailedClient.country || "Italia"
        } : joinedData.entity;
        // 4. COSTRUZIONE PAYLOAD (Usa finalItems invece di joinedData.items_list)
        const finalDocData = {
            type: 'delivery_note',
            entity: entityData,
            date: date,
            visible_subject: visibleSubject,
            currency: joinedData.currency,
            language: joinedData.language,
            items_list: finalItems, // <--- LISTA PULITA
            payments_list: joinedData.payments_list,
            dn_ai_packages_number: colli.toString(),
            dn_ai_causal: "VENDITA",
            dn_ai_transporter: tipoTrasporto === 'COURIER' ? corriere : 'MITTENTE',
            c_driver_and_contents: {
                packages_number: parseInt(colli),
                transport_causal: "VENDITA"
            }
        };
        if (weight && Number(weight) > 0) {
            finalDocData.dn_ai_weight = weight.toString();
        }
        if (joinedData.notes)
            finalDocData.notes = joinedData.notes;
        // 5. CREAZIONE (POST)
        const createUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`;
        const createRes = await axios_1.default.post(createUrl, { data: finalDocData }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const newDdt = createRes.data.data;
        console.log(`[FIC] DDT Creato: ID ${newDdt.id}`);
        // 6. AGGIORNAMENTO FIRESTORE
        const batch = db.batch();
        const nuovoStato = tipoTrasporto === 'COURIER' ? 'SHIPPED' : 'DELIVERY';
        ordersData.forEach(o => {
            const ref = db.collection('preventivi').doc(o.firestoreId);
            batch.update(ref, {
                fic_ddt_id: newDdt.id,
                fic_ddt_url: newDdt.url,
                fic_ddt_number: newDdt.number,
                stato: nuovoStato,
                dataConsegnaPrevista: date,
                metodoSpedizione: tipoTrasporto,
                corriere: tipoTrasporto === 'COURIER' ? corriere : null,
                trackingCode: tipoTrasporto === 'COURIER' ? tracking : null,
                dataSpedizione: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        return { success: true, fic_id: newDdt.id };
    }
    catch (error) {
        console.error("❌ Errore API FiC:", JSON.stringify(((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message, null, 2));
        const dettagliErrore = ((_d = (_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.validation_errors)
            ? JSON.stringify(error.response.data.error.validation_errors)
            : (((_g = (_f = (_e = error.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.error) === null || _g === void 0 ? void 0 : _g.message) || error.message);
        return { success: false, message: "Errore FiC: " + dettagliErrore };
    }
});
// --- Bug tracker Firestore (SIDERA CORE) — sostituisce submitBugToNotion ---
const _bugFns = (0, bugs_1.registerBugFunctions)();
exports.submitBug = _bugFns.submitBug;
exports.updateBug = _bugFns.updateBug;
exports.promoteBugToTask = _bugFns.promoteBugToTask;
exports.importBugsFromNotion = _bugFns.importBugsFromNotion;
// --- LISTE POP CULTURE PER PASSWORD ---
const POP_ICONS = [
    "Ironman", "Batman", "Spiderman", "Thor", "Hulk", "WonderWoman", "Superman",
    "Joker", "Yoda", "Gandalf", "Frodo", "HarryPotter", "Skywalker", "Matrix",
    "IndianaJones", "Rocky", "Rambo", "Terminator", "Godfather", "Gladiator",
    "Bond", "Sherlock", "Dracula", "Zorro", "Tarzan", "RobinHood", "Vader"
];
function generatePopPassword() {
    const icon = POP_ICONS[Math.floor(Math.random() * POP_ICONS.length)];
    const number = Math.floor(Math.random() * 90) + 10; // 10-99
    return `${icon}${number}!`;
}
// --- CONFIGURAZIONE EMAIL (Gmail SMTP) ---
const mailTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_PASSWORD
    }
});
// --- HELPER: RECUPERA CLIENTE DA FIC (ROBUST & DETAILED) ---
async function fetchFicClientByVat(vatNumber, token) {
    if (!vatNumber)
        return null;
    const cleanVat = vatNumber.trim().toUpperCase();
    const vatNoIT = cleanVat.replace(/^IT/, '');
    const vatWithIT = 'IT' + vatNoIT;
    // Helper per la chiamata di ricerca base
    const searchClient = async (v) => {
        try {
            const res = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { q: `vat_number = '${v}'` }
            });
            return res.data.data || [];
        }
        catch (e) {
            console.warn(`[FIC SEARCH FAIL] ${v}`, e.message);
            return [];
        }
    };
    // 1. Tenta la ricerca con diverse varianti della P.IVA
    let results = await searchClient(cleanVat);
    if (results.length === 0 && cleanVat !== vatNoIT) {
        results = await searchClient(vatNoIT);
    }
    if (results.length === 0 && cleanVat !== vatWithIT) {
        results = await searchClient(vatWithIT);
    }
    if (results.length === 0)
        return null;
    // 2. TROVATO! Ora recuperiamo il DETTAGLIO (Cruciale per indirizzo e CAP)
    const basicClient = results[0];
    try {
        const detailRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${basicClient.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { fieldset: 'detailed' } // <--- QUESTO POPOLA address_street e address_postal_code
        });
        return detailRes.data.data;
    }
    catch (e) {
        console.warn(`[FIC DETAIL FAIL] ID ${basicClient.id}`, e.message);
        return basicClient; // Fallback al base se il dettaglio fallisce
    }
}
// --- FUNZIONE 1: IMPORTAZIONE MASSIVA (O SINGOLA) ---
// Non invia mail, crea solo le anagrafiche "dormienti"
exports.importClientsFromFiC = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540 }) // Timeout lungo per import massivi
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const vatNumbers = data.vatNumbers || [];
    const results = { success: 0, failed: 0, errors: [] };
    try {
        const token = await getValidFicToken();
        const db = admin.firestore();
        const auth = admin.auth();
        for (const piva of vatNumbers) {
            // 1. Cerca su FiC
            const ficClient = await fetchFicClientByVat(piva, token);
            if (!ficClient) {
                results.failed++;
                results.errors.push(`${piva}: Non trovato su Fatture in Cloud`);
                continue;
            }
            // Dati essenziali
            const email = ficClient.email;
            if (!email) {
                results.failed++;
                results.errors.push(`${piva} (${ficClient.name}): Email mancante su FiC`);
                continue;
            }
            // 2. Crea/Aggiorna Utente Firebase
            let uid;
            try {
                // Cerca se esiste già
                const userRecord = await auth.getUserByEmail(email);
                uid = userRecord.uid;
            }
            catch (e) {
                if (e.code === 'auth/user-not-found') {
                    // Crea nuovo utente DISABILITATO (senza password per ora)
                    const newUser = await auth.createUser({
                        email: email,
                        displayName: ficClient.name,
                        disabled: true // Importante: non può accedere
                    });
                    uid = newUser.uid;
                }
                else {
                    throw e;
                }
            }
            // 3. Salva Anagrafica su Firestore
            const userData = {
                ragioneSociale: ficClient.name,
                piva: ficClient.vat_number,
                codiceFiscale: ficClient.tax_code || '',
                email: email,
                indirizzo: ficClient.address_street || '',
                cap: ficClient.address_postal_code || '',
                citta: ficClient.address_city || '',
                provincia: ficClient.address_province || '',
                ficId: ficClient.id,
                dataImportazione: admin.firestore.FieldValue.serverTimestamp()
            };
            // Controlla se il documento esiste già per preservare lo stato
            const userRef = db.collection('users').doc(uid);
            const userSnap = await userRef.get();
            if (!userSnap.exists) {
                // SE NUOVO: Imposta i default per l'invito
                userData.status = 'PENDING_INVITE';
                userData.mustChangePassword = true;
            }
            // SE ESISTE: Non tocchiamo 'status' né 'mustChangePassword',
            // così se è già ACTIVE resta ACTIVE.
            // Salva con merge (aggiorna anagrafica, preserva il resto)
            await userRef.set(userData, { merge: true });
            results.success++;
        }
        return results;
    }
    catch (e) {
        console.error("Errore importazione", e);
        throw new functions.https.HttpsError('internal', e.message);
    }
});
// --- FUNZIONE 2: INVIO INVITI (ATTIVAZIONE) ---
// Genera password, abilita account, invia mail
exports.sendInvitesToClients = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const uids = data.uids || []; // Lista ID utenti da invitare
    const results = { sent: 0, failed: 0 };
    const db = admin.firestore();
    const auth = admin.auth();
    for (const uid of uids) {
        try {
            // 1. Recupera dati attuali
            const userDoc = await db.collection('users').doc(uid).get();
            if (!userDoc.exists)
                continue;
            const userData = userDoc.data();
            // 2. Genera Password Pop
            const tempPassword = generatePopPassword();
            // 3. Aggiorna Auth (Abilita + Password)
            await auth.updateUser(uid, {
                password: tempPassword,
                disabled: false // ORA PUÒ ACCEDERE
            });
            // 4. Invia Email
            const mailOptions = {
                from: '"Inglesina Italiana B2B" <info@inglesinaitaliana.it>',
                to: userData === null || userData === void 0 ? void 0 : userData.email,
                subject: 'Benvenuto nel Portale B2B Inglesina Italiana 🚀',
                html: `
                            <div style="font-family: Arial, sans-serif; color: #333;">
                                <h2>Benvenuto ${userData === null || userData === void 0 ? void 0 : userData.ragioneSociale}!</h2>
                                <p>Siamo felici di darti il benvenuto nel nuovo portale ordini B2B.</p>
                                <p>Abbiamo creato il tuo account. Ecco le tue credenziali provvisorie:</p>
                                <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                    <p><strong>Username:</strong> ${userData === null || userData === void 0 ? void 0 : userData.email}</p>
                                    <p><strong>Password:</strong> <span style="font-size: 1.2em; color: #d35400;">${tempPassword}</span></p>
                                </div>
                                <p>Accedi qui: <a href="https://preventivatoreb2b-ii.web.app">Portale B2B</a></p>
                                <p><em>Al primo accesso ti verrà chiesto di cambiare la password.</em></p>
                            </div>
                        `
            };
            await mailTransport.sendMail(mailOptions);
            // 5. Aggiorna Stato DB
            await db.collection('users').doc(uid).update({
                status: 'ACTIVE',
                dataInvito: admin.firestore.FieldValue.serverTimestamp()
            });
            results.sent++;
        }
        catch (e) {
            console.error(`Errore invito ${uid}`, e);
            results.failed++;
        }
    }
    return results;
});
// --- FUNZIONE 3: RESET ORDINE (SBLOCCO) ---
// Cancella l'ordine su FiC e resetta lo stato su Firestore
exports.resetOrderState = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    // 1. Verifica Autenticazione (Opzionale: puoi restringere agli admin se vuoi)
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const orderId = data.orderId;
    if (!orderId)
        throw new functions.https.HttpsError('invalid-argument', 'ID ordine mancante');
    const db = admin.firestore();
    const docRef = db.collection('preventivi').doc(orderId);
    try {
        const docSnap = await docRef.get();
        if (!docSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Ordine non trovato');
        const orderData = docSnap.data();
        const ficId = orderData === null || orderData === void 0 ? void 0 : orderData.fic_order_id;
        // 2. Se esiste su Fatture in Cloud, ELIMINALO
        if (ficId) {
            try {
                const token = await getValidFicToken();
                console.log(`[RESET] Eliminazione ordine FiC ID: ${ficId}...`);
                await axios_1.default.delete(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/${ficId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log(`[RESET] Ordine FiC eliminato correttamente.`);
            }
            catch (ficError) {
                console.error("[RESET] Errore eliminazione FiC (procedo comunque al reset DB):", ficError.message);
                // Non blocchiamo il reset del DB se FiC fallisce (es. già cancellato)
            }
        }
        // 2b. Se esiste su Contabilità in Cloud, ELIMINALO
        const cicId = orderData === null || orderData === void 0 ? void 0 : orderData.cic_order_id;
        if (cicId) {
            try {
                console.log(`[RESET] Eliminazione ordine CiC ID: ${cicId}...`);
                const provider = await (0, lib_billing_1.createCicProvider)();
                await provider.deleteDocument({ id: cicId, type: 'order' });
                console.log(`[RESET] Ordine CiC eliminato correttamente.`);
            }
            catch (cicError) {
                console.error("[RESET] Errore eliminazione CiC (procedo comunque al reset DB):", cicError.message);
            }
        }
        // 3. Resetta lo stato e pulisce i campi su Firestore
        await docRef.update({
            stato: 'DRAFT',
            fic_order_id: admin.firestore.FieldValue.delete(),
            fic_order_url: admin.firestore.FieldValue.delete(),
            cic_order_id: admin.firestore.FieldValue.delete(),
            cic_order_url: admin.firestore.FieldValue.delete(),
            cic_ddt_id: admin.firestore.FieldValue.delete(),
            cic_ddt_url: admin.firestore.FieldValue.delete(),
            cic_ddt_number: admin.firestore.FieldValue.delete(),
            billingBackend: admin.firestore.FieldValue.delete(),
            billingError: admin.firestore.FieldValue.delete(),
            dataConferma: admin.firestore.FieldValue.delete(),
            metodoConferma: admin.firestore.FieldValue.delete(),
            contrattoFirmatoUrl: admin.firestore.FieldValue.delete(),
            datiLegali: admin.firestore.FieldValue.delete(),
            isReopened: true, // Flag che indica che è un ex-ordine
            // Opzionale: Traccia chi ha fatto il reset
            resetBy: context.auth.token.email || context.auth.uid,
            lastResetDate: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    }
    catch (e) {
        console.error("[RESET] Errore critico:", e);
        throw new functions.https.HttpsError('internal', e.message);
    }
});
// ============================================================================
// PULSAR — Push notification su nuovo messaggio chat
// ============================================================================
// Trigger Firestore: ogni nuovo messaggio in chats/{chatId}/messages/{msgId}
// → legge i membri della chat → carica i loro fcmTokens dal team doc
// → invia push FCM a tutti tranne il mittente.
exports.onNewPulsarMessage = functions
    .region('europe-west1')
    .firestore.document('chats/{chatId}/messages/{msgId}')
    .onCreate(async (snap, context) => {
    var _a;
    const msg = snap.data();
    const chatId = context.params.chatId;
    const sender = ((msg === null || msg === void 0 ? void 0 : msg.from) || '').toLowerCase().trim();
    if (!msg || !msg.text)
        return null;
    const db = admin.firestore();
    try {
        // 1. Carica la chat per avere members + nome
        const chatSnap = await db.collection('chats').doc(chatId).get();
        if (!chatSnap.exists)
            return null;
        const chatData = chatSnap.data() || {};
        const members = chatData.members || [];
        const chatName = chatData.name || '';
        // 2. Target = tutti i membri tranne il sender
        // …e tranne chi ha la chat APERTA in primo piano: la presence
        // (chats/{chatId}.activeViewers[email]) viene rinfrescata ~ogni 45s
        // dalla view; consideriamo "presente" solo un timestamp recente,
        // così un cleanup mancato (crash) non silenzia le push per sempre.
        const PRESENCE_FRESH_MS = 90 * 1000;
        const now = Date.now();
        const activeViewers = (chatData.activeViewers || {});
        const isViewing = (email) => {
            const ts = activeViewers[email];
            const ms = ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
            return ms > 0 && (now - ms) < PRESENCE_FRESH_MS;
        };
        const targets = members
            .map((m) => (m || '').toLowerCase().trim())
            .filter((m) => m && m !== sender && !isViewing(m));
        if (!targets.length)
            return null;
        // 3. Carica fcmTokens dai documenti team
        // Schema entry: nuovo = { ts, scope, ua? } | legacy = Timestamp nudo (= scope 'pulsar' default).
        // Filtra scope 'pulsar' (PWA) e 'sidera' (desktop wildcard).
        const rawTokens = [];
        // Re-key tollerante (docs/STELLA-GRAFO.md): risolvi i team doc per CAMPO
        // email (funziona email-keyed e uid-keyed; in coesistenza prende entrambi).
        const teamSnaps = (await Promise.all(targets.map((email) => db.collection('team').where('email', '==', email).get()))).flatMap(s => s.docs);
        for (const ts of teamSnaps) {
            if (!ts.exists)
                continue;
            const tokensMap = ((_a = ts.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) || {};
            for (const [tk, val] of Object.entries(tokensMap)) {
                if (val && typeof val === 'object' && 'scope' in val) {
                    const scope = val.scope;
                    if (scope === 'pulsar' || scope === 'sidera')
                        rawTokens.push(tk);
                }
                else {
                    // Legacy: timestamp nudo → default 'pulsar'
                    rawTokens.push(tk);
                }
            }
        }
        // Dedup: lo stesso token potrebbe comparire più volte (multi-destinatario,
        // o token replicato per qualche bug client → notifica duplicata)
        const tokens = Array.from(new Set(rawTokens));
        console.log(`[PULSAR push] Target=${targets.length} | tokens raw=${rawTokens.length} | tokens unique=${tokens.length}`);
        if (!tokens.length) {
            console.log('[PULSAR push] Nessun fcmToken disponibile per i destinatari.');
            return null;
        }
        // 4. Costruisci titolo
        const displaySender = sender.split('@')[0] || 'Qualcuno';
        const title = chatName ? `${displaySender} · ${chatName}` : `Nuovo messaggio da ${displaySender}`;
        const body = msg.text.slice(0, 140);
        // 5. Invia push multicast (data-only: il SW costruisce l'unica notifica)
        // Se passassimo `notification`, la SDK FCM in background la mostrerebbe
        // automaticamente E richiamerebbe `onBackgroundMessage` → notifica doppia.
        // - `scope`: il SW e il foreground handler scartano push destinate a una
        //   PWA diversa da quella attiva (evita notifica PULSAR su CEPHEID).
        // - `messageId`: chiave di dedup IndexedDB nel SW (iOS WebPush può rilanciare
        //   un push pendente al wakeup del SW quando si apre un'altra PWA del dominio).
        const messageId = `${chatId}:${snap.id}`;
        const res = await admin.messaging().sendEachForMulticast({
            tokens,
            data: {
                chatId,
                messageId,
                scope: 'pulsar',
                title,
                body,
                url: `/pulsar/chat/${chatId}`,
            },
        });
        // 6. Pulizia token invalidi
        const invalidTokens = [];
        res.responses.forEach((r, i) => {
            var _a;
            if (!r.success) {
                const code = ((_a = r.error) === null || _a === void 0 ? void 0 : _a.code) || '';
                if (code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokens[i]);
                }
            }
        });
        if (invalidTokens.length) {
            // Rimuovi i token invalidi da TUTTI i team doc target (best-effort)
            await Promise.all(targets.map(async (email) => {
                const updates = {};
                invalidTokens.forEach((tk) => { updates[`fcmTokens.${tk}`] = admin.firestore.FieldValue.delete(); });
                if (Object.keys(updates).length) {
                    // Re-key tollerante: aggiorna TUTTI i doc che matchano l'email.
                    try {
                        const qs = await db.collection('team').where('email', '==', email).get();
                        await Promise.all(qs.docs.map(d => d.ref.update(updates)));
                    }
                    catch (_) { /* ignore */ }
                }
            }));
        }
        console.log(`[PULSAR push] Inviate ${res.successCount}/${tokens.length} notifiche.`);
        return null;
    }
    catch (e) {
        console.error('[PULSAR push] Errore:', e);
        return null;
    }
});
// ──────────────────────────────────────────────────────────────────
// PULSAR — chat eliminata: cancella ricorsivamente la subcollection messages
// Trigger: onDelete chats/{chatId}.
// Senza questa pulizia i messaggi restavano orfani e continuavano a
// comparire in PulsarPendingView via collectionGroup('messages').
// ──────────────────────────────────────────────────────────────────
exports.onChatDeleted = functions
    .region('europe-west1')
    .firestore.document('chats/{chatId}')
    .onDelete(async (_snap, context) => {
    const chatId = context.params.chatId;
    const db = admin.firestore();
    const messagesRef = db.collection('chats').doc(chatId).collection('messages');
    const BATCH_SIZE = 500;
    let totalDeleted = 0;
    // Conteggio occorrenze hashtag nei messaggi cancellati, per scalare poi
    // i contatori denormalizzati in chatHashtags (altrimenti restano "fantasma").
    const hashtagDelta = new Map();
    try {
        // Loop: scarica fino a BATCH_SIZE docs, cancellali in batch atomico, ripeti.
        // Il while si ferma quando la subcollection è vuota (snapshot.empty).
        // Pattern ufficiale Google per recursive collection delete via Admin SDK.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const snapshot = await messagesRef.orderBy('__name__').limit(BATCH_SIZE).get();
            if (snapshot.empty)
                break;
            const batch = db.batch();
            snapshot.docs.forEach((d) => {
                var _a;
                const tags = (((_a = d.data()) === null || _a === void 0 ? void 0 : _a.hashtags) || []);
                for (const tag of tags) {
                    if (typeof tag === 'string' && tag) {
                        hashtagDelta.set(tag, (hashtagDelta.get(tag) || 0) + 1);
                    }
                }
                batch.delete(d.ref);
            });
            await batch.commit();
            totalDeleted += snapshot.size;
            if (snapshot.size < BATCH_SIZE)
                break;
        }
        console.log(`[onChatDeleted] chat ${chatId}: cancellati ${totalDeleted} messaggi orfani.`);
    }
    catch (e) {
        console.error(`[onChatDeleted] chat ${chatId}: errore durante cleanup:`, e);
    }
    // Scala i contatori hashtag in transazione: se scendono a <= 0 cancello
    // il doc così l'hashtag sparisce da chip e suggerimenti (PulsarTagsView).
    for (const [tag, count] of hashtagDelta) {
        try {
            const tagRef = db.collection('chatHashtags').doc(tag);
            await db.runTransaction(async (tx) => {
                var _a;
                const snap = await tx.get(tagRef);
                if (!snap.exists)
                    return;
                const current = (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.count) || 0);
                const next = current - count;
                if (next <= 0)
                    tx.delete(tagRef);
                else
                    tx.update(tagRef, { count: next });
            });
        }
        catch (e) {
            console.error(`[onChatDeleted] chat ${chatId}: errore decremento hashtag ${tag}:`, e);
        }
    }
    return null;
});
// ──────────────────────────────────────────────────────────────────
// PULSAR — one-shot: cleanup pendenze orfane in PulsarPendingView
// HTTPS callable, admin-only. Cancella i messaggi in chats/{chatId}/messages
// dove il documento chat parent non esiste più (chat cancellate prima del
// deploy di onChatDeleted). Idempotente: rieseguibile senza danni.
//
// Invocazione (dopo deploy):
//   firebase functions:shell  →  cleanupOrphanPendingMessages({})
// oppure:
//   gcloud functions call cleanupOrphanPendingMessages --region europe-west1
// ──────────────────────────────────────────────────────────────────
exports.cleanupOrphanPendingMessages = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (_data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // Admin-only: allowlist dinamica in core/admins (+ super-admin info@ come fallback)
    const callerEmail = (_d = (_c = (_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.email) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === null || _d === void 0 ? void 0 : _d.trim();
    const adminsSnap = await admin.firestore().doc('core/admins').get();
    const adminEmails = ((_f = (_e = adminsSnap.data()) === null || _e === void 0 ? void 0 : _e.emails) !== null && _f !== void 0 ? _f : [])
        .map((e) => (e !== null && e !== void 0 ? e : '').toLowerCase().trim());
    const allowed = callerEmail === 'info@inglesinaitaliana.it'
        || (!!callerEmail && adminEmails.includes(callerEmail));
    if (!allowed) {
        throw new functions.https.HttpsError('permission-denied', 'Solo admin.');
    }
    const db = admin.firestore();
    console.log('[cleanupOrphanPendingMessages] start');
    // Step 1: raccogli tutti i ref messaggi raggruppati per chatId.
    // collectionGroup('messages') scarica TUTTI i messaggi. Ok per one-shot.
    const allMessagesSnap = await db.collectionGroup('messages').select().get();
    const messagesByChat = new Map();
    for (const d of allMessagesSnap.docs) {
        const chatRef = d.ref.parent.parent;
        if (!chatRef)
            continue;
        const list = (_g = messagesByChat.get(chatRef.id)) !== null && _g !== void 0 ? _g : [];
        list.push(d.ref);
        messagesByChat.set(chatRef.id, list);
    }
    console.log(`[cleanupOrphanPendingMessages] ${allMessagesSnap.size} messaggi totali in ${messagesByChat.size} chat distinte`);
    // Step 2: per ogni chatId, verifica se la chat esiste.
    // Se NON esiste, cancella tutti i suoi messaggi in batch.
    const chatIds = Array.from(messagesByChat.keys());
    const chatSnaps = await Promise.all(chatIds.map((id) => db.collection('chats').doc(id).get()));
    let orphanChatsCount = 0;
    let deletedMessagesCount = 0;
    for (let i = 0; i < chatIds.length; i++) {
        const chatId = chatIds[i];
        const chatSnap = chatSnaps[i];
        if (chatSnap.exists)
            continue;
        // Chat orfana: cancella tutti i suoi messaggi
        orphanChatsCount++;
        const refs = (_h = messagesByChat.get(chatId)) !== null && _h !== void 0 ? _h : [];
        const BATCH_SIZE = 500;
        for (let j = 0; j < refs.length; j += BATCH_SIZE) {
            const batch = db.batch();
            refs.slice(j, j + BATCH_SIZE).forEach((r) => batch.delete(r));
            await batch.commit();
            deletedMessagesCount += Math.min(BATCH_SIZE, refs.length - j);
        }
        console.log(`[cleanupOrphanPendingMessages] chat orfana ${chatId}: cancellati ${refs.length} messaggi`);
    }
    const result = {
        orphanChatsCount,
        deletedMessagesCount,
        totalMessagesScanned: allMessagesSnap.size,
        totalChatsScanned: messagesByChat.size,
    };
    console.log('[cleanupOrphanPendingMessages] done', result);
    return result;
});
// ──────────────────────────────────────────────────────────────────
// CRON: SHIPPED → DELIVERED dopo 7 giorni dalla spedizione
// Risolve i casi in cui il cliente B2B non clicca "Conferma Ricezione"
// in ClientDashboard, lasciando l'ordine bloccato in SHIPPED.
// ──────────────────────────────────────────────────────────────────
exports.autoDeliveredAfter7Days = functions
    .region('europe-west1')
    .pubsub.schedule('every day 06:00')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const snap = await db.collection('preventivi')
        .where('stato', '==', 'SHIPPED')
        .where('dataSpedizione', '<=', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .get();
    if (snap.empty) {
        console.log('[autoDeliveredAfter7Days] Nessun ordine da convertire.');
        return null;
    }
    const CHUNK = 500;
    let totale = 0;
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
        const batch = db.batch();
        const slice = snap.docs.slice(i, i + CHUNK);
        slice.forEach((d) => {
            const dataSped = d.data().dataSpedizione;
            if (!(dataSped === null || dataSped === void 0 ? void 0 : dataSped.toDate))
                return;
            const dataConsegnaEffettiva = new Date(dataSped.toDate().getTime() + 7 * 24 * 60 * 60 * 1000);
            batch.update(d.ref, {
                stato: 'DELIVERED',
                dataConsegnaEffettiva: admin.firestore.Timestamp.fromDate(dataConsegnaEffettiva),
                autoDelivered: true,
            });
        });
        await batch.commit();
        totale += slice.length;
    }
    console.log(`[autoDeliveredAfter7Days] Convertiti ${totale} ordini SHIPPED → DELIVERED.`);
    return null;
});
async function logActivity(e) {
    var _a, _b, _c, _d;
    try {
        await admin.firestore().collection('activityLog').add({
            ts: admin.firestore.FieldValue.serverTimestamp(),
            system: e.system,
            sourceType: e.sourceType,
            sourceId: e.sourceId,
            projectId: (_a = e.projectId) !== null && _a !== void 0 ? _a : null,
            eventType: e.eventType,
            verb: e.verb,
            objectLabel: e.objectLabel,
            tone: e.tone,
            icon: e.icon,
            actorEmail: (_b = e.actorEmail) !== null && _b !== void 0 ? _b : null,
            actorUid: (_c = e.actorUid) !== null && _c !== void 0 ? _c : null,
            actorName: (_d = e.actorName) !== null && _d !== void 0 ? _d : null,
        });
    }
    catch (err) {
        // Mai propagare: il logging è best-effort e non deve impattare nulla.
        console.error('[activityLog] write fallita (ignoro):', err);
    }
}
// Vero se almeno una delle chiavi differisce tra before e after.
function fieldsChanged(before, after, keys) {
    return keys.some(k => { var _a, _b; return JSON.stringify((_a = before === null || before === void 0 ? void 0 : before[k]) !== null && _a !== void 0 ? _a : null) !== JSON.stringify((_b = after === null || after === void 0 ? void 0 : after[k]) !== null && _b !== void 0 ? _b : null); });
}
const TASK_NOUN = {
    task: 'il task', milestone: 'la milestone', deliverable: 'il deliverable',
};
// Logica condivisa task/milestone/deliverable (path standalone e di progetto).
async function handleTaskWrite(change, taskId, projectId) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const data = after || before;
    if (!data)
        return;
    const type = data.type || 'task';
    const noun = TASK_NOUN[type] || 'il task';
    const objectLabel = (after === null || after === void 0 ? void 0 : after.title) || (before === null || before === void 0 ? void 0 : before.title) || '(senza titolo)';
    const base = { system: 'SIDERA', sourceType: type, sourceId: taskId, projectId };
    // CREATO
    if (!before && after) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'created', tone: 'gold', icon: 'add', verb: `ha creato ${noun}`, objectLabel, actorEmail: (_a = after.createdByEmail) !== null && _a !== void 0 ? _a : null, actorUid: (_b = after.createdBy) !== null && _b !== void 0 ? _b : null }));
    }
    // ELIMINATO (solo standalone: il delete a cascata di progetto è gestito da quel flusso)
    if (before && !after) {
        if (projectId)
            return; // evita rumore dai cascade-delete dei task di progetto
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'deleted', tone: 'red', icon: 'delete', verb: `ha eliminato ${noun}`, objectLabel, actorEmail: (_d = (_c = before.updatedByEmail) !== null && _c !== void 0 ? _c : before.createdByEmail) !== null && _d !== void 0 ? _d : null }));
    }
    if (!before || !after)
        return;
    const wasDone = before.status === 'done';
    const isDone = after.status === 'done';
    if (!wasDone && isDone) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'completed', tone: 'gold', icon: 'check_circle', verb: `ha completato ${noun}`, objectLabel, actorEmail: (_e = after.completedBy) !== null && _e !== void 0 ? _e : null }));
    }
    if (wasDone && !isDone) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'uncompleted', tone: 'neutral', icon: 'undo', verb: `ha riaperto ${noun}`, objectLabel, actorEmail: (_f = after.updatedByEmail) !== null && _f !== void 0 ? _f : null }));
    }
    // APPROVATO (solo deliverable: campo `approved`)
    if (!before.approved && after.approved === true) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'approved', tone: 'gold', icon: 'verified', verb: `ha approvato ${noun}`, objectLabel, actorEmail: (_g = after.approvedByEmail) !== null && _g !== void 0 ? _g : null }));
    }
    // MODIFICATO (solo campi user-facing; evita rumore da contatori/triaged)
    if (fieldsChanged(before, after, ['title', 'priority', 'dueDate', 'assignees'])) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'modified', tone: 'neutral', icon: 'edit', verb: `ha modificato ${noun}`, objectLabel, actorEmail: (_h = after.updatedByEmail) !== null && _h !== void 0 ? _h : null }));
    }
}
exports.logTaskActivityStandalone = functions
    .region('europe-west1')
    .firestore.document('tasks/{taskId}')
    .onWrite((change, context) => handleTaskWrite(change, context.params.taskId, null));
exports.logTaskActivitySub = functions
    .region('europe-west1')
    .firestore.document('projects/{projectId}/tasks/{taskId}')
    .onWrite((change, context) => handleTaskWrite(change, context.params.taskId, context.params.projectId));
exports.logProjectActivity = functions
    .region('europe-west1')
    .firestore.document('projects/{projectId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const projectId = context.params.projectId;
    const objectLabel = (after === null || after === void 0 ? void 0 : after.name) || (before === null || before === void 0 ? void 0 : before.name) || '(senza nome)';
    const base = { system: 'SIDERA', sourceType: 'project', sourceId: projectId, projectId };
    if (!before && after) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'created', tone: 'gold', icon: 'create_new_folder', verb: 'ha creato il progetto', objectLabel, actorUid: (_a = after.createdBy) !== null && _a !== void 0 ? _a : null }));
    }
    if (before && !after)
        return; // niente evento sul delete progetto (cascade) per v1
    if (!before || !after)
        return;
    if (!before.completed && after.completed === true) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'completed', tone: 'gold', icon: 'check_circle', verb: 'ha completato il progetto', objectLabel, actorEmail: (_b = after.updatedByEmail) !== null && _b !== void 0 ? _b : null }));
    }
    if (fieldsChanged(before, after, ['name', 'description', 'color', 'dueDate', 'obiettivoId'])) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'modified', tone: 'neutral', icon: 'edit', verb: 'ha modificato il progetto', objectLabel, actorEmail: (_c = after.updatedByEmail) !== null && _c !== void 0 ? _c : null }));
    }
});
// POPS: trigger SEPARATO sullo stesso path di generaOrdineFIC (v1 ammette più trigger
// indipendenti). NON tocca generaOrdineFIC. Logga solo le transizioni di `stato`.
exports.logPreventivoActivity = functions
    .region('europe-west1')
    .firestore.document('preventivi/{docId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after)
        return; // delete preventivo: nessun evento v1
    const codice = after.codice || context.params.docId;
    const commessa = after.commessa ? ` · ${after.commessa}` : '';
    const objectLabel = `#${codice}${commessa}`;
    const cliente = after.cliente || null;
    const base = { system: 'POPS', sourceType: 'order', sourceId: context.params.docId, projectId: null };
    // CREATO
    if (!before) {
        return logActivity(Object.assign(Object.assign({}, base), { eventType: 'created', tone: 'gold', icon: 'add', verb: "ha creato l'ordine", objectLabel, actorName: cliente }));
    }
    // Solo su cambio di stato
    if (before.stato === after.stato)
        return;
    switch (after.stato) {
        case 'ORDER_REQ':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'sent', tone: 'gold', icon: 'outbox', verb: "ha inviato l'ordine", objectLabel, actorName: cliente }));
        case 'SIGNED':
            // Conferma = azione del cliente (clienteUID) → nome dal campo `cliente`.
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'confirmed', tone: 'gold', icon: 'task_alt', verb: "ha confermato l'ordine", objectLabel, actorName: cliente }));
        case 'IN_PRODUZIONE':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'in_produzione', tone: 'neutral', icon: 'precision_manufacturing', verb: "ha messo in produzione l'ordine", objectLabel, actorEmail: (_a = after.updatedByEmail) !== null && _a !== void 0 ? _a : null }));
        case 'READY':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'ready', tone: 'gold', icon: 'inventory_2', verb: "ha contrassegnato pronto l'ordine", objectLabel, actorEmail: (_b = after.updatedByEmail) !== null && _b !== void 0 ? _b : null }));
        case 'SHIPPED':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'shipped', tone: 'gold', icon: 'local_shipping', verb: "ha spedito l'ordine", objectLabel, actorEmail: (_c = after.updatedByEmail) !== null && _c !== void 0 ? _c : null }));
        case 'DELIVERED':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'delivered', tone: 'gold', icon: 'home', verb: "ha consegnato l'ordine", objectLabel, actorEmail: (_d = after.updatedByEmail) !== null && _d !== void 0 ? _d : null }));
        case 'REJECTED':
            return logActivity(Object.assign(Object.assign({}, base), { eventType: 'cancelled', tone: 'red', icon: 'close', verb: "ha annullato l'ordine", objectLabel, actorEmail: (_e = after.annullatoDa) !== null && _e !== void 0 ? _e : null }));
        default:
            return; // DRAFT, PENDING_VAL, QUOTE_READY, WAITING_SIGN, WAITING_FAST, DELIVERY → nessun evento
    }
});
function nebulaNormalizeEmail(e) {
    return (e !== null && e !== void 0 ? e : '').toLowerCase().trim();
}
exports.saveDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    if (!userEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'Email utente mancante');
    }
    const db = admin.firestore();
    const trigger = ((_a = data === null || data === void 0 ? void 0 : data.trigger) !== null && _a !== void 0 ? _a : 'autosave');
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    const now = admin.firestore.FieldValue.serverTimestamp();
    // ── CREATE ──────────────────────────────────────────────────────────
    if (!docId) {
        const newRef = db.collection('nebulaDocs').doc();
        const acl = {
            visibility: 'private', // decisione §12 #1
            readers: [],
            writers: [],
            owners: [userEmail],
        };
        const title = (_b = data === null || data === void 0 ? void 0 : data.title) !== null && _b !== void 0 ? _b : 'Nuovo documento';
        const content = (_c = data === null || data === void 0 ? void 0 : data.content) !== null && _c !== void 0 ? _c : { type: 'doc', content: [] };
        await newRef.set({
            title,
            icon: (_d = data === null || data === void 0 ? void 0 : data.icon) !== null && _d !== void 0 ? _d : null,
            content,
            contentText: ((_e = data === null || data === void 0 ? void 0 : data.contentText) !== null && _e !== void 0 ? _e : '').slice(0, 10000),
            parentId: (_f = data === null || data === void 0 ? void 0 : data.parentId) !== null && _f !== void 0 ? _f : null,
            order: 0,
            depth: 0,
            refs: { tasks: [], projects: [], deliverables: [], docs: [], users: [] },
            archived: false,
            archivedAt: null,
            revision: 1,
            createdAt: now,
            createdBy: userEmail,
            updatedAt: now,
            updatedBy: userEmail,
            acl,
        });
        // Snapshot iniziale sempre (anche su autosave) per il primo punto.
        await newRef.collection('history').add({
            revision: 1,
            title,
            content,
            savedAt: now,
            savedBy: userEmail,
            trigger,
        });
        return { docId: newRef.id, revision: 1 };
    }
    // ── UPDATE (LWW per documento, vedi §5.3) ───────────────────────────
    const ref = db.collection('nebulaDocs').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Documento non trovato');
    }
    const current = snap.data();
    const acl = current.acl;
    // Permessi: solo writer o owner
    const isWriter = acl.writers.includes(userEmail) || acl.owners.includes(userEmail);
    if (!isWriter) {
        throw new functions.https.HttpsError('permission-denied', 'Permesso di scrittura negato');
    }
    // Fase 6: niente più LWW/409. Il contenuto è gestito dal Y.Doc (CRDT,
    // convergente); saveDoc serve ai campi scalari (title/icon/parentId).
    // `revision` è solo un contatore monotòno (UI/history), non un token LWW.
    const nextRev = ((_g = current.revision) !== null && _g !== void 0 ? _g : 0) + 1;
    const update = {
        revision: nextRev,
        updatedAt: now,
        updatedBy: userEmail,
    };
    if ((data === null || data === void 0 ? void 0 : data.title) !== undefined)
        update.title = data.title;
    if ((data === null || data === void 0 ? void 0 : data.icon) !== undefined)
        update.icon = data.icon;
    if ((data === null || data === void 0 ? void 0 : data.content) !== undefined)
        update.content = data.content;
    if ((data === null || data === void 0 ? void 0 : data.contentText) !== undefined)
        update.contentText = ((_h = data.contentText) !== null && _h !== void 0 ? _h : '').slice(0, 10000);
    if ((data === null || data === void 0 ? void 0 : data.parentId) !== undefined)
        update.parentId = data.parentId;
    await ref.update(update);
    // History snapshot solo su trigger 'manual'/'mcp' (autosave no → meno bloat).
    if (trigger === 'manual' || trigger === 'mcp') {
        await ref.collection('history').add({
            revision: nextRev,
            title: (_j = update.title) !== null && _j !== void 0 ? _j : current.title,
            content: (_k = update.content) !== null && _k !== void 0 ? _k : current.content,
            savedAt: now,
            savedBy: userEmail,
            trigger,
        });
    }
    return { docId, revision: nextRev };
});
function extractRefsFromContent(content) {
    const tasks = new Set();
    const projects = new Set();
    const users = new Set();
    function walk(node) {
        var _a, _b, _c, _d;
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'taskMention') {
            const tid = (_a = node.attrs) === null || _a === void 0 ? void 0 : _a.taskId;
            if (typeof tid === 'string' && tid)
                tasks.add(tid);
        }
        else if (node.type === 'projectMention') {
            const pid = (_b = node.attrs) === null || _b === void 0 ? void 0 : _b.projectId;
            if (typeof pid === 'string' && pid)
                projects.add(pid);
        }
        else if (node.type === 'taskEmbed') {
            const filter = (_c = node.attrs) === null || _c === void 0 ? void 0 : _c.filter;
            const pid = filter === null || filter === void 0 ? void 0 : filter.projectId;
            if (typeof pid === 'string' && pid)
                projects.add(pid);
        }
        else if (node.type === 'userMention') {
            const em = (_d = node.attrs) === null || _d === void 0 ? void 0 : _d.email;
            if (typeof em === 'string' && em)
                users.add(em.toLowerCase().trim());
        }
        if (Array.isArray(node.content)) {
            for (const child of node.content)
                walk(child);
        }
    }
    walk(content);
    return {
        tasks: Array.from(tasks).sort(),
        projects: Array.from(projects).sort(),
        users: Array.from(users).sort(),
    };
}
function arraysShallowEqual(a, b) {
    const aa = a !== null && a !== void 0 ? a : [];
    const bb = b !== null && b !== void 0 ? b : [];
    if (aa.length !== bb.length)
        return false;
    for (let i = 0; i < aa.length; i++)
        if (aa[i] !== bb[i])
            return false;
    return true;
}
exports.indexDocRefs = functions
    .region('europe-west1')
    .firestore.document('nebulaDocs/{docId}')
    .onWrite(async (change, context) => {
    var _a;
    // onWrite copre create/update/delete. Su delete (after non esiste) skippiamo.
    if (!change.after.exists)
        return null;
    const after = change.after.data();
    const computed = extractRefsFromContent(after.content);
    const currentRefs = ((_a = after.refs) !== null && _a !== void 0 ? _a : {});
    // Loop guard: se i refs computati coincidono con quelli persistiti,
    // la write non porta nuove mention → skip (probabile origine: indexer stesso
    // o write non legata ai mention).
    if (arraysShallowEqual(currentRefs.tasks, computed.tasks) &&
        arraysShallowEqual(currentRefs.projects, computed.projects) &&
        arraysShallowEqual(currentRefs.users, computed.users)) {
        return null;
    }
    // Update i sotto-campi refs.tasks + refs.projects + refs.users
    // (preserva refs.deliverables/docs gestiti da chunks futuri).
    const docId = context.params.docId;
    await admin.firestore()
        .collection('nebulaDocs').doc(docId)
        .update({
        'refs.tasks': computed.tasks,
        'refs.projects': computed.projects,
        'refs.users': computed.users,
    });
    console.log(`[indexDocRefs] ${docId} — tasks: ${computed.tasks.length}, projects: ${computed.projects.length}, users: ${computed.users.length}`);
    return null;
});
// ============================================================================
// NEBULA-DOCS — shareDoc callable (F3-C2.5)
// Aggiorna ACL del doc (visibility + writers). SOLO owner può chiamare.
// Endpoint separato da saveDoc per audit chiaro e per evitare che un writer
// si "auto-promuova" owner via call accidentale.
//
// Input  : { docId, visibility?, writers? }
// Output : { docId, acl }
// Errori : unauthenticated | permission-denied | not-found | invalid-argument
// ============================================================================
const VALID_VISIBILITIES = new Set(['private', 'team', 'public']);
exports.shareDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    if (!userEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'Email utente mancante');
    }
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    if (!docId) {
        throw new functions.https.HttpsError('invalid-argument', 'docId mancante');
    }
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Documento non trovato');
    }
    const current = snap.data();
    const acl = current.acl;
    if (!acl) {
        throw new functions.https.HttpsError('failed-precondition', 'Documento senza ACL');
    }
    // SOLO owner può modificare ACL
    if (!acl.owners.includes(userEmail)) {
        throw new functions.https.HttpsError('permission-denied', 'Solo gli owner possono modificare la condivisione');
    }
    // Validazione + normalizzazione input
    const visibility = data === null || data === void 0 ? void 0 : data.visibility;
    if (visibility !== undefined && !VALID_VISIBILITIES.has(visibility)) {
        throw new functions.https.HttpsError('invalid-argument', `visibility non valida: ${visibility}`);
    }
    let writers;
    if ((data === null || data === void 0 ? void 0 : data.writers) !== undefined) {
        if (!Array.isArray(data.writers)) {
            throw new functions.https.HttpsError('invalid-argument', 'writers deve essere array');
        }
        writers = data.writers
            .filter((e) => typeof e === 'string')
            .map((e) => nebulaNormalizeEmail(e))
            .filter((e) => e.length > 0);
        // Owners restano sempre writers di fatto (saveDoc accetta sia owner
        // che writer). Niente bisogno di duplicarli qui.
    }
    // Build update solo sui campi forniti
    const update = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userEmail,
    };
    if (visibility !== undefined)
        update['acl.visibility'] = visibility;
    if (writers !== undefined)
        update['acl.writers'] = writers;
    await ref.update(update);
    const updatedSnap = await ref.get();
    const newAcl = updatedSnap.data().acl;
    return { docId, acl: newAcl };
});
// ============================================================================
// NEBULA-DOCS — presenceCleanup (F3-C4) scheduled every 5 min
// Elimina records di presence stale (utenti che chiudono tab senza che il
// best-effort delete su unmount/beforeunload parta). Garantisce che
// l'avatar stack nell'editor non mostri utenti realmente offline.
//
// Threshold: 5 min. Coerente col PRESENCE_FRESH_MS=30s client (la UI filtra
// più aggressivamente; questo è il garbage collector lungo).
//
// Query: collectionGroup('presence') con where('lastSeenAt', '<', cutoff).
// Richiede field override su `presence/lastSeenAt` scope COLLECTION_GROUP
// (vedi firestore.indexes.json).
// ============================================================================
exports.presenceCleanup = functions
    .region('europe-west1')
    .pubsub.schedule('every 5 minutes')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const STALE_MS = 5 * 60 * 1000;
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_MS);
    const snap = await db.collectionGroup('presence')
        .where('lastSeenAt', '<', cutoff)
        .get();
    if (snap.empty) {
        console.log('[presenceCleanup] no stale records');
        return null;
    }
    // Batch delete (max 500 ops/batch — split se serve)
    const chunks = [];
    for (let i = 0; i < snap.docs.length; i += 450) {
        chunks.push(snap.docs.slice(i, i + 450));
    }
    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    console.log(`[presenceCleanup] deleted ${snap.size} stale presence records`);
    return null;
});
// ============================================================================
// NEBULA-DOCS — historyPrune (F3-C4) scheduled daily 03:00 Europe/Rome
// Mantiene per ogni nebulaDocs:
//   - Ultimi 50 snapshot (più recenti per savedAt DESC)
//   - 1 snapshot al giorno per gli ultimi 30 giorni (primo del giorno per
//     savedAt DESC = ultimo salvato nel giorno = stato finale del giorno)
//   - Elimina tutto il resto.
//
// Vedi docs/NEBULA-DOCS.md §3.4 retention policy.
// ============================================================================
exports.historyPrune = functions
    .region('europe-west1')
    .pubsub.schedule('0 3 * * *') // ogni giorno alle 03:00
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const KEEP_RECENT = 50;
    const KEEP_DAYS = 30;
    const KEEP_DAYS_MS = KEEP_DAYS * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const docsSnap = await db.collection('nebulaDocs').get();
    let totalDeleted = 0;
    let docsProcessed = 0;
    for (const docRef of docsSnap.docs) {
        const histSnap = await docRef.ref.collection('history')
            .orderBy('savedAt', 'desc')
            .get();
        if (histSnap.size <= KEEP_RECENT) {
            docsProcessed++;
            continue;
        }
        const keep = new Set();
        // 1. Ultimi N più recenti
        histSnap.docs.slice(0, KEEP_RECENT).forEach(h => keep.add(h.id));
        // 2. 1 al giorno per ultimi 30 gg. Iterando DESC, il primo che
        //    incontriamo per ogni giorno è il più recente di quel giorno.
        const dayKeep = new Map();
        for (const h of histSnap.docs) {
            const ts = h.data().savedAt;
            if (!ts)
                continue;
            const savedAt = ts.toMillis();
            if (nowMs - savedAt > KEEP_DAYS_MS)
                continue;
            const date = new Date(savedAt).toISOString().slice(0, 10); // YYYY-MM-DD
            if (!dayKeep.has(date))
                dayKeep.set(date, h.id);
        }
        dayKeep.forEach(id => keep.add(id));
        // 3. Delete il resto
        const toDelete = histSnap.docs.filter(h => !keep.has(h.id));
        if (toDelete.length === 0) {
            docsProcessed++;
            continue;
        }
        // Batch (max 500)
        for (let i = 0; i < toDelete.length; i += 450) {
            const batch = db.batch();
            toDelete.slice(i, i + 450).forEach(h => batch.delete(h.ref));
            await batch.commit();
        }
        totalDeleted += toDelete.length;
        docsProcessed++;
    }
    console.log(`[historyPrune] processed ${docsProcessed} docs, deleted ${totalDeleted} old snapshots`);
    return null;
});
let _nebulaYdocLib = null;
function nebulaYdoc() {
    return _nebulaYdocLib !== null && _nebulaYdocLib !== void 0 ? _nebulaYdocLib : (_nebulaYdocLib = require('./lib_yjs/ydoc'));
}
// clientId sentinella per gli update applicati dal server (MCP/restore). I
// client filtrano gli echo confrontando col PROPRIO ydoc.clientID (random
// positivo): 0 non collide mai. L'idempotenza Yjs copre il caso 1-su-4MLD.
const NEBULA_SERVER_CLIENT_ID = 0;
// Coerce un valore Firestore bytes a Uint8Array. L'Admin SDK ritorna Buffer
// (già Uint8Array); il client web salva come Bytes → Admin lo legge Buffer.
function nebulaToUint8(v) {
    if (!v)
        return new Uint8Array(0);
    if (v instanceof Uint8Array)
        return v;
    const maybe = v;
    if (typeof maybe.toUint8Array === 'function')
        return maybe.toUint8Array();
    return new Uint8Array(0);
}
// ── initYDoc (callable) — migrazione deterministica first-writer-wins ───────
// Seed del Y.Doc da `content` esistente, una sola volta per doc (latch
// transazionale). Idempotente: chiamate concorrenti → primo vince, gli altri
// no-op. Vedi piano §6.4.
exports.initYDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    if (!docId) {
        throw new functions.https.HttpsError('invalid-argument', 'docId mancante');
    }
    const { seedStateBuffers } = nebulaYdoc();
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const result = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(ref);
        if (!snap.exists) {
            throw new functions.https.HttpsError('not-found', 'Documento non trovato');
        }
        const cur = snap.data();
        const acl = cur.acl;
        const isWriter = acl.writers.includes(userEmail) || acl.owners.includes(userEmail);
        if (!isWriter) {
            throw new functions.https.HttpsError('permission-denied', 'Permesso di scrittura negato');
        }
        if (cur.ydocInitialized === true) {
            return { initialized: false, alreadyInitialized: true };
        }
        const content = (_a = cur.content) !== null && _a !== void 0 ? _a : { type: 'doc', content: [] };
        const { state, stateVector } = seedStateBuffers(content);
        tx.update(ref, {
            ydocState: state,
            ydocStateVector: stateVector,
            ydocInitialized: true,
            ydocSeq: 0,
        });
        return { initialized: true, alreadyInitialized: false };
    });
    return Object.assign({ docId }, result);
});
// ── backfillYDocs (callable, solo CORE admin) — migrazione massiva ──────────
// Seed proattivo di tutti i doc non ancora inizializzati, così il primo utente
// non attende e si valida l'intero corpus prima del cutover. Vedi piano §6.4.
exports.backfillYDocs = functions
    .region('europe-west1')
    .runWith({ memory: '512MB', timeoutSeconds: 540 })
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const db = admin.firestore();
    // Verifica CORE admin (allowlist core/admins + superadmin hardcoded).
    const adminsSnap = await db.doc('core/admins').get();
    const adminEmails = ((_b = (_a = adminsSnap.data()) === null || _a === void 0 ? void 0 : _a.emails) !== null && _b !== void 0 ? _b : []);
    const isCoreAdmin = userEmail === 'info@inglesinaitaliana.it' || adminEmails.includes(userEmail);
    if (!isCoreAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Solo CORE admin');
    }
    const { seedStateBuffers } = nebulaYdoc();
    const limit = Math.min((_c = data === null || data === void 0 ? void 0 : data.limit) !== null && _c !== void 0 ? _c : 200, 500);
    // Solo i non inizializzati. Niente filtro server (ydocInitialized assente
    // sui doc vecchi → leggiamo tutti e filtriamo in memoria, corpus ~decine).
    const snap = await db.collection('nebulaDocs').limit(limit).get();
    let migrated = 0;
    let skipped = 0;
    for (const d of snap.docs) {
        const cur = d.data();
        if (cur.ydocInitialized === true) {
            skipped++;
            continue;
        }
        if (cur.archived === true) {
            skipped++;
            continue;
        }
        const content = (_d = cur.content) !== null && _d !== void 0 ? _d : { type: 'doc', content: [] };
        const { state, stateVector } = seedStateBuffers(content);
        // Transazione per doc: rispetta il latch se un utente ha inizializzato
        // nel frattempo.
        await db.runTransaction(async (tx) => {
            var _a;
            const fresh = await tx.get(d.ref);
            if (((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.ydocInitialized) === true)
                return;
            tx.update(d.ref, {
                ydocState: state,
                ydocStateVector: stateVector,
                ydocInitialized: true,
                ydocSeq: 0,
            });
        });
        migrated++;
    }
    console.log(`[backfillYDocs] migrated=${migrated} skipped=${skipped}`);
    return { migrated, skipped, scanned: snap.size };
});
// ── Compaction + proiezione di un singolo doc ───────────────────────────────
// Algoritmo no-loss: legge state+deltas, costruisce il Y.Doc, riscrive
// ydocState e CANCELLA SOLO i delta letti (high-water mark = i doc letti).
// I delta arrivati durante la run sopravvivono. Vedi piano §6.3.
async function nebulaCompactOneDoc(docId) {
    var _a, _b;
    const { buildYDoc, ydocToJSON, extractText, encodeState, encodeStateVector } = nebulaYdoc();
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const docSnap = await ref.get();
    if (!docSnap.exists)
        return false;
    const cur = docSnap.data();
    if (cur.ydocInitialized !== true)
        return false; // non ancora migrato
    const updatesSnap = await ref.collection('yupdates').orderBy('createdAt', 'asc').get();
    if (updatesSnap.empty)
        return false;
    const readDocs = updatesSnap.docs; // high-water mark: cancelleremo solo questi
    const snapshotBuf = cur.ydocState ? nebulaToUint8(cur.ydocState) : null;
    const deltas = readDocs.map((d) => nebulaToUint8(d.data().data));
    const ydoc = buildYDoc(snapshotBuf, deltas);
    const merged = Buffer.from(encodeState(ydoc));
    const sv = Buffer.from(encodeStateVector(ydoc));
    const json = ydocToJSON(ydoc);
    const text = extractText(json);
    const update = {
        ydocState: merged,
        ydocStateVector: sv,
        content: json,
        contentText: text,
        revision: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Snapshot history periodico (~30 min di editing attivo) per non perdere
    // punti di restore durante sessioni collaborative passive.
    const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;
    const lastSnapMs = cur.yLastSnapshotAt ? cur.yLastSnapshotAt.toMillis() : 0;
    const doSnapshot = Date.now() - lastSnapMs > SNAPSHOT_INTERVAL_MS;
    const batch = db.batch();
    if (doSnapshot) {
        update.yLastSnapshotAt = admin.firestore.FieldValue.serverTimestamp();
        const histRef = ref.collection('history').doc();
        batch.set(histRef, {
            revision: ((_a = cur.revision) !== null && _a !== void 0 ? _a : 0) + 1,
            title: (_b = cur.title) !== null && _b !== void 0 ? _b : '(senza titolo)',
            content: json,
            savedAt: admin.firestore.FieldValue.serverTimestamp(),
            savedBy: 'system',
            trigger: 'autosave',
        });
    }
    batch.update(ref, update);
    readDocs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return true;
}
// ── nebulaYjsMaintenance (scheduled ~2 min) — compaction + proiezione ───────
// Trova i doc "caldi" (con yupdates recenti) via collectionGroup e li compatta.
// Niente trigger per-update (eviterebbe storm di invocazioni + indexDocRefs).
exports.nebulaYjsMaintenance = functions
    .region('europe-west1')
    .runWith({ memory: '512MB', timeoutSeconds: 300 })
    .pubsub.schedule('every 2 minutes')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const HOT_MS = 12 * 60 * 1000; // finestra ampia per non perdere doc tra le run
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - HOT_MS);
    const recent = await db.collectionGroup('yupdates')
        .where('createdAt', '>=', cutoff)
        .get();
    const docIds = new Set();
    recent.forEach((d) => {
        const parent = d.ref.parent.parent; // nebulaDocs/{docId}
        if (parent)
            docIds.add(parent.id);
    });
    if (docIds.size === 0) {
        console.log('[nebulaYjsMaintenance] no hot docs');
        return null;
    }
    let compacted = 0;
    for (const docId of docIds) {
        try {
            if (await nebulaCompactOneDoc(docId))
                compacted++;
        }
        catch (e) {
            console.error(`[nebulaYjsMaintenance] compact ${docId} failed:`, e);
        }
    }
    console.log(`[nebulaYjsMaintenance] hot=${docIds.size} compacted=${compacted}`);
    return null;
});
// ── awarenessCleanup (scheduled ~5 min) — TTL cursori live ──────────────────
// Elimina record awareness stale (tab chiusa senza unmount). I cursori vivi
// sono filtrati più aggressivamente sul client; questo è il GC lungo.
exports.awarenessCleanup = functions
    .region('europe-west1')
    .pubsub.schedule('every 5 minutes')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const STALE_MS = 90 * 1000; // 90s: l'awareness è molto effimera
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_MS);
    const snap = await db.collectionGroup('awareness')
        .where('updatedAt', '<', cutoff)
        .get();
    if (snap.empty) {
        console.log('[awarenessCleanup] nothing stale');
        return null;
    }
    for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = db.batch();
        snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
    console.log(`[awarenessCleanup] deleted ${snap.size} stale awareness records`);
    return null;
});
// ── snapshotDoc (callable) — history snapshot manuale (Cmd+S) ───────────────
// Costruisce il Y.Doc LIVE (state+deltas, niente staleness) e snapshotta la
// proiezione corrente in history (trigger 'manual'). Vedi piano §6.7.
exports.snapshotDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    if (!docId)
        throw new functions.https.HttpsError('invalid-argument', 'docId mancante');
    const { buildYDoc, ydocToJSON } = nebulaYdoc();
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Documento non trovato');
    const cur = snap.data();
    const acl = cur.acl;
    if (!(acl.writers.includes(userEmail) || acl.owners.includes(userEmail))) {
        throw new functions.https.HttpsError('permission-denied', 'Permesso di scrittura negato');
    }
    const snapshotBuf = cur.ydocState ? nebulaToUint8(cur.ydocState) : null;
    const updatesSnap = await ref.collection('yupdates').orderBy('createdAt', 'asc').get();
    const deltas = updatesSnap.docs.map((d) => nebulaToUint8(d.data().data));
    const ydoc = buildYDoc(snapshotBuf, deltas);
    const json = ydocToJSON(ydoc);
    const nextRev = ((_a = cur.revision) !== null && _a !== void 0 ? _a : 0) + 1;
    await ref.collection('history').add({
        revision: nextRev,
        title: (_b = cur.title) !== null && _b !== void 0 ? _b : '(senza titolo)',
        content: json,
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
        savedBy: userEmail,
        trigger: 'manual',
    });
    await ref.update({
        yLastSnapshotAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { docId, revision: nextRev };
});
// ── restoreDoc (callable) — ripristina una revision storica ─────────────────
// NON usa setContent (desincronizzerebbe il Y.Doc): applica il JSON snapshot
// al Y.Doc via updateYFragment e appende un delta. I client convergono live.
// Vedi piano §6.7.
exports.restoreDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    const revId = data === null || data === void 0 ? void 0 : data.revId;
    if (!docId || !revId)
        throw new functions.https.HttpsError('invalid-argument', 'docId/revId mancanti');
    const { buildYDoc, applyJSONToYDoc, ydocToJSON, extractText, encodeState, encodeStateVector } = nebulaYdoc();
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Documento non trovato');
    const cur = snap.data();
    const acl = cur.acl;
    if (!(acl.writers.includes(userEmail) || acl.owners.includes(userEmail))) {
        throw new functions.https.HttpsError('permission-denied', 'Permesso di scrittura negato');
    }
    const histSnap = await ref.collection('history').doc(revId).get();
    if (!histSnap.exists)
        throw new functions.https.HttpsError('not-found', 'Revisione non trovata');
    const targetContent = (_a = histSnap.data().content) !== null && _a !== void 0 ? _a : { type: 'doc', content: [] };
    // Costruisci Y.Doc live, applica il contenuto target come diff.
    const snapshotBuf = cur.ydocState ? nebulaToUint8(cur.ydocState) : null;
    const updatesSnap = await ref.collection('yupdates').orderBy('createdAt', 'asc').get();
    const deltas = updatesSnap.docs.map((d) => nebulaToUint8(d.data().data));
    const ydoc = buildYDoc(snapshotBuf, deltas);
    const diff = applyJSONToYDoc(ydoc, targetContent);
    // Appendi il delta come yupdate origin 'restore' (i client lo applicano live).
    await ref.collection('yupdates').add({
        data: Buffer.from(diff),
        seq: 0,
        author: userEmail,
        clientId: NEBULA_SERVER_CLIENT_ID,
        origin: 'restore',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Proietta subito + snapshot del restore.
    const json = ydocToJSON(ydoc);
    await ref.update({
        ydocState: Buffer.from(encodeState(ydoc)),
        ydocStateVector: Buffer.from(encodeStateVector(ydoc)),
        content: json,
        contentText: extractText(json),
        revision: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await ref.collection('history').add({
        revision: ((_b = cur.revision) !== null && _b !== void 0 ? _b : 0) + 1,
        title: (_c = cur.title) !== null && _c !== void 0 ? _c : '(senza titolo)',
        content: json,
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
        savedBy: userEmail,
        trigger: 'restore',
    });
    return { docId, restoredFrom: revId };
});
// ============================================================================
// NEBULA-DOCS — API key management (F4-C2)
// Schema nebulaApiKeys/{keyHash}:
//   - userEmail: string (lowercase) — owner della chiave
//   - label: string (es. "Claude Desktop Marco")
//   - prefix: string (primi 12 char della chiave plain, per display)
//   - createdAt: Timestamp
//   - lastUsedAt: Timestamp | null  (aggiornato dal MCP server)
//   - revoked: boolean
//   - revokedAt: Timestamp | null
//
// Lo storage usa il HASH della chiave come ID Firestore: il MCP server
// hasha la Bearer token in arrivo e fa getDoc diretto → O(1) lookup +
// niente plain key salvata. Il prefix (12 char) è per display nella lista.
// ============================================================================
const crypto_1 = require("crypto");
function generateApiKeyPair() {
    const random = (0, crypto_1.randomBytes)(32).toString('hex'); // 64 hex chars
    const plain = `nbk_${random}`; // total 68 chars
    const hash = (0, crypto_1.createHash)('sha256').update(plain).digest('hex');
    const prefix = plain.substring(0, 12); // "nbk_a3b8c2d1"
    return { plain, hash, prefix };
}
exports.generateNebulaApiKey = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    if (!userEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'Email utente mancante');
    }
    const label = ((_a = data === null || data === void 0 ? void 0 : data.label) !== null && _a !== void 0 ? _a : '').trim() || 'Chiave senza nome';
    const { plain, hash, prefix } = generateApiKeyPair();
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('nebulaApiKeys').doc(hash).set({
        userEmail,
        label,
        prefix,
        createdAt: now,
        lastUsedAt: null,
        revoked: false,
        revokedAt: null,
    });
    // Ritorna la chiave plain UNA SOLA VOLTA (server non la salva)
    return {
        id: hash,
        prefix,
        plainKey: plain,
        label,
    };
});
exports.revokeNebulaApiKey = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const id = data === null || data === void 0 ? void 0 : data.id;
    if (!id)
        throw new functions.https.HttpsError('invalid-argument', 'id mancante');
    const db = admin.firestore();
    const ref = db.collection('nebulaApiKeys').doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Chiave non trovata');
    const k = snap.data();
    if (k.userEmail !== userEmail) {
        throw new functions.https.HttpsError('permission-denied', 'Non puoi revocare chiavi di altri utenti');
    }
    await ref.update({
        revoked: true,
        revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id, revoked: true };
});
exports.listNebulaApiKeys = functions
    .region('europe-west1')
    .https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const db = admin.firestore();
    const snap = await db.collection('nebulaApiKeys')
        .where('userEmail', '==', userEmail)
        .get();
    return {
        keys: snap.docs.map(d => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const x = d.data();
            return {
                id: d.id,
                prefix: x.prefix,
                label: x.label,
                createdAt: (_c = (_b = (_a = x.createdAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null,
                lastUsedAt: (_f = (_e = (_d = x.lastUsedAt) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : null,
                revoked: !!x.revoked,
                revokedAt: (_j = (_h = (_g = x.revokedAt) === null || _g === void 0 ? void 0 : _g.toMillis) === null || _h === void 0 ? void 0 : _h.call(_g)) !== null && _j !== void 0 ? _j : null,
            };
        }).sort((a, b) => { var _a, _b; return ((_a = b.createdAt) !== null && _a !== void 0 ? _a : 0) - ((_b = a.createdAt) !== null && _b !== void 0 ? _b : 0); }),
    };
});
// ============================================================================
// NEBULA-DOCS — MCP server endpoint (F4-C3)
// Cloud Function HTTP che parla JSON-RPC al protocollo MCP. Claude Desktop /
// claude.ai connector point qui via Bearer API key (F4-C2).
//
// Tools (8): nebula.search, getDoc, listDocs, createDoc, appendBlock,
// replaceSection, linkTask, linkProject. Implementazioni in lib_mcp/tools.ts.
// JSON-RPC dispatcher + auth in lib_mcp/server.ts.
//
// URL: https://europe-west1-preventivatoreb2b-ii.cloudfunctions.net/mcpSidera
//      (alias legacy: .../mcpNebula)
// ============================================================================
const server_1 = require("./lib_mcp/server");
const oauth_1 = require("./lib_mcp/oauth");
const rateLimit_1 = require("./lib_mcp/rateLimit");
// Handler HTTP condiviso. Esposto come due function:
//   mcpSidera — endpoint canonico (serve l'intera suite: NEBULA-docs + CEPHEID)
//   mcpNebula — alias di compatibilità per i client già connessi all'URL legacy.
// Il base URL OAuth è derivato dal prefisso effettivo della request (vedi
// lib_mcp/server.ts: baseUrlFromPath), quindi entrambi gli URL funzionano.
const mcpHttpHandler = functions
    .region('europe-west1')
    .runWith({ memory: '256MB', timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
    // (N4) Rate-limit per IP sugli endpoint pubblici. Bucket separati:
    // i path OAuth sensibili (/token, /register, /authorize) hanno un tetto
    // più stretto contro il brute-force su code/token; le chiamate MCP
    // (autenticate via Bearer) hanno un tetto più generoso.
    const ip = (0, rateLimit_1.clientIpFromHeaders)(req.headers, req.ip || 'unknown');
    const p = (req.path || '').toLowerCase();
    const sensitive = p.includes('/token') || p.includes('/register') || p.includes('/authorize');
    const rl = await (0, rateLimit_1.checkRateLimit)(`mcp:${sensitive ? 'oauth' : 'rpc'}:${ip}`, sensitive ? 20 : 120, 60);
    if (!rl.allowed) {
        res.set('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: 'rate_limited', error_description: 'Troppe richieste, riprova più tardi.' });
        return;
    }
    const result = await (0, server_1.handleMcpRequest)({
        headers: req.headers,
        method: req.method,
        body: req.body,
        // F6: routing OAuth sub-paths
        path: req.path,
        query: req.query,
    });
    if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
            res.set(k, v);
        }
    }
    res.status(result.status).send(result.body);
});
exports.mcpSidera = mcpHttpHandler; // canonico
exports.mcpNebula = mcpHttpHandler; // alias legacy (non rimuovere finché i client non sono migrati)
// ============================================================================
// NEBULA-DOCS — consentOAuthRequest callable (F6)
// Chiamata dalla consent UI (/nebula/docs/oauth/consent) dopo che l'utente
// Firebase-loggato clicca "Autorizza". Genera auth code + ritorna URL di
// redirect (claude.ai redirect_uri + code + state).
// ============================================================================
exports.consentOAuthRequest = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    if (!userEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'Email utente mancante');
    }
    const authRequestId = data === null || data === void 0 ? void 0 : data.authRequestId;
    if (!authRequestId) {
        throw new functions.https.HttpsError('invalid-argument', 'authRequestId mancante');
    }
    try {
        const { redirectUri } = await (0, oauth_1.issueAuthCodeForConsent)(authRequestId, userEmail);
        return { redirectUri };
    }
    catch (e) {
        throw new functions.https.HttpsError('failed-precondition', (_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : 'Errore consent');
    }
});
// getOAuthAuthRequest: la consent UI chiama qui per mostrare "Claude vuole
// accesso come <userEmail>" + nome del client. Read-only, non emette code.
exports.getOAuthAuthRequest = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    }
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const authRequestId = data === null || data === void 0 ? void 0 : data.authRequestId;
    if (!authRequestId) {
        throw new functions.https.HttpsError('invalid-argument', 'authRequestId mancante');
    }
    const snap = await admin.firestore().collection('nebulaOauthAuthRequests').doc(authRequestId).get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Authorization request scaduta o non trovata');
    }
    const r = snap.data();
    return {
        authRequestId,
        clientName: (_a = r.client_name) !== null && _a !== void 0 ? _a : r.client_id,
        redirectUri: r.redirect_uri,
        scope: (_b = r.scope) !== null && _b !== void 0 ? _b : 'mcp',
        userEmail, // per display "verrai autorizzato come …"
    };
});
// ============================================================================
// NEBULA-DOCS — oauthCleanup scheduled (F6)
// Ogni ora elimina:
//   - nebulaOauthAuthRequests con createdAt < now - 15 min
//   - nebulaOauthCodes con createdAt < now - 10 min
//   - nebulaOauthTokens con expiresAt < now
// ============================================================================
exports.oauthCleanup = functions
    .region('europe-west1')
    .pubsub.schedule('every 60 minutes')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const r = await (0, oauth_1.cleanupOAuthStale)();
    console.log(`[oauthCleanup] deleted requests=${r.requests} codes=${r.codes} tokens=${r.tokens}`);
    // (N4) purge dei contatori rate-limit con finestra scaduta da >1 giorno
    // (1 doc per IP: crescita minima, ma teniamo pulito).
    try {
        const db = admin.firestore();
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const stale = await db.collection('rateLimits').where('windowStart', '<', cutoff).limit(500).get();
        if (!stale.empty) {
            const batch = db.batch();
            stale.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
            console.log(`[oauthCleanup] purged ${stale.size} stale rateLimits`);
        }
    }
    catch (e) {
        console.error('[oauthCleanup] rateLimits purge failed', e);
    }
    return null;
});
// ============================================================================
// NEBULA-DOCS — notifyOnMention (F5-C3) onWrite su nebulaDocs/{docId}
// Diff refs.users[] prima/dopo. Per gli utenti AGGIUNTI (mention nuovi)
// invia push FCM data-only scope='nebula' con titolo doc + URL.
// Skip su delete + skip se l'utente menzionato è chi ha scritto (auto-mention).
//
// Pattern coerente con [PULSAR push] esistente:
//  - team/{email}.fcmTokens map { tokenStr: { ts, scope, ua? } | Timestamp legacy }
//  - filter scope 'nebula' o 'sidera' (desktop wildcard); legacy = pulsar → skip
//  - data-only payload (SW costruisce notifica → evita doppia)
//  - cleanup token invalidi best-effort
// ============================================================================
exports.notifyOnMention = functions
    .region('europe-west1')
    .firestore.document('nebulaDocs/{docId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!change.after.exists)
        return null; // doc cancellato → niente notifica
    const after = change.after.data();
    const before = change.before.exists ? change.before.data() : null;
    const usersAfter = new Set(((_b = (_a = after.refs) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : []).map(e => e.toLowerCase().trim()).filter(Boolean));
    const usersBefore = new Set(((_d = (_c = before === null || before === void 0 ? void 0 : before.refs) === null || _c === void 0 ? void 0 : _c.users) !== null && _d !== void 0 ? _d : []).map(e => e.toLowerCase().trim()).filter(Boolean));
    const newlyMentioned = [];
    usersAfter.forEach(u => { if (!usersBefore.has(u))
        newlyMentioned.push(u); });
    if (newlyMentioned.length === 0)
        return null;
    const sender = ((_e = after.updatedBy) !== null && _e !== void 0 ? _e : '').toLowerCase().trim();
    const targets = newlyMentioned.filter(u => u && u !== sender); // skip auto-mention
    if (targets.length === 0)
        return null;
    const db = admin.firestore();
    const docId = context.params.docId;
    const docTitle = after.title || 'Senza titolo';
    // Carica fcmTokens dai team docs dei target
    // Re-key tollerante (docs/STELLA-GRAFO.md): risolvi per CAMPO email.
    const teamSnaps = (await Promise.all(targets.map(email => db.collection('team').where('email', '==', email).get()))).flatMap(s => s.docs);
    const rawTokens = [];
    for (const ts of teamSnaps) {
        if (!ts.exists)
            continue;
        const tokensMap = ((_g = (_f = ts.data()) === null || _f === void 0 ? void 0 : _f.fcmTokens) !== null && _g !== void 0 ? _g : {});
        for (const [tk, val] of Object.entries(tokensMap)) {
            if (val && typeof val === 'object' && 'scope' in val) {
                const scope = val.scope;
                // Wildcard 'sidera' (desktop) + dedicato 'nebula'
                if (scope === 'nebula' || scope === 'sidera')
                    rawTokens.push(tk);
            }
            // Legacy timestamp nudo = default pulsar → skip (notifica nebula non rilevante)
        }
    }
    const tokens = Array.from(new Set(rawTokens));
    if (tokens.length === 0) {
        console.log(`[notifyOnMention] ${docId}: ${targets.length} mention nuove ma 0 token scope=nebula/sidera`);
        return null;
    }
    const senderDisplay = sender.split('@')[0] || 'Qualcuno';
    const title = `${senderDisplay} ti ha menzionato`;
    const body = `In "${docTitle.slice(0, 80)}"`;
    const messageId = `nebula-doc-${docId}-${Date.now()}`;
    const res = await admin.messaging().sendEachForMulticast({
        tokens,
        data: {
            docId,
            messageId,
            scope: 'nebula',
            title,
            body,
            url: `/nebula/docs/${docId}`,
        },
    });
    // Cleanup token invalidi (stesso pattern PULSAR)
    const invalidTokens = [];
    res.responses.forEach((r, i) => {
        var _a, _b;
        if (!r.success) {
            const code = (_b = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : '';
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(tokens[i]);
            }
        }
    });
    if (invalidTokens.length) {
        await Promise.all(targets.map(async (email) => {
            const updates = {};
            invalidTokens.forEach(tk => { updates[`fcmTokens.${tk}`] = admin.firestore.FieldValue.delete(); });
            if (Object.keys(updates).length) {
                // Re-key tollerante: aggiorna TUTTI i doc che matchano l'email.
                try {
                    const qs = await db.collection('team').where('email', '==', email).get();
                    await Promise.all(qs.docs.map(d => d.ref.update(updates)));
                }
                catch ( /* ignore */_a) { /* ignore */ }
            }
        }));
    }
    console.log(`[notifyOnMention] ${docId}: target ${targets.length}, tokens ${tokens.length}, success ${res.successCount}`);
    return null;
});
// ============================================================================
// NEBULA-DOCS — archive / unarchive callable (F5b-C1)
// Soft delete: sets archived=true + archivedAt. Doc resta in Firestore per
// 90gg (decisione §12 #5) — trashPurge function futura farà hard delete.
// SOLO owner può archive/unarchive. Filter `archived !== true` lato client
// nasconde il doc dalle viste principali.
// ============================================================================
async function setArchivedFlag(docId, userEmail, archived) {
    const db = admin.firestore();
    const ref = db.collection('nebulaDocs').doc(docId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Documento non trovato');
    const acl = snap.data().acl;
    if (!acl)
        throw new functions.https.HttpsError('failed-precondition', 'Documento senza ACL');
    if (!acl.owners.includes(userEmail)) {
        throw new functions.https.HttpsError('permission-denied', 'Solo gli owner possono archiviare/ripristinare');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.update({
        archived,
        archivedAt: archived ? now : null,
        updatedAt: now,
        updatedBy: userEmail,
    });
    return { docId, archived };
}
exports.archiveNebulaDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    if (!docId)
        throw new functions.https.HttpsError('invalid-argument', 'docId mancante');
    return setArchivedFlag(docId, userEmail, true);
});
exports.unarchiveNebulaDoc = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    const userEmail = nebulaNormalizeEmail(context.auth.token.email);
    const docId = data === null || data === void 0 ? void 0 : data.docId;
    if (!docId)
        throw new functions.https.HttpsError('invalid-argument', 'docId mancante');
    return setArchivedFlag(docId, userEmail, false);
});
// ============================================================================
// QUASAR · Calendario EPHEMERIS — notifiche appuntamenti (push FCM data-only)
// Un appuntamento E' una task con type==='appointment' standalone in tasks/{id}.
// Clone del pattern notifyOnMention:
//   - team doc fcmTokens map { tokenStr: { ts, scope, ua? } | Timestamp legacy }
//   - filtro scope 'sidera' (audience QUASAR/desktop; il root SW serve quasar+sidera)
//   - payload data-only scope='quasar' url='/quasar/calendario'
//   - assignees ora sono UID -> risoluzione UID->team doc tollerante al re-key /team
// Notifiche FISSE per ora (impostazioni utente in CORE = step successivo).
// v1 ammette piu' trigger indipendenti sullo stesso path (vedi logTaskActivityStandalone).
// ============================================================================
const APPT_LEADS = [
    { key: 'd1', ms: 24 * 60 * 60 * 1000 },
    { key: 'h1', ms: 60 * 60 * 1000 },
];
// Risolve i team doc di un UID (tollerante docs/STELLA-GRAFO.md): un partecipante puo'
// avere doc uid-keyed (id===uid) o email-keyed con campo uid. Raccoglie da entrambi.
async function teamRefsForUid(uid) {
    const db = admin.firestore();
    const out = [];
    try {
        const direct = await db.collection('team').doc(uid).get();
        if (direct.exists)
            out.push(direct);
    }
    catch (_) { /* ignore */ }
    try {
        const byField = await db.collection('team').where('uid', '==', uid).get();
        byField.docs.forEach(d => out.push(d));
    }
    catch (_) { /* ignore */ }
    return out;
}
// UID partecipanti -> token FCM scope 'sidera' (dedup per doc e per token).
async function collectAppointmentTokens(uids) {
    var _a, _b;
    const clean = Array.from(new Set((uids !== null && uids !== void 0 ? uids : []).filter(Boolean)));
    if (!clean.length)
        return [];
    const perUid = await Promise.all(clean.map(teamRefsForUid));
    const seenDoc = new Set();
    const rawTokens = [];
    for (const snap of perUid.flat()) {
        if (!snap.exists || seenDoc.has(snap.ref.path))
            continue;
        seenDoc.add(snap.ref.path);
        const tokensMap = ((_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) !== null && _b !== void 0 ? _b : {});
        for (const [tk, val] of Object.entries(tokensMap)) {
            if (val && typeof val === 'object' && 'scope' in val) {
                if (val.scope === 'sidera')
                    rawTokens.push(tk);
            }
            // legacy timestamp nudo = default 'pulsar' -> skip (calendario non rilevante)
        }
    }
    return Array.from(new Set(rawTokens));
}
// Orario leggibile in italiano (timezone Europe/Rome).
function apptWhen(startAt) {
    if (!startAt)
        return '';
    return startAt.toDate().toLocaleString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
    });
}
// Invio multicast + cleanup token invalidi (best-effort, per-uid tollerante).
async function sendAppointmentPush(uids, title, body, messageId) {
    const tokens = await collectAppointmentTokens(uids);
    if (!tokens.length) {
        console.log('[appt push] 0 token scope=sidera');
        return;
    }
    const res = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { messageId, scope: 'quasar', title, body, url: '/quasar/calendario' },
    });
    const invalid = [];
    res.responses.forEach((r, i) => {
        var _a, _b;
        if (!r.success) {
            const code = (_b = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : '';
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered')
                invalid.push(tokens[i]);
        }
    });
    if (invalid.length) {
        const updates = {};
        invalid.forEach(tk => { updates[`fcmTokens.${tk}`] = admin.firestore.FieldValue.delete(); });
        await Promise.all(Array.from(new Set(uids.filter(Boolean))).map(async (uid) => {
            try {
                const refs = (await teamRefsForUid(uid)).map(s => s.ref);
                await Promise.all(refs.map(r => r.update(updates).catch(() => undefined)));
            }
            catch (_) { /* ignore */ }
        }));
    }
    console.log(`[appt push] target uids ${uids.length}, tokens ${tokens.length}, success ${res.successCount}`);
}
// Trigger onWrite: invito (create), riprogrammazione (cambio startAt/endAt), annullamento (delete).
// Reagisce SOLO alle task type==='appointment'; gli altri update task (incl. remindersSent
// scritto dallo scheduler) non producono push.
exports.notifyOnAppointment = functions
    .region('europe-west1')
    .firestore.document('tasks/{taskId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const isAppt = ((after === null || after === void 0 ? void 0 : after.type) === 'appointment') || ((before === null || before === void 0 ? void 0 : before.type) === 'appointment');
    if (!isAppt)
        return null;
    const taskId = context.params.taskId;
    const data = (after !== null && after !== void 0 ? after : before);
    const title = data.title || 'Appuntamento';
    const creator = data.createdBy || '';
    const participants = Array.isArray(data.assignees) ? data.assignees.filter(Boolean) : [];
    // Notifica gli ALTRI partecipanti: l'autore della modifica e' tipicamente il creatore.
    const targets = participants.filter(u => u && u !== creator);
    if (!targets.length)
        return null;
    let pushTitle = '';
    let pushBody = '';
    if (!before && after) {
        pushTitle = 'Nuovo appuntamento';
        pushBody = `${title}${after.startAt ? ' · ' + apptWhen(after.startAt) : ''}`;
    }
    else if (before && !after) {
        pushTitle = 'Appuntamento annullato';
        pushBody = `${title}${before.startAt ? ' · ' + apptWhen(before.startAt) : ''}`;
    }
    else if (before && after) {
        const bs = (_c = (_b = (_a = before.startAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        const as = (_f = (_e = (_d = after.startAt) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
        const be = (_j = (_h = (_g = before.endAt) === null || _g === void 0 ? void 0 : _g.toMillis) === null || _h === void 0 ? void 0 : _h.call(_g)) !== null && _j !== void 0 ? _j : 0;
        const ae = (_m = (_l = (_k = after.endAt) === null || _k === void 0 ? void 0 : _k.toMillis) === null || _l === void 0 ? void 0 : _l.call(_k)) !== null && _m !== void 0 ? _m : 0;
        if (bs === as && be === ae)
            return null; // update non-orario -> niente push
        pushTitle = 'Appuntamento riprogrammato';
        pushBody = `${title}${after.startAt ? ' · ' + apptWhen(after.startAt) : ''}`;
    }
    else {
        return null;
    }
    await sendAppointmentPush(targets, pushTitle, pushBody, `appt-${taskId}-${Date.now()}`);
    return null;
});
// Scheduler: promemoria FISSI 1 giorno e 1 ora prima. Scan ogni 15 min, idempotente
// via task.remindersSent[] (aggiornarlo NON ri-triggera notifyOnAppointment: reagisce
// solo a create/delete/cambio orario). Range su startAt = indice single-field automatico.
exports.appointmentReminders = functions
    .region('europe-west1')
    .pubsub.schedule('every 15 minutes')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const GRACE = 30 * 60 * 1000;
    const fromTs = admin.firestore.Timestamp.fromMillis(now);
    const toTs = admin.firestore.Timestamp.fromMillis(now + 25 * 60 * 60 * 1000);
    const snap = await db.collection('tasks')
        .where('startAt', '>', fromTs).where('startAt', '<', toTs).get();
    let sentCount = 0;
    for (const docSnap of snap.docs) {
        const t = docSnap.data();
        if (t.type !== 'appointment')
            continue;
        const startAt = t.startAt;
        if (!startAt)
            continue;
        const start = startAt.toMillis();
        if (start <= now)
            continue;
        const title = t.title || 'Appuntamento';
        const creator = t.createdBy || '';
        const participants = Array.isArray(t.assignees) ? t.assignees.filter(Boolean) : [];
        // Promemoria: include anche il creatore (deve ricordarsi del proprio impegno).
        const targets = Array.from(new Set(participants.length ? participants : (creator ? [creator] : [])));
        if (!targets.length)
            continue;
        const sent = new Set(Array.isArray(t.remindersSent) ? t.remindersSent : []);
        let changed = false;
        for (const lead of APPT_LEADS) {
            const fireAt = start - lead.ms;
            if (now >= fireAt && !sent.has(lead.key)) {
                if (now <= fireAt + GRACE) {
                    const when = apptWhen(startAt);
                    const head = lead.key === 'd1' ? 'Domani' : "Tra un'ora";
                    await sendAppointmentPush(targets, 'Promemoria appuntamento', `${head} · ${title}${when ? ' (' + when + ')' : ''}`, `appt-rem-${docSnap.id}-${lead.key}`);
                    sentCount++;
                }
                sent.add(lead.key); // marca comunque per non spammare reminder in ritardo
                changed = true;
            }
        }
        if (changed)
            await docSnap.ref.update({ remindersSent: Array.from(sent) }).catch(() => undefined);
    }
    console.log(`[appointmentReminders] scanned ${snap.size}, reminders sent ${sentCount}`);
    return null;
});
//# sourceMappingURL=index.js.map