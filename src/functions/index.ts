import * as functions from 'firebase-functions/v1'; // ✅ IMPORTAZIONE FORZATA ALLA V1
import * as admin from 'firebase-admin';
import axios from 'axios';

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
function calcolaScadenza(giorni: number, tipo: string): string {
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
    .https.onRequest(async (_req: functions.https.Request, res: functions.Response) => {
        const usersSnapshot = await admin.firestore().collection('users').get();
        const batch = admin.firestore().batch();
        let updatedCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            // ✅ GESTIONE UNDEFINED: Se manca piva, diventa stringa vuota per evitare errori TS
            const pivaCliente = userData.piva || "";
            
            if (!pivaCliente || userData.ficId) continue;

            try {
                const searchRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
                    params: { "q": pivaCliente } 
                });

                let ficId: number | null = null;

                if (searchRes.data.data && searchRes.data.data.length > 0) {
                    const client = searchRes.data.data.find((c: any) => c.vat_number === pivaCliente);
                    if (client) ficId = client.id;
                } else {
                    // Crea se non esiste
                    const createRes: any = await axios.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
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
            } catch (error: any) {
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
    .onUpdate(async (
        change: functions.Change<admin.firestore.DocumentSnapshot>,
        // ✅ RINOMINATO IN _context PER EVITARE L'ERRORE DI VARIABILE INUTILIZZATA
        _context: functions.EventContext 
    ) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (!newData) return null;

        const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
        // Usa optional chaining per evitare errori se oldData è undefined
        const eraRichiesto = oldData?.stato === 'ORDER_REQ';
        const eAttivato = statiAttivazione.includes(newData.stato);

        if (!eraRichiesto || !eAttivato) return null;

        const clienteUID = newData.clienteUID;
        if (!clienteUID) {
            console.error("[FIC] Manca clienteUID nel preventivo.");
            return null;
        }

        try {
            // 1. RECUPERA ID FIC DA FIRESTORE
            const userDoc = await admin.firestore().collection('users').doc(clienteUID).get();
            const userData = userDoc.data();
            const ficId = userData?.ficId;

            if (!ficId) {
                console.error(`[FIC] Utente ${clienteUID} non sincronizzato.`);
                return null;
            }

            // 2. RECUPERA DETTAGLI PAGAMENTO DA FIC
            console.log(`[FIC] Recupero dettagli cliente ID: ${ficId}...`);
            const clientDetailsRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${ficId}`, {
                headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
            });
            
            const clientData = clientDetailsRes.data.data;
            
            const defaultPaymentMethodId = clientData.default_payment_method?.id || null; 
            const defaultPaymentTerms = clientData.default_payment_terms || 0;           
            const defaultPaymentType = clientData.default_payment_terms_type || 'standard'; 

            console.log(`[FIC] Dati Pagamento: ID=${defaultPaymentMethodId}, Giorni=${defaultPaymentTerms}`);

            // 3. CALCOLO SCADENZA E TOTALI
            const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
            const today = new Date().toISOString().split('T')[0];
            
            // Recuperiamo il NETTO dal database
            const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
            
            // CALCOLO DEL LORDO (Netto + 22%)
            // Usiamo toFixed(2) per arrotondare correttamente ai centesimi e parseFloat per tornare a numero
            const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));

            console.log(`[FIC] Importi: Netto=${importoNetto}, Lordo=${importoLordo}`);

            // 4. PREPARAZIONE RIGHE
            const itemsList = (newData.elementi || []).map((item: any) => {
                const descrizioneDettaglio = `Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
                return {
                    name: item.descrizioneCompleta || "Articolo",
                    description: descrizioneDettaglio,
                    qty: item.quantita || 1,
                    net_price: item.prezzo_unitario || 0, // Qui va il NETTO (giusto così)
                    vat: { id: VAT_ID, value: VAT_VALUE }
                };
            });

            // 5. PAYLOAD FINALE
            const orderPayload: any = {
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
                            amount: importoLordo, // ✅ QUI USIAMO IL LORDO (96.62)
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
            const orderRes: any = await axios.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
                headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
            });

            console.log(`✅ [FIC] Ordine creato! ID: ${orderRes.data.data.id}`);

            await change.after.ref.update({
                fic_order_id: orderRes.data.data.id,
                fic_order_url: orderRes.data.data.url,
                stato: 'SIGNED'
            });

        } catch (error: any) {
            console.error("❌ [FIC] Errore:", error.message);
            if (error.response) console.error("Dettaglio:", JSON.stringify(error.response.data, null, 2));
        }

        return null;
    });