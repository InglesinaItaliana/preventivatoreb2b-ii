import { ref } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../firebase'
import { getTeamDoc } from './useTeamMembers'

export interface CurrentUser {
  uid: string
  email: string
  role: string
  name?: string
  category?: string     // forma della stella (StarAvatar)
  hueIndex?: number     // colore stabile dal registro
}

const currentUser = ref<CurrentUser | null>(null)

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser.value = null
    return
  }
  const emailKey = user.email?.toLowerCase().trim() ?? ''
  let role = ''
  let name: string | undefined
  let category: string | undefined
  let hueIndex: number | undefined
  try {
    const snap = await getTeamDoc(user.uid)
    if (snap?.exists()) {
      const d = snap.data()
      role = d.role ?? ''
      // I doc team usano firstName/lastName: componi "Nome Cognome". Fallback al
      // campo legacy `name`, poi a undefined (chi consuma cade sull'email). Così la
      // presence NEBULA (cursori/«sta scrivendo») mostra il nome, non la mail.
      name = [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || undefined
      category = d.category ?? undefined
      hueIndex = typeof d.hueIndex === 'number' ? d.hueIndex : undefined
    }
  } catch {}
  currentUser.value = { uid: user.uid, email: user.email ?? '', role, name, category, hueIndex }
})

export function useCurrentUser() {
  return { currentUser }
}
