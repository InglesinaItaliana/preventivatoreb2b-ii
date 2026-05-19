# Libro di Istruzioni: Piattaforma Preventivatore B2B - Inglesina Italiana

Questo documento è la guida definitiva per l'assistente AI per comprendere l'architettura, i flussi utente, la logica di business e le interazioni tecniche dell'intera piattaforma Vue.js "Preventivatore B2B".

---

## 1. Panoramica del Progetto

Questa applicazione è un portale B2B per la gestione di preventivi e ordini di griglie e canalini per vetri isolanti. Serve due tipi principali di utenti:
*   **Clienti (Vetrerie/Partner)**: Creano preventivi, inviano ordini, monitorano lo stato della produzione.
*   **Team Interno (Inglesina Italiana)**: Amministra utenti, valida preventivi, gestisce la produzione e la logistica.

### Ruoli Utente e Permessi (`router/index.ts`, `views/LoginView.vue`)
Il sistema di autenticazione e routing gestisce diversi livelli di accesso:

1.  **Super Admin (`info@inglesinaitaliana.it`)**:
    *   Accesso totale a tutte le rotte.
    *   Bypass dei controlli DB standard.
2.  **Team Members (Collezione `team` su Firestore)**:
    *   **ADMIN**: Accesso completo dashboard amministrativa (`/admin`).
    *   **PRODUZIONE**: Accesso limitato a `/production` e `/delivery`. Reindirizzamento forzato.
    *   **LOGISTICA**: Accesso limitato a `/delivery`. Reindirizzamento forzato.
3.  **Clienti Standard (Collezione `users` su Firestore)**:
    *   Accesso a `/dashboard` (Dashboard Cliente).
    *   Accesso a `/preventivatore` (BuilderView).
    *   Accesso a `/onboarding` (se è il primo accesso o cambio password obbligatorio).
    *   **Blocco**: Non possono accedere alle rotte `/admin`, `/production`, `/delivery`, `/stack`, `/calcoli`.

---

## 2. Struttura delle Pagine e Funzionalità

### A. Autenticazione (`LoginView.vue`)
*   **Path**: `/`
*   **Funzione**: Punto di ingresso. Gestisce login con email/password tramite Firebase Auth.
*   **Logica Critica**:
    *   Verifica esistenza utente in collezione `team` o `users`.
    *   Gestisce il routing condizionale basato sul ruolo (vedi sopra).
    *   Gestisce il reset password.
    *   Controlla il flag `mustChangePassword` per reindirizzare all'`OnboardingView`.

### B. Dashboard Cliente (`ClientDashboard.vue`)
*   **Path**: `/dashboard`
*   **Scopo**: Hub centrale per il cliente.
*   **Funzionalità**:
    *   Lista preventivi/ordini divisi per stato (Tabs: Preventivi, Ordini, Produzione, Spedizioni, Archivio).
    *   Snapshot real-time da Firestore (`preventivi`).
    *   Azioni rapide: Apri Builder, Conferma Ordine (Fast/Sign), Visualizza Riepilogo.
    *   Logica di aggregazione righe nel sommario preventivo.

### C. Configuratore (`BuilderView.vue`)
*   **Path**: `/preventivatore`
*   **Scopo**: Creazione e modifica tecnica dei preventivi.
*   **Funzionalità**:
    *   Input dati commessa e note.
    *   Selezione gerarchica: Categoria -> Tipo -> Dimensione -> Finitura.
    *   Input misure telaio e calcolo righe/colonne.
    *   **Pricing Engine**: Calcolo real-time prezzi (vedi `src/logic/pricing.ts`).
    *   Salvataggio bozze o invio richieste validazione.

### D. Amministrazione (`AdminView.vue`)
*   **Path**: `/admin`
*   **Scopo**: Gestione globale per il team commerciale/admin.
*   **Funzionalità**:
    *   Visione globale di tutti i preventivi di tutti i clienti.
    *   Validazione tecnica preventivi (cambio stato da `PENDING_VAL` a `QUOTE_READY`).
    *   Gestione anagrafica clienti (creazione utenze, reset password).
    *   Analisi statistiche (opzionale).

