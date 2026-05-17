import { ref, computed, onUnmounted } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'

export interface ChatHashtag {
  name: string
  count: number
  lastUsedAt: Date | null
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useChatHashtags() {
  const hashtags = ref<ChatHashtag[]>([])

  const q = query(
    collection(db, 'chatHashtags'),
    orderBy('count', 'desc'),
    limit(20),
  )

  const unsubscribe = onSnapshot(q, (snap) => {
    hashtags.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        name:       data.name ?? d.id,
        count:      data.count ?? 0,
        lastUsedAt: toDate(data.lastUsedAt),
      }
    })
  }, (err) => {
    console.error('[useChatHashtags]', err)
  })

  onUnmounted(unsubscribe)

  function suggestHashtags(prefix: string): ChatHashtag[] {
    if (!prefix) return hashtags.value
    return hashtags.value.filter(h => h.name.toLowerCase().startsWith(prefix.toLowerCase()))
  }

  const topFive = computed(() => hashtags.value.slice(0, 5))

  return { hashtags, topFive, suggestHashtags }
}
