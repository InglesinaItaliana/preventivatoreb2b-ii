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

I moduli interni hanno **nomi di oggetti astronomici**. Ogni colore è estratto dalla **Nebula del Granchio (M1, Hubble Space Telescope)** — la palette è quindi armonica per costruzione (stessa fotografia, stesso illuminante).

Ogni modulo ha **due valori** del proprio accent (vedi sez. 14 "Design Tokens" e [dual-surface contrast](#14-design-tokens-base-material-design-3)):
- **on-dark** — versione luminosa, usata su superfici scure (sidebar SIDERA, Hub Schlegel, splash)
- **on-light** — versione profonda, usata su superfici chiare (PWA, modali bianche, body)

Eccezioni: **QUASAR** e **SIDERA** hanno un solo valore perché vivono già in zona di lightness intermedia che funziona su entrambi i fondi.

| Modulo | Tipo astronomico | Funzione | Accent on-dark | Accent on-light |
|---|---|---|---|---|
| QUASAR | Quasar (oggetto galattico luminosissimo) | Analytics · KPI · Business Intelligence | `#98C0D0` | `#98C0D0` |
| NEBULA | Nebula (gas interstellare) | HR · Anagrafiche · Documentale | `#C46030` | `#B85425` |
| CEPHEID | Cefeide (stella variabile) | Project Management · Workflow · Task | `#D4A020` | `#C4941C` |
| PULSAR | Pulsar (stella di neutroni) | Chat · Comunicazione · Collaborazione | `#3AAF98` | `#3A8C80` |
| NOVA | Nova (esplosione stellare) | Logistica · Supply Chain · Spedizioni | `#8FAB35` | `#5C6822` |
| MAGNETAR | Magnetar (pulsar magnetica) | CRM · Lead · Pipeline Commerciale | `#B06842` | `#7A4830` |
| SIDERA | "Stelle" (latino, generico) | Shell desktop unificata (oro tenue, neutro) | `#D4C498` | `#D4C498` |

I valori on-light sono quelli "veri" Crab Nebula (più desaturati / più scuri). I valori on-dark sono variazioni più luminose progettate per non sparire su `#05090F` (sidebar SIDERA) e per restare riconoscibili nello Schlegel su sfondo scuro.

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
- `docs/blueprint.md` — documento storico (panoramica POPS pre-suite, tenuto come archeologia)
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

### Step 5 — Configurare lo scope nel registry

Aggiungi un'entry in `src/views/sidera/scopeConfig.ts` (`SCOPE_CONFIGS.nebula`):

```ts
nebula: {
  name: 'NEBULA',
  wordmark: 'NEBULA',
  brandSvg: 'nebula',
  mobileNav: [
    { path: '/nebula',         exact: true,  label: 'Team',       icon: 'group' },
    // ... altre voci PWA
  ],
  fab: { icon: 'add', action: 'new-...', ariaLabel: 'Nuova ...' },
  isTopLevelPath: (p) => p === '/nebula' || /* ... */,
  loginPath: '/nebula/login',
  notificationScope: 'nebula',
}
```

`detectScope()` riconosce già il prefix `/nebula` (vedi scopeConfig.ts). Aggiungi infine la corrispondente classe `.s-scope-nebula` in `src/style.css` (vedi sez. 14):

```css
.s-scope-nebula {
  --md-sys-color-primary:               var(--s-nebula-on-light);
  --md-sys-color-on-primary:            #FFFFFF;
  --md-sys-color-primary-container:     var(--md-ref-palette-nebula-90);
  --md-sys-color-on-primary-container:  var(--md-ref-palette-nebula-10);
}
.s-scope-nebula.s-surface-dark, /* ... */ {
  --md-sys-color-primary:               var(--s-nebula-on-dark);
  /* ... dark variants ... */
}
```

### Step 6 — Nessuna Shell switching da scrivere

**Il pattern attuale non richiede più componenti `*Shell.vue` di switching tra layout desktop e mobile**. `SideraLayout.vue` è il **layout unificato e adattivo**: rileva `display-mode: standalone` o viewport `≤ 768px` e mostra il chrome mobile (`ContextualMobileHeader`, `ContextualBottomNav`, `ContextualFab`) automaticamente leggendo la config dello scope corrente. I componenti contestuali sono in `src/components/shared/`.

Storicamente esistevano `PulsarShell.vue` e `CepheidShell.vue` (47 righe ciascuno) che switchavano dinamicamente tra `SideraLayout` e `*Layout` modulare. Sono stati rimossi (vedi cronologia 2026-05-20): causavano remount Vue al resize del viewport, perdita di stato locale (scroll, draft, chat aperta) e duplicazione di codice tra layout desktop e mobile.

Per scope='pulsar' la migrazione è già fatta (questo branch). Per CEPHEID e i futuri moduli, basta seguire questo step (config in `scopeConfig.ts` + router montato su `SideraLayout`).

### Step 7 — Rotte router

In `src/router/index.ts`, monta `SideraLayout` come componente per la sezione `/nebula` (NON un NebulaShell dedicato — vedi Step 6):

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
  component: () => import('../views/sidera/SideraLayout.vue'),  // ← layout unificato
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
// ... usa nei redirect (per scoped login fallback su 401)
```

`SideraLayout` rileverà automaticamente lo scope dal `route.path` via `detectScope()` e mostrera il chrome appropriato (mobile vs desktop, modulo PULSAR vs CEPHEID vs NEBULA, ecc.).

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
☐ Aggiungi SCOPE_CONFIGS.nebula in src/views/sidera/scopeConfig.ts (nav, FAB, paths)
☐ Aggiungi .s-scope-nebula (light + dark) in src/style.css (ruoli M3, vedi sez. 14)
☐ Aggiungi rotte in src/router/index.ts (login con ScopedLogin props + /nebula con component: SideraLayout, scope guard)
☐ (Se notifiche) Aggiungi Cloud Function onNew<Event> con filtro scope
☐ Update POLARIS.md sez. 1 (snapshot) + sez. 4 (decision log)
☐ npm run build → verifica dist/index.html
☐ firebase hosting:channel:deploy nebula-pwa → test
☐ Commit + push + PR → review → merge → deploy produzione
```

---

## 14. Design Tokens — base Material Design 3

### Principio

Il linguaggio grafico della suite è ispirato a **Material Design 3** (https://m3.material.io/) per *struttura* (naming dei token, type scale, shape, elevation, state layers, motion) e usa la **palette Crab Nebula** (vedi sez. 2) per *valori*. Adottare M3 come grammatica permette di:
- avere un vocabolario condiviso e ben documentato per ogni decisione di design
- usare strumenti ufficiali (Material Theme Builder) per derivare scheme da key color
- mantenere la nostra identità (Crab + Schlegel) come strato di brand sopra una base solida

### Pattern dual-surface (decisione esplicita)

I colori-modulo non sono un singolo valore: sono **due valori** che rappresentano lo *stesso colore* su due superfici diverse.

| Token | Quando si usa | Esempi nella suite |
|---|---|---|
| `--s-{module}-on-dark` | Su superfici scure | Sidebar SIDERA (`#05090F`), Hub Schlegel, splash, eventuali aree dark mode |
| `--s-{module}-on-light` | Su superfici chiare | PWA scope layouts, modali bianche, body text accentato |

Per QUASAR (`#98C0D0`) e SIDERA (`#D4C498`) i due valori coincidono: hanno lightness intermedia che funziona su entrambi i fondi.

**Razionale**: su `#05090F` colori profondi tipo NOVA `#5C6822` o MAGNETAR `#7A4830` si appiattiscono in macchie indistinguibili. Servono varianti più luminose. Viceversa, su superfici PWA bianche, i valori "on-dark" appaiono troppo brillanti per essere accent sobri di un sistema enterprise.

### Mapping M3

Quando si entra nello scope di un modulo, il token M3 `--md-sys-color-primary` viene assegnato al brand color del modulo nella variante appropriata per la surface corrente:

```
/* dentro PulsarLayout (PWA, surface chiara) */
.s-scope-pulsar {
  --md-sys-color-primary: var(--s-pulsar-on-light);
  --md-sys-color-on-primary: #FFFFFF;
}

/* dentro SideraLayout (shell con sidebar scura) */
.s-scope-sidera-shell .s-surface-dark {
  --md-sys-color-primary: var(--s-pulsar-on-dark);  /* esempio: se Schlegel evidenzia PULSAR */
}
```

I token M3 strutturali (`--md-sys-color-surface`, `--md-sys-color-on-surface`, `--md-sys-color-outline`, ecc.) saranno definiti in fase successiva del refactor — questa sezione documenta solo i **brand tokens**, primo strato della migrazione.

### Inventario brand tokens (in `src/style.css`)

```
/* Modulo: PULSAR */
--s-pulsar-on-dark:  #3AAF98;
--s-pulsar-on-light: #3A8C80;

/* Modulo: CEPHEID */
--s-cepheid-on-dark:  #D4A020;
--s-cepheid-on-light: #C4941C;

/* Modulo: NEBULA */
--s-nebula-on-dark:  #C46030;
--s-nebula-on-light: #B85425;

/* Modulo: NOVA */
--s-nova-on-dark:  #8FAB35;
--s-nova-on-light: #5C6822;

/* Modulo: MAGNETAR */
--s-magnetar-on-dark:  #B06842;
--s-magnetar-on-light: #7A4830;

/* Modulo: QUASAR — singolo valore (lightness intermedia) */
--s-quasar: #98C0D0;

/* Shell: SIDERA — singolo valore (neutro caldo) */
--s-sidera: #D4C498;
```

### Tonal palettes M3 (reference palette tokens)

Per ogni modulo è disponibile la **tonal palette M3 completa** (18 toni: 0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100), generata via [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) (stesso algoritmo HCT del Material Theme Builder).

Pattern di naming: `--md-ref-palette-{module}-{tone}` — es. `--md-ref-palette-pulsar-40`, `--md-ref-palette-cepheid-90`.

7 moduli × 18 toni = **126 reference palette tokens** in `src/style.css`.

#### Decisione "Strada B" (Brand prima di tutto)

Le tonal palette servono **solo per le varianti** dei colori-modulo (container, on-container, hover, disabled, state layers). I `--md-sys-color-primary` di ogni scope **restano i valori brand** `--s-{module}-on-light` / `--s-{module}-on-dark`, NON i toni M3 standard 40 / 80.

**Razionale**: i valori Crab Nebula attuali sono ≈ tone 50 / tone 70 — leggermente diversi dai tone 40 / 80 ortodossi M3, ma più riconoscibili come "stesso colore" su superficie chiara/scura. Sostituirli avrebbe attenuato l'identità "Crab".

M3 stessa permette questa scelta: il *key color* di una tonal palette non deve necessariamente coincidere col *primary* della scheme. Il MTB online espone l'opzione "Custom primary tone" per lo stesso motivo.

**Alternative documentate ma scartate** (vedi memoria `project-design-tokens-strada-b` per dettagli):
- **Strada A — "M3 letterale"**: primary = tone 40 / 80 ortodossi. Massima accessibility, ma cambia visibilmente il brand-feel.
- **Strada C — "tone 50/70"**: usa i toni M3 standard più vicini ai nostri valori. Compromesso ortodossia/coerenza.

Entrambe restano sperimentabili in futuro semplicemente cambiando il mapping di `--md-sys-color-primary` nella sez. seguente.

#### Ruoli M3 disponibili (`--md-sys-color-*` in `src/style.css`)

I componenti **leggono SEMPRE i system color tokens**, mai i ref palette tones direttamente. I ref palette servono solo come ingredienti per definire i ruoli.

**Ruoli scope-agnostic** (definiti in `:root` + override in `.s-surface-dark`):

| Ruolo | Light scheme | Dark scheme (`.s-surface-dark`) | Note |
|---|---|---|---|
| `background` | `#FFF8F0` | `#16130B` | Sfondo dell'app |
| `on-background` | `#1E1B13` | `#E9E2D4` | Testo su background |
| `surface` | `#FFF8F0` | `#16130B` | Card, modali, panel |
| `on-surface` | `#1E1B13` | `#E9E2D4` | Testo su surface |
| `surface-variant` | `#EBE2CF` | `#4C4639` | Surface di secondo livello (chip bg, input bg) |
| `on-surface-variant` | `#4C4639` | `#CEC6B4` | Testo secondario, helper |
| `surface-container-{lowest..highest}` | scala beige chiara | scala grigio-bruno scura | 5 livelli di profondità surface |
| `outline` | `#7D7667` | `#979080` | Bordi visibili |
| `outline-variant` | `#CEC6B4` | `#4C4639` | Bordi sottili / divider |
| `error` | `#BA1A1A` | `#FFB4AB` | Stato errore |
| `on-error` | `#FFFFFF` | `#690005` | Testo su error |
| `error-container` / `on-error-container` | `#FFDAD6` / `#93000A` | `#93000A` / `#FFDAD6` | Banner/chip errore |
| `inverse-surface` / `inverse-on-surface` / `inverse-primary` | tones SIDERA inversi | tones SIDERA inversi | Snackbar, tooltip dark on light, light on dark |
| `shadow` / `scrim` | `#000000` | `#000000` | Ombre + dialog backdrop |

**Ruoli scope-aware** (cambiano per `.s-scope-{module}`):

| Ruolo | Comportamento |
|---|---|
| `primary` | `var(--s-{module}-on-light)` (light) / `var(--s-{module}-on-dark)` (dark) — **valore Crab Strada B** |
| `on-primary` | `#FFFFFF` (light) / `var(--md-ref-palette-{module}-20)` (dark) |
| `primary-container` | `var(--md-ref-palette-{module}-90)` (light) / `-30` (dark) |
| `on-primary-container` | `var(--md-ref-palette-{module}-10)` (light) / `-90` (dark) |
| `surface-tint` | uguale a `primary` (M3 lo usa per tonal elevation di card/menu/dialog) |

Per QUASAR/SIDERA il `primary` è identico in light/dark (singolo valore), ma i container restano dual-surface come gli altri.

#### Come si applica nei componenti

**Passo 1**: identifica lo scope del componente. Aggiungi `.s-scope-{module}` all'elemento radice del layout:

```vue
<!-- src/views/pulsar/PulsarLayout.vue -->
<template>
  <div class="p-shell s-scope-pulsar">
    <!-- tutto qui dentro vede primary = PULSAR teal -->
  </div>
</template>
```

**Passo 2**: se il componente è su superficie scura (sidebar SIDERA, Hub Schlegel), aggiungi `.s-surface-dark`. Le due classi si combinano: la più vicina nel DOM vince (CSS variables cascade).

```vue
<!-- src/views/sidera/SideraLayout.vue (sidebar dark) -->
<aside class="s-sidebar s-surface-dark">
  <!-- M3 dark scheme attivo qui -->
  <a class="s-scope-pulsar" href="/pulsar">
    <!-- primary = PULSAR on-dark (#3AAF98), container dal tone 30 -->
  </a>
</aside>
```

**Passo 3**: il CSS del componente legge SOLO `var(--md-sys-color-*)`:

```css
/* Bottone CTA primario, agnostico allo scope */
.btn-primary {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}
.btn-primary:hover {
  /* state layer M3: on-primary @ 8% opacità sopra primary */
  background-image: linear-gradient(
    var(--md-sys-color-on-primary), var(--md-sys-color-on-primary)
  );
  background-blend-mode: overlay;
  /* (vedi roadmap state layers per pattern definitivo) */
}

/* Chip "stato" che usa primary-container */
.chip-status {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  border: 1px solid var(--md-sys-color-outline-variant);
}
```

**Risultato**: lo stesso identico componente `.btn-primary`, montato in PulsarLayout o CepheidLayout, su PWA chiara o su sidebar SIDERA scura, si adatta automaticamente. Zero hex hardcoded.

#### Migrazione esistente: cosa NON è ancora fatto

I componenti `.vue` esistenti **continuano a usare i loro hex inline** — questo branch aggiunge solo l'infrastruttura. La migrazione modulo-per-modulo verrà in branch successivi:

- `polaris/sidera-m3-migration` — sostituisce hex in SideraLayout/HubView/Tasks/Projects/ProjectBoard con `var(--md-sys-color-*)`
- `polaris/pulsar-m3-migration` — idem per PULSAR
- `polaris/cepheid-m3-migration` — idem per CEPHEID
- ecc.

Ogni branch tocca un solo scope, in modo che le regressioni siano isolabili.

### Rigenerare le tonal palettes

Le tonal palettes sono **deterministiche**: dato un key color, l'output è sempre lo stesso. Per rigenerarle:

```bash
node scripts/generate-tonal-palettes.mjs
```

Lo script:
1. Legge i key color dalla costante `MODULES` nel file (allineata a `docs/ATLAS.md` sez. 2)
2. Genera 126 CSS variables via `TonalPalette.fromInt()` di `@material/material-color-utilities`
3. Scrive in `scripts/tonal-palettes-output.css` (snapshot committato per visibilità)
4. Stampa una sanity check: confronta i tone 40 / 80 generati coi nostri valori on-light / on-dark attuali (utile se in futuro si valuta passaggio a Strada A o C)

**Quando rigenerare**: se i key color cambiano in `docs/ATLAS.md` sez. 2. Dopo aver eseguito lo script, copia il blocco `:root` da `scripts/tonal-palettes-output.css` dentro `src/style.css` sostituendo le 126 variabili `--md-ref-palette-*`.

### Regole d'uso

1. **Mai più hex inline per i colori-modulo** nei `.vue` — sempre `var(--s-{module}-on-{surface})`.
2. **Scegliere on-dark vs on-light in base alla surface**, non in base allo scope. Esempio: lo Schlegel sulla SideraHubView è sfondo scuro → vertex PULSAR usa `var(--s-pulsar-on-dark)` anche se il modulo è PULSAR.
3. **QUASAR/SIDERA** non hanno varianti — se in futuro emergessero problemi di contrasto, si aggiungeranno e si aggiornerà questa sezione (mai aggiungere varianti in silenzio).
4. **L'accent è accent, non sfondo**: il brand color sta in CTA primaria, link attivi, focus ring, icone hover, vertice attivo. Lo sfondo della PWA resta neutro (vedi token `--md-sys-color-surface` in arrivo).

### Type Scale (15 stili) ✅ implementata 2026-05-20

Token format: `--md-sys-typescale-{stile}-{property}` dove property è `font`/`size`/`line-height`/`tracking`/`weight`.

| Categoria | Stili | Font | Quando usarlo |
|---|---|---|---|
| **Display** (large/medium/small) | 57/45/36px | Cormorant Garamond | Hero pages, splash screen, marketing landing |
| **Headline** (large/medium/small) | 32/28/24px | Cormorant Garamond | Titoli pagina e sezione principali |
| **Title** (large/medium/small) | 22/16/14px | Outfit | Titoli card, header modale, intestazioni list |
| **Body** (large/medium/small) | 16/14/12px | Outfit | Testo paragrafo, descrizioni, contenuto principale |
| **Label** (large/medium/small) | 14/12/11px | Outfit | Bottoni, chip, tag, link inline, meta info |

Pattern d'uso (utility class):

```vue
<h1 class="md-typescale-headline-large">Titolo pagina</h1>
<p class="md-typescale-body-medium">Paragrafo standard.</p>
<button class="md-typescale-label-large">CTA</button>
```

Oppure tokens diretti in CSS scoped:

```css
.my-title {
  font-family: var(--md-sys-typescale-title-large-font);
  font-size: var(--md-sys-typescale-title-large-size);
  line-height: var(--md-sys-typescale-title-large-line-height);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  font-weight: var(--md-sys-typescale-title-large-weight);
}
```

Spec ufficiale: https://m3.material.io/styles/typography/type-scale-tokens

### Shape Scale (7 valori) ✅ implementata 2026-05-20

Token: `--md-sys-shape-corner-{name}`.

| Token | Valore | Quando usarlo |
|---|---|---|
| `none` | 0 | Bordi netti, banner full-bleed |
| `extra-small` | 4px | Chip, badge, snackbar |
| `small` | 8px | Bottoni standard, text field outlined |
| `medium` | 12px | Card, dropdown, menu |
| `large` | 16px | Bottom sheet, dialog, navigation drawer |
| `extra-large` | 28px | Hero card, FAB extended |
| `full` | 9999px | Pillole, FAB rotondo, switch toggle |

Esempio:

```css
.my-card {
  border-radius: var(--md-sys-shape-corner-medium); /* 12px */
}
.my-fab {
  border-radius: var(--md-sys-shape-corner-extra-large); /* 28px */
}
.my-pill-btn {
  border-radius: var(--md-sys-shape-corner-full); /* round */
}
```

Spec: https://m3.material.io/styles/shape/shape-scale-tokens

### Elevation (6 livelli) ✅ implementata 2026-05-20

Token: `--md-sys-elevation-level-{0..5}` (shadow). M3 prevede anche **tonal elevation** (la surface si tinge col primary via `--md-sys-color-surface-tint`) — già esposto, va combinato manualmente quando serve.

| Livello | Uso tipico |
|---|---|
| 0 | flush, no shadow |
| 1 | Card riposo |
| 2 | Card hover |
| 3 | Search bar, Bottom App Bar |
| 4 | FAB, Navigation drawer aperta |
| 5 | Modal Bottom Sheet |

Esempio:

```css
.my-card {
  box-shadow: var(--md-sys-elevation-level-1);
  transition: box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.my-card:hover {
  box-shadow: var(--md-sys-elevation-level-2);
}
```

Spec: https://m3.material.io/styles/elevation/tokens

### State Layers (4 opacità) ✅ implementata 2026-05-20

Token: `--md-sys-state-{hover,focus,pressed,dragged}-state-layer-opacity`.

| State | Opacità | Trigger |
|---|---|---|
| hover | 0.08 (8%) | `:hover` (desktop) |
| focus | 0.10 (10%) | `:focus-visible` |
| pressed | 0.10 (10%) | `:active` |
| dragged | 0.16 (16%) | drag handles, drag-over |

**Pattern M3 ortodosso** (overlay del colore "on-X" sopra il colore "X"):

```css
.btn-primary {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  position: relative;
  overflow: hidden;
}
.btn-primary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--md-sys-color-on-primary);
  opacity: 0;
  transition: opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  pointer-events: none;
}
.btn-primary:hover::before  { opacity: var(--md-sys-state-hover-state-layer-opacity); }
.btn-primary:focus::before  { opacity: var(--md-sys-state-focus-state-layer-opacity); }
.btn-primary:active::before { opacity: var(--md-sys-state-pressed-state-layer-opacity); }
```

**Pattern pragmatico** (già usato nei componenti shared, meno ortodosso ma più semplice):

```css
.btn-primary:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 92%, var(--md-sys-color-on-primary));
}
```

Per ora il pattern pragmatico convive col ortodosso. Quando introdurremo `Button.vue` standardizzato, sarà l'occasione per scegliere uno solo.

Spec: https://m3.material.io/foundations/interaction/states

### Motion (16 durations + 8 easing) ✅ implementata 2026-05-20

Token: `--md-sys-motion-duration-{name}`, `--md-sys-motion-easing-{name}`.

**Durations** raggruppate per categoria:
- `short1..short4` (50/100/150/200ms) — micro-feedback, hover, focus
- `medium1..medium4` (250/300/350/400ms) — espansione menu, modal open/close
- `long1..long4` (450/500/550/600ms) — transizioni di pagina, scroll-into-view
- `extra-long1..extra-long4` (700-1000ms) — onboarding, hero animations

**Easing** (curves):
- `linear` — `cubic-bezier(0,0,1,1)`
- `standard` — `cubic-bezier(0.2, 0, 0, 1)` — default per transizioni
- `standard-accelerate` — pop-out / exit
- `standard-decelerate` — pop-in / enter
- `emphasized` — versione enfatica di standard (usata per elementi di forte rilievo)
- `emphasized-accelerate` / `emphasized-decelerate` — varianti enter/exit enfatiche
- `legacy` — pre-M3 compatibility (cubic-bezier(0.4, 0, 0.2, 1))

Esempio:

```css
.btn {
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.modal-enter {
  transition: opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate),
              transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
}
```

Spec: https://m3.material.io/styles/motion/motion-tokens

### Pattern UI standardizzati — utility class globali ✅ implementate 2026-05-20

I 5 layer di token sopra sono i mattoni; queste utility class sono i **componenti primitivi** standardizzati che li combinano nei pattern M3. Sono in `src/style.css` (sezione "M3 COMPONENT PRIMITIVES") e sono **la prima scelta per ogni nuovo componente UI**.

#### Bottoni — `.md-btn` + varianti

5 stili M3 disponibili come utility class globali. Tutti hanno:
- Altezza 40px standard (`.md-btn--sm` 32px / `.md-btn--lg` 56px)
- Padding 0 24px (text variant 0 12px)
- Typography label-large
- Border-radius `corner-full` (M3 default; override con `.md-btn--square` o `.md-btn--rounded`)
- Transition short3 + standard easing

```vue
<!-- CTA primaria (Save, Crea, Conferma) -->
<button class="md-btn md-btn--filled">Salva</button>

<!-- CTA secondaria meno enfatica -->
<button class="md-btn md-btn--filled-tonal">Aggiungi membro</button>

<!-- Azione secondaria con bordo (Annulla in modal) -->
<button class="md-btn md-btn--outlined">Annulla</button>

<!-- Link inline minimale -->
<button class="md-btn md-btn--text">Mostra altro</button>

<!-- Destructive (Elimina, Rimuovi permanent) -->
<button class="md-btn md-btn--danger">Elimina chat</button>

<!-- Size modifiers -->
<button class="md-btn md-btn--filled md-btn--sm">Salva</button>
<button class="md-btn md-btn--filled md-btn--lg">Inizia ora</button>

<!-- Shape modifiers -->
<button class="md-btn md-btn--filled md-btn--square">OK</button>   <!-- corner-small -->
<button class="md-btn md-btn--filled md-btn--rounded">OK</button>  <!-- corner-medium -->
```

#### Modal / Dialog / Bottom Sheet — `.md-modal-*`

Due tipi di overlay M3 con regole d'uso definite:

```vue
<!-- Dialog (centered modal): desktop, conferme critiche, scelte di pochi item -->
<Teleport to="body">
  <div v-if="showModal" class="md-modal-backdrop" @click.self="showModal = false">
    <div class="md-modal-dialog">
      <div class="md-modal-header">
        <span class="md-modal-title">Eliminare la chat?</span>
        <button class="md-modal-close" @click="showModal = false"><MIcon name="close" :size="18" /></button>
      </div>
      <div class="md-modal-body">
        <p>Stai per eliminare la chat con Maria. L'azione e' irreversibile.</p>
      </div>
      <div class="md-modal-footer">
        <button class="md-btn md-btn--outlined" @click="showModal = false">Annulla</button>
        <button class="md-btn md-btn--danger" @click="confirmDelete">Elimina</button>
      </div>
    </div>
  </div>
</Teleport>

<!-- Bottom Sheet: mobile / PWA, azioni contestuali, form medio-lunghi -->
<Teleport to="body">
  <div v-if="showSheet" class="md-modal-backdrop" @click.self="showSheet = false">
    <div class="md-modal-bottom-sheet">
      <div class="md-modal-header">
        <span class="md-modal-title">Nuova azione</span>
        <button class="md-modal-close" @click="showSheet = false"><MIcon name="close" :size="18" /></button>
      </div>
      <div class="md-modal-body">
        <!-- form fields ... -->
      </div>
      <div class="md-modal-footer">
        <button class="md-btn md-btn--outlined" @click="showSheet = false">Annulla</button>
        <button class="md-btn md-btn--filled" @click="submit">Crea</button>
      </div>
    </div>
  </div>
</Teleport>
```

**Regola d'uso**: `Dialog` su desktop, `BottomSheet` su mobile. Quando una vista deve supportare entrambi (es. PulsarChatsView), usa media query CSS per applicare classe condizionale o passa via prop.

Animazioni incluse: fade-in del backdrop (medium2), pop-in del dialog (medium2 emphasized-decelerate), slide-up del bottom sheet (medium3).

#### Text Field — `.md-text-field*` (Outlined M3)

```vue
<label class="md-text-field">
  <span class="md-text-field-label">Email</span>
  <input class="md-text-field-input" type="email" placeholder="nome@esempio.it" />
</label>
```

Outlined M3: border 1px outline (resting) → 2px primary (focus) con compensation padding per altezza costante.

#### Pattern legacy esistenti (non rimossi)

I componenti esistenti usano ancora classi locali (`.btn-primary`, `.btn-ghost`, `.modal`, `.field-input`, ecc.) — non sono stati migrati in massa per evitare diff esplosivi. Sono lasciati funzionanti.

**Per nuovo codice**: usa SEMPRE le utility class globali `.md-btn-*` / `.md-modal-*` / `.md-text-field-*`. Quando refactorizzi un componente esistente, migra le sue classi locali alle utility globali.

#### Card

| Stile | Quando | CSS pattern |
|---|---|---|
| **Elevated** | Card che "galleggiano" su background (es. project card, dashboard widget) | `background: var(--md-sys-color-surface-container-low); border-radius: var(--md-sys-shape-corner-medium); box-shadow: var(--md-sys-elevation-level-1);` |
| **Filled** | Card densa, in grid affollata | `background: var(--md-sys-color-surface-container-highest); border-radius: var(--md-sys-shape-corner-medium);` (no shadow) |
| **Outlined** | Card che competono per attenzione (lista densa) | `background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium);` |

#### Dialog vs Bottom Sheet — quando usare quale

| Component | Uso | Posizione | Shape |
|---|---|---|---|
| **Dialog** (centered modal) | Conferme critiche, scelte di pochi item, alerts | Centro schermo, overlay | `var(--md-sys-shape-corner-extra-large)` |
| **Bottom Sheet** | Azioni contestuali in modalità mobile, form medio-lunghi, picker | Bottom slide-up | `var(--md-sys-shape-corner-large)` su top corners, none su bottom |

Suite oggi usa entrambi senza convenzione netta. **Regola da adottare**: Dialog sempre su desktop browser, Bottom Sheet sempre su mobile/standalone. Il pattern adattivo del `SideraLayout` può supportare entrambi con CSS responsive.

#### Input field (Text Field)

M3 prevede `Outlined` (più comune) e `Filled` (più denso). Pattern Outlined consigliato:

```css
.md-text-field {
  background: transparent;
  color: var(--md-sys-color-on-surface);
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 12px 16px;
  font: var(--md-sys-typescale-body-large-weight) var(--md-sys-typescale-body-large-size)/var(--md-sys-typescale-body-large-line-height) var(--md-sys-typescale-body-large-font);
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.md-text-field:hover  { border-color: var(--md-sys-color-on-surface); }
.md-text-field:focus  { border-color: var(--md-sys-color-primary); border-width: 2px; outline: none; }
```

#### Linea guida finale per sviluppo futuro

Quando aggiungi un componente UI:

1. **Tipografia** → mai `font-size` hardcoded, usa `var(--md-sys-typescale-*)` o `class="md-typescale-*"`
2. **Colori** → mai hex inline (eccetto JS arrays di valori semantici tipo priority), usa `var(--md-sys-color-*)`
3. **Border-radius** → usa `var(--md-sys-shape-corner-*)`
4. **Shadow** → usa `var(--md-sys-elevation-level-*)`
5. **Hover/focus/pressed** → usa `var(--md-sys-state-*-state-layer-opacity)` con pattern overlay o `color-mix` con percentuale uguale
6. **Transition** → usa `var(--md-sys-motion-duration-*) var(--md-sys-motion-easing-*)`
7. **Brand color**: lascia che venga dallo scope (`s-scope-{module}`), non hardcodare. Per pure-SIDERA UI ometti lo scope-class (default oro tenue).

Quando trovi codice non-M3-compliant durante un fix: migra solo se è nello scope del fix corrente; altrimenti annota in [POLARIS](POLARIS.md) come "M3 cleanup pending".

### Riferimenti

- [Material Design 3 — overview](https://m3.material.io/)
- [M3 Color system](https://m3.material.io/styles/color/system/overview)
- [M3 Typography](https://m3.material.io/styles/typography/overview)
- [M3 Shape](https://m3.material.io/styles/shape/overview)
- [Material Theme Builder](https://material-foundation.github.io/material-theme-builder/)
- `src/style.css` — implementazione token
- `docs/ATLAS.md` sez. 2 — palette Crab Nebula

---

## 15. Cronologia revisioni ATLAS

- **2026-05-19** — Creazione documento. Estrazione pattern emersi durante POLARIS azioni 1-5 (deployate). Coverage: filosofia, naming, ricetta nuova PWA, FCM, Schlegel logo, code splitting, mobile, doppia identità, preview channel workflow.
- **2026-05-19** — Aggiunta sez. 10 "PWA update banner — best practice". Pattern: `registerType: 'prompt'` + banner tematizzato globale per evitare reload distruttivi durante data entry. Sezioni 11-14 rinumerate.
- **2026-05-19** — Sez. 10 aggiornata: `useSWUpdate` ora usa `workbox-window` direttamente con filtro `event.isExternal` + fallback hard-reload, per evitare loop banner causato dalla coesistenza di `/sw.js` (workbox) e `/firebase-messaging-sw.js` (FCM) sullo stesso scope `'/'`.
- **2026-05-19** — Sez. 2 aggiornata con palette **Crab Nebula** (estrazione da M1 Hubble) e pattern **dual-surface** (on-dark / on-light) per i moduli con lightness fuori dalla zona intermedia. QUASAR e SIDERA restano singolo valore. Aggiunta nuova sez. 14 "Design Tokens" che dichiara Material Design 3 come linguaggio grafico di riferimento per la suite e definisce il primo strato (brand tokens) — type/shape/elevation/state/motion in roadmap.
- **2026-05-20** — Sez. 14 estesa con **tonal palettes M3** (18 toni × 7 moduli = 126 reference tokens) generate via `@material/material-color-utilities` (algoritmo HCT, stesso del MTB). Decisione **Strada B**: i `--md-sys-color-primary` restano i valori Crab on-light/on-dark, le palette servono solo per varianti container/on-container/state-layer. Strade A (M3 letterale tone 40/80) e C (tone 50/70 ibrido) documentate come esperimenti futuri. Aggiunto `scripts/generate-tonal-palettes.mjs` per rigenerare deterministicamente. Mapping `--md-sys-color-*` per scope rinviato al branch `polaris/design-tokens-roles`.
- **2026-05-20** — Sez. 14 estesa con **ruoli M3 system color** in `src/style.css` (branch `polaris/design-tokens-roles`): light scheme + `.s-surface-dark` per i ruoli neutri/surface/error/outline (scope-agnostic, valori dal MTB export con seed SIDERA), + `.s-scope-{module}` per primary/on-primary/primary-container/on-primary-container scope-aware su 7 moduli con dual surface. I componenti esistenti NON sono toccati — migrazione modulo-per-modulo in branch successivi (`polaris/{module}-m3-migration`).
- **2026-05-20** — **Unified shell pattern** (branch `polaris/pulsar-unified-shell`): eliminato lo switching tra `SideraLayout` e `*Layout` modulare via `*Shell.vue`. Ora `SideraLayout.vue` è il **layout unificato e adattivo** per tutti gli scope sotto la suite (`/sidera/*`, `/pulsar/*`, `/cepheid/*`, futuri). Rileva `display-mode: standalone` o viewport `≤ 768px` e mostra il chrome mobile (`ContextualMobileHeader`, `ContextualBottomNav`, `ContextualFab` in `src/components/shared/`) leggendo la config dello scope corrente da `src/views/sidera/scopeConfig.ts`. **Eliminati**: `PulsarShell.vue`, `PulsarLayout.vue` (assorbiti da SideraLayout). **Sez. 3 step 5-7 riscritti** per riflettere il nuovo pattern. **Sez. 13 quick start** aggiornata: niente più `*Shell.vue` / `*Layout.vue` da copiare — basta un'entry in `scopeConfig.ts` + classe scope in `style.css` + rotte router che montano `SideraLayout`. Beneficio: niente remount al resize, stato locale preservato, riduzione duplicazione codice. Effort per nuovo scope: ~30 minuti invece di 2-4 ore. CEPHEID rimane da migrare in un branch separato (`polaris/cepheid-unified-shell`).
- **2026-05-20** — **CEPHEID unified shell** (branch `polaris/cepheid-unified-shell`): replicato il pattern PULSAR per CEPHEID. **Eliminati**: `CepheidShell.vue` (47 righe) e `CepheidLayout.vue` (501 righe). Router `/cepheid` ora monta `SideraLayout`. Aggiunto `cepheid-new-project-tick` e `cepheid-new-goal-tick` ai provide di SideraLayout (oltre a `cepheid-new-task-tick` già esistente). `onFabTrigger` esteso con la logica context-aware originaria di `CepheidLayout.triggerNew`: in base alla route attiva (`/cepheid/goals`, `/cepheid/projects`, `/cepheid/project/:id`, ...) dispatcha al tick giusto. Icona FAB CEPHEID aggiornata a `'add_circle'` (era `'add'`) per coerenza con CepheidLayout precedente. Restano da migrare: NEBULA, NOVA, MAGNETAR, QUASAR (oggi non ancora promossi a PWA con layout dedicato — basta seguire la stessa ricetta).
- **2026-05-20** — **Cleanup finale viste SIDERA-only** (branch `polaris/uniform-card-hover-and-port`): completato il porting delle feature uniche di `TasksView.vue` (867 righe) → `CepheidActionsView.vue` (+228 righe: filter tabs estesi a 4 mine/all/late/done, group-by relative-date, edit modal con delete, formatDue con label relative) e di `ProjectsView.vue` (567 righe) → `CepheidProjectsView.vue` (+213 righe: edit modal, context menu 3-dot, toggle active/inactive, badge Inattivo, visibility admin per progetti inactive, dropdown M3-styled). **Eliminati 2 file SIDERA-only**: `TasksView.vue`, `ProjectsView.vue`. Router cleanup: route `/sidera/tasks` → `/cepheid` redirect, `/sidera/projects` → `/cepheid/projects`, `/sidera/projects/:id` già redirect (commit precedente). Cartella `src/views/sidera/` ora contiene solo i layout della shell (SideraLayout, HomeView Cruscotto QUASAR, SideraHubView, ChatView, SideraAdminMaintenance, scopeConfig.ts). **Card hover uniformati** cross-views (CepheidProjects/Actions/Due + HomeView): pattern standard `border-color outline + elevation-level-2 + translateY(-1px)` con transition motion M3 ovunque.
- **2026-05-20** — **Merge totale ProjectBoard → CepheidProjectDetail** (branch `polaris/merge-projectboard-to-cepheid`): assorbita la vista power-desktop SIDERA dentro la PWA CEPHEID, rendendola full-feature anche su desktop. CepheidProjectDetail ora ha **6 tab**: Kanban (esistente), **Lista** (NEW: porting da ProjectBoard list view, lista flat con priority dot + state pill), Milestone (esistente), Deliverable (esistente), **Calendario** (NEW: group-by relative due-date — late/oggi/settimana/più avanti — pattern simile a TasksView), **Note** (NEW: textarea con autosave su `projects/{id}.notes`, debounce 1s). File eliminato: `src/views/sidera/ProjectBoard.vue` (1335 righe). Route legacy `/sidera/projects/:id` → redirect a `/cepheid/project/:id` (backward-compat URL bookmark). `TasksView.vue` e `ProjectsView.vue` SIDERA restano per ora (hanno feature aggiuntive — edit task from list, archive toggle, context menu — non ancora portate a CepheidActions/CepheidProjects; cleanup futuro).
- **2026-05-20** — **M3 component primitives** (branch `polaris/m3-elevation-button-modal`): aggiunte utility class globali in `src/style.css`: `.md-btn` con varianti `--filled`, `--filled-tonal`, `--outlined`, `--text`, `--danger` (+ modifiers `--sm`/`--lg`/`--square`/`--rounded`); `.md-modal-backdrop` + `.md-modal-dialog` (centered desktop) + `.md-modal-bottom-sheet` (slide-up mobile) + helpers header/body/footer/title/close; `.md-text-field` + `.md-text-field-label` + `.md-text-field-input` (Outlined M3). 3 keyframes M3-spec: fade-in backdrop, pop-in dialog, slide-up bottom-sheet. Aggiornato ATLAS sez. 14 "Pattern UI standardizzati" con esempi `<button class="md-btn md-btn--filled">` concreti. **Migrazione box-shadow ai token elevation**: 28 occorrenze in 13 file viste sostituite via regex batch. `--s-shadow` / `--s-shadow-hover` ora alias di `var(--md-sys-elevation-level-1)` / `level-2`. Cambio visivo lieve (shadow leggermente piu' marcate, M3-coerenti).
- **2026-05-20** — **M3 layers 1-5 implementati** (branch `polaris/m3-layers-typography-shape-elevation-state-motion`): completati gli ultimi 5 strati dei design tokens M3. **Typography**: 15 stili `--md-sys-typescale-*` (display/headline/title/body/label × large/medium/small) + utility class `.md-typescale-*`, font mapping: Cormorant Garamond per display+headline, Outfit per title+body+label. **Shape**: 7 token `--md-sys-shape-corner-{none,extra-small,small,medium,large,extra-large,full}`. **Elevation**: 6 token `--md-sys-elevation-level-{0..5}` (box-shadow M3). **State layers**: 4 token opacità (`--md-sys-state-{hover,focus,pressed,dragged}-state-layer-opacity`). **Motion**: 16 duration + 8 easing token `--md-sys-motion-*`. Sez. 14 estesa con sotto-sezioni dettagliate per ogni layer + **pattern guide UI** (Bottoni Filled/Filled Tonal/Outlined/Text/Elevated, Card Elevated/Filled/Outlined, Dialog vs Bottom Sheet, Input Text Field) che diventano la base per lo sviluppo futuro. I componenti esistenti NON sono migrati ai nuovi token tipografici/shape/elevation — l'adozione è incrementale: ogni nuovo componente o refactor li userà.
- **2026-05-20** — **Unificazione header + card hover** (branch `feat/m3-unify-headers-cards`): chiusura del debito di migrazione M3 lasciato in sospeso dalle viste pre-ATLAS. **Token primary-state-layer** (`src/style.css`): aggiunti `--md-sys-color-primary-state-{hover,focus,pressed}` (color-mix 8%/10%/10% di primary su surface), scope-aware. Da usare come `background` per le superfici non-primary (card-hover, list-row-hover), mentre `--md-sys-color-primary-hover` (più scuro 20%) resta per le superfici già primary (es. `.md-btn--filled:hover`). **Utility `.md-card-*`**: tre varianti M3 ufficiali — `.md-card-outlined` (surface + outline-variant + level-0), `.md-card-elevated` (surface-container-low + level-1), `.md-card-filled` (surface-container-highest). Variante `.is-interactive` applica il pattern hover POPS standard: `border-color: primary` + `background: primary-state-hover` + `elevation-level-2` + `translateY(-1px)`. Aggiunto modifier `.md-card--dense` (padding 12×14 invece di 16). **Componente `<MdPageHeader>`** in `src/components/shared/MdPageHeader.vue`: primitive shared per l'in-content page header con props `title` / `subtitle` / `borderless` + slot `#cta`. Sostituisce i pattern duplicati `.av-header` / `.pv-header` / `.dv-header` (4 occorrenze byte-identiche in CepheidActions/Projects/Due). NON sostituisce `<ContextualMobileHeader>` (top app bar mobile, montato dal layout). **Migrazione viste**: 4 viste portate ai token e al nuovo componente — `CepheidActionsView`, `CepheidProjectsView`, `CepheidDueView`, `HomeView` (Cruscotto QUASAR). Eliminate ~120 righe di CSS duplicato per gli header. Rimosso `#B8870E` hardcoded (6 occorrenze) sostituito con `var(--md-sys-color-primary-hover)`. Field input nei modal portati da `background: #F4F2EE; border: #E8E5DF; radius: 10px` → token (`surface-container`, `outline-variant`, `corner-extra-small`). Bottom-sheet radius da `20px 20px 0 0` → `corner-large` (16px) come prescrive ATLAS sez. 14. **Pattern hover card unificato sul "Projects-style"**: tutte le card interattive ora usano `border-color: primary` + `background: primary-state-hover` (non più border-outline come Actions/Due pre-fix). Le card di HomeView (Cruscotto) — `.azione-row`, `.proj-mini`, `.kpi-card`, `.urgenza-card` — adottano lo stesso pattern. `SideraHubView` (splash Schlegel `/sidera/hub`) escluso intenzionalmente — è marketing UI, non app UI. Le PWA non-CEPHEID restano da migrare (PULSAR views in `src/views/pulsar/*` hanno ancora `.p-page-title` / `.p-page-sub` duplicati, target del prossimo branch).
