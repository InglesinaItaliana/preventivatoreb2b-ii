# POLARIS

> Roadmap strategica per l'evoluzione strutturale della suite-of-webapps.
> Documento "vivo": va aggiornato dopo ogni step completato o decisione esplicita.

**Ultima revisione:** 2026-05-18
**Stato globale:** azione 1 implementata in codice, in attesa di deploy + test.

---

## 0. Scope e principi guida

POLARIS è la roadmap che governa l'evoluzione architetturale di `preventivatoreb2b-ii` come **suite di webapp installabili** (POPS + SIDERA desktop shell + N PWA mobile scoped).

**Principi (immutabili):**

1. **POPS è live in produzione.** Ogni modifica a file condivisi (`index.html`, `vite.config.ts`, `firebase.json`, `src/main.ts`, `src/App.vue`, `src/firebase.ts`, `src/router/index.ts`, `firestore.rules`, `src/functions/index.ts`) richiede test manuali POPS prima del merge.
2. **Mai modificare codice senza autorizzazione esplicita.** POLARIS pianifica, non esegue.
3. **Lavorare sempre su branch di feature**, mai direttamente su main.
4. **Un'azione POLARIS alla volta.** Una azione = un branch = una review = un deploy. Niente commit "bundle" che mescolano 2 punti.
5. **Aggiornare questo file dopo ogni step.** Stato, decisioni, note su cosa è stato fatto realmente vs piano.

---

## 1. Stato attuale architettura (snapshot 2026-05-18)

**Prodotti attivi:**
- **POPS** — B2B clienti finali + gestionale produzione interna (`/`, `/preventivatore`, `/production`, `/delivery`, `/admin`, `/dashboard`, `/calcoli`, ...). Live su `preventivatoreb2b-ii.web.app`.
- **SIDERA** — Shell desktop unica per moduli interni (`/sidera/*`). Sidebar organizzata per moduli galattici.

**Sub-moduli SIDERA (suite-of-webapps pattern):**

| Modulo | Path | Stato PWA | Note |
|---|---|---|---|
| QUASAR | `/sidera` (home) | — | "Il Mio Giorno", solo desktop |
| CEPHEID | `/cepheid/*` | ✅ PWA attiva | Azioni / Progetti / Scadenze. Manifest statico in `/public/cepheid.webmanifest`, swap runtime in `index.html` |
| PULSAR | `/pulsar/*` | ✅ PWA attiva | Chat + FCM push. Manifest via VitePWA. Notifiche data-only |
| NEBULA | `/sidera/nebula` | ☐ Solo view SIDERA | Team — non ancora PWA |
| NOVA | `/sidera/nova/spedizioni` | ☐ Solo view SIDERA | Spedizioni — non ancora PWA |
| 6° modulo | TBD | ☐ Non definito | — |

**Infrastruttura condivisa:**
- Build singolo Vite → unico `dist/` (oggi ~720 KB di JS firebase + vendor sempre caricati)
- Service Worker FCM unico (`public/firebase-messaging-sw.js`) registrato con scope `/`
- Auth Firebase unica per tutti (POPS clienti B2B + team interno PRODUZIONE / LOGISTICA / ADMIN)
- Firestore unico (collections: `chats`, `messages`, `tasks`, `projects`, `team`, `clienti`, ...)
- Cloud Functions `europe-west1`, Node 20 (deprecato 2026-04-30 → bumpare a Node 22 entro 2026-10-30)

---

## 2. Roadmap — 7 azioni con priorità

