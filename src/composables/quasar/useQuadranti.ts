import { computed, type Ref } from 'vue'
import type { Task } from '../../composables/sidera/useAllTasks'

/**
 * Logica della matrice di Eisenhower (vista QUASAR · Quadranti).
 * Vedi docs/QUADRANTI.md. Decisioni 2026-05-22:
 *  - Importante = priority === 'alta' (media/bassa = non importante).
 *  - Task senza scadenza = mai urgenti (finiscono in q2 se importanti, q4 altrimenti).
 */

export const URG = 3      // giorni: entro questa soglia un task è "urgente"
export const MAXLOAD = 4  // q1 oltre questo numero = sovraccarico (animazione fuoco)

export type QuadId = 'q1' | 'q2' | 'q3' | 'q4'

export interface QuadTask {
  task: Task
  eff: number | null   // giorni alla scadenza meno il cursore; null = senza scadenza
  urgent: boolean
  forecast: boolean    // diventa urgente solo per effetto del cursore (non lo è oggi)
}

function isImportant(t: Task): boolean {
  return t.priority === 'alta'
}

/** Giorni alla scadenza relativi al cursore. null se il task non ha scadenza. */
export function effDays(t: Task, cursor: number): number | null {
  if (!t.dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((t.dueDate.getTime() - today.getTime()) / 86400000)
  return days - cursor
}

export function quadOf(t: Task, cursor: number): QuadId {
  const eff = effDays(t, cursor)
  const urgent = eff !== null && eff <= URG
  if (urgent) return isImportant(t) ? 'q1' : 'q3'
  return isImportant(t) ? 'q2' : 'q4'
}

export function useQuadranti(
  tasks: Ref<Task[]>,
  cursor: Ref<number>,
  filterEmails: Ref<Set<string> | null>,   // email del settore selezionato; null = tutti
) {
  // Solo azioni reali (no milestone/deliverable), ancora aperte, filtrate per settore.
  const active = computed(() => tasks.value.filter(t =>
    (!t.type || t.type === 'task') &&
    !t.completedAt &&
    (!filterEmails.value || t.assignees.some(a => filterEmails.value!.has(a))),
  ))

  const quadrants = computed<Record<QuadId, QuadTask[]>>(() => {
    const out: Record<QuadId, QuadTask[]> = { q1: [], q2: [], q3: [], q4: [] }
    const sorted = [...active.value].sort((a, b) =>
      (effDays(a, cursor.value) ?? Infinity) - (effDays(b, cursor.value) ?? Infinity),
    )
    for (const t of sorted) {
      const eff = effDays(t, cursor.value)
      const q = quadOf(t, cursor.value)
      const urgent = eff !== null && eff <= URG
      const urgentToday = t.dueDate ? (effDays(t, 0)! <= URG) : false
      out[q].push({ task: t, eff, urgent, forecast: urgent && !urgentToday })
    }
    return out
  })

  const counts = computed<Record<QuadId, number>>(() => ({
    q1: quadrants.value.q1.length,
    q2: quadrants.value.q2.length,
    q3: quadrants.value.q3.length,
    q4: quadrants.value.q4.length,
  }))

  const q1Overloaded = computed(() => counts.value.q1 > MAXLOAD)

  /** Quanti incendi (q1) in più rispetto a oggi, per effetto del cursore. */
  const fireDelta = computed(() => {
    const todayQ1 = active.value.filter(t => quadOf(t, 0) === 'q1').length
    return counts.value.q1 - todayQ1
  })

  return { active, quadrants, counts, q1Overloaded, fireDelta }
}
