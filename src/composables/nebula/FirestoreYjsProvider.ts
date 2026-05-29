/**
 * FirestoreYjsProvider — provider Yjs<->Firestore per NEBULA-DOCS (Fase 6).
 *
 * Sincronizza un Y.Doc tramite Firestore senza WebSocket/Cloud Run:
 *   - nebulaDocs/{docId}.ydocState        snapshot compattato (re-baseline)
 *   - nebulaDocs/{docId}/yupdates/{id}    log delta append-only (CRDT)
 *   - nebulaDocs/{docId}/awareness/{cid}  cursori live ephemeral (overwrite)
 *
 * Correttezza:
 *  - Echo-suppression a 2 livelli: (1) gli update remoti si applicano con
 *    origin REMOTE e l'handler locale scrive su Firestore SOLO per origin !=
 *    REMOTE; (2) il listener yupdates ignora i delta col PROPRIO clientID.
 *  - Gli update Yjs sono commutativi+idempotenti: ordine e doppia consegna
 *    sono sicuri. Per questo Firestore (no ordering stretto, no exactly-once)
 *    è un transport valido.
 *  - Il listener sul doc PADRE ri-applica `ydocState` a OGNI cambio: dopo una
 *    compaction (che fonde i delta in ydocState e li cancella), un client
 *    perderebbe quei delta se leggesse solo i `yupdates` superstiti. Riapplicare
 *    lo snapshot colma il buco (idempotente per chi è già aggiornato).
 *
 * Niente Vue qui (TS puro) → testabile in isolamento. Il lifecycle Vue è in
 * useCollabDoc.ts. Vedi docs/NEBULA-DOCS.md §6 e il piano §6.1.
 */
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, setDoc, deleteDoc,
  serverTimestamp, Bytes, type Firestore, type Unsubscribe,
} from 'firebase/firestore'
import * as Y from 'yjs'
import {
  Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates,
} from 'y-protocols/awareness'

/** Origin sentinella per gli update applicati dal remoto (non ri-broadcast). */
const REMOTE_ORIGIN = Symbol('nebula-firestore-remote')

const FLUSH_MS = 350        // batch update locali → 1 write Firestore
const AWARENESS_MS = 300    // throttle broadcast cursore
const AWARENESS_FRESH_MS = 30_000

export interface ProviderUser {
  email: string
  displayName: string
  color: string
}

export type ProviderStatus = 'connecting' | 'synced'

export class FirestoreYjsProvider {
  readonly awareness: Awareness
  synced = false

