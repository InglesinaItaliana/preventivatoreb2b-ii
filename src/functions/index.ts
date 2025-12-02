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
            
            // A. Ricerca esistente
            const searchRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                headers: { Authorization: `Bearer ${accessToken}` }, 
                params: { "q": `vat_number = '${pivaCliente}'` }
            });

            if (searchRes.data.data && searchRes.data.data.length > 0) {
                // TROVATO!
                ficId = searchRes.data.data[0].id;
                console.log(`[FIC] Cliente TROVATO. ID: ${ficId}`);
            } else {
                // B. NON TROVATO -> CREAZIONE
                console.log("[FIC] Cliente non trovato. Creazione in corso...");
                const createRes: any = await axios.post(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients`, {
                    data: {
                        name: ragioneSociale,
                        vat_number: pivaCliente,
                        email: userData?.email || "",
                        type: 'company'
                    }
                }, { headers: { Authorization: `Bearer ${accessToken}` } });
                
                ficId = createRes.data.data.id;
                console.log(`[FIC] Nuovo Cliente creato. ID: ${ficId}`);
            }

            // 4. 🔥 RECUPERO DETTAGLI COMPLETI CLIENTE (GET Client)
            // Utilizziamo l'ID ottenuto per fare una chiamata GET specifica e ottenere indirizzi, codice fiscale, etc.
            console.log(`[FIC] Recupero dettagli completi cliente ID: ${ficId}...`);
            const clientDetailRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${ficId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { fieldset: 'detailed' } // 'detailed' per avere indirizzi e dati extra
            });

            const detailedClient = clientDetailRes.data.data;
            
            // 5. ESTRAZIONE DATI PAGAMENTO (Dai dettagli completi)
            const defaultPaymentMethodId = detailedClient.default_payment_method?.id || null;
            const defaultPaymentTerms = detailedClient.default_payment_terms || 0;
            const defaultPaymentType = detailedClient.default_payment_terms_type || 'standard';

            // 6. CALCOLI ECONOMICI
            const dataScadenza = calcolaScadenza(defaultPaymentTerms, defaultPaymentType);
            const dataOrdine = newData.dataConsegnaPrevista || new Date().toISOString().split('T')[0];
            const importoNetto = newData.totaleScontato || newData.totaleImponibile || 0;
            const importoLordo = parseFloat((importoNetto * (1 + (VAT_VALUE / 100))).toFixed(2));

            // 7. PREPARAZIONE RIGHE ORDINE
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

            // 8. CREAZIONE ORDINE
            const orderPayload: any = {
                data: {
                    type: "order",
                    // 🔥 Mappatura Completa Entity
                    entity: {
                        id: ficId, 
                        name: detailedClient.name,
                        vat_number: detailedClient.vat_number || null,
                        tax_code: detailedClient.tax_code || null,
                        address_street: detailedClient.address_street || null,
                        address_postal_code: detailedClient.address_postal_code || null,
                        address_city: detailedClient.address_city || null,
                        address_province: detailedClient.address_province || null,
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

// --- FUNZIONE CREAZIONE DDT (UNIFICATA) ---
exports.creaDdtCumulativo = functions
    .region('europe-west1')
    .https.onCall(async (data, _context) => {
        
        const { orderIds, date, colli, weight } = data;
        
        if (!orderIds || orderIds.length === 0) {
            return { success: false, message: "Nessun ordine selezionato." };
        }

        try {
            const db = admin.firestore();
            const accessToken = await getValidFicToken(); 
            
            // 1. Recupera i documenti da Firestore
            const orderSnapshots = await Promise.all(
                orderIds.map((id: string) => db.collection('preventivi').doc(id).get())
            );

            const ordersData: any[] = [];
            for (const snap of orderSnapshots) {
                const d = snap.data();
                if (d && d.fic_order_id) {
                    ordersData.push({ firestoreId: snap.id, ficId: d.fic_order_id, data: d });
                }
            }

            if (ordersData.length === 0) {
                 return { success: false, message: "Nessun ID FiC valido trovato." };
            }

            // =========================================================
            // CALCOLO STRINGA COMMESSE (PER OGGETTO E RIGA DESCRITTIVA)
            // =========================================================
            const listCommesse = ordersData.map(o => 
                (o.data.commessa && o.data.commessa.trim() !== "") 
                ? o.data.commessa 
                : o.data.codice
            );
            
            const uniqueCommesse = [...new Set(listCommesse)];
            const stringaCommesse = uniqueCommesse.join(' - '); // Es: "Cantiere Rossi - Cantiere Bianchi"

            console.log(`[FIC] Creazione DDT per: ${stringaCommesse}`);
            
            const ficIdsToJoin = ordersData.map(o => o.ficId);
            const joinUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents/join`;
            
            // 2. CHIAMATA JOIN
            const joinResponse: any = await axios.get(joinUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    ids: ficIdsToJoin.join(','),
                    type: 'delivery_note'
                }
            });

            const joinedData = joinResponse.data.data;

            // 3. RECUPERO DETTAGLI CLIENTE (Identico a prima)
            let detailedClient = null;
            if (joinedData.entity && joinedData.entity.id) {
                try {
                    const clientDetailRes: any = await axios.get(`${FIC_API_URL}/c/${COMPANY_ID}/entities/clients/${joinedData.entity.id}`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        params: { fieldset: 'detailed' }
                    });
                    detailedClient = clientDetailRes.data.data;
                } catch (err) {
                    console.warn("[FIC] Impossibile recuperare dettagli cliente, userò dati base.");
                }
            }

            const entityData = detailedClient ? {
                id: detailedClient.id,
                name: detailedClient.name,
                vat_number: detailedClient.vat_number || null,
                tax_code: detailedClient.tax_code || null,
                address_street: detailedClient.address_street || null,
                address_postal_code: detailedClient.address_postal_code || null,
                address_city: detailedClient.address_city || null,
                address_province: detailedClient.address_province || null,
                country: detailedClient.country || "Italia"
            } : joinedData.entity;


            // 4. PREPARAZIONE LISTA ARTICOLI CON RIGA COMMESSA INIZIALE
            // Creiamo una riga puramente descrittiva da mettere in cima
            const rigaDescrittivaCommessa = {
                name: "Riferimento Commessa/e:",
                description: stringaCommesse,
                qty: 0,
                net_price: 0,
                vat: { id: VAT_ID || 0, value: VAT_VALUE || 22 } // Usa i valori globali o 0
            };

            // Inseriamo la riga descrittiva PRIMA degli articoli ottenuti dal Join
            const itemsListFinal = [rigaDescrittivaCommessa, ...joinedData.items_list];


            // 5. COSTRUZIONE PAYLOAD FINALE
            const finalDocData: any = {
                type: 'delivery_note',
                entity: entityData,
                date: date,
                
                // A) OGGETTO DEL DOCUMENTO (Visibile in alto nel PDF)
                visible_subject: stringaCommesse, 
                
                currency: joinedData.currency,
                language: joinedData.language,
                
                // B) LISTA ARTICOLI (Con riga descrittiva in cima)
                items_list: itemsListFinal, 
                
                payments_list: joinedData.payments_list,
                dn_ai_packages_number: colli.toString(),
                dn_ai_causal: "VENDITA",
                dn_ai_transporter: "MITTENTE",
                c_driver_and_contents: {
                        packages_number: parseInt(colli),
                        transport_causal: "VENDITA"
                }
            };

            if (weight && Number(weight) > 0) {
                finalDocData.dn_ai_weight = weight.toString();
            }
            
            if (joinedData.notes) finalDocData.notes = joinedData.notes;

            // 6. CREAZIONE (POST)
            const createUrl = `${FIC_API_URL}/c/${COMPANY_ID}/issued_documents`;
            const createRes: any = await axios.post(createUrl, { data: finalDocData }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const newDdt = createRes.data.data;
            console.log(`[FIC] DDT Creato: ID ${newDdt.id}`);

            // 7. AGGIORNAMENTO FIRESTORE
            const batch = db.batch();
            ordersData.forEach(o => {
                const ref = db.collection('preventivi').doc(o.firestoreId);
                batch.update(ref, { 
                    fic_ddt_id: newDdt.id,
                    fic_ddt_url: newDdt.url,
                    stato: 'DELIVERY',
                    dataConsegnaPrevista: date 
                });
            });
            await batch.commit();

            return { success: true, fic_id: newDdt.id };

        } catch (error: any) {
            console.error("❌ Errore API FiC:", JSON.stringify(error.response?.data || error.message, null, 2));

            const dettagliErrore = error.response?.data?.error?.validation_errors 
                ? JSON.stringify(error.response.data.error.validation_errors)
                : (error.response?.data?.error?.message || error.message);

            return { 
                success: false, 
                message: "Errore FiC: " + dettagliErrore 
            };
        }
    });