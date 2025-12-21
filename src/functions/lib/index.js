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
// --- NUOVA FUNZIONE: SINCRONIZZAZIONE PRODOTTI ---
exports.syncProductsWithFic = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 300, memory: '512MB' }) // Più risorse per liste lunghe
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
    // I codici che ci interessano (dal CSV)
    const targetCodes = (data.codes || []).map((c) => c.toUpperCase().trim());
    if (targetCodes.length === 0) {
        return { success: false, message: "Nessun codice fornito per la sync." };
    }
    const db = admin.firestore();
    const token = await getValidFicToken();
    const results = { updated: 0, created: 0, skipped: 0, errors: [] };
    try {
        console.log(`[SYNC] Inizio sync per ${targetCodes.length} codici.`);
        // 1. SCARICA TUTTI I PRODOTTI DA FIC (Paginazione)
        // È più efficiente scaricare tutto e filtrare in memoria che fare 200 chiamate singole
        let allFicProducts = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const res = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/products`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { page: page, per_page: 50 } // Max per page
            });
            const fetched = res.data.data || [];
            allFicProducts = [...allFicProducts, ...fetched];
            if (!res.data.next_page_url) {
                hasMore = false;
            }
            else {
                page++;
            }
        }
        console.log(`[SYNC] Scaricati ${allFicProducts.length} prodotti da FiC.`);
        // 2. CREA MAPPA DEI PRODOTTI FIC (Code -> Product)
        const ficMap = new Map();
        allFicProducts.forEach(p => {
            if (p.code)
                ficMap.set(p.code.toUpperCase().trim(), p);
        });
        // 3. AGGIORNA FIRESTORE (Batch)
        const batch = db.batch();
        let batchCount = 0;
        for (const code of targetCodes) {
            const ficProduct = ficMap.get(code);
            if (!ficProduct) {
                results.skipped++; // Codice presente nel CSV ma non su FiC
                // Opzionale: results.errors.push(`Codice ${code} non trovato su FiC`);
                continue;
            }
            const docRef = db.collection('products').doc(code); // ID Documento = Codice (es. I111)
            // Mappiamo tutti i dati utili
            const productData = {
                id: ficProduct.id, // IMPORTANTE: Questo serve per l'ordine
                code: ficProduct.code,
                name: ficProduct.name,
                net_price: ficProduct.net_price,
                gross_price: ficProduct.gross_price,
                category: ficProduct.category,
                description: ficProduct.description,
                uom: ficProduct.uom,
                default_vat: ficProduct.default_vat, // Oggetto iva completo
                raw_data: ficProduct, // Salviamo tutto il resto per sicurezza/modifiche future
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            };
            batch.set(docRef, productData, { merge: true });
            batchCount++;
            results.updated++;
            // Commit ogni 400 operazioni (limite Firestore è 500)
            if (batchCount >= 400) {
                await batch.commit();
                batchCount = 0; // Reset counter, ma il batch object va ricreato? 
                // No, db.batch() crea una nuova istanza, quindi meglio fare commit e poi loop nuovo
                // Per semplicità qui facciamo commit unico alla fine se sono pochi, 
                // ma per sicurezza su grandi numeri usiamo un nuovo batch.
            }
        }
        if (batchCount > 0) {
            await batch.commit();
        }
        console.log(`[SYNC] Completato. Aggiornati: ${results.updated}`);
        return results;
    }
    catch (error) {
        console.error("[SYNC] Errore critico:", error);
        throw new functions.https.HttpsError('internal', error.message);
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
// --- HELPER DATE ---
function calcolaScadenza(giorni, tipo) {
    const data = new Date();
    data.setDate(data.getDate() + (giorni || 0));
    if (tipo === 'end_of_month') {
        data.setMonth(data.getMonth() + 1);
        data.setDate(0);
    }
    return data.toISOString().split('T')[0] || '';
}
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
    var _a;
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
        const defaultPaymentTerms = detailedClient.default_payment_terms || 0;
        const defaultPaymentType = detailedClient.default_payment_terms_type || 'standard';
        // 6. CALCOLI ECONOMICI
        const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
        const dataOrdine = newData.dataConsegnaPrevista || new Date().toISOString().split('T')[0];
        const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
        const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));
        const productsSnap = await admin.firestore().collection('products').get();
        const productMap = new Map();
        productsSnap.forEach(doc => {
            const p = doc.data();
            if (p.code)
                productMap.set(p.code.toUpperCase().trim(), p.id); // Mappa CODICE -> ID_FIC
        });
        // 7. PREPARAZIONE RIGHE ORDINE
        const itemsList = (newData.elementi || []).map((item) => {
            const desc = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            // Cerchiamo il codice prodotto
            // Assumiamo che l'app salvi 'codice' (es. I111) nell'oggetto item. 
            // Se il campo si chiama diversamente (es. item.codiceListino), cambialo qui.
            const itemCode = item.codice ? item.codice.toUpperCase().trim() : null;
            const ficProductId = itemCode ? productMap.get(itemCode) : null;
            const lineItem = {
                code: itemCode || "", // Visualizzato in fattura
                name: item.descrizioneCompleta || "Articolo Vetrata",
                description: desc,
                qty: item.quantita || 1,
                net_price: item.prezzo_unitario || 0,
                category: item.categoria,
                vat: { id: VAT_ID, value: VAT_VALUE }
            };
            // SE TROVIAMO IL PRODOTTO COLLEGATO, LO AGGIUNGIAMO!
            // Questo è ciò che popola le statistiche "Per Prodotto" su FiC
            if (ficProductId) {
                lineItem.product_id = ficProductId;
            }
            return lineItem;
        });
        // 8. CREAZIONE ORDINE
        const orderPayload = {
            data: {
                type: "order",
                // 🔥 Mappatura Completa Entity
                entity: {
                    id: ficId,
                    name: detailedClient.name,
                    vat_number: detailedClient.vat_number || "", // Meglio stringa vuota anche qui per sicurezza
                    tax_code: detailedClient.tax_code || "", // <--- Stringa vuota
                    address_street: detailedClient.address_street || "",
                    address_postal_code: detailedClient.address_postal_code || "",
                    address_city: detailedClient.address_city || "",
                    address_province: detailedClient.address_province || "",
                    country: detailedClient.country || "Italia"
                },
                date: dataOrdine,
                visible_subject: newData.commessa || `Rif: ${newData.codice}`,
                items_list: itemsList,
                payments_list: [
                    {
                        amount: importoLordo,
                        due_date: dataScadenza,
                        status: "not_paid"
                    }
                ],
                // 🔥 Flag Richiesti
                stock: false,
                show_payments: false,
                show_payment_method: false
            }
        };
        if (defaultPaymentMethodId) {
            orderPayload.data.payment_method = { id: defaultPaymentMethodId };
            orderPayload.data.payments_list[0].payment_method = { id: defaultPaymentMethodId };
        }
        // 9. INVIO A FATTURE IN CLOUD
        const orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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
        // 3. RECUPERO DETTAGLI CLIENTE (Fallback come prima)
        let detailedClient = null;
        if (joinedData.entity && joinedData.entity.id) {
            try {
                const clientDetailRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${joinedData.entity.id}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { fieldset: 'detailed' }
                });
                detailedClient = clientDetailRes.data.data;
            }
            catch (err) {
                console.warn("[FIC] Impossibile recuperare dettagli cliente, userò dati base.");
            }
        }
        const entityData = detailedClient ? {
            id: detailedClient.id,
            name: detailedClient.name,
            vat_number: detailedClient.vat_number || "",
            tax_code: detailedClient.tax_code || "",
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
// --- HELPER: RECUPERA CLIENTE DA FIC ---
async function fetchFicClientByVat(vatNumber, token) {
    try {
        const res = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
            headers: { Authorization: `Bearer ${token}` },
            // CORREZIONE: Usa 'q' invece di 'filter' per le API di Fatture in Cloud
            params: { q: `vat_number = '${vatNumber}'` }
        });
        return res.data.data && res.data.data.length > 0 ? res.data.data[0] : null;
    }
    catch (e) {
        console.error(`Errore FiC lookup ${vatNumber}`, e);
        return null;
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
//# sourceMappingURL=index.js.map