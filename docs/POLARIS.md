# POLARIS

> Roadmap strategica per l'evoluzione strutturale della suite-of-webapps.
> Documento "vivo": va aggiornato dopo ogni step completato o decisione esplicita.

**Ultima revisione:** 2026-05-20
**Stato globale:** azioni 1, 2, 3, 4, 5 deployate in produzione (5/7 completate). Resta azione 6 (in lavorazione: pianificata insieme alla promozione NEBULA a 4ª PWA) e azione 7 (differita 6-12 mesi). POPS = 3ª PWA installabile, login con Schlegel + vertice attivo live, Firebase chunk splittato granulare con risparmio reale ~16 KB su POPS. **NEBULA promossa a 4ª PWA installabile** (branch `feature/nebula-pwa`) — sblocca il trigger di azione 6 ("da 4+ PWA in poi").

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
| NEBULA | `/nebula/*` | ✅ PWA attiva | Team. Manifest statico in `/public/nebula.webmanifest`, scope token FCM `'nebula'` (no eventi ancora) |
| NOVA | `/sidera/nova/spedizioni` | ☐ Solo view SIDERA | Spedizioni — non ancora PWA |
| 6° modulo | TBD | ☐ Non definito | — |

**Infrastruttura condivisa:**
- Build singolo Vite → unico `dist/` (oggi ~720 KB di JS firebase + vendor sempre caricati)
- Service Worker FCM unico (`public/firebase-messaging-sw.js`) registrato con scope `/`
- Auth Firebase unica per tutti (POPS clienti B2B + team interno PRODUZIONE / LOGISTICA / ADMIN)
- Firestore unico (collections: `chats`, `messages`, `tasks` (con discriminator `type`), `projects`, `obiettivi`, `team`, `clienti`, ...)
- Cloud Functions `europe-west1`, Node 20 (deprecato 2026-04-30 → bumpare a Node 22 entro 2026-10-30)

---

## 2. Roadmap — 7 azioni con priorità

| # | Priorità | Azione | Trigger ideale | Rischio POPS | Stato |
|---|---|---|---|---|---|
| 1 | 🔴 Alta | **FCM token-per-scope** | Prima del prossimo modulo notificato (es. notifiche CEPHEID) | Nessuno | ☑ |
| 2 | 🟠 Media-alta | **Manifest statici per tutti gli scope** (rimuovere generazione VitePWA dinamica) | Quando si può testare iOS standalone a freddo | Basso | ☑ |
| 3 | 🟠 Media-alta | **ScopedLogin componente unificato** | Prima di aggiungere PWA #3 (NEBULA o NOVA) | Nessuno | ☑ |
| 4 | 🟡 Media | **Code splitting raffinato** (firebase modular, visualizer) | Quando si percepiscono rallentamenti mobile | Basso | ☑ |
| 5 | 🟢 Bassa | **`name` manifest più parlanti** | Quando si lavora su uno scope per altri motivi | Nessuno | ☑ (piggyback su azione 2) |
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
- ☐ POPS `/` → manifest POPS caricato (POPS è ora 3ª PWA installabile)
- ☐ `/pulsar/` da browser → manifest PULSAR caricato, no warning console
- ☐ `/cepheid/` da browser → manifest CEPHEID caricato
- ☐ iOS: "Add to Home" da `/` → icona + nome POPS
- ☐ iOS: "Add to Home" da `/pulsar/` → icona + nome PULSAR (modalità navigazione privata per cache vuota)
- ☐ iOS: "Add to Home" da `/cepheid/` → icona + nome CEPHEID
- ☐ Android Chrome: install prompt sui tre scope mostra il manifest giusto

