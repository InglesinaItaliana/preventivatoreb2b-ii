import { ref, computed, onUnmounted } from 'vue'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface Obiettivo {
  id: string
  titolo: string
  descrizione: string
  metrica: string
  valoreTarget: number | null
  valoreCorrente: number | null
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
      return {
        id:             d.id,
        titolo:         data.titolo         ?? '',
        descrizione:    data.descrizione    ?? '',
        metrica:        data.metrica        ?? '',
        valoreTarget:   typeof data.valoreTarget   === 'number' ? data.valoreTarget   : null,
        valoreCorrente: typeof data.valoreCorrente === 'number' ? data.valoreCorrente : null,
        anno:           data.anno           ?? new Date().getFullYear(),
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
    metrica: string
    valoreTarget: number | null
    valoreCorrente: number | null
    anno: number
    colore: string
  }): Promise<string> {
    const ref = await addDoc(collection(db, 'obiettivi'), {
      titolo:         data.titolo,
      descrizione:    data.descrizione,
      metrica:        data.metrica,
      valoreTarget:   data.valoreTarget,
      valoreCorrente: data.valoreCorrente,
      anno:           data.anno,
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
      metrica: string
      valoreTarget: number | null
      valoreCorrente: number | null
      anno: number
      colore: string
      stato: 'attivo' | 'raggiunto' | 'archiviato'
    }>,
  ) {
    await updateDoc(doc(db, 'obiettivi', id), data)
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
