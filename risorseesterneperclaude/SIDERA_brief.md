# SIDERA ✦ — Brief tecnico per Claude Code

## Contesto generale

**Inglesina Italiana** è un'azienda artigianale italiana che produce griglie decorative in alluminio in stile inglese (Georgian bars) per vetrocamera. Ha sede a Sant'Angelo Lodigiano (LO). Il sito è `www.inglesinaitaliana.it`.

Esiste già uno strumento interno chiamato **POPS** (gestionale B2B ordini e preventivi), costruito in Vue 3 + TypeScript + Firebase, accessibile su `b2b.inglesinaitaliana.it`. Il codice sorgente di POPS è su GitHub: `https://github.com/InglesinaItaliana/preventivatoreb2b-ii`. SIDERA deve **riutilizzare la stessa Firebase project, gli stessi utenti Auth, e seguire gli stessi pattern architetturali di POPS**.

---

## Cos'è SIDERA

SIDERA è la piattaforma hub interna di Inglesina Italiana. Dal nome latino *sidera* (stelle — guida per la navigazione). È il punto da cui **Daniel (Admin)** governa tutto: progetti, task, chat, comunicazioni, e accede a POPS. Non è un'app separata: è un secondo modulo dello stesso ecosistema.

Obiettivo finale (visione): un unico hub con moduli per progetti/task, chat aziendale, archivio/wiki, CRM clienti, calendario condiviso, e assistente AI. Il **MVP** include solo progetti, task, chat base, e home personalizzata.

**URL di produzione:** `inglesinaitaliana.it/sidera` (o sottodominio `sidera.inglesinaitaliana.it`)

---

## Stack tecnico

Identico a POPS:

- **Framework:** Vue 3 con Composition API + `<script setup>`
- **Linguaggio:** TypeScript
- **Build:** Vite
- **Stile:** Tailwind CSS + variabili CSS custom per i colori specifici
- **Backend:** Firebase (Auth, Firestore, Hosting) — stessa project di POPS
- **State management:** Pinia
- **Routing:** Vue Router (nuove route sotto `/sidera`)
- **Deploy:** GitHub Actions → Firebase Hosting

**Dipendenze aggiuntive rispetto a POPS:**
- `vue-draggable-plus` o `@vueuse/gesture` per il kanban drag-and-drop
- `@tiptap/vue-3` per il rich text nelle Note di progetto (Fase 2)
- `@vueuse/core` (probabilmente già presente)

---

## Design system

### Palette colori

```
--color-bg:           #ECEAE5   /* sfondo generale */
--color-sidebar:      #F2F0EB   /* sfondo sidebar */
--color-surface:      #FFFFFF   /* card, pannelli */
--color-surface-up:   #F8F7F3   /* elementi elevati */
--color-border:       #E0DDD7   /* bordi standard */
--color-border-mid:   #D0CCC5   /* bordi hover */
--color-text:         #1A1815   /* testo primario */
--color-text-mid:     #6A6560   /* testo secondario */
--color-text-dim:     #B4B0AA   /* testo dimmed, label */

--color-green:        #2F6B4A   /* accento SIDERA (verde Georgian) */
--color-green-light:  #3D8B60   /* hover green */
--color-green-text:   #245A3C   /* testo su green glow */
--color-green-glow:   rgba(47,107,74,0.07)
--color-green-border: rgba(47,107,74,0.18)

--color-pops:         #C8821A   /* accento POPS (arancione Polestar) */
--color-pops-glow:    rgba(200,130,26,0.08)
--color-pops-border:  rgba(200,130,26,0.22)

--color-priority-alta:   #C8521A
--color-priority-media:  #2F6B4A
--color-priority-bassa:  #7A8FA6

--shadow-card:   0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)
--shadow-hover:  0 4px 16px rgba(0,0,0,0.09)
```

### Tipografia

```html
<!-- In index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
```

- **Display / titoli pagina:** `'Cormorant Garamond', serif` — italic, peso 400–500
- **UI / tutto il resto:** `'Outfit', sans-serif` — peso 300–600

Esempio titolo pagina:
```css
font-family: 'Cormorant Garamond', serif;
font-style: italic;
font-size: 30–34px;
font-weight: 400;
```

---

## Ruoli utenti

