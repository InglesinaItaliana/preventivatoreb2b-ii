# ATLAS

> Manuale architetturale e ricette per la suite-of-webapps `preventivatoreb2b-ii`.
> "Come si fa" quando aggiungi una nuova PWA, un nuovo modulo, o componenti condivisi.

Documenti correlati:
- **`POLARIS.md`** — roadmap evolutiva (cosa va fatto, perché, stato)
- **`WORKFLOW.md`** — processo (git, GitHub, Firebase, deploy)
- **`ATLAS.md`** ← *sei qui* — pattern e ricette (come si fa, replicabile)

---

## 0. Cos'è ATLAS

ATLAS è il **manuale di costruzione** della suite. POLARIS dice **cosa** è stato/sarà fatto, WORKFLOW dice **come si lavora con la repo**, ATLAS dice **come è organizzato il codice e come si replica un pattern**.

Quando aggiungi una nuova PWA mobile (es. NEBULA, NOVA), una nuova vista SIDERA, un nuovo componente shared — apri ATLAS alla sezione giusta e segui la ricetta. Niente da reinventare.

---

## 1. Filosofia suite-of-webapps

### Idea fondamentale

Una **singola codebase Vite/Vue** che produce **un singolo build** che serve:
- **POPS** — webapp B2B + gestionale interno, installabile come PWA con scope `/`
- **SIDERA** — shell desktop interna per moduli galattici (`/sidera/*`)
- **N moduli mobile** — ognuno una PWA installabile con scope proprio (`/pulsar/`, `/cepheid/`, futuro `/nebula/`, ...)

Tutti questi prodotti condividono Auth Firebase, Firestore, Cloud Functions, Service Worker — ma sono **identificati come app distinte** dal punto di vista dell'utente (icone separate su home screen, scope PWA isolati, manifest dedicati).

### Perché funziona

1. **Build singolo** = un solo Vite, un solo `dist/`, un solo deploy
2. **Manifest multipli statici** + swap runtime in `index.html` = ogni scope ha sua identità PWA
3. **Composables/components shared** = zero duplicazione di codice business (auth, firestore, FCM)
4. **Route-level lazy loading** = ogni utente scarica solo i chunk che servono al suo scope

### Cosa NON è suite-of-webapps

- Non è un monorepo (è una singola repo non packagizzata)
- Non sono micro-frontend (niente caricamento dinamico di bundle esterni)
- Non sono SaaS multi-tenant (è un singolo tenant Firebase con un singolo Auth)

---

## 2. Convenzioni di nomenclatura

### Moduli galattici

I moduli interni hanno **nomi di oggetti astronomici**:

| Modulo | Tipo astronomico | Funzione | Colore |
|---|---|---|---|
| QUASAR | Quasar (oggetto galattico luminosissimo) | Analytics · KPI · Business Intelligence | `#98C0D0` |
| NEBULA | Nebula (gas interstellare) | HR · Anagrafiche · Documentale | `#C46030` |
| CEPHEID | Cefeide (stella variabile) | Project Management · Workflow · Task | `#D4A020` |
| PULSAR | Pulsar (stella di neutroni) | Chat · Comunicazione · Collaborazione | `#3AAF98` |
| NOVA | Nova (esplosione stellare) | Logistica · Supply Chain · Spedizioni | `#8FAB35` |
| MAGNETAR | Magnetar (pulsar magnetica) | CRM · Lead · Pipeline Commerciale | `#B06842` |
| SIDERA | "Stelle" (latino, generico) | Shell desktop unificata | `#D4C498` (oro tenue) |

Per **estensioni future**: oggetti astronomici stabili e riconoscibili. Evitare nomi confusi (es. "BLACK HOLE" → troppo generico) o offensivi.

### Branch naming

| Pattern | Esempio | Uso |
|---|---|---|
| `polaris/<n>-<slug>` | `polaris/3-scoped-login` | Azioni della roadmap POLARIS |
| `feature/<slug>` | `feature/nova-spedizioni-firma` | Feature nuova |
| `fix/<slug>` | `fix/delivery-stati-bloccati` | Bug fix |
| `chore/<slug>` | `chore/bump-functions-runtime` | Manutenzione, no impatto utente |
| `refactor/<slug>` | `refactor/auth-guard` | Refactor senza nuove feature |
| `exp/<slug>` | `exp/dark-mode` | Esperimento (può essere scartato) |
| `docs/<slug>` | `docs/atlas-update` | Solo documentazione |

