import { ref, computed, onUnmounted } from 'vue'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface Project {
  id: string
  name: string
  description: string
  color: string
  states: { id: string; label: string; color: string; order: number }[]
  dueDate: Date | null
  taskCount: number
  doneCount: number
  createdBy: string
  createdAt: Date
  archived: boolean
}

export const DEFAULT_STATES = [
  { id: 'todo',   label: 'Da fare',        color: '#B4B0AA', order: 0 },
  { id: 'wip',    label: 'In lavorazione', color: '#2F6B4A', order: 1 },
  { id: 'review', label: 'In revisione',   color: '#C8821A', order: 2 },
  { id: 'done',   label: 'Completato',     color: '#4A6B8A', order: 3 },
]

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useProjects() {
  const projects = ref<Project[]>([])
  const loading  = ref(true)

  const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'))

  const unsubscribe = onSnapshot(q, (snap) => {
    projects.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        id:          d.id,
        name:        data.name        ?? '',
        description: data.description ?? '',
        color:       data.color       ?? '#2F6B4A',
        states:      data.states      ?? DEFAULT_STATES,
        dueDate:     toDate(data.dueDate),
        taskCount:   data.taskCount   ?? 0,
        doneCount:   data.doneCount   ?? 0,
        createdBy:   data.createdBy   ?? '',
        createdAt:   toDate(data.createdAt) ?? new Date(),
        archived:    data.archived    ?? false,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useProjects]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function createProject(data: {
    name: string
    description: string
    color: string
    dueDate: Date | null
  }) {
    await addDoc(collection(db, 'projects'), {
      name:        data.name,
      description: data.description,
      color:       data.color,
      dueDate:     data.dueDate ?? null,
      states:      DEFAULT_STATES,
      members:     [],
      notes:       '',
      taskCount:   0,
      doneCount:   0,
      archived:    false,
      createdBy:   auth.currentUser?.uid ?? '',
      createdAt:   serverTimestamp(),
    })
  }

  const activeProjects = computed(() =>
    projects.value.filter(p => !p.archived)
  )

  return { projects, activeProjects, loading, createProject }
}
