<script setup lang="ts">
/**
 * NEBULA-DOCS — Pagina editor singolo documento (Fase 6: real-time Yjs/CRDT).
 *
 * Montato KEYED-by-docId da NebulaDocView (wrapper) → fresh Y.Doc/provider per
 * doc. Il contenuto è guidato dal Y.Doc (Collaboration), NON più da doc.content
 * né da autosave LWW. `content` resta come proiezione server-side.
 *
 * Flow:
 *  - useCollabDoc(docId) crea Y.Doc + Awareness, connette FirestoreYjsProvider
 *  - editor read-only finché provider 'synced' (+ canWrite)
 *  - editing → provider batcha i delta su yupdates → converge sugli altri
 *  - title/icon: campi scalari, salvati via saveDoc (senza LWW)
 *  - Cmd+S / Salva → snapshotDoc (history); kill-switch → read-only da content
 *
 * Vedi docs/NEBULA-DOCS.md §6.
 */
import { ref, computed, watch, onBeforeUnmount, shallowRef, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
// TipTap v3: tutti i nodi tabella sono named exports nello stesso pacchetto.
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Link } from '@tiptap/extension-link'
import { SlashCommand } from './extensions/SlashCommand'
import { TaskMention } from './extensions/TaskMention'
import { ProjectMention } from './extensions/ProjectMention'
import { TaskEmbed } from './extensions/TaskEmbed'
import { UserMention } from './extensions/UserMention'
import { UniversalMention } from './extensions/UniversalMention'
import { DocMention } from './extensions/DocMention'
import { MilestoneMention } from './extensions/MilestoneMention'
import { DeliverableMention } from './extensions/DeliverableMention'
import { ObiettivoMention } from './extensions/ObiettivoMention'
import { Callout } from './extensions/Callout'
import { Toggle, ToggleSummary } from './extensions/Toggle'
import { useTeamMembers } from '../../../composables/sidera/useTeamMembers'
import { useAllTasks } from '../../../composables/sidera/useAllTasks'
import { useProjects } from '../../../composables/sidera/useProjects'
import { useObiettivi } from '../../../composables/sidera/useObiettivi'
import { useCollabDoc } from '../../../composables/nebula/useCollabDoc'
import { cursorColorFor } from '../../../composables/nebula/useDocPresence'
import { useDocsLight } from '../../../composables/nebula/useDocsLight'
import PresenceStack from './components/PresenceStack.vue'
import ShareDocModal from './components/ShareDocModal.vue'
import DocOutline from './components/DocOutline.vue'
import { useDocOutline } from '../../../composables/nebula/useDocOutline'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { useDoc } from '../../../composables/nebula/useDoc'
import { saveDoc } from '../../../composables/nebula/useSaveDoc'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../firebase'
import IconPicker, { type IconValue } from './components/IconPicker.vue'
import MaterialIcon from './components/MaterialIcon.vue'

// Montato keyed-by-docId: docId costante per la vita del componente.
const props = defineProps<{ docId: string }>()
const router = useRouter()
const { currentUser } = useCurrentUser()

const docId = computed(() => props.docId)
const { data: doc, loading, error } = useDoc(props.docId)

const snapshotDocCallable = httpsCallable<{ docId: string }, { docId: string; revision: number }>(
  functions, 'snapshotDoc',
)

// ── Stato editor ────────────────────────────────────────────────────────────
const localTitle = ref('')
const titleInitialized = ref(false)            // title preso dal doc al 1° load?
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref<string>('')
const showIconPicker = ref(false)
const showShareModal = ref(false)

const myEmail = computed(() => (currentUser.value?.email ?? '').toLowerCase().trim())
const canWrite = computed(() => {
  if (!doc.value) return false
  const acl = doc.value.acl
  return acl.writers.includes(myEmail.value) || acl.owners.includes(myEmail.value)
})
const isOwner = computed(() => {
  if (!doc.value) return false
  return doc.value.acl.owners.includes(myEmail.value)
})

// ── Collaborazione real-time (Fase 6) ───────────────────────────────────────
// Y.Doc + Awareness creati sincroni (l'editor li usa subito); il provider si
// connette quando doc + utente sono noti. `peers` deriva dall'Awareness.
const docLoaded = computed(() => !!doc.value)
const collab = useCollabDoc(props.docId, currentUser, canWrite, docLoaded)
const { ydoc, awareness, status: collabStatus, collabEnabled, peers } = collab

