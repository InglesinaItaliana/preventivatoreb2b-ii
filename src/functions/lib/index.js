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
exports.generaOrdineFIC = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
// Inizializza l'app Firebase (necessario per accedere a Firestore)
if (firebase_admin_1.default.apps.length === 0) {
    firebase_admin_1.default.initializeApp();
}
// --- CONFIGURAZIONE FATTURE IN CLOUD (DA SOSTITUIRE) ---
const FIC_API_URL = "https://api-v2.fattureincloud.it";
// !!! SOSTITUISCI CON I TUOI VALORI REALI !!!
const COMPANY_ID = "185254";
const ACCESS_TOKEN = "a/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJVcG5pR0dSSm5qazV1U0NwQTZiejljWmJpZE94Q09yMiIsImV4cCI6MTc2NDE2NDA4MH0.aIoepTRU8tb7GkXbRaC_2b6SOsfwNjr4eqrXUgsgPQo"; // ATTENZIONE: Token temporaneo (vedi nota sotto)
// --- CONFIGURAZIONE VALORI DEFAULT ---
const VAT_ID = 0; // ID IVA che ha funzionato nel test (oppure usa 4/22 per 22%)
const VAT_VALUE = 22; // Aliquota IVA (necessaria se si usa VAT ID generico)
const PAYMENT_METHOD_ID = 1; // ID Bonifico Bancario o metodo predefinito
exports.sincronizzaClientiFIC = functions
    .region('europe-west1')
    .https.onRequest(async (req, res) => {
    // 1. CARICA TUTTI GLI UTENTI DA FIRESTORE
    const usersSnapshot = await firebase_admin_1.default.firestore().collection('users').get();
    const batch = firebase_admin_1.default.firestore().batch();
    let updatedCount = 0;
    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const pivaCliente = userData.piva;
        const clienteUID = userDoc.id;
        if (!pivaCliente || userData.ficId)
            continue; // Salta se manca P.IVA o ID FIC è già presente
        try {
            // 2. CERCA CLIENTE SU FIC TRAMITE P.IVA
            const searchRes = await axios_1.default.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
                params: { "q": pivaCliente }
            });
            let ficId = null;
            // Controlla se la ricerca ha prodotto risultati e se la partita IVA corrisponde
            if (searchRes.data.data && searchRes.data.data.length > 0) {
                const client = searchRes.data.data.find((c) => c.vat_number === pivaCliente);
                if (client) {
                    ficId = client.id;
                }
            }
            if (ficId) {
                // Cliente trovato
                console.log(`[FIC] Cliente trovato per P.IVA ${pivaCliente} (ID: ${ficId})`);
            }
            else {
                // 3. SE NON ESISTE, CREALO
                console.log(`[FIC] Cliente non trovato per P.IVA ${pivaCliente}, creazione in corso...`);
                const createRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                    data: {
                        name: userData.ragioneSociale,
                        vat_number: pivaCliente,
                        email: userData.email,
                        type: 'company'
                    }
                }, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
                ficId = createRes.data.data.id;
                console.log(`[FIC] Cliente creato per P.IVA ${pivaCliente} (ID: ${ficId})`);
            }
            if (ficId) {
                // 4. AGGIORNA FIRESTORE CON L'ID FIC
                batch.update(userDoc.ref, { ficId: ficId });
                updatedCount++;
            }
        }
        catch (error) {
            console.error(`Errore sync per UID ${clienteUID}:`, error.message);
            if (error.response) {
                console.error("Dettaglio errore FIC:", JSON.stringify(error.response.data, null, 2));
            }
        }
    }
    await batch.commit();
    res.status(200).send(`Sincronizzazione completata. Aggiornati ${updatedCount} clienti.`);
});
/**
 * Cloud Function Triggered on Firestore Update:
 * Genera un documento "Ordine" su Fatture in Cloud quando un Preventivo
 * viene autorizzato dall'amministratore.
 */
