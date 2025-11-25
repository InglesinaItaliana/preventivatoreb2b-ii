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
const functions = __importStar(require("firebase-functions/v1")); // ✅ IMPORTAZIONE FORZATA ALLA V1
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
// Inizializza l'app Firebase
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// --- CONFIGURAZIONE ---
const FIC_API_URL = "https://api-v2.fattureincloud.it";
// !!! I TUOI DATI REALI !!!
const COMPANY_ID = "185254";
const ACCESS_TOKEN = "a/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJVcG5pR0dSSm5qazV1U0NwQTZiejljWmJpZE94Q09yMiIsImV4cCI6MTc2NDE2NDA4MH0.aIoepTRU8tb7GkXbRaC_2b6SOsfwNjr4eqrXUgsgPQo";
const VAT_ID = 0;
const VAT_VALUE = 22;
// --- FUNZIONE HELPER PER CALCOLARE LA DATA ---
function calcolaScadenza(giorni, tipo) {
    const data = new Date();
    // Aggiungi i giorni
    data.setDate(data.getDate() + (giorni || 0));
    // Se è "Fine Mese", vai all'ultimo giorno di quel mese
    if (tipo === 'end_of_month') {
        // Imposta al giorno 1 del mese successivo, poi torna indietro di 1 giorno
        data.setMonth(data.getMonth() + 1);
        data.setDate(0);
    }
    return data.toISOString().split('T')[0]; // Formato YYYY-MM-DD
}
// --- SINCRONIZZAZIONE ---
exports.sincronizzaClientiFIC = functions
    .region('europe-west1')
    // ✅ AGGIUNTI TIPI ESPLICITI PER REQ E RES
    .https.onRequest(async (_req, res) => {
    const usersSnapshot = await admin.firestore().collection('users').get();
    const batch = admin.firestore().batch();
    let updatedCount = 0;
    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        // ✅ GESTIONE UNDEFINED: Se manca piva, diventa stringa vuota per evitare errori TS
        const pivaCliente = userData.piva || "";
        if (!pivaCliente || userData.ficId)
            continue;
        try {
            const searchRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
                params: { "q": pivaCliente }
            });
            let ficId = null;
            if (searchRes.data.data && searchRes.data.data.length > 0) {
                const client = searchRes.data.data.find((c) => c.vat_number === pivaCliente);
                if (client)
                    ficId = client.id;
            }
            else {
                // Crea se non esiste
                const createRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                    data: {
                        name: userData.ragioneSociale,
                        vat_number: pivaCliente,
                        email: userData.email,
                        type: 'company'
                    }
                }, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
                ficId = createRes.data.data.id;
            }
            if (ficId) {
                batch.update(userDoc.ref, { ficId: ficId });
                updatedCount++;
            }
        }
        catch (error) {
            console.error(`Errore sync UID ${userDoc.id}:`, error.message);
        }
    }
    await batch.commit();
    res.status(200).send(`Sync completato. Aggiornati: ${updatedCount}`);
});
// --- CREAZIONE ORDINE ---
exports.generaOrdineFIC = functions
    .region('europe-west1')
    .firestore
    .document('preventivi/{docId}')
    .onUpdate(async (change, 
// ✅ RINOMINATO IN _context PER EVITARE L'ERRORE DI VARIABILE INUTILIZZATA
_context) => {
    var _a;
    const newData = change.after.data();
    const oldData = change.before.data();
    if (!newData)
        return null;
    const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
    // Usa optional chaining per evitare errori se oldData è undefined
    const eraRichiesto = (oldData === null || oldData === void 0 ? void 0 : oldData.stato) === 'ORDER_REQ';
    const eAttivato = statiAttivazione.includes(newData.stato);
    if (!eraRichiesto || !eAttivato)
        return null;
    const clienteUID = newData.clienteUID;
    if (!clienteUID) {
        console.error("[FIC] Manca clienteUID nel preventivo.");
        return null;
    }
    try {
        // 1. RECUPERA ID FIC DA FIRESTORE
        const userDoc = await admin.firestore().collection('users').doc(clienteUID).get();
        const userData = userDoc.data();
        const ficId = userData === null || userData === void 0 ? void 0 : userData.ficId;
        if (!ficId) {
            console.error(`[FIC] Utente ${clienteUID} non sincronizzato.`);
            return null;
        }
        // 2. RECUPERA DETTAGLI PAGAMENTO DA FIC
        console.log(`[FIC] Recupero dettagli cliente ID: ${ficId}...`);
        const clientDetailsRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${ficId}`, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
        });
        const clientData = clientDetailsRes.data.data;
        const defaultPaymentMethodId = ((_a = clientData.default_payment_method) === null || _a === void 0 ? void 0 : _a.id) || null;
        const defaultPaymentTerms = clientData.default_payment_terms || 0;
        const defaultPaymentType = clientData.default_payment_terms_type || 'standard';
        console.log(`[FIC] Dati Pagamento: ID=${defaultPaymentMethodId}, Giorni=${defaultPaymentTerms}`);
        // 3. CALCOLO SCADENZA E TOTALI
        const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
        const today = new Date().toISOString().split('T')[0];
        const totalAmountDue = newData.totaleScontato || newData.totaleImponibile || 0;
        // 4. PREPARAZIONE RIGHE
        const itemsList = (newData.elementi || []).map((item) => {
            const descrizioneDettaglio = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            return {
                name: item.descrizioneCompleta || "Articolo",
                description: descrizioneDettaglio,
                qty: item.quantita || 1,
                net_price: item.prezzo_unitario || 0,
                vat: { id: VAT_ID, value: VAT_VALUE }
            };
        });
        // 5. PAYLOAD FINALE
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
                        amount: totalAmountDue,
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
        // 6. INVIO
        const orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
        });
        console.log(`✅ [FIC] Ordine creato! ID: ${orderRes.data.data.id}`);
        await change.after.ref.update({
            fic_order_id: orderRes.data.data.id,
            fic_order_url: orderRes.data.data.url,
            stato: 'SIGNED'
        });
    }
    catch (error) {
        console.error("❌ [FIC] Errore:", error.message);
        if (error.response)
            console.error("Dettaglio:", JSON.stringify(error.response.data, null, 2));
    }
    return null;
});
//# sourceMappingURL=index.js.map