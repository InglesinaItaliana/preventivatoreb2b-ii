import { computed, type Ref } from 'vue'
import type { Task } from '../../composables/sidera/useAllTasks'
import type { TeamMember } from '../../composables/sidera/useTeamMembers'
import { URG, effDays, type QuadId } from './useQuadranti'

/**
 * Vista Risorse della matrice QUASAR · Quadranti: mappa il CARICO per persona
 * sugli stessi 4 quadranti (Sovraccarico / In carico / Allerta / Disponibile).
 * Vedi docs/QUADRANTI.md.
 */

export const LOAD_THRESH = 3  // > soglia task assegnati = "carico alto"
export const PLOAD_URG = 1    // > soglia task urgenti = "sotto pressione"

export interface ResourceLoad {
  member: TeamMember
  total: number
  urg: number
  barPct: number     // % task urgenti sul totale (riempimento barra)
  forecast: boolean  // entra in Sovraccarico solo per effetto del cursore
}

function rQuadOf(tasksOf: Task[], cursor: number): QuadId {
  const heavy = tasksOf.length > LOAD_THRESH
  const pressing = tasksOf.filter(t => {
    const e = effDays(t, cursor)
    return e !== null && e <= URG
  }).length > PLOAD_URG
  return pressing ? (heavy ? 'q1' : 'q3') : (heavy ? 'q2' : 'q4')
}

export function useResourceLoad(
  tasks: Ref<Task[]>,
  members: Ref<TeamMember[]>,
  cursor: Ref<number>,
  filterEmails: Ref<Set<string> | null>,   // email del settore; null = tutte
) {
  const active = computed(() =>
    tasks.value.filter(t => (!t.type || t.type === 'task') && !t.completedAt),
  )

  const shownMembers = computed(() =>
    filterEmails.value ? members.value.filter(m => filterEmails.value!.has(m.email)) : members.value,
  )

  const quadrants = computed<Record<QuadId, ResourceLoad[]>>(() => {
    const out: Record<QuadId, ResourceLoad[]> = { q1: [], q2: [], q3: [], q4: [] }
    for (const m of shownMembers.value) {
      const ts = active.value.filter(t => t.assignees.includes(m.email) || (m.uid != null && t.assignees.includes(m.uid)))
      const total = ts.length
      const urg = ts.filter(t => {
        const e = effDays(t, cursor.value)
        return e !== null && e <= URG
      }).length
      const q = rQuadOf(ts, cursor.value)
      out[q].push({
        member: m,
        total,
        urg,
        barPct: total > 0 ? Math.round((urg / total) * 100) : 0,
        forecast: q === 'q1' && rQuadOf(ts, 0) !== 'q1',
      })
    }
    return out
  })

  const counts = computed<Record<QuadId, number>>(() => ({
    q1: quadrants.value.q1.length,
    q2: quadrants.value.q2.length,
    q3: quadrants.value.q3.length,
    q4: quadrants.value.q4.length,
  }))

  return { quadrants, counts }
}
