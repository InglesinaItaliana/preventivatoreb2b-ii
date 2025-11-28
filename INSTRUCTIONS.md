# Libro di Istruzioni: Sezioni Client Dashboard e Builder View

Questo documento serve come guida completa per un assistente AI per comprendere il funzionamento, le strutture dati, la logica e le interazioni utente delle sezioni "Client Dashboard" e "Builder View" dell'applicazione Vue.js.

---

## 1. Panoramica Generale e Scopo

### `BuilderView` (Configuratore di Preventivi/Prodotti)
La `BuilderView` è il cuore del processo di configurazione per il cliente. Permette agli utenti di creare preventivi personalizzati selezionando diverse opzioni per le griglie, i canalini e le dimensioni del telaio. È qui che il cliente definisce le specifiche del prodotto desiderato, visualizza un riepilogo e può salvare o inviare il preventivo.

### `ClientDashboard` (Dashboard Cliente)
La `ClientDashboard` è l'area personale del cliente, fungendo da portale centralizzato per visualizzare e gestire tutti i propri preventivi e ordini. Mostra lo stato di avanzamento di ogni elemento, permette di riprendere la configurazione di un preventivo esistente o di crearne uno nuovo, e di compiere azioni specifiche in base allo stato (es. confermare un ordine).

---

## 2. Flusso Utente del Cliente

Il percorso tipico di un cliente all'interno di queste sezioni segue questi passaggi:

1.  **Accesso alla `ClientDashboard`**: Dopo aver effettuato il login, il cliente viene reindirizzato alla `ClientDashboard`. Qui vede un elenco dei suoi preventivi e ordini esistenti, categorizzati per stato.
2.  **Azione per Creare un Nuovo Preventivo**: Dalla `ClientDashboard`, il cliente può cliccare sul pulsante "NUOVO" per avviare un nuovo processo di configurazione. Questo lo porta alla `BuilderView`.
3.  **Interazione con il Configuratore nella `BuilderView`**: Nella `BuilderView`, il cliente seleziona la categoria, il tipo, la dimensione e la finitura della griglia e del canalino. Inserisce le dimensioni (base e altezza) e il numero di righe e colonne del telaio, specificando anche la quantità. Ogni riga aggiunta viene visualizzata in una tabella.
4.  **Salvataggio o Invio del Preventivo**: Una volta completata la configurazione (o anche durante il processo), il cliente può salvare il preventivo come bozza ("SALVA"), oppure, se il preventivo è "standard" (senza note o curve), può "ORDINARE" direttamente. Se il preventivo include "note tecniche" o "curve", deve "INVIARE PER VALIDAZIONE" all'amministratore.
5.  **Ritorno alla `ClientDashboard` e Visualizzazione del Nuovo Preventivo**: Dopo il salvataggio o l'invio, il cliente viene reindirizzato alla `ClientDashboard`. Il preventivo appena creato o aggiornato apparirà nell'elenco, con il suo stato corrente.

---

## 3. Analisi Dettagliata: `BuilderView.vue` (Configuratore Preventivi)

### Componenti UI e Input Utente:

La `BuilderView` è composta da diverse sezioni per la configurazione:

*   **Dati Commessa**:
    *   **Riferimento Cantiere (`riferimentoCommessa`)**: Campo di testo per un riferimento descrittivo del cliente (es. "Rossi Cucina").
    *   **Note Tecniche (`noteCliente`)**: Area di testo per inserire note specifiche sul preventivo. La presenza di note abilita il flusso di "richiesta validazione".
    *   **Allegati (`listaAllegati`)**: Input per il caricamento di file (immagini, PDF, etc.) relativi al preventivo. Gli allegati vengono caricati su Firebase Storage.

