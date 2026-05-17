import { getToken, onMessage } from 'firebase/messaging'
import { doc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db, auth, messagingPromise } from '../../firebase'

// Token non aggiornati da più di 7 giorni vengono considerati stale e rimossi:
// proteggono dalla duplicazione delle notifiche dovuta a installazioni precedenti
// della PWA (es. iOS dopo reinstall) che lasciano subscription orfane.
const STALE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000

// ⚠️ VAPID key — da generare in Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// Finché non viene inserita, FCM token non viene richiesto ma le notifiche in-app (foreground browser) continuano a funzionare.
const VAPID_KEY = 'BKHZvBeWzYyHEmWNFUd-CNfmRtEUbb8xYchwnvQNif47LR6xE0hpJHXgoZRHP47wzMIiarFXNYqzuFh-PtXTDhY'

let foregroundUnsub: (() => void) | null = null

export function useNotifications() {
  async function requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false

    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') return false

    // Registra FCM token se VAPID configurato e ambiente supportato
    if (VAPID_KEY) {
      try {
        const messaging = await messagingPromise
        if (!messaging) return true

        // Aspetta il service worker registrato da vite-plugin-pwa, poi punta FCM su quello dedicato.
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        })

        if (token && auth.currentUser?.email) {
          const email = auth.currentUser.email.toLowerCase().trim()
          const teamRef = doc(db, 'team', email)

          // Prune token stale + registra/aggiorna il token corrente in un'unica scrittura
          const tokenUpdate: Record<string, unknown> = {
            [token]: serverTimestamp(),
          }
          try {
            const snap = await getDoc(teamRef)
            const existing = (snap.data()?.fcmTokens ?? {}) as Record<string, { toMillis?: () => number } | null>
            const now = Date.now()
            for (const [tk, ts] of Object.entries(existing)) {
              if (tk === token) continue
              const ms = ts?.toMillis?.() ?? 0
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
      const messaging = await messagingPromise
      if (!messaging) return
      foregroundUnsub = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || 'PULSAR'
        const body  = payload.notification?.body  || payload.data?.body  || ''
        notify(title, body)
      })
    } catch (e) {
      console.warn('[useNotifications] foreground setup error', e)
    }
  }

  return { requestPermission, notify, setupForegroundMessages }
}
