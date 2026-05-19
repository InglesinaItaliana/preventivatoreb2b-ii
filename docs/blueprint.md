# Blueprint di Progetto: P.O.P.S. Commesse (Production Order Processing System)

## 1. Panoramica
P.O.P.S. Commesse è un'applicazione web progressiva (PWA) sviluppata con **Vue 3 (Composition API), TypeScript e Vite**, progettata per la gestione completa del ciclo di vita degli ordini di produzione di griglie per serramenti (Inglesina, Duplex, Muntin). L'applicazione gestisce preventivazione, ordini, produzione, spedizione e amministrazione, integrandosi con **Firebase** (Firestore, Auth, Storage, Functions) per il backend e **Fatture in Cloud** per la fatturazione.

L'interfaccia utente è moderna, responsive e ottimizzata per l'uso su tablet e desktop, con un design system personalizzato basato su Tailwind CSS.

## 2. Struttura del Progetto & Navigazione

### 2.1 Router & Viste (`src/router/index.ts`)
Il routing è protetto da Navigation Guards che gestiscono l'autenticazione e i ruoli utente (Admin, Produzione, Logistica, Cliente).

*   **Login** (`/`): `LoginView.vue` - Accesso utenti.
*   **Preventivatore** (`/preventivatore`): `BuilderView.vue` - Cuore dell'app per la configurazione e l'ordine dei prodotti. Accessibile a Clienti e Admin.
*   **Dashboard Cliente** (`/dashboard`): `ClientDashboard.vue` - Panoramica ordini e stato per i clienti.
*   **Produzione** (`/production`): `ProductionDashboard.vue` - Dashboard operativa per il team di produzione (Kanban/Lista).
*   **Amministrazione** (`/admin`): `AdminView.vue` - Pannello di controllo globale per gli amministratori.
*   **Impostazioni Admin** (`/admin/settings`): `AdminSettings.vue` - Configurazione parametri globali.
*   **Spedizioni** (`/delivery`): `DeliveryView.vue` - Gestione DDT e logistica.
*   **Calcoli** (`/calcoli`): `CalcoliLavorazioni.vue` - Utility per calcoli tecnici.
*   **Visualizzatore Stack** (`/stack`): `StackVisualizer.vue` - Componente per visualizzazione tecnica stack (uso interno).
*   **Onboarding** (`/onboarding`): `OnboardingView.vue` - Flusso di benvenuto nuovi utenti.

### 2.2 Ruoli & Permessi
*   **Super Admin**: Accesso totale (email hardcoded).
*   **Admin Team**: Accesso a tutte le aree gestionali.
*   **Produzione**: Accesso limitato a `/production` e `/delivery`.
*   **Logistica**: Accesso limitato a `/delivery`.
*   **Cliente**: Accesso a `/preventivatore` e `/dashboard`.

## 3. Funzionalità Core: Preventivatore (`BuilderView.vue`)

Il `BuilderView.vue` è il componente più complesso, gestendo la configurazione del prodotto.

### 3.1 Configurazione Prodotto
*   **Griglie**: Selezione Categoria (Inglesina, Duplex, Muntin), Modello (es. Varsavia, Vienna), Dimensione e Finitura.
*   **Canalino**: Configurazione indipendente o legata alla griglia (Duplex). Opzione "Solo Canalino".
*   **Dimensioni**: Input Base, Altezza, Righe, Colonne.
*   **Opzioni Speciali**: Checkbox per "Non Equidistanti", "Curva", "Tacca".
*   **Prezzi**: Calcolo dinamico in tempo reale basato su listini (`src/Data/catalog.ts` e `src/logic/pricing.ts`). Supporto per listini personalizzati per cliente.

### 3.2 Gestione Ordine
*   **Carrello**: Aggiunta/Rimozione righe preventivo.
*   **Spedizione**: Calcolo automatico costi spedizione basato su tariffa cliente.
*   **Extra**: Possibilità per Admin di aggiungere righe extra manuali.
*   **Allegati**: Upload file (disegni tecnici) su Firebase Storage. Obbligatorio per ordini con lavorazioni speciali.
*   **Salvataggio**:
    *   **Bozza**: Salvataggio temporaneo.
    *   **Preventivo**: Salvataggio definitivo per revisione.
    *   **Ordine**: Invio ordine di produzione.
*   **Admin Mode**: Funzioni esclusive per admin (creazione ordine per conto cliente, modifica prezzi manuale, override validazioni).

### 3.3 Stati Preventivo (`src/types.ts`)
*   `DRAFT`: Bozza modificabile.
*   `PENDING_VAL`: In attesa di validazione tecnica (es. note presenti).
*   `QUOTE_READY`: Preventivo validato, pronto per accettazione.
*   `ORDER_REQ`: Richiesta ordine inviata dal cliente.
*   `WAITING_SIGN`: In attesa di firma contratto (se richiesta).
*   `WAITING_FAST`: In attesa di conferma veloce.
*   `SIGNED`: Ordine confermato e firmato.
*   `IN_PRODUZIONE`: In lavorazione.
*   `READY`: Pronto per spedizione.
*   `DELIVERY`: Spedito/In consegna.
*   `DELIVERED`: Consegnato.
*   `REJECTED`: Annullato.

## 4. Dati e Logica di Business

### 4.1 Firebase Integration (`src/firebase.ts`)
*   **Firestore**: Database NoSQL per utenti, preventivi, ordini, configurazioni.
*   **Storage**: Archiviazione allegati e contratti firmati.
*   **Auth**: Autenticazione utenti.
*   **Functions**: Backend serverless per logica sicura (es. integrazione Fatture in Cloud, invio email, reset stati).

### 4.2 Gestione Listini (`src/Data/catalog.ts`)
*   Store Pinia per il caricamento e la gestione del catalogo prodotti.
*   Struttura gerarchica: Categoria -> Modello -> Dimensione -> Finitura.
*   Prezzi e codici articolo mappati dal database.

### 4.3 Pricing Logic (`src/logic/pricing.ts` & `src/logic/customerConfig.ts`)
*   Algoritmo di calcolo prezzo complesso che considera mq, ml, quantità, sfridi e accessori.
*   Gestione listini multipli (es. 2025, 2026).
*   Configurazione specifica per cliente (sconti, listino assegnato, costi trasporto).

## 5. UI/UX Design

### 5.1 Stile Visivo
*   **Tailwind CSS**: Framework utility-first per lo styling.
*   **Color Palette**: Toni Amber/Orange per azioni primarie, Gray/Slate per struttura, codici colore semantici per stati (Verde=Ok, Rosso=Errore/Stop).
*   **Componenti**: Modali, Toast notifications, Cards, Tabelle responsive.
*   **Iconografia**: Heroicons.

### 5.2 Interattività
*   **Feedback Immediato**: Calcolo prezzi real-time, validazione form istantanea.
*   **Guide Utente**: Tour guidato (`tourguidejs`) nel Builder per nuovi utenti.
*   **Responsive**: Layout adattivo per mobile (navigazione, tabelle, form).

## 6. Sviluppi Futuri & Note

*   Ottimizzazione performance caricamento catalogo.
*   Ampliamento funzionalità dashboard produzione (statistiche, tempi lavorazione).
*   Raffinamento integrazione Fatture in Cloud (gestione errori avanzata).