| Ruolo | Chi | Permessi |
|-------|-----|----------|
| `admin` | Daniel | Tutto: crea/elimina progetti, gestisce utenti, vede tutto |
| `coordinator` | Eva | Vede tutti i progetti assegnati, crea/assegna task, non modifica struttura |
| `member` | Dipendenti | Vede solo i propri progetti/task, aggiorna stato, commenta |

Il ruolo è salvato in `users/{uid}.role` su Firestore. Le Firestore Security Rules devono essere aggiornate di conseguenza.

---

## Struttura navigazione

**Sidebar fissa (220px larghezza):**

```
┌─────────────────────────────┐
│  SIDERA ✦                   │  ← Cormorant Garamond, ✦ in verde
├─────────────────────────────┤
│  WORKSPACE                  │  ← label sezione, uppercase 10px
│  🏠 Il Mio Giorno           │
│  ☑  Task                    │
│  ⊞  Progetti                │
│  💬 Chat                    │
├─────────────────────────────┤
│  IN ARRIVO                  │
│  📁 Archivio  [PRESTO]      │  ← disabled, opacity 0.35
├─────────────────────────────┤
│  POPS  ↗                    │  ← stile arancione, ExternalLink icon
├─────────────────────────────┤
│  [D] Daniel · Admin  ⚙      │  ← avatar + ruolo + settings
└─────────────────────────────┘
```

Il link POPS porta a `b2b.inglesinaitaliana.it`. È visivamente distinto con il colore arancione POPS come background tint e bordo.

---

## Specifiche schermate

### 1. IL MIO GIORNO (Home — route: `/sidera`)

Schermata di atterraggio personale. Diversa per Admin vs Member.

**Layout:** griglia 2 colonne (1fr + 286px)

**Colonna sinistra:**
- Saluto: `"Buongiorno, [Nome]."` — Cormorant Garamond italic 34px
- Sottotitolo: data + numero task per oggi
- Sezione "Le mie task — oggi":
  - Task cards con checkbox funzionante
  - Ogni card: checkbox + titolo + badge progetto (colorato) + scadenza
  - Click checkbox → task completata (aggiorna Firestore)

**Colonna destra:**
- Sezione "Progetti attivi":
  - Mini-card per progetto (max 3): nome, barra progresso, % + task rimaste + data
  - Click → naviga al progetto
- Sezione "Aggiornamenti team":
  - Feed attività: avatar + "Nome ha [azione] [oggetto]" + timestamp
  - Dati da collection `activity` ordinati per `createdAt` desc, limit 5

**Vista Admin (Daniel):** vede task proprie + tutte le task non assegnate urgenti
**Vista Member:** vede solo le proprie task

---

### 2. TASK (route: `/sidera/tasks`)

Vista globale di tutte le task (o solo proprie).

**Header:** "Task" (Cormorant Garamond italic) + pulsante "+ Nuova task" (Admin/Coordinator)
**Sottotitolo:** "X da completare · Y in ritardo"

**Filter tabs** (pill-style, sfondo surfaceUp):
- `Le mie` — solo task dell'utente corrente
- `Tutte` — tutte le task (Admin/Coordinator vedono tutto, Member solo le proprie)
- `⚠ In ritardo` — task con dueDate < oggi e non completate

**Task raggruppate per:**
- **Oggi** — dueDate === oggi (dot verde)
- **Questa settimana** — dueDate entro 7 giorni (dot textMid)
- **Più avanti** — dueDate > 7 giorni (dot textDim)
- (Per "In ritardo": unico gruppo con dot rosso)

**Header gruppo:**
```
● OGGI ─────────────────────────── 3
```
(dot colorato + label uppercase + linea flex-grow + count)

**Riga task:**
```
[ ] ● Titolo task              [POPS] [D] Oggi
```
- Checkbox (funzionante)
- Dot priorità (alta=rosso, media=verde, bassa=blu)
- Titolo (flex 1)
- Badge progetto (colorato)
- Avatar assegnatario (cerchio 24px)
- Scadenza (rosso se in ritardo)

**Azione "+ Nuova task":** apre modal/drawer con: titolo, progetto, assegnatario, priorità, scadenza.

---

### 3. PROGETTI (route: `/sidera/projects`)

**Header:** "Progetti" italic + "+ Nuovo progetto" (solo Admin)
**Sottotitolo:** "X attivi · Y archiviati"