Lowercase, niente accenti, niente spazi. Branch corti (< 5 giorni di vita ideali).

### Scope dei path (router + manifest)

| Scope | Path | Tipo |
|---|---|---|
| POPS (root) | `/` | Default catch-all. Webapp B2B + gestionale + PWA installabile |
| SIDERA | `/sidera/*` | Solo desktop, shell interna |
| PULSAR | `/pulsar/*` | PWA mobile |
| CEPHEID | `/cepheid/*` | PWA mobile |
| futuro NEBULA | `/nebula/*` | PWA mobile (oggi solo vista SIDERA) |
| futuro NOVA | `/nova/*` | PWA mobile (oggi `/sidera/nova/spedizioni`) |

**Regola**: ogni scope mobile-installable ha **path proprio**, **manifest proprio**, **layout proprio**.

### Classi CSS

Convenzione prefisso per identificare il proprietario:
- `p-*` — PulsarLayout interno (es. `p-shell`, `p-brand-text`)
- `c-*` — CepheidLayout interno
- `s-*` — SideraLayout/Sidera variables (CSS custom properties: `--s-text`, `--s-border-mid`)
- `sl-*` — ScopedLogin (componente shared, `sl` = "scoped-login")
- `sls-*` — SideraLogoSchlegel (componente shared)
- `hv-*` — HubView (SideraHubView interno)
- `bv-*` — BoardView (ProjectBoard interno)
- `pd-*` — ProjectDetail (Cepheid)

### File / cartelle Vue

```
src/
├── views/
│   ├── <scope>/         # views scope-specifiche (pulsar/, cepheid/, sidera/, ...)
│   └── shared/          # views generiche riusabili (es. ScopedLogin.vue)
├── components/
│   ├── <scope>/         # components scope-specifici
│   └── shared/          # components generici (es. SideraLogoSchlegel.vue)
├── composables/
│   ├── <scope>/         # composables scope-specifici
│   └── shared/          # composables generici (es. useNotifications.ts)
```

**Regola d'oro**: se un componente/composable è usato da 2+ scope, vive in `shared/`. Se è solo di uno scope, sta in quel scope.

### Memoria persistente (per Claude/AI agent)

Tutta la documentazione vive in `docs/` (eccetto `README.md` in root, convenzione GitHub):
- `docs/POLARIS.md` — roadmap
- `docs/WORKFLOW.md` — processo
- `docs/ATLAS.md` — manuale (questo file)
- `docs/POPSnextstep.md` — roadmap POPS B2B (separata da POLARIS)
- `docs/blueprint.md` · `docs/INSTRUCTIONS.md` · `docs/GEMINI.md` — documenti storici/strumentali
- `README.md` (root) — landing page del repo per GitHub

---

## 3. 🚀 Ricetta — Aggiungere una nuova PWA mobile

Esempio: vogliamo aggiungere **NEBULA** come PWA installabile (oggi è solo `src/views/nebula/NebulaTeamView.vue` dentro SIDERA).

### Step 1 — Branch
```bash
git checkout -b feature/nebula-pwa main
```

### Step 2 — Icona PWA (single-vertex stile pulsar/cepheid)

Crea SVG sorgente coerente con il pattern degli altri:

```
scripts/nebula-icon.svg
  - 1024×1024 viewBox
  - vertice corrispondente al modulo NEBULA (coord 155,400 nello Schlegel SIDERA)
  - 4 raggi che escono verso gli altri vertici connessi (v1v2, v2v3, v2v5, v2v6)
  - palette: #C46030 (arancio bruciato, vedi Sez. 2 colori moduli)
  - alone radiale + cerchi concentrici come gli altri
```

Genera le 3 dimensioni con sharp-cli:
```bash
npx sharp-cli --input scripts/nebula-icon.svg --output public/icons/nebula-180.png resize 180 180
npx sharp-cli --input scripts/nebula-icon.svg --output public/icons/nebula-192.png resize 192 192
npx sharp-cli --input scripts/nebula-icon.svg --output public/icons/nebula-512.png resize 512 512
```

### Step 3 — Manifest statico

