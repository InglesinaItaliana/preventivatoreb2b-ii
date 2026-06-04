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
const byDueThenCreated = (a: ProjectTask, b: ProjectTask) =>
  (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
  || a.createdAt.getTime() - b.createdAt.getTime()

/* ============================ view-model ============================ */
export type MarkerState = 'done' | 'late' | 'timed' | 'untimed'

export interface TaskVM {
  id: string
  title: string
  assignees: string[]
  timed: boolean
  done: boolean
  late: boolean
  s: number
  d: number
  leftPct: number
  widthPct: number
  startTs: number | null
  dueText: string
  marker: MarkerState
}

export interface PhaseVM {
  id: string
  delivName: string
  windowStart: Date
  windowEnd: Date
  windowDays: number
  dueIso: string
  minDueIso: string
  maxDueIso: string
  tasks: TaskVM[]
  unlocked: boolean   // = lock della milestone del gruppo
  ready: boolean      // tutti i task fatti
  approved: boolean
  canApprove: boolean
  delivLate: boolean
}

export interface MilestoneGroupVM {
  milestoneId: string
  mileName: string | null
  mileDue: Date | null
  mileDueTs: number | null
  deliverables: PhaseVM[]
  directTasks: TaskVM[]          // task agganciati alla milestone senza deliverable
  directWindowStart: Date
  directWindowDays: number
  reached: boolean
  unlocked: boolean
  late: boolean
  isLastGroup: boolean
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

const NONE = '__none__'

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

  function orderTasks(list: ProjectTask[]): ProjectTask[] {
    return [...list].sort((a, b) => {
      const va = a.startDate && a.dueDate ? a.startDate.getTime() : -1
      const vb = b.startDate && b.dueDate ? b.startDate.getTime() : -1
      return va - vb || a.createdAt.getTime() - b.createdAt.getTime()
    })
  }

  // Raggruppa i deliverable per milestone; ordine globale = milestone (per data) -> deliverable interni (per data).
  const groups = computed<MilestoneGroupVM[]>(() => {
    const start0 = projectStart.value
    const ms = [...milestones.value].sort(byDueThenCreated)

    const delivByM = new Map<string, ProjectTask[]>()
    ms.forEach(m => delivByM.set(m.id, []))
    const noneDelivs: ProjectTask[] = []
    deliverables.value.forEach(d => {
      if (d.milestoneId && delivByM.has(d.milestoneId)) delivByM.get(d.milestoneId)!.push(d)
      else noneDelivs.push(d)
    })
    delivByM.forEach(arr => arr.sort(byDueThenCreated))
    noneDelivs.sort(byDueThenCreated)

    // ordine globale dei deliverable + ref milestone
    const ordered: { milestoneId: string; m: ProjectTask | null; delivs: ProjectTask[] }[] = []
    ms.forEach(m => ordered.push({ milestoneId: m.id, m, delivs: delivByM.get(m.id)! }))
    if (noneDelivs.length) ordered.push({ milestoneId: NONE, m: null, delivs: noneDelivs })

    // finestre temporali sequenziali sull'ordine globale dei deliverable
    const win = new Map<string, { windowStart: Date; windowEnd: Date; windowDays: number; nextDue: Date | null }>()
    const flatDocs: ProjectTask[] = ordered.flatMap(g => g.delivs)
    let prevEnd = start0
    flatDocs.forEach((d, i) => {
      const windowStart = i === 0 ? start0 : prevEnd
      let windowEnd = d.dueDate ? startOfDay(d.dueDate) : addD(windowStart, 30)
      if (windowEnd.getTime() <= windowStart.getTime()) windowEnd = addD(windowStart, 1)
      const windowDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY))
      const next = flatDocs[i + 1]
      win.set(d.id, { windowStart, windowEnd, windowDays, nextDue: next?.dueDate ? startOfDay(next.dueDate) : null })
      prevEnd = windowEnd
    })

    const projEnd = project.value?.dueDate ? startOfDay(project.value.dueDate) : addD(prevEnd, 365)

    // task "diretti" di milestone: hanno milestoneId ma non stanno in nessun deliverable
    const assignedSet = new Set<string>()
    deliverables.value.forEach(d => d.deliverableTaskIds.forEach(id => assignedSet.add(id)))
    const directByM = new Map<string, ProjectTask[]>()
    realTasks.value.forEach(t => {
      if (t.milestoneId && delivByM.has(t.milestoneId) && !assignedSet.has(t.id)) {
        if (!directByM.has(t.milestoneId)) directByM.set(t.milestoneId, [])
        directByM.get(t.milestoneId)!.push(t)
      }
    })

    // reached per gruppo (dai flag approved), unlocked sequenziale
    const reachedArr = ordered.map(g => g.milestoneId !== NONE && g.delivs.length > 0 && g.delivs.every(d => d.approved))
    const out: MilestoneGroupVM[] = []
    ordered.forEach((g, gi) => {
      const unlocked = g.milestoneId === NONE ? true : (gi === 0 || reachedArr[gi - 1])
      const phases: PhaseVM[] = g.delivs.map(d => {
        const w = win.get(d.id)!
        const phaseTasks = orderTasks(realTasks.value.filter(t => d.deliverableTaskIds.includes(t.id)))
        const vms = phaseTasks.map(t => buildTaskVM(t, w.windowStart, w.windowDays, unlocked))
        const ready = phaseTasks.every(t => !!t.completedAt)
        const approved = !!d.approved
        const minDueIso = isoOf(addD(w.windowStart, 1))
        const maxBound = w.nextDue ? addD(w.nextDue, -1) : projEnd
        return {
          id: d.id, delivName: d.title,
          windowStart: w.windowStart, windowEnd: w.windowEnd, windowDays: w.windowDays,
          dueIso: isoOf(w.windowEnd), minDueIso, maxDueIso: isoOf(maxBound),
          tasks: vms, unlocked, ready, approved,
          canApprove: unlocked && ready && !approved,
          delivLate: !approved && w.windowEnd.getTime() < TODAY_TS && unlocked,
        }
      })
      // la data della milestone è DERIVATA: fine del deliverable più tardivo del gruppo
      const mileDue = phases.length ? phases[phases.length - 1].windowEnd : null
      const reached = reachedArr[gi]
      // finestra per i task diretti della milestone
      const dWinStart = phases.length ? phases[0].windowStart : start0
      const dWinEnd = phases.length ? phases[phases.length - 1].windowEnd : projEnd
      const directWindowDays = Math.max(1, Math.round((dWinEnd.getTime() - dWinStart.getTime()) / DAY))
      const directTasks = g.milestoneId !== NONE
        ? orderTasks(directByM.get(g.milestoneId) ?? []).map(t => buildTaskVM(t, dWinStart, directWindowDays, unlocked))
        : []
      out.push({
        milestoneId: g.milestoneId,
        mileName: g.m?.title ?? null,
        mileDue, mileDueTs: mileDue ? mileDue.getTime() : null,
        deliverables: phases,
        directTasks, directWindowStart: dWinStart, directWindowDays,
        reached, unlocked,
        late: g.milestoneId !== NONE && !reached && !!mileDue && mileDue.getTime() < TODAY_TS && unlocked,
        isLastGroup: gi === ordered.length - 1,
      })
    })
    return out
  })

  const phasesFlat = computed<PhaseVM[]>(() => groups.value.flatMap(g => g.deliverables))

  // task orfani: timed e non in nessun deliverable
  const orphanGroup = computed<OrphanGroupVM | null>(() => {
    const assigned = new Set<string>()
    deliverables.value.forEach(d => d.deliverableTaskIds.forEach(id => assigned.add(id)))
    const milestoneIds = new Set(milestones.value.map(m => m.id))
    // orfani = non in un deliverable e non agganciati a una milestone esistente
    // (inclusi gli untimed: es. task appena smistati a livello progetto, così restano visibili).
    // I completati RESTANO visibili (barrati), come i task dentro le fasi: spuntare
    // un task fuori fase non deve farlo sparire dalla vista progetti.
    const orphans = realTasks.value.filter(t => !assigned.has(t.id) && !(t.milestoneId && milestoneIds.has(t.milestoneId)))
    if (!orphans.length) return null
    const windowStart = projectStart.value
    const firstEnd = phasesFlat.value[0]?.windowStart
    const projEnd = project.value?.dueDate ? startOfDay(project.value.dueDate) : null
    let windowEnd = firstEnd ?? projEnd ?? addD(windowStart, 30)
    if (windowEnd.getTime() <= windowStart.getTime()) windowEnd = addD(windowStart, 30)
    const windowDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY))
    return { windowStart, windowEnd, windowDays, tasks: orderTasks(orphans).map(t => buildTaskVM(t, windowStart, windowDays, true)) }
  })

  /* ---------------- barre top ---------------- */
  const workBar = computed(() => {
    const all = phasesFlat.value.reduce((s, p) => s + p.tasks.length, 0)
    const done = phasesFlat.value.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0)
    let cum = 0
    const marks = phasesFlat.value.map(p => {
      cum += p.tasks.length
      return { pct: all ? cum / all * 100 : 0, reached: p.ready, label: p.delivName }
    })
    return { done, total: all, pct: all ? Math.round(done / all * 100) : 0, marks }
  })

  const projectEnd = computed<Date>(() => {
    if (project.value?.dueDate) return startOfDay(project.value.dueDate)
    const last = phasesFlat.value[phasesFlat.value.length - 1]
    return last?.windowEnd ?? addD(projectStart.value, 30)
  })

  const timeBar = computed(() => {
    const st = projectStart.value, en = projectEnd.value
    const totD = Math.max(1, Math.round((en.getTime() - st.getTime()) / DAY))
    const elapsed = clamp(Math.round((TODAY_TS - st.getTime()) / DAY), 0, totD)
    const marks = groups.value.filter(g => g.mileDue).map(g => ({
      pct: clamp((g.mileDue!.getTime() - st.getTime()) / DAY / totD * 100, 0, 100),
      reached: g.reached, label: g.mileName ?? '',
    }))
    return { elapsed, total: totD, pct: Math.round(elapsed / totD * 100), marks }
  })

  const allApproved = computed(() => {
    const real = groups.value.filter(g => g.milestoneId !== NONE)
    return real.length > 0 && real.every(g => g.reached)
  })

  // Progetto completato: copre sia i progetti con milestone (tutti i deliverable
  // approvati ⇒ milestone raggiunte) sia quelli di sole task (tutte completate).
  // false se il progetto è ancora vuoto.
  const projectComplete = computed(() => {
    const hasContent = phasesFlat.value.length > 0 || realTasks.value.length > 0
    if (!hasContent) return false
    const allPhasesApproved = phasesFlat.value.every(p => p.approved)
    const allTasksDone = realTasks.value.every(t => !!t.completedAt)
    return allPhasesApproved && allTasksDone
  })
  const projectRange = computed(() => fmt(projectStart.value) + ' → ' + fmt(projectEnd.value))

  /* ---------------- contesto finestra per un task ---------------- */
  function contextOf(taskId: string): { windowStart: Date; windowDays: number } | null {
    for (const p of phasesFlat.value) if (p.tasks.some(t => t.id === taskId)) return { windowStart: p.windowStart, windowDays: p.windowDays }
    for (const g of groups.value) if (g.directTasks.some(t => t.id === taskId)) return { windowStart: g.directWindowStart, windowDays: g.directWindowDays }
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
      await writers.updateTask(taskId, { startDate: null })
    } else if (ctx) {
      const startDate = ctx.windowStart
      const dueDate = addD(ctx.windowStart, Math.min(7, ctx.windowDays))
      await writers.updateTask(taskId, { startDate, dueDate })
    }
  }

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
    const lastEnd = phasesFlat.value[phasesFlat.value.length - 1]?.windowEnd
    if (dueDate && lastEnd && dueDate.getTime() < lastEnd.getTime()) dueDate = lastEnd
    await writers.updateProject(project.value.id, { startDate, dueDate })
  }

  const approve = (id: string) => writers.approvePhase(id)
  const unapprove = (id: string) => writers.unapprovePhase(id)

  const projectStartTs = computed(() => projectStart.value.getTime())

  return {
    TODAY, projectStart, projectStartTs, projectEnd, projectRange,
    groups, phasesFlat, orphanGroup, workBar, timeBar, allApproved, projectComplete,
    toggleDone, toggleTimed, commitDrag, setPhaseDue, setProjectDates, approve, unapprove,
    contextOf, fmt, range, isoOf,
  }
}
