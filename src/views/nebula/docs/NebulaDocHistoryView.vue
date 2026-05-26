<script setup lang="ts">
/**
 * NEBULA-DOCS — History view (F3-C3).
 *
 * Mostra timeline degli snapshot di un doc ordinati per revision DESC.
 * Click su una riga → espande inline mostrando preview (read-only ProseMirror).
 * Bottone "Ripristina" → saveDoc con content del snapshot come nuova revisione.
 *
 * Route: /nebula/docs/:docId/history
 */
import { ref, computed, watch, onBeforeUnmount, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { useDoc } from '../../../composables/nebula/useDoc'
import { useDocHistory, type HistorySnapshot } from '../../../composables/nebula/useDocHistory'
import { saveDoc } from '../../../composables/nebula/useSaveDoc'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps } from '../../../composables/sidera/useTeamMembers'
import { useAllTasks } from '../../../composables/sidera/useAllTasks'
import { useProjects } from '../../../composables/sidera/useProjects'
import StarAvatar from '../../../components/shared/StarAvatar.vue'
import MaterialIcon from './components/MaterialIcon.vue'
import { TaskMention } from './extensions/TaskMention'
import { ProjectMention } from './extensions/ProjectMention'
import { TaskEmbed } from './extensions/TaskEmbed'
import { UserMention } from './extensions/UserMention'

const route = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

const docId = computed(() => String(route.params.docId))
const { data: doc, loading: docLoading } = useDoc(docId.value)
const { snapshots, loading: histLoading } = useDocHistory(docId)

const expandedId = ref<string | null>(null)
const restoringId = ref<string | null>(null)
const lastMessage = ref('')
const lastError = ref('')

const myEmail = computed(() => (currentUser.value?.email ?? '').toLowerCase().trim())
const canWrite = computed(() => {
  if (!doc.value) return false
  const acl = doc.value.acl
  return acl.writers.includes(myEmail.value) || acl.owners.includes(myEmail.value)
})

// ── Editor preview (read-only, single instance riusato per snapshot espanso) ──
// Carica TUTTE le estensioni custom: senza, i nodi taskMention/projectMention/
// taskEmbed verrebbero droppati dalla preview rendendola vuota anche per doc
// pieni di chip CEPHEID.
const { tasks: allTasksRef } = useAllTasks()
const { projects: allProjectsRef } = useProjects()

const previewEditor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TaskMention.configure({ allTasks: () => allTasksRef.value }),
    ProjectMention.configure({ allProjects: () => allProjectsRef.value }),
    TaskEmbed.configure({
      allTasks: () => allTasksRef.value,
      allProjects: () => allProjectsRef.value,
    }),
    UserMention,
  ],
  editable: false,
  content: { type: 'doc', content: [] },
})
const previewRef = shallowRef(previewEditor)
void previewRef

// Empty check: doc con solo paragrafo vuoto = considerato "vuoto"
function isContentEmpty(content: any): boolean {
  if (!content || !Array.isArray(content.content) || content.content.length === 0) return true
  // Single empty paragraph node = empty
  if (content.content.length === 1) {
    const only = content.content[0]
    if (only?.type === 'paragraph' && (!only.content || only.content.length === 0)) return true
  }
  return false
}
const expandedIsEmpty = ref(false)

function toggleExpand(snap: HistorySnapshot) {
  if (expandedId.value === snap.id) {
    expandedId.value = null
    return
  }
  expandedId.value = snap.id
  // Deep clone per scollegare da reactive proxy (TipTap trap hasOwnProperty)
  const rawContent = snap.content
    ? JSON.parse(JSON.stringify(snap.content))
    : { type: 'doc', content: [] }
  previewEditor.value?.commands.setContent(rawContent, false)
  expandedIsEmpty.value = isContentEmpty(rawContent)
}

async function restoreSnapshot(snap: HistorySnapshot) {
  if (!doc.value) return
  if (!canWrite.value) {
    lastError.value = 'Non hai permessi di scrittura'
    return
  }
  if (!confirm(`Ripristinare il documento alla revisione ${snap.revision}? La revisione corrente (${doc.value.revision}) resterà in storia.`)) {
    return
  }
  restoringId.value = snap.id
  lastError.value = ''
  lastMessage.value = ''
  try {
    const rawContent = JSON.parse(JSON.stringify(snap.content))
    const out = await saveDoc({
      docId: doc.value.id,
      title: snap.title,
      content: rawContent,
      baseRevision: doc.value.revision,
      trigger: 'manual',   // snapshot in history del restore
    })
    lastMessage.value = `Ripristinato a rev ${snap.revision} (nuova rev ${out.revision}). Torno all'editor…`
    setTimeout(() => router.push(`/nebula/docs/${doc.value!.id}`), 1200)
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    restoringId.value = null
  }
}