`public/nebula.webmanifest`:
```json
{
  "name": "NEBULA — Team Inglesina",
  "short_name": "NEBULA",
  "description": "HR · Anagrafiche · Documentale Inglesina",
  "theme_color": "#FFFFFF",
  "background_color": "#FFFFFF",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/nebula/",
  "scope": "/nebula/",
  "id": "/nebula/",
  "icons": [
    { "src": "/icons/nebula-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/nebula-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### Step 4 — Aggiungi swap manifest in `index.html`

Nel blocco `<script>` inline, aggiungi un ramo per NEBULA:
```javascript
} else if (path.indexOf('/nebula') === 0) {
  addManifest('/nebula.webmanifest');
  addAppleIcons('/icons/nebula', null);
  if (titleMeta) titleMeta.setAttribute('content', 'NEBULA');
}
```

### Step 5 — Layout NEBULA

`src/views/nebula/NebulaLayout.vue` (copia struttura da `PulsarLayout.vue` o `CepheidLayout.vue`):
- Sidebar/bottom nav scope-specifica
- `display-mode: standalone` detection per nascondere cross-link a SIDERA
- `useNotifications('nebula')` (vedi sez. 4)

### Step 6 — Shell (wrapper desktop vs mobile)

`src/views/nebula/NebulaShell.vue` (copia da `PulsarShell.vue` / `CepheidShell.vue`):
- Se desktop browser → monta `SideraLayout`
- Se PWA standalone OR mobile viewport → monta `NebulaLayout`

### Step 7 — Rotte router

In `src/router/index.ts`:
```typescript
{
  path: '/nebula/login',
  name: 'nebula-login',
  component: () => import('../views/shared/ScopedLogin.vue'),
  props: {
    scope: 'nebula',
    primaryColor: '#C46030',
    title: 'NEBULA',
    tagline: 'HR · Anagrafiche · Documentale',
    redirectPath: '/nebula',
  },
  meta: { nebulaScope: true }
},
{
  path: '/nebula',
  component: () => import('../views/nebula/NebulaShell.vue'),
  meta: { requiresAuth: true, nebulaScope: true },
  children: [
    { path: '', name: 'nebula-home', component: () => import('../views/nebula/NebulaHomeView.vue') },
    // altre child route...
  ]
}
```

Nel guard `beforeEach`, aggiungi:
```typescript
const isNebulaScope = to.matched.some(r => r.meta.nebulaScope);
// ... usa nei redirect
```

(Quando arriverà il 4° modulo PWA, POLARIS azione 6 si attiverà naturalmente — unifichiamo con `meta.scope: 'nebula'`).

### Step 8 — Cloud Function FCM (se NEBULA ha notifiche)

In `src/functions/index.ts`, copia il pattern di `onNewPulsarMessage`:
```typescript
exports.onNewNebulaEvent = functions
  .region('europe-west1')
  .firestore.document('nebula-events/{eventId}')
  .onCreate(async (snap, context) => {
    // ... logica
    // Filtra fcmTokens per scope ∈ {'nebula', 'sidera'}
    // (vedi sez. 4 per il pattern token-per-scope)
  });
```

### Step 9 — Update POLARIS.md

Nuovo "modulo NEBULA promosso a PWA" come decisione esplicita. Aggiorna sezione 1 (snapshot architettura).

### Step 10 — Workflow standard

Commit → push → PR → preview channel → test → merge → deploy. Vedi `WORKFLOW.md`.

**Tempo stimato**: 2-4 ore per una PWA semplice (no notifiche). 4-6 ore se serve Cloud Function FCM dedicata.

---

## 4. FCM push notifications — token-per-scope pattern

### Schema dati

Token salvati in `team/{email}.fcmTokens`:
```typescript
{
  "TOKEN_ABC...": {
    ts: Timestamp,          // serverTimestamp al momento della scrittura
    scope: 'pulsar' | 'cepheid' | 'sidera' | 'nebula' | ...,
    ua?: string             // navigator.userAgent (max 120 char, per debug)
  }
}
```

**Scope speciale `'sidera'`** = wildcard desktop. I token con `scope: 'sidera'` ricevono notifiche di TUTTI i moduli (perché il desktop è agnostico).

**Retrocompatibilità**: se un valore è un `Timestamp` nudo (formato legacy), trattalo come `scope: 'pulsar'` (default storico).

### Lato client

Da qualsiasi Layout PWA:
```typescript
import { useNotifications } from '../../composables/shared/useNotifications'

const { requestPermission, notify, setupForegroundMessages } = useNotifications('nebula')

