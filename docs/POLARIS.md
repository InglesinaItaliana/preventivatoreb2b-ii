# POLARIS

> Roadmap strategica per l'evoluzione strutturale della suite-of-webapps.
> Documento "vivo": va aggiornato dopo ogni step completato o decisione esplicita.

**Ultima revisione:** 2026-05-30
**Stato globale (agg. 2026-06-02):** azioni 1-6 e 9 deployate in produzione. Az.7 differita, Az.8 gated (serve che tutte le 6 PWA siano attive). Az.11 in corso (S1/S2 chiusi via hardening rules own-or-admin; resta la validazione stato iniziale `preventivi`). Restano aperte Az.10 (`useToast` condiviso — prossimo ad alto impatto), Az.12-15. **Azioni 10-15** (piano di maturazione e integrazione dall'audit `docs/ANALISI-MATURITA.md`, 2026-05-30): la suite è coerente (~85%) ma a maturità media ~70%, sotto la soglia 80% per la consegna 1.0. I tre bloccanti trasversali erano Az.10 (`useToast` condiviso), Az.11 (hardening rules — ora parziale) e Az.12 (push uniformi). NEBULA è 4ª PWA installabile, con collaborazione real-time Yjs/CRDT in prod (Fase 6, 2026-05-29). Il modello permessi/ruoli/funzioni (Az.6/9) è documentato in dettaglio in `docs/STELLA-GRAFO.md` §6.

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
| NEBULA | `/nebula/*` | ✅ PWA attiva | Squadra, Documenti wiki, **Archivio file**, **Mezzi** (`docs/NEBULA-FLOTTA-ARCHIVIO.md`). Manifest `/public/nebula.webmanifest`, FCM scope `'nebula'` |
| NOVA | `/sidera/nova/spedizioni` | ☐ Solo view SIDERA | Spedizioni — non ancora PWA |
| 6° modulo | TBD | ☐ Non definito | — |

**Infrastruttura condivisa:**
- Build singolo Vite → unico `dist/` (oggi ~720 KB di JS firebase + vendor sempre caricati)
- Service Worker FCM unico (`public/firebase-messaging-sw.js`) registrato con scope `/`
- Auth Firebase unica per tutti (POPS clienti B2B + team interno PRODUZIONE / LOGISTICA / ADMIN)
- Firestore unico (collections: `chats`, `messages`, `tasks` (con discriminator `type`), `projects`, `obiettivi`, `team`, `clienti`, ...)
- Cloud Functions `europe-west1`, Node 20 (deprecato 2026-04-30 → bumpare a Node 22 entro 2026-10-30)

---

## 2. Roadmap — 8 azioni con priorità

| # | Priorità | Azione | Trigger ideale | Rischio POPS | Stato |
|---|---|---|---|---|---|
| 1 | 🔴 Alta | **FCM token-per-scope** | Prima del prossimo modulo notificato (es. notifiche CEPHEID) | Nessuno | ☑ |
| 2 | 🟠 Media-alta | **Manifest statici per tutti gli scope** (rimuovere generazione VitePWA dinamica) | Quando si può testare iOS standalone a freddo | Basso | ☑ |
| 3 | 🟠 Media-alta | **ScopedLogin componente unificato** | Prima di aggiungere PWA #3 (NEBULA o NOVA) | Nessuno | ☑ |
| 4 | 🟡 Media | **Code splitting raffinato** (firebase modular, visualizer) | Quando si percepiscono rallentamenti mobile | Basso | ☑ |
| 5 | 🟢 Bassa | **`name` manifest più parlanti** | Quando si lavora su uno scope per altri motivi | Nessuno | ☑ (piggyback su azione 2) |
| 6 | 🟢 Bassa | **`meta.scope` unificato nel router guard** | Da 4+ PWA in poi | Medio (test ruoli POPS obbligatori) | ☑ (2026-06-02) |
| 7 | ⚪ Differita | **Separazione deploy POPS vs interno** | Tra 6–12 mesi, se POPS cresce o legal richiede dominio separato | Altissimo | ⏸ |
| 8 | 🟢 Bassa | **Hub Schlegel landing interattiva** (sidebar collassabile + click vertice → sezione) | Quando tutte e 6 le PWA sono attive | Medio (SideraLayout condiviso) | ☐ |
| 9 | 🟠 Media-alta | **Ruoli e permessi granulari** (chi accede a quali moduli/azioni) + robustezza login su cache-miss | Quando si dovranno aprire moduli SIDERA a ruoli operativi | Medio-alto (tocca guard + LoginView POPS) | ☑ (2026-06-02) |
| 10 | 🔴 Alta | **`useToast` condiviso** (feedback errore/successo visibile in tutti i moduli) | Subito — sblocca la maturità percepita di tutta la suite | Basso | ☐ |
| 11 | 🔴 Alta | **Hardening Firestore rules** (`tasks`/`obiettivi` update troppo permissivi) | Prima della consegna 1.0 | Medio (test ruoli) | 🔄 parziale (S1/S2 fatti; resta validazione stato `preventivi`) |
| 12 | 🟠 Media-alta | **Push uniformi cross-modulo** (completa VAPID + assegnazione task/scadenze/mention) | Quando serve notificare oltre PULSAR | Basso (POPS non usa FCM) | ☐ |
| 13 | 🟠 Media-alta | **`@mention` unificato cross-modulo** (PULSAR + CEPHEID, generalizza `UniversalMention` NEBULA) | Dopo Azione 10 | Basso | ☐ |
| 14 | 🟡 Media | **Ricerca globale / Cmd-K** (doc + task + chat cross-modulo) | Quando la suite è percepita come "tante app" | Medio | ☐ |
| 15 | 🟡 Media | **Stream attività consolidato** (vista "All Activity" da `activityLog` già scritto) | Quando serve audit unificato | Basso | ☐ |

**Legenda stato:** ☐ da fare · 🔄 in corso · ☑ fatto · ⏸ rimandato esplicitamente · ❌ scartato

> **Azioni 10-15** nascono dall'audit `docs/ANALISI-MATURITA.md` (2026-05-30). Sono il "piano di maturazione e integrazione" per portare la suite dalla consegna 1.0. Azioni 10-12 = i tre bloccanti trasversali (sotto l'80% di maturità senza). Azione 11 ha forte overlap con Azione 9.

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

