<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  collectionGroup, collection, query, where, orderBy, limit,
  onSnapshot, getDoc, addDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { displayName, useTeamMembers, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useProjects } from '../../composables/sidera/useProjects'
import { useChats } from '../../composables/pulsar/useChats'
import { createStandaloneTask } from '../../composables/sidera/useAllTasks'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const router = useRouter()
const { members } = useTeamMembers()
const { projects } = useProjects()
const { chats } = useChats()
const myEmail = (auth.currentUser?.email ?? '').toLowerCase().trim()

// Mappa chatId -> {name, isGroup, members} popolata dallo snapshot di useChats.
// Permette di leggere chatName/chatIsGroup senza fare getDoc per ogni messaggio (elimina N+1).
const chatCache = computed(() => {
  const m = new Map<string, { name: string; isGroup: boolean; members: string[] }>()
  for (const c of chats.value) m.set(c.id, { name: c.name, isGroup: c.isGroup, members: c.members })
  return m
})

// Risolve il LABEL visivo della chat: per chat di gruppo usa il nome, per DM
// usa il displayName dell'altro membro (stessa logica di PulsarChatsView.chatName).
function computeChatLabel(info: { name: string; isGroup: boolean; members: string[] } | null): string {
  if (!info) return ''
  if (info.isGroup && info.name) return info.name
  const other = info.members?.find((m) => (m || '').toLowerCase().trim() !== myEmail) ?? ''
  return other ? displayName(other, members.value) : (info.name || '')
}

interface PendingMsg {
  id: string
  chatId: string
  chatName: string
  chatIsGroup: boolean
  text: string
  from: string
  createdAt: Date
  flags: string[]
  taskId: string | null
  answeredAt: Date | null
}

interface ChatGroup {
  chatId: string
  chatName: string
  chatIsGroup: boolean
  msgs: PendingMsg[]
}

const allFlagged = ref<PendingMsg[]>([])
const loading    = ref(true)
const collapsedChats = ref<Set<string>>(new Set())  // default: espansi (set vuoto)

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

const q = query(
  collectionGroup(db, 'messages'),
  where('flags', 'array-contains-any', ['question', 'task']),
  orderBy('createdAt', 'desc'),
  limit(100),  // performance: cap iniziale, paginazione "carica altri" rimane TODO
)

// Cache fallback per chat NON in chatCache (es. utente non è membro,
// caso raro dato che la query Firestore filtra per flags, non per membership).
// Popolata lazy via getDoc, deduplica le richieste.
type ChatInfo = { name: string; isGroup: boolean; members: string[] }
const chatLookupFallback = new Map<string, Promise<ChatInfo | null>>()
function resolveChat(chatId: string, chatRef: any): Promise<ChatInfo | null> {
  const cached = chatCache.value.get(chatId)
  if (cached) return Promise.resolve(cached)
  const pending = chatLookupFallback.get(chatId)
  if (pending) return pending
  const promise = (async () => {
    try {
      const snap = await getDoc(chatRef)
      const data = snap.data()
      if (!data) return null
      return { name: data.name ?? '', isGroup: data.isGroup ?? false, members: data.members ?? [] }
    } catch (_) {
      return null
    }
  })()
  chatLookupFallback.set(chatId, promise)
  return promise
}

const unsubscribe = onSnapshot(q, async (snap) => {
  // Cache vuota in attesa del primo round-trip server: niente dati ancora,
  // ma sblocco comunque lo skeleton così la pagina non resta "in caricamento"
  // all'infinito se il server tarda o la rete è assente.
  if (snap.metadata.fromCache && snap.empty) {
    loading.value = false
    return
  }
  const results: PendingMsg[] = []
  // Eseguo le resolveChat in PARALLELO invece che sequenziale (era N+1 bloccante)
  const enriched = await Promise.all(snap.docs.map(async (d) => {
    const data    = d.data()
    const chatRef = d.ref.parent.parent
    const chatId  = chatRef?.id ?? ''
    const chatInfo = chatId && chatRef ? await resolveChat(chatId, chatRef) : null
    return {
      id:          d.id,
      chatId,
      // Label DM/gruppo coerente con PulsarChatsView. Niente più chatId.slice(0,8)
      // come "codice assurdo" — fallback "Conversazione" se proprio nulla disponibile.
      chatName:    computeChatLabel(chatInfo) || 'Conversazione',
      chatIsGroup: chatInfo?.isGroup ?? false,
      text:        data.text      ?? '',
      from:        data.from      ?? '',
      createdAt:   toDate(data.createdAt) ?? new Date(),
      flags:       data.flags     ?? [],
      taskId:      data.taskId    ?? null,
      answeredAt:  toDate(data.answeredAt),
    } as PendingMsg
  }))
  results.push(...enriched)
  allFlagged.value = results
  loading.value    = false
}, (err) => {
  console.error('[PulsarPendingView]', err)
  loading.value = false
})