*   **Sezione "Griglia"**:
    *   **Categoria Griglia (`categoriaGriglia`)**: Pulsanti radio per selezionare la categoria (es. INGLESINA, DUPLEX, MUNTIN).
    *   **Tipo Griglia (`tipoGriglia`)**: `select` dinamico che mostra i tipi disponibili in base alla categoria selezionata.
    *   **Dimensione Griglia (`dimensioneGriglia`)**: `select` dinamico che mostra le dimensioni disponibili in base al tipo.
    *   **Finitura Griglia (`finituraGriglia`)**: `select` dinamico che mostra le finiture disponibili in base alla dimensione.

*   **Sezione "Canalino"**:
    *   **Checkbox "Copia Duplex" (`copiaDuplex`)**: Se la categoria griglia è "DUPLEX", questa checkbox permette di copiare automaticamente i valori di tipo, dimensione e finitura della griglia nel canalino.
    *   **Tipo Canalino (`tipoCanalino`)**: `select` dinamico.
    *   **Dimensione Canalino (`dimensioneCanalino`)**: `select` dinamico.
    *   **Finitura Canalino (`finituraCanalino`)**: `select` dinamico.

*   **Sezione "Telaio"**:
    *   **Base (mm) (`pannello.base`)**: Input numerico per la larghezza.
    *   **Altezza (mm) (`pannello.altezza`)**: Input numerico per l'altezza.
    *   **Verticali (`pannello.righe`)**: Input numerico per il numero di divisioni verticali.
    *   **Orizz. (`pannello.colonne`)**: Input numerico per il numero di divisioni orizzontali.
    *   **Q.tà (`pannello.qty`)**: Input numerico per la quantità di pannelli con queste specifiche.
    *   **Opzioni Telaio (`opzioniTelaio`)**: Checkbox per:
        *   `Non Equidistanti`: Indica divisioni non uniformi.
        *   `Curva`: Indica forma non rettangolare con sezioni curve.
        *   `Tacca`: Aggiunge un intaglio.
    *   **Pulsante "AGGIUNGI"**: Aggiunge la configurazione corrente alla lista `preventivo.value`.

*   **Admin Tools (visibili solo per `isAdmin`)**:
    *   **Sconto Commerciale (`scontoApplicato`)**: Input numerico per applicare una percentuale di sconto.
    *   **Aggiungi Extra Manuale**: Campi per una descrizione e un prezzo per aggiungere voci extra manualmente.

### Logica di Business e Calcoli:

*   **`calculatePrice` (da `src/logic/pricing.ts`)**: Questa funzione è responsabile del calcolo del prezzo unitario e totale di una `RigaPreventivo`.
    1.  **Normalizzazione Misure**: Arrotonda la base e l'altezza ai 50mm superiori.
    2.  **Calcolo Metrico**: Determina lo sviluppo lineare della griglia e perimetrale del canalino.
    3.  **Determinazione Taglia**: Basandosi sui metri del canalino, assegna una taglia (S, M, L, XL).
    4.  **Logica di Complessità**: Classifica la griglia in base al numero di righe e colonne (INCROCIO, PARALLELE MULTIPLE, SINGOLA SBARRA).
    5.  **Recupero Costi Accessori**: Utilizza `getSupplementoPrice` (che interroga `catalog.codiciMap`) per ottenere:
        *   `costo_setup`: Basato sui metri della griglia (`S001` per < 2m, `S002` per >= 2m).
        *   `costo_perimetrale`: Basato sul tipo di canalino e sulla taglia (es. `S003` - `S010`).
    6.  **Formula Finale del Prezzo**: Applica formule diverse a seconda della complessità. Per esempio, per "INCROCIO" è `metri_griglia * (prezzo_griglia + prezzo_canalino_lineare)`, mentre per "PARALLELE" o "SINGOLA" è `(metri_griglia * prezzo_griglia) + costo_perimetrale + costo_setup`.
    7.  **Output**: Restituisce un oggetto con `prezzo_unitario` e `prezzo_totale`.

