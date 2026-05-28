/**
 * useDocsLight — sub real-time alla lista doc NEBULA accessibili dall'utente
 * (owner OR writer OR reader OR team-wide OR mentioned), payload minimale.
 *
 * Pensato per fonti di mention/picker dove serve solo `{ id, title, icon }`
 * e non il body del doc. Mantiene 5 query parallele (stesso schema di
 * NebulaDocsHomeView) ma deduplica per id e ritorna un Ref<DocLight[]>
 * ordinato per updatedAt desc.
 */
import { ref, onUnmounted, watch } from 'vue'
import {
  collection, query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'

export interface DocLight {
  id: string
  title: string
  icon?: string  // emoji o glyph (Material Icon name)
  updatedAtMs: number
}

function toMs(raw: unknown): number {
  if (!raw) return 0
  const r = raw as { seconds?: number; toMillis?: () => number }
  if (typeof r.toMillis === 'function') return r.toMillis()
  if (typeof r.seconds === 'number') return r.seconds * 1000
  return 0
}

export function useDocsLight() {
  const docs = ref<DocLight[]>([])
  const loading = ref(true)
  const bySource = new Map<string, Map<string, DocLight>>()
  let unsubs: Unsubscribe[] = []

  function rebuild() {
    const merged = new Map<string, DocLight>()
    for (const src of bySource.values()) {
      for (const [id, d] of src) {
        const ex = merged.get(id)
        if (!ex || d.updatedAtMs > ex.updatedAtMs) merged.set(id, d)
      }
    }
    docs.value = [...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  }

  function unsubscribeAll() {
    unsubs.forEach(u => u())
    unsubs = []
    bySource.clear()
  }

  function subscribe() {
    unsubscribeAll()
    const email = auth.currentUser?.email?.toLowerCase().trim()
    if (!email) { docs.value = []; loading.value = false; return }
    loading.value = true

    const sources: Array<[string, ReturnType<typeof query>]> = [
      ['owner',     query(collection(db, 'nebulaDocs'), where('acl.owners',  'array-contains', email), orderBy('updatedAt', 'desc'))],
      ['writer',    query(collection(db, 'nebulaDocs'), where('acl.writers', 'array-contains', email), orderBy('updatedAt', 'desc'))],
      ['reader',    query(collection(db, 'nebulaDocs'), where('acl.readers', 'array-contains', email), orderBy('updatedAt', 'desc'))],
      ['team',      query(collection(db, 'nebulaDocs'), where('acl.visibility', '==', 'team'),         orderBy('updatedAt', 'desc'))],
      ['mentioned', query(collection(db, 'nebulaDocs'), where('refs.users',  'array-contains', email), orderBy('updatedAt', 'desc'))],
    ]
    let firstFire = 0
    unsubs = sources.map(([key, q]) => onSnapshot(
      q,
      (snap) => {
        const m = new Map<string, DocLight>()
        snap.docs.forEach((d) => {
          if ((d.data() as { archived?: boolean }).archived) return
          const data = d.data() as { title?: string; icon?: string; updatedAt?: unknown }
          m.set(d.id, {
            id: d.id,
            title: data.title || '(senza titolo)',
            icon: data.icon,
            updatedAtMs: toMs(data.updatedAt),
          })
        })
        bySource.set(key, m)
        rebuild()
        firstFire++
        if (firstFire >= sources.length) loading.value = false
      },
      (err) => {
        // permission-denied su un sub è normale (utente non ha accesso a doc che
        // matchano per qualche edge). Loggalo solo se non lo è.
        const e = err as { code?: string }
        if (e?.code !== 'permission-denied') console.warn('[useDocsLight]', key, e?.code)
        firstFire++
        if (firstFire >= sources.length) loading.value = false
      },
    ))
  }

  // Re-subscribe quando cambia l'utente auth (logout/login).
  const stopAuthWatch = watch(
    () => auth.currentUser?.email,
    () => subscribe(),
    { immediate: true },
  )

  onUnmounted(() => {
    stopAuthWatch()
    unsubscribeAll()
  })

  return { docs, loading }
}
