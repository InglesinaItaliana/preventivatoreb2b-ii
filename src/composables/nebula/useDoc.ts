import { ref, onUnmounted, watch } from 'vue'
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useDoc — subscribe reattivo a `nebulaDocs/{docId}`.
 *
 * Pattern identico agli altri composables (useTask, useProject):
 * onSnapshot in mount + auto-unsubscribe in unmount. Cambia il docId
 * passato (anche null per "nessuna sottoscrizione") via param reactive.
 *
 * Vedi docs/NEBULA-DOCS.md §3.1 per lo schema.
 */

export interface NebulaDocIcon {
  set: 'material'
  name: string
  color: string
  fill: 0 | 1
}

export interface NebulaDocAcl {
  visibility: 'private' | 'team' | 'public'
  readers: string[]
  writers: string[]
  owners: string[]
}

export interface NebulaDocRefs {
  tasks: string[]
  projects: string[]
  deliverables: string[]
  docs: string[]
  users: string[]
}

export interface NebulaDocData {
  title: string
  icon: NebulaDocIcon | null
  content: object              // ProseMirror JSON
  contentText: string
  parentId: string | null
  order: number
  depth: number
  refs: NebulaDocRefs
  archived: boolean
  archivedAt: Timestamp | null
  revision: number
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
  acl: NebulaDocAcl
}

export type NebulaDoc = NebulaDocData & { id: string }

export function useDoc(docId: string | null) {
  const data = ref<NebulaDoc | null>(null)
  const loading = ref(true)
  const error = ref<Error | null>(null)
  let unsubscribe: (() => void) | null = null

  function subscribe(id: string | null) {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    data.value = null
    error.value = null

    if (!id) {
      loading.value = false
      return
    }

    loading.value = true
    const ref0 = doc(db, 'nebulaDocs', id)
    unsubscribe = onSnapshot(
      ref0,
      (snap) => {
        if (snap.exists()) {
          data.value = { id: snap.id, ...(snap.data() as NebulaDocData) }
        } else {
          data.value = null
        }
        loading.value = false
      },
      (err) => {
        console.error('[useDoc] snapshot error:', err)
        error.value = err
        loading.value = false
      }
    )
  }

  subscribe(docId)

  onUnmounted(() => {
    if (unsubscribe) unsubscribe()
  })

  return { data, loading, error, resubscribe: subscribe }
}

/**
 * Helper opzionale per riferimento esterno (es. ridirezione post-create
 * o aggiornamento di un altro componente). Watch su `data` lato consumer.
 */
export function watchDoc(docId: string | null) {
  const ctx = useDoc(docId)
  watch(() => ctx.data.value?.revision, () => { /* hook esteso futuro */ })
  return ctx
}
