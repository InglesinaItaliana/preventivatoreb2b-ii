<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useMessages, type MsgRef } from '../../composables/pulsar/useMessages'
import { usePulsarPresence } from '../../composables/pulsar/usePulsarPresence'
import { markChatRead } from '../../composables/pulsar/usePulsarUnread'
import { useChatHashtags } from '../../composables/pulsar/useChatHashtags'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useProjects } from '../../composables/sidera/useProjects'
import { useAllTasks } from '../../composables/sidera/useAllTasks'
import { useDocsLight } from '../../composables/nebula/useDocsLight'
import TaskCreationModal from '../../components/pulsar/TaskCreationModal.vue'
import { auth } from '../../firebase'

const route  = useRoute()
const router = useRouter()

const chatId = route.params.id as string

const { messages, loading, sendMessage, linkTask, markAnswered, rejectTask } = useMessages(chatId)

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
const { tasks: allTasks }                 = useAllTasks()
const { docs: allDocs }                   = useDocsLight()

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
  // Per le chat 1-to-1 non mostriamo l'email sotto al nome (rumore visivo):
  // il nome dell'interlocutore è già sopra, l'avatar è a sinistra.
  return ''
})
// Usato solo per i gruppi (le chat 1:1 mostrano lo StarAvatar dell'altro membro).
const chatAvatarBg = computed(() => 'var(--md-sys-color-primary)')
const chatAvatarInitial = computed(() => (chatTitle.value[0] ?? '?').toUpperCase())
const otherMember = computed(() => chatDoc.value?.members.find(m => m !== myEmail) ?? '')

onBeforeUnmount(() => {
  chatUnsub()
  inputStackRO?.disconnect()
})

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

// ── Raggruppamento bolle consecutive ─────────────────────────────────────
// Stesso mittente, entro 3 min, senza flag né reply-quote (entrambi
// rompono il gruppo perché aggiungono contesto/pin che richiedono spazio).
type GroupPos = 'single' | 'first' | 'middle' | 'last'
const GROUP_THRESHOLD_MS = 3 * 60 * 1000

function canAttachAbove(
  curr: typeof messages.value[0] | undefined,
  prev: typeof messages.value[0] | undefined,
) {
  if (!curr || !prev) return false
  if (curr.from !== prev.from) return false
  if (curr.createdAt.getTime() - prev.createdAt.getTime() >= GROUP_THRESHOLD_MS) return false
  if (curr.flags.length > 0) return false
  if (curr.replyToId) return false
  return true
}

const groupedMessages = computed(() => {
  const arr = messages.value
  return arr.map((msg, i) => {
    const mergesUp   = canAttachAbove(msg, arr[i - 1])
    const mergesDown = canAttachAbove(arr[i + 1], msg)
    let groupPos: GroupPos
    if (!mergesUp && !mergesDown) groupPos = 'single'
    else if (!mergesUp && mergesDown) groupPos = 'first'
    else if (mergesUp && mergesDown) groupPos = 'middle'
    else groupPos = 'last'
    return { ...msg, groupPos }
  })
})

// Aggrega i messaggi consecutivi in "gruppi" renderizzabili dentro un grid
// container (così le bolle dello stesso gruppo condividono la larghezza più
// ampia tramite grid-template-columns: max-content).
type GroupedMessage = typeof groupedMessages.value[number]
interface MessageGroup {
  from: string
  isMine: boolean
  messages: GroupedMessage[]
}
const messageGroups = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  let current: MessageGroup | null = null
  for (const msg of groupedMessages.value) {
    if (!current || msg.groupPos === 'single' || msg.groupPos === 'first') {
      current = { from: msg.from, isMine: msg.from === myEmail, messages: [msg] }
      groups.push(current)
    } else {
      current.messages.push(msg)
    }
  }
  return groups
})

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
const inputRef       = ref<HTMLTextAreaElement | null>(null)
const listRef        = ref<HTMLDivElement | null>(null)
const inputAreaRef   = ref<HTMLDivElement | null>(null)
const inputStackRef  = ref<HTMLDivElement | null>(null)
const mvRef          = ref<HTMLDivElement | null>(null)

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

// ── @mention autocomplete (persone + task + progetti + documenti) ──────────
const mentions = ref<string[]>([])       // email (persone) → notifiche, non cliccabili
const pendingRefs = ref<MsgRef[]>([])    // riferimenti cliccabili (task/progetto/doc) del messaggio in scrittura

type MentionKind = 'user' | 'task' | 'project' | 'doc'
interface MentionItem {
  kind: MentionKind
  id: string            // email per 'user', id altrimenti
  label: string
  sub?: string
  projectId?: string
  color?: string
  status?: string
}

// Auto-grow: la textarea cresce con il contenuto fino a ~10 righe, poi
// scrolla internamente. Misurato via scrollHeight dopo aver azzerato
// height (così il browser ricalcola; altrimenti scrollHeight resta al
// massimo già raggiunto). Cap = 10 righe × line-height del campo.
function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  // line-height effettivo (px) per riga
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
  const maxH = lh * 10
  const target = Math.min(el.scrollHeight, maxH)
  el.style.height = target + 'px'
  el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  syncInputHeight()
}

