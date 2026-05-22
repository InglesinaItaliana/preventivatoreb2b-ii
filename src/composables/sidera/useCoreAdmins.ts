import { ref, onUnmounted } from 'vue'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../firebase'

/**
 * Allowlist dinamica di email admin "CORE" (gating sezione CORE / Manutenzione /
 * Impostazioni). Sorgente: doc Firestore `core/admins` = { emails: string[] }.
 * `info@inglesinaitaliana.it` è sempre super-admin (fallback permanente).
 */
const SUPER_ADMIN = 'info@inglesinaitaliana.it'

function norm(email: string | null | undefined): string {
  return (email ?? '').toLowerCase().trim()
}

export function useCoreAdmins() {
  const emails = ref<string[]>([])
  const initialized = ref(false)   // doc esiste con almeno un'email
  const loading = ref(true)

  const ref0 = doc(db, 'core', 'admins')
  const unsubscribe = onSnapshot(ref0, (snap) => {
    const list = (snap.exists() ? (snap.data().emails ?? []) : []) as unknown[]
    emails.value = list.filter((e): e is string => typeof e === 'string').map(norm)
    initialized.value = snap.exists() && emails.value.length > 0
    loading.value = false
  }, (err) => {
    console.error('[useCoreAdmins]', err)
    loading.value = false
  })
  onUnmounted(unsubscribe)

  function isCoreAdmin(email?: string | null): boolean {
    const e = norm(email)
    if (!e) return false
    return e === SUPER_ADMIN || emails.value.includes(e)
  }

  async function save(next: string[]) {
    await setDoc(ref0, {
      emails: next,
      updatedAt: serverTimestamp(),
      updatedBy: norm(auth.currentUser?.email),
    }, { merge: true })
  }

  async function addAdmin(email: string) {
    const e = norm(email)
    if (!e || emails.value.includes(e)) return
    await save([...emails.value, e])
  }

  async function removeAdmin(email: string) {
    const e = norm(email)
    if (e === SUPER_ADMIN) return   // super-admin non rimovibile
    await save(emails.value.filter(x => x !== e))
  }

  return { emails, initialized, loading, isCoreAdmin, addAdmin, removeAdmin, SUPER_ADMIN }
}
