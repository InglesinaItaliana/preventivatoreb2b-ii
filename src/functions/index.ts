import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

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
function calcolaScadenza(giorni: number, tipo: string): string {
    const data = new Date();
    data.setDate(data.getDate() + (giorni || 0));
    if (tipo === 'end_of_month') {
        data.setMonth(data.getMonth() + 1);
        data.setDate(0); 
    }
    return data.toISOString().split('T')[0] || ''; 
}

// --- FUNZIONE RINNOVO TOKEN (ACCESS TOKEN MANAGER) ---
async function getValidFicToken(): Promise<string> {
    const db = admin.firestore();
    const docRef = db.collection('config').doc('fic');
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        throw new Error("Documento config/fic non trovato nel DB!");
    }

    const data = docSnap.data();
    if (!data) throw new Error("Dati mancanti in config/fic");

    const now = new Date();
    // Verifica se esiste una data di scadenza valida
    const expiryDate = data.token_scadenza ? data.token_scadenza.toDate() : new Date(0);

    // Se il token è ancora valido (mancano più di 5 minuti), usalo
    if (expiryDate > new Date(now.getTime() + 5 * 60000)) {
        return data.access_token;
    }

    console.log("[FIC] Token scaduto. Rinnovo in corso...");

    try {
        const response: any = await axios.post(`${FIC_API_URL}/oauth/token`, {
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

    } catch (error: any) {
        console.error("❌ ERRORE CRITICO rinnovo token:", error.response?.data || error.message);
        throw new Error("Impossibile rinnovare il token FiC");
    }
}

// --- FUNZIONE PRINCIPALE: GENERA ORDINE ---
exports.generaOrdineFIC = functions
    .region('europe-west1')
    .firestore
    .document('preventivi/{docId}')
    .onUpdate(async (
        change: functions.Change<admin.firestore.DocumentSnapshot>,
        _context: functions.EventContext
    ) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (!newData) return null;

        // 1. CONTROLLO TRIGGER (ORDER_REQ -> WAITING...)
        const statiAttivazione = ['WAITING_FAST', 'WAITING_SIGN'];
        const eraRichiesto = oldData?.stato === 'ORDER_REQ';
        const eAttivato = statiAttivazione.includes(newData.stato);

        if (!eraRichiesto || !eAttivato) return null;

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
            const pivaCliente = userData?.piva; 
            const ragioneSociale = userData?.ragioneSociale || newData.cliente;

            if (!pivaCliente) {
                console.error("[FIC] P.IVA mancante nell'anagrafica utente.");
                return null;
            }

            // 3. 🔥 RICERCA INTELLIGENTE SU FIC (LOOKUP)
            console.log(`[FIC] Cerco cliente con P.IVA: ${pivaCliente}...`);
            
            let ficId = null;
            let clientData = null;

            // Chiamata API per cercare il cliente
            const searchRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                headers: { Authorization: `Bearer ${accessToken}` }, // Usa il token dinamico
                params: { "q": `vat_number = '${pivaCliente}'` }
            });

            if (searchRes.data.data && searchRes.data.data.length > 0) {
                // TROVATO! Prendiamo il primo risultato
                clientData = searchRes.data.data[0];
                ficId = clientData.id;
                console.log(`[FIC] Cliente TROVATO. ID: ${ficId} (${clientData.name})`);
            } else {
                // NON TROVATO -> LO CREIAMO
                console.log("[FIC] Cliente non trovato. Creazione in corso...");
                const createRes: any = await axios.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                    data: {
                        name: ragioneSociale,
                        vat_number: pivaCliente,
                        email: userData?.email || "",
                        type: 'company'
                    }
                }, { headers: { Authorization: `Bearer ${accessToken}` } });
                
                clientData = createRes.data.data; 
                ficId = clientData.id;
                console.log(`[FIC] Nuovo Cliente creato. ID: ${ficId}`);
            }

            // 4. ESTRAZIONE DATI PAGAMENTO
            const defaultPaymentMethodId = clientData.default_payment_method?.id || null;
            const defaultPaymentTerms = clientData.default_payment_terms || 0;
            const defaultPaymentType = clientData.default_payment_terms_type || 'standard';

            // 5. CALCOLI ECONOMICI
            const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
            const dataOrdine = newData.dataConsegnaPrevista || new Date().toISOString().split('T')[0];
            const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
            const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));

            // 6. PREPARAZIONE RIGHE ORDINE
            const itemsList = (newData.elementi || []).map((item: any) => {
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
            const orderPayload: any = {
                data: {
                    type: "order",
                    entity: {
                        id: ficId, 
                        name: clientData.name 
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
                    ]
                }
            };

            if (defaultPaymentMethodId) {
                orderPayload.data.payment_method = { id: defaultPaymentMethodId };
                orderPayload.data.payments_list[0].payment_method = { id: defaultPaymentMethodId };
            }

            // 8. INVIO A FATTURE IN CLOUD (Usa token dinamico)
            const orderRes: any = await axios.post(`${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`, orderPayload, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            console.log(`✅ [FIC] ORDINE CREATO SUCCESSO! ID FIC: ${orderRes.data.data.id}`);

            await change.after.ref.update({
                fic_order_id: orderRes.data.data.id,
                fic_order_url: orderRes.data.data.url,
            });

        } catch (error: any) {
            console.error("❌ [FIC] Errore:", error.message);
            if (error.response) {
                console.error("Dettaglio errore API:", JSON.stringify(error.response.data, null, 2));
            }
        }

        return null;
    });

