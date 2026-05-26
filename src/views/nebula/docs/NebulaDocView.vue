<script setup lang="ts">
/**
 * NEBULA-DOCS — Editor singolo documento (`/nebula/docs/:docId`).
 *
 * Chunk 4 Fase 1: editor TipTap base + autosave 1.5s + LWW conflict dialog.
 * Niente mention CEPHEID ancora (chunk Fase 2).
 *
 * Flow:
 *  - useDoc(docId) sottoscrive il doc → al primo load inizializza editor
 *  - typing → debounce 1.5s → saveDoc({ trigger:'autosave', baseRevision })
 *  - save success → baseRevision = response.revision
 *  - save 409 → dialog "Sovrascrivi" | "Carica server" | "Annulla"
 *  - manual save (button / Cmd+S) → trigger:'manual' (snapshot in history)
 *
 * Vedi docs/NEBULA-DOCS.md §4 (editor) e §5.3 (LWW).
 */
import { ref, computed, watch, onBeforeUnmount, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { SlashCommand } from './extensions/SlashCommand'
import { TaskMention } from './extensions/TaskMention'
import { ProjectMention } from './extensions/ProjectMention'
import { TaskEmbed } from './extensions/TaskEmbed'
import { UserMention } from './extensions/UserMention'
import { UniversalMention } from './extensions/UniversalMention'
import { useTeamMembers } from '../../../composables/sidera/useTeamMembers'
import { useAllTasks } from '../../../composables/sidera/useAllTasks'
import { useProjects } from '../../../composables/sidera/useProjects'
import { useDocPresence } from '../../../composables/nebula/useDocPresence'
import PresenceStack from './components/PresenceStack.vue'
import ShareDocModal from './components/ShareDocModal.vue'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { useDoc } from '../../../composables/nebula/useDoc'
import { saveDoc, isSaveDocConflict, type SaveDocConflictDetails } from '../../../composables/nebula/useSaveDoc'
import IconPicker, { type IconValue } from './components/IconPicker.vue'
import MaterialIcon from './components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()

const docId = computed(() => String(route.params.docId))
const { data: doc, loading, error } = useDoc(docId.value)

// Resubscribe se il param cambia (navigazione tra doc)
watch(() => docId.value, (newId) => {
  // useDoc espone resubscribe (vedi composable). Più semplice: reload via router.
  if (newId) { /* doc cambierà via watcher data */ }
})

// ── Stato editor ────────────────────────────────────────────────────────────
const localTitle = ref('')
const baseRevision = ref<number>(-1)           // last revision letta/salvata
const initializedFromDoc = ref(false)          // ha già preso il contenuto iniziale?
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref<string>('')
const showIconPicker = ref(false)
const showShareModal = ref(false)
const conflict = ref<SaveDocConflictDetails | null>(null)

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

// Presence: sub al sub-collezione nebulaDocs/{docId}/presence + heartbeat 15s.
// Espone peers (altri utenti attivi visti <30s fa).
const { peers } = useDocPresence(docId, currentUser)

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      placeholder: 'Digita "/" per i comandi · "@" per menzionare persone/task/progetti · "#" progetto…',
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
    UniversalMention.configure({
      allTeam: () => allTeamRef.value,
      allTasks: () => allTasksRef.value,
      allProjects: () => allProjectsRef.value,
    }),
  ],
  editable: false,                              // si sblocca dopo init + ACL
  onUpdate: () => scheduleAutosave(),
})

const editorRef = shallowRef(editor)

// ── Init: al primo load del doc, popola editor + title ──────────────────────
// + auto-merge passivo: se l'utente NON ha modifiche locali (isDirty=false)
//   e arriva un update remoto, applichiamo silenziosamente (pattern Google
//   Docs "passive viewer auto-syncs"). Se invece HA modifiche pending, si
//   tiene il warning + il dialog di conflitto si aprirà al prossimo save.
const isDirty = ref(false)

function applyRemoteContent(d: NonNullable<typeof doc.value>) {
  if (!editor.value) return
  // Preserva selection se siamo in lettura passiva (cursor potrebbe non
  // essere mai stato dentro l'editor). TipTap setContent(_, false) NON
  // emette update → no loop con onUpdate.
  const rawContent = d.content
    ? JSON.parse(JSON.stringify(d.content))
    : { type: 'doc', content: [] }
  editor.value.commands.setContent(rawContent, false)
  localTitle.value = d.title ?? ''
  baseRevision.value = d.revision ?? 0
  isDirty.value = false
}