### Azione 6 — `meta.scope` unificato 🟢 ✅ COMPLETATA (2026-06-02)

> **Fatto** (FASE A+B, branch `feature/polaris-roles-funzione-first`, merge `d1e65ab`): scope login unificato via `detectScope` (`5e0c975`); routing centralizzato in `src/router/permissions.ts` — **puro TS, no Vue/Firebase** — con `allowedPathsByRole`/`roleFallbackPath`/`isPathAllowedForRole`/`postLoginRoute`, consumato sia dal guard sia da `LoginView` (prima duplicati e disallineati) (`876d5ea`). Test login POPS verificati (cliente/staff/PRODUZIONE→`/production`). Dettaglio canonico: `docs/STELLA-GRAFO.md` §6.

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

### Azione 8 — Hub Schlegel landing interattiva 🟢

**Gate: NON prima che tutte e 6 le PWA (QUASAR, NEBULA, CEPHEID, PULSAR, NOVA, MAGNETAR) siano attive con config completa.** Oggi solo 3 vertici (PULSAR/CEPHEID/NEBULA) hanno `scopeConfig.mobileNav` popolato; gli altri 3 sono placeholder. L'effetto-wow ha senso solo quando ogni vertice porta a una sezione reale.

**Idea (utente, 2026-05-21).** Trasformare l'ingresso in SIDERA in una landing page "effetto wow":
1. Quando si entra su `/sidera` (o si clicca il logo SIDERA), la sidebar **si chiude** e resta solo lo Schlegel interattivo centrato a tutto schermo.
2. Cliccando un **vertice** dello Schlegel, la sidebar **rientra aprendosi sulla sezione corrispondente**, navigando alla **prima voce** del menu di quel modulo (`scopeConfig.mobileNav[0]`).

**Pezzi già esistenti (~70%).**
- `SideraHubView.vue` (`/sidera/hub`) ha già lo Schlegel interattivo a tutto schermo con hit-area per vertice (oggi solo hover → mostra nome+desc, **nessun click→navigazione**).
- `scopeConfig.mobileNav[0]` fornisce la "prima voce" di ogni modulo.
- Le sezioni sidebar per modulo esistono già in `SideraLayout`.

**Soluzione (bozza, da dettagliare a gate raggiunto).**
- Aggiungere stato `collapsed` a `SideraLayout`, **vincolato al solo path `/sidera*`** (non deve toccare il chrome di pulsar/cepheid/nebula/...).
- Transizione CSS: sidebar 220px → 0 (o icon-rail) + Schlegel che scala al centro. È qui il "wow".
- Wire dei click sui vertici: vertice → `router.push(scopeConfig[modulo].mobileNav[0].path)` + espansione sidebar sulla sezione.
- **Decisione aperta**: consolidare `/sidera` e `/sidera/hub` in un solo entry point, oppure tenerli distinti (landing collassata vs cruscotto). Da decidere a gate raggiunto.

