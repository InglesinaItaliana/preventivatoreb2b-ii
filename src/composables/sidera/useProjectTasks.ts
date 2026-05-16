import { ref, onUnmounted } from 'vue'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, increment,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface ProjectTask {
  id: string
  title: string
  status: string
  priority: 'alta' | 'media' | 'bassa'
  assignee: string | null
  dueDate: Date | null
  projectId: string
  createdBy: string
  createdByEmail: string
  createdAt: Date
  completedAt: Date | null
  completedBy: string | null
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useProjectTasks(projectId: string) {
  const tasks   = ref<ProjectTask[]>([])
  const loading = ref(true)

  const q = query(
    collection(db, 'projects', projectId, 'tasks'),
    orderBy('createdAt', 'asc'),
  )

  const unsubscribe = onSnapshot(q, (snap) => {
    tasks.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        id:             d.id,
        title:          data.title    ?? '',
        status:         data.status   ?? 'todo',
        priority:       data.priority ?? 'media',
        assignee:       data.assignee ?? null,
        dueDate:        toDate(data.dueDate),
        projectId:      data.projectId ?? projectId,
        createdBy:      data.createdBy ?? '',
        createdByEmail: data.createdByEmail ?? '',
        createdAt:      toDate(data.createdAt) ?? new Date(),
        completedAt:    toDate(data.completedAt),
        completedBy:    data.completedBy ?? null,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useProjectTasks]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function createTask(data: {
    title: string
    status: string
    priority: 'alta' | 'media' | 'bassa'
    dueDate: Date | null
    assignee?: string | null
  }) {
    await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      title:          data.title,
      status:         data.status,
      priority:       data.priority,
      dueDate:        data.dueDate ?? null,
      description:    '',
      assignee:       data.assignee ?? null,
      projectId,
      createdBy:      auth.currentUser?.uid ?? '',
      createdByEmail: auth.currentUser?.email ?? '',
      createdAt:      serverTimestamp(),
      completedAt:    null,
      completedBy:    null,
    })
    await updateDoc(doc(db, 'projects', projectId), { taskCount: increment(1) })
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), { status })
  }

  async function completeTask(taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      status:      'done',
      completedAt: serverTimestamp(),
      completedBy: auth.currentUser?.email ?? null,
    })
    await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(1) })
  }

  async function uncompleteTask(taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      status:      'todo',
      completedAt: null,
    })
    await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(-1) })
  }

  return { tasks, loading, createTask, updateTaskStatus, completeTask, uncompleteTask }
}