// .input-stack è position:absolute sopra .msg-list (i messaggi scorrono
// sotto le pillole). Il padding-bottom di .msg-list = altezza reale dello
// stack (tag-picker + reply-bar + input-area), così l'ultimo messaggio
// resta sempre raggiungibile.
function syncInputHeight() {
  const stack = inputStackRef.value
  const mv = mvRef.value
  if (stack && mv) mv.style.setProperty('--input-h', stack.offsetHeight + 'px')
}

function onInput() {
  autoResize()
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

// Suggerimenti unificati: stesse euristiche di NEBULA UniversalMention
// (match per testo, completati/archiviati esclusi, max per categoria).
const MAX_PER_KIND = 5
const mentionSuggestions = computed<MentionItem[]>(() => {
  const q = mentionQuery.value.toLowerCase().trim()

  const people: MentionItem[] = members.value
    .filter(m => m.email !== myEmail)
    .filter(m => !q
      || displayName(m.email, members.value).toLowerCase().includes(q)
      || m.email.toLowerCase().includes(q))
    .slice(0, MAX_PER_KIND)
    .map(m => ({ kind: 'user', id: m.email, label: displayName(m.email, members.value), sub: m.email }))

  const tasks: MentionItem[] = allTasks.value
    .filter(t => (t.type === 'task' || !t.type) && !t.completedAt)
    .filter(t => !q || (t.title ?? '').toLowerCase().includes(q))
    .slice(0, MAX_PER_KIND)
    .map(t => ({ kind: 'task', id: t.id, label: t.title || '(senza titolo)', projectId: t.projectId || undefined }))

  const projs: MentionItem[] = projects.value
    .filter(p => !p.archived)
    .filter(p => !q || (p.name ?? '').toLowerCase().includes(q))
    .slice(0, MAX_PER_KIND)
    .map(p => ({ kind: 'project', id: p.id, label: p.name || '(senza nome)', color: p.color }))

  const docs: MentionItem[] = allDocs.value
    .filter(d => !q || (d.title ?? '').toLowerCase().includes(q))
    .slice(0, MAX_PER_KIND)
    .map(d => ({ kind: 'doc', id: d.id, label: d.title || '(senza titolo)' }))

  return [...people, ...tasks, ...projs, ...docs]
})

const mentionIcon: Record<MentionKind, string> = {
  user: 'person', task: 'task_alt', project: 'folder', doc: 'description',
}

function selectMention(item: MentionItem) {
  const val = text.value
  const lastAt = val.lastIndexOf('@')
  text.value = (lastAt >= 0 ? val.slice(0, lastAt) : val) + '@' + item.label + ' '
  if (item.kind === 'user') {
    // email in `mentions` per le notifiche + chip 'user' (non cliccabile) come gli altri
    if (!mentions.value.includes(item.id)) mentions.value.push(item.id)
    pendingRefs.value.push({ type: 'user', id: item.id, label: item.label })
  } else {
    const type = item.kind as MsgRef['type']
    // niente projectId:undefined nel payload (Firestore rifiuta undefined)
    pendingRefs.value.push(
      item.projectId
        ? { type, id: item.id, projectId: item.projectId, label: item.label }
        : { type, id: item.id, label: item.label },
    )
  }
  showMentions.value = false
  inputRef.value?.focus()
}

// ── Send (optimistic) ─────────────────────────────────────────────────────
function send() {
  const body = text.value.trim()
  if (!body) return
  const payload = {
    text:      body,
    flags:     [...flags.value],
    hashtags:  [...selectedTags.value],
    mentions:  [...mentions.value],
    // tieni solo i ref ancora presenti nel testo (l'utente può averli cancellati)
    refs:      pendingRefs.value.filter(r => body.includes('@' + r.label)),
    replyToId: replyTo.value?.id ?? null,
  }
  const replyToMsg = replyTo.value

  // Optimistic: svuoto subito il composer. La bolla compare immediatamente
  // dallo snapshot locale (persistenza Firestore attiva) con stato `pending`,
  // poi confermata dal server; offline resta in coda e parte alla riconnessione.
  text.value = ''
  flags.value = []
  selectedTags.value = []
  mentions.value = []
  pendingRefs.value = []
  replyTo.value = null
  hashtagPicker.value = false
  showMentions.value = false
  nextTick(() => { autoResize(); scrollToBottom() })

  sendMessage(payload)
    .then(() => {
      if (replyToMsg?.flags.includes('question') && !replyToMsg.answeredAt) {
        return markAnswered(replyToMsg.id)
      }
    })
    .catch((e) => {
      console.error('[PULSAR] send error', e)
      // ripristina il testo per consentire il reinvio (se il composer è ancora vuoto)
      if (!text.value.trim()) text.value = body
    })
}

function onKeydown(e: KeyboardEvent) {
  // Enter = newline (passthrough nativo). Cmd/Ctrl+Enter = invio.
  // L'utente vuole poter andare a capo con Invio durante la scrittura
  // di messaggi multilinea; per inviare resta il bottone .send-btn o
  // lo shortcut Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux).
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
  }
}

// Hint shortcut: mostriamo "⌘↵" su Mac, "Ctrl+↵" altrove. Calcolato
// una volta sola (navigator.platform è stabile in sessione).
const sendShortcutHint = (() => {
  if (typeof navigator === 'undefined') return 'Ctrl+Invio per inviare'
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  return isMac ? '⌘ + Invio per inviare' : 'Ctrl + Invio per inviare'
})()