// ── Editor TipTap ───────────────────────────────────────────────────────────
// Sub a task + progetti CEPHEID + team per i typeahead. UniversalMention
// (`@` poliglotta) consuma tutti e 3. ProjectMention (`#`) resta fast-path
// solo progetti. TaskMention disabilita il suo suggester `@` (era duplicato
// con UniversalMention) ma mantiene il nodo schema per render chip esistenti.
// Pass come getter (no Ref): TipTap introspeziona options e i Proxy
// reattivi rompono config (trap hasOwnProperty).
const { tasks: allTasksRef } = useAllTasks()
const { projects: allProjectsRef } = useProjects()
const { members: allTeamRef } = useTeamMembers()
// Lista doc light per il mention picker (F5-C2 + mention cross-doc).
const { docs: allDocsRef } = useDocsLight()
// Obiettivi (collection top-level) per il picker `@`. Milestone e deliverable
// sono derivati da allTasks filtrando il type (sono task con type dedicato).
const { obiettivi: allObiettiviRef } = useObiettivi()
const allMilestonesRef = computed(() => allTasksRef.value.filter(t => t.type === 'milestone'))
const allDeliverablesRef = computed(() => allTasksRef.value.filter(t => t.type === 'deliverable'))

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Fase 6: l'undo/redo lo fornisce Collaboration (Y.UndoManager). L'history
      // nativa di StarterKit (in v3 = `undoRedo`) confligge col CRDT → off.
      undoRedo: false,
      // StarterKit v3 include Link: lo disabilitiamo qui perché più sotto
      // registriamo una versione custom (openOnClick:false, autolink, linkOnPaste).
      // Senza questo: "[tiptap warn] Duplicate extension names found: ['link']".
      link: false,
    }),
    // Collaboration: lega l'editor al Y.Doc condiviso (fragment 'default').
    Collaboration.configure({ document: ydoc }),
    // CollaborationCaret: cursori live colorati. Il provider espone .awareness;
    // a creazione editor il provider non è ancora connesso, ma l'Awareness sì.
    CollaborationCaret.configure({
      provider: { awareness } as never,
      user: {
        name: currentUser.value?.name ?? currentUser.value?.email ?? 'Anonimo',
        color: currentUser.value?.email ? cursorColorFor(currentUser.value.email) : '#C46030',
      },
    }),
    Placeholder.configure({
      placeholder: 'Digita "/" per i comandi · "@" per menzionare persone/task/milestone/deliverable/progetti/obiettivi/documenti · "#" progetto…',
    }),
    // TaskList nativo: checkbox interattive nested-friendly. Lo stato `checked`
    // è persistito dentro al content del doc (data-checked attr) e ri-serializzato
    // come parte della revision. Niente Cloud Function necessaria.
    TaskList,
    TaskItem.configure({ nested: true }),
    SlashCommand,
    // TaskMention con suggester disabilitato: il nodo schema resta (chip
    // esistenti renderizzano), l'inserimento via `@` passa per UniversalMention.
    TaskMention.configure({ allTasks: () => allTasksRef.value, enableSuggester: false }),
    ProjectMention.configure({ allProjects: () => allProjectsRef.value }),
    TaskEmbed.configure({
      allTasks: () => allTasksRef.value,
      allProjects: () => allProjectsRef.value,
    }),
    UserMention,
    DocMention,
    // Nodi schema per i chip milestone/deliverable/obiettivo. Niente suggester
    // proprio: l'inserimento via `@` passa per UniversalMention.
    MilestoneMention,
    DeliverableMention,
    ObiettivoMention,
    UniversalMention.configure({
      allTeam: () => allTeamRef.value,
      allTasks: () => allTasksRef.value,
      allProjects: () => allProjectsRef.value,
      allDocs: () => allDocsRef.value,
      allMilestones: () => allMilestonesRef.value,
      allDeliverables: () => allDeliverablesRef.value,
      allObiettivi: () => allObiettiviRef.value,
      currentDocId: () => docId.value,
    }),
    // Tabelle: header row di default, resizable per dare freedom su larghezza
    // colonne; bottone toolbar inserisce una 3×3 con header row.
    Table.configure({ resizable: true, HTMLAttributes: { class: 'nd-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    // Link inline con autolink (URL incollato → link) + linkOnPaste (la
    // selezione corrente diventa link al paste di un URL). openOnClick:false
    // così il click in editor seleziona invece di seguire l'URL (l'utente
    // usa il bubble menu "Apri").
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    // Blocchi à-la-Notion. Devono combaciare coi gemelli headless in
    // lib_yjs/pmSchema.ts (ordine non schema-rilevante, ma li teniamo in coda).
    Callout,
    Toggle,
    ToggleSummary,
  ],
  editable: false,                              // sbloccato quando provider 'synced' + canWrite
  editorProps: {
    // Apertura link: un click/tap su un <a> apre SEMPRE l'URL nel browser
    // esterno (desktop + mobile). Per modificare un link si seleziona il testo
    // (drag/toolbar) → bubble menu link. (openOnClick resta false: l'apertura
    // la gestiamo noi qui per controllarne target/rel.)
    handleClick(_view, _pos, event) {
      const a = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return false
      window.open(a.href, '_blank', 'noopener,noreferrer')
      return true   // consuma il click
    },
  },
})

const editorRef = shallowRef(editor)

// Indice/struttura del documento (heading → navigazione rapida + scroll-spy).
const { headings: outlineHeadings, activeIndex: outlineActive, scrollToHeading } = useDocOutline(editor)

// ── Title init (campo scalare, NON collaborativo) ───────────────────────────
// Il title vive nel doc Firestore (non nel Y.Doc): lo prendiamo al 1° load.
const fallbackApplied = ref(false)
watch(doc, (d) => {
  if (!d) return
  if (!titleInitialized.value) {
    localTitle.value = d.title ?? ''
    nextTick(fitTitle)
    titleInitialized.value = true
  }
}, { immediate: true })

// ── Sblocco editor + fallback kill-switch ───────────────────────────────────
// Collab attiva: editable quando il provider ha sincronizzato (+ canWrite).
// Kill-switch OFF: render read-only dalla proiezione `content` (no provider).
watch([collabStatus, canWrite, collabEnabled, doc], () => {
  const e = editor.value
  if (!e) return
  if (collabEnabled.value === false) {
    if (doc.value && !fallbackApplied.value) {
      const raw = doc.value.content
        ? JSON.parse(JSON.stringify(doc.value.content))
        : { type: 'doc', content: [] }
      e.commands.setContent(raw)
      fallbackApplied.value = true
    }
    e.setEditable(false)
    saveStatus.value = 'idle'
    return
  }
  e.setEditable(collabStatus.value === 'synced' && canWrite.value)
}, { immediate: true })

