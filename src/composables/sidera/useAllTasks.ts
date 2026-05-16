import { ref, onUnmounted } from 'vue'
import {
  collectionGroup, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, collection, serverTimestamp, increment,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface Task {
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

export function useAllTasks() {
  const tasks   = ref<Task[]>([])
  const loading = ref(true)

  // Requires a Firestore collectionGroup index on tasks(createdAt DESC).
  // On first load Firestore will log a console link to create it automatically.
  const q = query(collectionGroup(db, 'tasks'), orderBy('createdAt', 'desc'))

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
        projectId:      data.projectId ?? '',
        createdBy:      data.createdBy ?? '',
        createdByEmail: data.createdByEmail ?? '',
        createdAt:      toDate(data.createdAt) ?? new Date(),
        completedAt:    toDate(data.completedAt),
        completedBy:    data.completedBy ?? null,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useAllTasks] — se vedi un errore di index, clicca il link in console per crearlo:', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function completeTask(projectId: string, taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      status:      'done',
      completedAt: serverTimestamp(),
      completedBy: auth.currentUser?.email ?? null,
    })
    await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(1) })
  }

  async function uncompleteTask(projectId: string, taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      status:      'todo',
      completedAt: null,
    })
    await updateDoc(doc(db, 'projects', projectId), { doneCount: increment(-1) })
  }

  async function createTask(data: {
    title: string
    projectId: string
    priority: 'alta' | 'media' | 'bassa'
    dueDate: Date | null
    assignee: string | null
  }) {
    await addDoc(collection(db, 'projects', data.projectId, 'tasks'), {
      title:          data.title,
      status:         'todo',
      priority:       data.priority,
      dueDate:        data.dueDate ?? null,
      description:    '',
      assignee:       data.assignee,
      projectId:      data.projectId,
      createdBy:      auth.currentUser?.uid ?? '',
      createdByEmail: auth.currentUser?.email ?? '',
      createdAt:      serverTimestamp(),
      completedAt:    null,
      completedBy:    null,
    })
    await updateDoc(doc(db, 'projects', data.projectId), { taskCount: increment(1) })
  }

  return { tasks, loading, completeTask, uncompleteTask, createTask }
}
