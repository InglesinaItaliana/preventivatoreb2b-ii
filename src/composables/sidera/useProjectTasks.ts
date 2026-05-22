import { ref, onUnmounted } from 'vue'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment, writeBatch,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export type TaskType = 'task' | 'milestone' | 'deliverable'

export interface ProjectTask {
  id: string
  title: string
  status: string
  priority: 'alta' | 'media' | 'bassa'
  assignees: string[]
  startDate: Date | null
  dueDate: Date | null
  projectId: string
  type: TaskType
  deliverableTaskIds: string[]
  order: number | null          // sequenza fase (solo deliverable)
  approved: boolean             // fase approvata (solo deliverable)
  approvedAt: Date | null
  deliverableId: string | null  // legacy (vecchio link milestone→deliverable, non più usato)
  milestoneId: string | null    // NUOVO link: deliverable → la sua milestone
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
        startDate:          toDate(data.startDate),
        dueDate:            toDate(data.dueDate),
        projectId:          data.projectId ?? projectId,
        type:               (data.type as TaskType) ?? 'task',
        deliverableTaskIds: Array.isArray(data.deliverableTaskIds) ? data.deliverableTaskIds : [],
        order:              typeof data.order === 'number' ? data.order : null,
        approved:           data.approved ?? false,
        approvedAt:         toDate(data.approvedAt),
        deliverableId:      data.deliverableId ?? null,
        milestoneId:        data.milestoneId ?? null,
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
    startDate?: Date | null
    assignees?: string[]
    type?: TaskType
    deliverableTaskIds?: string[]
    order?: number | null
    deliverableId?: string | null
    milestoneId?: string | null
    triaged?: boolean
  }): Promise<string> {
    const type = data.type ?? 'task'
    const ref = await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      title:              data.title,
      status:             data.status,
      priority:           data.priority,
      startDate:          data.startDate ?? null,
      dueDate:            data.dueDate ?? null,
      description:        '',
      assignees:          data.assignees ?? [],
      projectId,
      type,
      deliverableTaskIds: data.deliverableTaskIds ?? [],
      order:              data.order ?? null,
      approved:           false,
      approvedAt:         null,
      deliverableId:      data.deliverableId ?? null,
      milestoneId:        data.milestoneId ?? null,
      triaged:            data.triaged ?? (type !== 'task'),   // task nuovi → inbox, salvo override
      createdBy:          auth.currentUser?.uid ?? '',
      createdByEmail:     auth.currentUser?.email ?? '',
      createdAt:          serverTimestamp(),
      completedAt:        null,
      completedBy:        null,
    })
    if (type === 'task') {
      await updateDoc(doc(db, 'projects', projectId), { taskCount: increment(1) })
    }
    return ref.id
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
    data: Partial<{ title: string; priority: 'alta' | 'media' | 'bassa'; startDate: Date | null; dueDate: Date | null; assignees: string[]; deliverableTaskIds: string[]; order: number | null; deliverableId: string | null; milestoneId: string | null }>,
  ) {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), data)
  }

  // Approva una fase (deliverable): segna approved; se TUTTI i deliverable della
  // sua milestone risultano approvati, marca raggiunta (done) la milestone.
  // approvedAt/completedAt usano serverTimestamp -> solo qui, mai via updateTask.
  async function approvePhase(deliverableId: string) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'projects', projectId, 'tasks', deliverableId), {
      approved:   true,
      approvedAt: serverTimestamp(),
    })
    const deliv = tasks.value.find(t => t.id === deliverableId)
    const mid = deliv?.milestoneId ?? null
    if (mid) {
      const siblings = tasks.value.filter(t => t.type === 'deliverable' && t.milestoneId === mid)
      const allApproved = siblings.length > 0 && siblings.every(d => d.id === deliverableId ? true : d.approved)
      if (allApproved) {
        batch.update(doc(db, 'projects', projectId, 'tasks', mid), {
          status:      'done',
          completedAt: serverTimestamp(),
          completedBy: auth.currentUser?.email ?? null,
        })
      }
    }
    await batch.commit()
  }

  async function unapprovePhase(deliverableId: string) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'projects', projectId, 'tasks', deliverableId), {
      approved:   false,
      approvedAt: null,
    })
    const deliv = tasks.value.find(t => t.id === deliverableId)
    const mid = deliv?.milestoneId ?? null
    if (mid) {
      // riaprire un deliverable riapre necessariamente la milestone
      batch.update(doc(db, 'projects', projectId, 'tasks', mid), {
        status:      'todo',
        completedAt: null,
      })
    }
    await batch.commit()
  }

  // Crea in un colpo solo (writeBatch) una "fase": milestone (nuova o esistente) +
  // deliverable (con milestoneId) + N task nuove, collegando le task al deliverable.
  async function createPhaseBundle(payload: {
    milestone: { existingId: string } | { title: string; dueDate: Date | null }
    deliverable: { title: string; dueDate: Date | null; assignees?: string[] }
    newTaskTitles: string[]
    attachedTaskIds?: string[]
  }): Promise<void> {
    const col = collection(db, 'projects', projectId, 'tasks')
    const batch = writeBatch(db)
    const uid = auth.currentUser?.uid ?? ''
    const email = auth.currentUser?.email ?? ''
    const base = {
      startDate: null, description: '', order: null, approved: false, approvedAt: null,
      deliverableId: null, triaged: true, createdBy: uid, createdByEmail: email,
      createdAt: serverTimestamp(), completedAt: null, completedBy: null,
    }

    let milestoneId: string
    if ('existingId' in payload.milestone) {
      milestoneId = payload.milestone.existingId
    } else {
      milestoneId = doc(col).id
      batch.set(doc(col, milestoneId), {
        ...base, title: payload.milestone.title, status: 'todo', priority: 'media',
        dueDate: payload.milestone.dueDate ?? null, assignees: [], type: 'milestone',
        deliverableTaskIds: [], milestoneId: null,
      })
    }

    const newTaskIds = payload.newTaskTitles.map(() => doc(col).id)
    payload.newTaskTitles.forEach((title, i) => {
      batch.set(doc(col, newTaskIds[i]), {
        ...base, title, status: 'todo', priority: 'media', dueDate: null,
        assignees: [], type: 'task', deliverableTaskIds: [], milestoneId: null, triaged: false,
      })
    })

    const delivId = doc(col).id
    const allTaskIds = [...(payload.attachedTaskIds ?? []), ...newTaskIds]
    batch.set(doc(col, delivId), {
      ...base, title: payload.deliverable.title, status: 'todo', priority: 'media',
      dueDate: payload.deliverable.dueDate ?? null, assignees: payload.deliverable.assignees ?? [],
      type: 'deliverable', deliverableTaskIds: allTaskIds, milestoneId,
    })

    if (newTaskIds.length) {
      batch.update(doc(db, 'projects', projectId), { taskCount: increment(newTaskIds.length) })
    }
    await batch.commit()
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

  return { tasks, loading, createTask, updateTaskStatus, completeTask, uncompleteTask, updateTask, deleteTask, approvePhase, unapprovePhase, createPhaseBundle }
}
