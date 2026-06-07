<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { collectionGroup, query, where, orderBy, limit, onSnapshot, getDoc } from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { displayName, useTeamMembers, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const route  = useRoute()
const router = useRouter()
const { members } = useTeamMembers()

const tagName = route.params.tag as string

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

interface TagMessage {
  id: string
  chatId: string
  chatName: string
  text: string
  from: string
  createdAt: Date
  hashtags: string[]
}

const tagMessages = ref<TagMessage[]>([])
const loading = ref(true)

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

// (N2) Sicurezza: la query collectionGroup è vincolata ai messaggi delle chat
// di cui sono membro (`members array-contains` la mia email) — così le rules
// possono concederla senza esporre le chat altrui. Il filtro per hashtag non
// può stare nella stessa query (Firestore vieta due `array-contains`), quindi
// si applica lato client sotto.
// Email GREZZA (non minuscolizzata): `array-contains` richiede match esatto e
// i `members` sono memorizzati come `request.auth.token.email` (= currentUser.email).
const myEmail = auth.currentUser?.email ?? ''
const q = query(
  collectionGroup(db, 'messages'),
  where('members', 'array-contains', myEmail),
  orderBy('createdAt', 'desc'),
  limit(500),
)

const unsubscribe = onSnapshot(q, async (snap) => {
  if (snap.metadata.fromCache && snap.empty) {
    loading.value = false
    return
  }
  const results: TagMessage[] = []
  for (const d of snap.docs) {
    const data     = d.data()
    if (!(data.hashtags ?? []).includes(tagName)) continue   // filtro hashtag lato client
    const chatRef  = d.ref.parent.parent
    const chatId   = chatRef?.id ?? ''
    let   chatName = ''

    if (chatRef) {
      try {
        const chatSnap = await getDoc(chatRef)
        chatName = chatSnap.data()?.name ?? ''
      } catch (_) {}
    }

    results.push({
      id:        d.id,
      chatId,
      chatName:  chatName || chatId.slice(0, 8),
      text:      data.text ?? '',
      from:      data.from ?? '',
      createdAt: toDate(data.createdAt) ?? new Date(),
      hashtags:  data.hashtags ?? [],
    })
  }
  tagMessages.value = results
  loading.value = false
  // Nota (N2): il contatore `chatHashtags` non viene più riconciliato qui — con
  // la vista filtrata per-membro `results.length` è il MIO conteggio, non quello
  // globale. Il counter resta approssimato (incrementato all'invio).
}, (err) => {
  console.error('[PulsarHashtagView]', err)
  loading.value = false
})

onUnmounted(unsubscribe)

function formatTime(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

function renderText(t: string) {
  return t
    .replace(/#(\w+)/g, '<span class="msg-hashtag">#$1</span>')
    .replace(/@([\w\s]+)/g, '<span class="msg-mention">@$1</span>')
}
</script>

<template>
  <div class="hv" ref="scrollEl">
    <MdPageHeader
      :title="'#' + tagName"
      :subtitle="`${tagMessages.length} ${tagMessages.length === 1 ? 'messaggio' : 'messaggi'}`"
      sticky
      :hidden="headerHidden"
    />

    <div class="hv-content">
      <!-- Loading -->
      <div v-if="loading" class="loading-list">
        <div v-for="i in 4" :key="i" class="msg-skel" />
      </div>

      <!-- Empty -->
      <div v-else-if="!tagMessages.length" class="empty-state">
        Nessun messaggio con #{{ tagName }} ancora.
      </div>

      <!-- Message cards -->
      <div v-else class="msg-cards">
        <div v-for="msg in tagMessages" :key="msg.id" class="msg-card">
          <div class="card-header">
            <StarAvatar v-bind="starAvatarProps(msg.from, members)" :size="32" />
            <div class="card-meta">
              <div class="card-sender">{{ displayName(msg.from, members) }}</div>
              <div class="card-chat">in {{ msg.chatName }}</div>
            </div>
            <div class="card-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
          <p class="card-text" v-html="renderText(msg.text)" />
          <button
            class="open-btn"
            @click="router.push('/pulsar/chat/' + msg.chatId + '?msg=' + msg.id)"
          >
            Apri in chat
            <MIcon name="open_in_new" :size="14" class="open-btn-icon" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hv {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  height: 100%;
  width: 100%;
  overflow: auto;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .hv { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .hv { --page-bg: #0E0C07; }
}

/* Header flat: stesso bg della pagina, niente bordo/ombra. */
:deep(.md-page-header) {
  padding: 18px 16px 14px;
  background: var(--page-bg);
  border-bottom: none;
}
:deep(.md-page-header__title) {
  text-transform: lowercase;
  letter-spacing: 0.04em;
  color: var(--md-sys-color-primary);
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
}

.hv-content {
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
}
@media (min-width: 1024px) {
  .hv-content { padding: 24px 40px; max-width: 900px; }
}

/* Loading */
.loading-list { display: flex; flex-direction: column; gap: 10px; }

.msg-skel {
  height: 90px; border-radius: 16px;
  background: color-mix(in srgb, var(--md-sys-color-outline-variant) 60%, transparent);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
}

/* Cards */
.msg-cards { display: flex; flex-direction: column; gap: 10px; }

.msg-card {
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  padding: 14px 16px;
  /* Bordi e ombre rimossi per look piatto. */
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.card-meta { flex: 1; }

.card-sender { font-size: 13px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.card-chat   { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }
.card-time   { font-size: 11px; color: var(--md-sys-color-on-surface-variant); flex-shrink: 0; }

.card-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface);
  margin: 0 0 10px;
  word-break: break-word;
}

:deep(.msg-hashtag) { color: var(--md-sys-color-primary); font-weight: 600; }
:deep(.msg-mention) { color: #2F6B4A; font-weight: 600; }

.open-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-primary);
  cursor: pointer;
  transition: all 0.18s ease;
}

.open-btn:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  border-color: var(--md-sys-color-primary);
}
.open-btn-icon { opacity: 0.8; }
</style>