| # | Priorità | Azione | Trigger ideale | Rischio POPS | Stato |
|---|---|---|---|---|---|
| 1 | 🔴 Alta | **FCM token-per-scope** | Prima del prossimo modulo notificato (es. notifiche CEPHEID) | Nessuno | 🔄 |
| 2 | 🟠 Media-alta | **Manifest statici per tutti gli scope** (rimuovere generazione VitePWA dinamica) | Quando si può testare iOS standalone a freddo | Basso | ☐ |
| 3 | 🟠 Media-alta | **ScopedLogin componente unificato** | Prima di aggiungere PWA #3 (NEBULA o NOVA) | Nessuno | ☐ |
| 4 | 🟡 Media | **Code splitting raffinato** (firebase modular, visualizer) | Quando si percepiscono rallentamenti mobile | Basso | ☐ |
| 5 | 🟢 Bassa | **`name` manifest più parlanti** | Quando si lavora su uno scope per altri motivi | Nessuno | ☐ |
| 6 | 🟢 Bassa | **`meta.scope` unificato nel router guard** | Da 4+ PWA in poi | Medio (test ruoli POPS obbligatori) | ☐ |
| 7 | ⚪ Differita | **Separazione deploy POPS vs interno** | Tra 6–12 mesi, se POPS cresce o legal richiede dominio separato | Altissimo | ⏸ |

**Legenda stato:** ☐ da fare · 🔄 in corso · ☑ fatto · ⏸ rimandato esplicitamente · ❌ scartato

---

## 3. Dettaglio azioni

### Azione 1 — FCM token-per-scope 🔴

**Problema.** Oggi `team/{email}.fcmTokens` è una mappa `{ token: timestamp }` senza distinzione di scope. Quando aggiungeremo notifiche CEPHEID (o NEBULA/NOVA), la Cloud Function multicasterà a tutti i token dell'utente, inclusi quelli registrati da PULSAR → push con `url: /cepheid/...` ricevute mentre l'utente sta in PULSAR PWA.

**Soluzione strutturale.**
- Schema retrocompatibile: `fcmTokens.<TOKEN>` da `<timestamp>` a `{ ts: <timestamp>, scope: 'pulsar' | 'cepheid' | ..., ua?: string }`.
- Fallback Cloud Function: se il valore è un timestamp nudo (formato vecchio), trattarlo come `scope: 'pulsar'`.
- `useNotifications.ts` accetta parametro `scope`; spostarlo da `composables/pulsar/` a `composables/shared/`.
- Migrazione lazy: al prossimo `requestPermission()` il client riscrive con il nuovo formato. Nessuno script di migrazione necessario.

**File toccati.**
- `src/composables/pulsar/useNotifications.ts` → muovere in `src/composables/shared/useNotifications.ts` + accettare `scope`
- `src/functions/index.ts` (riga ~1413, `onNewPulsarMessage`) → filtrare per `scope === 'pulsar'` con fallback formato vecchio
- `src/views/pulsar/PulsarLayout.vue`, `src/views/cepheid/CepheidLayout.vue` → invocare `useNotifications('pulsar')` o `'cepheid'`
- `firestore.rules` → nessuna modifica necessaria (`hasOnly(['fcmTokens'])` continua a funzionare)

**Rischio POPS.** Zero — POPS non usa FCM.

**Test obbligatori prima del merge.**
- ☐ PULSAR PWA su iOS: invio messaggio → push arriva, click apre `/pulsar/chat/<id>`
- ☐ PULSAR PWA su Android: idem
- ☐ Stesso utente con token vecchio formato (no scope) → push PULSAR continuano ad arrivare (fallback)
- ☐ Doppia installazione PULSAR + CEPHEID sullo stesso device → token salvati con scope diverso

**Implementazione 2026-05-18 (branch `polaris/1-fcm-token-scope`):**
- Composable spostato a `src/composables/shared/useNotifications.ts` con firma `useNotifications(scope: NotificationScope)`.
- Aggiunto type `NotificationScope = 'pulsar' | 'cepheid' | 'sidera'`. `'sidera'` introdotto come wildcard desktop (vedi sezione 4 — Decisioni esplicite).
- Schema entry token: `{ ts: serverTimestamp(), scope, ua?: string }`. UA limitato a 120 caratteri per non sprecare spazio doc.
- Prune token stale: helper `extractTimestamp()` riconosce sia oggetto nuovo (`val.ts`) sia legacy (Timestamp nudo).
- Cloud Function `onNewPulsarMessage` (src/functions/index.ts:1408-1424): filtro per scope ∈ {`pulsar`, `sidera`}; entry senza `scope` (formato legacy) trattata come `pulsar`.
- File POPS toccati: **zero** (verifica `grep` post-modifica).
- `firestore.rules`: invariate. La regola `hasOnly(['fcmTokens'])` continua a funzionare (mappa top-level invariata).
- **Deploy pendente:** Functions prima, Hosting dopo (vedi piano in sezione "Deploy" della checklist).