onMounted(async () => {
  await requestPermission()
  await setupForegroundMessages()
})
```

Il composable gestisce: VAPID key, `getMessaging()`, token registration in Firestore con il giusto scope, prune dei token stale (>7gg), foreground listener.

### Lato Cloud Function

Pattern per ogni nuova Cloud Function che invia push allo scope X:
```typescript
const tokensMap = teamSnap.data()?.fcmTokens || {};
for (const [tk, val] of Object.entries(tokensMap)) {
  if (val && typeof val === 'object' && 'scope' in (val as Record<string, unknown>)) {
    const scope = (val as { scope?: string }).scope;
    if (scope === 'X' || scope === 'sidera') tokens.push(tk);  // 'X' = scope corrente + sidera wildcard
  } else {
    // Legacy timestamp nudo → default 'pulsar'
    if ('X' === 'pulsar') tokens.push(tk);
  }
}
```

### SW background — suppressione "stesso chat aperta"

Il Service Worker `public/firebase-messaging-sw.js` controlla se una finestra/PWA è già visibile sulla URL target prima di mostrare notifica:
```javascript
const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
const alreadyHere = wins.some(w =>
  w.visibilityState === 'visible' && new URL(w.url).pathname === targetUrl
)
if (alreadyHere) return  // utente già lì, niente notifica duplicata
```

### Cosa NON deve fare la Cloud Function

- ❌ Inviare `notification: { title, body }` top-level (SDK FCM mostrerebbe la notifica E chiamerebbe `onBackgroundMessage` → notifica doppia)
- ✅ Solo `data: { title, body, url, chatId, ... }` — il SW gestisce showNotification

### Riferimenti
- POLARIS azione 1 — introduzione token-per-scope
- POLARIS azione 1 fix notifiche — soppressione su URL target
- `src/composables/shared/useNotifications.ts`
- `src/functions/index.ts:onNewPulsarMessage` (pattern di riferimento)

---

## 5. Logo dinamico Schlegel — uso e estensione

### Cosa è

`src/components/shared/SideraLogoSchlegel.vue`: diagramma Schlegel dell'ottaedro proiettato (6 vertici, 12 edges) con prop `activeScope`. Il vertice attivo si "accende" col colore del modulo, gli edges connessi si illuminano con gradient sfumato.

Stesse coordinate di `SideraHubView.vue` → coerenza visiva tra Hub e ogni Login.

### Uso

```vue
<SideraLogoSchlegel :active-scope="'pulsar'" :size="280" />
```

Props:
- `activeScope: 'quasar' | 'nebula' | 'cepheid' | 'pulsar' | 'nova' | 'magnetar'` — quale vertice accendere
- `size?: number` — larghezza in px (default 280, height calcolato proporzionalmente 1.42:1)

### Casi d'uso attuali

- `ScopedLogin.vue` (login PWA) — vertice = scope del login

### Casi d'uso potenziali futuri

- Splash screen all'apertura PWA
- Marketing landing pages
- Loading state di "navigazione tra moduli"
- Email signature visuale

### Estendere a nuovo modulo

Le 6 posizioni nello Schlegel sono **fisse** (sono i 6 vertici dell'ottaedro). Se aggiungi NEBULA o NOVA come PWA, NON serve modificare `SideraLogoSchlegel` — i vertici esistono già, basta passare `activeScope: 'nebula'`.

Se mai aggiungerai un 7° modulo... beh, l'ottaedro ne ha 6. Bisognerà cambiare il poliedro (es. icosaedro a 12 vertici). Refactoring più consistente.

### Riferimenti
- POLARIS azione 3 — decisione "doppia identità" (icona PWA single-vertex + login Schlegel)
- `src/views/sidera/SideraHubView.vue` — usa lo stesso pattern (ciclico)

---

## 6. Code splitting & lazy loading

### Pattern manualChunks Firebase

In `vite.config.ts`:
```typescript
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('firebase/messaging') || id.includes('@firebase/messaging')) return 'firebase-messaging'
    if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) return 'firebase-firestore'
    if (id.includes('firebase/functions') || id.includes('@firebase/functions')) return 'firebase-functions'
    if (id.includes('firebase') || id.includes('@firebase')) return 'firebase-core'
    return 'vendor'
  }
}
```

### Lazy import per moduli pesanti

**Mai** importare staticamente moduli grandi nei file shared. Esempio negativo (anti-pattern):
```typescript
// ❌ src/firebase.ts
import { getMessaging } from 'firebase/messaging'  // trascina chunk in tutti i preload
export const messaging = getMessaging(app)
```

Pattern corretto:
```typescript
// ✅ src/composables/shared/useNotifications.ts
let messagingModulePromise: Promise<typeof import('firebase/messaging')> | null = null
function loadMessagingModule() {
  if (!messagingModulePromise) {
    messagingModulePromise = import('firebase/messaging')  // dynamic import
  }
  return messagingModulePromise
}
```

Il modulo viene caricato solo quando `useNotifications` viene effettivamente invocato (PulsarLayout, CepheidLayout, SideraLayout). POPS non lo carica.

### Bundle analyzer

```bash
ANALYZE=true npm run build
open dist/stats.html
```

Vedi quali moduli compongono ogni chunk. Utile per identificare:
- Dipendenze inaspettate (es. POPS che carica un componente PULSAR per via di import sbagliato)
- Pacchetti pesanti che potrebbero essere splittati
- Codice duplicato in più chunk

### Route-level lazy

Già fatto via dynamic import nel router:
```typescript
component: () => import('../views/pulsar/PulsarShell.vue')
```

Vite/Rollup genera chunk separati per ogni route → caricati solo se l'utente naviga lì.

### Riferimenti
- POLARIS azione 4
- `vite.config.ts:manualChunks`
- `package.json:devDependencies:rollup-plugin-visualizer`

---

## 7. Mobile-first design

### Layout PWA standalone

Ogni `XxxLayout.vue` deve:
1. Detectare `display-mode: standalone` per nascondere cross-link a SIDERA (se PWA installata standalone):
```typescript
const isStandalone = ref(false)
let standaloneMql: MediaQueryList | null = null
function syncStandalone() {
  isStandalone.value =
    standaloneMql?.matches === true ||
    (window.navigator as any).standalone === true  // iOS legacy
}
onMounted(() => {
  standaloneMql = window.matchMedia('(display-mode: standalone)')
  syncStandalone()
  standaloneMql.addEventListener('change', syncStandalone)
})
```

2. Usare `env(safe-area-inset-*)` per padding su device con notch/dynamic island:
```css
.x-shell {
  padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
}
```

3. Disabilitare zoom pinch indesiderato via meta `viewport`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

(Già in `index.html`.)

### Sphere background

Pattern shared per login + hub (atmosfera "spaziale"):
- 3-4 `<div>` cerchi con `border-radius: 50%`, `position: absolute`
- `filter: blur(95-125px)`, `opacity: 0` → `1` al mount
- Background `rgba(...)` derivato dal palette dello scope
- Animazione `@keyframes` di drift lento (24-37s)

Esempio: vedi `ScopedLogin.vue:.sl-bg .sl-sphere`.

### Bottom nav mobile

Pattern "pillola" 3-4 azioni:
- Position fixed bottom
- Background tinted
- Pillola attiva con `accent` colore scope
- Icon Material Symbols + label

Esempio: `PulsarLayout.vue:.p-bottom-nav`, `CepheidLayout.vue:.c-bottom-nav`.

### FAB contestuale (Floating Action Button)

Per azioni primarie scope-specifiche (es. "nuova chat", "nuova azione"):
- Provide/inject del trigger ai children
- SessionStorage cross-route fallback per "voglio aprire X dopo aver navigato a Y"

Esempio: `CepheidLayout.vue` con `provide('cepheid-new-task-tick', ref(0))`.

---

## 8. Doppia identità — icona PWA vs login

### Decisione di design

| Contesto | Logo |
|---|---|
| Icona PWA installata (manifest icons 180/192/512) | **Singolo vertice + 4 raggi** (riconoscibilità minimal, stile Apple) |
| Login screen (`ScopedLogin`) | **Schlegel completo con vertice attivo** (storytelling sistema) |
| Hub SIDERA desktop (`SideraHubView`) | **Schlegel completo ciclico** (esplora i moduli) |
| Header/wordmark in-app | Solo testo + brand-icon piccola (es. cerchio + raggi 32x32) |

### Razionale (marketing/UX)

Pattern Apple/Linear/Vercel/Notion:
- **Sul telefono**: icone minimal, riconoscibili a glance
- **Dentro l'app**: esperienze contestualizzate ricche

Conseguenza: l'utente percepisce "PULSAR è una sua app distinta MA fa parte del sistema SIDERA". Comunichi sia prodotto che ecosistema.

### Quando si crea una nuova PWA

1. Disegna **icona dedicata** stile single-vertex (Step 2 della ricetta Sez. 3) — riconoscibile su home screen
2. NON disegnare un logo dedicato per la login — usa **`<SideraLogoSchlegel :active-scope="'nuovomod'" />`** automaticamente

### Riferimenti
- POLARIS azione 3 sez. 4 Decisioni esplicite — "doppia identità"

---

## 9. Test su preview channel — workflow

### Quando

Sempre, prima di deploy in produzione. Niente eccezioni.

### Come

```bash
# 1. build pulito da branch in sviluppo
npm run build