**Griglia 2 colonne** di project card:

```
┌──────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← stripe colore (3px, borderRadius top)
│ Nome Progetto          ···   │
│ Descrizione breve            │
│                              │
│ 9/12 task          ████░ 78% │
│                              │
│ [E][M][D]            ⏱ 30 giu│
└──────────────────────────────┘
```

- Stripe colorata in cima (colore scelto alla creazione)
- Nome (15px, weight 500) + MoreHorizontal menu (solo Admin)
- Descrizione (12px, textMid)
- Progress bar con contatore e percentuale
- Avatar members sovrapposti (offset -7px) + due date
- Hover: `translateY(-2px)` + shadow

**"+ Nuovo progetto" modal** (solo Admin):
- Nome progetto
- Descrizione
- Colore (color picker o selezione palette)
- Stati personalizzati (default: Da fare, In lavorazione, In revisione, Completato)
- Membri (multiselect utenti)
- Data scadenza

---

### 4. PROGETTO SINGOLO (route: `/sidera/projects/:id`)

**Header (sticky, sfondo surface):**
```
← Progetti / Nome Progetto    [78% completato]
[Board] [Lista] [Calendario] [Note]   ← view tabs
```

**Board (Kanban):**
- Colonne orizzontali con gli stati definiti nel progetto
- Drag-and-drop tra colonne (aggiorna `task.status` su Firestore)
- Ogni colonna: header (dot + label uppercase + count + Plus) + cards + "Aggiungi task"
- Ogni card: titolo + avatar assegnatario + dot priorità
- Click card → apre Task Detail Drawer (pannello laterale)

**Lista:**
- Flat list di tutte le task del progetto
- Stessa struttura delle righe in TasksView
- Raggruppate per stato

**Calendario:** placeholder "Disponibile a breve" (Fase 2)

**Note:** placeholder con TipTap (Fase 2). Per ora: textarea semplice salvata in `projects/{id}.notes`

**Task Detail Drawer:**
- Si apre lateralmente (slide-in da destra, 400px)
- Non cambia route
- Contenuto: titolo (editable), descrizione (editable), assegnatario, priorità, scadenza, stato, thread commenti
- Commenti: lista + input per nuovo commento → salva in `projects/{pid}/tasks/{tid}/comments`

---

### 5. CHAT (route: `/sidera/chat`)

**Layout 2 colonne:**

Sinistra (196px, sfondo sidebar):
- Label "CANALI"
- Lista canali con `#` prefix
- Canale attivo: sfondo green glow
- Dot verde per messaggi non letti

Destra (sfondo surface):
- Header: `# Nome canale`
- Lista messaggi (overflow scroll):
  - Avatar (32px cerchio con iniziale, colorato per utente)
  - Nome + timestamp
  - Testo messaggio
  - **Task link card** (se `message.linkedTaskId` presente):
    ```
    ┌──────────────────────────────────┐
    │ ☑ Task creata                    │  ← sfondo greenGlow, bordo verde
    │   Titolo task · Assegnata a X · Data│
    └──────────────────────────────────┘
    ```
- Input bar: placeholder "Scrivi in #[canale]..." + Send icon

**Canali default:**
- `#generale` (tutti)
- Un canale per ogni progetto attivo (creato automaticamente alla creazione del progetto)

**Integrazione task dalla chat:**
- Pulsante `/task` nell'input oppure icona CheckSquare accanto al send
- Apre mini-form: titolo, assegnatario, scadenza
- Crea task in Firestore e salva `linkedTaskId` nel messaggio

**Real-time:** `onSnapshot` su `channels/{chid}/messages` per aggiornamento live

---

## Modello dati Firestore

