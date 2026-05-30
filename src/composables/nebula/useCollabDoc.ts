/**
 * useCollabDoc — lifecycle della collaborazione real-time per un documento
 * NEBULA-DOCS (Fase 6). Da usare in un componente KEYED-by-docId (rimonta per
 * doc): crea Y.Doc + Awareness in modo sincrono (così l'editor può montarsi
 * subito con Collaboration/CollaborationCaret), poi in onMounted legge il
 * kill-switch, garantisce la migrazione (initYDoc) e connette il provider.
 *
 * Flusso:
 *  1. sync: ydoc + awareness (l'editor li usa subito, ma resta read-only)
 *  2. onMounted:
 *     - kill-switch core/nebula.collabEnabled === false → status 'disabled'
 *       (l'editor mostra la proiezione `content`, sola lettura)
 *     - se può scrivere → initYDoc({docId}) (migrazione idempotente)
 *     - crea FirestoreYjsProvider → onStatus('synced') sblocca l'editor
 *  3. onBeforeUnmount: provider.destroy() + awareness.destroy() + ydoc.destroy()
 *
 * `peers` deriva dall'Awareness (sostituisce la presence Firestore di Fase 3).
 * Vedi docs/NEBULA-DOCS.md §6 e il piano §6.2/§6.8.
 */
import { ref, shallowRef, watch, onBeforeUnmount, type Ref } from 'vue'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { doc as fsDoc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { FirestoreYjsProvider, type ProviderStatus } from './FirestoreYjsProvider'
import { cursorColorFor, type PresenceRecord } from './useDocPresence'

export type CollabStatus = ProviderStatus | 'disabled' | 'connecting'

interface CollabUser {
  email: string
  uid: string
  name?: string
  category?: string
  hueIndex?: number
}

const initYDocCallable = httpsCallable<{ docId: string }, { docId: string; initialized: boolean }>(
  functions, 'initYDoc',
)

export function useCollabDoc(
  docId: string,
  me: Ref<CollabUser | null>,
  canWrite: Ref<boolean>,
  docLoaded: Ref<boolean>,
) {
  // Sincroni: l'editor li riceve al momento della creazione.
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)

  const status = ref<CollabStatus>('connecting')
  const collabEnabled = ref(true)
  const peers = ref<PresenceRecord[]>([])
  const provider = shallowRef<FirestoreYjsProvider | null>(null)

  function refreshPeers() {
    const states = awareness.getStates()
    const list: PresenceRecord[] = []
    states.forEach((state, clientId) => {
      if (clientId === ydoc.clientID) return // self
      const u = (state as { user?: { name?: string; color?: string; email?: string } }).user
      if (!u?.email) return
      list.push({
        userId: u.email,
        email: u.email,
        displayName: u.name ?? u.email,
        category: '',
        lastSeenAt: null,
        activeBlock: null,
        cursorColor: u.color ?? cursorColorFor(u.email),
      })
    })
    peers.value = list.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
  awareness.on('change', refreshPeers)

  let started = false
  async function start() {
    if (started || !me.value?.email || !docLoaded.value) return
    started = true

    // Kill-switch globale (freno d'emergenza, no redeploy).
    try {
      const snap = await getDoc(fsDoc(db, 'core', 'nebula'))
      if (snap.exists() && snap.data()?.collabEnabled === false) {
        collabEnabled.value = false
        status.value = 'disabled'
        return // editor resterà read-only sulla proiezione content
      }
    } catch { /* assente = abilitato (default) */ }

    // Migrazione idempotente del Y.Doc (solo chi può scrivere; i reader
    // leggono ydocState già inizializzato da un writer, o cadono sul fallback).
    if (canWrite.value) {
      try { await initYDocCallable({ docId }) }
      catch (e) { console.warn('[useCollabDoc] initYDoc fail:', e) }
    }

    const color = cursorColorFor(me.value.email)
    provider.value = new FirestoreYjsProvider(
      db, docId, ydoc, awareness,
      { email: me.value.email, displayName: me.value.name ?? me.value.email, color },
      (s) => { status.value = s },
    )
  }

  // Avvia quando utente + doc (ACL/canWrite) sono noti.
  watch(
    [() => me.value?.email, docLoaded],
    () => { void start() },
    { immediate: true },
  )

  onBeforeUnmount(async () => {
    awareness.off('change', refreshPeers)
    try { await provider.value?.destroy() } catch { /* best effort */ }
    awareness.destroy()
    ydoc.destroy()
  })

  return { ydoc, awareness, status, collabEnabled, peers, provider }
}
