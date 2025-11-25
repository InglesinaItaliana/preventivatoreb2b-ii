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
// --- CONFIGURAZIONE REALE ---
const FIC_API_URL = "https://api-v2.fattureincloud.it";
const COMPANY_ID = "185254";
const ACCESS_TOKEN = "a/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJVcG5pR0dSSm5qazV1U0NwQTZiejljWmJpZE94Q09yMiIsImV4cCI6MTc2NDE2NDA4MH0.aIoepTRU8tb7GkXbRaC_2b6SOsfwNjr4eqrXUgsgPQo";
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
// --- FUNZIONE UNICA INTELLIGENTE ---
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
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
            params: { "q": `vat_number = '${pivaCliente}'` } // Filtro preciso per P.IVA
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
            }, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
            clientData = createRes.data.data; // Usiamo i dati del nuovo cliente
            ficId = clientData.id;
            console.log(`[FIC] Nuovo Cliente creato. ID: ${ficId}`);
        }
        // 4. ESTRAZIONE DATI PAGAMENTO (DAL CLIENTE TROVATO/CREATO)
        const defaultPaymentMethodId = ((_a = clientData.default_payment_method) === null || _a === void 0 ? void 0 : _a.id) || null;
        const defaultPaymentTerms = clientData.default_payment_terms || 0;
        const defaultPaymentType = clientData.default_payment_terms_type || 'standard';
        // 5. CALCOLI ECONOMICI (NETTO + IVA)
        const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
        const today = new Date().toISOString().split('T')[0];
        const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
        // Calcolo del lordo per evitare errore 422
        const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));
        // 6. PREPARAZIONE RIGHE ORDINE
        const itemsList = (newData.elementi || []).map((item) => {
            const desc = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
            return {
                name: item.descrizioneCompleta || "Articolo Vetrata",
                description: desc,
                qty: item.quantita || 1,
                net_price: item.prezzo_unitario || 0, // Prezzo Netto
                vat: { id: VAT_ID, value: VAT_VALUE }
            };
        });
        // 7. CREAZIONE ORDINE (PAYLOAD COMPLETO)
        const orderPayload = {
            data: {
                type: "order",
                entity: {
                    id: ficId, // Usiamo l'ID trovato dinamicamente
                    name: clientData.name
                },
                date: today,
                visible_subject: newData.commessa || `Rif: ${newData.codice}`,
                items_list: itemsList,
                payments_list: [
                    {
                        amount: importoLordo, // Importo LORDO corretto
                        due_date: dataScadenza,
                        status: "not_paid"
                    }
                ]
            }
        };
        // Aggiunge metodo di pagamento SOLO se presente nella scheda cliente
        if (defaultPaymentMethodId) {
            orderPayload.data.payment_method = { id: defaultPaymentMethodId };
            orderPayload.data.payments_list[0].payment_method = { id: defaultPaymentMethodId };
        }
        // 8. INVIO A FATTURE IN CLOUD
        const orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
        });
        console.log(`✅ [FIC] ORDINE CREATO SUCCESSO! ID FIC: ${orderRes.data.data.id}`);
        // Aggiorna Firebase col link al documento
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