---

### Azione 2 — Manifest statici per tutti gli scope 🟠

**Problema.** Lo swap manifest runtime in `index.html` (righe 22–53) ha race condition potenziale: VitePWA inietta `<link rel="manifest">` PULSAR durante il bootstrap, lo script inline lo rimuove + sostituisce con CEPHEID se path `/cepheid`. Su iOS pre-16.4 può funzionare male con "Add to Home" a freddo.

**Soluzione strutturale (in 2 step).**

**Step 1 (sicuro, da fare presto):**
- Spostare anche PULSAR a manifest statico in `/public/pulsar.webmanifest` (come già fatto per CEPHEID).
- In `vite.config.ts` mettere `manifest: false` su VitePWA (resta solo per generare il SW workbox).
- Lo swap in `index.html` sceglie quale manifest statico linkare in base al path, **senza più conflitti con VitePWA**.

**Step 2 (più invasivo, solo se servirà):**
- HTML separati per scope (`pulsar/index.html`, `cepheid/index.html`).
- `vite.config.ts` con `build.rollupOptions.input` multi-page.
- `firebase.json` con rewrites scope-specifici, **fallback POPS deve restare ultimo**.

**File toccati (step 1).**
- `vite.config.ts` → `manifest: false`
- `public/pulsar.webmanifest` (nuovo)
- `index.html` → script inline rivisto per scegliere manifest tra `/pulsar.webmanifest` e `/cepheid.webmanifest` in base al path, prima del paint

**Rischio POPS.** Basso (step 1). Lo script inline gira solo se path è `/pulsar*` o `/cepheid*`, non tocca POPS.

**Test obbligatori prima del merge (step 1).**
- ☐ POPS `/` → nessun manifest linkato (o quello "default" se vogliamo mantenerlo)
- ☐ `/pulsar/` da browser → manifest PULSAR caricato, no warning console
- ☐ `/cepheid/` da browser → manifest CEPHEID caricato
- ☐ iOS: "Add to Home" da `/pulsar/` → icona + nome PULSAR (testare in modalità navigazione privata per cache vuota)
- ☐ iOS: "Add to Home" da `/cepheid/` → icona + nome CEPHEID
- ☐ Android Chrome: install prompt sui due scope mostra il manifest giusto

---

### Azione 3 — ScopedLogin componente unificato 🟠

**Problema.** `PulsarLoginView.vue` e `CepheidLoginView.vue` sono 372 righe ciascuna, ~95% identiche. Differenze: nome classi CSS (`pl-` vs `cl-`), palette colori, SVG logo geometry, router target. Aggiungere NEBULA/NOVA come PWA → altre 372 + 372 righe duplicate.

**Soluzione strutturale.**
- Nuovo componente `src/views/shared/ScopedLogin.vue` con props: `scope`, `palette`, `wordmark`, slot per logo SVG.
- Le rotte `/<modulo>/login` puntano allo stesso componente passando props differenti.
- Eliminare `PulsarLoginView.vue` e `CepheidLoginView.vue` dopo aver migrato.

**File toccati.**
- `src/views/shared/ScopedLogin.vue` (nuovo)
- `src/router/index.ts` (cambio import nelle rotte login)
- `src/views/pulsar/PulsarLoginView.vue` → eliminato
- `src/views/cepheid/CepheidLoginView.vue` → eliminato

**Rischio POPS.** Zero. `LoginView.vue` POPS è completamente separato e non va toccato.

**Test obbligatori prima del merge.**
- ☐ `/pulsar/login` → render identico al precedente, login funzionante, redirect a `/pulsar`
- ☐ `/cepheid/login` → render identico al precedente, login funzionante, redirect a `/cepheid`
- ☐ Comportamento `display-mode: standalone` preservato (vedi memory `project-pulsar`)
- ☐ Login con utente non-team → redirect corretto

