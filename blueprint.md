# Panoramica del Progetto

Questa è un'applicazione per la gestione di preventivi e ordini di prodotti configurabili, come inglesine per finestre. L'applicazione gestisce l'intero ciclo di vita di un ordine, dalla configurazione iniziale da parte del cliente, alla validazione tecnica, all'approvazione amministrativa, fino alla produzione.

## Design e Stile

L'interfaccia è moderna e pulita, basata su Vue.js e Tailwind CSS. L'obiettivo è fornire un'esperienza utente chiara e intuitiva, con stati visivi ben definiti (es. "In attesa di validazione", "Ordine pronto") che guidano sia il cliente che l'amministratore attraverso il processo.

## Funzionalità Implementate

*   **Configuratore Prodotto (Builder):** I clienti possono configurare un prodotto specificando dimensioni, quantità e altri attributi.
*   **Calcolo Prezzo Dinamico:** Il sistema calcola il prezzo in tempo reale.
*   **Dashboard Cliente:** I clienti possono visualizzare e gestire i loro preventivi e ordini.
*   **Dashboard Admin:** Gli amministratori possono validare preventivi complessi, confermare ordini e aggiornare lo stato di produzione.
*   **Ciclo di Vita della Commessa:** Gestione di vari stati come Bozza, In attesa di validazione, Validato, Firmato, In produzione.

## Piano di Modifica Attuale

L'obiettivo è ristrutturare il flusso di gestione delle commesse per introdurre un maggiore controllo da parte dell'amministrazione prima della formalizzazione dell'ordine e per offrire due percorsi di accettazione distinti per il cliente.

**Fasi del Nuovo Flusso:**

1.  **Fase di Creazione (Builder):**
    *   **Scenario Standard (Semplice):** Il cliente vede il prezzo e può salvare il preventivo o inviare una richiesta d'ordine diretta (`ORDER_REQ`).
    *   **Scenario Complesso (con note/curve):** Il cliente non vede il prezzo e deve inviare il preventivo per una validazione tecnica (`PENDING_VAL`).
    *   La modifica di un preventivo già validato (`QUOTE_READY`) lo riporterà allo stato `PENDING_VAL`, richiedendo una nuova approvazione.

2.  **Fase di Negoziazione (Admin/Cliente):**
    *   L'Admin valida i preventivi in `PENDING_VAL`, spostandoli in `QUOTE_READY`.
    *   Il Cliente, vedendo il preventivo `QUOTE_READY` con il prezzo finale, può ordinarlo (passando a `ORDER_REQ`) o modificarlo (riavviando il ciclo di validazione).

3.  **Fase di Controllo (Admin):**
    *   Tutte le richieste d'ordine arrivano nello stato `ORDER_REQ`.
    *   L'Admin decide il percorso di formalizzazione scegliendo tra:
        *   **Veloce:** Per ordini semplici/clienti fidati, sposta lo stato in `WAITING_FAST`.
        *   **Firma:** Per ordini complessi/importi alti, sposta lo stato in `WAITING_SIGN`.
    *   Viene rimosso l'automatismo basato sulla soglia di 5000€.

4.  **Fase di Formalizzazione (Cliente):**
    *   **Scenario Veloce (`WAITING_FAST`):** Il cliente accetta tramite una modale con checkbox dei termini e condizioni.
    *   **Scenario Burocratico (`WAITING_SIGN`):** Il cliente deve scaricare un contratto, firmarlo e ricaricarlo.

5.  **Fase Esecutiva (Admin):**
    *   Un ordine accettato (`SIGNED`) viene messo in produzione (`IN_PRODUZIONE`).
    *   Viene introdotto un nuovo stato `READY` per indicare che la merce è pronta per il ritiro/spedizione.

**Azioni da Eseguire:**

1.  **Aggiornare `src/views/BuilderView.vue`:**
    *   Modificare la logica dei pulsanti per distinguere tra preventivi semplici e complessi.
    *   Rimuovere la logica di controllo automatico sulla soglia di prezzo.
    *   Implementare la regressione di stato a `PENDING_VAL` quando si modifica un preventivo `QUOTE_READY`.
2.  **Aggiornare `src/views/AdminView.vue`:**
    *   Nella card `ORDER_REQ`, sostituire l'azione automatica con due pulsanti: "Veloce" e "Firma".
    *   Aggiungere l'azione per spostare un ordine da `IN_PRODUZIONE` a `READY`.
3.  **Aggiornare `src/views/ClientDashboard.vue`:**
    *   Implementare le diverse viste e azioni per gli stati `WAITING_FAST` e `WAITING_SIGN`.
    *   Creare la modale "Fast Track" per l'accettazione veloce.
4.  **Aggiornare `src/types.ts`:**
    *   Aggiungere i nuovi stati `ORDER_REQ`, `WAITING_FAST`, `WAITING_SIGN`, `READY`.
    *   Rimuovere `PENDING_SIGN` e `PENDING_FAST_SIGN`.