**File toccati (previsti).**
- `src/views/sidera/SideraLayout.vue` (stato collapsed + transizioni, vincolato a `/sidera*`)
- `src/views/sidera/SideraHubView.vue` (click handler sui vertici → navigazione)
- Eventuale consolidamento rotte in `src/router/index.ts` (se si fonde hub+cruscotto)

**Rischio POPS.** Nessuno diretto. **Rischio suite: Medio** — `SideraLayout` è il layout condiviso da tutti gli scope; lo stato collassato va isolato a `/sidera*` per non rompere il chrome mobile degli altri moduli.

**Test obbligatori prima del merge.**
- ☐ `/sidera` → sidebar collassata, Schlegel centrato, animazione fluida
- ☐ Click su ciascuno dei 6 vertici → naviga alla prima voce del modulo + sidebar aperta sulla sezione giusta
- ☐ Scope non-sidera (pulsar/cepheid/nebula) → nessuna regressione del chrome (sidebar/bottom-nav/FAB invariati)
- ☐ Mobile-layout (`≤768px` / standalone) → comportamento coerente, niente sidebar collassata fantasma

---

### Azione 9 — Ruoli e permessi granulari 🟠 ✅ COMPLETATA (2026-06-02)

> **Fatto** (FASE C/D/E, branch `feature/polaris-roles-funzione-first`, merge `d1e65ab`): **capabilities dichiarative** (`Capabilities` + `ROLE_CAPABILITIES` + `capabilitiesFor` in `permissions.ts`) + composable `src/composables/sidera/useCan.ts` (super-admin info@ + `isCoreAdmin` ortogonale) — `c90c2c1`; **creazione agente funzione-first** (si sceglie la FUNZIONE → deriva `position`+`category`+`role`; categoria→ruolo, `tecnico` rimosso) — `8108742`, `38d5d78`; **permessi granulari CEPHEID** per ruolo (ADMIN tutto; COMMERCIALE crea progetti; PRODUZIONE solo le proprie; LOGISTICA sola lettura+completa; Obiettivi solo-ADMIN; Smistamento ADMIN+COMMERCIALE) — `ab49028`; **fix login cache-miss** `getTeamDoc` robusto (`metadata.fromCache` ≠ not-found) — `24379a7`. NEBULA → Squadra è sola lettura. Le Firestore rules restano il confine di sicurezza; questo è gating UX. Dettaglio canonico: `docs/STELLA-GRAFO.md` §6.

**Status originale (storico): da fare (non ora — richiesta utente 2026-05-22 di pianificare, non eseguire).**

**Problema.** Il modello attuale di accesso è grossolano e basato su un solo campo `team/{email}.role` (`ADMIN` | `PRODUZIONE` | `LOGISTICA` | ...) con gating per **allowlist di path** nel router guard (`router/index.ts:244-251`). Conseguenze osservate:
- Un utente `PRODUZIONE` (es. Daniel) **non può accedere ai moduli SIDERA**: `/sidera` lo rimanda a `/delivery`, `/production/sidera` mostra solo lo sfondo col logo (rotta non valida per quel ruolo → layout senza contenuto). Non c'è un modo dichiarativo per dire "questo ruolo vede QUASAR e CEPHEID ma non NOVA".
- Aggiungere un modulo o cambiare chi lo vede richiede di toccare a mano `allowedPaths` nel guard.
- Non esiste granularità sotto il modulo (es. "vede CEPHEID ma sola lettura").

**Soluzione strutturale (bozza, da dettagliare).**
- Modello permessi dichiarativo: mappa ruolo → moduli/azioni consentiti (es. `permissions.ts` o doc Firestore `roles/{role}` con `allowedScopes[]` + capability). Si appoggia/estende l'allowlist di Azione 6.
- Guard router consuma la mappa invece di `if (role === 'PRODUZIONE')` hardcoded.
- Possibile separazione tra "ruolo operativo POPS" (PRODUZIONE/LOGISTICA/CLIENTE) e "accessi suite SIDERA" (per-modulo), oggi mescolati.

