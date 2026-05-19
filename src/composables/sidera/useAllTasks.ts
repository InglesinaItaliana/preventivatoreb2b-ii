import { ref, onUnmounted } from 'vue'
import {
  collectionGroup, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, collection, serverTimestamp, increment,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export type TaskType = 'task' | 'milestone' | 'deliverable'

export interface Task {
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

export function useAllTasks() {
  const tasks   = ref<Task[]>([])
  const loading = ref(true)

  const q = query(collectionGroup(db, 'tasks'), orderBy('createdAt', 'desc'))

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
        projectId:          data.projectId ?? '',
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
    console.error('[useAllTasks] — se vedi un errore di index, clicca il link in console per crearlo:', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  function isRealTask(taskId: string): boolean {
    const t = tasks.value.find(x => x.id === taskId)
    return !t || t.type === 'task'
  }

  async function completeTask(projectId: string | null, taskId: string) {
    const payload = { status: 'done', completedAt: serverTimestamp(), completedBy: auth.currentUser?.email ?? null }
    if (projectId) {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), payload)
      if (isRealTask(taskId)) {
        await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(1) })
      }
    } else {
      await updateDoc(doc(db, 'tasks', taskId), payload)
    }
  }

  async function uncompleteTask(projectId: string | null, taskId: string) {
    const payload = { status: 'todo', completedAt: null }
    if (projectId) {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), payload)
      if (isRealTask(taskId)) {
        await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(-1) })
      }
    } else {
      await updateDoc(doc(db, 'tasks', taskId), payload)
    }
  }

  async function createTask(data: {
    title: string
    projectId: string | null
    priority: 'alta' | 'media' | 'bassa'
    dueDate: Date | null
    assignees: string[]
    type?: TaskType
    deliverableTaskIds?: string[]
  }): Promise<string> {
    const type = data.type ?? 'task'
    const payload = {
      title:              data.title,
      status:             'todo',
      priority:           data.priority,
      dueDate:            data.dueDate ?? null,
      description:        '',
      assignees:          data.assignees,
      projectId:          data.projectId ?? null,
      type,
      deliverableTaskIds: data.deliverableTaskIds ?? [],
      createdBy:          auth.currentUser?.uid ?? '',
      createdByEmail:     auth.currentUser?.email ?? '',
      createdAt:          serverTimestamp(),
      completedAt:        null,
      completedBy:        null,
    }
    if (data.projectId) {
      const ref = await addDoc(collection(db, 'projects', data.projectId, 'tasks'), payload)
      // Solo task "veri" contribuiscono al taskCount del progetto (milestone/deliverable contati a parte)
      if (type === 'task') {
        await updateDoc(doc(db, 'projects', data.projectId), { taskCount: increment(1) })
      }
      return ref.id
    } else {
      const ref = await addDoc(collection(db, 'tasks'), payload)
      return ref.id
    }
  }

  async function updateTask(
    projectId: string | null,
    taskId: string,
    data: Partial<{ title: string; priority: 'alta' | 'media' | 'bassa'; dueDate: Date | null; assignees: string[]; deliverableTaskIds: string[] }>,
  ) {
    if (projectId) {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), data)
    } else {
      await updateDoc(doc(db, 'tasks', taskId), data)
    }
  }

  async function deleteTask(projectId: string | null, taskId: string, wasCompleted: boolean) {
    const realTask = isRealTask(taskId)
    if (projectId) {
      await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskId))
      if (realTask) {
        const counts: Record<string, unknown> = { taskCount: increment(-1) }
        if (wasCompleted) counts.doneCount = increment(-1)
        await updateDoc(doc(db, 'projects', projectId), counts)
      }
    } else {
      await deleteDoc(doc(db, 'tasks', taskId))
    }
  }

  return { tasks, loading, completeTask, uncompleteTask, createTask, updateTask, deleteTask }
}

export async function createStandaloneTask(data: {
  title: string
  projectId: string | null
  priority: 'alta' | 'media' | 'bassa'
  dueDate: Date | null
  assignees: string[]
  type?: TaskType
  deliverableTaskIds?: string[]
}): Promise<string> {
  const type = data.type ?? 'task'
  const payload = {
    title:              data.title,
    status:             'todo',
    priority:           data.priority,
    dueDate:            data.dueDate ?? null,
    description:        '',
    assignees:          data.assignees,
    projectId:          data.projectId ?? null,
    type,
    deliverableTaskIds: data.deliverableTaskIds ?? [],
    createdBy:          auth.currentUser?.uid ?? '',
    createdByEmail:     auth.currentUser?.email ?? '',
    createdAt:          serverTimestamp(),
    completedAt:        null,
    completedBy:        null,
  }
  if (data.projectId) {
    const ref = await addDoc(collection(db, 'projects', data.projectId, 'tasks'), payload)
    if (type === 'task') {
      await updateDoc(doc(db, 'projects', data.projectId), { taskCount: increment(1) })
    }
    return ref.id
  } else {
    const ref = await addDoc(collection(db, 'tasks'), payload)
    return ref.id
  }
}