  private unsubs: Unsubscribe[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null
  private buffer: Uint8Array[] = []
  private parentSeen = false
  private updatesSeen = false
  private destroyed = false

  private readonly db: Firestore
  private readonly docId: string
  private readonly ydoc: Y.Doc
  private readonly user: ProviderUser
  private readonly onStatus?: (s: ProviderStatus) => void

  private readonly yupdatesCol
  private readonly parentRef
  private readonly awarenessRef

  constructor(
    db: Firestore,
    docId: string,
    ydoc: Y.Doc,
    awareness: Awareness,
    user: ProviderUser,
    onStatus?: (s: ProviderStatus) => void,
  ) {
    this.db = db
    this.docId = docId
    this.ydoc = ydoc
    this.user = user
    this.onStatus = onStatus
    // L'Awareness è creato esternamente (useCollabDoc) così l'editor può
    // montarsi con CollaborationCaret prima che il provider si connetta.
    this.awareness = awareness
    this.awareness.setLocalStateField('user', {
      name: user.displayName,
      color: user.color,
      email: user.email,
    })

    this.parentRef = doc(db, 'nebulaDocs', docId)
    this.yupdatesCol = collection(db, 'nebulaDocs', docId, 'yupdates')
    this.awarenessRef = doc(db, 'nebulaDocs', docId, 'awareness', String(ydoc.clientID))

    this.ydoc.on('update', this.onLocalUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.onUnload)

    this.subscribeParent()
    this.subscribeUpdates()
    this.subscribeAwareness()
  }

  // ── Subscriptions ──────────────────────────────────────────────────────
  private subscribeParent() {
    this.unsubs.push(onSnapshot(this.parentRef, (snap) => {
      const data = snap.data()
      const state = data?.ydocState
      if (state) {
        // Riapplica lo snapshot (load iniziale + re-baseline post-compaction).
        Y.applyUpdate(this.ydoc, this.toU8(state), REMOTE_ORIGIN)
      }
      this.parentSeen = true
      this.maybeSynced()
    }, (err) => console.warn('[FirestoreYjsProvider] parent sub err:', err)))
  }

  private subscribeUpdates() {
    const q = query(this.yupdatesCol, orderBy('createdAt', 'asc'))
    this.unsubs.push(onSnapshot(q, (snap) => {
      snap.docChanges().forEach((ch) => {
        // Solo nuovi delta. 'removed' = compaction GC → NON disapplicare.
        if (ch.type !== 'added') return
        const d = ch.doc.data()
        if (d.clientId === this.ydoc.clientID) return  // echo del proprio write
        if (!d.data) return
        Y.applyUpdate(this.ydoc, this.toU8(d.data), REMOTE_ORIGIN)
      })
      this.updatesSeen = true
      this.maybeSynced()
    }, (err) => console.warn('[FirestoreYjsProvider] updates sub err:', err)))
  }

  private subscribeAwareness() {
    const col = collection(this.db, 'nebulaDocs', this.docId, 'awareness')
    this.unsubs.push(onSnapshot(col, (snap) => {
      const now = Date.now()
      snap.docs.forEach((d) => {
        const data = d.data()
        if (Number(data.clientId) === this.ydoc.clientID) return  // self
        const ts = data.updatedAt?.toMillis?.() ?? now
        if (now - ts > AWARENESS_FRESH_MS) return                 // stale
        if (!data.state) return
        applyAwarenessUpdate(this.awareness, this.toU8(data.state), REMOTE_ORIGIN)
      })
    }, (err) => console.warn('[FirestoreYjsProvider] awareness sub err:', err)))
  }

  private maybeSynced() {
    if (!this.synced && this.parentSeen && this.updatesSeen) {
      this.synced = true
      this.onStatus?.('synced')
    }
  }

  // ── Local → Firestore ────────────────────────────────────────────────────
  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return     // non ri-broadcast i remoti
    this.buffer.push(update)
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => { void this.flush() }, FLUSH_MS)
  }

  private async flush() {
    this.flushTimer = null
    if (this.destroyed || this.buffer.length === 0) return
    const merged = Y.mergeUpdates(this.buffer)
    this.buffer = []
    try {
      await addDoc(this.yupdatesCol, {
        data: Bytes.fromUint8Array(merged),
        seq: Date.now(),
        author: this.user.email,
        clientId: this.ydoc.clientID,
        origin: 'client',
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      console.warn('[FirestoreYjsProvider] flush fail (re-buffer):', e)
      this.buffer.unshift(merged)   // ritenta al prossimo update
    }
  }

  // ── Awareness (cursori) → Firestore ───────────────────────────────────────
  private onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    // Broadcast SOLO i cambi che includono il nostro client e che NON vengono
    // dal remoto (evita loop).
    if (origin === REMOTE_ORIGIN) return
    const self = this.ydoc.clientID
    const touchesSelf = [...changes.added, ...changes.updated, ...changes.removed].includes(self)
    if (!touchesSelf) return
    if (this.awarenessTimer) return
    this.awarenessTimer = setTimeout(() => { void this.broadcastAwareness() }, AWARENESS_MS)
  }

  private async broadcastAwareness() {
    this.awarenessTimer = null
    if (this.destroyed) return
    try {
      const update = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])
      await setDoc(this.awarenessRef, {
        clientId: this.ydoc.clientID,
        author: this.user.email,
        displayName: this.user.displayName,
        color: this.user.color,
        state: Bytes.fromUint8Array(update),
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      console.warn('[FirestoreYjsProvider] awareness broadcast fail:', e)
    }
  }

  private onUnload = () => { void deleteDoc(this.awarenessRef).catch(() => {}) }

  // ── Teardown ───────────────────────────────────────────────────────────
  async destroy() {
    this.destroyed = true
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null }
    if (this.awarenessTimer) { clearTimeout(this.awarenessTimer); this.awarenessTimer = null }
    await this.flush()  // svuota gli ultimi edit pending
    this.ydoc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.onUnload)
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    // L'Awareness è di proprietà di useCollabDoc: rimuoviamo solo il nostro
    // stato locale (gli altri client ci vedranno sparire), non la distruggiamo.
    removeAwarenessStates(this.awareness, [this.ydoc.clientID], 'local')
    await deleteDoc(this.awarenessRef).catch(() => {})
  }

  private toU8(v: unknown): Uint8Array {
    if (v instanceof Uint8Array) return v
    const b = v as { toUint8Array?: () => Uint8Array }
    return typeof b.toUint8Array === 'function' ? b.toUint8Array() : new Uint8Array(0)
  }
}