### E. Dashboard Produzione (`ProductionDashboard.vue`)
*   **Path**: `/production`
*   **Scopo**: Gestione del flusso di fabbrica.
*   **Funzionalità**:
    *   Visualizzazione ordini confermati (`SIGNED`, `IN_PRODUZIONE`).
    *   Generazione file macchine o stampe tecniche.
    *   Avanzamento stato verso `READY` (Pronto Spedizione).

### F. Logistica e Spedizioni (`DeliveryView.vue`)
*   **Path**: `/delivery`
*   **Scopo**: Gestione DDT e spedizioni.
*   **Funzionalità**:
    *   Lista ordini pronti (`READY`).
    *   Generazione documenti di trasporto (DDT).
    *   Tracciamento spedizioni.

### G. Impostazioni Admin (`AdminSettings.vue`)
*   **Path**: `/admin/settings`
*   **Scopo**: Configurazione parametri globali.
*   **Funzionalità**:
    *   Gestione listini prezzi base.
    *   Gestione supplementi e costi extra.
    *   Configurazione variabili di sistema.

### H. Onboarding (`OnboardingView.vue`)
*   **Path**: `/onboarding`
*   **Scopo**: Primo accesso cliente.
*   **Funzionalità**:
    *   Obbligo cambio password provvisoria.
    *   Conferma dati anagrafici.
    *   Accettazione termini e condizioni.

### I. Pagine di Utilità
*   **`/calcoli` (`CalcoliLavorazioni.vue`)**: Strumento interno per verifiche calcoli complessi o debug pricing.
*   **`/stack` (`StackVisualizer.vue`)**: Visualizzatore tecnico dello stack tecnologico o log di sistema (uso dev).

---

## 3. Logica dei Dati e Flussi (Backend Firebase)

### Collezioni Firestore Principali

1.  **`preventivi`**: Contiene tutti i documenti di preventivo/ordine.
    *   Chiave primaria: Auto-generated ID.
    *   Campi chiave: `codice` (human-readable), `stato` (enum), `elementi` (array righe), `clienteUID`, `sommarioPreventivo`.
2.  **`users`**: Anagrafica clienti.
    *   Chiave primaria: Auth UID.
    *   Campi: `ragioneSociale`, `email`, `scontoDefault`, `indirizzo`.
3.  **`team`**: Anagrafica staff interno.
    *   Chiave primaria: Email lowercase.
    *   Campi: `role` ('ADMIN', 'PRODUZIONE', 'LOGISTICA').
4.  **`counters`**: Gestione contatori per codici progressivi (es. numeri ordine, codici preventivo).

### Macchina a Stati del Preventivo (`StatoPreventivo` in `types.ts`)
Il ciclo di vita di un preventivo segue questo flusso rigoroso:

1.  `DRAFT`: Bozza cliente.
2.  `PENDING_VAL`: Cliente richiede validazione (se presenti note/curve).
3.  `QUOTE_READY`: Admin ha validato/quotato. Prezzo visibile.
4.  `ORDER_REQ`: Cliente richiede trasformazione in ordine.
5.  `WAITING_FAST` / `WAITING_SIGN`: Admin richiede conferma finale (veloce o firma).
6.  `SIGNED`: Cliente ha confermato. Diventa ordine effettivo.
7.  `IN_PRODUZIONE`: Preso in carico dalla fabbrica.
8.  `READY`: Prodotto finito, pronto per spedizione.
9.  `SHIPPED`: Spedito (stato finale positivo).
10. `REJECTED`: Annullato (stato finale negativo).

---

## 4. Linee Guida per lo Sviluppo AI

*   **Contesto**: Prima di modificare un componente, verifica sempre in quale View è contenuto e chi ha i permessi per vederlo.
*   **Sicurezza**: Non esporre mai logica amministrativa (`/admin`, `/production`) nelle viste cliente (`/dashboard`, `/preventivatore`).
*   **Pricing**: Ogni modifica alla logica di prezzo deve essere fatta in `src/logic/pricing.ts` e testata accuratamente, poiché impatta direttamente il valore commerciale.
*   **UI/UX**: Mantieni la coerenza visiva.
    *   Clienti: Interfaccia pulita, guidata, focus sul prodotto.
    *   Team: Interfaccia densa di dati, focus sull'efficienza operativa.