function formatTime(ts: any): string {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function authorName(email: string): string {
  if (!email) return '?'
  if (members.value.length === 0) return email
  return displayName(email, members.value)
}

function triggerLabel(t: string): string {
  switch (t) {
    case 'autosave': return 'Autosave'
    case 'manual':   return 'Manuale'
    case 'mcp':      return 'Claude (MCP)'
    case 'restore':  return 'Ripristino'
    default:         return t
  }
}

function triggerColor(t: string): string {
  switch (t) {
    case 'autosave': return '#888'
    case 'manual':   return '#C46030'
    case 'mcp':      return '#7A5CA8'
    case 'restore':  return '#5B7F2E'
    default:         return '#888'
  }
}

onBeforeUnmount(() => {
  // useEditor auto-destruct via composable
})
</script>

<template>
  <div class="nh-root">
    <header class="nh-header">
      <button
        type="button"
        class="nh-back"
        aria-label="Torna al documento"
        @click="router.push(`/nebula/docs/${docId}`)"
      >
        <MaterialIcon name="arrow_back" :size="20" />
      </button>
      <div class="nh-title-block">
        <span class="nh-eyebrow">Storia revisioni</span>
        <h2>{{ doc?.title ?? '…' }}</h2>
      </div>
      <span v-if="doc" class="nh-current">
        Corrente: <strong>rev {{ doc.revision }}</strong>
      </span>
    </header>

    <div v-if="lastMessage" class="nh-toast nh-toast-ok">
      <MaterialIcon name="check_circle" :size="16" /> {{ lastMessage }}
    </div>
    <div v-if="lastError" class="nh-toast nh-toast-err">
      <MaterialIcon name="error" :size="16" /> {{ lastError }}
    </div>

    <div v-if="docLoading || histLoading" class="nh-loading">
      <MaterialIcon name="hourglass_top" :size="28" color="#C46030" />
      <p>Caricamento storia…</p>
    </div>

    <div v-else-if="!doc" class="nh-empty">
      <MaterialIcon name="error" :size="28" color="#a82020" />
      <p>Documento non disponibile.</p>
    </div>

    <div v-else-if="snapshots.length === 0" class="nh-empty">
      <MaterialIcon name="history" :size="28" color="#bbb" />
      <p>Nessuna versione in storia.</p>
      <small>Gli snapshot vengono creati su salvataggio manuale (Cmd+S) e su creazione.</small>
    </div>

    <ol v-else class="nh-list">
      <li
        v-for="snap in snapshots"
        :key="snap.id"
        class="nh-item"
        :class="{ 'nh-item-current': snap.revision === doc.revision, 'nh-item-expanded': expandedId === snap.id }"
      >
        <button
          type="button"
          class="nh-item-row"
          @click="toggleExpand(snap)"
        >
          <span
            class="nh-rev"
            :style="{ borderColor: triggerColor(snap.trigger) }"
          >
            rev {{ snap.revision }}
          </span>
          <div class="nh-author">
            <StarAvatar v-bind="starAvatarProps(snap.savedBy, members)" :size="22" />
            <span class="nh-author-name">{{ authorName(snap.savedBy) }}</span>
          </div>
          <span
            class="nh-trigger-badge"
            :style="{
              background: triggerColor(snap.trigger) + '22',
              color: triggerColor(snap.trigger),
            }"
          >{{ triggerLabel(snap.trigger) }}</span>
          <span class="nh-time">{{ formatTime(snap.savedAt) }}</span>
          <span v-if="snap.revision === doc.revision" class="nh-current-badge">CORRENTE</span>
        </button>

        <div v-if="expandedId === snap.id" class="nh-preview">
          <div class="nh-preview-meta">
            <span class="nh-preview-title">Titolo: <strong>{{ snap.title }}</strong></span>
            <button
              v-if="canWrite && snap.revision !== doc.revision"
              type="button"
              class="nh-restore-btn"
              :disabled="restoringId === snap.id"
              @click.stop="restoreSnapshot(snap)"
            >
              <MaterialIcon name="restore" :size="14" />
              {{ restoringId === snap.id ? 'Ripristino…' : 'Ripristina questa versione' }}
            </button>
            <span v-else-if="snap.revision === doc.revision" class="nh-restore-disabled">
              Versione corrente
            </span>
          </div>
          <div class="nh-preview-label">
            <MaterialIcon name="visibility" :size="12" />
            Anteprima del documento a questa revisione (sola lettura)
          </div>
          <div v-if="expandedIsEmpty" class="nh-preview-empty">
            <MaterialIcon name="description" :size="20" color="#bbb" />
            <span>Il documento era vuoto a questa revisione.</span>
          </div>
          <EditorContent
            v-else-if="previewEditor"
            :editor="previewEditor"
            class="nh-preview-content"
          />
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.nh-root {
  height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  box-sizing: border-box;
}
.nh-root, .nh-root *, .nh-root *::before, .nh-root *::after {
  box-sizing: border-box;
}