# 2. preview channel (URL temporaneo, scade 7-30 giorni)
firebase hosting:channel:deploy <slug> --expires 7d
# Output: https://preventivatoreb2b-ii--<slug>-<hash>.web.app
```

Vedi `WORKFLOW.md` sez. 6 per dettagli sui Preview Channels.

### Test base PWA (sempre)

Dal preview URL, su mobile (iPhone Safari + Android Chrome):
1. Carica scope (es. `/nebula/`) → render OK
2. Login con credenziali → redirect funziona
3. (Se PWA) "Aggiungi a Home Screen" → icona + nome corretti
4. Apri PWA da home screen → standalone mode attivo
5. Se ci sono notifiche FCM → invia evento di test → notifica arriva → click apre URL giusta

### Test regressione POPS (se la modifica tocca file condivisi)

File condivisi POPS (vedi POLARIS.md sez. 0): `index.html`, `vite.config.ts`, `firebase.json`, `src/main.ts`, `src/App.vue`, `src/firebase.ts`, `src/router/index.ts`, `firestore.rules`, `src/functions/index.ts`.

Se tocchi anche solo uno di questi, **test obbligatori su POPS**:
1. `/` login funziona
2. `/preventivatore` crea preventivo
3. `/dashboard` cliente B2B vede ordini
4. `/production` dashboard produzione
5. `/delivery` LOGISTICA mobile signature
6. `/admin` admin functions

---

## 10. PWA update banner — best practice

Le PWA della suite si aggiornano via Service Worker generato da `vite-plugin-pwa`. Per evitare che gli utenti restino bloccati sul codice vecchio (specie su iOS standalone dove la PWA resta in background per giorni) **e** per evitare reload brutali che cancellerebbero form/messaggi in scrittura, l'update è **opt-in via banner**.

### Pattern attuale

`vite.config.ts` → `registerType: 'prompt'` (non `'autoUpdate'`).

Il nuovo SW viene scaricato in background ma resta in stato `waiting` finché l'utente non clicca **Aggiorna** nel banner che appare in basso. Solo allora viene chiamato `skipWaiting()` + reload.

### Componenti coinvolti

| File | Ruolo |
|---|---|
| `src/composables/shared/useSWUpdate.ts` | Usa `workbox-window` direttamente (non `useRegisterSW`) per poter filtrare gli eventi `waiting` con `isExternal: true`. Espone `needRefresh`, `applyUpdate`, `dismiss` |
| `src/components/UpdateBanner.vue` | UI banner globale tematizzato per path (POPS giallo `amber-400`, PULSAR verde `#338076`, CEPHEID oro `#D4A020`) |
| `src/App.vue` | Monta `<UpdateBanner />` sotto `<RouterView>` — visibile in ogni scope |