*   **`handleSavePreventivo` (implementato in `salvaPreventivo`)**: Questa funzione gestisce il salvataggio o l'aggiornamento di un preventivo su Firestore.
    1.  **Generazione Codice**: Se non esiste un `codiceRicerca`, ne viene generato uno univoco.
    2.  **Gestione Stato**: Determina il `nuovoStato` del preventivo in base all'utente (cliente/admin) e all'azione richiesta (es. "SALVA", "RICHIEDI_VALIDAZIONE", "ADMIN_VALIDA").
    3.  **Calcolo Sommario (`sommarioPreventivo`)**: Questa è una logica cruciale. La funzione itera su tutte le `RigaPreventivo` presenti in `preventivo.value`. Per ogni riga, crea una chiave unica combinando `descrizioneCompleta` e `infoCanalino`. Se una riga con la stessa chiave esiste già nel `sommario`, la sua `quantitaTotale` viene incrementata. Altrimenti, una nuova `RiepilogoRiga` viene aggiunta al `sommario`. Questo raggruppa articoli identici per fornire un riassunto conciso.
    4.  **Definizione Dati del Documento (`docData`)**: Viene creato un oggetto che include tutti i dettagli del preventivo, come codice, cliente, email, totali, stato, note, allegati, il `sommarioPreventivo` e l'array `elementi` (le singole `RigaPreventivo`).
    5.  **Gestione UID e Creazione**: Se è un nuovo preventivo e non è creato dall'admin, viene associato l'UID dell'utente corrente e la data di creazione.
    6.  **Salvataggio su Firestore**: Utilizza `setDoc` (con `merge: true` per gli aggiornamenti) o `addDoc` (per nuovi preventivi) per salvare `docData` nella collezione `preventivi`.
    7.  **Aggiornamento Stato Locale**: `statoCorrente.value` viene aggiornato.
    8.  **Toast di Conferma**: Viene mostrato un messaggio di successo.
    9.  **Reindirizzamento**: L'utente viene reindirizzato alla dashboard o viene aggiornata la lista dello storico.

### Gestione dello Stato:

*   **`preventivo` (ref<RigaPreventivo[]>)**: Un array reattivo che contiene tutte le singole righe di prodotto aggiunte al preventivo corrente. È lo stato principale del configuratore.
*   **`pannello` (reactive)**: Un oggetto reattivo che contiene i dati di input per il singolo elemento che si sta configurando (base, altezza, righe, colonne, quantità).
*   **`opzioniTelaio` (reactive)**: Un oggetto reattivo per le opzioni booleane del telaio (nonEquidistanti, curva, tacca).
*   **`categoriaGriglia`, `tipoGriglia`, `dimensioneGriglia`, `finituraGriglia`, `tipoCanalino`, `dimensioneCanalino`, `finituraCanalino` (ref<string>)**: Variabili reattive per la selezione delle opzioni del prodotto.
*   **`riferimentoCommessa`, `noteCliente`, `scontoApplicato` (ref)**: Campi relativi ai dati generali del preventivo.
*   **`listaAllegati` (ref<Allegato[]>)**: Array reattivo degli allegati caricati.
*   **`currentDocId` (ref<string | null>)**: Contiene l'ID del documento Firestore se il preventivo è già salvato.
*   **`statoCorrente` (ref<StatoPreventivo>)**: Indica lo stato attuale del preventivo nel suo ciclo di vita.
*   **Computed Properties**:
    *   `totaleImponibile`: Calcola la somma dei `prezzo_totale` di tutte le righe.
    *   `totaleFinale`: Applica lo `scontoApplicato` al `totaleImponibile`.
    *   `isStandard`: Determina se un preventivo è "standard" (senza curve o note), influenzando le opzioni di salvataggio.
    *   `isLocked`: Indica se il preventivo è in uno stato non modificabile (es. già ordinato).

### Interazione con il Backend/Database (Firestore & Storage):