**Robustezza login (sotto-problema scoperto 2026-05-22).** `LoginView.vue` (POPS) tratta un **cache-miss come utenza inesistente**: con `persistentLocalCache` + `experimentalForceLongPolling` (`src/firebase.ts`), se la connessione Firestore è impedita/lenta `getDoc(doc(db,'team',email))` ripiega sulla cache locale vuota e ritorna `exists() === false` **senza lanciare**, cadendo nel ramo finale → *"Utenza non configurata. Contattaci su info@inglesinaitaliana.it"* (`LoginView.vue:104-108`). Riproducibile su **localhost** (login Daniel fallisce) mentre in **produzione/incognito** funziona (cache pulita + connessione ok). Fix possibile: distinguere `snap.metadata.fromCache` dal not-found reale (es. `getDocFromServer`, o ritentare/forzare server prima di dichiarare "non configurata"). **Innocuo in produzione**, ma fragile e fuorviante in dev/connessione scarsa.

**File toccati (previsti).**
- `src/router/index.ts` (guard) — overlap con Azione 6 (`meta.scope` unificato): conviene farle insieme o in sequenza.
- Nuovo `src/router/permissions.ts` (o doc Firestore `roles/`) per la mappa ruolo→permessi.
- `src/views/LoginView.vue` (POPS) per la robustezza cache-miss.
- Eventuali regole Firestore se i permessi diventano dato server.

**Rischio POPS.** Medio-alto — tocca il guard e il `LoginView` POPS (login B2B clienti + team). Test ruoli obbligatori (vedi checklist Azione 6).

**Note.** Sovrapposizione forte con Azione 6: valutare di accorparle. Nessun codice scritto — solo pianificazione (allarme login Daniel del 2026-05-22 rientrato: era artefatto localhost, produzione OK).

---

### Azione 10 — `useToast` condiviso 🔴

**Problema.** In tutti e 4 i moduli i fallimenti async finiscono solo in `console.error`: invio messaggio (PULSAR), create/update/delete (CEPHEID), date scheduling (QUASAR), save/share doc (NEBULA). **L'utente non riceve mai feedback visibile** se un'operazione fallisce per rete o permessi. È il singolo intervento con più impatto: eleva la maturità percepita di tutta la suite in un colpo solo.

**Soluzione strutturale.**
- Nuovo `src/composables/shared/useToast.ts` (singleton reattivo: coda toast `{ id, type: 'error'|'success'|'info', text, timeout }`).
- Renderer montato una volta nella shell (`SideraLayout.vue`) → visibile in tutti gli scope, rispetta safe-area iOS.
- Microcopy via LYRA (vedi `docs/LYRA.md`). Default error → "Qualcosa è andato storto. Riprova."
- Sostituire i `console.error` UX-relevant con `toast.error(...)` (mantenere il log per debug).

**File toccati.** `src/composables/shared/useToast.ts` (nuovo), `SideraLayout.vue` (renderer), poi capillarmente nei catch delle view dei 4 moduli.

**Rischio POPS.** Basso (POPS non monta SideraLayout; eventuale riuso opzionale).

**Test.** ☐ Errore di rete simulato in ogni modulo → toast visibile · ☐ Toast non copre la bottom-nav mobile · ☐ Auto-dismiss + dismiss manuale.

---

### Azione 11 — Hardening Firestore rules 🔴 🔄 PARZIALE (2026-06-02)

> **Fatto (S1/S2)** — `c1bece5`, branch `feature/permessi-hardening-organigramma`: `tasks/{tid}` e `obiettivi/{oid}` `update` ristretti a **own-or-admin** (`createdBy`/`assignee(s)`/`isAdmin()`), chiudendo il "qualunque loggato modifica task di chiunque". **Resta (S3):** validazione dello stato iniziale dei `preventivi` create (`firestore.rules:57`). Dettaglio in `docs/STELLA-GRAFO.md` §7 (changelog hardening).

**Problema.** Verificato in audit (`docs/ANALISI-MATURITA.md` §3):
- `tasks/{tid}` root (`firestore.rules:115`): `allow update: if request.auth != null` → **qualunque utente loggato può modificare/completare/riassegnare task di chiunque**.
- `obiettivi/{oid}` (`firestore.rules:161`): stesso problema sugli obiettivi.
- `preventivi/{id}` create (`firestore.rules:57`): nessuna validazione di stato.

Rischio reale **basso** (team interno fidato) ma inaccettabile per una consegna 1.0.