### Perché workbox-window direttamente (e non `useRegisterSW`)

PULSAR/CEPHEID, tramite `useNotifications`, registrano `/firebase-messaging-sw.js` con scope `'/'` — lo stesso del workbox `sw.js`. Workbox vede questa registrazione come SW "esterno in waiting" e dispatcha un evento `waiting` con `isExternal: true`. Il wrapper `useRegisterSW` del plugin **chiama sempre** `onNeedRefresh` su questi eventi → il banner riappariva all'infinito dopo ogni reload.

`useSWUpdate` usa `workbox-window` direttamente per:
1. **Filtrare `event.isExternal === true`** (firebase-messaging-sw ignorato)
2. **Controllo extra su `scriptURL`** (solo `/sw.js` triggera il banner)
3. **Fallback `setTimeout(reload, 2000)`** in `applyUpdate` se l'evento `controlling` non scatta (succede su SW senza `clientsClaim()` o quando il messageSkipWaiting non riceve risposta)

### Regola

**Mai tornare a `registerType: 'autoUpdate'`.** Quella modalità ricarica la pagina senza preavviso e cancella form/messaggi in scrittura. Il banner costa zero in attrito utente (1 click) e protegge il data entry.

**Mai tornare a `useRegisterSW`** finché `useNotifications` registra firebase-messaging-sw con scope `'/'` — causa loop banner.