// ── Title save (debounce 1s, niente LWW) ────────────────────────────────────
let titleSaveTimer: ReturnType<typeof setTimeout> | null = null
// titolo: textarea auto-grow (va a capo se non ci sta su una riga)
const titleRef = ref<HTMLTextAreaElement | null>(null)
function fitTitle() {
  const el = titleRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
function onTitleInput() {
  fitTitle()
  if (!canWrite.value || !doc.value) return
  if (titleSaveTimer) clearTimeout(titleSaveTimer)
  saveStatus.value = 'idle'
  titleSaveTimer = setTimeout(() => { void saveTitle() }, 1000)
}
async function saveTitle() {
  if (!doc.value || !canWrite.value) return
  saveStatus.value = 'saving'
  saveError.value = ''
  try {
    await saveDoc({ docId: doc.value.id, title: localTitle.value, trigger: 'autosave' })
    saveStatus.value = 'saved'
  } catch (e: any) {
    saveStatus.value = 'error'
    saveError.value = e?.message ?? String(e)
  }
}

// ── Snapshot manuale (Cmd+S / bottone) → history ────────────────────────────
// Il contenuto è già persistito live dal provider; questo crea un punto di
// restore. Server costruisce il Y.Doc live e snapshotta la proiezione.
async function performSave(_trigger: 'autosave' | 'manual') {
  if (!doc.value || !canWrite.value) return
  if (titleSaveTimer) { clearTimeout(titleSaveTimer); titleSaveTimer = null }
  saveStatus.value = 'saving'
  saveError.value = ''
  try {
    if (titleInitialized.value) {
      await saveDoc({ docId: doc.value.id, title: localTitle.value, trigger: 'autosave' })
    }
    await snapshotDocCallable({ docId: doc.value.id })
    saveStatus.value = 'saved'
  } catch (e: any) {
    saveStatus.value = 'error'
    saveError.value = e?.message ?? String(e)
  }
}

// ── Icon picker ─────────────────────────────────────────────────────────────
const currentIcon = computed<IconValue | null>({
  get: () => doc.value?.icon ?? null,
  set: () => { /* aggiornato via saveIcon */ },
})

// Debounce per le modifiche icona: ogni click su colore/fill/icona emette,
// ma vogliamo coalescere e NON chiudere il picker (l'utente continua a
// scegliere). Stessa logica del save autosave del corpo.
let iconSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingIcon: IconValue | null | undefined = undefined  // undefined = no pending

function saveIcon(value: IconValue | null) {
  if (!doc.value || !canWrite.value) return
  pendingIcon = value
  if (iconSaveTimer) clearTimeout(iconSaveTimer)
  saveStatus.value = 'idle'
  iconSaveTimer = setTimeout(() => {
    void flushIconSave()
  }, 600)
}

async function flushIconSave() {
  if (pendingIcon === undefined || !doc.value || !canWrite.value) return
  const value = pendingIcon
  pendingIcon = undefined
  saveStatus.value = 'saving'
  try {
    // icon = campo scalare, niente LWW (la collaborazione è sul Y.Doc).
    await saveDoc({ docId: doc.value.id, icon: value, trigger: 'autosave' })
    saveStatus.value = 'saved'
  } catch (e: any) {
    saveStatus.value = 'error'
    saveError.value = e?.message ?? String(e)
  }
}

// ── Toolbar helpers ─────────────────────────────────────────────────────────
function tb(action: () => void) {
  return () => { action(); editor.value?.commands.focus() }
}

// ── Link modal ──────────────────────────────────────────────────────────────
const showLinkModal = ref(false)
const linkUrl = ref('')
const linkText = ref('')
const linkInputRef = ref<HTMLInputElement | null>(null)

function openLinkModal() {
  if (!editor.value) return
  const e = editor.value
  // Pre-popola URL se siamo già su un link, testo dalla selezione corrente
  const existing = e.getAttributes('link').href as string | undefined
  linkUrl.value = existing ?? ''
  const { from, to } = e.state.selection
  linkText.value = e.state.doc.textBetween(from, to, ' ')
  showLinkModal.value = true
  setTimeout(() => linkInputRef.value?.focus(), 30)
}

function applyLink() {
  if (!editor.value) return
  let url = linkUrl.value.trim()
  if (!url) { showLinkModal.value = false; return }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:')) url = 'https://' + url
  const e = editor.value
  if (linkText.value && e.state.selection.empty) {
    // Inserisci testo + link
    e.chain().focus().insertContent(`<a href="${url}">${linkText.value}</a>`).run()
  } else {
    e.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  showLinkModal.value = false
}

function removeLink() {
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  showLinkModal.value = false
}

// ── iOS PWA: preserve scroll on checkbox toggle ────────────────────────────
// TipTap TaskItem.change handler chiama editor.chain().focus(..., { scrollIntoView:false }).
// scrollIntoView:false blocca lo scroll INTERNO di ProseMirror, ma il focus()
// programmatico sul contenteditable fa scrollare iOS Safari al caret (posizione 0
// se l'utente non ha mai cliccato dentro il doc) → la view salta in cima.
// Workaround: cattura scrollTop di .nd-root al change della checkbox e
// ripristinalo in due RAF (focus-scroll iOS arriva dopo la prima paint).
const ndRootRef = ref<HTMLElement | null>(null)
function preserveScrollOnCheckbox(e: Event) {
  const t = e.target as HTMLElement | null
  if (!(t instanceof HTMLInputElement) || t.type !== 'checkbox') return
  const root = ndRootRef.value
  if (!root) return
  const saved = root.scrollTop
  requestAnimationFrame(() => {
    root.scrollTop = saved
    requestAnimationFrame(() => { root.scrollTop = saved })
  })
}

// ── Cmd+S manual save ───────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    void performSave('manual')
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown)
}

