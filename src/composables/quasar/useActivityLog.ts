import { ref, onUnmounted } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * Registro attività QUASAR (collection `activityLog`).
 * Gli eventi sono scritti SOLO dalle Cloud Functions (vedi src/functions/index.ts);
 * qui li leggiamo in tempo reale. Vedi docs/QUADRANTI.md sibling + plan.
 */

export type ActivityTone = 'gold' | 'neutral' | 'red'

export interface ActivityEvent {
  id: string
  system: 'SIDERA' | 'POPS'
  sourceType: string
  sourceId: string
  projectId: string | null
  eventType: string
  verb: string
  objectLabel: string
  tone: ActivityTone
  icon: string
  actorEmail: string | null
  actorUid: string | null
  actorName: string | null
  ts: Date
}

function toDate(raw: unknown): Date {
  if (!raw) return new Date()                 // serverTimestamp pendente (ottimistico) → ora
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  return typeof r.seconds === 'number' ? new Date(r.seconds * 1000) : new Date()
}

export function useActivityLog(max = 100) {
  const events = ref<ActivityEvent[]>([])
  const loading = ref(true)

  const q = query(collection(db, 'activityLog'), orderBy('ts', 'desc'), limit(max))

  const unsubscribe = onSnapshot(q, (snap) => {
    events.value = snap.docs.map((d) => {
      const data = d.data()
      return {
        id:          d.id,
        system:      (data.system as 'SIDERA' | 'POPS') ?? 'SIDERA',
        sourceType:  data.sourceType ?? '',
        sourceId:    data.sourceId ?? '',
        projectId:   data.projectId ?? null,
        eventType:   data.eventType ?? '',
        verb:        data.verb ?? '',
        objectLabel: data.objectLabel ?? '',
        tone:        (data.tone as ActivityTone) ?? 'neutral',
        icon:        data.icon ?? 'circle',
        actorEmail:  data.actorEmail ?? null,
        actorUid:    data.actorUid ?? null,
        actorName:   data.actorName ?? null,
        ts:          toDate(data.ts),
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useActivityLog]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  return { events, loading }
}