### Quando estendere

Se aggiungi una nuova PWA (es. NEBULA), il banner funziona già out-of-the-box: aggiungi solo il ramo path → colore in `UpdateBanner.vue` (es. `path.startsWith('/nebula')` → palette nebula).

---

## 11. Decision log

Tutte le decisioni architetturali esplicite sono in **`POLARIS.md` sez. 4** con data, contesto, decisione, razionale, implicazioni.

Esempi finora documentati:
- Scope `'sidera'` come wildcard desktop FCM (azione 1)
- POPS promosso a 3ª PWA installabile (azione 2)
- "Doppia identità" icona vs login (azione 3)

**Regola**: ogni volta che prendi una decisione architetturale non banale (anche se piccola), aggiungila a POLARIS.md sez. 4. Aiuta il futuro te (o il prossimo developer) a capire **perché** qualcosa è fatto in un certo modo, non solo **cosa**.

---

## 12. Riferimenti incrociati

| File | Ruolo |
|---|---|
| `docs/POLARIS.md` | Roadmap evolutiva + decision log |
| `docs/WORKFLOW.md` | Processo git/GitHub/Firebase/deploy |
| `docs/ATLAS.md` | Manuale architettura (questo file) |
| `docs/POPSnextstep.md` | Roadmap parallela POPS B2B |
| `README.md` | Landing page repo (root, convenzione GitHub) |
| `package.json` | Script npm |
| `vite.config.ts` | Build config (manualChunks, PWA workbox, visualizer) |
| `firebase.json` | Hosting + Functions config |
| `firestore.rules` | Security rules |
| `src/firebase.ts` | Firebase init (no messaging — lazy in useNotifications) |
| `src/router/index.ts` | Rotte + auth guard scope-aware |
| `src/composables/shared/` | Composables generici (useNotifications, useSWUpdate, ...) |
| `src/components/shared/` | Components generici (SideraLogoSchlegel) |
| `src/components/UpdateBanner.vue` | Banner update PWA tematizzato (sez. 10) |
| `src/views/shared/` | Views generiche (ScopedLogin) |

---

## 13. Quick start "Aggiungere NEBULA come PWA"

Riassunto ultra-compatto della ricetta sez. 3, copia-incollabile:

```
☐ git checkout -b feature/nebula-pwa main
☐ Disegna scripts/nebula-icon.svg (single-vertex + raggi, palette #C46030)
☐ Genera public/icons/nebula-{180,192,512}.png con sharp-cli
☐ Crea public/nebula.webmanifest (scope: /nebula/, name lungo)
☐ Aggiungi ramo nello script inline di index.html
☐ Crea src/views/nebula/NebulaLayout.vue (copia da PulsarLayout)
☐ Crea src/views/nebula/NebulaShell.vue (copia da PulsarShell)
☐ Aggiungi rotte in src/router/index.ts (login con ScopedLogin props, scope guard)
☐ (Se notifiche) Aggiungi Cloud Function onNew<Event> con filtro scope
☐ Update POLARIS.md sez. 1 (snapshot) + sez. 4 (decision log)
☐ npm run build → verifica dist/index.html
☐ firebase hosting:channel:deploy nebula-pwa → test
☐ Commit + push + PR → review → merge → deploy produzione
```

---

## 14. Cronologia revisioni ATLAS

- **2026-05-19** — Creazione documento. Estrazione pattern emersi durante POLARIS azioni 1-5 (deployate). Coverage: filosofia, naming, ricetta nuova PWA, FCM, Schlegel logo, code splitting, mobile, doppia identità, preview channel workflow.
- **2026-05-19** — Aggiunta sez. 10 "PWA update banner — best practice". Pattern: `registerType: 'prompt'` + banner tematizzato globale per evitare reload distruttivi durante data entry. Sezioni 11-14 rinumerate.
- **2026-05-19** — Sez. 10 aggiornata: `useSWUpdate` ora usa `workbox-window` direttamente con filtro `event.isExternal` + fallback hard-reload, per evitare loop banner causato dalla coesistenza di `/sw.js` (workbox) e `/firebase-messaging-sw.js` (FCM) sullo stesso scope `'/'`.
