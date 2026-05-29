# NEBULA-DOCS — Documentale stile Notion per la suite

> Specifica di progetto. Documento "vivo": va aggiornato dopo ogni step completato o decisione esplicita.
>
> **Ultima revisione:** 2026-05-29
> **Stato:** ✅ Fasi 1→5 **LIVE in produzione** (PR #35→#44). 🚧 **Fase 6 (real-time / Yjs) CODE-COMPLETE** su branch `feature/nebula-docs-realtime` (build + typecheck file-toccati + test verdi). Provider Firestore-native (no Cloud Run), cursori live, sostituzione diretta con kill-switch. **Resta solo: deploy atomico + backfill + verifica two-browser** (azione operativa, non codice).
> **Owner:** Gionata Pastorin
> **Documenti correlati:** [POLARIS](POLARIS.md) (roadmap), [ATLAS](ATLAS.md) (architettura suite), [WORKFLOW](WORKFLOW.md)

---

## 0. Scope e principi guida

NEBULA-DOCS è il **terzo pilastro di NEBULA** (HR · Anagrafiche · **Documentale**): un sistema di creazione documenti stile Notion, residente sotto `/nebula/docs/*`, che permette di scrivere pagine ricche con **riferimenti vivi a task e progetti CEPHEID** (e in futuro QUASAR, POPS, ecc.).

**Principi (immutabili):**

1. **CEPHEID resta source-of-truth** per task/progetti/deliverable. NEBULA-DOCS li **referenzia**, non li duplica mai. Un mention è un puntatore live, non uno snapshot.
2. **Niente emoji**. Le icone documento sono **Material Symbols Outlined** (font già caricato globalmente in `index.html`), scelte da un picker curato. Mai catalogo intero (rumore), mai emoji Unicode.
3. **No CRDT in v1.** Collab non-real-time: salvataggio autosave + **presence lock visuale** ("Mario sta scrivendo…") tramite Firestore. Aggiunta Yjs è una fase 2 esplicita, non un debito implicito.
4. **Integrazione Claude = Livello A (MCP).** Niente API Anthropic nel bundle PWA. Claude aggiorna i doc da fuori via MCP server, esattamente come oggi fa con Notion.
5. **Componenti scoped a NEBULA-DOCS.** `IconPicker`, `MentionSuggester`, editor base **nascono locali** sotto `src/views/nebula/docs/`. Niente riuso su CEPHEID/POPS/QUASAR in v1 — promozione a shared solo quando emerge un secondo consumer reale (pattern ATLAS sez. 3: shared = ≥2 consumer reali, non speculativi).
6. **Live in produzione.** Ogni modifica a file POPS condivisi richiede test manuale POPS prima del merge (vincolo POLARIS).

---

## 1. Cosa è (in una riga)

Una collezione di **pagine documento gerarchiche** (tipo workspace Notion) editabili in NEBULA, con **blocchi rich-text** che possono incorporare **task CEPHEID live** (chip con stato sincronizzato), **progetti CEPHEID** (card con progress) e **liste filtrate** (database view), aggiornabili anche da Claude esterno via MCP.

---

## 2. Architettura — diagramma logico

```
                 ┌──────────────────────────────┐
                 │     NEBULA-DOCS (frontend)   │
                 │   /nebula/docs/{docId}       │
                 │                              │
                 │   ┌────────────────────────┐ │
                 │   │  TipTap editor         │ │
                 │   │  + custom extensions:  │ │
                 │   │   • task-mention       │ │
                 │   │   • project-mention    │ │
                 │   │   • task-embed (lista) │ │
                 │   │   • icon (Material)    │ │
                 │   └────────────────────────┘ │
                 └──────────┬───────────────────┘
                            │
                            │ Firestore SDK
                            ▼
       ┌───────────────────────────────────────────┐
       │           Firestore                       │
       │                                           │
       │   nebulaDocs/{docId}                      │
       │   nebulaDocs/{docId}/presence/{userId}    │
       │   nebulaDocs/{docId}/history/{revId}      │
       │                                           │
       │   cepheid_tasks/{id}  (read-only ref)     │
       │   projects/{id}       (read-only ref)     │
       └────────┬──────────────────────────┬───────┘
                │                          │
                │ onWrite trigger          │
                ▼                          │
       ┌────────────────────────┐          │
       │ Cloud Functions        │          │
       │  • indexDocRefs        │          │
       │  • notifyOnMention     │          │
       │  • presenceCleanup     │          │
       └────────────────────────┘          │
                                           │
                ┌──────────────────────────┘
                ▼
       ┌────────────────────────┐
       │  MCP server (Cloud     │
       │  Run / Functions HTTP) │
       │   • nebula.search      │
       │   • nebula.getDoc      │◀──── Claude Desktop / claude.ai
       │   • nebula.appendBlock │      (connettore MCP)
       │   • nebula.replaceSec  │
       │   • nebula.createDoc   │
       └────────────────────────┘
```

---

## 3. Schema dati Firestore

### 3.1 Collezione `nebulaDocs`

```ts
nebulaDocs/{docId} {
  // Identità
  title: string,                    // "Roadmap Q2 2026"
  slug: string,                     // "roadmap-q2-2026" (per URL leggibili futuri)

  // Gerarchia (workspace tree)
  parentId: string | null,          // null = root
  order: number,                    // posizione tra i siblings (drag & drop)
  depth: number,                    // calcolato server-side, max 5

  // Icona (NO emoji)
  icon: {
    set: 'material',                // futuro-proof
    name: string,                   // 'description', 'rocket_launch', 'task_alt', ...
    color: string,                  // hex (default: colore modulo NEBULA #C46030)
    fill: 0 | 1                     // variable font axis: 0 outlined, 1 filled
  } | null,
  // (cover image: non implementata in v1 — vedi §12)

  // Contenuto
  content: object,                  // ProseMirror JSON doc (vedi 3.2)
  contentText: string,              // testo flat estratto, per ricerca (max 10k chars)

  // Refs denormalizzati (manutenuti da Cloud Function)
  refs: {
    tasks: string[],                // ['taskId1', 'taskId2', ...]
    projects: string[],
    deliverables: string[],
    docs: string[],                 // link interni ad altri doc NEBULA
    users: string[]                 // @menzioni di persone
  },

  // Audit
  createdAt: Timestamp,
  createdBy: string,                // email
  updatedAt: Timestamp,
  updatedBy: string,
  revision: number,                 // incrementato a ogni save

  // Permessi
  acl: {
    visibility: 'private' | 'team' | 'public',  // public = tutto il team Inglesina
    readers: string[],              // email aggiuntive (oltre acl.visibility)
    writers: string[],              // email che possono editare
    owners: string[]                // email che possono cambiare ACL/eliminare
  },

  // Stato
  archived: boolean,                // soft-delete (non appare in lista, mantenuto 90gg)
  archivedAt: Timestamp | null,
  templateOf: string | null         // se è un template, da quale doc deriva
}
```

### 3.2 Formato `content` (ProseMirror JSON)

Documento `doc` con nodi standard TipTap + 4 nodi custom:

```jsonc
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Roadmap Q2" }] },
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Owner: " },
      { "type": "user-mention", "attrs": { "email": "marco@inglesina.it", "label": "Marco" } }
    ]},
    { "type": "task-mention", "attrs": { "taskId": "abc123" } },
    { "type": "project-mention", "attrs": { "projectId": "p_def456", "view": "card" } },
    { "type": "task-embed", "attrs": {
      "filter": { "projectId": "p_def456", "status": ["todo", "doing"] },
      "view": "list",
      "limit": 20
    }},
    { "type": "callout", "attrs": { "tone": "warning" }, "content": [...] },
    // ... bulletList, orderedList, codeBlock, blockquote, table, image, divider
  ]
}
```

### 3.3 Sub-collezione `presence` (lock visuale)

```ts
nebulaDocs/{docId}/presence/{userId} {
  userId: string,                   // = email per coerenza con team/
  displayName: string,
  avatarSeed: string,               // per StarAvatar
  lastSeenAt: Timestamp,            // heartbeat ogni 15s
  activeBlock: string | null,       // id del blocco ProseMirror in focus
  cursorColor: string               // hex deterministico da userId
}
```

**TTL:** documento "vivo" se `lastSeenAt > now() - 30s`. Una Cloud Function `presenceCleanup` (scheduled ogni 5 min) elimina i record con `lastSeenAt < now() - 5min`.

### 3.4 Sub-collezione `history` (snapshot)

```ts
nebulaDocs/{docId}/history/{revId} {
  revision: number,                 // = nebulaDocs.revision al momento dello snapshot
  content: object,                  // ProseMirror JSON completo
  title: string,
  savedAt: Timestamp,
  savedBy: string,
  trigger: 'autosave' | 'manual' | 'mcp' | 'restore'
}
```

**Policy:** snapshot ogni 10 minuti di edit attivo, oppure ogni 50 modifiche, oppure on-demand. Retention: ultimi 50 snapshot + 1 al giorno per gli ultimi 30 giorni (Cloud Function `historyPrune` quotidiana).

---

## 4. Editor — TipTap

### 4.1 Stack

| Dipendenza | Versione target | Bundle (gzip) | Note |
|---|---|---|---|
| `@tiptap/vue-3` | ^2.x | ~12 KB | core |
| `@tiptap/starter-kit` | ^2.x | ~25 KB | heading, list, code, blockquote, ecc. |
| `@tiptap/extension-placeholder` | ^2.x | ~1 KB | testo "Inizia a scrivere…" |
| `@tiptap/extension-table` + `table-row/cell/header` | ^2.x | ~8 KB | tabelle |
| `@tiptap/extension-mention` | ^2.x | ~3 KB | base per task/project/user mention |
| `tippy.js` | ^6 | ~6 KB | popover suggester (dep transitiva mention) |
| `fuse.js` | ^7 | ~6 KB | ricerca fuzzy icon picker + mention |

**Totale stimato:** ~60 KB gzip caricato **solo sullo scope `/nebula/docs/*`** via lazy chunk (`defineAsyncComponent`). Zero impatto su POPS, SIDERA home, altre PWA.

### 4.2 Slash menu `/`

Comandi disponibili (i primi 8 sopra il fold, scroll per il resto):

```
/h1, /h2, /h3        — titoli
/lista, /num, /todo  — liste
/quote, /callout     — blocchi enfasi
/code                — code block
/divider             — separatore
/tabella             — table 3×3 default
/task                — mention task CEPHEID
/progetto            — mention progetto CEPHEID
/lista-task          — embed lista filtrata
/doc                 — link a altro doc NEBULA
/persona             — @mention utente team
/icona               — inline Material icon
```

> Nota: `/immagine` non incluso in v1 (vedi decisione §12 — nessun upload immagini per ora).

### 4.3 Nodi custom — specifica

**`task-mention`** (`atom: true, inline: true`)
- attrs: `{ taskId: string }`
- render: chip con `<MaterialIcon name="task_alt"/>` + titolo task + badge stato colorato
- dati: subscribe live a `cepheid_tasks/{taskId}` (cache 60s con `useTaskCache` composable shared)
- click: apre modal task (riusa `TaskDetailModal` esistente di CEPHEID)
- stato eliminato: chip grigio "[Task eliminato]" non cliccabile, ma il nodo resta (storico)

**`project-mention`** (`atom: true, inline: false` di default; `inline: true` se attr `view='inline'`)
- attrs: `{ projectId: string, view: 'card' | 'inline' }`
- `view: 'card'`: card 100% width con nome progetto, owner avatar, progress bar, count azioni
- `view: 'inline'`: chip compatto come task-mention
- subscribe: `projects/{projectId}` (cache 5min)

**`task-embed`** (`atom: true, inline: false`)
- attrs: `{ filter: object, view: 'list' | 'kanban' | 'calendar', limit: number }`
- è una **vista live**: query Firestore con i filtri specificati, render in-place
- limit hard: 50 (oltre → "Mostra altri →" che apre vista filtrata in CEPHEID)
- editabile via panel laterale ("⚙ Modifica filtri")

**`user-mention`** (`atom: true, inline: true`)
- attrs: `{ email: string, label: string }`
- render: `@Nome` con StarAvatar inline (riusa componente esistente)
- trigger notifica via Cloud Function `notifyOnMention` (FCM scope `nebula`)

### 4.4 Autosave & debounce

- Debounce 1.5s dopo l'ultima modifica → write su Firestore
- Indicatore in toolbar: "Salvato" / "Salvataggio…" / "Errore — riprovo tra 5s"
- Su errore: retry con backoff exponential (5s, 15s, 60s), poi alert utente
- Su `beforeunload` con modifiche pending: alert standard "Modifiche non salvate"

---

## 5. Presence & last-write-wins (LWW)

### 5.1 Presence client

Composable `useDocPresence(docId)`:

```ts
// All'apertura del doc:
onMounted(() => {
  setDoc(presenceRef, { userId, displayName, lastSeenAt: serverTimestamp(), ... })
  heartbeat = setInterval(() => updateLastSeen(), 15_000)
})

// Subscribe agli altri:
onSnapshot(presenceCollection, (snap) => {
  activeUsers.value = snap.docs
    .filter(d => isRecent(d.data().lastSeenAt))
    .map(d => d.data())
})

// Su focus blocco:
editor.on('focus', (block) => updatePresence({ activeBlock: block.id }))

// Su chiusura:
onBeforeUnmount(() => {
  clearInterval(heartbeat)
  deleteDoc(presenceRef)
})
```

### 5.2 UI presence

- **Avatar stack** in toolbar in alto a destra (StarAvatar shared, già esistente) — fino a 3 + "+N"
- **Lock visuale per paragrafo**: il blocco con `activeBlock = userX` mostra un **bordo accent sinistro** del `cursorColor` di userX + tooltip "Mario sta scrivendo…" su hover (NO chevron, NO emoji — coerente con `feedback_no_chevrons`)
- Toast non invasivo quando un altro utente apre il doc ("Marco ha aperto questo doc")

### 5.3 Conflict resolution = LWW per documento (semplice)

**Strategia v1 (semplicissima):**
- Ogni save invia `content` completo + `revision` letta all'apertura
- Server-side (Cloud Function `saveDoc` callable, NON write diretto):
  - Se `currentDoc.revision === incoming.baseRevision` → accetta, incrementa revision
  - Altrimenti → respinge con `409 Conflict` + restituisce versione corrente
- Client su 409: mostra dialog "Marco ha salvato modifiche mentre scrivevi. **Apri diff** | **Sovrascrivi** | **Scarta le tue**"

**Mitigazione conflitti (riduzione probabilità):**
- Presence lock visuale **scoraggia** edit simultaneo sullo stesso paragrafo
- Autosave aggressivo (1.5s debounce) riduce la finestra di conflitto
- I conflitti reali saranno rari (team ~10 persone, raramente sullo stesso doc allo stesso istante)

**Quando ci sarà bisogno di CRDT (Yjs):** se misuriamo > 2 conflitti / settimana su doc condivisi (oppure se più di 3 persone editano contemporaneamente come prassi), apriamo POLARIS azione dedicata "NEBULA-DOCS collab real-time" e introduciamo Yjs + Hocuspocus. Schema Firestore resta uguale (Yjs binary serializzato in un campo, ProseMirror JSON è snapshot derivato).

---

## 6. Claude integration — Livello A (MCP)

### 6.1 Cosa fa

Esponiamo un **MCP server HTTP** che Claude Desktop / claude.ai aggiunge come connettore custom. Da chat esterna Claude può: cercare, leggere, creare, e aggiornare doc NEBULA — esattamente come oggi fa con Notion.

### 6.2 Deploy

**Opzione A (consigliata):** Cloud Run service dedicato — Node 22 + `@modelcontextprotocol/sdk` + Firebase Admin SDK. Region `europe-west1`. Auth: API key dedicata per ogni utente Claude (generata da `/nebula/docs/settings` → "Connetti Claude").

**Opzione B (più semplice ma limitata):** Cloud Functions HTTP `mcpNebula`. Limite cold start (~2s) accettabile per uso esplorativo, fastidioso per chat lunghe.

### 6.3 Tools esposti

| Tool MCP | Input | Output | Permessi |
|---|---|---|---|
| `nebula.search` | `{ query: string, limit?: number }` | array `{ docId, title, snippet, path }` | read user.docs |
| `nebula.getDoc` | `{ docId: string, format?: 'markdown' \| 'prosemirror' }` | doc content in formato richiesto | read doc |
| `nebula.listDocs` | `{ parentId?: string, limit?: number }` | tree node | read user.docs |
| `nebula.createDoc` | `{ title, parentId?, content?: markdown, icon? }` | `{ docId, url }` | write parent |
| `nebula.appendBlock` | `{ docId, markdown: string }` | `{ revision }` | write doc |
| `nebula.replaceSection` | `{ docId, sectionAnchor, markdown }` | `{ revision }` | write doc |
| `nebula.linkTask` | `{ docId, taskId, position?: 'end' }` | `{ revision }` | write doc + read task |
| `nebula.linkProject` | `{ docId, projectId, position?: 'end' }` | `{ revision }` | write doc + read project |

### 6.4 Formato di scambio

Claude lavora in **markdown esteso**:
- markdown standard (heading, lista, code, ecc.)
- `@task:abc123` → convertito in nodo `task-mention` (e viceversa in read)
- `@project:p_def456` → `project-mention`
- `@user:marco@inglesina.it` → `user-mention`
- `{{embed-tasks: projectId=p_def456, status=todo,doing}}` → `task-embed`

Server fa conversione markdown ⇄ ProseMirror JSON via `marked` + transformer custom. Test unitari obbligatori per round-trip (markdown → JSON → markdown deve essere idempotente).

### 6.5 Sicurezza

- **API key per utente**, scope = stesso ACL dell'utente Firebase corrispondente
- Rate limit: 60 req/min per key
- Log di ogni operazione write in `nebulaDocs/{docId}/history` con `trigger: 'mcp'` + email utente
- Nessuna API key Anthropic server-side (Claude chiama il nostro MCP, non viceversa)

### 6.6 Setup utente

1. Utente apre `/nebula/docs/settings/integrations`
2. Click "Connetti Claude" → genera API key (mostrata una sola volta) + URL MCP server
3. Utente copia in Claude Desktop config / claude.ai connettori
4. Test: in Claude scrivi "cerca doc nebula con 'roadmap'" → deve funzionare

---

## 7. Icon picker — Material Symbols

### 7.1 Componente locale a NEBULA-DOCS

`src/views/nebula/docs/components/IconPicker.vue` — **usato esclusivamente nei documenti NEBULA in v1** (icona pagina, eventualmente icona inline futura via `/icona`).

**Niente riuso speculativo.** CEPHEID continua coi suoi colorino+iniziale, POPS Admin e QUASAR restano com'erano. Se in futuro un secondo consumer reale ha bisogno dello stesso picker, lo promuoviamo a `src/components/shared/` allora — non prima (regola: shared = ≥2 consumer reali).

**Catalogo e wrapper render** vivono nella stessa cartella:
- `src/views/nebula/docs/components/IconPicker.vue` — picker UI
- `src/views/nebula/docs/components/MaterialIcon.vue` — wrapper render
- `src/views/nebula/docs/iconCatalog.ts` — array curato

### 7.2 Curated set — ~250 icone in 8 categorie

File `src/views/nebula/docs/iconCatalog.ts`:

```ts
export const ICON_CATALOG = {
  lavoro: [
    'work', 'business_center', 'badge', 'apartment', 'store', 'storefront',
    'factory', 'engineering', 'construction', 'precision_manufacturing',
    'inventory_2', 'package_2', 'local_shipping', 'forklift',
    /* ~30 totali */
  ],
  documenti: [
    'description', 'article', 'note', 'sticky_note_2', 'menu_book',
    'auto_stories', 'receipt_long', 'contract', 'gavel', 'policy',
    'folder', 'folder_open', 'folder_shared', 'topic', 'snippet_folder',
    /* ~35 */
  ],
  persone: [
    'person', 'group', 'groups', 'diversity_3', 'family_restroom',
    'support_agent', 'manage_accounts', 'admin_panel_settings',
    /* ~25 */
  ],
  task: [
    'task_alt', 'check_circle', 'pending', 'schedule', 'event',
    'calendar_month', 'today', 'date_range', 'alarm', 'timer',
    'flag', 'priority_high', 'low_priority', 'list_alt', 'checklist',
    /* ~30 */
  ],
  spazio: [
    'rocket_launch', 'travel_explore', 'public', 'language',
    'satellite_alt', 'cell_tower', 'router', 'lan',
    /* ~20 — coerente col tema astronomico suite */
  ],
  comunicazione: [
    'chat', 'forum', 'campaign', 'mail', 'send',
    'notifications', 'notifications_active', 'phone', 'videocam',
    /* ~25 */
  ],
  finanza: [
    'payments', 'receipt', 'request_quote', 'savings', 'account_balance',
    'euro', 'attach_money', 'price_change', 'sell', 'shopping_cart',
    /* ~25 */
  ],
  generale: [
    'home', 'star', 'favorite', 'bookmark', 'label',
    'lightbulb', 'tips_and_updates', 'psychology', 'visibility',
    'settings', 'tune', 'build', 'handyman',
    /* ~60 — catch-all per icone trasversali */
  ]
}
```

**Selezione criterio:** ho preso solo icone che (a) hanno una metafora ovvia, (b) sono leggibili a 20px, (c) non sembrano emoji travestite. Niente food/transport/animals.

### 7.3 UI picker

```
┌─────────────────────────────────────────────────────────┐
│  [🔍 Cerca icona...]                              [×]   │
├─────────────────────────────────────────────────────────┤
│  Categorie: Lavoro  Documenti  Persone  Task  Spazio   │
│            Comunicazione  Finanza  Generale            │
├─────────────────────────────────────────────────────────┤
│   📄  ✓   ▣   ⚙   ⏱   🚀   ⭐   ★   ◉   ▢   ⬛   ◐    │
│   📄  ✓   ▣   ⚙   ⏱   🚀   ⭐   ★   ◉   ▢   ⬛   ◐    │
│   ...griglia 10 colonne, virtualizzata...               │
├─────────────────────────────────────────────────────────┤
│  Colore:  ●  ●  ●  ●  ●  ●  ●  [picker custom]         │
│  Stile:   [Outlined ●─○ Filled]                         │
│  Anteprima: 📄 Roadmap Q2 (24px) | 📄 (16px)            │
└─────────────────────────────────────────────────────────┘
```

(Le icone in ASCII sopra sono placeholder — nella realtà sono `<span class="material-symbols-outlined">{name}</span>`.)

**Ricerca:** Fuse.js su array piatto di tutti i nomi, threshold 0.3.
**Color swatch:** palette M3 derivata dal primario NEBULA `#C46030` (tono base + 4 varianti tonal) + neutri. Letta da `SCOPE_CONFIGS.nebula` per restare allineata se il brand cambia.
**Anteprima:** mostra l'icona scelta a 24px (icona pagina) e 16px (inline mention) per validare leggibilità.

### 7.4 Wrapper render

Componente `<MaterialIcon>` locale a NEBULA-DOCS:

```vue
<span
  class="material-symbols-outlined"
  :style="{ color, fontVariationSettings: `'FILL' ${fill}` }"
  :class="[`mi-size-${size}`]"
>{{ name }}</span>
```

Stile globale già presente in `style.css` (font caricato dalla `<link>` Google Fonts in `index.html`).

---

## 8. Routing e UX

### 8.1 Rotte

| Path | Vista | Note |
|---|---|---|
| `/nebula/docs` | `NebulaDocsHomeView` | Lista doc recenti + tree gerarchia in sidebar |
| `/nebula/docs/:docId` | `NebulaDocView` | Editor singolo doc |
| `/nebula/docs/:docId/history` | `NebulaDocHistoryView` | Timeline snapshot con restore |
| `/nebula/docs/settings/integrations` | `NebulaIntegrationsView` | Setup MCP / Claude |
| `/nebula/docs/trash` | `NebulaDocsTrashView` | Doc archiviati ultimi 90gg |

Tutte sotto guard `nebulaScope` (già esistente), `meta: { nebulaScope: true }`.

### 8.2 Layout NEBULA (modifiche)

`NebulaTeamView` attuale resta come prima tab. Aggiunta nella bottom-nav mobile (`SCOPE_CONFIGS.nebula.mobileNav`):

```ts
mobileNav: [
  { path: '/nebula', label: 'Team', icon: 'groups' },
  { path: '/nebula/docs', label: 'Doc', icon: 'description' },  // NEW
  { path: '/nebula/anagrafiche', label: 'Anagrafiche', icon: 'badge' },  // futuro
]
```

### 8.3 Sidebar desktop (SIDERA)

Dentro accordion NEBULA (già implementato post-PR #26):
- Team
- **Documenti** (NEW)
  - Recenti
  - Tutti i doc
  - Cestino
- Anagrafiche (futuro)

---

## 9. Security rules Firestore

```
match /nebulaDocs/{docId} {
  allow read: if isAuthenticated() && (
    resource.data.acl.visibility == 'public' ||
    request.auth.token.email in resource.data.acl.readers ||
    request.auth.token.email in resource.data.acl.writers ||
    request.auth.token.email in resource.data.acl.owners ||
    (resource.data.acl.visibility == 'team' && isTeamMember())
  );

  // Write SOLO via Cloud Function callable saveDoc (per gestire revision check)
  allow write: if false;

  match /presence/{userId} {
    allow read: if isAuthenticated();
    allow write: if request.auth.token.email == userId;
  }

  match /history/{revId} {
    allow read: if /* stessa logica read del parent */;
    allow write: if false;  // solo da Cloud Function
  }
}
```

`isTeamMember()`: già esiste, controlla `team/{email}`.

---

## 10. Cloud Functions

| Function | Trigger | Scopo |
|---|---|---|
| `saveDoc` | `https.onCall` | LWW check, write doc, snapshot history se trigger interval |
| `indexDocRefs` | `onDocumentWrite(nebulaDocs/{docId})` | Estrae `refs.tasks`/`projects`/`users` da `content` JSON, denormalizza |
| `notifyOnMention` | `onDocumentCreate(nebulaDocs/{docId})` + diff `onUpdate` | FCM push (scope `nebula`) agli utenti newly-mentioned |
| `presenceCleanup` | scheduled (every 5 min) | Elimina presence stale (lastSeenAt < now - 5min) |
| `historyPrune` | scheduled (daily) | Mantiene ultimi 50 snapshot + 1/giorno per 30gg |
| `mcpNebula` | `https.onRequest` (o Cloud Run) | Endpoint MCP server |

**Costi stimati (10 utenti, ~50 doc, ~100 edit/giorno):** invariato sull'ordine di grandezza. `indexDocRefs` è la function più chiamata (~1 invocazione per save) → ~3k invocazioni/mese, ben dentro free tier.

---

## 11. Rollout — fasi

### Fase 1 — Foundation ✅ COMPLETATA (in prod)
- [x] `IconPicker` + `MaterialIcon` wrapper + `iconCatalog.ts` (~250 icone) — tutto sotto `src/views/nebula/docs/`
- [x] Schema Firestore + security rules + `saveDoc` callable
- [x] Vista lista `NebulaDocsHomeView` (no editor)
- [x] Vista editor `NebulaDocView` con TipTap base (no mention)
- **Deploy:** ✅ mergiata in `main`

### Fase 2 — CEPHEID integration ✅ COMPLETATA (in prod)
- [x] Nodo `task-mention` + suggester `/task`
- [x] Nodo `project-mention` + suggester `/progetto`
- [x] Nodo `task-embed` + panel filtri
- [x] Function `indexDocRefs` + pannello "Doc collegati" in CEPHEID task detail
- **Deploy:** ✅ mergiata in `main`

### Fase 3 — Presence & history ✅ COMPLETATA (in prod)
- [x] `useDocPresence` composable (`src/composables/nebula/useDocPresence.ts`)
- [x] UI avatar stack + lock paragrafo
- [x] LWW conflict resolution + dialog (`useSaveDoc.ts`, check `baseRevision` / 409)
- [x] Vista history + restore (`NebulaDocHistoryView.vue`, `useDocHistory.ts`)
- **Deploy:** ✅ mergiata in `main`
- **Nota:** questa fase copre la collaborazione **non-real-time** (presence visuale + LWW). La collaborazione simultanea vera (CRDT) è la Fase 6, gated — vedi sotto.

### Fase 4 — Claude MCP ✅ COMPLETATA (in prod)
- [x] MCP server (Cloud Functions HTTP `mcpNebula`, region `europe-west1`) — **dual auth** (Claude Desktop via `mcp-remote` stdio + claude.ai Streamable HTTP)
- [x] 8 tool MCP (`nebula.search`/`getDoc`/`listDocs`/`createDoc`/`appendBlock`/`replaceSection`/`linkTask`/`linkProject`)
- [x] Vista integrazioni con generazione API key (`useApiKeys.ts`, `useOAuthConsent.ts`)
- [x] Doc utente per la connessione
- **Deploy:** ✅ mergiata in `main`. Endpoint: `europe-west1-preventivatoreb2b-ii.cloudfunctions.net/mcpNebula`
- **Nota:** chiavi/integrazioni Claude/MCP successivamente spostate da NEBULA a **CORE → Integrazioni** (refactor `847a147`).

### Fase 5 — Polish ✅ COMPLETATA (in prod, rolling)
- [x] `user-mention` + `notifyOnMention`
- [x] Share dialog (`useShareDoc.ts`) + badge privacy su card (Pubblico/Squadra/Parziale/Privato)
- [x] Archiviazione/GC doc (`useArchiveDoc.ts`)
- [x] TaskList con checkbox; Undo/Redo in toolbar; restyle stile CEPHEID-Progetti; rinomina "Doc → Documenti", "Team → Squadra"; fix loop banner Service Worker
- [ ] Templates ("Verbale riunione", "Spec progetto", "Onboarding") — *non ancora fatto, candidato futuro*
- [ ] Ricerca full-text dedicata (Algolia / Firestore extension) — *oggi ricerca su `contentText`*
- [ ] Export markdown / PDF — *non ancora fatto*
- [ ] Upload immagini + cover — *escluso da v1 (§12), valutato solo su richiesta reale*

### Fase 6 — Real-time (Yjs/CRDT) 🚧 IN CORSO (branch `feature/nebula-docs-realtime`)
Scelta architetturale: **provider Firestore-native** (NO Cloud Run/Hocuspocus/WebSocket), **cursori live** (Awareness), **sostituzione diretta** di LWW con **kill-switch** globale.

**Fatto e verificato (checkpoint additivo, non-breaking — `saveDoc`/editor live intatti):**
- [x] Deps: `yjs` + `@tiptap/y-tiptap` + `extension-collaboration(+caret)@3.23.6` (client) e stack tiptap/prosemirror (functions). `yjs` deduplicato a 1 copia.
- [x] **Schema headless condiviso** `src/functions/lib_yjs/pmSchema.ts` (linchpin anti-drift) + helper `ydoc.ts`. Round-trip semantico verificato su tutti i nodi (test vitest 9/9).
- [x] **FirestoreYjsProvider** `src/composables/nebula/FirestoreYjsProvider.ts` (echo-suppression 2 livelli, batching 350ms, awareness 300ms, re-baseline post-compaction).
- [x] CF: `initYDoc` + `backfillYDocs` (migrazione first-writer-wins), `nebulaYjsMaintenance` (compaction no-loss + proiezione `content`), `snapshotDoc`/`restoreDoc` (history via `updateYFragment`), `awarenessCleanup`.
- [x] Rules `yupdates` (append-only, create writer) + `awareness`; indici CG; kill-switch `core/nebula.collabEnabled`.
- [x] Vitest introdotto; `manualChunks` Vite include lo stack Yjs nel chunk lazy.

**Cutover — code-complete (commit successivo, build+typecheck+test verdi):**
- [x] **6.2** Wiring editor: `NebulaDocView` ora wrapper keyed-by-docId → `NebulaDocPage` con `useCollabDoc` + Collaboration/CollaborationCaret. Editor read-only finché provider 'synced'. Kill-switch → fallback read-only su `content`. Cursori live + status "Live · N attivi".
- [x] **6.6** Scritture MCP (`saveDocCore` + 4 tool): applicano al Y.Doc via `applyJSONToYDoc`, appendono delta origin 'mcp', proiettano `content`. Base letta dal Y.Doc LIVE (`liveDocJSON`) per non perdere edit concorrenti. createDoc seeda il Y.Doc.
- [x] **6.7** Rimosso 409/LWW da `saveDoc` (ora solo title/icon scalari). `restoreDoc` callable usato da NebulaDocHistoryView (apply via updateYFragment, no setContent). Cmd+S → `snapshotDoc`.
- [x] **6.8** Presence da Awareness (`peers` in useCollabDoc); heartbeat `presence` Firestore ritirato (composable dormiente, resta per tipo + `cursorColorFor`).

**Resta (operativo, NON codice — richiede autorizzazione + deploy):**
- [ ] Deploy ATOMICO `functions,hosting` + rules + indici (l'editor ora richiede le CF: deploy parziale lo romperebbe).
- [ ] `backfillYDocs` (callable, CORE admin) su tutti i doc esistenti.
- [ ] Verifica two-browser; opzionale: pre-deploy con `core/nebula.collabEnabled=false`, validare, poi flip ON.

**Note tecniche scoperte in implementazione:**
- XmlFragment **deve** chiamarsi `'default'` (Collaboration) — `prosemirrorJSONToYDoc` ha default `'prosemirror'`: mismatch = doc vuoto sul client. Centralizzato in `NEBULA_YJS_FIELD`.
- `@tiptap/y-tiptap@3.0.4` ri-esporta `updateYFragment`/`prosemirrorJSONToYDoc`/`yDocToProsemirrorJSON` → **stessa libreria client+server** (drift minimo). `updateYFragment` vuole meta `{mapping, isOMark}` (createEmptyMeta non esportato) e produce diff incrementali puliti (~58 byte) → niente fallback rebuild.
- Server: bytes Yjs come `Buffer` nativo Admin SDK (`admin.firestore.Bytes` non esiste); client web come `Bytes.fromUint8Array`.

Gate originale (§5.3) superato: la feature è stata richiesta esplicitamente. Resta documentato che la latenza Firestore è ~0.3–1s (non sub-100ms) e c'è write-amplification mitigata da batching/compaction.

---

## 12. Decisioni — risolte (2026-05-25)

- [x] **Privacy default:** `private`. Filosofia: NEBULA-DOCS è lo spazio dove ti senti libero di buttare giù qualunque cosa. I doc che diventano "ufficiali" li condividi esplicitamente. Indicatore in toolbar: "🔒 Solo tu" → click apre share dialog. (Cambia rispetto a Notion enterprise default, ma coerente con come la useremo davvero.)
- [x] **CEPHEID task detail:** sezione collassabile in fondo al tab "Dettagli" del `TaskDetailModal`, hidden quando `refs.length === 0`. Stessa logica in `ProjectDetailModal`. Niente tab nuova.
- [x] **Feature flag:** costante `enableNebulaDocs` in `src/views/sidera/scopeConfig.ts` (sotto `SCOPE_CONFIGS.nebula`). In Fase 1: `enableNebulaDocs && isUserAdmin()`. In Fase 2: `true` per tutti. Toggle = 1 commit + deploy. Niente collection `core/flags` da introdurre.
- [x] **Slug URL:** solo `docId`. Path `/nebula/docs/{docId}`. Titolo solo in `<title>` tag + breadcrumb. Zero gestione slug-history/redirect.
- [x] **Trash retention:** 90 giorni. Cloud Function `historyPrune` (giornaliera) hard-delete dei doc con `archived === true && archivedAt < now() - 90d`.
- [x] **Storage immagini:** **non implementato in v1.** Niente upload immagini, niente comando `/immagine`, niente campo `cover`. Si scrive solo testo + mention + embed. Valutiamo l'aggiunta in Fase 5 (Polish) o successiva, se emerge l'esigenza reale (è probabile, ma non blocchiamo il rilascio aspettandola).
- [x] **Branch base:** `feature/nebula-docs-foundation` da `main` (verificato 2026-05-25: main pulito, WIP attivi su star-avatar/admin-orders non hanno overlap). Rebase periodico su main durante le 5 fasi. Merge incrementale in main dietro `enableNebulaDocs: false` per Fase 1-3.

---

## 13. Rischio POPS

Modifiche a file POPS condivisi previste:
- `src/router/index.ts` — aggiunta blocco rotte `/nebula/docs/*` (rischio basso, additivo)
- `src/views/sidera/scopeConfig.ts` — aggiornamento `SCOPE_CONFIGS.nebula.mobileNav` (rischio basso)
- `src/views/sidera/SideraLayout.vue` — voce "Documenti" sotto accordion NEBULA (rischio basso)
- `index.html` — nessuna modifica (Material Symbols già caricato)
- `vite.config.ts` — nessuna modifica (TipTap è lazy chunk)
- `firestore.rules` — aggiunta blocco `nebulaDocs` (rischio basso, additivo)
- `firebase.json` — nessuna modifica
- `src/functions/index.ts` — aggiunta 5-6 function (rischio basso, additivo)

**Pre-merge checklist (per ogni PR):**
- [ ] POPS login + dashboard funzionanti
- [ ] Type-check verde
- [ ] Build verde con bundle size diff verificato
- [ ] Test manuale dello scope toccato

---

## 14. Riferimenti

- [POLARIS](POLARIS.md) — questa feature **non sostituisce** alcuna azione POLARIS aperta; è additiva. Da inserire come futura azione 8 quando si decide di iniziare.
- [ATLAS](ATLAS.md) §3 — ricetta per nuove view sotto scope esistente
- [WORKFLOW](WORKFLOW.md) — branching, review, deploy
- ProseMirror reference: https://prosemirror.net/docs/ref/
- TipTap docs: https://tiptap.dev/docs
- Model Context Protocol: https://modelcontextprotocol.io/
- Material Symbols: https://fonts.google.com/icons