// ── Cleanup ────────────────────────────────────────────────────────────────
onBeforeUnmount(() => {
  if (titleSaveTimer) clearTimeout(titleSaveTimer)
  if (iconSaveTimer) { clearTimeout(iconSaveTimer); void flushIconSave() }
  // editor.value?.destroy() viene chiamato da useEditor automaticamente.
  // Il teardown di Y.Doc/provider/awareness è gestito da useCollabDoc.
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})

// Avoid unused (vue-tsc): used in template, but vue-tsc trips on shallowRef
void editorRef
</script>

<template>
  <div class="nd-root" ref="ndRootRef" @change.capture="preserveScrollOnCheckbox">
    <!-- Loading -->
    <div v-if="loading" class="nd-loading">
      <MaterialIcon name="hourglass_top" :size="36" color="#C46030" />
      <p>Caricamento documento…</p>
    </div>

    <!-- Errore / non trovato -->
    <div v-else-if="error || !doc" class="nd-error">
      <MaterialIcon name="error" :size="36" color="#a82020" />
      <h2>Documento non disponibile</h2>
      <p v-if="error">{{ error.message }}</p>
      <p v-else>Il documento non esiste o non hai i permessi per leggerlo.</p>
      <button class="nd-back-btn" type="button" @click="router.push('/nebula/docs')">
        <MaterialIcon name="arrow_back" :size="16" /> Torna alla lista
      </button>
    </div>

    <!-- Editor -->
    <template v-else>
      <header class="nd-header">
        <button
          type="button"
          class="nd-back"
          aria-label="Torna alla lista"
          @click="router.push('/nebula/docs')"
        >
          <MaterialIcon name="arrow_back" :size="20" />
        </button>

        <PresenceStack :peers="peers" :maxVisible="3" />

        <div class="nd-status" :class="`nd-status-${saveStatus}`">
          <template v-if="collabEnabled === false">
            <MaterialIcon name="cloud_off" :size="14" color="#a82020" />
            <span>Collab disattivata · sola lettura</span>
          </template>
          <template v-else-if="!canWrite">
            <MaterialIcon name="visibility" :size="14" color="#888" />
            <span>Sola lettura</span>
          </template>
          <template v-else-if="collabStatus === 'connecting'">
            <MaterialIcon name="sync" :size="14" />
            <span>Connessione…</span>
          </template>
          <template v-else-if="saveStatus === 'saving'">
            <MaterialIcon name="sync" :size="14" />
            <span>Salvataggio…</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <MaterialIcon name="error" :size="14" />
            <span>{{ saveError || 'Errore' }}</span>
          </template>
          <template v-else>
            <MaterialIcon name="bolt" :size="14" color="#1e7e3e" />
            <span>Live · {{ peers.length + 1 }} attiv{{ peers.length === 0 ? 'o' : 'i' }}</span>
          </template>
        </div>

        <button
          type="button"
          class="nd-history-btn"
          title="Storia revisioni"
          aria-label="Storia revisioni"
          @click="doc && router.push(`/nebula/docs/${doc.id}/history`)"
        >
          <MaterialIcon name="history" :size="14" />
        </button>

        <button
          v-if="isOwner"
          type="button"
          class="nd-share-btn"
          title="Condividi documento"
          @click="showShareModal = true"
        >
          <MaterialIcon name="share" :size="14" />
          <span class="nd-share-label">Condividi</span>
        </button>

        <button
          v-if="canWrite"
          type="button"
          class="nd-manual-save"
          :disabled="saveStatus === 'saving'"
          title="Salva manuale (snapshot in history) — Cmd+S"
          @click="performSave('manual')"
        >
          <MaterialIcon name="save" :size="16" /> Salva
        </button>
      </header>

      <!-- Title block: icona stand-alone SOPRA al titolo (pattern Notion-like),
           titolo grande/bold sotto. Vedi piano Task 1. -->
      <div class="nd-title-block">
        <button
          type="button"
          class="nd-icon-btn"
          :aria-label="currentIcon ? `Cambia icona (${currentIcon.name})` : 'Aggiungi icona'"
          :disabled="!canWrite"
          @click="showIconPicker = !showIconPicker"
        >
          <MaterialIcon
            v-if="currentIcon"
            :name="currentIcon.name"
            :size="48"
            :color="currentIcon.color"
            :fill="currentIcon.fill"
          />
          <MaterialIcon v-else name="add_photo_alternate" :size="44" color="#bbb" />
        </button>

        <textarea
          ref="titleRef"
          v-model="localTitle"
          class="nd-title-input"
          :readonly="!canWrite"
          placeholder="Senza titolo"
          spellcheck="true"
          rows="1"
          @input="onTitleInput"
          @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
        />
      </div>

      <!-- Icon picker (inline popover) -->
      <div v-if="showIconPicker" class="nd-icon-picker-wrap">
        <IconPicker
          :modelValue="currentIcon"
          @update:modelValue="saveIcon"
          @close="showIconPicker = false"
        />
      </div>

      <!-- Toolbar TipTap (solo se canWrite) -->
      <div v-if="canWrite && editor" class="nd-toolbar">
        <button type="button"
          :disabled="!editor.can().undo()"
          @click="tb(() => editor!.chain().focus().undo().run())()"
          title="Annulla (Cmd/Ctrl+Z)">
          <MaterialIcon name="undo" :size="16" />
        </button>
        <button type="button"
          :disabled="!editor.can().redo()"
          @click="tb(() => editor!.chain().focus().redo().run())()"
          title="Ripristina (Cmd/Ctrl+Shift+Z)">
          <MaterialIcon name="redo" :size="16" />
        </button>
        <span class="tb-sep"></span>
        <button type="button" :class="{ 'tb-active': editor.isActive('heading', { level: 1 }) }"
          @click="tb(() => editor!.chain().focus().toggleHeading({ level: 1 }).run())()"
          title="Heading 1"><b>H1</b></button>
        <button type="button" :class="{ 'tb-active': editor.isActive('heading', { level: 2 }) }"
          @click="tb(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())()"
          title="Heading 2"><b>H2</b></button>
        <button type="button" :class="{ 'tb-active': editor.isActive('heading', { level: 3 }) }"
          @click="tb(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())()"
          title="Heading 3"><b>H3</b></button>
        <span class="tb-sep"></span>
        <button type="button" :class="{ 'tb-active': editor.isActive('bold') }"
          @click="tb(() => editor!.chain().focus().toggleBold().run())()"
          title="Grassetto"><b>B</b></button>
        <button type="button" :class="{ 'tb-active': editor.isActive('italic') }"
          @click="tb(() => editor!.chain().focus().toggleItalic().run())()"
          title="Corsivo"><i>I</i></button>
        <button type="button" :class="{ 'tb-active': editor.isActive('strike') }"
          @click="tb(() => editor!.chain().focus().toggleStrike().run())()"
          title="Barrato"><s>S</s></button>
        <span class="tb-sep"></span>
        <button type="button" :class="{ 'tb-active': editor.isActive('bulletList') }"
          @click="tb(() => editor!.chain().focus().toggleBulletList().run())()"
          title="Lista puntata">
          <MaterialIcon name="format_list_bulleted" :size="16" />
        </button>
        <button type="button" :class="{ 'tb-active': editor.isActive('orderedList') }"
          @click="tb(() => editor!.chain().focus().toggleOrderedList().run())()"
          title="Lista numerata">
          <MaterialIcon name="format_list_numbered" :size="16" />
        </button>
        <button type="button" :class="{ 'tb-active': editor.isActive('taskList') }"
          @click="tb(() => editor!.chain().focus().toggleTaskList().run())()"
          title="Lista task con checkbox">
          <MaterialIcon name="check_box" :size="16" />
        </button>
        <span class="tb-sep"></span>
        <button type="button" :class="{ 'tb-active': editor.isActive('blockquote') }"
          @click="tb(() => editor!.chain().focus().toggleBlockquote().run())()"
          title="Quote">
          <MaterialIcon name="format_quote" :size="16" />
        </button>
        <button type="button" :class="{ 'tb-active': editor.isActive('codeBlock') }"
          @click="tb(() => editor!.chain().focus().toggleCodeBlock().run())()"
          title="Blocco codice">
          <MaterialIcon name="code" :size="16" />
        </button>
        <button type="button"
          @click="tb(() => editor!.chain().focus().setHorizontalRule().run())()"
          title="Separatore">
          <MaterialIcon name="horizontal_rule" :size="16" />
        </button>
        <span class="tb-sep"></span>
        <button type="button"
          :class="{ 'tb-active': editor.isActive('link') }"
          @click="openLinkModal"
          title="Link (URL)">
          <MaterialIcon name="link" :size="16" />
        </button>
        <button type="button"
          @click="tb(() => editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())()"
          title="Inserisci tabella 3×3">
          <MaterialIcon name="table_chart" :size="16" />
        </button>
        <!-- Comandi cell-level: visibili solo se il cursore è dentro una table.
             Pattern compatto inline così non serve un BubbleMenu separato. -->
        <template v-if="editor.isActive('table')">
          <span class="tb-sep"></span>
          <button type="button"
            @click="tb(() => editor!.chain().focus().addRowAfter().run())()"
            title="Aggiungi riga sotto">
            <MaterialIcon name="add_row_below" :size="16" />
          </button>
          <button type="button"
            @click="tb(() => editor!.chain().focus().addColumnAfter().run())()"
            title="Aggiungi colonna dopo">
            <MaterialIcon name="add_column_right" :size="16" />
          </button>
          <button type="button"
            @click="tb(() => editor!.chain().focus().deleteRow().run())()"
            title="Elimina riga">
            <MaterialIcon name="delete_sweep" :size="16" />
          </button>
          <button type="button"
            @click="tb(() => editor!.chain().focus().deleteTable().run())()"
            title="Elimina tabella">
            <MaterialIcon name="delete" :size="16" />
          </button>
        </template>
      </div>

      <!-- Editor content -->
      <EditorContent v-if="editor" :editor="editor" class="nd-editor" />

      <!-- Indice/struttura: barre laterali + card contestuale all'hover -->
      <DocOutline :headings="outlineHeadings" :active="outlineActive" @select="scrollToHeading" />
    </template>

    <!-- Share modal (solo per owner) -->
    <ShareDocModal
      v-if="showShareModal && doc"
      :docId="doc.id"
      :acl="doc.acl"
      @close="showShareModal = false"
      @updated="showShareModal = false"
    />

    <!-- Link modal: inserisci/modifica/rimuovi link inline. -->
    <Teleport to="body">
      <div v-if="showLinkModal" class="nd-link-backdrop" @click.self="showLinkModal = false">
        <div class="nd-link-modal" @click.stop>
          <div class="nd-link-modal-title">Inserisci link</div>
          <label class="nd-link-field-label">URL</label>
          <input
            ref="linkInputRef"
            v-model="linkUrl"
            type="url"
            class="nd-link-field-input"
            placeholder="https://esempio.com"
            @keyup.enter="applyLink"
          />
          <label class="nd-link-field-label" style="margin-top:10px">Testo (opzionale)</label>
          <input
            v-model="linkText"
            type="text"
            class="nd-link-field-input"
            placeholder="Testo visibile"
            @keyup.enter="applyLink"
          />
          <div class="nd-link-modal-footer">
            <button class="nd-link-btn-ghost" @click="showLinkModal = false">Annulla</button>
            <button
              v-if="editor?.isActive('link')"
              class="nd-link-btn-remove"
              @click="removeLink"
            >Rimuovi</button>
            <button class="nd-link-btn-primary" :disabled="!linkUrl.trim()" @click="applyLink">Applica</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nd-root {
  /* Pattern PWA mobile (memoria feedback_pwa_mobile_view_pattern):
     .s-main parent ha overflow:hidden → la view deve essere scrollabile
     da sola (root: height 100% + overflow-y auto). overflow-x:hidden
     blinda contro elementi che fuoriescono (es. toolbar molto larghe).
     min-width:0 + width:100% spezza la catena flex-min-content che
     altrimenti propaga il min-content dei children nowrap up to .s-main. */
  height: 100%;
  min-width: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px max(20px, calc(50% - 400px)) 80px;
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  /* Box-sizing border-box per coerenza padding ↔ max-width */
  box-sizing: border-box;
  /* Sfondo foglio caldo chiaro (#FFF8F0). */
  --page-bg: #FFF8F0;
  background: var(--page-bg);
}
.s-surface-dark .nd-root { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .nd-root { --page-bg: #0E0C07; }
}

/* Defensive border-box scope: previene overflow su mobile di child con
   width:100% + padding (es. button manual save, toolbar). */
.nd-root,
.nd-root *,
.nd-root *::before,
.nd-root *::after {
  box-sizing: border-box;
}

/* Loading / error */
.nd-loading, .nd-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 20px;
  text-align: center;
  color: #777;
}
.nd-error h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 22px;
  margin: 0;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.nd-back-btn {
  margin-top: 12px;
  background: #C46030;
  color: white;
  border: 0;
  border-radius: 999px;
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Header */
.nd-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
}
.nd-back {
  background: transparent;
  border: 0;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  color: #555;
  display: flex;
}
.nd-back:hover { background: rgba(0,0,0,0.04); }