**Soluzione strutturale.** Vincolare `update` a `createdBy` / `assignee(s)` / `isAdmin()`; validare lo stato iniziale dei preventivi. Forte overlap con **Azione 9** (ruoli granulari): valutare di farle insieme.

**File toccati.** `firestore.rules`. Possibili `firestore.indexes.json` se servono query nuove.

**Rischio POPS.** Medio — `preventivi` è collection POPS. Test ruoli obbligatori (Admin/Prod/Logistica/Cliente/Owner) prima del deploy.

**Test.** ☐ Utente A non può completare task di utente B · ☐ Owner/admin sì · ☐ Preventivo non creabile con stato ≠ DRAFT · ☐ Regressione POPS (ciclo preventivo completo).

---

### Azione 12 — Push uniformi cross-modulo 🟠

**Problema.** Oggi solo PULSAR notifica (chat). `VAPID_KEY` è hardcoded in `useNotifications.ts:31` e le push per moduli ≠ PULSAR non sono mai state completate (vedi memoria "SIDERA edit + FCM"). Mancano: assegnazione task (CEPHEID), scadenze imminenti, mention (NEBULA `notifyOnMention` esiste ma isolata).

**Soluzione strutturale.** Completare la configurazione VAPID; estendere il pattern FCM scope-gated (Azione 1) a CEPHEID/NEBULA: Cloud Function trigger su `tasks` assegnati + scadenze + mention. Un solo servizio notifiche per tutta la suite.

**File toccati.** `src/composables/shared/useNotifications.ts`, `src/functions/index.ts` (nuovi trigger), `scopeConfig.ts` (notificationScope già predisposto).

**Rischio POPS.** Basso (POPS non usa FCM).

**Test.** ☐ Assegnazione task → push al solo assegnatario, scope corretto · ☐ Mention NEBULA → push · ☐ No push duplicate su utente con più PWA installate.

---

### Azione 13 — `@mention` unificato cross-modulo 🟠

**Problema.** Il sistema di menzione + notifica esiste solo in NEBULA-DOCS (`UniversalMention` / `notifyOnMention`). PULSAR ha un `@mention` separato (autocomplete locale, nessuna notifica strutturata); CEPHEID non ne ha.

**Soluzione strutturale.** Generalizzare `UniversalMention` di NEBULA in infrastruttura condivisa (persona/task/progetto/documento) e adottarla in PULSAR chat e nei commenti/descrizioni CEPHEID → un'unica logica di menzione e notifica per tutta la suite. Dipende da Azione 12 (canale notifiche).

**File toccati.** Estrazione del nodo/parser mention da `src/views/nebula/docs/` a shared; adozione in PULSAR + CEPHEID.

**Rischio POPS.** Basso.

**Test.** ☐ `@persona` in chat PULSAR → notifica · ☐ Mention render coerente nei 3 moduli · ☐ Click mention → naviga all'entità.

---

### Azione 14 — Ricerca globale / Cmd-K 🟡

**Problema.** Nessuna ricerca trasversale: per trovare un doc, un task o una chat bisogna sapere in quale modulo cercare. È ciò che fa percepire la suite come "tante app" invece di un prodotto unico.

**Soluzione strutturale.** Command palette (Cmd-K / FAB mobile) che cerca su `nebulaDocs` + `tasks`/`projects`/`obiettivi` + `chats`/`messages`. Indice lato client per i dati già caricati; valutare un indice server (Cloud Function) se i volumi crescono.

**File toccati.** Nuovo componente shared palette montato in `SideraLayout.vue`; query per-collection con rispetto delle ACL.

**Rischio POPS.** Medio (montato nella shell condivisa; gating scope).

**Test.** ☐ Ricerca trova entità nei 3 moduli · ☐ Risultati rispettano permessi (no doc privati altrui) · ☐ Navigazione da risultato.

---

### Azione 15 — Stream attività consolidato 🟡

**Problema.** `activityLog` è già denormalizzato dalle Cloud Functions (create/update task/progetto/preventivo) e QUASAR ne mostra un widget, ma manca una vista "tutto ciò che è successo nella suite" cross-modulo.

**Soluzione strutturale.** Vista "All Activity" che legge `activityLog` con filtri per modulo/attore/tipo. Sfrutta dati già scritti → sforzo prevalentemente UI. Naturale collocazione: QUASAR (tetto analitico) o sezione CORE.

**File toccati.** Nuova view (probabile QUASAR), riuso `useActivityLog`. Eventuale estensione dei trigger per coprire eventi NEBULA/PULSAR non ancora loggati.

