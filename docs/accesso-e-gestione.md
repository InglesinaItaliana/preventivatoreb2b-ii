# Accesso e gestione del team — piano di lavoro

> Centralizzare la gestione del team su **SIDERA**, con conseguenze automatiche su **POPS** (e su tutti i moduli).
> Analisi e piano del 2026-05-30. Solo design: nessun codice modificato.

## TL;DR

Il grosso è **già fatto a livello dati**. La gestione team *sembra* appartenere a "POPS impostazioni" solo perché l'UI vive lì, ma la sorgente di verità è già condivisa da tutta la suite. Non serve centralizzare il backend: serve spostare la **titolarità concettuale** e ripulire i confini.

---

## Diagnosi: cosa è già centralizzato, cosa no

A livello dati è **già centralizzato**:

- Sorgente di verità unica: collezione **`/team/{email}`** (nessuna copia POPS vs SIDERA).
- Composable di lettura già in namespace SIDERA: `src/composables/sidera/useTeamMembers.ts`.
- `createTeamMember` (Cloud Function) crea Auth user + doc `/team` + il trigger `syncTeamRoleToAuth` scrive i custom claims del ruolo nel token JWT.
- Tutti i moduli (CEPHEID, PULSAR, QUASAR, NEBULA) **leggono già** da `/team` via `onSnapshot` reattivo.

Fuori posto è solo la **porta d'ingresso**: l'UI di gestione è `src/views/AdminSettings.vue` (inquadrata mentalmente come "impostazioni POPS"), ma tocca il dato condiviso di tutta la suite.

→ Non bisogna *centralizzare* il backend. Bisogna **spostare la titolarità** e formalizzare i confini.

---

## Principio guida

> **SIDERA possiede l'identità. I moduli possiedono le proiezioni.**

- **SIDERA (CORE)** è proprietaria del *ciclo di vita dell'identità*: chi esiste, email, ruolo, stato attivo/disattivo, account Auth. Sono i campi "core" di `/team`.
- **I moduli sono consumatori**: leggono `/team` e scrivono **solo i campi di loro pertinenza** (NEBULA già scrive `position`/`category`; PULSAR scrive solo `fcmTokens`).
- **POPS** non "crea il team": lo *consuma* (commerciali assegnabili ai preventivi, ecc.).

---

## Piano operativo

### 1. Spostare l'UI di gestione dentro SIDERA CORE
- Esiste già `SideraCoreSettings.vue` con gating `isCoreAdmin` + route maintenance.
- La gestione team va lì (o sotto-pagina dedicata `/sidera/admin/team`), **gated su `isCoreAdmin`**, non più sotto le impostazioni POPS.
- `AdminSettings.vue` → redirect oppure svuotato del blocco team.
- Riusa pari pari la logica di scrittura (`createTeamMember` + `updateDoc /team`): si sposta solo il componente. **Rischio basso.**

### 2. Ciclo di vita `active` (soft-disable, NON delete)
- Disabilitare un membro in SIDERA deve:
  - toglierlo dalle liste di selezione (assignees, commerciali, mention) → basta che `useTeamMembers` filtri `active === false`, come già fa con `HIDDEN_TEAM_EMAILS`;
  - **non** rompere lo storico (preventivi/task già assegnati risolvono nome+avatar via fallback su email, già esistente).
- **Evitare il delete fisico** del membro: lascia doc orfani (stesso problema già annotato per i clienti). Usare `active:false`.

### 3. Separare campi "core" dalle "estensioni di modulo"
- `/team` oggi è un cassetto unico (identità + `position`/`category` NEBULA + `hueIndex` avatar + `fcmTokens`). OK finché restano pochi.
- Regola: se POPS (o altro modulo) avrà config sua sul collaboratore (listino, provvigioni, sede), **non** entra in `/team` → doc separato chiave-email, es. `/team/{email}/modules/pops` o `/popsTeamConfig/{email}`.
- Così SIDERA resta proprietaria del core e i moduli estendono senza inquinare l'identità.

### 4. Verificare il refresh del token dopo cambio ruolo
- Cambio ruolo → `syncTeamRoleToAuth` → custom claims → rules. Ma il client vede i nuovi permessi solo dopo `getIdToken(true)` (force refresh) o ri-login.
- Unico punto dove la propagazione non è istantanea: da verificare.

---

## "Conseguenze su POPS" — perché sono automatiche

**Non serve un event bus, né far "notificare" POPS da SIDERA.** Il canale di propagazione *è la collezione condivisa*:

- **Membership / anagrafica** → propaga via `onSnapshot('/team')` che ogni modulo ha già. Cambi il cognome in SIDERA → POPS lo vede al volo.
- **Ruolo / permessi** → propaga via trigger `syncTeamRoleToAuth` → custom claims → Firestore rules. Cambi il ruolo in SIDERA → le rules di POPS reagiscono (al prossimo refresh token).

"Conseguenza su POPS" = POPS legge il dato che SIDERA possiede. Niente sincronizzazione, niente duplicazione, niente disallineamento.

---

## Riepilogo (rischio crescente)

| # | Azione | Tocca dati? | Rischio |
|---|--------|-------------|---------|
| 1 | Spostare UI gestione team in SIDERA CORE (gating `isCoreAdmin`), svuotare/redirect `AdminSettings.vue` | No (solo UI) | Basso |
| 2 | Aggiungere `active` + soft-disable, filtro in `useTeamMembers` | Sì (campo nuovo) | Basso |
| 3 | Convenzione: estensioni di modulo in doc separati, non in `/team` | No (regola) | Nullo ora, paga dopo |
| 4 | Verificare force-refresh token dopo cambio ruolo | No | Basso |

I punti **1 e 2 danno già il ~90%** del risultato ("la gestione vive in SIDERA, con conseguenze automatiche su POPS") a rischio minimo: non si spostano dati, solo la porta d'ingresso, e si formalizza il confine.

---

## File chiave (riferimento)

| Funzione | File | Righe |
|----------|------|-------|
| Creazione (UI attuale) | `src/views/AdminSettings.vue` | 296–350 |
| Cloud Fn creazione | `src/functions/index.ts` (`createTeamMember`) | 531–580 |
| Sync ruolo → claims | `src/functions/index.ts` (`syncTeamRoleToAuth`) | 97–180 |
| Lettura team | `src/composables/sidera/useTeamMembers.ts` | 86–113 |
| Hidden emails | `src/composables/sidera/useTeamMembers.ts` | 24–27 |
| Current user / ruolo | `src/composables/sidera/useCurrentUser.ts` | 17–38 |
| CORE admin allowlist | `src/composables/sidera/useCoreAdmins.ts` | 16–60 |
| CORE settings UI (target) | `src/views/sidera/SideraCoreSettings.vue` | 1–71 |
| Rules `/team` e `/core/admins` | `firestore.rules` | 33–83 |