.nd-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 12.5px;
  color: #888;
}
.nd-status-saving { color: #C46030; }
.nd-status-saving .material-symbols-outlined { animation: nd-spin 1s linear infinite; }
.nd-status-saved { color: #1e7e3e; }
.nd-status-error { color: #a82020; }

@keyframes nd-spin {
  to { transform: rotate(360deg); }
}

.nd-manual-save,
.nd-share-btn,
.nd-history-btn {
  background: transparent;
  border: 1px solid rgba(196, 96, 48, 0.35);
  color: #C46030;
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.nd-manual-save:hover:not(:disabled),
.nd-share-btn:hover,
.nd-history-btn:hover { background: rgba(196, 96, 48, 0.08); }
.nd-manual-save:disabled { opacity: 0.5; cursor: wait; }
.nd-share-btn { padding: 6px 12px; }
.nd-history-btn { padding: 6px; }

/* External update warning */
.nd-external-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(196, 96, 48, 0.08);
  border-radius: 8px;
  font-size: 12.5px;
  color: #8E4621;
  margin-bottom: 16px;
}

/* Title block: icona standalone SOPRA, titolo sotto (no più flex row).
   Pattern Notion-like — vedi piano Task 1. */
.nd-title-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 32px 0 16px;
  min-width: 0;
  width: 100%;
}
.nd-icon-btn {
  background: transparent;
  border: 0;
  padding: 6px;
  margin-left: -6px;       /* allinea l'icona al baseline sinistro del titolo */
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink: 0;
}
.nd-icon-btn:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.nd-icon-btn:disabled { cursor: default; opacity: 0.5; }

.nd-title-input {
  display: block;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  outline: 0;
  background: transparent;
  font-family: 'Cormorant Garamond', serif;
  font-weight: 700;
  font-size: 44px;
  line-height: 1.25;          /* aria per i discendenti (p/g/y) del serif */
  letter-spacing: -0.005em;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  padding: 6px 0 10px;        /* clearance in basso */
  /* textarea auto-grow: va a capo, niente scroll/resize manuale */
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.nd-title-input:focus {
  outline: none;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent;
  border-bottom: 1px solid rgba(196, 96, 48, 0.4);
}
.nd-title-input::placeholder { color: #ccc; font-style: italic; font-weight: 600; }

/* Icon picker wrap: l'icona è ora full-width block-aligned, il picker apre
   sotto al titolo senza offset laterale. */
.nd-icon-picker-wrap {
  margin: 0 0 24px 0;
}

/* Toolbar */
.nd-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--md-sys-color-surface, #fafafa);
  border: 1px solid rgba(0,0,0,0.06);
  margin-bottom: 14px;
  position: sticky;
  top: 0;
  z-index: 5;
  flex-wrap: wrap;
  /* Su desktop la toolbar non deve estendersi oltre i pulsanti: senza
     fit-content la superficie surface continua bianca per cm a destra. */
  width: fit-content;
  max-width: 100%;
}
.nd-toolbar button {
  background: transparent;
  border: 0;
  padding: 6px 9px;
  border-radius: 6px;
  cursor: pointer;
  color: #555;
  font-size: 13px;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  transition: background 100ms ease, color 100ms ease;
}
.nd-toolbar button:hover:not(:disabled) { background: rgba(196, 96, 48, 0.08); color: #C46030; }
.nd-toolbar button.tb-active { background: rgba(196, 96, 48, 0.15); color: #C46030; }
.nd-toolbar button:disabled { opacity: 0.35; cursor: not-allowed; }
.nd-toolbar .tb-sep { width: 1px; height: 22px; background: rgba(0,0,0,0.08); margin: 0 4px; }

/* Editor content */
.nd-editor {
  min-height: 320px;
  padding: 12px 0;
}
.nd-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 320px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
/* scroll-margin-top: lo scroll dall'indice non finisce sotto la toolbar sticky. */
.nd-editor :deep(.ProseMirror h1),
.nd-editor :deep(.ProseMirror h2),
.nd-editor :deep(.ProseMirror h3) { scroll-margin-top: 72px; }
.nd-editor :deep(.ProseMirror h1) {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px; font-weight: 600; margin: 1.4em 0 0.5em; line-height: 1.2;
}
.nd-editor :deep(.ProseMirror h2) {
  font-family: 'Cormorant Garamond', serif;
  font-size: 24px; font-weight: 600; margin: 1.3em 0 0.5em; line-height: 1.25;
}
.nd-editor :deep(.ProseMirror h3) {
  font-size: 18px; font-weight: 600; margin: 1.2em 0 0.4em;
}
.nd-editor :deep(.ProseMirror p) { margin: 0.5em 0; }
/* Tailwind preflight resetta list-style sulle ul/ol — riabilitiamo
   esplicitamente dentro l'editor. */
.nd-editor :deep(.ProseMirror ul),
.nd-editor :deep(.ProseMirror ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}
.nd-editor :deep(.ProseMirror ul:not([data-type="taskList"])) { list-style-type: disc; }
.nd-editor :deep(.ProseMirror ol) { list-style-type: decimal; }
.nd-editor :deep(.ProseMirror ul:not([data-type="taskList"]) ul:not([data-type="taskList"])) { list-style-type: circle; }
.nd-editor :deep(.ProseMirror ul:not([data-type="taskList"]) ul:not([data-type="taskList"]) ul:not([data-type="taskList"])) { list-style-type: square; }
.nd-editor :deep(.ProseMirror li) {
  margin: 0.25em 0;
  display: list-item;
}
.nd-editor :deep(.ProseMirror li p) { margin: 0; }

/* TaskList nativo TipTap: render checkbox + label.
   Markup: <ul data-type="taskList"><li data-checked="false"><label><input type="checkbox" /></label><div><p>...</p></div></li>
   Reset list-style + flex orizzontale (vedi memoria feedback_tailwind_list_reset). */
.nd-editor :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
  margin: 0.5em 0;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0.25em 0;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  display: inline-flex;
  align-items: center;
  margin-top: 0.35em;       /* allinea checkbox al baseline della prima riga */
  flex-shrink: 0;
  user-select: none;
  cursor: pointer;
}
/* Checkbox custom: native input nascosto + box CSS coerente cross-browser
   (accent-color è ignorato da iOS Safari < 18, da qui il render manuale). */
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]) {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid #C46030;     /* NEBULA primary */
  border-radius: 4px;
  background: white;
  cursor: pointer;
  margin: 0;
  position: relative;
  transition: background 120ms ease, border-color 120ms ease;
  flex-shrink: 0;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:hover) {
  border-color: #A04E25;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked) {
  background: #C46030;
  border-color: #C46030;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after) {
  content: '';
  position: absolute;
  left: 4px;
  top: 0px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:focus-visible) {
  outline: 2px solid rgba(196, 96, 48, 0.4);
  outline-offset: 2px;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1;
  min-width: 0;
}
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div) {
  text-decoration: line-through;
  color: var(--md-sys-color-on-surface-variant);
}
/* Nested TaskList: solo indentation, nessun bullet aggiuntivo */
.nd-editor :deep(.ProseMirror ul[data-type="taskList"] ul[data-type="taskList"]) {
  margin-left: 0;
  padding-left: 24px;
}
.nd-editor :deep(.ProseMirror blockquote) {
  border-left: 3px solid #C46030; padding-left: 1em; margin: 0.8em 0;
  color: #555; font-style: italic;
}
.nd-editor :deep(.ProseMirror code) {
  background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em;
}
.nd-editor :deep(.ProseMirror pre) {
  background: #1f1f1f; color: #e2e2e2; padding: 12px 14px; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  overflow-x: auto; margin: 0.8em 0;
}
.nd-editor :deep(.ProseMirror pre code) { background: transparent; padding: 0; color: inherit; }
.nd-editor :deep(.ProseMirror hr) {
  border: 0; border-top: 1px solid rgba(0,0,0,0.10); margin: 1.5em 0;
}
.nd-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: #bbb;
  float: left;
  height: 0;
  pointer-events: none;
}