*   **Firestore**:
    *   `addDoc(collection(db, 'preventivi'), docData)`: Utilizzato per salvare un **nuovo** preventivo nella collezione `preventivi`.
    *   `setDoc(doc(db, 'preventivi', currentDocId.value), docData, { merge: true })`: Utilizzato per **aggiornare** un preventivo esistente, unendo i nuovi dati con quelli esistenti.
    *   `updateDoc(doc(db, 'preventivi', currentDocId.value), { stato: '...' })`: Usato per modificare solo lo stato di un preventivo (es. in fase di conferma ordine o annullamento).
    *   `getDocs(query(collection(db, 'preventivi'), where('codice', '==', ...)))`: Utilizzato per caricare un preventivo esistente tramite il suo `codice` o `commessa`.
    *   **Auth UID**: Il campo `uid` e `clienteUID` nel documento `preventivi` è popolato con l'UID dell'utente autenticato tramite Firebase Auth quando un cliente crea un nuovo preventivo.

*   **Firebase Storage**:
    *   `storageRef(storage, path)`: Crea un riferimento al percorso di archiviazione per un nuovo file.
    *   `uploadBytes(fileRef, file)`: Carica il file su Firebase Storage.
    *   `getDownloadURL(fileRef)`: Recupera l'URL pubblico del file caricato, che viene poi salvato nell'array `listaAllegati` del documento Firestore.

---

## 4. Analisi Dettagliata: `ClientDashboard.vue` (Dashboard Cliente)

### Visualizzazione dei Dati:

*   **Recupero Dati da Firestore**:
    *   La dashboard utilizza `onSnapshot` (listener real-time) per ascoltare le modifiche nella collezione `preventivi` su Firestore.
    *   Vengono eseguite due query:
        1.  `q1`: Cerca preventivi con `clienteEmail` uguale all'email dell'utente corrente.
        2.  `q2`: Cerca preventivi con il campo `cliente` uguale all'email dell'utente corrente (per compatibilità con dati più vecchi).
    *   I risultati di entrambe le query (`docsNuovi` e `docsVecchi`) vengono uniti e de-duplicati usando una `Map` per `id` del documento, garantendo che ogni preventivo sia presente una sola volta.
    *   La lista finale (`listaMieiPreventivi`) viene ordinata per `dataCreazione` (dal più recente al meno recente).
*   **Computed Properties per la Categorizzazione**:
    *   `preventiviInCorso`: Filtra i preventivi con stato `'DRAFT'`, `'PENDING_VAL'`, `'QUOTE_READY'`.
    *   `ordiniConfermati`: Filtra i preventivi con stato `'ORDER_REQ'`, `'WAITING_FAST'`, `'WAITING_SIGN'`.
    *   `ordiniInProduzione`: Filtra i preventivi con stato `'SIGNED'`, `'IN_PRODUZIONE'`.
    *   `ordiniSpediti`: Filtra i preventivi con stato `'READY'`.
    *   `archivioPreventivi`: Filtra i preventivi con stato `'REJECTED'`.
    *   Queste computed properties ordinano anche gli elementi all'interno della loro categoria in base a un `customOrder` di stati predefinito.
*   **Informazioni Mostrate per Elemento**: Per ogni preventivo/ordine vengono visualizzati:
    *   **Commessa**: Il riferimento assegnato dal cliente (o "Senza Nome").
    *   **Stato**: Un badge con etichetta e colori dinamici (`getStatusLabel`, `getStatusStyling` basato su `STATUS_DETAILS` da `types.ts`).
    *   **Sommario Preventivo (`p.sommarioPreventivo`)**: Una lista concisa degli articoli principali del preventivo (es. "3x Griglia Inglesina...", "2x Canalino..."). Questo campo è cruciale per una rapida comprensione senza aprire il dettaglio.
    *   **Importo Netto**: Il `totaleScontato` o `totaleImponibile`.
    *   **Pulsanti Azione**: "APRI" per modificare il preventivo nella `BuilderView`. "CONFERMA PREVENTIVO" se `stato === 'QUOTE_READY'`. "ACCETTA ORDINE" / "FIRMA ORDINE" se in stato `WAITING_FAST` o `WAITING_SIGN`.