---

### Azione 4 — Code splitting raffinato 🟡

**Problema.** `dist/assets/firebase-*.js` ~464 KB, `vendor-*.js` ~256 KB. Tutti gli utenti scaricano sempre tutto, anche se usano solo POPS.

**Soluzione strutturale (graduale).**
1. Aggiungere `rollup-plugin-visualizer` (dev-only) per misurare cosa entra nei chunk iniziali. Zero impatto runtime.
2. Raffinare `manualChunks` in `vite.config.ts`:
   - `firebase-core` (`firebase/app`, `firebase/auth`)
   - `firebase-firestore` (caricato solo da chi usa Firestore)
   - `firebase-messaging` (caricato solo da PULSAR/CEPHEID PWA)
3. Lazy-load VitePWA SW registration condizionato al path (POPS non lo registra).

**File toccati.**
- `vite.config.ts` → `manualChunks` esteso
- `package.json` → aggiungere `rollup-plugin-visualizer` come dev dep
- Eventualmente `src/main.ts` → registrazione SW condizionale

**Rischio POPS.** Basso. `manualChunks` errato = build fail, non runtime bug. Test: dopo modifica, controllare che `/` (POPS) e `/preventivatore` caricano normalmente.

**Test obbligatori prima del merge.**
- ☐ Bundle visualizer: confermare che `firebase-messaging` non è nel chunk iniziale di POPS
- ☐ POPS login → preventivatore: flusso completo
- ☐ Production dashboard: caricamento OK
- ☐ Lighthouse mobile su `/`: First Contentful Paint non peggiorato

---

### Azione 5 — `name` manifest più parlanti 🟢

**Problema.** I manifest hanno `name: "PULSAR"` / `name: "CEPHEID"` — poco descrittivi per nuovi utenti.

**Soluzione strutturale.**
- `name`: `"PULSAR — Chat Inglesina"` / `"CEPHEID — Azioni Inglesina"` / ...
- `short_name`: resta breve (max 12 char) per la label sotto l'icona home
- `description`: già descrittivo, ok

**File toccati.**
- `vite.config.ts` (manifest VitePWA) — se l'azione 2 step 1 è già fatta, questo file non ha più manifest e si modifica solo `public/pulsar.webmanifest`
- `public/cepheid.webmanifest`

**Rischio POPS.** Zero.

**Caveat.** Le PWA già installate non vedono la modifica finché non vengono reinstallate. **Mai cambiare `id`, `start_url`, `scope`** — quelli sono permanenti.

**Test obbligatori prima del merge.**
- ☐ Install fresca su Android: il nome lungo appare in "App info" / "App settings"
- ☐ iOS: splash screen mostra `name`, home label mostra `short_name`

---

### Azione 6 — `meta.scope` unificato 🟢

**Problema.** Il router guard cresce con un `isXScope` per ogni nuovo modulo (riga `router/index.ts:140-143`). A 4+ PWA diventa rumoroso. Anche `allowedPaths` per ruolo PRODUZIONE (`router/index.ts:167`) va aggiornato per ogni nuovo scope.

**Soluzione strutturale.**
- Convenzione: ogni rotta di scope ha `meta: { scope: 'pulsar' }` invece di `meta: { pulsarScope: true }`.
- Funzione `getLoginRoute(to)` che ricava `/${scope}/login` cercando `meta.scope` lungo `to.matched`.
- Lista `allowedPathsByRole` estratta in file separato (`src/router/permissions.ts`).

**File toccati.**
- `src/router/index.ts` (refactor guard + meta su tutte le rotte scoped)
- Nuovo `src/router/permissions.ts` (opzionale)

**Rischio POPS.** **Medio** — il guard governa anche login POPS, redirect ruolo CLIENTE / PRODUZIONE / LOGISTICA, accesso ad `/admin`. Refactor sbagliato = login B2B rotto.

