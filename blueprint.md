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

L'obiettivo è arricchire i dati salvati per ogni preventivo, aggiungendo un campo di riepilogo che aggreghi le righe con le stesse caratteristiche.

**Logica di Funzionamento:**

1.  **Aggiunta del Campo `sommarioPreventivo`:**
    *   Ogni preventivo nel database includerà un nuovo campo opzionale chiamato `sommarioPreventivo`.
    *   Questo campo sarà un array di oggetti, dove ogni oggetto rappresenta un raggruppamento di righe.

2.  **Logica di Raggruppamento:**
    *   Le righe del preventivo verranno raggruppate quando i valori dei campi `descrizioneCompleta` e `infoCanalino` sono identici.
    *   Per ogni gruppo, verrà sommato il valore del campo `quantita`.

3.  **Struttura del Sommario:**
    *   Ogni oggetto nell'array `sommarioPreventivo` avrà la seguente struttura:
        *   `descrizioneCompleta` (string)
        *   `infoCanalino` (string)
        *   `quantita` (number)

4.  **Integrazione nel Flusso:**
    *   **Salvataggio (`BuilderView.vue`):** La logica di calcolo del sommario verrà eseguita all'interno della funzione `handleSavePreventivo`, prima di salvare o aggiornare un preventivo nel database.
    *   **Visualizzazione (`AdminView.vue`):** Il sommario verrà visualizzato nella dashboard dell'amministratore, fornendo una vista aggregata e di rapida consultazione per ogni commessa.

**Azioni da Eseguire:**

1.  **Aggiornare `src/types.ts`:**
    *   Definire una nuova interfaccia `RiepilogoRiga` per descrivere la struttura degli oggetti nel sommario.
    *   Aggiungere il campo opzionale `sommarioPreventivo: RiepilogoRiga[]` all'interfaccia `Preventivo`.
2.  **Aggiornare `src/views/BuilderView.vue`:**
    *   Modificare la funzione `handleSavePreventivo` per calcolare il `sommarioPreventivo` e aggiungerlo all'oggetto `preventivo` prima di salvarlo.
3.  **Aggiornare `src/views/AdminView.vue`:**
    *   Modificare il template per visualizzare i dati del `sommarioPreventivo` all'interno dei dettagli di ogni commessa.