watch(doc, (d) => {
  if (!d) return
  if (!initializedFromDoc.value) {
    // Primo load
    applyRemoteContent(d)
    editor.value?.setEditable(canWrite.value)
    initializedFromDoc.value = true
    return
  }
  // Update remoto post-init
  if (d.revision > baseRevision.value && !isDirty.value) {
    applyRemoteContent(d)   // auto-merge silenzioso
  }
  // Se isDirty → externalUpdatePending warning resta visibile, conflict
  // verrà gestito al prossimo save (LWW + dialog)
}, { immediate: true })

// Se il doc viene aggiornato esternamente E ho modifiche locali pending,
// mostro warning soft. Il conflict viene catturato al prossimo save.
const externalUpdatePending = computed(() => {
  if (!doc.value || !initializedFromDoc.value) return false
  return doc.value.revision > baseRevision.value && isDirty.value
})

// ── Autosave (debounce 1.5s) ────────────────────────────────────────────────
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave() {
  if (!initializedFromDoc.value || !canWrite.value) return
  isDirty.value = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  saveStatus.value = 'idle'
  autosaveTimer = setTimeout(() => {
    void performSave('autosave')
  }, 1500)
}

// Salva quando l'utente modifica il title (input @input)
function onTitleInput() {
  scheduleAutosave()
}

async function performSave(trigger: 'autosave' | 'manual') {
  if (!editor.value || !doc.value || !canWrite.value) return
  // Annulla pending autosave per evitare double-save
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null }

  saveStatus.value = 'saving'
  saveError.value = ''
  try {
    // Deep-clone via JSON: scollega proxy Vue dentro node attrs (es. taskEmbed.filter
    // letti via props.node.attrs reattivi). Firebase callable + Firestore non
    // gradiscono Proxy in serializzazione (hasOwnProperty trap).
    const rawContent = JSON.parse(JSON.stringify(editor.value.getJSON()))
    const out = await saveDoc({
      docId: doc.value.id,
      title: localTitle.value,
      content: rawContent,
      contentText: editor.value.getText(),
      baseRevision: baseRevision.value,
      trigger,
    })
    baseRevision.value = out.revision
    isDirty.value = false
    saveStatus.value = 'saved'
  } catch (e: any) {
    if (isSaveDocConflict(e)) {
      conflict.value = e.details
      saveStatus.value = 'error'
      saveError.value = 'Conflitto con altro utente'
    } else {
      saveStatus.value = 'error'
      saveError.value = e?.message ?? String(e)
    }
  }
}

// ── Conflict resolution ─────────────────────────────────────────────────────
async function resolveOverwrite() {
  // Forza save usando la revision corrente del server come base.
  if (!conflict.value) return
  baseRevision.value = conflict.value.currentRevision
  conflict.value = null
  await performSave('manual')
}

function resolveReload() {
  // Scarta modifiche locali, ricarica contenuto server.
  if (!conflict.value || !editor.value) return
  localTitle.value = conflict.value.currentTitle
  const rawContent = JSON.parse(JSON.stringify(conflict.value.currentContent))
  editor.value.commands.setContent(rawContent, false)
  baseRevision.value = conflict.value.currentRevision
  isDirty.value = false
  conflict.value = null
  saveStatus.value = 'saved'
  saveError.value = ''
}

function resolveCancel() {
  conflict.value = null
  saveStatus.value = 'idle'
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
    const out = await saveDoc({
      docId: doc.value.id,
      icon: value,
      baseRevision: baseRevision.value,
      trigger: 'manual',
    })
    baseRevision.value = out.revision
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
  if (autosaveTimer) clearTimeout(autosaveTimer)
  if (iconSaveTimer) { clearTimeout(iconSaveTimer); void flushIconSave() }
  // editor.value?.destroy() viene chiamato da useEditor automaticamente
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})

// Avoid unused (vue-tsc): used in template, but vue-tsc trips on shallowRef
void editorRef
</script>

