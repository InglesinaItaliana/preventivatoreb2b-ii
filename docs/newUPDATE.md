PULSAR
[]

FE
CEPHEID
[]

NEBULA
[]

MANUTENZIONE / PULIZIA CODICE (dal 01/10/2026)
- [ ] Verifica post Node 22: il primo ordine confermato riceve `cic_order_id` + autoDeliveredAfter7Days gira alle 06:00
- [ ] Pulizia WIF (dopo 2-3 deploy verdi): eliminare il secret GitHub `FIREBASE_SERVICE_ACCOUNT_PREVENTIVATOREB2B_II`
- [ ] Pulizia WIF: DISATTIVARE le 2 chiavi JSON di `firebase-adminsdk-fbsvc` (24/12/2025 e 25/01/2026), aspettare qualche giorno, poi eliminarle (una potrebbe servire a script locali)
- [ ] Type-check: correggere i 133 errori di `npx vue-tsc --noEmit -p tsconfig.app.json` (98 nella suite, 21 in POPS in un commit separato), poi renderlo bloccante in `ci-pr.yml`
- [ ] Type-check: correggere il comando in CLAUDE.md (`tsc` → `vue-tsc`: con `tsc` i file .vue non si leggono e compaiono falsi errori, es. slashCommands.ts)
- [ ] Type-check: importare tourguidejs dal pacchetto e non da `@sjmc11/tourguidejs/src/Tour` (BuilderView, ClientDashboard) → -14 errori
- [ ] NEBULA docs: estensione Link registrata due volte (`[tiptap warn] Duplicate extension names found: ['link']`), probabilmente StarterKit v3 la include già
- [x] Functions: eliminate 7 funzioni una tantum (migrateAllTeamClaims, backfillTeamAvatars, auditAssigneeUids, backfillAssigneeUids, backfillMessageMembers, backfillYDocs, importBugsFromNotion): da 62 a 55 (01/10/2026)
- [ ] mcpNebula: verificare dal 05/10 che le chiamate siano a zero (connettore claude.ai "Nebula" e voce Desktop rimossi il 01/10)
- [ ] mcpNebula: revocare l'API key `nbk_` di Claude Desktop da NEBULA → "Connetti Claude" (è anche il test reale della prima funzione v2, `revokeNebulaApiKey`)
- [ ] mcpNebula: correggere `lib_mcp/oauth.ts` (MCP_BASE_URL punta ancora a mcpNebula)
- [ ] mcpNebula: dopo 30 giorni senza chiamate, `firebase functions:delete mcpNebula --region europe-west1`, poi PR che lo toglie dal codice (index.ts + KNOWN_FNS in lib_mcp/server.ts)
- [ ] Funzioni FiC dopo il passaggio a CiC (18/06): verificare quali non servono più (es. `syncAddressesFromFiC` "una tantum", `syncProductsWithFic`, `importClientsFromFiC`) con lo stesso metodo (frontend + log)
- [ ] Functions: `firebase-functions` 7.0.2 → 7.4.0 (stessa major, nessuna scadenza; ripubblica tutte le funzioni → momento tranquillo + verifica)
- [ ] Functions: rimuovere la devDependency inutile `@types/axios` (axios ha già i suoi tipi)
- [ ] CI: riprovare a sbloccare `firebase-tools` (fermo a 15.22.1) e `ubuntu-22.04` (ora che c'è WIF, in una PR a parte)
- [ ] Test in emulatore (functions + firestore + auth + pubsub, progetto `demo-`, CiC simulato) per `generaOrdineFIC` e `creaDdtCumulativo`, poi in `ci-pr.yml`: oggi la CI testa solo la logica pura, non l'emissione reale dell'ordine (percorso dell'incidente "ordine orfano"). Base di partenza: lo smoke test usato per la verifica di Node 22. Serve Java 21 (in CI: `actions/setup-java`)
- [x] Functions v2 operative (01/10/2026): pilota verificato (callable + trigger Firestore eur3), 3 permessi IAM dei service agent assegnati, prima funzione migrata: `revokeNebulaApiKey`
- [ ] Entro 31/10/2027: migrazione functions v1 → v2 (2nd gen) e passaggio a Node 24 (cambia l'URL di `mcpSidera`; un nome non passa da 1st a 2nd gen in place)


---


# BACKLOG — fatto

## PULSAR
- [x] Diminuire di 1 la dimensione del testo dei messaggi
- [x] Sfondo header (e area "notifiche" del telefono…la barra in alto con ora segnale telefono batteria ecc) in tutte le schede deve essere chiaro (stesso colore del container flottante in basso)
- [x] Container flottante in basso e fan senza bordi ne ombre ne flow
- [x] Fab su mobile l'icona non deve essere bianca ma del colore della pillola container e icona della stessa dimensione delle icone container pillola
- [x] Su card conversazione badge n°messaggi non letti

## QUASAR
- [x] togliere tutti bordi e ombre e glow da header e card
- [x] fai gli header come nel resto delle pagine cepheid pulsar ecc
- [x] in attività nell'header metti quello che ora è: Registro attività tutto ciò che accade su SIDERA e POPS, in tempo reale (aggiungi contatore degli eventi odierni)
- [x] in quadranti metti quello che ora è Quadranti Nessuna azione da gestire subito - il filtro per persona (in linea con il selettore tab, avatar collassabile unificato) - e il container pillola tab
- [x] in CRUSCOTTO mettici il "Buon pomeriggio, Gionata. Giovedì 4 giugno 2026 · 0 azioni per oggi"
- [x] in cruscotto i progetti attivi devono vedersi tutti scorrendo
- [x] su mobile la pillola container in basso e fab: togli ombre bordi e glow. sfondo tab fff8f0 e il fab uguale ma invertito con l'icona fff8f0
- [x] (calendario) per leggibilità le icone le mettiamo filled
- [x] (calendario) notifiche appuntamenti fisse: invito alla creazione + riprogrammazione + annullamento (trigger notifyOnAppointment) e promemoria fissi 1 giorno/1 ora prima (scheduler appointmentReminders). Impostazioni utente in CORE = step successivo
- [x] (calendario) visualizzare gli obiettivi sul calendario (stesso colore degli appuntamenti; migreranno da CEPHEID a QUASAR)
- [x] (calendario) filtri in alto a sx del container tab: TUTTO / solo QUASAR / solo CEPHEID

## CEPHEID
- [x] nei progetti metti l'icona e scritta disattiva e apri dettaglio nel menu 3 pallini
- [x] nei progetti metti l'obiettivo collegato sotto al titolo (icona estratta dal badge progetto, nera e allineata con data task e clessidra)
- [x] quando hovero su una card progetto anche il container con la data e le barre di progressione si colora allo stesso modo
- [x] in progetti l'icona obiettivo sulla card non filled e il nome obiettivo non in grassetto, con la stessa distanza dalla linea della data rispetto alla distanza tra linea data e linea task
- [x] su mobile la pillola container in basso e fab: togli ombre bordi e glow. sfondo tab fff8f0 e il fab uguale ma invertito con l'icona fff8f0
- [x] togliere simbolino su tab smistamento se non ci sono smistamenti da fare (sia su mobile che nella sidebar su desktop)

## NEBULA
- [x] se da mobile clicco su un link in un documento deve aprirlo sul browser esterno di default del telefono
- [x] su mobile la pillola container in basso e fab: togli ombre bordi e glow. sfondo tab fff8f0 e il fab uguale ma invertito con l'icona fff8f0
