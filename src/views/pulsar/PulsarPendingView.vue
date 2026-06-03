<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  collectionGroup, collection, query, where, orderBy, limit,
  onSnapshot, getDoc, addDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { displayName, useTeamMembers } from '../../composables/sidera/useTeamMembers'
import { useProjects } from '../../composables/sidera/useProjects'
import { useChats } from '../../composables/pulsar/useChats'
import TaskCreationModal from '../../components/pulsar/TaskCreationModal.vue'
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
  rejectedAt: Date | null
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

// Paginazione "carica altri": cap reattivo, incrementato a step di PAGE.
const PAGE = 50
const limitN = ref(PAGE)
const hasMore = ref(false)

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

let unsubscribe: (() => void) | null = null
function subscribe() {
  unsubscribe?.()
  const q = query(
    collectionGroup(db, 'messages'),
    where('flags', 'array-contains-any', ['question', 'task']),
    orderBy('createdAt', 'desc'),
    limit(limitN.value),
  )
  unsubscribe = onSnapshot(q, async (snap) => {
  // se la pagina è piena potrebbero esserci altri risultati → mostra "Carica altri"
  hasMore.value = snap.docs.length >= limitN.value
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
      rejectedAt:  toDate(data.rejectedAt),
    } as PendingMsg
  }))
  results.push(...enriched)
  allFlagged.value = results
  loading.value    = false
}, (err) => {
    console.error('[PulsarPendingView]', err)
    loading.value = false
  })
}

subscribe()
watch(limitN, subscribe)
onUnmounted(() => unsubscribe?.())

function loadMore() {
  limitN.value += PAGE
}

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
    !m.rejectedAt &&
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
      lastMessageBy: from,
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

// ── Crea azione da messaggio (modal condiviso TaskCreationModal) ────────────
const showTaskModal = ref(false)
const taskMsg = ref<PendingMsg | null>(null)

function openTaskModal(msg: PendingMsg) {
  taskMsg.value = msg
  showTaskModal.value = true
}

const taskContext = computed(() =>
  taskMsg.value
    ? { chatName: taskMsg.value.chatName, fromLabel: displayName(taskMsg.value.from, members.value) }
    : null,
)

// forward-link sul messaggio dopo la creazione (il back-link sul task lo scrive il modal)
async function onTaskCreated(taskId: string) {
  if (!taskMsg.value) return
  try {
    await updateDoc(doc(db, 'chats', taskMsg.value.chatId, 'messages', taskMsg.value.id), { taskId })
  } catch (e) {
    console.error('[Pendenze] link task error', e)
  }
}

// ── Reject task: marca msg.rejectedAt e fa sparire la pendenza dalla lista ──
const rejectingIds = ref<Set<string>>(new Set())  // disabilita doppio-tap
async function rejectTaskMsg(msg: PendingMsg) {
  if (rejectingIds.value.has(msg.id)) return
  rejectingIds.value = new Set([...rejectingIds.value, msg.id])
  try {
    await updateDoc(
      doc(db, 'chats', msg.chatId, 'messages', msg.id),
      { rejectedAt: serverTimestamp() },
    )
  } catch (e) {
    console.error('[Pendenze] task reject error', e)
    // Ripristina lo stato se la write fallisce, così l'utente può ritentare.
    const next = new Set(rejectingIds.value)
    next.delete(msg.id)
    rejectingIds.value = next
  }
}

