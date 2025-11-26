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
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
// Inizializza Firebase
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// --- CONFIGURAZIONE ---
const FIC_API_URL = "https://api-v2.fattureincloud.it";
const COMPANY_ID = "185254";
const FIC_CLIENT_ID = "m6V7Abz1NneFHAXvmEPP6X8vO96QdIVv";
const FIC_CLIENT_SECRET = "FvVpcC0YyyPnaKNR9mNMuCslrk6ycDqrdGHl0v6szYu3nVpBFs7jfqU2IvoWF96U";
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
    .onUpdate(async (change, _context) => {
    var _a;
    const newData = change.after.data();
    const oldData = change.before.data();
    if (!newData)
        return null;
    // 1. CONTROLLO TRIGGER (ORDER_REQ -> WAITING...)
    const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
    const eraRichiesto = (oldData === null || oldData === void 0 ? void 0 : oldData.stato) === 'ORDER_REQ';
    const eAttivato = statiAttivazione.includes(newData.stato);
    if (!eraRichiesto || !eAttivato)
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
        let clientData = null;
        // Chiamata API per cercare il cliente
        const searchRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
            headers: { Authorization: `Bearer ${accessToken}` }, // Usa il token dinamico
            params: { "q": `vat_number = '${pivaCliente}'` }
        });
        if (searchRes.data.data && searchRes.data.data.length > 0) {
            // TROVATO! Prendiamo il primo risultato
            clientData = searchRes.data.data[0];
            ficId = clientData.id;
            console.log(`[FIC] Cliente TROVATO. ID: ${ficId} (${clientData.name})`);
        }
        else {
            // NON TROVATO -> LO CREIAMO
            console.log("[FIC] Cliente non trovato. Creazione in corso...");
            const createRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                data: {
                    name: ragioneSociale,
                    vat_number: pivaCliente,
                    email: (userData === null || userData === void 0 ? void 0 : userData.email) || "",
                    type: 'company'
                }
            }, { headers: { Authorization: `Bearer ${accessToken}` } });
            clientData = createRes.data.data;
            ficId = clientData.id;
            console.log(`[FIC] Nuovo Cliente creato. ID: ${ficId}`);
        }
        // 4. ESTRAZIONE DATI PAGAMENTO
        const defaultPaymentMethodId = ((_a = clientData.default_payment_method) === null || _a === void 0 ? void 0 : _a.id) || null;
        const defaultPaymentTerms = clientData.default_payment_terms || 0;
        const defaultPaymentType = clientData.default_payment_terms_type || 'standard';
        // 5. CALCOLI ECONOMICI
        const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
        const today = new Date().toISOString().split('T')[0];
        const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
        const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));
        // 6. PREPARAZIONE RIGHE ORDINE
        const itemsList = (newData.elementi || []).map((item) => {
            const desc = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            return {
                name: item.descrizioneCompleta || "Articolo Vetrata",
                description: desc,
                qty: item.quantita || 1,
                net_price: item.prezzo_unitario || 0,
                vat: { id: VAT_ID, value: VAT_VALUE }
            };
        });
        // 7. CREAZIONE ORDINE
        const orderPayload = {
            data: {
                type: "order",
                entity: {
                    id: ficId,
                    name: clientData.name
                },
                date: today,
                visible_subject: newData.commessa || `Rif: ${newData.codice}`,
                items_list: itemsList,
                payments_list: [
                    {
                        amount: importoLordo,
                        due_date: dataScadenza,
                        status: "not_paid"
                    }
                ]
            }
        };
        if (defaultPaymentMethodId) {
            orderPayload.data.payment_method = { id: defaultPaymentMethodId };
            orderPayload.data.payments_list[0].payment_method = { id: defaultPaymentMethodId };
        }
        // 8. INVIO A FATTURE IN CLOUD (Usa token dinamico)
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
//# sourceMappingURL=index.js.map