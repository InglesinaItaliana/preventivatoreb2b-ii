import { ref, onUnmounted, watch, type Ref } from 'vue'
import {
  collection, query, orderBy, onSnapshot, type Unsubscribe, type Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useDocHistory — subscribe reattivo a `nebulaDocs/{docId}/history`.
 *
 * Snapshot scritti da saveDoc callable:
 *   - SEMPRE su create (revision 1)
 *   - SU trigger='manual'|'mcp' (NO su autosave — riduce bloat)
 *
 * Vedi docs/NEBULA-DOCS.md §3.4 per schema sub-collection, §10 per scrittura.
 *
 * historyPrune Cloud Function (F3-C4) manterrà ultimi N snapshot + 1/giorno
 * per 30gg.
 */

export interface HistorySnapshot {
  id: string                  // doc id Firestore (auto-generated)
  revision: number
  title: string
  content: object             // ProseMirror JSON
  savedAt: Timestamp | null
  savedBy: string             // email
  trigger: 'autosave' | 'manual' | 'mcp' | 'restore' | string
}

export function useDocHistory(docId: Ref<string | null>) {
  const snapshots = ref<HistorySnapshot[]>([])
  const loading = ref(true)
  const error = ref<Error | null>(null)
  let unsubscribe: Unsubscribe | null = null

  function subscribe(id: string | null) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    snapshots.value = []
    error.value = null

    if (!id) {
      loading.value = false
      return
    }

    loading.value = true
    const q = query(
      collection(db, 'nebulaDocs', id, 'history'),
      orderBy('revision', 'desc'),
    )

    unsubscribe = onSnapshot(
      q,
      (snap) => {
        snapshots.value = snap.docs.map(d => {
          const data = d.data() as Partial<HistorySnapshot>
          return {
            id: d.id,
            revision: data.revision ?? 0,
            title: data.title ?? '(senza titolo)',
            content: (data.content as object) ?? { type: 'doc', content: [] },
            savedAt: (data.savedAt as Timestamp) ?? null,
            savedBy: data.savedBy ?? '',
            trigger: data.trigger ?? 'manual',
          }
        })
        loading.value = false
      },
      (err) => {
        if (err?.code !== 'permission-denied') {
          console.warn('[useDocHistory] query error:', err?.code, err?.message)
        }
        error.value = err
        snapshots.value = []
        loading.value = false
      }
    )
  }

  watch(docId, (id) => subscribe(id), { immediate: true })
  onUnmounted(() => { if (unsubscribe) unsubscribe() })

  return { snapshots, loading, error }
}
