<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { collectionGroup, query, where, orderBy, onSnapshot, getDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { displayName, useTeamMembers, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import MIcon from '../../components/shared/MIcon.vue'

const route  = useRoute()
const router = useRouter()
const { members } = useTeamMembers()

const tagName = route.params.tag as string

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

const q = query(
  collectionGroup(db, 'messages'),
  where('hashtags', 'array-contains', tagName),
  orderBy('createdAt', 'desc'),
)

const unsubscribe = onSnapshot(q, async (snap) => {
  if (snap.metadata.fromCache && snap.empty) return
  const results: TagMessage[] = []
  for (const d of snap.docs) {
    const data     = d.data()
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
  setDoc(doc(db, 'chatHashtags', tagName), { name: tagName, count: results.length }, { merge: true }).catch(() => {})
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
  <div class="hv">
    <!-- Header -->
    <div class="hv-header">
      <h2 class="hv-title">#{{ tagName }}</h2>
      <p class="hv-sub">{{ tagMessages.length }} messaggi</p>
    </div>

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
</template>

<style scoped>
.hv {
  padding: 0;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
}

.hv-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid #E8E5DF;
  background: #fff;
}

.hv-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  color: var(--md-sys-color-primary-hover);
  margin: 0 0 4px 0;
}

.hv-sub { font-size: 12px; color: #9B9590; }

/* Loading */
.loading-list { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }

.msg-skel {
  height: 90px; border-radius: 14px;
  background: #E8E5DF;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
}

/* Cards */
.msg-cards { display: flex; flex-direction: column; gap: 1px; }

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
  width: 36px; height: 36px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; flex-shrink: 0;
}

.card-meta { flex: 1; }

.card-sender { font-size: 13px; font-weight: 600; color: #1A1917; }
.card-chat   { font-size: 11px; color: #9B9590; }
.card-time   { font-size: 11px; color: #B0ADA8; flex-shrink: 0; }

.card-text {
  font-size: 14px;
  line-height: 1.5;
  color: #3A3835;
  margin: 0 0 10px;
  word-break: break-word;
}

:deep(.msg-hashtag) { color: var(--md-sys-color-primary-hover); font-weight: 600; }
:deep(.msg-mention) { color: #2F6B4A; font-weight: 600; }

.open-btn {
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

.open-btn:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent); }
.open-btn-icon { opacity: 0.8; }
</style>
