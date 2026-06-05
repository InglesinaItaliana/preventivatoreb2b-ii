/**
 * useCalendarItems — sorgente unificata per il calendario EPHEMERIS (tab QUASAR).
 *
 * Fonde in un tipo comune `CalendarItem` le entità DATATE della suite, lette da
 * `useAllTasks` (collectionGroup: root `tasks/` + `projects/{id}/tasks`):
 *   - appointment → evento con orario (startAt/endAt),
 *   - task / deliverable → all-day sulla `dueDate` (overlay read-only).
 * (Le scadenze gestionale sono rimandate; la milestone ha data derivata → omessa.)
 *
 * Filosofia "una entità, tante viste": stesso dato della timeline CEPHEID, render
 * diverso. I writer/CRUD degli appuntamenti arrivano in B3. Vedi docs/ATLAS (calendario).
 */
import { computed } from 'vue'
import { useAllTasks } from '../sidera/useAllTasks'
import { useProjects } from '../sidera/useProjects'

export type CalendarKind = 'task' | 'deliverable' | 'appointment'

export interface CalendarItem {
  id: string
  kind: CalendarKind
  title: string
  start: Date            // appointment: startAt; altrimenti dueDate (all-day)
  end: Date | null       // appointment: endAt
  allDay: boolean
  done: boolean
  color: string
  projectId: string
  projectName: string    // nome progetto (per dare contesto ai task); '' se nessuno
  assignees: string[]    // uid (migrazione assignees→uid completata)
  location: string       // solo appuntamenti
  notes: string          // solo appuntamenti
  link: string           // deep-link al modulo d'origine
}

// Colori per sorgente: appuntamento = accent QUASAR (scope-aware); tutto ciò che è
// CEPHEID (task E deliverable) = ORO CEPHEID — si distinguono per ICONA, non colore.
const COLOR = {
  appointment: 'var(--md-sys-color-primary)',
  cepheid:     '#D4A020',
} as const

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useCalendarItems() {
  const { tasks, loading } = useAllTasks()
  const { projects } = useProjects()

  const projName = computed(() => {
    const m = new Map<string, string>()
    for (const p of projects.value) m.set(p.id, p.name)
    return m
  })

  const items = computed<CalendarItem[]>(() => {
    const out: CalendarItem[] = []
    const names = projName.value
    for (const t of tasks.value) {
      const pn = t.projectId ? (names.get(t.projectId) ?? '') : ''
      if (t.type === 'appointment') {
        if (!t.startAt) continue
        out.push({
          id: t.id, kind: 'appointment', title: t.title,
          start: t.startAt, end: t.endAt, allDay: false, done: !!t.completedAt,
          color: COLOR.appointment, projectId: t.projectId, projectName: pn, assignees: t.assignees,
          location: t.location, notes: t.notes,
          link: `/quasar/calendario`,   // gli appuntamenti si aprono nella modale (B3)
        })
      } else if (t.type === 'deliverable') {
        if (!t.dueDate) continue
        out.push({
          id: t.id, kind: 'deliverable', title: t.title,
          start: t.dueDate, end: null, allDay: true, done: !!t.completedAt,
          color: COLOR.cepheid, projectId: t.projectId, projectName: pn, assignees: t.assignees, location: '', notes: '',
          link: t.projectId ? `/cepheid/project/${t.projectId}` : '/cepheid',
        })
      } else if (!t.type || t.type === 'task') {
        if (!t.dueDate) continue
        out.push({
          id: t.id, kind: 'task', title: t.title,
          start: t.dueDate, end: null, allDay: true, done: !!t.completedAt,
          color: COLOR.cepheid, projectId: t.projectId, projectName: pn, assignees: t.assignees, location: '', notes: '',
          link: t.projectId ? `/cepheid/project/${t.projectId}` : '/cepheid/azioni',
        })
      }
      // milestone: data derivata dai deliverable → omessa in B1.
    }
    return out
  })

  /** Items di un singolo giorno (match su `start`, granularità giorno). */
  function itemsForDay(d: Date): CalendarItem[] {
    const k = dayKey(d)
    return items.value.filter(i => dayKey(i.start) === k)
  }

  /** Items nel range [from, to) — per la griglia Mese/Settimana. */
  function itemsInRange(from: Date, to: Date): CalendarItem[] {
    return items.value.filter(i => i.start >= from && i.start < to)
  }

  return { items, itemsForDay, itemsInRange, loading }
}