exports.generaOrdineFIC = functions
    .region('europe-west1')
    .firestore
    .document('preventivi/{docId}')
    .onUpdate(async (change, context) => {
    // 1. GESTIONE DEI DATI E CONTROLLO INIZIALE
    const newData = change.after.data();
    const oldData = change.before.data();
    if (!newData)
        return null;
    // 2. VERIFICA CONDIZIONE DI ATTIVAZIONE
    const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
    const eraRichiesto = (oldData === null || oldData === void 0 ? void 0 : oldData.stato) === 'ORDER_REQ';
    const eAttivato = statiAttivazione.includes(newData.stato);
    if (!eraRichiesto || !eAttivato) {
        return null;
    }
    console.log(`[FIC] Avvio creazione Ordine per preventivo: ${context.params.docId}`);
    const clienteUID = newData.clienteUID;
    if (!clienteUID) {
        console.error("[FIC] Manca il clienteUID nel documento Preventivo.");
        return null;
    }
    try {
        // 3. RECUPERA DATI UTENTE E ID FIC
        const userDoc = await firebase_admin_1.default.firestore().collection('users').doc(clienteUID).get();
        if (!userDoc.exists) {
            console.error(`[FIC] Documento utente non trovato per UID: ${clienteUID}`);
            return null;
        }
        const userData = userDoc.data();
        const ficId = userData === null || userData === void 0 ? void 0 : userData.ficId;
        const ragioneSociale = (userData === null || userData === void 0 ? void 0 : userData.ragioneSociale) || newData.cliente || "Cliente Sconosciuto";
        if (!ficId) {
            console.error(`[FIC] ID Fatture in Cloud (ficId) non trovato per l'utente ${clienteUID}. Eseguire prima la sincronizzazione manuale.`);
            // Potresti voler aggiornare lo stato del preventivo per segnalare l'errore
            await change.after.ref.update({ stato: 'REJECTED', erroreFic: 'Cliente non sincronizzato con Fatture in Cloud.' });
            return null;
        }
        console.log(`[FIC] Trovato ID Fatture in Cloud: ${ficId} per utente: ${ragioneSociale}`);
        // 4. PREPARAZIONE DEL PAYLOAD ORDINE
        const totalAmountDue = newData.totaleScontato || newData.totaleImponibile || 0;
        const today = new Date().toISOString().split('T')[0];
        const itemsList = (newData.sommarioPreventivo || []).map((item) => ({
            name: item.descrizione,
            qty: item.quantitaTotale || 1,
            net_price: item.prezzoUnitario || 0,
            vat: {
                id: VAT_ID,
                value: VAT_VALUE
            }
        }));
        const orderPayload = {
            data: {
                type: "order",
                entity: {
                    id: ficId,
                    name: ragioneSociale
                },
                date: today,
                visible_subject: newData.commessa || `Ordine Rif. Codice: ${newData.codice}`,
                items_list: itemsList,
                payments_list: [
                    {
                        amount: totalAmountDue,
                        due_date: "2025-12-31", // Sostituisci con la logica della tua scadenza
                        payment_method_id: PAYMENT_METHOD_ID,
                        status: "not_paid"
                    }
                ]
            }
        };
        // 5. INVIO DEL DOCUMENTO ORDINE A FIC
        const orderRes = await axios_1.default.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
        });
        console.log(`✅ [FIC] Ordine creato con successo! FIC ID: ${orderRes.data.data.id}`);
        // 6. SALVARE RIFERIMENTO SU FIRESTORE
        await change.after.ref.update({
            fic_order_id: orderRes.data.data.id,
            fic_order_url: orderRes.data.data.url,
            stato: 'SIGNED'
        });
    }
    catch (error) {
        console.error("❌ [FIC] Errore critico durante la generazione dell'ordine.");
        if (error.response) {
            console.error("Dettaglio errore FIC:", JSON.stringify(error.response.data, null, 2));
        }
        else {
            console.error("Errore generico:", error.message);
        }
        // Opzionale: aggiorna lo stato per segnalare l'errore e permettere un nuovo tentativo
        await change.after.ref.update({ stato: 'REJECTED', erroreFic: 'Errore API Fatture in Cloud.' });
    }
    return null;
});
//# sourceMappingURL=index.js.map