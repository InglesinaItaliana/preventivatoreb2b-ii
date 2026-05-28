import { ref, onUnmounted } from 'vue'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { markChatRead } from './usePulsarUnread'

export interface Chat {
  id: string
  name: string
  isGroup: boolean
  members: string[]
  createdBy: string
  lastMessage: string
  lastMessageAt: Date | null
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useChats() {
  const chats   = ref<Chat[]>([])
  const loading = ref(true)

  const email = auth.currentUser?.email ?? ''

  if (!email) {
    loading.value = false
    return {
      chats,
      loading,
      createChat: async (_n: string, _m: string[], _g: boolean) => '',
      deleteChat: async (_id: string) => {},
    }
  }

  const q = query(
    collection(db, 'chats'),
    where('members', 'array-contains', email),
    orderBy('lastMessageAt', 'desc'),
  )

  const unsubscribe = onSnapshot(q, (snap) => {
    chats.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        id:            d.id,
        name:          data.name          ?? '',
        isGroup:       data.isGroup       ?? false,
        members:       data.members       ?? [],
        createdBy:     data.createdBy     ?? '',
        lastMessage:   data.lastMessage   ?? '',
        lastMessageAt: toDate(data.lastMessageAt),
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useChats]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function createChat(name: string, members: string[], isGroup: boolean): Promise<string> {
    const allMembers = members.includes(email) ? members : [...members, email]
    const ref = await addDoc(collection(db, 'chats'), {
      name,
      isGroup,
      members:       allMembers,
      createdBy:     email,
      lastMessage:   '',
      lastMessageAt: serverTimestamp(),
      createdAt:     serverTimestamp(),
    })
    // Marca la chat come già letta DAL CREATORE: senza questo, useUnreadChats
    // confronta lastMessageAt (now, dal server) con seen[chatId] (0) e
    // segnala la chat come non-letta → l'utente vede "1 chat con messaggi
    // non letti" appena finisce di crearla. Usa un seenAt 60s nel futuro
    // per assorbire eventuale clock skew client/server.
    markChatRead(ref.id, new Date(Date.now() + 60_000))
    return ref.id
  }

  async function deleteChat(chatId: string) {
    await deleteDoc(doc(db, 'chats', chatId))
  }

  return { chats, loading, createChat, deleteChat }
}