```
users/
  {uid}/
    name: string
    email: string
    role: 'admin' | 'coordinator' | 'member'
    avatar: string | null
    createdAt: timestamp

projects/
  {pid}/
    name: string
    description: string
    color: string              // hex color
    states: [                  // stati custom del progetto
      { id: string, label: string, color: string, order: number }
    ]
    members: string[]          // array di uid
    dueDate: timestamp | null
    notes: string              // rich text grezzo (fase 1: plain text)
    createdBy: string          // uid
    createdAt: timestamp
    archived: boolean

    tasks/
      {tid}/
        title: string
        description: string
        status: string         // id dello stato (riferimento a projects.states[].id)
        priority: 'alta' | 'media' | 'bassa'
        assignee: string | null  // uid
        dueDate: timestamp | null
        projectId: string
        createdBy: string
        createdAt: timestamp
        completedAt: timestamp | null

        comments/
          {cid}/
            text: string
            authorId: string
            createdAt: timestamp

channels/
  {chid}/
    name: string
    projectId: string | null   // null per canali generali
    members: string[]
    createdAt: timestamp

    messages/
      {mid}/
        text: string
        authorId: string
        createdAt: timestamp
        linkedTaskId: string | null  // se il messaggio ha generato una task

notifications/
  {uid}/
    items/
      {nid}/
        type: 'task_assigned' | 'comment' | 'task_completed' | 'mention'
        message: string
        link: string           // route di destinazione
        read: boolean
        createdAt: timestamp

activity/
  {aid}/
    type: string               // 'task_completed', 'task_created', 'status_changed', etc.
    userId: string
    projectId: string | null
    taskId: string | null
    description: string        // testo human-readable
    createdAt: timestamp
```

**Stati default alla creazione progetto:**
```js
[
  { id: 'todo',   label: 'Da fare',        color: '#B4B0AA', order: 0 },
  { id: 'wip',    label: 'In lavorazione', color: '#2F6B4A', order: 1 },
  { id: 'review', label: 'In revisione',   color: '#C8821A', order: 2 },
  { id: 'done',   label: 'Completato',     color: '#4A6B8A', order: 3 },
]
```

---

## Componenti Vue da creare

```
src/
  views/sidera/
    HomeView.vue
    TasksView.vue
    ProjectsView.vue
    ProjectBoard.vue
    ChatView.vue

  components/sidera/
    SidebarNav.vue
    TaskRow.vue            // riga task riutilizzabile (usata in Home, Tasks, Lista)
    TaskCard.vue           // card kanban (usata in Board)
    TaskDrawer.vue         // pannello laterale dettaglio task
    ProjectCard.vue        // card progetto (usata in Projects)
    KanbanColumn.vue       // colonna kanban con drag-drop
    KanbanBoard.vue        // wrapper colonne
    ChatMessage.vue        // singolo messaggio chat
    TaskLinkCard.vue       // card verde "task creata" dentro chat
    UserAvatar.vue         // cerchio con iniziale e colore utente
    NotificationBell.vue   // campanella con count e dropdown
    ProjectModal.vue       // modal creazione/modifica progetto
    TaskModal.vue          // modal creazione task rapida
    ProgressBar.vue        // barra progresso riutilizzabile

  stores/sidera/
    projects.ts
    tasks.ts
    chat.ts
    notifications.ts
    activity.ts

  composables/sidera/
    useProjects.ts
    useTasks.ts
    useChat.ts
    useRealtime.ts         // helper per onSnapshot
```

---

## Routing Vue Router

```ts
// Aggiungere alle route esistenti di POPS

{
  path: '/sidera',
  component: SideraLayout,   // layout con sidebar
  meta: { requiresAuth: true },
  children: [
    { path: '',        component: HomeView,     name: 'sidera-home' },
    { path: 'tasks',   component: TasksView,    name: 'sidera-tasks' },
    { path: 'projects',component: ProjectsView, name: 'sidera-projects' },
    { path: 'projects/:id', component: ProjectBoard, name: 'sidera-project' },
    { path: 'chat',    component: ChatView,     name: 'sidera-chat' },
  ]
}
```

---

## Firestore Security Rules (estensione)

```
// Aggiungere alle regole esistenti

match /projects/{pid} {
  allow read: if request.auth != null && 
    (isAdmin() || resource.data.members.hasAny([request.auth.uid]));
  allow write: if isAdmin();
  
  match /tasks/{tid} {
    allow read: if request.auth != null &&
      (isAdmin() || isCoordinator() || 
       resource.data.assignee == request.auth.uid);
    allow create: if isAdmin() || isCoordinator();
    allow update: if isAdmin() || isCoordinator() || 
      resource.data.assignee == request.auth.uid;
    
    match /comments/{cid} {
      allow read, create: if request.auth != null;
    }
  }
}

match /channels/{chid} {
  allow read: if request.auth != null;
  
  match /messages/{mid} {
    allow read: if request.auth != null;
    allow create: if request.auth != null && 
      request.resource.data.authorId == request.auth.uid;
  }
}

match /notifications/{uid}/items/{nid} {
  allow read, write: if request.auth.uid == uid;
}

match /activity/{aid} {
  allow read: if isAdmin() || isCoordinator();
  allow create: if request.auth != null;
}

function isAdmin() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
function isCoordinator() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'coordinator';
}
```