**Rischio POPS.** Basso.

**Test.** ☐ Eventi dei 4 moduli compaiono · ☐ Filtri funzionano · ☐ Fallback attore = "Inglesina Italiana" coerente con widget esistente.

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
- **2026-05-21** — Aggiunta **Azione 8 — Hub Schlegel landing interattiva** alla roadmap (🟢 bassa priorità). Idea utente: entrare su `/sidera` collassa la sidebar lasciando lo Schlegel interattivo a tutto schermo; click su un vertice riapre la sidebar sulla sezione del modulo (prima voce del menu). Gate esplicito: **non implementare prima che tutte e 6 le PWA siano attive** (oggi solo 3 vertici hanno config completa). Nessun codice scritto — solo pianificazione.
- **2026-05-30** — Aggiunte **Azioni 10-15** (piano di maturazione e integrazione) dall'audit `docs/ANALISI-MATURITA.md`. Coerenza suite ~85%, maturità media ~70% (sotto la soglia 80% per la consegna 1.0). Az.10 `useToast` condiviso 🔴, Az.11 hardening rules 🔴 (verificato: `tasks:115`/`obiettivi:161` update troppo permissivi — overlap con Az.9), Az.12 push uniformi 🟠 (completa VAPID), Az.13 @mention unificato 🟠, Az.14 ricerca globale/Cmd-K 🟡, Az.15 stream attività consolidato 🟡. Az.10-12 = i tre bloccanti trasversali. Nessun codice scritto — solo pianificazione + audit.
- **2026-05-22** — Aggiunta **Azione 9 — Ruoli e permessi granulari** alla roadmap (🟠 media-alta). Nasce dall'indagine su un presunto blocco login di Daniel (`pastorindaniel@gmail.com`, ruolo `PRODUZIONE`): **allarme rientrato** — in produzione (`b2b.inglesinaitaliana.it` e `preventivatoreb2b-ii.web.app`, stesso progetto/bundle) il login funziona; il fallimento *"Utenza non configurata"* era solo su **localhost**, artefatto di `getDoc(team)` che su cache-miss ritorna `exists()===false`. Emersi due temi da gestire (non ora): (1) permessi granulari per ruolo/modulo — oggi `PRODUZIONE` non accede ai moduli SIDERA, gating coarse via allowlist di path nel guard; (2) robustezza `LoginView.vue` sul cache-miss. Forte overlap con Azione 6 (valutare accorpamento). Nessun codice scritto — solo pianificazione.
- **2026-06-02** — **Azione 6 + Azione 9 implementate e deployate** (branch `feature/polaris-roles-funzione-first`, merge `d1e65ab`; accorpate come anticipato dall'overlap). FASE A — scope login unificato via `detectScope` (`5e0c975`). FASE B — routing centralizzato in `src/router/permissions.ts` (puro TS: `allowedPathsByRole`/`roleFallbackPath`/`isPathAllowedForRole`/`postLoginRoute`), consumato da guard **e** LoginView (`876d5ea`) → **Az.6 ☑**. FASE C — capabilities dichiarative (`Capabilities`/`ROLE_CAPABILITIES`/`capabilitiesFor`) + composable `useCan` (`c90c2c1`). FASE D — creazione agente **funzione-first** (FUNZIONE → `position`+`category`+`role`; categoria→ruolo, `tecnico` rimosso; collezione `funzioni` editabile) (`8108742`, `38d5d78`). FASE E — fix login cache-miss `getTeamDoc` (`metadata.fromCache` ≠ not-found) (`24379a7`). Permessi granulari CEPHEID per ruolo (`ab49028`); NEBULA → Squadra sola lettura → **Az.9 ☑**. Deploy a fasi con verifica POPS (login cliente/staff OK, PRODUZIONE→`/production`). Modello canonico in `docs/STELLA-GRAFO.md` §6.
- **2026-06-02** — **Azione 11 parziale** (`c1bece5`, branch `feature/permessi-hardening-organigramma`). Hardening Firestore rules: `tasks/{tid}` e `obiettivi/{oid}` `update` ristretti a **own-or-admin** (`createdBy`/`assignee(s)`/`isAdmin()`) — chiusi S1/S2 dell'audit. **Resta S3**: validazione dello stato iniziale dei `preventivi` create. Cambio rules deployato; regressione POPS verificata (ciclo preventivo). → **Az.11 🔄 parziale**. Cfr. `docs/STELLA-GRAFO.md` §7.