// ── Scroll: bottom oppure messaggio specifico via ?msg=ID ─────────────────
const highlightedMsgId = ref<string | null>(null)
const focusedFromQuery = ref(false)

function scrollToBottom() {
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

function scrollToMessage(id: string) {
  const list = listRef.value
  if (!list) return false
  const el = list.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null
  if (!el) return false

  // Scroll manuale (non scrollIntoView): calcoliamo esplicitamente la
  // posizione così il calcolo non dipende dall'interpretazione del
  // browser di scroll-margin in combinazione con flex/sticky layout.
  // Obiettivo: bottom della bolla a ~24px dal bottom dell'area
  // scrollabile (= top dell'input-area, perché .msg-list è flex sibling
  // dell'input).
  const BOTTOM_GAP = 24
  const doScroll = () => {
    const listRect = list.getBoundingClientRect()
    const elRect   = el.getBoundingClientRect()
    // Posizione assoluta del bottom dell'elemento rispetto al list scroll
    const elBottomInList = (elRect.bottom - listRect.top) + list.scrollTop
    const target = Math.max(0, elBottomInList + BOTTOM_GAP - list.clientHeight)
    list.scrollTo({ top: target, behavior: 'smooth' })
  }

  doScroll()
  // Ri-scroll dopo che il layout si è assestato: reply-bar appena montata,
  // tastiera virtuale iOS apparsa, font caricato. 400ms copre la maggior
  // parte degli scenari.
  setTimeout(doScroll, 400)

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

  // Setta replyTo PRIMA dello scroll, così la reply-bar è già in DOM e
  // l'altezza del list è quella definitiva quando calcoliamo la posizione.
  // Skip auto-focus dell'input: aprirebbe la tastiera virtuale iOS e
  // ridurrebbe il viewport coprendo di nuovo il messaggio targettato.
  // L'utente focusa quando vuole rispondere.
  if (wantReply) {
    const target = messages.value.find(m => m.id === targetId)
    if (target && target.from !== myEmail && !target.answeredAt) {
      replyTo.value = target
    }
  }

  return nextTick().then(() => {
    const ok = scrollToMessage(targetId)
    focusedFromQuery.value = ok
    return ok
  })
}

let inputStackRO: ResizeObserver | null = null
onMounted(() => {
  setTimeout(() => {
    if (!route.query.msg) scrollToBottom()
  }, 100)
  // Stato iniziale textarea: 1 riga compatta
  nextTick(autoResize)
  // Osserva l'altezza dello stack input per aggiornare --input-h quando
  // tag-picker o reply-bar appaiono/scompaiono (non solo via autoResize).
  if (typeof ResizeObserver !== 'undefined' && inputStackRef.value) {
    inputStackRO = new ResizeObserver(() => syncInputHeight())
    inputStackRO.observe(inputStackRef.value)
  }
})

// Modifiche programmatiche di `text` (es. selectMention, reply pre-fill,
// mention insertion) non passano da onInput → resize manuale.
watch(text, () => autoResize())

watch(() => messages.value.length, async () => {
  // Se sto arrivando da Pendenze (?msg=...) tento di centrare quel messaggio
  // prima di fare lo scroll a fondo. Una volta riuscito, non scrollo più a fondo automaticamente.
  if (route.query.msg && !focusedFromQuery.value) {
    await maybeApplyQueryFocus()
    return
  }
  if (!route.query.msg) nextTick(scrollToBottom)
})

// ── Crea azione da messaggio (modal condiviso TaskCreationModal) ───────────
const showTaskModal = ref(false)
const taskMsg = ref<{ id: string; text: string } | null>(null)
const taskModalMessage = computed(() =>
  taskMsg.value ? { id: taskMsg.value.id, text: taskMsg.value.text, chatId } : null,
)

function openTaskModal(msg: { id: string; text: string }) {
  taskMsg.value = { id: msg.id, text: msg.text }
  nextTick(() => { showTaskModal.value = true })
}

async function onTaskCreated(taskId: string) {
  if (taskMsg.value) await linkTask(taskMsg.value.id, taskId)
}

function onTaskReject() {
  if (taskMsg.value) rejectTask(taskMsg.value.id)
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatTime(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(d)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
const REF_ICON: Record<MsgRef['type'], string> = {
  task: 'check_circle', project: 'folder', doc: 'description', user: 'person',
}
function chipHtml(r: MsgRef): string {
  // icona via .m-icon (font Material Symbols globale, ligature) → renderizzabile in v-html.
  // is-filled = glifo pieno; il colore lo eredita (currentColor) dalla famiglia chip.
  const icon = `<span class="m-icon is-filled msg-ref-ic">${REF_ICON[r.type]}</span>`
  // etichetta troncata per non far sforare la bolla; tooltip col testo completo
  const MAX = 28
  const shown = r.label.length > MAX ? r.label.slice(0, MAX - 1).trimEnd() + '…' : r.label
  return `<span class="msg-ref msg-ref--${r.type}" data-ref-type="${r.type}"`
    + ` data-ref-id="${escapeAttr(r.id)}" data-ref-project="${escapeAttr(r.projectId ?? '')}"`
    + ` title="${escapeAttr(r.label)}" role="link" tabindex="0">${icon}${escapeHtml(shown)}</span>`
}

// Resa ricca della bolla: i `refs` (task/progetto/doc) diventano chip cliccabili;
// hashtag e mention-persona restano evidenziati (persona non cliccabile). Legacy
// (messaggi senza refs) e @testo digitato a mano → resa come prima.
// Sentinel NUL: non digitabile dall'utente e fuori da \w\s, quindi non collide
// col testo né interferisce con le regex hashtag/mention.
const NUL = String.fromCharCode(0)
function renderRich(msg: { text: string; refs?: MsgRef[] }): string {
  let work = escapeHtml(msg.text)
  const chips: string[] = []
  for (const r of (msg.refs ?? [])) {
    const needle = '@' + escapeHtml(r.label)
    const idx = work.indexOf(needle)           // prima occorrenza non consumata
    if (idx === -1) continue
    const token = NUL + chips.length + NUL
    chips.push(chipHtml(r))
    work = work.slice(0, idx) + token + work.slice(idx + needle.length)
  }
  work = work
    .replace(/#(\w+)/g, '<span class="msg-hashtag">#$1</span>')
    .replace(/@([\w\s]+)/g, '<span class="msg-mention">@$1</span>')
  return work.replace(new RegExp(NUL + '(\\d+)' + NUL, 'g'), (_m, n) => chips[Number(n)] ?? '')
}

// Click su una chip → apre l'entità. window.open('_blank') così su mobile apre
// la PWA corretta (scope manifest /cepheid/ /nebula/).
function openEntity(type: string | undefined, id: string, projectId: string) {
  let url = ''
  if (type === 'task') url = projectId ? `/cepheid/project/${projectId}` : '/cepheid'
  else if (type === 'project') url = `/cepheid/project/${id}`
  else if (type === 'doc') url = `/nebula/docs/${id}`
  if (url) window.open(url, '_blank')
}
function onBubbleClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-ref-type]') as HTMLElement | null
  if (!el) return
  openEntity(el.dataset.refType, el.dataset.refId ?? '', el.dataset.refProject ?? '')
}
</script>

<template>
  <div class="mv" ref="mvRef">
    <!-- Header chat -->
    <header v-if="chatDoc" class="chat-header">
      <button
        class="chat-back-btn"
        aria-label="Torna alle chat"
        @click="router.push('/pulsar')"
      ><MIcon name="arrow_back" :size="22" /></button>
      <StarAvatar v-if="!chatDoc.isGroup" v-bind="starAvatarProps(otherMember, members)" :size="40" />
      <div v-else class="chat-header-avatar" :style="{ background: chatAvatarBg }">
        {{ chatAvatarInitial }}
      </div>
      <div class="chat-header-info">
        <div class="chat-header-name">{{ chatTitle }}</div>
        <div v-if="chatSubtitle" class="chat-header-sub">{{ chatSubtitle }}</div>
      </div>
    </header>

    <!-- Messages list -->
    <div ref="listRef" class="msg-list" @click="onBubbleClick">
      <div v-if="loading" class="loading-msgs">
        <div v-for="i in 5" :key="i" class="msg-skel" :class="i % 2 ? 'msg-skel--right' : ''" />
      </div>
      <div v-else-if="!messages.length" class="empty-msgs">Nessun messaggio. Apri la conversazione.</div>

      <div
        v-for="group in messageGroups"
        :key="group.messages[0].id"
        class="msg-group"
        :class="{ 'is-mine': group.isMine }"
      >
        <!-- Stack delle bolle del gruppo. È un GRID con grid-template-columns:
             max-content così tutte le bolle del gruppo prendono la larghezza
             della più ampia (uniformità visiva richiesta). Niente avatar a
             fianco: l'identità del mittente è nella prima bubble (group chat). -->
        <div class="msg-group-stack">
          <div
            v-for="msg in group.messages"
            :key="msg.id"
            class="msg-row"
            :class="[
              `gp-${msg.groupPos}`,
              {
                'is-mine': group.isMine,
                'has-flags': msg.flags.length > 0,
                'is-highlighted': highlightedMsgId === msg.id,
              },
            ]"
            :data-msg-id="msg.id"
          >
            <!-- Corner flag badges (outside bubble).
                 Per i miei messaggi i pin sono solo indicatori di stato (non cliccabili). -->
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
              <MIcon name="question_mark" filled class="flag-pin-icon" />
            </button>
            <button
              v-if="msg.flags.includes('task')"
              class="flag-pin"
              :class="[
                (msg.taskId || msg.rejectedAt) ? 'flag-pin--done' : 'flag-pin--t',
                msg.flags.includes('question') ? 'flag-pin--second' : '',
                msg.from === myEmail ? 'flag-pin--readonly' : '',
              ]"
              :disabled="msg.from === myEmail || !!msg.taskId || !!msg.rejectedAt"
              :title="msg.from === myEmail
                ? (msg.taskId
                    ? 'Azione creata dal destinatario'
                    : (msg.rejectedAt ? 'Azione rifiutata' : 'In attesa che venga creata l’azione'))
                : (msg.taskId
                    ? 'Azione creata'
                    : (msg.rejectedAt ? 'Azione rifiutata' : 'Clicca per creare o rifiutare'))"
              @click.stop="msg.from !== myEmail && !msg.taskId && !msg.rejectedAt && openTaskModal(msg)"
            >
              <MIcon
                :name="msg.rejectedAt ? 'block' : 'check'"
                filled
                class="flag-pin-icon"
              />
            </button>

            <div
              class="msg-bubble"
              :class="[
                `bubble-gp-${msg.groupPos}`,
                { 'is-mine': group.isMine },
              ]"
            >
              <!-- Sender name: solo in chat di gruppo, solo per altrui, solo
                   nella prima bolla del gruppo (first|single) — pattern Slack. -->
              <div
                v-if="!group.isMine && chatDoc?.isGroup && (msg.groupPos === 'first' || msg.groupPos === 'single')"
                class="msg-bubble-sender"
              >{{ displayName(group.from, members) }}</div>

              <!-- Reply quote (stile WhatsApp) -->
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

              <p class="msg-text" v-html="renderRich(msg)" />

              <!-- Hashtags -->
              <div v-if="msg.hashtags.length" class="msg-tags">
                <button
                  v-for="tag in msg.hashtags"
                  :key="tag"
                  class="msg-tag"
                  @click="router.push('/pulsar/tag/' + tag)"
                >#{{ tag }}</button>
              </div>

              <!-- stato "in invio" (optimistic/offline): finché non confermato dal server -->
              <span v-if="group.isMine && msg.pending" class="msg-pending" title="In invio…">
                <MIcon name="schedule" :size="12" />
              </span>
            </div>
          </div>

          <!-- Orario: ultimo del gruppo -->
          <div class="msg-time">{{ formatTime(group.messages[group.messages.length - 1].createdAt) }}</div>
        </div>
      </div>
    </div>

    <!-- @mention autocomplete (persone + azioni + progetti + documenti) -->
    <div v-if="showMentions && mentionSuggestions.length" class="mention-popup">
      <div
        v-for="item in mentionSuggestions"
        :key="item.kind + ':' + item.id"
        class="mention-item"
        @mousedown.prevent="selectMention(item)"
      >
        <StarAvatar v-if="item.kind === 'user'" v-bind="starAvatarProps(item.id, members)" :size="22" />
        <span
          v-else
          class="mention-ic"
          :class="'mention-ic--' + item.kind"
          :style="item.kind === 'project' && item.color ? { color: item.color } : {}"
        >
          <MIcon :name="mentionIcon[item.kind]" :size="15" />
        </span>
        <span class="mention-label">{{ item.label }}</span>
        <span class="mention-kind">{{ item.kind === 'user' ? 'persona' : item.kind === 'task' ? 'azione' : item.kind === 'project' ? 'progetto' : 'doc' }}</span>
      </div>
    </div>

    <!-- Stack delle UI ancorate in basso (tag-picker, reply-bar, input-area).
         Posizionato assoluto sopra .msg-list così i messaggi scorrono visibili
         attorno alle pillole. ResizeObserver sincronizza --input-h. -->
    <div class="input-stack" ref="inputStackRef">

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
    <div class="input-area" ref="inputAreaRef">
      <!-- Pills -->
      <div class="pills">
        <button
          class="pill"
          :class="{ 'is-active': flags.includes('question') }"
          title="Domanda"
          @click="toggleFlag('question')"
        ><MIcon name="question_mark" :filled="flags.includes('question')" class="pill-icon" /></button>
        <button
          class="pill"
          :class="{ 'is-active': flags.includes('task') }"
          title="Azione"
          @click="toggleFlag('task')"
        ><MIcon name="check" :filled="flags.includes('task')" class="pill-icon" /></button>
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
        <button class="send-btn" :disabled="!text.trim()" @click="send">
          <MIcon name="send" filled :size="20" />
        </button>
        <span class="send-hint">{{ sendShortcutHint }}</span>
      </div>
    </div>

    </div><!-- /.input-stack -->

    <!-- Create task modal (componente condiviso) -->
    <TaskCreationModal
      v-model:open="showTaskModal"
      :message="taskModalMessage"
      :members="members"
      :projects="projects"
      @created="onTaskCreated"
      @reject="onTaskReject"
    />
  </div>
