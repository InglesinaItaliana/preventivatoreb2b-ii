import { onMounted, onBeforeUnmount } from 'vue'
import { doc, updateDoc, deleteField, serverTimestamp, FieldPath } from 'firebase/firestore'
import { db, auth } from '../../firebase'

// Presence "chat aperta": mentre l'utente sta guardando una chat, scriviamo
// chats/{chatId}.activeViewers[email] = serverTimestamp(). La Cloud Function
// onNewPulsarMessage salta i destinatari con presence fresca, così NON arriva
// la push per una chat che si ha già aperta e in primo piano.
//
// Nota: l'email contiene punti → uso FieldPath(['activeViewers', email]) invece
// della notazione puntata, altrimenti Firestore la spezzerebbe in sotto-campi.
//
// Heartbeat ogni HEARTBEAT_MS per mantenere il timestamp "fresco"; la funzione
// considera valida solo una presence recente, così un crash senza cleanup non
// silenzia le notifiche per sempre.
const HEARTBEAT_MS = 45_000

export function usePulsarPresence(chatId: string) {
  const email = auth.currentUser?.email?.toLowerCase().trim() ?? ''
  if (!email || !chatId) {
    return // niente da tracciare
  }

  const chatRef = doc(db, 'chats', chatId)
  const field = new FieldPath('activeViewers', email)
  let timer: ReturnType<typeof setInterval> | null = null

  function markPresent() {
    updateDoc(chatRef, field, serverTimestamp()).catch(() => {})
  }

  function clearPresence() {
    updateDoc(chatRef, field, deleteField()).catch(() => {})
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') markPresent()
    else clearPresence()
  }

  onMounted(() => {
    markPresent()
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') markPresent()
    }, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', onVisibility)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    clearPresence()
  })
}