onUnmounted(unsubscribe)

// Mostro solo pendenze "verso di me": messaggi flaggati da altri membri
// (escludo quelli scritti da me — quelli sono pendenze che ho creato io)
const pendingQuestions = computed(() =>
  allFlagged.value.filter(m =>
    m.flags.includes('question') &&
    !m.answeredAt &&
    m.from.toLowerCase().trim() !== myEmail
  )
)

const pendingTasks = computed(() =>
  allFlagged.value.filter(m =>
    m.flags.includes('task') &&
    !m.taskId &&
    m.from.toLowerCase().trim() !== myEmail
  )
)

function groupByChat(msgs: PendingMsg[]): ChatGroup[] {
  const groups = new Map<string, ChatGroup>()
  for (const msg of msgs) {
    let g = groups.get(msg.chatId)
    if (!g) {
      g = { chatId: msg.chatId, chatName: msg.chatName, chatIsGroup: msg.chatIsGroup, msgs: [] }
      groups.set(msg.chatId, g)
    }
    g.msgs.push(msg)
  }
  // Ordine gruppi: chat con il messaggio più recente in cima
  return [...groups.values()].sort(
    (a, b) => b.msgs[0].createdAt.getTime() - a.msgs[0].createdAt.getTime()
  )
}

const pendingQuestionsByChat = computed(() => groupByChat(pendingQuestions.value))
const pendingTasksByChat     = computed(() => groupByChat(pendingTasks.value))

