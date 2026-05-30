import { ref, computed, onUnmounted, watch, type Ref } from 'vue'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
  type Unsubscribe, type Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * useDocPresence — presence Firestore-based per editor NEBULA-DOCS.
 *
 * Scrive il proprio record in `nebulaDocs/{docId}/presence/{userEmail}` con
 * heartbeat ogni 15s. Subscribe agli altri record per renderizzare la
 * lista degli utenti attivi (chi sta editando il doc).
 *
 * Stati esposti:
 *   - peers: array di altri utenti con lastSeenAt entro PRESENCE_FRESH_MS
 *     (default 30s — disconnessioni brutali appaiono offline dopo questo)
 *   - mySnapshot: il proprio record (per debug / display "stai editando")
 *
 * Cleanup: su unmount cancella il proprio record (presence "instant offline").
 * presenceCleanup Cloud Function (F3-C4) eliminerà stale records (es. utenti
 * che chiudono tab senza unmount handler che parta).
 *
 * Vedi docs/NEBULA-DOCS.md §5 (presence v1) e §3.3 (sub-collezione).
 */

const HEARTBEAT_MS = 15_000        // scrive lastSeenAt ogni 15s
const PRESENCE_FRESH_MS = 30_000   // peer considerato attivo se visto entro 30s

export interface PresenceRecord {
  userId: string                   // = email lowercase
  displayName: string
  email: string
  category: string                 // per StarAvatar (forma stella)
  hueIndex?: number                // per StarAvatar (colore stabile)
  lastSeenAt: Timestamp | null     // pending → null finché serverTimestamp non risolve
  activeBlock: string | null       // posizione ProseMirror corrente, opzionale
  cursorColor: string              // hex deterministico da userId
}

/**
 * Cursor color deterministico a partire dalla email. 8 toni equispaziati
 * sull'hue wheel, no chevron-style verde fluo: tutti M3-ish (sat ~50%, lum 55%).
 */
const CURSOR_PALETTE = [
  '#C46030', // NEBULA orange
  '#3AAF98', // PULSAR teal
  '#D4A020', // CEPHEID gold
  '#98C0D0', // QUASAR blue
  '#8FAB35', // NOVA green
  '#B06842', // MAGNETAR rust
  '#7A5CA8', // viola
  '#5B7F2E', // verde scuro
]
export function cursorColorFor(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0
  return CURSOR_PALETTE[Math.abs(h) % CURSOR_PALETTE.length] ?? '#C46030'
}

export function useDocPresence(
  docId: Ref<string | null>,
  me: Ref<{ email: string; uid: string; name?: string; category?: string; hueIndex?: number } | null>,
) {
  const allRecords = ref<PresenceRecord[]>([])
  const mySnapshot = ref<PresenceRecord | null>(null)
  let unsubscribe: Unsubscribe | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let activePresenceRef: ReturnType<typeof doc> | null = null

  function myEmailKey(): string {
    return (me.value?.email ?? '').toLowerCase().trim()
  }

  async function writePresence(extra: Partial<PresenceRecord> = {}) {
    if (!docId.value || !me.value || !myEmailKey()) return
    if (!activePresenceRef) return
    try {
      const payload: Record<string, unknown> = {
        userId:      myEmailKey(),
        email:       myEmailKey(),
        displayName: me.value.name ?? me.value.email,
        category:    me.value.category ?? 'amministrazione',
        cursorColor: cursorColorFor(myEmailKey()),
        lastSeenAt:  serverTimestamp(),
        activeBlock: null,
        ...extra,
      }
      if (typeof me.value.hueIndex === 'number') payload.hueIndex = me.value.hueIndex
      await setDoc(activePresenceRef, payload, { merge: true })
    } catch (err) {
      console.warn('[useDocPresence] write fail:', err)
    }
  }

  function stop() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    if (activePresenceRef) {
      // Best-effort delete su unmount (presence "instant offline")
      deleteDoc(activePresenceRef).catch(() => {})
      activePresenceRef = null
    }
  }

  function start() {
    stop()
    if (!docId.value || !myEmailKey()) return
    activePresenceRef = doc(db, 'nebulaDocs', docId.value, 'presence', myEmailKey())

    // 1° write immediato + heartbeat
    void writePresence()
    heartbeatTimer = setInterval(() => { void writePresence() }, HEARTBEAT_MS)

    // Subscribe altri (e me stesso, lo filtreremo)
    const presenceCol = collection(db, 'nebulaDocs', docId.value, 'presence')
    unsubscribe = onSnapshot(presenceCol, (snap) => {
      const list: PresenceRecord[] = []
      snap.docs.forEach(d => {
        const data = d.data() as Partial<PresenceRecord>
        list.push({
          userId:      data.userId ?? d.id,
          email:       data.email ?? d.id,
          displayName: data.displayName ?? d.id,
          category:    data.category ?? 'amministrazione',
          hueIndex:    typeof data.hueIndex === 'number' ? data.hueIndex : undefined,
          lastSeenAt:  (data.lastSeenAt as Timestamp) ?? null,
          activeBlock: data.activeBlock ?? null,
          cursorColor: data.cursorColor ?? cursorColorFor(d.id),
        })
      })
      allRecords.value = list
      mySnapshot.value = list.find(r => r.userId === myEmailKey()) ?? null
    }, (err) => {
      console.warn('[useDocPresence] subscribe fail:', err)
    })
  }

  function isFresh(ts: Timestamp | null): boolean {
    if (!ts) return true   // pending serverTimestamp = considera fresh
    const ms = ts.toMillis()
    return Date.now() - ms < PRESENCE_FRESH_MS
  }

  /** Peer = altri utenti attivi (esclude me). */
  const peers = computed<PresenceRecord[]>(() =>
    allRecords.value
      .filter(r => r.userId !== myEmailKey())
      .filter(r => isFresh(r.lastSeenAt))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  )

  /** Tutti gli attivi inclusi me (per debug / display "1 utente attivo"). */
  const activeCount = computed(() =>
    allRecords.value.filter(r => isFresh(r.lastSeenAt)).length
  )

  // Restart subscribe quando docId cambia (es. navigazione tra doc)
  watch(docId, () => start(), { immediate: true })

  // Pagina nascosta (tab in background) → ferma heartbeat (browser tab freeze
  // li blocca comunque, ma esplicito è meglio). Visibile → riattiva.
  function onVisibilityChange() {
    if (document.hidden) {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    } else if (!heartbeatTimer && docId.value) {
      void writePresence()
      heartbeatTimer = setInterval(() => { void writePresence() }, HEARTBEAT_MS)
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  // beforeunload: best-effort delete del proprio record (chiusura tab)
  function onBeforeUnload() {
    if (activePresenceRef) {
      // sync delete impossibile, ma deleteDoc è async; in pratica spesso non parte.
      // presenceCleanup Cloud Function (F3-C4) si occupa di ripulire i record stale.
      deleteDoc(activePresenceRef).catch(() => {})
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload)
  }

  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
    stop()
  })

  return {
    peers,
    mySnapshot,
    activeCount,
    /** Aggiorna il proprio activeBlock (per future editor decorations). */
    updateActiveBlock: (block: string | null) => writePresence({ activeBlock: block }),
  }
}
