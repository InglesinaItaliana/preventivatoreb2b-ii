import { ref, computed, onUnmounted } from 'vue'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../firebase'

export type PeriodKind = 'year' | 'quarters'

export interface Obiettivo {
  id: string
  titolo: string
  descrizione: string
  /** Tipo di periodo: anno intero o intervallo di trimestri contigui. */
  periodKind: PeriodKind
  /** Span del periodo (usato dalla barra del tempo). Sempre valorizzato dopo il mapper. */
  startDate: Date | null
  endDate: Date | null
  /** Legacy: anno solare. Mantenuto per ordinamento/retro-compatibilità. */
  anno: number
  stato: 'attivo' | 'raggiunto' | 'archiviato'
  colore: string
  createdBy: string
  createdAt: Date
}

export const GOAL_COLOR_PRESETS = ['#D4A020', '#2F6B4A', '#3A8C80', '#C8521A', '#7A8FA6', '#9B5BB5']

function toDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return null
}

export function useObiettivi() {
  const obiettivi = ref<Obiettivo[]>([])
  const loading   = ref(true)

  const q = query(collection(db, 'obiettivi'), orderBy('createdAt', 'desc'))

  const unsubscribe = onSnapshot(q, (snap) => {
    obiettivi.value = snap.docs.map((d) => {
      const data = d.data()
      const anno = data.anno ?? new Date().getFullYear()
      // Periodo: usa start/end espliciti; fallback legacy = anno solare intero.
      let startDate = toDate(data.startDate)
      let endDate   = toDate(data.endDate)
      const periodKind: PeriodKind = data.periodKind === 'quarters' ? 'quarters' : 'year'
      if (!startDate) startDate = new Date(anno, 0, 1)
      if (!endDate)   endDate   = new Date(anno, 11, 31)
      return {
        id:             d.id,
        titolo:         data.titolo         ?? '',
        descrizione:    data.descrizione    ?? '',
        periodKind,
        startDate,
        endDate,
        anno,
        stato:          data.stato          ?? 'attivo',
        colore:         data.colore         ?? '#D4A020',
        createdBy:      data.createdBy      ?? '',
        createdAt:      toDate(data.createdAt) ?? new Date(),
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useObiettivi]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function createObiettivo(data: {
    titolo: string
    descrizione: string
    periodKind: PeriodKind
    startDate: Date
    endDate: Date
    colore: string
  }): Promise<string> {
    const ref = await addDoc(collection(db, 'obiettivi'), {
      titolo:         data.titolo,
      descrizione:    data.descrizione,
      periodKind:     data.periodKind,
      startDate:      data.startDate,
      endDate:        data.endDate,
      anno:           data.startDate.getFullYear(),  // legacy: ordinamento/retro-compat
      stato:          'attivo',
      colore:         data.colore,
      createdBy:      auth.currentUser?.uid ?? '',
      createdAt:      serverTimestamp(),
    })
    return ref.id
  }

  async function updateObiettivo(
    id: string,
    data: Partial<{
      titolo: string
      descrizione: string
      periodKind: PeriodKind
      startDate: Date
      endDate: Date
      colore: string
      stato: 'attivo' | 'raggiunto' | 'archiviato'
    }>,
  ) {
    // Allinea l'anno legacy quando cambia lo start del periodo.
    const payload: Record<string, unknown> = { ...data }
    if (data.startDate) payload.anno = data.startDate.getFullYear()
    await updateDoc(doc(db, 'obiettivi', id), payload)
  }

  async function archiveObiettivo(id: string) {
    await updateDoc(doc(db, 'obiettivi', id), { stato: 'archiviato' })
  }

  async function deleteObiettivo(id: string) {
    await deleteDoc(doc(db, 'obiettivi', id))
  }

  const obiettiviAttivi = computed(() =>
    obiettivi.value.filter(o => o.stato !== 'archiviato')
  )

  return { obiettivi, obiettiviAttivi, loading, createObiettivo, updateObiettivo, archiveObiettivo, deleteObiettivo }
}
