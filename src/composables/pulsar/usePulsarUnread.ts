import { ref, computed, type Ref } from 'vue'
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