**Implementazione 2026-05-18 (branch `polaris/2-manifest-statici`):**
- POPS promosso a **3ª PWA installabile** (vedi sezione 4 — Decisioni esplicite): scope `/`, start_url `/`, name "POPS — Inglesina".
- Icone POPS generate da `public/favicon.png` (1024×1024) con sharp-cli → `public/icons/pops-{180,192,512}.png`.
- `public/pops.webmanifest` + `public/pulsar.webmanifest` creati come file statici. `public/cepheid.webmanifest` esisteva già: aggiornato solo `name` per allineamento.
- `vite.config.ts` → `manifest: false` (VitePWA continua a generare il SW workbox, ma non più il manifest dinamico). Eliminato il conflitto tra manifest auto-iniettato e swap runtime.
- `index.html` → base meta `apple-mobile-web-app-title` + `apple-touch-icon` ora puntano a POPS (default). Script inline riscritto in 3 rami: default POPS, `/pulsar*` → PULSAR, `/cepheid*` → CEPHEID. Niente più rimozione di un manifest auto-generato.
- Azione 5 (name parlanti) completata in piggyback: tutti i manifest hanno ora `name` lungo descrittivo ("POPS — Inglesina", "PULSAR — Chat Inglesina", "CEPHEID — Azioni Inglesina"); `short_name` resta breve.
- **File POPS toccati**: solo `index.html` (meta base + script inline, aggiunte e cambi mirati). Confermato dall'utente come strategia "modifiche miratissime, solo aggiunte o modifiche chirurgiche".
- Step 2 (HTML separati per scope) **rimandato**: lo step 1 elimina la race condition (no più conflitto VitePWA), e gli utenti aziendali hanno browser moderni. Riprenderemo step 2 solo se si presenteranno problemi reali di "Add to Home" su iOS.

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
- ☐ `/pulsar/login` → render con Schlegel + vertice PULSAR attivo (verde), login funzionante, redirect a `/pulsar`
- ☐ `/cepheid/login` → render con Schlegel + vertice CEPHEID attivo (oro), login funzionante, redirect a `/cepheid`
- ☐ Comportamento `display-mode: standalone` preservato (vedi memory `project-pulsar`)
- ☐ Login con utente non-team → redirect corretto
- ☐ Sphere background dinamiche derivate dal `primaryColor` per ogni scope
- ☐ Animazione: SVG fade-in, poi vertice attivo "si accende" dopo ~500ms

**Implementazione 2026-05-19 (branch `polaris/3-scoped-login`):**
- Nuovo componente `src/components/shared/SideraLogoSchlegel.vue`: diagramma Schlegel dell'ottaedro (6 vertici, 12 edges) parametrizzato via prop `activeScope`. Stesse coordinate di `SideraHubView.vue` per coerenza visiva tra Hub e Login.
- Nuovo componente `src/views/shared/ScopedLogin.vue`: guscio login generico con props (`scope`, `primaryColor`, `title`, `tagline`, `redirectPath`). Classi `sl-*`. Palette via CSS variable `--sl-primary`. Sphere colors derivate algoritmicamente dal `primaryColor`.
- `src/router/index.ts`: 2 rotte login passano props differenti allo stesso componente. `meta.pulsarScope`/`cepheidScope` invariati.
- Eliminati: `src/views/pulsar/PulsarLoginView.vue`, `src/views/cepheid/CepheidLoginView.vue` (~744 righe duplicate rimosse).
- **Decisione di design "doppia identità"** (vedi sezione 4): icona PWA installata mantiene single-vertex + raggi (riconoscibilità minimal stile Apple); login screen usa Schlegel completo (storytelling sistema).
- **Azione 5 piggyback con azione 2** già fatta in PR #4 (name parlanti nei manifest).

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

**Implementazione 2026-05-19 (branch `polaris/4-code-splitting`):**
- Aggiunto `rollup-plugin-visualizer` come devDep. Run con `ANALYZE=true npm run build` → `dist/stats.html` interattivo.
- `vite.config.ts` → `manualChunks` granulare: `firebase-core` (app+auth), `firebase-firestore`, `firebase-functions`, `firebase-messaging`. Vendor invariato.
- **Misure (raw size):**
  - Pre-split: `firebase` monolite = 464 KB
  - Post-split: `firebase-core` 184 KB + `firebase-firestore` 260 KB + `firebase-functions` 12 KB + `firebase-messaging` 12 KB = 468 KB totali
  - **Risparmio POPS** (no messaging): ~8 KB raw (~3-5 KB gzip). Modesto come numero assoluto.
- **Beneficio strutturale**: cache HTTP granulare (cambio a firestore non invalida auth), HTTP/2 multiplexing migliore, enabler per lazy-load futuro di firestore/functions/messaging.
- Step 3 (lazy SW registration) NON fatto in questa azione — rimandato per ridurre rischio. Lo SW VitePWA continua a registrarsi per tutti gli scope.
- **File POPS toccati**: solo `vite.config.ts` (configurazione build). Zero codice applicativo POPS modificato.

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