// --- FUNZIONE CREAZIONE DDT CUMULATIVO (HTTP Callable) ---
exports.creaDdtCumulativo = functions
    .region('europe-west1')
    .https.onCall(async (data, _context) => {
        
        const { orderIds, date, colli, weight } = data;
        console.log("🚀 Inizio creaDdtCumulativo per ordini:", orderIds); // LOG 1

        if (!orderIds || orderIds.length === 0) {
            return { success: false, message: "Nessun ordine selezionato." };
        }

        try {
            const db = admin.firestore();
            const accessToken = await getValidFicToken(); 
            
            // 1. Recupera ID FiC da Firestore
            const orderSnapshots = await Promise.all(
                orderIds.map((id: string) => db.collection('preventivi').doc(id).get())
            );

            const ficIdsToJoin: number[] = [];
            for (const snap of orderSnapshots) {
                const d = snap.data();
                if (d && d.fic_order_id) {
                    ficIdsToJoin.push(d.fic_order_id);
                }
            }
            console.log("🔗 ID FiC trovati da unire:", ficIdsToJoin); // LOG 2

            if (ficIdsToJoin.length === 0) {
                 return { success: false, message: "Nessun ID FiC valido trovato." };
            }

            // 2. CHIAMATA JOIN
            const joinUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/join`;
            console.log("📞 Chiamo JOIN su:", joinUrl);

            const joinResponse: any = await axios.get(joinUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    ids: ficIdsToJoin.join(','),
                    type: 'delivery_note' // Chiediamo esplicitamente un template DDT
                }
            });

            let documentData = joinResponse.data.data;
            console.log("📦 Dati ricevuti da JOIN (Anteprima):", JSON.stringify(documentData).substring(0, 200) + "..."); // LOG 3

            // 3. PREPARAZIONE PAYLOAD
            // Pulizia e forzatura dati
            delete documentData.id; // Rimuoviamo ID vecchio
            
            // FORZATURA TIPO: Fondamentale!
            documentData.type = "delivery_note"; 
            
            documentData.date = date;
            documentData.visible_subject = `DDT Cumulativo (${ficIdsToJoin.length} Ordini)`;
            
            // Dati trasporto (Campi diretti alla radice per API v2 creazione)
            documentData.transport_causal = "VENDITA";
            documentData.transport_type = "MITTENTE";
            documentData.packages_number = parseInt(colli);
            
            if (weight && Number(weight) > 0) {
                documentData.weight = Number(weight);
            }

            console.log("📤 Payload finale inviato a CREATE:", JSON.stringify(documentData, null, 2)); // LOG 4

            // 4. CREAZIONE (POST)
            const createUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`;
            const createRes: any = await axios.post(createUrl, { data: documentData }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            console.log("✅ RISPOSTA CREATE:", createRes.data); // LOG 5

            // 5. Aggiornamento Firestore
            const batch = db.batch();
            orderIds.forEach((id: string) => {
                const ref = db.collection('preventivi').doc(id);
                batch.update(ref, { 
                    fic_ddt_id: createRes.data.data.id,
                    fic_ddt_url: createRes.data.data.url,
                    stato: 'READY' 
                });
            });
            await batch.commit();

            return { success: true, fic_id: createRes.data.data.id };

        } catch (error: any) {
            console.error("❌ ERRORE CRITICO:", error);
            if (error.response) {
                console.error("🔍 Dettaglio Risposta Errore:", JSON.stringify(error.response.data, null, 2));
            }

            const dettagliErrore = error.response?.data?.error?.validation_errors 
                ? JSON.stringify(error.response.data.error.validation_errors)
                : (error.response?.data?.error?.message || error.message);

            return { 
                success: false, 
                message: "Errore FiC: " + dettagliErrore 
            };
        }
    });