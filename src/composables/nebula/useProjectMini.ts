import { ref, onUnmounted, watch, type Ref } from 'vue'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useProjectMini — subscribe reattivo a un singolo progetto CEPHEID per
 * render chip mention dentro un doc NEBULA-DOCS.
 *
 * Schema: `projects/{projectId}` (top-level, vedi useProjects.ts).
 *
 * Stati esposti:
 *   - data: { id, name, color, taskCount, doneCount, completed, archived } | null
 *   - loading: true finché prima snapshot non arriva
 *   - notFound: true se snapshot esiste ma doc non c'è (progetto eliminato)
 *
 * Usato da ProjectMentionNode.vue per chip live (nome + count + status).
 */

export interface ProjectMini {
  id: string
  name: string
  color: string
  taskCount: number
  doneCount: number
  completed: boolean
  archived: boolean
}

export function useProjectMini(projectId: Ref<string | null> | string) {
  const data = ref<ProjectMini | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  let unsubscribe: Unsubscribe | null = null

  const idRef = typeof projectId === 'string' ? ref(projectId) : projectId

  function subscribe(pid: string | null) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    data.value = null
    notFound.value = false

    if (!pid) {
      loading.value = false
      return
    }

    loading.value = true
    const ref0 = doc(db, 'projects', pid)

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
          name: (d.name as string) ?? '(senza nome)',
          color: (d.color as string) ?? '#D4A020',
          taskCount: typeof d.taskCount === 'number' ? d.taskCount : 0,
          doneCount: typeof d.doneCount === 'number' ? d.doneCount : 0,
          completed: Boolean(d.completed),
          archived: Boolean(d.archived),
        }
        notFound.value = false
        loading.value = false
      },
      (err) => {
        console.error('[useProjectMini]', err)
        data.value = null
        notFound.value = true
        loading.value = false
      }
    )
  }

  watch(idRef, (pid) => subscribe(pid), { immediate: true })

  onUnmounted(() => { if (unsubscribe) unsubscribe() })

  return { data, loading, notFound }
}
