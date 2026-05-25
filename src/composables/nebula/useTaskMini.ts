import { ref, onUnmounted, watch, type Ref } from 'vue'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useTaskMini — subscribe reattivo a un singolo task CEPHEID per render chip
 * mention dentro un doc NEBULA-DOCS.
 *
 * I task CEPHEID stanno in 2 location possibili (vedi useAllTasks.ts):
 *   - `tasks/{taskId}` (standalone, projectId = '')
 *   - `projects/{projectId}/tasks/{taskId}` (sub-collection di progetto)
 *
 * Il mention storage in ProseMirror salva `{ taskId, projectId }` per
 * permettere lookup diretto senza collectionGroup query (latenza più bassa).
 *
 * Stato esposto:
 *   - data: { id, title, status, projectId } | null (null se eliminato/no-access)
 *   - loading: true finché prima snapshot non arriva
 *   - notFound: true se snapshot esiste ma doc non c'è (task eliminato)
 *
 * Usato da TaskMentionNode.vue per chip live (titolo + status sincronizzati).
 */

export interface TaskMini {
  id: string
  title: string
  status: string             // 'todo' | 'done' (binary in CEPHEID)
  projectId: string
}

export function useTaskMini(taskId: Ref<string | null> | string, projectId: Ref<string | null> | string | null = null) {
  const data = ref<TaskMini | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  let unsubscribe: Unsubscribe | null = null

  const taskIdRef = typeof taskId === 'string' ? ref(taskId) : taskId
  const projectIdRef = typeof projectId === 'string' || projectId === null ? ref(projectId as string | null) : projectId

  function subscribe(tid: string | null, pid: string | null) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    data.value = null
    notFound.value = false

    if (!tid) {
      loading.value = false
      return
    }

    loading.value = true
    const ref0 = pid
      ? doc(db, 'projects', pid, 'tasks', tid)
      : doc(db, 'tasks', tid)

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
        data.value = {
          id: snap.id,
          title: (d.title as string) ?? '(senza titolo)',
          status: (d.status as string) ?? 'todo',
          projectId: pid ?? '',
        }
        notFound.value = false
        loading.value = false
      },
      (err) => {
        console.error('[useTaskMini]', err)
        data.value = null
        notFound.value = true
        loading.value = false
      }
    )
  }

  watch(
    [taskIdRef, projectIdRef],
    ([tid, pid]) => subscribe(tid, pid),
    { immediate: true }
  )

  onUnmounted(() => { if (unsubscribe) unsubscribe() })

  return { data, loading, notFound }
}
