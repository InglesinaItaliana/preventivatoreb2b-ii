import { ref, onUnmounted } from 'vue'
import {
  collectionGroup, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, collection, serverTimestamp, increment, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

// 'appointment' = evento del calendario (EPHEMERIS): una task con orario preciso
// (startAt/endAt) e durata. Escluso da Smistamento/Azioni (filtrano type==='task').
export type TaskType = 'task' | 'milestone' | 'deliverable' | 'appointment'

/** Collegamento di un appuntamento a un'entità della suite (come il `@` nei doc).
 *  `link` è il deep-link già risolto al modulo d'origine. */
export interface AppointmentLink { kind: 'task' | 'project' | 'doc'; id: string; label: string; link: string }

export interface Task {
  id: string
  title: string
  status: string
  priority: 'alta' | 'media' | 'bassa'
  assignees: string[]
  dueDate: Date | null
  /** Calendario (type==='appointment'): inizio/fine con orario. null per le altre. */
  startAt: Date | null
  endAt: Date | null
  /** Solo appuntamenti: luogo + note libere. '' per le altre task. */
  location: string
  notes: string
  /** Solo appuntamenti: collegamenti a task/progetti/doc. */
  links: AppointmentLink[]
  projectId: string
  type: TaskType
  deliverableTaskIds: string[]
  triaged: boolean
  milestoneId: string | null
  createdBy: string
  createdByEmail: string
  createdAt: Date
  completedAt: Date | null
  completedBy: string | null
  /** Origine PULSAR: chat/messaggio da cui l'azione è stata creata (back-link). */
  sourceChatId: string | null
  sourceMessageId: string | null
  /** Origine bug tracker CORE (promozione bug → task). */
  sourceBugId: string | null
  sourceBugNumber: string | null
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
        startAt:            toDate(data.startAt),
        endAt:              toDate(data.endAt),
        location:           data.location ?? '',
        notes:              data.notes ?? '',
        links:              Array.isArray(data.links) ? data.links : [],
        // projectId dal PATH reale (parent del doc), non dal campo (che può mancare/essere errato):
        // projects/{pid}/tasks/{tid} -> pid ; tasks/{tid} (sciolto) -> ''
        projectId:          d.ref.parent.parent?.id ?? '',
        type:               (data.type as TaskType) ?? 'task',
        deliverableTaskIds: Array.isArray(data.deliverableTaskIds) ? data.deliverableTaskIds : [],
        // campo mancante (task storici): da smistare se NON ha assegnatari, altrimenti già gestito
        triaged:            typeof data.triaged === 'boolean' ? data.triaged : ((data.assignees ?? (data.assignee ? [data.assignee] : [])).length > 0),
        milestoneId:        data.milestoneId ?? null,
        createdBy:          data.createdBy ?? '',
        createdByEmail:     data.createdByEmail ?? '',
        createdAt:          toDate(data.createdAt) ?? new Date(),
        completedAt:        toDate(data.completedAt),
        completedBy:        data.completedBy ?? null,
        sourceChatId:       data.sourceChatId ?? null,
        sourceMessageId:    data.sourceMessageId ?? null,
        sourceBugId:        data.sourceBugId ?? null,
        sourceBugNumber:    data.sourceBugNumber ?? null,
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
    const payload = { status: 'todo', completedAt: null, updatedByEmail: auth.currentUser?.email ?? null }
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
      triaged:            type !== 'task',   // i task nascono da smistare; milestone/deliverable no
      milestoneId:        null,
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
    data: Partial<{ title: string; priority: 'alta' | 'media' | 'bassa'; dueDate: Date | null; assignees: string[]; deliverableTaskIds: string[]; triaged: boolean; milestoneId: string | null }>,
  ) {
    // updatedByEmail: attribuisce l'autore della modifica al registro attività QUASAR
    const payload = { ...data, updatedByEmail: auth.currentUser?.email ?? null }
    if (projectId) {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), payload)
    } else {
      await updateDoc(doc(db, 'tasks', taskId), payload)
    }
  }

  // Smista un task SCIOLTO (tasks/) dentro un progetto (+ deliverable opzionale).
  // Crea il doc nella subcollection del progetto e cancella lo standalone.
  async function fileStandaloneTask(
    task: Task,
    projectId: string,
    deliverableId: string | null,
    milestoneId: string | null,
    patch: { assignees: string[]; priority: 'alta' | 'media' | 'bassa' },
  ) {
    const ref = await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      title: task.title, status: task.status === 'done' ? 'done' : 'todo',
      priority: patch.priority, startDate: null, dueDate: task.dueDate ?? null,
      description: '', assignees: patch.assignees, projectId, type: 'task',
      deliverableTaskIds: [], order: null, approved: false, approvedAt: null,
      deliverableId: null, milestoneId: deliverableId ? null : (milestoneId ?? null), triaged: true,
      createdBy: task.createdBy || (auth.currentUser?.uid ?? ''),
      createdByEmail: task.createdByEmail || (auth.currentUser?.email ?? ''),
      createdAt: serverTimestamp(), completedAt: task.completedAt ?? null, completedBy: task.completedBy ?? null,
    })
    await updateDoc(doc(db, 'projects', projectId), { taskCount: increment(1) })
    if (deliverableId) await updateDoc(doc(db, 'projects', projectId, 'tasks', deliverableId), { deliverableTaskIds: arrayUnion(ref.id) })
    await deleteDoc(doc(db, 'tasks', task.id))
    return ref.id
  }

  // Aggancia un task GIÀ in un progetto a un deliverable (se non già presente altrove).
  async function attachToDeliverable(projectId: string, deliverableId: string, taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', deliverableId), { deliverableTaskIds: arrayUnion(taskId) })
  }

  // Stacca un task dal deliverableTaskIds di un deliverable (per evitare doppie referenze
  // quando si ri-smista una task verso un deliverable diverso).
  async function detachFromDeliverable(projectId: string, deliverableId: string, taskId: string) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', deliverableId), { deliverableTaskIds: arrayRemove(taskId) })
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

  return { tasks, loading, completeTask, uncompleteTask, createTask, updateTask, deleteTask, fileStandaloneTask, attachToDeliverable, detachFromDeliverable }
}

export async function createStandaloneTask(data: {
  title: string
  projectId: string | null
  priority: 'alta' | 'media' | 'bassa'
  dueDate: Date | null
  assignees: string[]
  type?: TaskType
  deliverableTaskIds?: string[]
  /** Se valorizzato, scrive esplicitamente lo stato di smistamento. Omesso: il
   *  reader lo inferisce (triaged = ha assegnatari) — comportamento storico PULSAR. */
  triaged?: boolean
  /** Origine PULSAR: chat/messaggio da cui nasce l'azione (back-link). */
  source?: { chatId: string; messageId: string }
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
    // triaged scritto solo se esplicito; altrimenti il reader inferisce (no override del flusso PULSAR)
    ...(data.triaged !== undefined ? { triaged: data.triaged } : {}),
    createdBy:          auth.currentUser?.uid ?? '',
    createdByEmail:     auth.currentUser?.email ?? '',
    createdAt:          serverTimestamp(),
    completedAt:        null,
    completedBy:        null,
    sourceChatId:       data.source?.chatId ?? null,
    sourceMessageId:    data.source?.messageId ?? null,
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