### 2026-05-19 — Azione 3: doppia identità visiva (icona PWA vs login Schlegel)

**Contesto.** Il piano originale di azione 3 prevedeva un componente `ScopedLogin` con SVG inline o slot per il logo, replicando lo stile attuale "singolo vertice + 4 raggi". L'utente ha proposto un'alternativa: riutilizzare il **diagramma Schlegel completo** del `SideraHubView` come logo dinamico del login, attivando solo il vertice corrispondente allo scope.

**Decisione.** Adottiamo entrambe le identità in contesti diversi (pattern design system Apple/moderno):
- **Icona PWA installata** (manifest icons 180/192/512): mantiene **singolo vertice + 4 raggi** — riconoscibilità minimal a tutte le dimensioni, identità del singolo modulo.
- **Login screen** (ScopedLogin): usa **Schlegel completo** con vertice attivo evidenziato — storytelling esperienziale ("stai entrando nel modulo X del sistema SIDERA").

**Razionale (marketing + design).** Apple, Linear, Vercel, Notion seguono questa convenzione: icone minimali sul telefono, esperienze ricche dentro l'app. L'icona PWA su home screen funziona perché riconoscibile a glance; il login funziona perché contestualizza l'esperienza nel sistema. Inoltre il Schlegel è già aggiornato/manutenuto in `SideraHubView`, riusarlo riduce manutenzione e mantiene coerenza visiva tra Hub e Login.

**Implicazioni.**
- Nuovo componente shared `SideraLogoSchlegel.vue` riutilizzabile in altri contesti (future splash screens, marketing pages, ...).
- Future PWA (NEBULA, NOVA, MAGNETAR, QUASAR) non richiedono nuovi disegni SVG per il login: basta passare lo scope come prop. Le loro icone PWA (singolo vertice + raggi) restano da generare ad-hoc come oggi per pulsar/cepheid/pops.
- `SideraHubView.vue` non è stato refactored (resta con il suo codice complesso e funzionante). Refactoring opzionale per riusare `SideraLogoSchlegel` rimandato a futuro.

---

### 2026-05-18 — Azione 2: POPS promosso a 3ª PWA installabile

**Contesto.** Il piano originale di azione 2 prevedeva manifest statici solo per i moduli SIDERA (PULSAR, CEPHEID), considerando POPS come "non installabile". Durante la conversazione l'utente ha chiarito che POPS **è già usato come webapp mobile dai dipendenti** (interfaccia spedizioni con firma da smartphone), e ha richiesto di mantenerlo installabile come PWA.

**Decisione.** POPS diventa la terza PWA installabile, simmetrica a PULSAR e CEPHEID:
- Scope `/` (root, copre tutti i path POPS: `/`, `/preventivatore`, `/production`, `/delivery`, `/dashboard`, ecc.)
- `start_url: /` (login)
- `name: "POPS — Inglesina"`, `short_name: "POPS"`
- Icone generate da `public/favicon.png` (asset 1024×1024 già esistente)

**Razionale.** POPS ha un caso d'uso mobile reale (LOGISTICA che firma le consegne dal proprio smartphone). Renderlo PWA "vera" elimina ambiguità (oggi i meta tag base puntavano per errore a PULSAR) e dà un'esperienza coerente con gli altri moduli.

**Implicazioni.** L'index.html base ora rappresenta POPS, non più PULSAR. Lo script inline gestisce 3 rami invece di 1. Allineamento simultaneo dei `name` di tutti i manifest (POLARIS azione 5 in piggyback) per coerenza.