/* LWW Modal */
.nd-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.nd-modal {
  background: white;
  border-radius: 16px;
  padding: 24px 26px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  animation: nd-modal-in 200ms ease-out;
}
@keyframes nd-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.nd-modal header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
}
.nd-modal h3 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 22px;
  margin: 0;
}
.nd-modal p { font-size: 14px; line-height: 1.55; color: #444; margin: 8px 0; }
.nd-modal-server-preview {
  background: #fafafa;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  margin: 10px 0;
  border-left: 3px solid #C46030;
}
.nd-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
  flex-wrap: wrap;
}
.nd-modal-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.nd-modal-btn-primary { background: #C46030; color: white; }
.nd-modal-btn-primary:hover { background: #B85425; }
.nd-modal-btn-secondary { background: rgba(0,0,0,0.06); color: #444; }
.nd-modal-btn-secondary:hover { background: rgba(0,0,0,0.10); }

/* ProseMirror: no overflow orizzontale (pre/table/img possono spillare) */
.nd-editor :deep(.ProseMirror) {
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.nd-editor :deep(.ProseMirror img) { max-width: 100%; height: auto; }
.nd-editor :deep(.ProseMirror pre) {
  max-width: 100%;
  overflow-x: auto;        /* code block scrolla orizzontalmente al suo interno */
  white-space: pre;
  word-wrap: normal;
}
.nd-editor :deep(.ProseMirror table) { max-width: 100%; }

/* Mobile: meno padding, title più piccolo (ma sempre bold), toolbar compatta */
@media (max-width: 600px) {
  .nd-root {
    padding: 16px 12px 80px;
  }
  .nd-title-block { margin: 20px 0 12px; }
  .nd-title-input {
    font-size: 32px;
    line-height: 1.1;
  }
  .nd-toolbar {
    padding: 4px 6px;
    gap: 1px;
  }
  .nd-toolbar button {
    padding: 5px 7px;
    min-width: 26px;
    height: 28px;
    font-size: 12px;
  }
  .nd-toolbar .tb-sep { margin: 0 2px; }
  .nd-icon-picker-wrap {
    margin: 0 0 24px 0;
  }
  .nd-modal { padding: 18px 18px; }
  /* Share button su mobile: solo icona per non rubare spazio */
  .nd-share-label { display: none; }
  .nd-share-btn { padding: 6px; }
}

/* ── Tabelle dentro l'editor (estensione @tiptap/extension-table) ─────────── */
.nd-editor :deep(.nd-table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
  table-layout: fixed;
}
.nd-editor :deep(.nd-table td),
.nd-editor :deep(.nd-table th) {
  border: 1px solid var(--md-sys-color-outline-variant);
  padding: 6px 8px;
  vertical-align: top;
  min-width: 60px;
  position: relative;
}
.nd-editor :deep(.nd-table th) {
  background: var(--md-sys-color-surface-container);
  font-weight: 600;
  text-align: left;
}
.nd-editor :deep(.nd-table .selectedCell::after) {
  position: absolute; inset: 0; pointer-events: none;
  background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  content: '';
}
.nd-editor :deep(.tableWrapper) { overflow-x: auto; }
.nd-editor :deep(.column-resize-handle) {
  position: absolute; right: -2px; top: 0; bottom: 0; width: 4px;
  background: var(--md-sys-color-primary); opacity: 0.5; cursor: col-resize;
}

/* ── Link inline dentro l'editor ──────────────────────────────────────────── */
.nd-editor :deep(a) {
  color: var(--md-sys-color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.nd-editor :deep(a:hover) { text-decoration-thickness: 2px; }

/* ── Link modal ───────────────────────────────────────────────────────────── */
.nd-link-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 20px;
}
.nd-link-modal {
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 20px;
  width: 100%; max-width: 380px;
  font-family: 'Outfit', sans-serif;
}
.nd-link-modal-title { font-size: 16px; font-weight: 600; margin-bottom: 14px; color: var(--md-sys-color-on-surface); }
.nd-link-field-label {
  display: block;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 6px;
}
.nd-link-field-input {
  width: 100%; box-sizing: border-box;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 9px 12px;
  font-size: 16px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  outline: none;
}
.nd-link-field-input:focus { border-color: var(--md-sys-color-primary); }
.nd-link-modal-footer {
  display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;
}
.nd-link-btn-ghost {
  padding: 8px 14px;
  background: none;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 10px;
  font-size: 13px; cursor: pointer; color: var(--md-sys-color-on-surface-variant);
  font-family: 'Outfit', sans-serif;
}
.nd-link-btn-remove {
  padding: 8px 14px;
  background: none;
  border: 1px solid color-mix(in srgb, #C8521A 40%, var(--md-sys-color-outline-variant));
  border-radius: 10px;
  font-size: 13px; cursor: pointer; color: #C8521A;
  font-family: 'Outfit', sans-serif;
}
.nd-link-btn-primary {
  padding: 8px 18px;
  background: var(--md-sys-color-primary);
  border: none; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; color: var(--md-sys-color-on-primary);
  font-family: 'Outfit', sans-serif;
}
.nd-link-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Cursori live collaborativi (CollaborationCaret, Fase 6) ──────────────────
   Le decorazioni ProseMirror vivono dentro .nd-editor → :deep() per bucare lo
   scope. Il COLORE è applicato inline dall'estensione (border-color sul caret,
   background-color sull'etichetta): qui solo geometria + leggibilità label. */
:deep(.collaboration-carets__caret) {
  border-left-width: 1px;
  border-right-width: 1px;
  border-left-style: solid;
  border-right-style: solid;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  word-break: normal;
  position: relative;
}
:deep(.collaboration-carets__label) {
  position: absolute;
  top: -1.45em;
  left: -1px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  border-radius: 4px 4px 4px 0;
  padding: 2px 5px;
  color: #fff;
  user-select: none;
  pointer-events: none;
}
</style>