---

## Integrazione con POPS

**Punto 1 — Link diretto:**
Sidebar SIDERA → link arancione "POPS ↗" → `b2b.inglesinaitaliana.it`

**Punto 2 — Task con origine POPS:**
Task generate da POPS hanno `projectId: 'pops'` e usano il badge arancione. Un ordine in POPS può creare una task in SIDERA con un click (funzione da implementare in POPS, Fase 2).

**Punto 3 — Widget in POPS (Fase 2):**
Componente `SideraWidget.vue` da aggiungere a POPS che mostra:
- Max 3 task dell'utente per oggi (con checkbox funzionante)
- 2 progetti attivi con barra progresso
- 1 ultima attività team
- Link "→ Apri SIDERA"

**Punto 4 — Barra di navigazione condivisa (Fase 3):**
Top bar comune a POPS e SIDERA con: logo Inglesina Italiana, switcher POPS/SIDERA, centro notifiche unificato.

---

## Scope MVP (cosa costruire prima)

### ✅ Fase 1 — MVP (priorità massima)
- [ ] SideraLayout con sidebar navigazione
- [ ] Auth guard + lettura ruolo da Firestore
- [ ] HomeView (Il Mio Giorno) con task e feed
- [ ] TasksView con filtri e raggruppamenti
- [ ] ProjectsView con project cards
- [ ] ProjectBoard con kanban drag-and-drop
- [ ] ProjectBoard vista Lista
- [ ] TaskDrawer (dettaglio task, slide-in)
- [ ] Modal creazione progetto (con stati custom)
- [ ] Modal creazione task
- [ ] Notifiche base (bell icon + dropdown)
- [ ] Link POPS in sidebar

### ⏳ Fase 2
- [ ] ChatView con real-time Firestore
- [ ] Integrazione task ↔ chat (linkedTaskId)
- [ ] Note di progetto (TipTap o plain textarea)
- [ ] Vista Calendario nel progetto
- [ ] Widget SIDERA dentro POPS

### ⏳ Fase 3
- [ ] Archivio / Wiki aziendale
- [ ] CRM clienti leggero
- [ ] Calendario condiviso globale
- [ ] Assistente AI (Claude API)
- [ ] Dashboard KPI
- [ ] Barra navigazione condivisa POPS/SIDERA
- [ ] Automazioni semplici

---

## Riferimento visivo

Il file `SIDERA.jsx` allegato è un prototipo React interattivo che mostra l'aspetto finale atteso. È solo un riferimento visivo — l'implementazione reale è in Vue 3. Tutti i colori, font, layout, spaziature e comportamenti interattivi nel JSX sono da replicare fedelmente in Vue.

Viste navigabili nel prototipo:
- **Il Mio Giorno** — home con task e progetti
- **Task** — lista con filtri (Le mie / Tutte / In ritardo), gruppi, checkbox funzionanti
- **Progetti** — griglia card con click → board
- **Board progetto** — kanban con tab Board/Lista/Calendario/Note
- **Chat** — canali, messaggi, task link card

---

## Note finali per Claude Code

1. **Segui i pattern di POPS** per struttura file, naming conventions, e gestione Firebase. SIDERA deve sembrare scritto dalla stessa mano.
2. **Usa `onSnapshot`** per tutti i dati che devono essere real-time (task, messaggi chat, notifiche).
3. **Il colore verde (#2F6B4A)** è l'accento di SIDERA. Il colore arancione (#C8821A) è riservato esclusivamente ai riferimenti a POPS.
4. **Cormorant Garamond** solo per i titoli delle pagine (in italic). Tutto il resto in Outfit.
5. **Il prototipo JSX** è la source of truth visiva. Se c'è ambiguità di design, il JSX ha ragione.
6. **Non costruire tutto insieme.** Inizia da SideraLayout + HomeView + TasksView. Sono le fondamenta su cui si appoggia tutto il resto.