---

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
- **2026-05-18** — Azione 1 mergiata (PR #1) e deployata in produzione (Functions + Hosting). Cloud Function `onNewPulsarMessage` con filtro scope live.
- **2026-05-18** — Azione 2 manifest statici implementata in codice (branch `polaris/2-manifest-statici`). Decisione esplicita: POPS promosso a 3ª PWA installabile. Azione 5 (name parlanti) completata in piggyback. Step 2 (HTML separati per scope) rimandato. Deploy + test pendenti.
- **2026-05-18** — Azione 2 fix race iOS PWA: manifest iniettato sempre via script (no hardcoded HTML). Mergiata (PR #4) e deployata in produzione.
- **2026-05-19** — Azione 3 ScopedLogin implementata in codice (branch `polaris/3-scoped-login`). Decisione esplicita: doppia identità (icona PWA single-vertex + login Schlegel completo con vertice attivo). Nuovi componenti `SideraLogoSchlegel.vue` e `ScopedLogin.vue`. Eliminati 2 file legacy (~744 righe duplicate). Deploy + test pendenti.
- **2026-05-19** — Azione 3 affinata con review utente: edges con linearGradient sfumato (replica logo originale), centratura SVG (margin auto), footer richiama SIDERA, wordmark con puntini come stelle lontane (glow + opacity 0.3 + size 0.75). Mergiata (PR #5) e deployata in produzione.
- **2026-05-19** — Azione 4 code splitting implementata in codice (branch `polaris/4-code-splitting`). Firebase modulare split in 4 chunk (core/firestore/functions/messaging). Visualizer aggiunto. Risparmio POPS modesto (~8 KB raw) ma struttura preparata per ottimizzazioni future. Deploy + test pendenti.
- **2026-05-19** — Azione 4 fix dynamic import: `src/firebase.ts` rimosso import statico di `firebase/messaging`; `useNotifications.ts` lazy-load il modulo via `import('firebase/messaging')`. Verifica post-fix: chunk `firebase-messaging` NON più nei `<link rel="modulepreload">` di POPS. Risparmio reale POPS: ~16 KB ogni first load.
- **2026-05-19** — Azione 4 mergiata (PR #6) e deployata in produzione. 5 azioni POLARIS su 7 completate.
- **2026-05-19** — Feature extra (fuori-azioni POLARIS): **CEPHEID Asana-flavored** (PR #8, branch `feature/cepheid-asana`). Introdotta gerarchia Obiettivi → Progetti → (task | milestone | deliverable) con schema retrocompatibile. Nuova collection `obiettivi/` (regole Firestore deployate). Discriminator `tasks/{id}.type` aggiunto alla collection condivisa con SIDERA: filtri lato view in SIDERA TasksView/ProjectBoard per non mostrare milestone/deliverable come task. ProjectBoard SIDERA esteso con 2 view tab Milestone+Deliverable. File POPS toccati: zero. **Mergiata (PR #8) e deployata in produzione** (Hosting + Rules).
- **2026-05-20** — **NEBULA promossa a 4ª PWA installabile** (branch `feature/nebula-pwa`, feature extra ATLAS — ricetta sez. 3). Manifest statico `/public/nebula.webmanifest` (scope `/nebula/`, name "NEBULA — Team Inglesina"). Icone single-vertex generate da `scripts/nebula-icon.svg` (palette `#C46030`, 4 raggi verso QUASAR/NOVA/MAGNETAR/CEPHEID coerenti col Schlegel) → `public/icons/nebula-{180,192,512}.png` via sharp-cli. Ramo `/nebula` aggiunto allo script inline `index.html`. `scopeConfig.ts` aggiornato: `SCOPE_CONFIGS.nebula` ora popolato (mobileNav: Team, `notificationScope: 'nebula'`, `isTopLevelPath`); type `notificationScope` esteso con `'nebula'` (anche in `useNotifications.ts`). Router: nuova rotta `/nebula/login` (ScopedLogin, primary `#B85425`) + `/nebula` (SideraLayout child → NebulaTeamView, name `nebula-team` preservato), `meta: { nebulaScope: true }`. Rotta legacy `/sidera/nebula` **rimossa** (no redirect: bookmark da rigenerare). Guard `beforeEach` esteso con `isNebulaScope` per redirect login fallback. `SideraLayout` desktop sidebar ora legge `SCOPE_CONFIGS.nebula.mobileNav` come single source of truth (parità con pattern CEPHEID). Cloud Function FCM: **non aggiunta** (NEBULA non ha eventi di notifica per ora). File POPS toccati: `index.html` + `src/router/index.ts` (rischio basso — solo aggiunte/rami isolati per `/nebula`). **Sblocca azione 6**: ora siamo a 4 PWA e il refactor `meta.scope` ha trigger reale. Deploy + test PWA reali (iOS/Android Add-to-Home) pendenti.
