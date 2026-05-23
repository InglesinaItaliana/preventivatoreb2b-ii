import { doc, setDoc, getDoc, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore'
import type { Messaging } from 'firebase/messaging'
import { db, auth, app } from '../../firebase'

// Lazy-load del modulo firebase/messaging per non includerlo nel chunk preloaded di POPS.
// Caricato solo quando setupForegroundMessages() o requestPermission() vengono invocati
// (cioè dai layout PWA: PulsarLayout, CepheidLayout, SideraLayout). Vedi POLARIS azione 4.
type MessagingModule = typeof import('firebase/messaging')
let messagingModulePromise: Promise<MessagingModule> | null = null
function loadMessagingModule(): Promise<MessagingModule> {
  if (!messagingModulePromise) {
    messagingModulePromise = import('firebase/messaging')
  }
  return messagingModulePromise
}
async function getMessagingInstance(): Promise<Messaging | null> {
  try {
    const mod = await loadMessagingModule()
    return (await mod.isSupported()) ? mod.getMessaging(app) : null
  } catch {
    return null
  }
}

// Token non aggiornati da più di 7 giorni vengono considerati stale e rimossi:
// proteggono dalla duplicazione delle notifiche dovuta a installazioni precedenti
// della PWA (es. iOS dopo reinstall) che lasciano subscription orfane.
const STALE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000

// ⚠️ VAPID key — Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = 'BKHZvBeWzYyHEmWNFUd-CNfmRtEUbb8xYchwnvQNif47LR6xE0hpJHXgoZRHP47wzMIiarFXNYqzuFh-PtXTDhY'

export type NotificationScope = 'pulsar' | 'cepheid' | 'nebula' | 'sidera'

// Schema entry token in team/{email}.fcmTokens:
//   - Nuovo: { ts: Timestamp, scope: NotificationScope, ua?: string }
//   - Legacy: Timestamp nudo (interpretato come scope 'pulsar' dalla Cloud Function)
type TokenEntryNew = { ts: Timestamp; scope: NotificationScope; ua?: string }
type TokenEntryLegacy = Timestamp
type TokenEntry = TokenEntryNew | TokenEntryLegacy | null | undefined

function extractTimestamp(val: TokenEntry): Timestamp | null {
  if (!val) return null
  if (val instanceof Timestamp) return val
  if (typeof val === 'object' && 'ts' in val && val.ts instanceof Timestamp) return val.ts
  // Fallback: oggetto serializzato senza prototipo Timestamp (es. rilettura raw)
  const maybe = val as { toMillis?: () => number; ts?: { toMillis?: () => number } }
  if (typeof maybe.toMillis === 'function') return val as unknown as Timestamp
  if (maybe.ts && typeof maybe.ts.toMillis === 'function') return maybe.ts as unknown as Timestamp
  return null
}

let foregroundUnsub: (() => void) | null = null

export function useNotifications(scope: NotificationScope) {
  async function requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false

    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') return false

    if (VAPID_KEY) {
      try {
        const messaging = await getMessagingInstance()
        if (!messaging) return true

        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })

        const mod = await loadMessagingModule()
        const token = await mod.getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        })

        if (token && auth.currentUser?.email) {
          const email = auth.currentUser.email.toLowerCase().trim()
          const teamRef = doc(db, 'team', email)

          const ua = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined
          const tokenUpdate: Record<string, unknown> = {
            [token]: { ts: serverTimestamp(), scope, ...(ua ? { ua } : {}) },
          }

          try {
            const snap = await getDoc(teamRef)
            const existing = (snap.data()?.fcmTokens ?? {}) as Record<string, TokenEntry>
            const now = Date.now()
            for (const [tk, val] of Object.entries(existing)) {
              if (tk === token) continue
              const tsObj = extractTimestamp(val)
              const ms = tsObj?.toMillis?.() ?? 0
              if (now - ms > STALE_TOKEN_MS) {
                tokenUpdate[tk] = deleteField()
              }
            }
          } catch {
            // Se non riesco a leggere, registro solo il nuovo token: niente prune ma niente regressione
          }

          await setDoc(teamRef, { fcmTokens: tokenUpdate }, { merge: true })
        }
      } catch (e) {
        console.warn('[useNotifications] FCM token error', e)
      }
    }

    return true
  }

  function notify(title: string, body: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification(title, {
      body,
      icon: '/icons/pulsar-192.png',
      badge: '/icons/pulsar-192.png',
    })
  }

  async function setupForegroundMessages() {
    if (foregroundUnsub) return
    try {
      const messaging = await getMessagingInstance()
      if (!messaging) return
      const mod = await loadMessagingModule()
      foregroundUnsub = mod.onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || 'PULSAR'
        const body  = payload.notification?.body  || payload.data?.body  || ''
        const url   = payload.data?.url
        const pushScope = payload.data?.scope

        // Filtro scope: se la push è destinata a una PWA diversa da quella attiva
        // (es. push 'pulsar' ricevuta mentre l'utente è in CEPHEID), il foreground
        // handler NON deve mostrare niente — è il SW background che decide se mostrare
        // una notifica di sistema con la dedup IndexedDB. Senza questo filtro, l'utente
        // su CEPHEID vede una notifica HTML5 con icona PULSAR del messaggio che aveva
        // già ricevuto.
        if (pushScope && pushScope !== scope) return

        // Suppressione: utente già sulla URL target della push → niente notifica duplicata
        if (url && typeof window !== 'undefined' && window.location.pathname === url) {
          return
        }

        notify(title, body)
      })
    } catch (e) {
      console.warn('[useNotifications] foreground setup error', e)
    }
  }

  return { requestPermission, notify, setupForegroundMessages }
}