function toggleChatCollapsed(chatId: string) {
  const next = new Set(collapsedChats.value)
  if (next.has(chatId)) next.delete(chatId)
  else next.add(chatId)
  collapsedChats.value = next
}
function isExpanded(chatId: string) {
  return !collapsedChats.value.has(chatId)
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

function openInChat(chatId: string, msgId: string, reply = false) {
  router.push({ path: `/pulsar/chat/${chatId}`, query: { msg: msgId, ...(reply ? { reply: '1' } : {}) } })
}

// ── Inline reply alle domande ─────────────────────────────────────────────
const replyingTo = ref<string | null>(null)   // id messaggio per cui sto rispondendo
const replyText  = ref('')
const replySending = ref(false)

function startInlineReply(msgId: string) {
  replyingTo.value = msgId
  replyText.value = ''
  nextTick(() => {
    const el = document.getElementById('inline-reply-' + msgId) as HTMLTextAreaElement | null
    el?.focus()
  })
}

function cancelInlineReply() {
  replyingTo.value = null
  replyText.value = ''
}

async function submitInlineReply(msg: PendingMsg) {
  if (!replyText.value.trim() || replySending.value) return
  replySending.value = true
  try {
    const from = auth.currentUser?.email ?? ''
    // 1. Aggiungi il messaggio di risposta nella chat
    await addDoc(collection(db, 'chats', msg.chatId, 'messages'), {
      text:       replyText.value.trim(),
      from,
      createdAt:  serverTimestamp(),
      flags:      [],
      hashtags:   [],
      mentions:   [],
      taskId:     null,
      answeredAt: null,
      replyToId:  msg.id,
    })
    // 2. Aggiorna lastMessage della chat
    await updateDoc(doc(db, 'chats', msg.chatId), {
      lastMessage:   replyText.value.trim().slice(0, 120),
      lastMessageAt: serverTimestamp(),
    })
    // 3. Marca la domanda come risposta
    await updateDoc(doc(db, 'chats', msg.chatId, 'messages', msg.id), { answeredAt: serverTimestamp() })
    cancelInlineReply()
  } catch (e) {
    console.error('[Pendenze] reply error', e)
  } finally {
    replySending.value = false
  }
}

// ── Inline create task (modal) ────────────────────────────────────────────
const showTaskModal = ref(false)
const taskMsg = ref<PendingMsg | null>(null)
const taskSaving = ref(false)
const taskForm = ref({
  title: '',
  projectId: '',
  priority: 'media' as 'alta' | 'media' | 'bassa',
  dueDate: '',
  assignees: [] as string[],
})

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

function openTaskModal(msg: PendingMsg) {
  taskMsg.value = msg
  taskForm.value = {
    title: msg.text.slice(0, 80),
    projectId: '',
    priority: 'media',
    dueDate: '',
    assignees: [],
  }
  showTaskModal.value = true
}

function closeTaskModal() {
  showTaskModal.value = false
  taskMsg.value = null
}

function toggleTaskAssignee(email: string) {
  const idx = taskForm.value.assignees.indexOf(email)
  if (idx === -1) taskForm.value.assignees.push(email)
  else taskForm.value.assignees.splice(idx, 1)
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function submitTask() {
  if (!taskMsg.value || !taskForm.value.title.trim() || taskSaving.value) return
  taskSaving.value = true
  try {
    const dueDate = taskForm.value.dueDate ? parseDateInput(taskForm.value.dueDate) : null
    const taskId = await createStandaloneTask({
      title:     taskForm.value.title.trim(),
      projectId: taskForm.value.projectId || null,
      priority:  taskForm.value.priority,
      dueDate,
      assignees: taskForm.value.assignees,
    })
    await updateDoc(
      doc(db, 'chats', taskMsg.value.chatId, 'messages', taskMsg.value.id),
      { taskId },
    )
    closeTaskModal()
  } catch (e) {
    console.error('[Pendenze] task creation error', e)
  } finally {
    taskSaving.value = false
  }
}
</script>

<template>
  <div class="pv" ref="scrollEl">
    <MdPageHeader
      title="Pendenze"
      :subtitle="loading
        ? 'Caricamento…'
        : `${pendingQuestions.length} domande · ${pendingTasks.length} azioni da creare`"
      sticky
      :hidden="headerHidden"
    />

    <div v-if="loading" class="loading-list">
      <div v-for="i in 4" :key="i" class="msg-skel" />
    </div>

    <template v-else>
      <!-- Questions section: gruppi per chat -->
      <div v-if="pendingQuestionsByChat.length" class="section">
        <div class="section-header">
          <MIcon name="help" filled class="section-icon" />
          <span class="section-label">Domande senza risposta</span>
          <span class="section-count">{{ pendingQuestions.length }}</span>
        </div>
        <div v-for="group in pendingQuestionsByChat" :key="'q-' + group.chatId" class="chat-group">
          <button class="group-header" @click="toggleChatCollapsed(group.chatId)">
            <MIcon :name="group.chatIsGroup ? 'group' : 'person'" filled :size="18" class="group-icon" />
            <span class="group-name">{{ group.chatName }}</span>
            <span class="group-count">{{ group.msgs.length }}</span>
          </button>
          <div v-if="isExpanded(group.chatId)" class="group-body">
            <div v-for="msg in group.msgs" :key="msg.id" class="msg-card">
              <div class="card-header">
                <div class="card-time">{{ formatTime(msg.createdAt) }}</div>
              </div>
              <p class="card-text">{{ msg.text }}</p>

              <div v-if="replyingTo === msg.id" class="inline-reply">
                <textarea
                  :id="'inline-reply-' + msg.id"
                  v-model="replyText"
                  class="inline-reply-input"
                  rows="2"
                  placeholder="Rispondi a questa domanda…"
                  @keydown.enter.exact.prevent="submitInlineReply(msg)"
                />
                <div class="inline-reply-actions">
                  <button class="btn-ghost-sm md-btn md-btn--outlined md-btn--sm md-btn--rounded" :disabled="replySending" @click="cancelInlineReply">Annulla</button>
                  <button
                    class="btn-primary-sm md-btn md-btn--filled md-btn--sm md-btn--rounded"
                    :disabled="!replyText.trim() || replySending"
                    @click="submitInlineReply(msg)"
                  >
                    <MIcon name="send" :size="14" />
                    {{ replySending ? 'Invio…' : 'Invia risposta' }}
                  </button>
                </div>
              </div>

              <div v-else class="card-actions">
                <button class="action-btn action-btn--primary" @click="startInlineReply(msg.id)">
                  <MIcon name="help" filled class="action-icon" />
                  Rispondi qui
                </button>
                <button class="action-btn" @click="openInChat(msg.chatId, msg.id, true)">
                  Apri in chat
                  <MIcon name="open_in_new" :size="14" class="action-icon-trailing" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tasks section: gruppi per chat -->
      <div v-if="pendingTasksByChat.length" class="section">
        <div class="section-header">
          <MIcon name="check_circle" filled class="section-icon" />
          <span class="section-label">Azioni da creare</span>
          <span class="section-count">{{ pendingTasks.length }}</span>
        </div>
        <div v-for="group in pendingTasksByChat" :key="'t-' + group.chatId" class="chat-group">
          <button class="group-header" @click="toggleChatCollapsed(group.chatId)">
            <MIcon :name="group.chatIsGroup ? 'group' : 'person'" filled :size="18" class="group-icon" />
            <span class="group-name">{{ group.chatName }}</span>
            <span class="group-count">{{ group.msgs.length }}</span>
          </button>
          <div v-if="isExpanded(group.chatId)" class="group-body">
            <div v-for="msg in group.msgs" :key="msg.id" class="msg-card">
              <div class="card-header">
                <div class="card-time">{{ formatTime(msg.createdAt) }}</div>
              </div>
              <p class="card-text">{{ msg.text }}</p>
              <div class="card-actions">
                <button class="action-btn action-btn--primary" @click="openTaskModal(msg)">
                  <MIcon name="check_circle" filled class="action-icon" />
                  Crea azione
                </button>
                <button class="action-btn" @click="openInChat(msg.chatId, msg.id)">
                  Apri in chat
                  <MIcon name="open_in_new" :size="14" class="action-icon-trailing" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Task creation modal -->
      <Teleport to="body">
        <div v-if="showTaskModal" class="modal-backdrop md-modal-backdrop" @click.self="closeTaskModal">
          <div class="task-modal" @click.stop>
            <div class="modal-header md-modal-header">
              <span class="modal-title">Crea azione</span>
              <button class="modal-close md-modal-close" @click="closeTaskModal">
                <MIcon name="close" :size="18" />
              </button>
            </div>
            <div class="modal-body md-modal-body">
              <p v-if="taskMsg" class="modal-context">
                Dalla chat <b>{{ taskMsg.chatName }}</b> · {{ displayName(taskMsg.from, members) }}
              </p>
              <label class="field-label md-text-field-label">Titolo *</label>
              <input v-model="taskForm.title" class="field-input md-text-field-input" autofocus />

              <label class="field-label md-text-field-label" style="margin-top:12px">Progetto</label>
              <select v-model="taskForm.projectId" class="field-input md-text-field-input">
                <option value="">— Nessun progetto —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>

              <label class="field-label md-text-field-label" style="margin-top:12px">Assegna a</label>
              <div class="assignees-chips">
                <div
                  v-for="m in members"
                  :key="m.email"
                  class="assignee-chip"
                  :class="{ 'is-selected': taskForm.assignees.includes(m.email) }"
                  :style="taskForm.assignees.includes(m.email)
                    ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' }
                    : {}"
                  @click="toggleTaskAssignee(m.email)"
                >
                  <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
                  {{ displayName(m.email, members) }}
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
                <div>
                  <label class="field-label md-text-field-label">Priorità</label>
                  <div class="prio-picker">
                    <button
                      v-for="p in prioOptions"
                      :key="p.id"
                      class="prio-opt"
                      :class="{ 'is-sel': taskForm.priority === p.id }"
                      :style="taskForm.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                      type="button"
                      @click="taskForm.priority = p.id"
                    >
                      <span class="prio-dot" :style="{ background: p.color }" />
                      {{ p.label }}
                    </button>
                  </div>
                </div>
                <div>
                  <label class="field-label md-text-field-label">Scadenza</label>
                  <input v-model="taskForm.dueDate" type="date" class="field-input field-date" />
                </div>
              </div>
            </div>
            <div class="modal-footer md-modal-footer">
              <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="closeTaskModal">Annulla</button>
              <button
                class="btn-primary md-btn md-btn--filled md-btn--rounded"
                :disabled="!taskForm.title.trim() || taskSaving"
                @click="submitTask"
              >{{ taskSaving ? 'Creazione…' : 'Crea azione' }}</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- All resolved -->
      <div v-if="!pendingQuestions.length && !pendingTasks.length" class="empty-state">
        <MIcon name="check_circle" filled :size="40" class="empty-icon" />
        <p>Nessuna pendenza. Tutto in ordine.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pv {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  height: 100%;
  overflow: auto;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .pv { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .pv { --page-bg: #0E0C07; }
}

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
}

/* Sezioni dirette dentro .pv (niente wrapper extra: lo sticky di MdPageHeader
   si attacca al primo ancestor scrollabile = .pv stesso). Padding e
   max-width applicati a ciascuna sezione. */
.loading-list,
.section,
.empty-state {
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
  padding-left: 16px;
  padding-right: 16px;
  box-sizing: border-box;
}
.loading-list { padding-top: 16px; padding-bottom: 0; display: flex; flex-direction: column; gap: 10px; }
@media (min-width: 1024px) {
  .loading-list, .section, .empty-state {
    max-width: 900px;
    padding-left: 40px;
    padding-right: 40px;
  }
}

.msg-skel {
  height: 90px; border-radius: 16px;
  background: color-mix(in srgb, var(--md-sys-color-outline-variant) 60%, transparent);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px; text-align: center;
  color: var(--md-sys-color-on-surface-variant); font-size: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}

.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; }

.section { margin-bottom: 16px; padding-top: 16px; padding-bottom: 0; }

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px 10px;
  background: transparent;
}

.section-icon {
  font-size: 22px;
  flex-shrink: 0;
  color: var(--md-sys-color-primary);
}

.section-label {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface);
  flex: 1;
}

