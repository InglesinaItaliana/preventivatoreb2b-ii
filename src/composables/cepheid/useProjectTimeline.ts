import { computed, type Ref } from 'vue'
import type { ProjectTask } from '../sidera/useProjectTasks'
import type { Project } from '../sidera/useProjects'

/* ============================ util tempo ============================ */
export const DAY = 86400000
export const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const fmt = (d: Date) => d.getDate() + ' ' + MESI[d.getMonth()]
export function range(a: Date, b: Date) {
  return a.getMonth() === b.getMonth()
    ? a.getDate() + '–' + b.getDate() + ' ' + MESI[b.getMonth()]
    : fmt(a) + ' → ' + fmt(b)
}
export function isoOf(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
export const parseISO = (iso: string) => new Date(iso + 'T00:00:00')
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/* ============================ view-model ============================ */
export type MarkerState = 'done' | 'late' | 'timed' | 'untimed'

export interface TaskVM {
  id: string
  title: string
  assignees: string[]
  timed: boolean
  done: boolean
  late: boolean
  s: number              // offset start (giorni) dentro la finestra
  d: number              // durata (giorni)
  leftPct: number
  widthPct: number
  startTs: number | null // anchor OGGI (startDate.getTime())
  dueText: string
  marker: MarkerState
}

export interface PhaseVM {
  id: string
  index: number
  delivName: string
  mileName: string | null
  milestoneId: string | null
  windowStart: Date
  windowEnd: Date
  windowDays: number
  windowEndTs: number
  dueIso: string
  minDueIso: string
  maxDueIso: string
  tasks: TaskVM[]
  unlocked: boolean
  ready: boolean         // tutti i task fatti
  approved: boolean
  canApprove: boolean
  delivLate: boolean
  mileReached: boolean
  mileLate: boolean
  isLast: boolean
}

export interface OrphanGroupVM {
  windowStart: Date
  windowEnd: Date
  windowDays: number
  tasks: TaskVM[]
}

export interface TimelineWriters {
  updateTask: (id: string, data: Partial<{ startDate: Date | null; dueDate: Date | null }>) => Promise<void>
  completeTask: (id: string) => Promise<void>
  uncompleteTask: (id: string) => Promise<void>
  updateProject: (id: string, data: Partial<{ startDate: Date | null; dueDate: Date | null }>) => Promise<void>
  approvePhase: (deliverableId: string) => Promise<void>
  unapprovePhase: (deliverableId: string) => Promise<void>
}

export function useProjectTimeline(
  tasks: Ref<ProjectTask[]>,
  project: Ref<Project | undefined>,
  writers: TimelineWriters,
) {
  const TODAY = startOfDay(new Date())
  const TODAY_TS = TODAY.getTime()

  const deliverables = computed(() => tasks.value.filter(t => t.type === 'deliverable'))
  const milestones   = computed(() => tasks.value.filter(t => t.type === 'milestone'))
  const realTasks    = computed(() => tasks.value.filter(t => !t.type || t.type === 'task'))

  // inizio progetto: campo esplicito, altrimenti primo startDate task, altrimenti oggi
  const projectStart = computed<Date>(() => {
    if (project.value?.startDate) return startOfDay(project.value.startDate)
    const starts = tasks.value.map(t => t.startDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())
    return startOfDay(starts[0] ?? new Date())
  })

  function buildTaskVM(t: ProjectTask, windowStart: Date, windowDays: number, unlocked: boolean): TaskVM {
    const timed = !!t.startDate && !!t.dueDate
    const done = !!t.completedAt
    let s = 0, d = 1, startTs: number | null = null, dueText = ''
    if (timed) {
      s = clamp(Math.round((t.startDate!.getTime() - windowStart.getTime()) / DAY), 0, Math.max(0, windowDays - 1))
      d = clamp(Math.max(1, Math.round((t.dueDate!.getTime() - t.startDate!.getTime()) / DAY)), 1, windowDays - s)
      startTs = startOfDay(t.startDate!).getTime()
    }
    const late = timed && !done && t.dueDate!.getTime() < TODAY_TS && unlocked
    if (timed) dueText = late ? 'in ritardo' : range(addD(windowStart, s), addD(windowStart, s + d))
    const marker: MarkerState = done ? 'done' : late ? 'late' : timed ? 'timed' : 'untimed'
    return {
      id: t.id, title: t.title, assignees: t.assignees, timed, done, late,
      s, d, leftPct: s / windowDays * 100, widthPct: d / windowDays * 100,
      startTs, dueText, marker,
    }
  }

  // ordine task: come il prototipo -> non-timed (-1) prima, poi timed per offset start
  function orderTasks(list: ProjectTask[]): ProjectTask[] {
    return [...list].sort((a, b) => {
      const va = a.startDate && a.dueDate ? (a.startDate.getTime()) : -1
      const vb = b.startDate && b.dueDate ? (b.startDate.getTime()) : -1
      return va - vb || a.createdAt.getTime() - b.createdAt.getTime()
    })
  }

  const phases = computed<PhaseVM[]>(() => {
    const ordered = [...deliverables.value].sort((a, b) => {
      const oa = a.order ?? Infinity, ob = b.order ?? Infinity
      if (oa !== ob) return oa - ob
      const da = a.dueDate?.getTime() ?? Infinity, db = b.dueDate?.getTime() ?? Infinity
      if (da !== db) return da - db
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    const start0 = projectStart.value
    const out: PhaseVM[] = []
    ordered.forEach((deliv, i) => {
      const windowStart = i === 0 ? start0 : out[i - 1].windowEnd
      let windowEnd = deliv.dueDate ? startOfDay(deliv.dueDate) : addD(windowStart, 30)
      if (windowEnd.getTime() <= windowStart.getTime()) windowEnd = addD(windowStart, 1)
      const windowDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY))
      const unlocked = i === 0 || out[i - 1].approved
      const phaseTasks = orderTasks(realTasks.value.filter(t => deliv.deliverableTaskIds.includes(t.id)))
      const vms = phaseTasks.map(t => buildTaskVM(t, windowStart, windowDays, unlocked))
      const ready = phaseTasks.every(t => !!t.completedAt)   // true se vuoto (come prototipo)
      const approved = !!deliv.approved
      const mile = milestones.value.find(m => m.deliverableId === deliv.id) ?? null
      const delivLate = !approved && windowEnd.getTime() < TODAY_TS && unlocked

      // clamp per il date input della scadenza
      const minDueIso = isoOf(addD(windowStart, 1))
      const nextDeliv = ordered[i + 1]
      const maxBound = nextDeliv?.dueDate ? addD(startOfDay(nextDeliv.dueDate), -1) : (project.value?.dueDate ? startOfDay(project.value.dueDate) : addD(windowEnd, 365))

      out.push({
        id: deliv.id, index: i, delivName: deliv.title,
        mileName: mile?.title ?? null, milestoneId: mile?.id ?? null,
        windowStart, windowEnd, windowDays, windowEndTs: windowEnd.getTime(),
        dueIso: isoOf(windowEnd), minDueIso, maxDueIso: isoOf(maxBound),
        tasks: vms,
        unlocked, ready, approved, canApprove: unlocked && ready && !approved,
        delivLate, mileReached: approved,
        mileLate: !approved && windowEnd.getTime() < TODAY_TS && unlocked,
        isLast: i === ordered.length - 1,
      })
    })
    return out
  })

  // task orfani: task timed non appartenenti a nessun deliverable
  const orphanGroup = computed<OrphanGroupVM | null>(() => {
    const assigned = new Set<string>()
    deliverables.value.forEach(d => d.deliverableTaskIds.forEach(id => assigned.add(id)))
    const orphans = realTasks.value.filter(t => !assigned.has(t.id) && t.startDate && t.dueDate)
    if (!orphans.length) return null
    const windowStart = projectStart.value
    const firstPhaseEnd = phases.value[0]?.windowStart
    const projEnd = project.value?.dueDate ? startOfDay(project.value.dueDate) : null
    let windowEnd = firstPhaseEnd ?? projEnd ?? addD(windowStart, 30)
    if (windowEnd.getTime() <= windowStart.getTime()) windowEnd = addD(windowStart, 30)
    const windowDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY))
    return { windowStart, windowEnd, windowDays, tasks: orderTasks(orphans).map(t => buildTaskVM(t, windowStart, windowDays, true)) }
  })

  /* ---------------- barre top ---------------- */
  const workBar = computed(() => {
    const all = phases.value.reduce((s, p) => s + p.tasks.length, 0)
    const done = phases.value.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0)
    let cum = 0
    const marks = phases.value.map(p => {
      cum += p.tasks.length
      return { pct: all ? cum / all * 100 : 0, reached: p.ready, label: p.delivName }
    })
    return { done, total: all, pct: all ? Math.round(done / all * 100) : 0, marks }
  })

  const projectEnd = computed<Date>(() => {
    if (project.value?.dueDate) return startOfDay(project.value.dueDate)
    const last = phases.value[phases.value.length - 1]
    return last?.windowEnd ?? addD(projectStart.value, 30)
  })

  const timeBar = computed(() => {
    const st = projectStart.value, en = projectEnd.value
    const totD = Math.max(1, Math.round((en.getTime() - st.getTime()) / DAY))
    const elapsed = clamp(Math.round((TODAY_TS - st.getTime()) / DAY), 0, totD)
    const marks = phases.value.map(p => ({
      pct: clamp((p.windowEnd.getTime() - st.getTime()) / DAY / totD * 100, 0, 100),
      reached: p.approved, label: p.mileName ?? p.delivName,
    }))
    return { elapsed, total: totD, pct: Math.round(elapsed / totD * 100), marks }
  })

  const allApproved = computed(() => phases.value.length > 0 && phases.value.every(p => p.approved))
  const projectRange = computed(() => fmt(projectStart.value) + ' → ' + fmt(projectEnd.value))

  /* ---------------- contesto finestra per un task ---------------- */
  function contextOf(taskId: string): { windowStart: Date; windowDays: number } | null {
    for (const p of phases.value) if (p.tasks.some(t => t.id === taskId)) return { windowStart: p.windowStart, windowDays: p.windowDays }
    const og = orphanGroup.value
    if (og && og.tasks.some(t => t.id === taskId)) return { windowStart: og.windowStart, windowDays: og.windowDays }
    return null
  }

  /* ---------------- azioni ---------------- */
  async function toggleDone(taskId: string) {
    const t = tasks.value.find(x => x.id === taskId); if (!t) return
    if (t.completedAt) await writers.uncompleteTask(taskId)
    else await writers.completeTask(taskId)
  }

  async function toggleTimed(taskId: string) {
    const t = tasks.value.find(x => x.id === taskId); if (!t) return
    const ctx = contextOf(taskId)
    if (t.startDate && t.dueDate) {
      await writers.updateTask(taskId, { startDate: null })  // rimuove la finestra (resta in kanban via dueDate)
    } else if (ctx) {
      const startDate = ctx.windowStart
      const dueDate = addD(ctx.windowStart, Math.min(7, ctx.windowDays))
      await writers.updateTask(taskId, { startDate, dueDate })
    }
  }

  // s,d calcolati dal componente durante il drag (in giorni) -> persistenza date assolute
  async function commitDrag(taskId: string, s: number, d: number) {
    const ctx = contextOf(taskId); if (!ctx) return
    const startDate = addD(ctx.windowStart, s)
    const dueDate = addD(ctx.windowStart, s + d)
    await writers.updateTask(taskId, { startDate, dueDate })
  }

  async function setPhaseDue(phase: PhaseVM, iso: string) {
    const nd = startOfDay(parseISO(iso))
    const min = addD(phase.windowStart, 1)
    const max = startOfDay(parseISO(phase.maxDueIso))
    const clamped = new Date(clamp(nd.getTime(), min.getTime(), Math.max(min.getTime(), max.getTime())))
    await writers.updateTask(phase.id, { dueDate: clamped })
  }

  async function setProjectDates(startIso: string, endIso: string) {
    if (!project.value) return
    const startDate = startIso ? startOfDay(parseISO(startIso)) : null
    let dueDate: Date | null = endIso ? startOfDay(parseISO(endIso)) : null
    const lastEnd = phases.value[phases.value.length - 1]?.windowEnd
    if (dueDate && lastEnd && dueDate.getTime() < lastEnd.getTime()) dueDate = lastEnd
    await writers.updateProject(project.value.id, { startDate, dueDate })
  }

  const approve = (id: string) => writers.approvePhase(id)
  const unapprove = (id: string) => writers.unapprovePhase(id)

  // timestamp degli anchor OGGI (il componente li mette come data-t sul DOM)
  const projectStartTs = computed(() => projectStart.value.getTime())

  return {
    TODAY, projectStart, projectStartTs, projectEnd, projectRange,
    phases, orphanGroup, workBar, timeBar, allApproved,
    toggleDone, toggleTimed, commitDrag, setPhaseDue, setProjectDates, approve, unapprove,
    contextOf, fmt, range, isoOf,
  }
}
