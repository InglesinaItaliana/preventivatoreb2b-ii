import { ref, onUnmounted } from 'vue'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export type TaskType = 'task' | 'milestone' | 'deliverable'

export interface ProjectTask {
  id: string
  title: string
  status: string
  priority: 'alta' | 'media' | 'bassa'
  assignees: string[]
  dueDate: Date | null
  projectId: string
  type: TaskType
  deliverableTaskIds: string[]
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
        id:                 d.id,
        title:              data.title    ?? '',
        status:             data.status   ?? 'todo',
        priority:           data.priority ?? 'media',
        assignees:          data.assignees ?? (data.assignee ? [data.assignee] : []),
        dueDate:            toDate(data.dueDate),
        projectId:          data.projectId ?? projectId,
        type:               (data.type as TaskType) ?? 'task',
        deliverableTaskIds: Array.isArray(data.deliverableTaskIds) ? data.deliverableTaskIds : [],
        createdBy:          data.createdBy ?? '',
        createdByEmail:     data.createdByEmail ?? '',
        createdAt:          toDate(data.createdAt) ?? new Date(),
        completedAt:        toDate(data.completedAt),
        completedBy:        data.completedBy ?? null,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useProjectTasks]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  function isRealTask(taskId: string): boolean {
    const t = tasks.value.find(x => x.id === taskId)
    return !t || t.type === 'task'
  }

  async function createTask(data: {
    title: string
    status: string
    priority: 'alta' | 'media' | 'bassa'
    dueDate: Date | null
    assignees?: string[]
    type?: TaskType
    deliverableTaskIds?: string[]
  }) {
    const type = data.type ?? 'task'
    await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      title:              data.title,
      status:             data.status,
      priority:           data.priority,
      dueDate:            data.dueDate ?? null,
      description:        '',
      assignees:          data.assignees ?? [],
      projectId,
      type,
      deliverableTaskIds: data.deliverableTaskIds ?? [],
      createdBy:          auth.currentUser?.uid ?? '',
      createdByEmail:     auth.currentUser?.email ?? '',
      createdAt:          serverTimestamp(),
      completedAt:        null,
      completedBy:        null,
    })
    if (type === 'task') {
      await updateDoc(doc(db, 'projects', projectId), { taskCount: increment(1) })
    }
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
    if (isRealTask(taskId)) {
      await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(1) })
    }
  }

  async function uncompleteTask(taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      status:      'todo',
      completedAt: null,
    })
    if (isRealTask(taskId)) {
      await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(-1) })
    }
  }

  async function updateTask(
    taskId: string,
    data: Partial<{ title: string; priority: 'alta' | 'media' | 'bassa'; dueDate: Date | null; assignees: string[]; deliverableTaskIds: string[] }>,
  ) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), data)
  }

  async function deleteTask(taskId: string, wasCompleted: boolean) {
    const realTask = isRealTask(taskId)
    await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskId))
    if (realTask) {
      const counts: Record<string, unknown> = { taskCount: increment(-1) }
      if (wasCompleted) counts.doneCount = increment(-1)
      await updateDoc(doc(db, 'projects', projectId), counts)
    }
  }

  return { tasks, loading, createTask, updateTaskStatus, completeTask, uncompleteTask, updateTask, deleteTask }
}
