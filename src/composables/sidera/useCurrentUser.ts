import { ref } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase'

export interface CurrentUser {
  uid: string
  email: string
  role: string
  name?: string
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
  try {
    const snap = await getDoc(doc(db, 'team', emailKey))
    if (snap.exists()) {
      role = snap.data().role ?? ''
      name = snap.data().name
    }
  } catch {}
  currentUser.value = { uid: user.uid, email: user.email ?? '', role, name }
})

export function useCurrentUser() {
  return { currentUser }
}
