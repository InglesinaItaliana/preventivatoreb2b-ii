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
exports.autoDeliveredAfter7Days = exports.createTeamMember = void 0;
const dotenv = __importStar(require("dotenv")); // <--- AGGIUNGI QUESTO
dotenv.config(); // <--- E QUESTO (Carica subito il file .env)
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const nodemailer = __importStar(require("nodemailer"));
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
        // 3. AGGIORNAMENTO STATO FIRESTORE -> REJECTED
        await docRef.update({
            stato: 'REJECTED',
            fic_order_id: admin.firestore.FieldValue.delete(),
            fic_order_url: admin.firestore.FieldValue.delete(),
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
// --- NUOVA FUNZIONE: SYNC RUOLI (Database -> Auth Claims) ---
// Ogni volta che si scrive nella collezione 'team', aggiorna i Custom Claims dell'utente
exports.syncTeamRoleToAuth = functions
    .region('europe-west1')
    .firestore
    .document('team/{email}') // L'ID del documento è l'email
    .onWrite(async (change, context) => {
    const email = context.params.email;
    const newData = change.after.exists ? change.after.data() : null;
    try {
        // 1. Trova l'utente Auth tramite email
        // Nota: Usiamo l'email perché nel tuo sistema l'ID del doc team è l'email
        const userRecord = await admin.auth().getUserByEmail(email);
        if (!newData) {
            // CASO CANCELLAZIONE: Se il doc viene cancellato, rimuovi i claims
            await admin.auth().setCustomUserClaims(userRecord.uid, null);
            console.log(`[ROLE SYNC] Rimossi ruoli per ${email}`);
            return;
        }
        const role = newData.role; // 'ADMIN', 'PRODUZIONE', 'LOGISTICA'
        // 2. Imposta il Custom Claim
        // Salviamo 'role' dentro il token
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });
        console.log(`[ROLE SYNC] Assegnato ruolo '${role}' a ${email}`);
        // Opzionale: Forza il refresh del token lato client (non fattibile da qui, ma utile saperlo)
    }
    catch (e) {
        if (e.code === 'auth/user-not-found') {
            console.warn(`[ROLE SYNC] Utente Auth non trovato per ${email}. Il documento team esiste ma l'utente no.`);
        }
        else {
            console.error(`[ROLE SYNC] Errore sincronizzazione ${email}:`, e);
        }
    }
    // --- AVATAR STELLARI: assegna hueIndex + category di default se mancanti ---
    // Counter PER-CATEGORIA (`counters/teamHue_${category}`): garantisce rank
    // sequenziale entro ogni famiglia (produzione: 0,1,2,...). Combinato col
    // tone-cycle nell'engine, i primi 6 workers di una categoria avranno hue
    // tutti diversi (palette 6) e dal 7 in poi stesso hue ma intensita' diversa.
    if (newData) {
        const needsHue = typeof newData.hueIndex !== 'number';
        const needsCategory = !newData.category;
        if (needsHue || needsCategory) {
            const db = admin.firestore();
            const teamRef = db.collection('team').doc(email);
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
                console.log(`[AVATAR SYNC] ${email}: hue/category assegnati (needsHue=${needsHue}, needsCategory=${needsCategory})`);
            }
            catch (e) {
                console.error(`[AVATAR SYNC] Errore assegnazione avatar ${email}:`, e);
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
    const { email, password, firstName, lastName, role, phone } = data;
    if (!email || !password || !role) {
        throw new functions.https.HttpsError("invalid-argument", "Dati mancanti.");
    }
    try {
        // 2. Crea l'utente in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password, // La password scelta dall'Admin
            displayName: `${firstName} ${lastName}`,
            disabled: false,
        });
        // 3. Crea il documento nel Database 'team' (usando l'email come ID per coerenza con le tue regole)
        await admin.firestore().collection("team").doc(email.toLowerCase().trim()).set({
            uid: userRecord.uid,
            email: email.toLowerCase().trim(),
            firstName,
            lastName,
            role,
            phone: phone || "",
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid
        });
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
    if (!eAttivato || newData.fic_order_id)
        return null;
    const clienteUID = newData.clienteUID;
    if (!clienteUID) {
        console.error("[FIC] ERRORE: Manca clienteUID nel preventivo.");
        return null;
    }
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
// --- FUNZIONE SEGNALAZIONE BUG NOTION ---
exports.submitBugToNotion = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
    var _a;
    // 1. Verifica Autenticazione
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere loggato per segnalare un bug.');
    }
    const { title, description, category, pageUrl, technicalContext, userEmail } = data;
    try {
        // 2. RECUPERA LE CHIAVI DAL DATABASE FIRESTORE
        const db = admin.firestore();
        const configDoc = await db.collection('config').doc('notion').get();
        if (!configDoc.exists) {
            console.error("Configurazione Notion mancante nel DB (config/notion).");
            throw new functions.https.HttpsError('internal', 'Errore configurazione server.');
        }
        const configData = configDoc.data();
        const NOTION_API_KEY = configData === null || configData === void 0 ? void 0 : configData.NOTION_API_KEY;
        const NOTION_DB_ID = configData === null || configData === void 0 ? void 0 : configData.NOTION_DB_ID;
        if (!NOTION_API_KEY || !NOTION_DB_ID) {
            console.error("Chiavi Notion mancanti nel documento config/notion.");
            throw new functions.https.HttpsError('internal', 'Errore configurazione chiavi.');
        }
        // 3. Invia a Notion
        // FIX: Aggiunta Icona e Data Segnalazione
        const response = await axios_1.default.post('https://api.notion.com/v1/pages', {
            parent: { database_id: NOTION_DB_ID },
            // NUOVO: Icona della pagina Notion
            icon: {
                type: "emoji",
                emoji: "🐞"
            },
            properties: {
                "Titolo Bug": {
                    title: [
                        { text: { content: title } }
                    ]
                },
                "Status": {
                    status: { name: "Da Analizzare" }
                },
                "Categoria": {
                    select: { name: category || "Altro" }
                },
                "Pagina/URL": {
                    url: pageUrl
                },
                "Segnalato Da": {
                    rich_text: [
                        { text: { content: userEmail || "anonimo" } }
                    ]
                },
                // NUOVO: Data Segnalazione (assicurati che la colonna in Notion si chiami esattamente così)
                "Data Segnalazione": {
                    date: { start: new Date().toISOString() }
                },
                "Dettagli": {
                    rich_text: [
                        // Tronchiamo a 2000 caratteri per evitare errori API sulle proprietà
                        { text: { content: (description || "").substring(0, 2000) } }
                    ]
                },
                "Contesto Tecnico": {
                    rich_text: [
                        { text: { content: JSON.stringify(technicalContext, null, 2).substring(0, 2000) } }
                    ]
                },
                "Priorità": {
                    select: { name: "Media" }
                }
            },
            children: [
                {
                    object: "block",
                    type: "heading_2",
                    heading_2: {
                        rich_text: [{ text: { content: "Descrizione Problema" } }]
                    }
                },
                {
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [{ text: { content: description } }]
                    }
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            }
        });
        return { success: true, notionUrl: (_a = response.data) === null || _a === void 0 ? void 0 : _a.url };
    }
    catch (error) {
        const err = error;
        let errorMsg = "Errore sconosciuto";
        if (err.response && err.response.data) {
            try {
                errorMsg = JSON.stringify(err.response.data);
            }
            catch (_b) {
                errorMsg = "Errore non serializzabile";
            }
        }
        else if (err.message) {
            errorMsg = err.message;
        }
        console.error("Errore Notion:", errorMsg);
        throw new functions.https.HttpsError('internal', 'Errore durante l\'invio a Notion.');
    }
});
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
        // 3. Resetta lo stato e pulisce i campi su Firestore
        await docRef.update({
            stato: 'DRAFT',
            fic_order_id: admin.firestore.FieldValue.delete(),
            fic_order_url: admin.firestore.FieldValue.delete(),
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
        const teamSnaps = await Promise.all(targets.map((email) => db.collection('team').doc(email).get()));
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
                    try {
                        await db.collection('team').doc(email).update(updates);
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
    // LWW revision check
    const baseRev = (_g = data === null || data === void 0 ? void 0 : data.baseRevision) !== null && _g !== void 0 ? _g : -1;
    if (baseRev !== current.revision) {
        throw new functions.https.HttpsError('failed-precondition', `Conflitto revisione (corrente ${current.revision}, ricevuta ${baseRev})`, {
            currentRevision: current.revision,
            currentTitle: current.title,
            currentContent: current.content,
        });
    }
    const nextRev = current.revision + 1;
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
    function walk(node) {
        var _a, _b, _c;
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
        if (Array.isArray(node.content)) {
            for (const child of node.content)
                walk(child);
        }
    }
    walk(content);
    return {
        tasks: Array.from(tasks).sort(),
        projects: Array.from(projects).sort(),
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
        arraysShallowEqual(currentRefs.projects, computed.projects)) {
        return null;
    }
    // Update solo i sotto-campi refs.tasks + refs.projects (preserva
    // refs.deliverables/docs/users gestiti da chunks futuri).
    const docId = context.params.docId;
    await admin.firestore()
        .collection('nebulaDocs').doc(docId)
        .update({
        'refs.tasks': computed.tasks,
        'refs.projects': computed.projects,
    });
    console.log(`[indexDocRefs] ${docId} — tasks: ${computed.tasks.length}, projects: ${computed.projects.length}`);
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
//# sourceMappingURL=index.js.map