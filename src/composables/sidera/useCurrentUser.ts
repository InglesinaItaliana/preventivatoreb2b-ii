import { ref } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase'

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
    const snap = await getDoc(doc(db, 'team', emailKey))
    if (snap.exists()) {
      const d = snap.data()
      role = d.role ?? ''
      name = d.name
      category = d.category ?? undefined
      hueIndex = typeof d.hueIndex === 'number' ? d.hueIndex : undefined
    }
  } catch {}
  currentUser.value = { uid: user.uid, email: user.email ?? '', role, name, category, hueIndex }
})

export function useCurrentUser() {
  return { currentUser }
}
