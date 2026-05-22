<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useMessages } from '../../composables/pulsar/useMessages'
import { usePulsarPresence } from '../../composables/pulsar/usePulsarPresence'
import { markChatRead } from '../../composables/pulsar/usePulsarUnread'
import { useChatHashtags } from '../../composables/pulsar/useChatHashtags'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useProjects } from '../../composables/sidera/useProjects'
import { createStandaloneTask } from '../../composables/sidera/useAllTasks'
import { auth } from '../../firebase'

const route  = useRoute()
const router = useRouter()

const chatId = route.params.id as string

const { messages, loading, sendMessage, linkTask, markAnswered } = useMessages(chatId)

// Segnala al server che questa chat è aperta → niente push duplicata mentre la guardo
usePulsarPresence(chatId)

// Aggiorna "ultimo visto" per la chat ogni volta che arriva un messaggio mentre sono qui.
watch(messages, (msgs) => {
  if (!msgs.length) return
  const lastAt = msgs[msgs.length - 1].createdAt
  if (lastAt) markChatRead(chatId, lastAt)
}, { immediate: true })
const { hashtags, suggestHashtags }       = useChatHashtags()
const { members }                         = useTeamMembers()
const { projects }                        = useProjects()

const myEmail = auth.currentUser?.email ?? ''

// ── Chat info per l'header ────────────────────────────────────────────────
const chatDoc = ref<{ name: string; members: string[]; isGroup: boolean } | null>(null)
const chatUnsub = onSnapshot(doc(db, 'chats', chatId), (snap) => {
  if (!snap.exists()) { chatDoc.value = null; return }
  const d = snap.data()
  chatDoc.value = {
    name: d.name ?? '',
    members: d.members ?? [],
    isGroup: d.isGroup ?? false,
  }
})

const chatTitle = computed(() => {
  if (!chatDoc.value) return ''
  if (chatDoc.value.isGroup && chatDoc.value.name) return chatDoc.value.name
  const other = chatDoc.value.members.find(m => m !== myEmail) ?? ''
  return displayName(other, members.value)
})
const chatSubtitle = computed(() => {
  if (!chatDoc.value) return ''
  if (chatDoc.value.isGroup) return `${chatDoc.value.members.length} partecipanti`
  const other = chatDoc.value.members.find(m => m !== myEmail) ?? ''
  return other
})
// Usato solo per i gruppi (le chat 1:1 mostrano lo StarAvatar dell'altro membro).
const chatAvatarBg = computed(() => 'var(--md-sys-color-primary)')
const chatAvatarInitial = computed(() => (chatTitle.value[0] ?? '?').toUpperCase())
const otherMember = computed(() => chatDoc.value?.members.find(m => m !== myEmail) ?? '')

onBeforeUnmount(() => chatUnsub())

// Lookup messaggio originale per quote di reply
const messagesById = computed(() => {
  const map = new Map<string, typeof messages.value[0]>()
  for (const m of messages.value) map.set(m.id, m)
  return map
})
function getRepliedMessage(id: string | null) {
  if (!id) return null
  return messagesById.value.get(id) ?? null
}

// ── Input state ───────────────────────────────────────────────────────────
const text          = ref('')
const flags         = ref<string[]>([])
const hashtagPicker = ref(false)
const replyTo       = ref<typeof messages.value[0] | null>(null)

function startReply(msg: typeof messages.value[0]) {
  replyTo.value = msg
  inputRef.value?.focus()
}
const selectedTags = ref<string[]>([])
const tagSearch    = ref('')
const mentionQuery = ref('')
const showMentions = ref(false)
const inputRef     = ref<HTMLTextAreaElement | null>(null)
const listRef      = ref<HTMLDivElement | null>(null)

function toggleFlag(flag: string) {
  const idx = flags.value.indexOf(flag)
  if (idx === -1) flags.value.push(flag)
  else flags.value.splice(idx, 1)
}

function toggleTag(name: string) {
  if (selectedTags.value.length >= 3 && !selectedTags.value.includes(name)) return
  const idx = selectedTags.value.indexOf(name)
  if (idx === -1) selectedTags.value.push(name)
  else selectedTags.value.splice(idx, 1)
}