**Test obbligatori prima del merge.**
- ☐ Login cliente standard `/` → redirect a `/preventivatore` ✓
- ☐ Login admin → resta su rotta richiesta ✓
- ☐ Login PRODUZIONE → `/production` se rotta non whitelisted ✓
- ☐ Login LOGISTICA → `/delivery` ✓
- ☐ Logout da `/sidera` → `/` (NON `/pulsar/login`) ✓
- ☐ Logout da `/pulsar/` → `/pulsar/login` ✓
- ☐ Logout da `/cepheid/` → `/cepheid/login` ✓
- ☐ Accesso non autenticato a `/admin` → blocco corretto

---

### Azione 7 — Separazione deploy POPS vs interno ⏸

**Status: differita.** Da rivalutare tra 6–12 mesi.

**Trigger per riprendere:**
- POPS supera 100+ utenti clienti attivi, OPPURE
- SIDERA raggiunge 5+ moduli stabili, OPPURE
- Legal/marketing richiede dominio separato (es. `clienti.inglesinaitaliana.it` vs `app.inglesinaitaliana.it`)

**Non implementare ora** — costo refactor altissimo, beneficio non ancora dimostrato.

---

## 4. Decisioni esplicite

> Quando si sceglie di NON fare un'azione POLARIS, o di farla in un modo diverso da quello pianificato, annotare qui con data e motivo. Aiuta a non rivisitare le stesse domande tra mesi.

### 2026-05-18 — Azione 1: introduzione scope `'sidera'` come wildcard desktop

**Contesto.** Il piano originale parlava di scope per-PWA (`pulsar`, `cepheid`, ...). Durante l'implementazione, ho rilevato che `SideraLayout.vue` (shell desktop) chiama anche lui `useNotifications()` — quindi anche le sessioni desktop registrano un token FCM.

**Decisione.** Introdurre un terzo scope `'sidera'` che rappresenta il browser desktop. Convenzione: i token con scope `'sidera'` ricevono **tutte** le notifiche di tutti i moduli (wildcard). La Cloud Function `onNewPulsarMessage` filtra `scope ∈ {'pulsar', 'sidera'}`; future Cloud Function `onNewCepheidAction` filtreranno `scope ∈ {'cepheid', 'sidera'}`.

**Razionale.** Una postazione desktop è agnostica al modulo: il dipendente in ufficio si aspetta di ricevere chat (PULSAR) E azioni assegnate (CEPHEID) sullo stesso device. Non avrebbe senso fargli installare 2 PWA sul Mac.

**Implicazioni.** Quando aggiungeremo notifiche CEPHEID (Cloud Function dedicata), basterà includere `'sidera'` nel filtro scope per propagare anche al desktop.

---

## 5. Workflow operativo POLARIS

Quando si decide di lavorare su un'azione POLARIS:

1. **Apri sessione Claude** dicendo "lavoriamo su POLARIS azione N".
2. Claude legge `POLARIS.md`, verifica dipendenze tra azioni, propone piano dettagliato passo-passo per la singola azione.
3. **Utente autorizza esplicitamente** (regola fissa: nessun codice senza OK).
4. Branch dedicato `polaris/<numero>-<slug>` (es. `polaris/1-fcm-token-scope`).
5. Implementazione + test manuali della checklist dell'azione.
6. Merge → deploy → **aggiornare `POLARIS.md`**: stato ☑, data, note su cosa è stato fatto realmente vs piano, eventuali deviazioni.
7. Se la modifica rivela qualcosa di nuovo (rischio non previsto, opportunità collaterale) → aggiungere voce in sezione "Decisioni esplicite" o aggiornare l'azione successiva.

---

## 6. Cronologia revisioni

- **2026-05-18** — Creazione documento. Roadmap iniziale a 7 azioni. Stato globale: pianificazione, 0 azioni avviate.
- **2026-05-18** — Azione 1 FCM token-per-scope implementata in codice (branch `polaris/1-fcm-token-scope`). Decisione esplicita: introdotto scope `'sidera'` come wildcard desktop. Deploy + test pendenti.
