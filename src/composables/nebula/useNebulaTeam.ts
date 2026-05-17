import { ref, onUnmounted } from 'vue'
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'

export interface NebulaMember {
  email:      string
  firstName:  string
  lastName:   string
  role:       'ADMIN' | 'PRODUZIONE' | 'COMMERCIALE' | 'LOGISTICA' | string
  phone:      string
  active:     boolean
  color:      string
  position?:  string
}

export const POSITION_OPTIONS = [
  'Titolare',
  'Socio',
  'Amministratore Delegato',
  'Responsabile Commerciale',
  'Agente Commerciale',
  'Responsabile Produzione',
  'Capo Officina',
  'Operaio Specializzato',
  'Operaio',
  'Responsabile Logistica',
  'Magazziniere',
  'Autista',
  'Amministrativo',
  'Contabile',
]

export function useNebulaTeam() {
  const members = ref<NebulaMember[]>([])
  const loading = ref(true)

  const unsubscribe = onSnapshot(collection(db, 'team'), (snap) => {
    members.value = snap.docs.map(d => {
      const data = d.data()
      return {
        email:     d.id,
        firstName: data.firstName ?? '',
        lastName:  data.lastName  ?? '',
        role:      data.role      ?? '',
        phone:     data.phone     ?? '',
        active:    data.active    ?? true,
        color:     data.color     ?? '#2F6B4A',
        position:  data.position  ?? undefined,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useNebulaTeam]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  async function updatePosition(email: string, position: string) {
    await updateDoc(doc(db, 'team', email), { position: position || null })
  }

  return { members, loading, updatePosition }
}
