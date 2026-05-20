<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  collectionGroup, collection, query, where, orderBy,
  onSnapshot, getDoc, addDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { avatarInitial, displayName, useTeamMembers } from '../../composables/sidera/useTeamMembers'
import { pulsarAvatarColor as avatarColor } from '../../composables/pulsar/usePulsarAvatar'
import { useProjects } from '../../composables/sidera/useProjects'
import { createStandaloneTask } from '../../composables/sidera/useAllTasks'
import MIcon from '../../components/pulsar/MIcon.vue'

const router = useRouter()
const { members } = useTeamMembers()
const { projects } = useProjects()
const myEmail = (auth.currentUser?.email ?? '').toLowerCase().trim()

interface PendingMsg {
  id: string
  chatId: string
  chatName: string
  text: string
  from: string
  createdAt: Date
  flags: string[]
  taskId: string | null
  answeredAt: Date | null
}

const allFlagged = ref<PendingMsg[]>([])
const loading    = ref(true)

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
)

const unsubscribe = onSnapshot(q, async (snap) => {
  if (snap.metadata.fromCache && snap.empty) return
  const results: PendingMsg[] = []
  for (const d of snap.docs) {
    const data    = d.data()
    const chatRef = d.ref.parent.parent
    const chatId  = chatRef?.id ?? ''
    let chatName  = ''
    if (chatRef) {
      try {
        const chatSnap = await getDoc(chatRef)
        chatName = chatSnap.data()?.name ?? ''
      } catch (_) {}
    }
    results.push({
      id:         d.id,
      chatId,
      chatName:   chatName || chatId.slice(0, 8),
      text:       data.text      ?? '',
      from:       data.from      ?? '',
      createdAt:  toDate(data.createdAt) ?? new Date(),
      flags:      data.flags     ?? [],
      taskId:     data.taskId    ?? null,
      answeredAt: toDate(data.answeredAt),
    })
  }
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
  <div class="pv">
    <div class="pv-header">
      <h2 class="pv-title">Pendenze</h2>
      <p class="pv-sub">
        <template v-if="loading">Caricamento…</template>
        <template v-else>{{ pendingQuestions.length }} domande · {{ pendingTasks.length }} azioni da creare</template>
      </p>
    </div>

    <div v-if="loading" class="loading-list">
      <div v-for="i in 4" :key="i" class="msg-skel" />
    </div>

    <template v-else>
      <!-- Questions section -->
      <div v-if="pendingQuestions.length" class="section">
        <div class="section-header">
          <MIcon name="help" filled class="section-icon section-icon--q" />
          <span class="section-label">Domande senza risposta</span>
          <span class="section-count">{{ pendingQuestions.length }}</span>
        </div>
        <div v-for="msg in pendingQuestions" :key="msg.id" class="msg-card">
          <div class="card-header">
            <div class="card-avatar" :style="{ background: avatarColor(msg.from) }">
              {{ avatarInitial(msg.from) }}
            </div>
            <div class="card-meta">
              <div class="card-sender">{{ displayName(msg.from, members) }}</div>
              <div class="card-chat">in {{ msg.chatName }}</div>
            </div>
            <div class="card-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
          <p class="card-text">{{ msg.text }}</p>

          <!-- Inline reply -->
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
              <button class="btn-ghost-sm" :disabled="replySending" @click="cancelInlineReply">Annulla</button>
              <button
                class="btn-primary-sm"
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

      <!-- Tasks section -->
      <div v-if="pendingTasks.length" class="section">
        <div class="section-header">
          <MIcon name="check_circle" filled class="section-icon section-icon--t" />
          <span class="section-label">Azioni da creare</span>
          <span class="section-count">{{ pendingTasks.length }}</span>
        </div>
        <div v-for="msg in pendingTasks" :key="msg.id" class="msg-card">
          <div class="card-header">
            <div class="card-avatar" :style="{ background: avatarColor(msg.from) }">
              {{ avatarInitial(msg.from) }}
            </div>
            <div class="card-meta">
              <div class="card-sender">{{ displayName(msg.from, members) }}</div>
              <div class="card-chat">in {{ msg.chatName }}</div>
            </div>
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

      <!-- Task creation modal -->
      <Teleport to="body">
        <div v-if="showTaskModal" class="modal-backdrop" @click.self="closeTaskModal">
          <div class="task-modal" @click.stop>
            <div class="modal-header">
              <span class="modal-title">Crea azione</span>
              <button class="modal-close" @click="closeTaskModal">
                <MIcon name="close" :size="18" />
              </button>
            </div>
            <div class="modal-body">
              <p v-if="taskMsg" class="modal-context">
                Dalla chat <b>{{ taskMsg.chatName }}</b> · {{ displayName(taskMsg.from, members) }}
              </p>
              <label class="field-label">Titolo *</label>
              <input v-model="taskForm.title" class="field-input" autofocus />

              <label class="field-label" style="margin-top:12px">Progetto</label>
              <select v-model="taskForm.projectId" class="field-input">
                <option value="">— Nessun progetto —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>

              <label class="field-label" style="margin-top:12px">Assegna a</label>
              <div class="assignees-chips">
                <div
                  v-for="m in members"
                  :key="m.email"
                  class="assignee-chip"
                  :class="{ 'is-selected': taskForm.assignees.includes(m.email) }"
                  :style="taskForm.assignees.includes(m.email)
                    ? { background: avatarColor(m.email) + '20', borderColor: avatarColor(m.email) + '80', color: avatarColor(m.email) }
                    : {}"
                  @click="toggleTaskAssignee(m.email)"
                >
                  <span class="chip-avatar" :style="{ background: avatarColor(m.email), color: '#fff' }">{{ avatarInitial(m.email) }}</span>
                  {{ displayName(m.email, members) }}
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
                <div>
                  <label class="field-label">Priorità</label>
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
                  <label class="field-label">Scadenza</label>
                  <input v-model="taskForm.dueDate" type="date" class="field-input field-date" />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-ghost" @click="closeTaskModal">Annulla</button>
              <button
                class="btn-primary"
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
        <p>Nessuna pendenza. Tutto in ordine!</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pv {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  height: 100%;
  overflow: auto;
}

.pv-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid #E8E5DF;
  background: #fff;
}

.pv-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.pv-sub { font-size: 12px; color: #9B9590; }

.loading-list { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }

.msg-skel {
  height: 90px; border-radius: 14px;
  background: #E8E5DF;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px; text-align: center;
  color: #9B9590; font-size: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}

.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; }

.section { margin-bottom: 4px; }

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 8px;
  background: #F4F2EE;
  border-bottom: 1px solid #E8E5DF;
}

.section-icon { font-size: 18px; flex-shrink: 0; }
.section-icon--q { color: #F59E0B; }
.section-icon--t { color: #10B981; }

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6A6560;
  flex: 1;
}

.section-count {
  font-size: 11px;
  font-weight: 700;
  color: #9B9590;
  background: #E8E5DF;
  padding: 2px 7px;
  border-radius: 20px;
}

.msg-card {
  background: #fff;
  padding: 14px 20px;
  border-bottom: 1px solid #F0EDE8;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.card-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
}

.card-meta { flex: 1; }
.card-sender { font-size: 13px; font-weight: 600; color: #1A1917; }
.card-chat   { font-size: 11px; color: #9B9590; }
.card-time   { font-size: 11px; color: #B0ADA8; flex-shrink: 0; }

.card-text {
  font-size: 14px; line-height: 1.5; color: #3A3835;
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
  border-radius: 999px;
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
  border-radius: 8px;
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
  border-radius: 8px;
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
  border-radius: 16px;
  width: 100%; max-width: 420px;
  font-family: 'Outfit', sans-serif;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-title { font-size: 15px; font-weight: 600; color: #1A1917; }
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
  border-radius: 8px; padding: 9px 12px;
  font-size: 16px; font-family: 'Outfit', sans-serif;
  color: #1A1917; outline: none;
}
.field-date { cursor: pointer; color-scheme: light; }

.prio-picker { display: flex; gap: 4px; }
.prio-opt {
  flex: 1; display: flex; align-items: center; gap: 5px;
  padding: 7px 6px; border-radius: 8px;
  border: 1.5px solid #E8E5DF; background: #F4F2EE;
  font-size: 11px; font-weight: 500; cursor: pointer;
  font-family: 'Outfit', sans-serif; color: #6A6560;
  transition: all 0.15s; justify-content: center;
}
.prio-opt:hover { border-color: #C8C5C0; color: #1A1917; }
.prio-opt.is-sel { font-weight: 700; background: transparent; }
.prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

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
  width: 18px; height: 18px; border-radius: 50%;
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