function removeTag(name: string) {
  selectedTags.value = selectedTags.value.filter(t => t !== name)
}

const suggestedTags = computed(() => suggestHashtags(tagSearch.value))

// ── @mention autocomplete ─────────────────────────────────────────────────
const mentions = ref<string[]>([])

function onInput() {
  const val = text.value
  const lastAt = val.lastIndexOf('@')
  if (lastAt !== -1 && lastAt === val.length - 1) {
    mentionQuery.value = ''
    showMentions.value = true
  } else if (lastAt !== -1 && lastAt < val.length - 1) {
    const query = val.slice(lastAt + 1)
    if (!query.includes(' ')) {
      mentionQuery.value = query
      showMentions.value = true
    } else {
      showMentions.value = false
    }
  } else {
    showMentions.value = false
  }
}

const filteredMembers = computed(() =>
  members.value.filter(m =>
    m.email !== myEmail &&
    displayName(m.email, members.value).toLowerCase().includes(mentionQuery.value.toLowerCase())
  )
)

function selectMention(member: { email: string }) {
  const val = text.value
  const lastAt = val.lastIndexOf('@')
  const name = displayName(member.email, members.value)
  text.value = val.slice(0, lastAt) + '@' + name + ' '
  if (!mentions.value.includes(member.email)) mentions.value.push(member.email)
  showMentions.value = false
  inputRef.value?.focus()
}

// ── Send ──────────────────────────────────────────────────────────────────
const sending = ref(false)