</template>

<style scoped>
.mv {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  width: 100%;
  margin: 0 auto;
  /* Page-bg condiviso con resto della suite (CEPHEID/NEBULA/PULSAR liste) */
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .mv { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .mv { --page-bg: #0E0C07; }
}

/* Desktop: stringi la chat per leggibilità */
@media (min-width: 900px) {
  .mv {
    max-width: 880px;
    border-left: 1px solid var(--md-sys-color-outline-variant);
    border-right: 1px solid var(--md-sys-color-outline-variant);
  }
}

/* Header chat (nome + sottotitolo) — niente MdPageHeader: la chat ha
   chrome dedicato con avatar+nome+stato del contatto, non sostituibile.
   Stesso bg surface delle bolle altrui, per coerenza visiva. */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: var(--md-sys-color-surface);
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
/* Back button: torna alle chat (sostituisce la bottom-nav nascosta in chat).
   Stesso pattern usato sui modal-close (icona ghost senza bg). */
.chat-back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  padding: 0;
  margin-left: -8px;
  border-radius: var(--md-sys-shape-corner-full);
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}
.chat-back-btn:active { background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent); }
.chat-header-info { flex: 1; min-width: 0; }
.chat-header-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-header-sub {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Messages */
.msg-list {
  flex: 1;
  overflow-y: auto;
  /* padding-bottom dinamico: lascia spazio sotto l'ultimo messaggio così
     resta visibile sopra all'input-area assoluta. --input-h aggiornato
     da autoResize() in JS (default 80px = 1 riga + pad + safe-area). */
  padding: 16px 16px calc(var(--input-h, 80px) + 8px);
  display: flex;
  flex-direction: column;
  /* min-height: 0 essenziale su iOS: senza, il flex child cresce all'altezza
     naturale del contenuto e spinge l'input-area fuori viewport. */
  min-height: 0;
  /* Spaziatura gestita da margin-top sulle wrap: 12px tra gruppi, 2px dentro al gruppo */
}

.loading-msgs { display: flex; flex-direction: column; gap: 10px; }

.msg-skel {
  height: 44px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--md-sys-color-outline-variant) 60%, transparent);
  width: 65%;
  animation: pulse 1.4s ease-in-out infinite;
}