.section-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
  padding: 3px 10px;
  border-radius: 20px;
  min-width: 28px;
  text-align: center;
}

/* ── Gruppi per chat — card surface con stato collassato/aperto via
   bordo accent (memoria feedback_no_chevrons) ─────────────────────── */
.chat-group {
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.chat-group:has(.group-body) {
  border-left: 3px solid var(--md-sys-color-primary);
}

.group-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.12s;
}
.group-header:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 5%, transparent);
}

.group-icon {
  color: var(--md-sys-color-primary);
  flex-shrink: 0;
}

.group-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  letter-spacing: 0.01em;
}

.group-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
  min-width: 22px;
  text-align: center;
}

.group-body {
  background: color-mix(in srgb, var(--md-sys-color-primary) 3%, var(--md-sys-color-surface));
  border-top: 1px solid var(--md-sys-color-outline-variant);
}
.group-body .msg-card {
  background: transparent;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.group-body .msg-card:last-child {
  border-bottom: none;
}
.group-body .card-chat { display: none; }

.msg-card {
  background: var(--md-sys-color-surface);
  padding: 14px 16px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.card-avatar {
  width: 34px; height: 34px; border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
}

.card-meta { flex: 1; }
.card-sender { font-size: 13px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.card-chat   { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }
.card-time   { font-size: 11px; color: var(--md-sys-color-on-surface-variant); flex-shrink: 0; }

.card-text {
  font-size: 14px; line-height: 1.5; color: var(--md-sys-color-on-surface);
  margin: 0 0 10px; word-break: break-word;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 1px solid transparent;
  background: var(--md-sys-color-surface-container);
  font-size: 12px;
  font-weight: 600;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-primary);
  cursor: pointer;
  transition: all 0.18s ease;
}

.action-btn:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent); }

