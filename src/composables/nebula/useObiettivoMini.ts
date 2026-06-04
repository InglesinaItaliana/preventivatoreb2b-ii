import { ref, onUnmounted, watch, type Ref } from 'vue'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useObiettivoMini — subscribe reattivo a un singolo obiettivo CEPHEID per
 * render chip mention dentro un doc NEBULA-DOCS.
 *
 * Schema: `obiettivi/{obiettivoId}` (top-level, vedi useObiettivi.ts).
 *
 * Stati esposti:
 *   - data: { id, titolo, colore, stato } | null
 *   - loading: true finché prima snapshot non arriva
 *   - notFound: true se snapshot esiste ma doc non c'è (obiettivo eliminato)
 *
 * Usato da ObiettivoMentionNode.vue per chip live (titolo + colore + stato).
 */

export interface ObiettivoMini {
  id: string
  titolo: string
  colore: string
  stato: 'attivo' | 'raggiunto' | 'archiviato'
}

export function useObiettivoMini(obiettivoId: Ref<string | null> | string) {
  const data = ref<ObiettivoMini | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  let unsubscribe: Unsubscribe | null = null

  const idRef = typeof obiettivoId === 'string' ? ref(obiettivoId) : obiettivoId

  function subscribe(oid: string | null) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    data.value = null
    notFound.value = false

    if (!oid) {
      loading.value = false
      return
    }

    loading.value = true
    const ref0 = doc(db, 'obiettivi', oid)

    unsubscribe = onSnapshot(
      ref0,
      (snap) => {
        if (!snap.exists()) {
          data.value = null
          notFound.value = true
          loading.value = false
          return
        }
        const d = snap.data() as Record<string, unknown>
        const stato = d.stato as ObiettivoMini['stato']
        data.value = {
          id: snap.id,
          titolo: (d.titolo as string) ?? '(senza titolo)',
          colore: (d.colore as string) ?? '#D4A020',
          stato: stato === 'raggiunto' || stato === 'archiviato' ? stato : 'attivo',
        }
        notFound.value = false
        loading.value = false
      },
      (err) => {
        console.error('[useObiettivoMini]', err)
        data.value = null
        notFound.value = true
        loading.value = false
      }
    )
  }

  watch(idRef, (oid) => subscribe(oid), { immediate: true })

  onUnmounted(() => { if (unsubscribe) unsubscribe() })

  return { data, loading, notFound }
}