<template>
  <div class="nd-root">
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
          <template v-if="!canWrite">
            <MaterialIcon name="visibility" :size="14" color="#888" />
            <span>Sola lettura</span>
          </template>
          <template v-else-if="saveStatus === 'saving'">
            <MaterialIcon name="sync" :size="14" />
            <span>Salvataggio…</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <MaterialIcon name="check_circle" :size="14" />
            <span>Salvato · rev {{ baseRevision }}</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <MaterialIcon name="error" :size="14" />
            <span>{{ saveError || 'Errore' }}</span>
          </template>
          <template v-else>
            <MaterialIcon name="edit_document" :size="14" color="#999" />
            <span>rev {{ baseRevision }}</span>
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

      <!-- Warning soft per aggiornamento esterno -->
      <div v-if="externalUpdatePending" class="nd-external-warn">
        <MaterialIcon name="info" :size="16" />
        Versione server più recente (rev {{ doc?.revision }}) — il prossimo
        salvataggio aprirà il dialog di conflitto.
      </div>

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

        <input
          v-model="localTitle"
          type="text"
          class="nd-title-input"
          :readonly="!canWrite"
          placeholder="Senza titolo"
          spellcheck="true"
          @input="onTitleInput"
        />
      </div>

      <!-- Icon picker (inline popover) -->
      <div v-if="showIconPicker" class="nd-icon-picker-wrap">
        <IconPicker :modelValue="currentIcon" @update:modelValue="saveIcon" />
        <button class="nd-icon-close" type="button" @click="showIconPicker = false">
          <MaterialIcon name="close" :size="16" />
        </button>
      </div>

      <!-- Toolbar TipTap (solo se canWrite) -->
      <div v-if="canWrite && editor" class="nd-toolbar">
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
      </div>

      <!-- Editor content -->
      <EditorContent v-if="editor" :editor="editor" class="nd-editor" />
    </template>

    <!-- LWW conflict dialog -->
    <div v-if="conflict" class="nd-modal-backdrop" @click.self="resolveCancel">
      <div class="nd-modal">
        <header>
          <MaterialIcon name="merge_type" :size="24" color="#C46030" />
          <h3>Conflitto di versione</h3>
        </header>
        <p>
          Qualcuno (probabilmente in un'altra tab o un altro utente con
          accesso in scrittura) ha salvato modifiche mentre stavi editando.
          La versione corrente sul server è <b>rev {{ conflict.currentRevision }}</b>;
          la tua base era <b>rev {{ baseRevision }}</b>.
        </p>
        <div class="nd-modal-server-preview">
          <strong>Title server:</strong> {{ conflict.currentTitle }}
        </div>
        <p>Come vuoi procedere?</p>
        <div class="nd-modal-actions">
          <button type="button" class="nd-modal-btn nd-modal-btn-secondary" @click="resolveCancel">
            Annulla
          </button>
          <button type="button" class="nd-modal-btn nd-modal-btn-secondary" @click="resolveReload">
            Carica versione server
          </button>
          <button type="button" class="nd-modal-btn nd-modal-btn-primary" @click="resolveOverwrite">
            Sovrascrivi
          </button>
        </div>
      </div>
    </div>

    <!-- Share modal (solo per owner) -->
    <ShareDocModal
      v-if="showShareModal && doc"
      :docId="doc.id"
      :acl="doc.acl"
      @close="showShareModal = false"
      @updated="showShareModal = false"
    />
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
  /* Pattern visivo allineato a CEPHEID Progetti: sfondo beige caldo per dare
     continuità navigando lista → doc → lista (vedi piano Task 5). */
  --page-bg: #EFE7D9;
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
  border-bottom: 1px solid rgba(0,0,0,0.06);
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
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-family: 'Cormorant Garamond', serif;
  font-weight: 700;
  font-size: 44px;
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  padding: 4px 0;
}
.nd-title-input:focus { border-bottom: 1px solid rgba(196, 96, 48, 0.4); }
.nd-title-input::placeholder { color: #ccc; font-style: italic; font-weight: 600; }

/* Icon picker wrap: l'icona è ora full-width block-aligned, il picker apre
   sotto al titolo senza offset laterale. */
.nd-icon-picker-wrap {
  position: relative;
  margin: 0 0 24px 0;
}
.nd-icon-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,0.05);
  border: 0;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
}
.nd-icon-close:hover { background: rgba(0,0,0,0.10); }

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
.nd-toolbar button:hover { background: rgba(196, 96, 48, 0.08); color: #C46030; }
.nd-toolbar button.tb-active { background: rgba(196, 96, 48, 0.15); color: #C46030; }
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
</style>
