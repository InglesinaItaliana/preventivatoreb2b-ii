import { ref, onUnmounted } from 'vue'
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc,
  doc, setDoc, getDoc, serverTimestamp, increment,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface Message {
  id: string
  text: string
  from: string
  createdAt: Date
  flags: string[]
  hashtags: string[]
  mentions: string[]
  taskId: string | null
  /** Quando il destinatario ha risposto a un msg flaggato 'question'. */
  answeredAt: Date | null
  /** Quando il destinatario ha rifiutato un msg flaggato 'task' senza crearlo. */
  rejectedAt: Date | null
  replyToId: string | null
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useMessages(chatId: string) {
  const messages = ref<Message[]>([])
  const loading  = ref(true)

  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  )

  const unsubscribe = onSnapshot(q, (snap) => {
    messages.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        id:        d.id,
        text:      data.text     ?? '',
        from:      data.from     ?? '',
        createdAt: toDate(data.createdAt) ?? new Date(),
        flags:      data.flags      ?? [],
        hashtags:   data.hashtags   ?? [],
        mentions:   data.mentions   ?? [],
        taskId:     data.taskId     ?? null,
        answeredAt: toDate(data.answeredAt),
        rejectedAt: toDate(data.rejectedAt),
        replyToId:  data.replyToId  ?? null,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useMessages]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function sendMessage(data: {
    text: string
    flags: string[]
    hashtags: string[]
    mentions: string[]
    replyToId?: string | null
  }) {
    const from = auth.currentUser?.email ?? ''
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text:       data.text,
      from,
      createdAt:  serverTimestamp(),
      flags:      data.flags,
      hashtags:   data.hashtags,
      mentions:   data.mentions,
      taskId:     null,
      answeredAt: null,
      rejectedAt: null,
      replyToId:  data.replyToId ?? null,
    })

    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage:   data.text.slice(0, 120),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: from,
    })

    for (const tag of data.hashtags) {
      const tagRef  = doc(db, 'chatHashtags', tag)
      const tagSnap = await getDoc(tagRef)
      if (tagSnap.exists()) {
        await updateDoc(tagRef, { count: increment(1), lastUsedAt: serverTimestamp() })
      } else {
        await setDoc(tagRef, { name: tag, count: 1, lastUsedAt: serverTimestamp() })
      }
    }
  }

  async function linkTask(messageId: string, taskId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { taskId })
  }

  async function markAnswered(messageId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { answeredAt: serverTimestamp() })
  }

  /** Segna un task proposto come "rifiutato" senza crearlo. */
  async function rejectTask(messageId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { rejectedAt: serverTimestamp() })
  }

  return { messages, loading, sendMessage, linkTask, markAnswered, rejectTask }
}