async function send() {
  if (!text.value.trim() || sending.value) return
  sending.value = true
  const replyToMsg = replyTo.value
  try {
    await sendMessage({
      text:      text.value.trim(),
      flags:     [...flags.value],
      hashtags:  [...selectedTags.value],
      mentions:  [...mentions.value],
      replyToId: replyToMsg?.id ?? null,
    })
    if (replyToMsg?.flags.includes('question') && !replyToMsg.answeredAt) {
      await markAnswered(replyToMsg.id)
    }
    text.value = ''
    flags.value = []
    selectedTags.value = []
    mentions.value = []
    replyTo.value = null
    hashtagPicker.value = false
    showMentions.value = false
    await nextTick()
    scrollToBottom()
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// ── Scroll: bottom oppure messaggio specifico via ?msg=ID ─────────────────
const highlightedMsgId = ref<string | null>(null)
const focusedFromQuery = ref(false)

function scrollToBottom() {
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

function scrollToMessage(id: string) {
  const el = listRef.value?.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedMsgId.value = id
  setTimeout(() => {
    if (highlightedMsgId.value === id) highlightedMsgId.value = null
  }, 2200)
  return true
}

function maybeApplyQueryFocus() {
  const targetId = route.query.msg as string | undefined
  const wantReply = route.query.reply === '1'
  if (!targetId) return false
  // Aspetta che il messaggio sia in DOM
  return nextTick().then(() => {
    const ok = scrollToMessage(targetId)
    if (ok && wantReply) {
      const target = messages.value.find(m => m.id === targetId)
      if (target && target.from !== myEmail && !target.answeredAt) {
        replyTo.value = target
        inputRef.value?.focus()
      }
    }
    focusedFromQuery.value = ok
    return ok
  })
}

onMounted(() => {
  setTimeout(() => {
    if (!route.query.msg) scrollToBottom()
  }, 100)
})

watch(() => messages.value.length, async () => {
  // Se sto arrivando da Pendenze (?msg=...) tento di centrare quel messaggio
  // prima di fare lo scroll a fondo. Una volta riuscito, non scrollo più a fondo automaticamente.
  if (route.query.msg && !focusedFromQuery.value) {
    await maybeApplyQueryFocus()
    return
  }
  if (!route.query.msg) nextTick(scrollToBottom)
})

// ── Create task from message ──────────────────────────────────────────────
const showTaskModal  = ref(false)
const taskMsgId      = ref('')
const taskForm = ref({
  title:     '',
  projectId: '',
  priority:  'media' as 'alta' | 'media' | 'bassa',
  dueDate:   '',
  assignees: [] as string[],
})
const taskSaving = ref(false)

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

function openTaskModal(msg: { id: string; text: string }) {
  taskMsgId.value = msg.id
  taskForm.value  = {
    title:     msg.text.slice(0, 80),
    projectId: '',
    priority:  'media',
    dueDate:   '',
    assignees: [],
  }
  nextTick(() => { showTaskModal.value = true })
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

async function createTaskFromMsg() {
  if (!taskForm.value.title.trim() || taskSaving.value) return
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
    if (taskMsgId.value) await linkTask(taskMsgId.value, taskId)
    showTaskModal.value = false
  } finally {
    taskSaving.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatTime(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(d)
}

function renderText(t: string) {
  return t
    .replace(/#(\w+)/g, '<span class="msg-hashtag">#$1</span>')
    .replace(/@([\w\s]+)/g, '<span class="msg-mention">@$1</span>')
}
</script>

<template>
  <div class="mv">
    <!-- Header chat -->
    <header v-if="chatDoc" class="chat-header">
      <StarAvatar v-if="!chatDoc.isGroup" v-bind="starAvatarProps(otherMember, members)" :size="40" />
      <div v-else class="chat-header-avatar" :style="{ background: chatAvatarBg }">
        {{ chatAvatarInitial }}
      </div>
      <div class="chat-header-info">
        <div class="chat-header-name">{{ chatTitle }}</div>
        <div class="chat-header-sub">{{ chatSubtitle }}</div>
      </div>
    </header>

    <!-- Messages list -->
    <div ref="listRef" class="msg-list">
      <div v-if="loading" class="loading-msgs">
        <div v-for="i in 5" :key="i" class="msg-skel" :class="i % 2 ? 'msg-skel--right' : ''" />
      </div>
      <div v-else-if="!messages.length" class="empty-msgs">Nessun messaggio ancora. Inizia la conversazione!</div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="msg-bubble-wrap"
        :class="{
          'is-mine': msg.from === myEmail,
          'has-flags': msg.flags.length > 0,
          'is-highlighted': highlightedMsgId === msg.id,
        }"
        :data-msg-id="msg.id"
      >
        <StarAvatar v-if="msg.from !== myEmail" v-bind="starAvatarProps(msg.from, members)" :size="32" />

        <div class="msg-content">
          <div v-if="msg.from !== myEmail && chatDoc?.isGroup" class="msg-sender">{{ displayName(msg.from, members) }}</div>

          <!-- Anchor: posizione i flag-pin relativamente alla bolla (non a msg-content)
               così sender name sopra non sposta i pin -->
          <div class="msg-bubble-anchor">
            <!-- Corner flag badges (outside bubble).
                 Per i miei messaggi i pin sono solo indicatori di stato (non cliccabili):
                 è l'altro membro a doverli risolvere. -->
            <button
              v-if="msg.flags.includes('question')"
              class="flag-pin"
              :class="[
                msg.answeredAt ? 'flag-pin--done' : 'flag-pin--q',
                msg.from === myEmail ? 'flag-pin--readonly' : '',
              ]"
              :disabled="msg.from === myEmail || !!msg.answeredAt"
              :title="msg.from === myEmail
                ? (msg.answeredAt ? 'Risposta ricevuta' : 'In attesa di risposta')
                : (msg.answeredAt ? 'Risposta inviata' : 'Clicca per rispondere')"
              @click.stop="msg.from !== myEmail && !msg.answeredAt && startReply(msg)"
            >
              <MIcon name="help" filled class="flag-pin-icon" />
            </button>
            <button
              v-if="msg.flags.includes('task')"
              class="flag-pin"
              :class="[
                msg.taskId ? 'flag-pin--done' : 'flag-pin--t',
                msg.flags.includes('question') ? 'flag-pin--second' : '',
                msg.from === myEmail ? 'flag-pin--readonly' : '',
              ]"
              :disabled="msg.from === myEmail || !!msg.taskId"
              :title="msg.from === myEmail
                ? (msg.taskId ? 'Azione creata dal destinatario' : 'In attesa che venga creata l’azione')
                : (msg.taskId ? 'Azione creata' : 'Clicca per creare azione')"
              @click.stop="msg.from !== myEmail && !msg.taskId && openTaskModal(msg)"
            >
              <MIcon name="check_circle" filled class="flag-pin-icon" />
            </button>

            <div class="msg-bubble" :class="{ 'is-mine': msg.from === myEmail }">
              <!-- Reply quote (stile WhatsApp): mostra il messaggio originale sopra il testo della risposta -->
              <div
                v-if="getRepliedMessage(msg.replyToId)"
                class="reply-quote"
                @click="getRepliedMessage(msg.replyToId)?.id && scrollToMessage(getRepliedMessage(msg.replyToId)!.id)"
              >
                <span class="reply-quote-sender">
                  {{ displayName(getRepliedMessage(msg.replyToId)!.from, members) }}
                </span>
                <span class="reply-quote-text">
                  {{ getRepliedMessage(msg.replyToId)!.text.slice(0, 120) }}{{ getRepliedMessage(msg.replyToId)!.text.length > 120 ? '…' : '' }}
                </span>
              </div>

              <p class="msg-text" v-html="renderText(msg.text)" />

              <!-- Hashtags -->
              <div v-if="msg.hashtags.length" class="msg-tags">
                <button
                  v-for="tag in msg.hashtags"
                  :key="tag"
                  class="msg-tag"
                  @click="router.push('/pulsar/tag/' + tag)"
                >#{{ tag }}</button>
              </div>
            </div>
          </div>

          <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
        </div>
      </div>
    </div>

    <!-- @mention autocomplete -->
    <div v-if="showMentions && filteredMembers.length" class="mention-popup">
      <div
        v-for="m in filteredMembers.slice(0, 5)"
        :key="m.email"
        class="mention-item"
        @mousedown.prevent="selectMention(m)"
      >
        <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="22" />
        {{ displayName(m.email, members) }}
      </div>
    </div>

    <!-- Hashtag picker -->
    <div v-if="hashtagPicker" class="tag-picker">
      <div class="tag-picker-header">
        <input
          v-model="tagSearch"
          class="tag-search"
          placeholder="Cerca o crea hashtag…"
        />
        <div class="selected-tags">
          <span v-for="t in selectedTags" :key="t" class="sel-tag">
            #{{ t }} <button @click="removeTag(t)">×</button>
          </span>
        </div>
      </div>
      <div class="tag-list">
        <button
          v-for="tag in suggestedTags"
          :key="tag.name"
          class="tag-option"
          :class="{ 'is-selected': selectedTags.includes(tag.name) }"
          :disabled="selectedTags.length >= 3 && !selectedTags.includes(tag.name)"
          @click="toggleTag(tag.name)"
        >
          #{{ tag.name }} <span class="tag-cnt">{{ tag.count }}</span>
        </button>
        <button
          v-if="tagSearch && !suggestedTags.find(t => t.name === tagSearch)"
          class="tag-option tag-option--new"
          :disabled="selectedTags.length >= 3"
          @click="toggleTag(tagSearch); tagSearch = ''"
        >+ Crea #{{ tagSearch }}</button>
      </div>
    </div>

    <!-- Reply preview bar -->
    <div v-if="replyTo" class="reply-bar">
      <div class="reply-bar-inner">
        <span class="reply-bar-label">Rispondi a {{ displayName(replyTo.from, members) }}</span>
        <span class="reply-bar-text">{{ replyTo.text.slice(0, 90) }}{{ replyTo.text.length > 90 ? '…' : '' }}</span>
      </div>
      <button class="reply-bar-cancel" @click="replyTo = null">
        <MIcon name="close" :size="16" />
      </button>
    </div>

    <!-- Input area -->
    <div class="input-area">
      <!-- Pills -->
      <div class="pills">
        <button
          class="pill"
          :class="{ 'is-active': flags.includes('question') }"
          title="Domanda"
          @click="toggleFlag('question')"
        ><MIcon name="help" :filled="flags.includes('question')" class="pill-icon" /></button>
        <button
          class="pill"
          :class="{ 'is-active': flags.includes('task') }"
          title="Azione"
          @click="toggleFlag('task')"
        ><MIcon name="check_circle" :filled="flags.includes('task')" class="pill-icon" /></button>
        <button
          class="pill"
          :class="{ 'is-active': hashtagPicker }"
          title="Hashtag"
          @click="hashtagPicker = !hashtagPicker"
        ><MIcon name="tag" :filled="hashtagPicker" class="pill-icon" /></button>
      </div>

      <!-- Text input + send -->
      <div class="input-wrap">
        <textarea
          ref="inputRef"
          v-model="text"
          class="msg-input"
          placeholder="Scrivi un messaggio…"
          rows="1"
          @input="onInput"
          @keydown="onKeydown"
        />
        <button class="send-btn" :disabled="!text.trim() || sending" @click="send">
          <MIcon name="send" filled :size="20" />
        </button>
      </div>
    </div>

    <!-- Create task modal -->
    <Teleport to="body">
      <div v-if="showTaskModal" class="modal-backdrop md-modal-backdrop" @click.self="showTaskModal = false">
        <div class="task-modal" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title md-modal-title">Crea azione</span>
            <button class="modal-close md-modal-close" @click="showTaskModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
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
                :style="taskForm.assignees.includes(m.email) ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' } : {}"
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
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showTaskModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!taskForm.title.trim() || taskSaving"
              @click="createTaskFromMsg"
            >{{ taskSaving ? 'Creazione…' : 'Crea azione' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mv {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #F4F2EE;
  position: relative;
  width: 100%;
  margin: 0 auto;
}

/* Desktop: stringi la chat per leggibilità */
@media (min-width: 900px) {
  .mv {
    max-width: 880px;
    border-left: 1px solid #E8E5DF;
    border-right: 1px solid #E8E5DF;
  }
}

/* Header chat (nome + sottotitolo) */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
  flex-shrink: 0;
}
.chat-header-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.chat-header-info { flex: 1; min-width: 0; }
.chat-header-name {
  font-size: 14px;
  font-weight: 600;
  color: #1A1917;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-header-sub {
  font-size: 11px;
  color: #9B9590;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Messages */
.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading-msgs { display: flex; flex-direction: column; gap: 10px; }

.msg-skel {
  height: 44px;
  border-radius: 14px;
  background: #E8E5DF;
  width: 65%;
  animation: pulse 1.4s ease-in-out infinite;
}

.msg-skel--right { align-self: flex-end; background: #D0EEF8; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-msgs {
  text-align: center;
  color: #9B9590;
  font-size: 13px;
  padding: 40px 0;
}

.msg-bubble-wrap {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.msg-bubble-wrap.is-mine {
  flex-direction: row-reverse;
}

.msg-bubble-wrap.has-flags { padding-top: 16px; }

/* Highlight quando arrivi a un messaggio specifico da Pendenze */
.msg-bubble-wrap.is-highlighted .msg-bubble {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-sys-color-primary) 67%, transparent), var(--md-sys-elevation-level-1);
  transition: box-shadow var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
}

.msg-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.msg-content { display: flex; flex-direction: column; gap: 2px; max-width: 75%; }

.msg-sender { font-size: 11px; color: #9B9590; font-weight: 600; padding-left: 2px; }

/* Wrapper che ancora i flag-pin alla bolla (così sender name sopra non li sposta) */
.msg-bubble-anchor { position: relative; }

.msg-bubble {
  background: #fff;
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
  box-shadow: var(--md-sys-elevation-level-1);
}

/* Reply quote stile WhatsApp dentro la bolla */
.reply-quote {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px 6px 10px;
  margin-bottom: 6px;
  border-left: 3px solid var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  border-radius: var(--md-sys-shape-corner-extra-small);
  cursor: pointer;
  transition: background 0.15s;
}
.reply-quote:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent); }
.reply-quote-sender {
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-primary-hover);
  letter-spacing: 0.02em;
}
.reply-quote-text {
  font-size: 12px;
  color: #6A6560;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.msg-bubble.is-mine .reply-quote {
  background: rgba(255, 255, 255, 0.55);
  border-left-color: var(--md-sys-color-primary-hover);
}

.msg-bubble.is-mine {
  background: color-mix(in srgb, var(--md-sys-color-primary) 9%, transparent);
  border-radius: 16px 16px 4px 16px;
}

.msg-text { font-size: 14px; line-height: 1.5; color: #1A1917; white-space: pre-wrap; word-break: break-word; margin: 0; }

:deep(.msg-hashtag) { color: var(--md-sys-color-primary-hover); font-weight: 600; cursor: pointer; }
:deep(.msg-mention) { color: #2F6B4A; font-weight: 600; }

/* Flag pins — corner-anchored badges.
   Per i miei messaggi i pin stanno a sinistra (angolo interno), per quelli
   degli altri a destra (sempre angolo interno verso il centro della chat). */
.flag-pin {
  position: absolute;
  top: -14px;
  left: -14px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  z-index: 2;
  padding: 0;
  filter: drop-shadow(0 0 1.5px #F4F2EE) drop-shadow(0 0 1.5px #F4F2EE);
}

.flag-pin--second { left: 18px; }

/* Messaggi di altri: pin a destra (angolo interno rispetto alla chat) */
.msg-bubble-wrap:not(.is-mine) .flag-pin { left: auto; right: -14px; }
.msg-bubble-wrap:not(.is-mine) .flag-pin--second { left: auto; right: 18px; }

.flag-pin:hover:not(:disabled):not(.flag-pin--done) { transform: scale(1.15); }

.flag-pin--q    { color: #F59E0B; }
.flag-pin--t    { color: #10B981; }
.flag-pin--done { color: #B4B0AA; cursor: default; }
.flag-pin:disabled { cursor: default; opacity: 0.85; }
.flag-pin--readonly { cursor: default; }

.flag-pin-icon { font-size: 28px; color: inherit; flex-shrink: 0; line-height: 1; }

/* Reply bar */
.reply-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-top: 1px solid #E8E5DF;
  border-left: 3px solid var(--md-sys-color-primary);
  padding: 8px 14px;
}

.reply-bar-inner { flex: 1; min-width: 0; }

.reply-bar-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--md-sys-color-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.reply-bar-text {
  font-size: 12px;
  color: #6A6560;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reply-bar-cancel {
  background: none;
  border: none;
  cursor: pointer;
  color: #9B9590;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  flex-shrink: 0;
  transition: color 0.15s;
}

.reply-bar-cancel:hover { color: #1A1917; }

.msg-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }

.msg-tag {
  font-size: 11px;
  color: var(--md-sys-color-primary-hover);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-weight: 600;
  font-family: 'Outfit', sans-serif;
}

.msg-time { font-size: 10px; color: #B0ADA8; padding-left: 2px; }

/* @mention popup */
.mention-popup {
  position: absolute;
  bottom: 120px;
  left: 16px;
  right: 16px;
  background: #fff;
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid #E8E5DF;
  box-shadow: var(--md-sys-elevation-level-3);
  z-index: 20;
  overflow: hidden;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #1A1917;
  transition: background 0.12s;
}

.mention-item:hover { background: #F4F2EE; }

.mention-av {
  width: 28px; height: 28px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}

/* Hashtag picker */
.tag-picker {
  background: #fff;
  border-top: 1px solid #E8E5DF;
  padding: 12px 16px;
  max-height: 220px;
  overflow-y: auto;
}

.tag-picker-header { margin-bottom: 10px; }

.tag-search {
  width: 100%;
  box-sizing: border-box;
  background: #F4F2EE;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small);
  padding: 8px 12px;
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  outline: none;
  margin-bottom: 8px;
}

.selected-tags { display: flex; gap: 6px; flex-wrap: wrap; }

.sel-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--md-sys-color-primary) 9%, transparent);
  border-radius: 20px;
  font-size: 12px;
  color: var(--md-sys-color-primary-hover);
  font-weight: 600;
}

.sel-tag button {
  background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-primary-hover); font-size: 14px; line-height: 1; padding: 0;
}

.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }

.tag-option {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid #E8E5DF;
  background: #F4F2EE;
  font-size: 12px;
  font-weight: 600;
  color: #4A4640;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: all 0.12s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-option:hover:not(:disabled) { border-color: color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent); background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent); color: var(--md-sys-color-primary-hover); }
.tag-option.is-selected { background: color-mix(in srgb, var(--md-sys-color-primary) 9%, transparent); border-color: var(--md-sys-color-primary); color: var(--md-sys-color-primary-hover); }
.tag-option:disabled { opacity: 0.4; cursor: not-allowed; }
.tag-option--new { border-style: dashed; }

.tag-cnt { font-size: 10px; font-weight: 400; opacity: 0.6; }

/* Input area */
.input-area {
  background: #fff;
  border-top: 1px solid #E8E5DF;
  padding: 10px 14px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pills { display: flex; gap: 4px; flex-shrink: 0; }

.pill {
  width: 36px; height: 36px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 1.5px solid #E8E5DF;
  background: #F4F2EE;
  cursor: pointer;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}

.pill:hover { border-color: color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent); background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent); }
.pill.is-active { background: color-mix(in srgb, var(--md-sys-color-primary) 13%, transparent); border-color: var(--md-sys-color-primary); }

.pill-icon { font-size: 18px; color: #6A6560; flex-shrink: 0; }
.pill.is-active .pill-icon { color: var(--md-sys-color-primary); }

.input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #F4F2EE;
  border: 1.5px solid #E8E5DF;
  border-radius: 20px;
  padding: 6px 6px 6px 14px;
  transition: border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.input-wrap:focus-within { border-color: color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent); }

.msg-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  /* 16px previene lo zoom automatico su iOS Safari quando focus */
  font-size: 16px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  caret-color: var(--md-sys-color-primary);
  resize: none;
  line-height: 1.5;
  max-height: 100px;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}

.msg-input:focus { outline: none; box-shadow: none; }
.msg-input::placeholder { color: #B0ADA8; }
.msg-input::selection { background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent); }

.send-btn {
  width: 34px; height: 34px;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, transform 0.1s;
}

.send-btn:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.send-btn:disabled { background: #C8C5C0; cursor: not-allowed; }
.send-btn:active:not(:disabled) { transform: scale(0.92); }

/* Task modal */
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

.modal-title { font-size: 15px; font-weight: 600; color: #1A1917; }

.modal-close {
  background: none; border: none; cursor: pointer;
  color: #9B9590; padding: 2px;
}

.modal-body { padding: 16px 20px; }

.field-label {
  display: block; font-size: 10px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #9B9590; margin-bottom: 6px;
}

.field-input {
  width: 100%; box-sizing: border-box;
  background: #F4F2EE; border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small); padding: 9px 12px;
  font-size: 13px; font-family: 'Outfit', sans-serif;
  color: #1A1917; outline: none;
}

.field-date { cursor: pointer; color-scheme: light; }

.prio-picker { display: flex; gap: 4px; }

.prio-opt {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 6px;
  border-radius: var(--md-sys-shape-corner-small);
  border: 1.5px solid #E8E5DF;
  background: #F4F2EE;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  color: #6A6560;
  transition: all 0.15s;
  justify-content: center;
}

.prio-opt:hover { border-color: #C8C5C0; color: #1A1917; }
.prio-opt.is-sel { font-weight: 700; background: transparent; }

.prio-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.assignees-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }

.assignee-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 5px;
  border-radius: 20px;
  border: 1.5px solid #E8E5DF;
  background: #F4F2EE;
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
  padding: 0 20px 18px;
  border-top: 1px solid #E8E5DF;
  padding-top: 14px;
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