### Interazioni Utente:

*   **Navigazione Tra Tab**: Il cliente può navigare tra le schede "PREVENTIVI", "ORDINI", "PRODUZIONE", "SPEDIZIONI", "ARCHIVIO" per visualizzare i preventivi in diversi stati.
*   **`vaiAlBuilder(codice?: string)`**: Reindirizza alla `BuilderView`. Se viene passato un `codice`, carica il preventivo corrispondente.
*   **Gestione Azioni Ordine (`gestisciAzioneOrdine(p: any)`)**: Questa funzione viene chiamata quando un cliente deve accettare o firmare un ordine. Imposta `selectedOrder` e `modalMode` (FAST o SIGN) e apre il componente `OrderModals.vue`.
*   **Conferma Ordine FAST (`onConfirmFast`)**: Imposta lo stato del preventivo a `'SIGNED'`, registra `dataConferma` e `metodoConferma: 'FAST_TRACK'`.
*   **Conferma Ordine SIGN (`onConfirmSign`)**: Carica un URL per il contratto firmato, imposta lo stato a `'SIGNED'`, registra `dataConferma` e `metodoConferma: 'UPLOAD_FIRMA'`.
*   **Conferma Preventivo per Invio Ordine (`handleFinalOrderConfirmation`)**: Aggiorna lo stato del preventivo a `'ORDER_REQ'` quando il cliente decide di inviare un preventivo quotato per la trasformazione in ordine.
*   **`OrderModals.vue` Componente**: Un componente riutilizzabile che gestisce la logica e l'UI per l'accettazione "FAST_TRACK" e l'upload della firma per gli ordini.
*   **Modali di Risultato (`resultModal`)**: Un modale generico per mostrare messaggi di successo o errore all'utente dopo un'azione.

---

## 5. Strutture Dati Fondamentali (da `src/types.ts`)

### Tipi Base:

*   **`Categoria`**: `INGLESINA | DUPLEX | MUNTIN | CANALINO | EXTRA`. Definisce le categorie principali di prodotti/elementi.
*   **`Modello`**: `VARSAVIA | GERMANELLA | ALLUMINIO | BORDO_CALDO | MANUALE`. Definisce i modelli specifici.
*   **`StatoPreventivo`**: Enum string per i vari stati nel ciclo di vita di un preventivo/ordine.
    *   `DRAFT`: Bozza, modificabile dal cliente.
    *   `PENDING_VAL`: In attesa di validazione tecnica da parte dell'admin.
    *   `QUOTE_READY`: Validato e quotato, il prezzo è visibile al cliente.
    *   `ORDER_REQ`: Richiesta d'ordine inviata dal cliente, in attesa di accettazione admin.
    *   `WAITING_FAST`: Admin ha richiesto accettazione veloce al cliente.
    *   `WAITING_SIGN`: Admin ha richiesto firma al cliente.
    *   `SIGNED`: Ordine firmato/accettato dal cliente.
    *   `IN_PRODUZIONE`: L'ordine è in coda di produzione.
    *   `READY`: L'ordine è pronto per la spedizione.
    *   `REJECTED`: Annullato/Rifiutato.

### Interfacce Chiave:

*   **`Allegato`**:
    *   `nome: string`: Nome del file.
    *   `url: string`: URL di download su Firebase Storage.
    *   `tipo: string`: Tipo di file (es. 'pdf', 'img').
    *   `dataCaricamento: any`: Timestamp di caricamento.