.nh-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  flex-wrap: wrap;
}
.nh-back {
  background: transparent;
  border: 0;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  color: #555;
  display: flex;
}
.nh-back:hover { background: rgba(0,0,0,0.04); }
.nh-title-block { flex: 1; min-width: 0; }
.nh-eyebrow {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #C46030;
  font-weight: 500;
}
.nh-title-block h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 24px;
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nh-current {
  font-size: 12px;
  color: #777;
}

/* Toast */
.nh-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
  font-size: 13px;
}
.nh-toast-ok { background: rgba(40, 160, 80, 0.10); color: #1e7e3e; }
.nh-toast-err { background: rgba(200, 50, 50, 0.10); color: #a82020; }

/* Loading / empty */
.nh-loading, .nh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  text-align: center;
  color: #888;
}
.nh-empty small { color: #aaa; font-size: 12px; }

/* List */
.nh-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nh-item {
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.06);
  transition: background 120ms ease, border-color 120ms ease;
}
.nh-item-current {
  border-color: rgba(196, 96, 48, 0.40);
  background: rgba(196, 96, 48, 0.04);
}
.nh-item-expanded {
  border-color: rgba(196, 96, 48, 0.40);
}

.nh-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  border-radius: 10px;
}
.nh-item-row:hover { background: rgba(196, 96, 48, 0.04); }

.nh-rev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border: 1.5px solid #888;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #555;
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.nh-author {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.nh-author-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nh-trigger-badge {
  font-size: 10.5px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.nh-time {
  font-size: 11.5px;
  color: #888;
  flex-shrink: 0;
}
.nh-current-badge {
  font-size: 10px;
  font-weight: 600;
  color: #C46030;
  background: rgba(196, 96, 48, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

/* Preview expanded */
.nh-preview {
  padding: 4px 14px 14px;
  border-top: 1px solid rgba(0,0,0,0.06);
  margin-top: 4px;
}
.nh-preview-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  font-size: 12.5px;
  color: #555;
  flex-wrap: wrap;
}
.nh-preview-title { flex: 1; }
.nh-preview-title strong { color: #1a1a1a; font-weight: 500; }

.nh-restore-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #C46030;
  color: white;
  border: 0;
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
.nh-restore-btn:hover:not(:disabled) { background: #B85425; }
.nh-restore-btn:disabled { opacity: 0.6; cursor: wait; }

.nh-restore-disabled {
  font-size: 11.5px;
  color: #999;
  font-style: italic;
}

/* Preview label */
.nh-preview-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 10.5px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.nh-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 14px;
  background: #fafafa;
  border-radius: 8px;
  color: #999;
  font-size: 13px;
  font-style: italic;
}

/* Read-only preview content */
.nh-preview-content {
  margin-top: 4px;
  padding: 12px 14px;
  background: #fafafa;
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.nh-preview-content :deep(.ProseMirror) {
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.nh-preview-content :deep(.ProseMirror h1) {
  font-family: 'Cormorant Garamond', serif;
  font-size: 22px; font-weight: 600; margin: 0.5em 0 0.3em;
}
.nh-preview-content :deep(.ProseMirror h2) {
  font-family: 'Cormorant Garamond', serif;
  font-size: 18px; font-weight: 600; margin: 0.5em 0 0.3em;
}
.nh-preview-content :deep(.ProseMirror h3) {
  font-size: 15px; font-weight: 600; margin: 0.4em 0 0.2em;
}
.nh-preview-content :deep(.ProseMirror p) { margin: 0.3em 0; }
.nh-preview-content :deep(.ProseMirror ul) { list-style-type: disc; padding-left: 1.5em; }
.nh-preview-content :deep(.ProseMirror ol) { list-style-type: decimal; padding-left: 1.5em; }
.nh-preview-content :deep(.ProseMirror li) { display: list-item; margin: 0.2em 0; }
.nh-preview-content :deep(.ProseMirror li p) { margin: 0; }
.nh-preview-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid #C46030; padding-left: 1em; margin: 0.5em 0;
  color: #555; font-style: italic;
}
.nh-preview-content :deep(.ProseMirror code) {
  background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em;
}
.nh-preview-content :deep(.ProseMirror pre) {
  background: #1f1f1f; color: #e2e2e2; padding: 10px 12px; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  overflow-x: auto;
}
.nh-preview-content :deep(.ProseMirror hr) {
  border: 0; border-top: 1px solid rgba(0,0,0,0.10); margin: 1em 0;
}

@media (max-width: 600px) {
  .nh-root { padding: 16px 12px 80px; }
  .nh-item-row { flex-wrap: wrap; gap: 6px; }
  .nh-time { width: 100%; }
}
</style>