.msg-skel--right {
  align-self: flex-end;
  background: color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-msgs {
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
  padding: 40px 0;
}

/* Outer wrapper di un gruppo di messaggi consecutivi (stesso mittente, ≤3 min).
   Un "gruppo" può anche contenere una sola bolla (caso single).
   Niente avatar a fianco: lo stack va flush a sinistra (altrui) o destra (miei). */
.msg-group {
  display: flex;
  align-items: flex-end;
  margin-top: 12px;
}
.msg-group:first-child { margin-top: 0; }
.msg-group.is-mine { flex-direction: row-reverse; }

/* Stack delle bolle del gruppo: GRID con UNA sola colonna max-content.
   Tutte le bolle del gruppo prendono come larghezza il max-content della
   più ampia → uniformità visiva. Capped a 75% del container chat. */
.msg-group-stack {
  display: grid;
  grid-template-columns: minmax(0, max-content);
  row-gap: 2px;
  max-width: 75%;
  min-width: 0;
}
.msg-group.is-mine .msg-group-stack { justify-items: end; }

/* Ogni bolla in un gruppo è una riga indipendente per ospitare i flag-pin
   in absolute. has-flags aggiunge clearance superiore per il pin. */
.msg-row {
  position: relative;
  width: 100%;
}
.msg-row.has-flags { margin-top: 16px; }
/* La prima riga ha già spaziatura via .msg-group { margin-top }, non servono
   altri offset. Per FIRST has-flags il margin-top:16px serve a separare il
   pin dal gruppo precedente. */

/* Highlight quando arrivi a un messaggio specifico da Hashtag/Pendenze.
   Senza ring/glow: uso una variazione momentanea del background della
   bolla (primary-container tint) che decade dopo ~2.2s. */
.msg-row.is-highlighted .msg-bubble:not(.is-mine) {
  background: color-mix(in srgb, var(--md-sys-color-primary) 16%, var(--md-sys-color-surface));
  transition: background var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
}
.msg-row.is-highlighted .msg-bubble.is-mine {
  background: color-mix(in srgb, #FFFFFF 22%, var(--md-sys-color-primary));
  transition: background var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
}

/* Sender name dentro la prima bubble di un gruppo (chat di gruppo, altrui).
   Pattern Slack: identità inline col messaggio invece di header esterno. */
.msg-bubble-sender {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--md-sys-color-primary);
  margin-bottom: 3px;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

/* Bolla messaggi altrui: surface su page-bg beige.
   Border-radius default = SINGLE (tail BL=4); le varianti gruppo sotto
   sovrascrivono in base a bubble-gp-{first|middle|last}.
   Flat: niente bordo, niente ombra, niente bagliore. */
.msg-bubble {
  background: var(--md-sys-color-surface);
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
}

/* Raggruppamento (altri, lato sinistro):
   gli angoli interni (toccano un'altra bolla dello stesso gruppo) → 4px.
   - first:  top esterno (TL/TR rotondi), bottom interno (BL/BR appiattiti)
   - middle: tutti gli angoli interni
   - last:   top interno, bottom esterno (BL/BR rotondi, niente tail) */
.msg-bubble.bubble-gp-first  { border-radius: 16px 16px  4px  4px; }
.msg-bubble.bubble-gp-middle { border-radius:  4px  4px  4px  4px; }
.msg-bubble.bubble-gp-last   { border-radius:  4px  4px 16px 16px; }

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
  color: var(--md-sys-color-primary);
  letter-spacing: 0.02em;
}
.reply-quote-text {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Bolla propria: sfondo TEAL pieno + testo bianco su contrasto */
.msg-bubble.is-mine {
  background: var(--md-sys-color-primary);
  border-radius: 16px 16px 4px 16px;
  color: var(--md-sys-color-on-primary);
}
/* Raggruppamento (mie, lato destro):
   - first:  bottom interno (BL/BR appiattiti)
   - middle: tutti appiattiti
   - last:   top interno (TL/TR appiattiti), bottom esterno rotondo */
.msg-bubble.is-mine.bubble-gp-first  { border-radius: 16px 16px  4px  4px; }
.msg-bubble.is-mine.bubble-gp-middle { border-radius:  4px  4px  4px  4px; }
.msg-bubble.is-mine.bubble-gp-last   { border-radius:  4px  4px 16px 16px; }
.msg-bubble.is-mine .msg-text { color: var(--md-sys-color-on-primary); }
/* Reply quote dentro bolla propria: vetro chiaro su teal */
.msg-bubble.is-mine .reply-quote {
  background: rgba(255, 255, 255, 0.18);
  border-left-color: rgba(255, 255, 255, 0.7);
}
.msg-bubble.is-mine .reply-quote-sender { color: rgba(255, 255, 255, 0.95); }
.msg-bubble.is-mine .reply-quote-text   { color: rgba(255, 255, 255, 0.78); }
/* Hashtag e mention dentro bolla propria: leggibili su teal */
.msg-bubble.is-mine :deep(.msg-hashtag),
.msg-bubble.is-mine :deep(.msg-mention) { color: rgba(255, 255, 255, 0.95); }

.msg-text { font-size: 20px; line-height: 1.4; color: var(--md-sys-color-on-surface); white-space: pre-wrap; word-break: break-word; margin: 0; }

:deep(.msg-hashtag) { color: var(--md-sys-color-primary); font-weight: 600; cursor: pointer; }
:deep(.msg-mention) { color: var(--s-nebula-on-light); font-weight: 600; }

/* Flag pins — corner-anchored badges.
   Per i miei messaggi i pin stanno a sinistra (angolo interno), per quelli
   degli altri a destra (sempre angolo interno verso il centro della chat). */
.flag-pin {
  position: absolute;
  top: -16px;
  left: -16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Pallino pieno colorato (variante --q/--t/--done sotto), icona bianca
     dentro. Niente ombra, niente opacità sul disabled (altrimenti il
     pallino sui propri messaggi appariva traslucido). */
  background: var(--md-sys-color-surface);
  color: #fff;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: transform 0.15s;
  z-index: 2;
  padding: 0;
}

.flag-pin--second { left: 20px; }

/* Messaggi di altri: pin a destra (angolo interno rispetto alla chat) */
.msg-row:not(.is-mine) .flag-pin { left: auto; right: -16px; }
.msg-row:not(.is-mine) .flag-pin--second { left: auto; right: 20px; }

.flag-pin:hover:not(:disabled):not(.flag-pin--done) { transform: scale(1.15); }

.flag-pin--q    { background: #F59E0B; }
.flag-pin--t    { background: #10B981; }
.flag-pin--done { background: #B4B0AA; cursor: default; }
.flag-pin:disabled { cursor: default; }
.flag-pin--readonly { cursor: default; }

.flag-pin-icon { font-size: 20px; color: inherit; flex-shrink: 0; line-height: 1; }

/* Reply bar */
.reply-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--md-sys-color-surface);
  border-top: 1px solid var(--md-sys-color-outline-variant);
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
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reply-bar-cancel {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  flex-shrink: 0;
  transition: color 0.15s;
}

.reply-bar-cancel:hover { color: var(--md-sys-color-on-surface); }

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
/* Bolla mia (sfondo teal pieno): inverti il colore del tag chip in bianco
   così il contrasto resta leggibile. Stesso pattern già usato per gli
   #hashtag e @mention inline dentro il testo. */
.msg-bubble.is-mine .msg-tag { color: rgba(255, 255, 255, 0.95); }

.msg-time {
  font-size: 10px;
  color: var(--md-sys-color-on-surface-variant);
  padding-left: 2px;
  justify-self: start;
  margin-top: 2px;
}
.msg-group.is-mine .msg-time { justify-self: end; padding-left: 0; padding-right: 2px; }

/* @mention popup */
.mention-popup {
  position: absolute;
  bottom: 120px;
  left: 16px;
  right: 16px;
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid var(--md-sys-color-outline-variant);
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
  color: var(--md-sys-color-on-surface);
  transition: background 0.12s;
}

.mention-item:hover { background: var(--md-sys-color-surface-container); }

.mention-popup { max-height: 40vh; overflow-y: auto; }

/* icona del tipo entità (azione/progetto/doc) nella popup */
.mention-ic {
  width: 24px; height: 24px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--md-sys-shape-corner-full);
}
.mention-ic--task { background: rgba(212, 160, 32, 0.16); color: #8b6a14; }
.mention-ic--project { background: color-mix(in srgb, currentColor 14%, transparent); }
.mention-ic--doc { background: rgba(196, 96, 48, 0.14); color: #C46030; }
.mention-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mention-kind {
  flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container); padding: 2px 7px;
  border-radius: var(--md-sys-shape-corner-full);
}

.mention-av {
  width: 28px; height: 28px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}

/* chip cliccabili dentro la bolla (mention di entità). display:inline così la
   chip scorre nel testo e si allinea al baseline del testo normale a fianco;
   font-size:inherit = stessa dimensione del testo del messaggio. */
:deep(.msg-ref) {
  display: inline;
  font-size: inherit; font-weight: 600;
  padding: 0 5px; border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer; text-decoration: none;
  /* niente nowrap: la chip va a capo dentro la bolla se serve;
     box-decoration-break:clone tiene la pill continua sulle righe */
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
  transition: background 0.12s, border-color 0.12s;
}
/* icona inline allineata alla linea del testo (override del display:inline-flex di .m-icon) */
:deep(.msg-ref-ic) {
  display: inline-block; font-size: 1em;
  vertical-align: -0.16em; margin-right: 2px;
}
/* Due sole famiglie cromatiche, l'icona distingue dentro la famiglia:
   CEPHEID (oro) per task+progetti, NEBULA (terracotta) per doc+persone. */
:deep(.msg-ref--task),
:deep(.msg-ref--project) {
  color: var(--s-cepheid-on-light);
  background: color-mix(in srgb, var(--s-cepheid-on-light) 14%, transparent);
  border-color: color-mix(in srgb, var(--s-cepheid-on-light) 36%, transparent);
}
:deep(.msg-ref--doc),
:deep(.msg-ref--user) {
  color: var(--s-nebula-on-light);
  background: color-mix(in srgb, var(--s-nebula-on-light) 14%, transparent);
  border-color: color-mix(in srgb, var(--s-nebula-on-light) 36%, transparent);
}
:deep(.msg-ref--user) { cursor: default; }   /* persona: chip non cliccabile */
:deep(.msg-ref:hover) { filter: brightness(0.96); text-decoration: underline; }
:deep(.msg-ref--user:hover) { filter: none; text-decoration: none; }
/* Nelle bolle proprie (sfondo teal pieno) la chip diventa una pill chiara così
   il colore-tipo (testo+icona+bordo, da .msg-ref--*) resta leggibile e distinto. */
.msg-bubble.is-mine :deep(.msg-ref) { background: rgba(255,255,255,0.93); border-color: currentColor; }

/* Hashtag picker: trasparente come la barra di scrittura. Il campo di
   ricerca (.tag-search) e i chip (.tag-option/.sel-tag) restano "bolle"
   con il proprio bg, ma il container è trasparente così i messaggi
   sono visibili negli spazi attorno. */
.tag-picker {
  background: transparent;
  padding: 12px 16px;
  max-height: 220px;
  overflow-y: auto;
}

.tag-picker-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.tag-search {
  /* Pill come .input-wrap: stesso radius/bg, niente bordo. Inizia stretta
     e cresce con il testo grazie a field-sizing:content (supportato su
     Chrome 123+, Safari iOS 17.4+). min-width copre il placeholder. */
  width: auto;
  min-width: 160px;
  max-width: 100%;
  field-sizing: content;
  box-sizing: border-box;
  background: var(--md-sys-color-surface);
  border: 0;
  border-radius: 20px;
  padding: 6px 14px;
  /* 16px previene lo zoom automatico di iOS Safari sul focus input. */
  font-size: 16px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  outline: none;
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
  border: 1.5px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container);
  font-size: 12px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
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
/* Wrapper assoluto che raggruppa tag-picker + reply-bar + input-area:
   sta sopra .msg-list così i messaggi scorrono visibili negli spazi
   attorno alle pillole (telegram-style). pointer-events:none consente
   di scrollare la lista toccando lo spazio fra le pillole; i figli
   ripristinano pointer-events:auto sui propri elementi. */
.input-stack {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}
.input-stack > * { pointer-events: auto; }

.input-area {
  background: transparent;
  /* padding-bottom maggiorato: la barra non deve toccare il bordo schermo
     (sotto la safe-area iPhone resta comunque clearance per la home indicator
     o per il chrome browser su Android). */
  padding: 10px 14px calc(22px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 8px;
}

.pills { display: flex; gap: 4px; flex-shrink: 0; }

/* Pillole circolari con bg surface (stesso colore delle bolle altrui),
   coerente con header e textbox. Active = primary tint. */
.pill {
  width: 36px; height: 36px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 0;
  background: var(--md-sys-color-surface);
  cursor: pointer;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
}

@media (hover: hover) {
  .pill:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 14%, var(--md-sys-color-surface)); }
}
.pill:active { background: color-mix(in srgb, var(--md-sys-color-primary) 22%, var(--md-sys-color-surface)); }
.pill.is-active { background: color-mix(in srgb, var(--md-sys-color-primary) 18%, var(--md-sys-color-surface)); }

.pill-icon { font-size: 20px; color: var(--md-sys-color-on-surface-variant); flex-shrink: 0; }
.pill.is-active .pill-icon { color: var(--md-sys-color-primary); }

.input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--md-sys-color-surface);
  /* No border: il pill-shape è dato dal border-radius + bg. */
  border: 0;
  border-radius: 20px;
  padding: 6px 6px 6px 14px;
  -webkit-tap-highlight-color: transparent;
}

.msg-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  /* 16px previene lo zoom automatico su iOS Safari quando focus */
  font-size: 16px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  caret-color: var(--md-sys-color-primary);
  resize: none;
  line-height: 1.5;
  /* Cap a 10 righe (line-height 1.5 × font 16px = 24px/riga × 10 = 240px).
     autoResize() in JS aggiorna height/overflowY dinamicamente; il max-height
     CSS resta come safety net se onInput non scatta. */
  max-height: 240px;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}

.msg-input:focus { outline: none; box-shadow: none; }
.msg-input::placeholder { color: var(--md-sys-color-on-surface-variant); }
.msg-input::selection { background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent); }

.send-btn {
  width: 34px; height: 34px;
  border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary);
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-on-primary);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, transform 0.1s;
}

.send-btn:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.send-btn:disabled { background: var(--md-sys-color-outline); cursor: not-allowed; }
.send-btn:active:not(:disabled) { transform: scale(0.92); }

/* Hint shortcut invio: visibile solo su desktop (hover-capable),
   nascosto su touch dove non c'è tastiera fisica. */
.send-hint {
  display: none;
  font-size: 10.5px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  padding-right: 6px;
  user-select: none;
  pointer-events: none;
}
@media (hover: hover) {
  .send-hint { display: inline; }
}

/* indicatore "in invio" (optimistic/offline) dentro la bolla */
.msg-pending {
  display: inline-flex; align-items: center; vertical-align: middle;
  margin-left: 4px; opacity: 0.55;
}
</style>