*   **`RiepilogoRiga`**: Questa interfaccia è progettata per il campo `sommarioPreventivo` del `PreventivoDocumento`.
    *   `descrizione: string`: Descrizione aggregata dell'articolo (es. "INGLESINA VARSAVIA...").
    *   `canalino: string`: Dettagli del canalino associato a quella riga (es. "Canalino: ALLUMINIO...").
    *   `quantitaTotale: number`: La somma delle quantità per gli articoli identici raggruppati.

*   **`RigaPreventivo`**: Rappresenta una singola riga (elemento configurato) all'interno di un preventivo.
    *   `id: string`: ID univoco della riga.
    *   `categoria: Categoria`: Categoria del prodotto.
    *   `modello: Modello`: Modello specifico.
    *   `dimensione: string`: Dimensione selezionata.
    *   `finitura: string`: Finitura selezionata.
    *   `base_mm: number`: Base in millimetri.
    *   `altezza_mm: number`: Altezza in millimetri.
    *   `righe: number`: Numero di divisioni orizzontali.
    *   `colonne: number`: Numero di divisioni verticali.
    *   `quantita: number`: Quantità di questo specifico elemento.
    *   `descrizioneCompleta: string`: Descrizione completa e leggibile.
    *   `infoCanalino?: string`: Informazioni aggiuntive sul canalino.
    *   `rawCanalino?: any`: Dati grezzi del canalino per la modifica.
    *   `prezzo_unitario: number`: Prezzo per singola unità dell'elemento.
    *   `prezzo_totale: number`: Prezzo totale per la quantità specificata dell'elemento.
    *   `nonEquidistanti?: boolean`: Opzione telaio.
    *   `curva: boolean`: Opzione telaio.
    *   `tacca: boolean`: Opzione telaio.

*   **`PreventivoDocumento`**: La struttura completa di un documento "preventivo" come salvato su Firestore.
    *   `codice: string`: Codice univoco del preventivo.
    *   `cliente: string`: Nome del cliente.
    *   `commessa: string`: Riferimento della commessa.
    *   `elementi: RigaPreventivo[]`: Array di tutte le righe di preventivo.
    *   `totaleImponibile: number`: Totale lordo.
    *   `scontoPercentuale: number`: Percentuale di sconto applicata.
    *   `totaleScontato: number`: Totale finale netto.
    *   `sommarioPreventivo?: RiepilogoRiga[]`: **Campo cruciale per la dashboard**, riassume gli articoli raggruppati con le loro quantità totali per una rapida visualizzazione.
    *   `stato: StatoPreventivo`: Stato corrente del preventivo.
    *   `noteCliente: string`: Note inserite dal cliente.
    *   `noteAdmin?: string`: Note aggiunte dall'amministratore.
    *   `allegati: Allegato[]`: Array di allegati.
    *   `dataCreazione: any`: Timestamp di creazione.
    *   `dataScadenza: any`: Data di scadenza del preventivo.
    *   `datiLegali?: DatiLegali`: Dati relativi all'accettazione legale del preventivo (checkbox, IP, user agent, firma).

*   **`DatiLegali`**: Contiene le informazioni relative all'accettazione e firma legale di un preventivo.
    *   `accettazioneTermini: boolean`: Stato della checkbox di accettazione termini.
    *   `accettazioneClausole: boolean`: Stato della checkbox di accettazione clausole.
    *   `ipCliente: string`: Indirizzo IP del cliente al momento della firma.
    *   `userAgent: string`: User-Agent del browser del cliente al momento della firma.
    *   `dataFirma: any`: Timestamp della firma.
    *   `firmatarioEmail: string`: Email del firmatario.
    *   `firmatarioUid: string`: UID del firmatario.

*   **`STATUS_DETAILS`**: Un oggetto `Record` che mappa ogni `StatoPreventivo` a un oggetto contenente `label`, `badge`, `iconBg`, `darkBadge`, e `hoverBadge`. Questo è usato globalmente per la coerenza visiva e testuale degli stati dell'applicazione.
