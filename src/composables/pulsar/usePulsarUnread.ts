import { ref, computed, watch, type Ref } from 'vue'
import { collection, query, where, getCountFromServer, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import type { Chat } from './useChats'

// Tracciamento "ultimo messaggio visto" per chat, persistito in localStorage.
// Limite: per dispositivo (non sincronizzato fra device dello stesso utente).
const STORAGE_KEY = 'pulsar-last-seen'

function loadSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const seen = ref<Record<string, number>>(loadSeen())

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seen.value)) } catch { /* ignore */ }
}

export function markChatRead(chatId: string, lastMessageAt: Date | null) {
  if (!chatId || !lastMessageAt) return
  const ts = lastMessageAt.getTime()
  if ((seen.value[chatId] ?? 0) >= ts) return
  seen.value = { ...seen.value, [chatId]: ts }
  persist()
}

export function useUnreadChats(chats: Ref<Chat[]>) {
  const unreadIds = computed(() => {
    return chats.value
      .filter(c => {
        const last = c.lastMessageAt?.getTime() ?? 0
        if (!last) return false
        const seenAt = seen.value[c.id] ?? 0
        return last > seenAt
      })
      .map(c => c.id)
  })

  const unreadCount = computed(() => unreadIds.value.length)

  return { unreadIds, unreadCount }
}

/**
 * Conteggio messaggi non letti PER chat (per il badge sulle card conversazione).
 * Il tracciamento è solo "ultimo visto" (timestamp): il numero esatto si ottiene
 * con una count-query aggregata (getCountFromServer, niente lettura dei doc) sui
 * messaggi con createdAt > ultimo-visto. Una query solo per le chat non lette;
 * ricalcola quando cambiano le chat (nuovo messaggio) o `seen` (apertura chat).
 */
export function useUnreadCounts(chats: Ref<Chat[]>) {
  const counts = ref<Record<string, number>>({})
  watch(
    [chats, seen],
    async () => {
      const next: Record<string, number> = {}
      await Promise.all(chats.value.map(async (c) => {
        const last = c.lastMessageAt?.getTime() ?? 0
        const seenAt = seen.value[c.id] ?? 0
        if (!last || last <= seenAt) return            // letta → nessun badge
        try {
          const qy = query(
            collection(db, 'chats', c.id, 'messages'),
            where('createdAt', '>', Timestamp.fromMillis(seenAt)),
          )
          const n = (await getCountFromServer(qy)).data().count
          if (n > 0) next[c.id] = n
        } catch { /* permessi/offline: salta questa chat */ }
      }))
      counts.value = next
    },
    { immediate: true },
  )
  return { counts }
}