.action-btn--primary {
  background: var(--md-sys-color-primary);
  border-color: var(--md-sys-color-primary);
  color: #fff;
}
.action-btn--primary:hover { background: var(--md-sys-color-primary-hover); border-color: var(--md-sys-color-primary-hover); color: #fff; }

.action-icon { font-size: 16px; flex-shrink: 0; }
.action-icon-trailing { margin-left: 2px; opacity: 0.75; }

/* Inline reply textarea */
.inline-reply {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inline-reply-input {
  width: 100%;
  box-sizing: border-box;
  background: #F4F2EE;
  border: 1.5px solid #E8E5DF;
  border-radius: 10px;
  padding: 10px 12px;
  font-family: 'Outfit', sans-serif;
  font-size: 16px;
  line-height: 1.4;
  color: #1A1917;
  caret-color: var(--md-sys-color-primary);
  resize: vertical;
  min-height: 60px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s;
}
.inline-reply-input:focus { border-color: color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent); }

.inline-reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-ghost-sm {
  padding: 7px 12px;
  border-radius: var(--md-sys-shape-corner-small);
  border: 1px solid #E8E5DF;
  background: none;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: #6A6560;
  cursor: pointer;
}

.btn-primary-sm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--md-sys-shape-corner-small);
  border: none;
  background: var(--md-sys-color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Outfit', sans-serif;
  cursor: pointer;
}
.btn-primary-sm:disabled { opacity: 0.5; cursor: not-allowed; }

