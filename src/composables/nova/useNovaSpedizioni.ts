import { ref, onUnmounted } from 'vue'
import {
  collection, query, where, onSnapshot, updateDoc, doc, Timestamp
} from 'firebase/firestore'
import { db } from '../../firebase'

export type SpedizioneStato = 'READY' | 'DELIVERY' | 'DELIVERED'

export interface Spedizione {
  id: string
  cliente: string
  commessa: string
  colli: number
  citta: string
  provincia: string
  stato: SpedizioneStato
  corriere: string
  trackingNumber: string
  dataConsegnaEffettiva: Date | null
  // FE-3b: numero DDT a prescindere dal backend (FiC fic_ddt_number / CiC cic_ddt_number)
  ddtNumber?: string | number
}

export function useNovaSpedizioni() {
  const spedizioni = ref<Spedizione[]>([])
  const loading    = ref(true)

  const STATI: SpedizioneStato[] = ['READY', 'DELIVERY', 'DELIVERED']

  const unsubs: (() => void)[] = []

  STATI.forEach(stato => {
    const q = query(collection(db, 'preventivi'), where('stato', '==', stato))
    const unsub = onSnapshot(q, snap => {
      const incoming: Spedizione[] = snap.docs.map(d => {
        const data = d.data()
        let dataConsegna: Date | null = null
        if (data.dataConsegnaEffettiva) {
          dataConsegna = data.dataConsegnaEffettiva instanceof Timestamp
            ? data.dataConsegnaEffettiva.toDate()
            : new Date(data.dataConsegnaEffettiva)
        }
        return {
          id:                    d.id,
          cliente:               data.cliente               ?? '—',
          commessa:              data.commessa              ?? '—',
          colli:                 Number(data.colli)         || 1,
          citta:                 data.citta                 ?? '',
          provincia:             data.provincia             ?? '',
          stato:                 data.stato                 as SpedizioneStato,
          corriere:              data.corriere              ?? '',
          trackingNumber:        data.trackingNumber        ?? '',
          dataConsegnaEffettiva: dataConsegna,
          ddtNumber:             data.cic_ddt_number ?? data.fic_ddt_number,
        }
      })

      spedizioni.value = [
        ...spedizioni.value.filter(s => s.stato !== stato),
        ...incoming,
      ]
      loading.value = false
    })
    unsubs.push(unsub)
  })

  onUnmounted(() => unsubs.forEach(u => u()))

  async function saveTracking(id: string, corriere: string, trackingNumber: string) {
    await updateDoc(doc(db, 'preventivi', id), { corriere, trackingNumber })
  }

  return { spedizioni, loading, saveTracking }
}