// Conferma rifiuto: il rifiuto è irreversibile (la pendenza sparisce), quindi
// passa da un dialog di conferma invece di scattare al primo tap.
const taskToReject = ref<PendingMsg | null>(null)
function askRejectTask(msg: PendingMsg) {
  showTaskModal.value = false   // se aperto dal modal "Crea azione", chiudilo
  taskToReject.value = msg
}
function confirmReject() {
  const msg = taskToReject.value
  taskToReject.value = null
  if (msg) void rejectTaskMsg(msg)
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
              <div class="card-row">
                <p class="card-text">{{ msg.text }}</p>
                <span class="card-time">{{ formatTime(msg.createdAt) }}</span>
              </div>

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
              <div class="card-row">
                <p class="card-text">{{ msg.text }}</p>
                <span class="card-time">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <div class="card-actions">
                <button class="action-btn action-btn--primary" @click="openTaskModal(msg)">
                  <MIcon name="check_circle" filled class="action-icon" />
                  Crea azione
                </button>
                <button
                  class="action-btn action-btn--reject"
                  :disabled="rejectingIds.has(msg.id)"
                  @click="askRejectTask(msg)"
                >
                  <MIcon name="block" class="action-icon" />
                  Rifiuta
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

      <!-- Carica altri (paginazione) -->
      <div v-if="hasMore && (pendingQuestions.length || pendingTasks.length)" class="load-more-wrap">
        <button class="load-more-btn" @click="loadMore">Carica altri</button>
      </div>

      <!-- Task creation modal (componente condiviso) -->
      <TaskCreationModal
        v-model:open="showTaskModal"
        :message="taskMsg"
        :members="members"
        :projects="projects"
        :context="taskContext"
        @created="onTaskCreated"
        @reject="taskMsg && askRejectTask(taskMsg)"
      />

      <!-- Conferma rifiuto pendenza (irreversibile) -->
      <Teleport to="body">
        <div v-if="taskToReject" class="md-modal-backdrop" @click.self="taskToReject = null">
          <div class="md-modal-dialog pv-confirm">
            <div class="md-modal-header">
              <span class="md-modal-title">Rifiutare l'azione?</span>
              <button class="md-modal-close" aria-label="Annulla" @click="taskToReject = null">
                <MIcon name="close" :size="18" />
              </button>
            </div>
            <div class="md-modal-body">
              Stai per rifiutare «{{ taskToReject.text }}». La pendenza sparirà dalla lista e non verrà creata alcuna azione.
            </div>
            <div class="md-modal-footer">
              <button class="md-btn md-btn--outlined md-btn--rounded" @click="taskToReject = null">Annulla</button>
              <button class="md-btn md-btn--danger md-btn--rounded" @click="confirmReject">Rifiuta</button>
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

/* Dialog di conferma rifiuto: leggermente più stretto del default M3. */
.pv-confirm { max-width: 380px; }

/* Header flat: stesso bg della pagina, niente bordo/ombra. */
:deep(.md-page-header) {
  padding: 18px 16px 14px;
  background: var(--page-bg);
  border-bottom: none;
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

.load-more-wrap {
  max-width: 920px; margin: 0 auto 16px; padding: 0 16px;
  display: flex; justify-content: center; box-sizing: border-box;
}
.load-more-btn {
  padding: 9px 22px; border-radius: var(--md-sys-shape-corner-full);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface); color: var(--md-sys-color-primary);
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.load-more-btn:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent); border-color: var(--md-sys-color-primary); }
@media (min-width: 1024px) { .load-more-wrap { max-width: 900px; padding: 0 40px; } }

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

/* ── Gruppi per chat — card surface flat (niente bordo/ombra/glow) ─────── */
.chat-group {
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  margin-bottom: 10px;
  overflow: hidden;
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

.msg-card {
  background: var(--md-sys-color-surface);
  padding: 14px 16px;
}

/* Riga messaggio: testo a sinistra (occupa lo spazio), orario a destra in
   cima alla prima riga di testo. Risparmia altezza rispetto al pattern
   precedente (orario su una riga propria sopra il testo). */
.card-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.card-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface);
  margin: 0;
  word-break: break-word;
}

.card-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  /* Allinea il baseline approx con la prima riga di testo (14px×1.5 = 21px). */
  padding-top: 4px;
  white-space: nowrap;
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

/* Quick-action "Rifiuta" sulla card task: outlined neutro, accent rosso
   ruggine al hover (#C8521A, in palette con prio-alta). */
.action-btn--reject {
  background: transparent;
  border-color: var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface-variant);
}
.action-btn--reject:hover:not(:disabled) {
  border-color: #C8521A;
  background: color-mix(in srgb, #C8521A 8%, transparent);
  color: #C8521A;
}
.action-btn--reject:disabled { opacity: 0.5; cursor: not-allowed; }

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

</style>