/* Task modal (uguale a quello in PulsarMessageView) */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 20px;
}

.task-modal {
  background: #fff;
  border-radius: var(--md-sys-shape-corner-large);
  width: 100%; max-width: 420px;
  font-family: 'Outfit', sans-serif;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }
.modal-close { background: none; border: none; cursor: pointer; color: #9B9590; padding: 2px; }
.modal-body { padding: 16px 20px; }
.modal-context { font-size: 11px; color: #9B9590; margin-bottom: 14px; }

.field-label {
  display: block; font-size: 10px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #9B9590; margin-bottom: 6px;
}

.field-input {
  width: 100%; box-sizing: border-box;
  background: #F4F2EE; border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small); padding: 9px 12px;
  font-size: 16px; font-family: 'Outfit', sans-serif;
  color: #1A1917; outline: none;
}
.field-date { cursor: pointer; color-scheme: light; }

.prio-picker { display: flex; gap: 4px; }
.prio-opt {
  flex: 1; display: flex; align-items: center; gap: 5px;
  padding: 7px 6px; border-radius: var(--md-sys-shape-corner-small);
  border: 1.5px solid #E8E5DF; background: #F4F2EE;
  font-size: 11px; font-weight: 500; cursor: pointer;
  font-family: 'Outfit', sans-serif; color: #6A6560;
  transition: all 0.15s; justify-content: center;
}
.prio-opt:hover { border-color: #C8C5C0; color: #1A1917; }
.prio-opt.is-sel { font-weight: 700; background: transparent; }
.prio-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.assignees-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }
.assignee-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 5px; border-radius: 20px;
  border: 1.5px solid #E8E5DF; background: #F4F2EE;
  font-size: 12px; color: #6A6560;
  cursor: pointer; transition: all 0.15s; user-select: none;
}
.assignee-chip:hover { border-color: #C8C5C0; color: #1A1917; }
.assignee-chip.is-selected { font-weight: 600; }
.chip-avatar {
  width: 18px; height: 18px; border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; flex-shrink: 0;
}

.modal-footer {
  display: flex; gap: 8px;
  padding: 14px 20px 18px;
  border-top: 1px solid #E8E5DF;
}
.btn-ghost {
  flex: 1; padding: 10px; background: none;
  border: 1px solid #E8E5DF; border-radius: 10px;
  font-size: 13px; cursor: pointer; color: #6A6560;
  font-family: 'Outfit', sans-serif;
}
.btn-primary {
  flex: 2; padding: 10px; background: var(--md-sys-color-primary);
  border: none; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; color: #fff;
  font-family: 'Outfit', sans-serif;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
