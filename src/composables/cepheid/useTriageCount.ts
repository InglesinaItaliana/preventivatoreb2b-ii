import { computed } from 'vue'
import { useAllTasks } from '../sidera/useAllTasks'

/**
 * Conteggio delle task da smistare (inbox CEPHEID): task vere, non completate
 * e non ancora smistate (`triaged !== true`). Stessa logica di CepheidInboxView.
 * Usato per l'indicatore "stella pulsante" su Smistamento (sidebar + bottom-nav).
 */
export function useTriageCount() {
  const { tasks } = useAllTasks()
  const triageCount = computed(() =>
    tasks.value.filter(t => t.type === 'task' && !t.completedAt && t.triaged !== true).length,
  )
  return { triageCount }
}
