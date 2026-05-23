/* PULSAR — Service Worker per push FCM in background.
   Registrato automaticamente dall'SDK Firebase Messaging.

   Scope: '/' (condiviso tra tutte le PWA della suite). Il SW deve quindi
   distinguere la PWA destinataria via payload.data.scope e dedupare i messaggi
   già ricevuti: iOS WebPush può rilanciare un push pendente al wakeup del SW
   quando l'utente apre un'altra PWA del dominio, causando "ri-arrivo" di
   notifiche già viste su PULSAR mentre si apre CEPHEID. */

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyA_OLy75pTT5XAzeyjh9e89ff1psPQAPFQ',
  authDomain: 'preventivatoreb2b-ii.firebaseapp.com',
  projectId: 'preventivatoreb2b-ii',
  storageBucket: 'preventivatoreb2b-ii.firebasestorage.app',
  messagingSenderId: '574612046430',
  appId: '1:574612046430:web:e9fc63b07f76c8a43aeacf',
})

const messaging = firebase.messaging()

// ---------- Dedup persistente (IndexedDB) ----------
// TTL 5 min: copre il caso "iOS rilancia il push al wakeup del SW" senza
// crescere indefinitamente. La cleanup avviene best-effort ad ogni lookup.
const DEDUP_DB = 'pulsar-push-dedup'
const DEDUP_STORE = 'seen'
const DEDUP_TTL_MS = 5 * 60 * 1000

function openDedupDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEDUP_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DEDUP_STORE)) {
        db.createObjectStore(DEDUP_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function alreadySeen(id) {
  if (!id) return false
  try {
    const db = await openDedupDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(DEDUP_STORE, 'readwrite')
      const store = tx.objectStore(DEDUP_STORE)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const row = getReq.result
        const now = Date.now()
        if (row && now - row.ts < DEDUP_TTL_MS) {
          resolve(true)
          return
        }
        store.put({ id, ts: now })
        // Cleanup opportunistico delle entry scadute
        const cur = store.openCursor()
        cur.onsuccess = () => {
          const c = cur.result
          if (!c) return
          if (now - c.value.ts >= DEDUP_TTL_MS) c.delete()
          c.continue()
        }
        resolve(false)
      }
      getReq.onerror = () => resolve(false)
    })
  } catch (_) {
    return false
  }
}

// ---------- Background message handler ----------
messaging.onBackgroundMessage(async (payload) => {
  const title = payload.notification?.title || payload.data?.title || 'PULSAR'
  const body  = payload.notification?.body  || payload.data?.body  || ''
  const chatId = payload.data?.chatId
  const messageId = payload.data?.messageId
  const scope = payload.data?.scope || 'pulsar'
  const targetUrl = payload.data?.url || (chatId ? `/pulsar/chat/${chatId}` : '/pulsar')

  // 1) Dedup: se questo messageId è già stato gestito, non rimostrare nulla.
  //    Senza questo, su iOS la stessa push può essere ri-consegnata quando il SW
  //    viene risvegliato dall'apertura di un'altra PWA del dominio.
  if (await alreadySeen(messageId)) return

  // 2) Suppression: se un client della PWA di destinazione (scope) è visibile,
  //    NON mostrare la notifica — il foreground handler / la UI hanno già il messaggio.
  //    Se invece l'utente è su un'altra PWA (es. push PULSAR mentre è su CEPHEID),
  //    mostriamo la notifica: è il segnale che riporta l'utente sull'app giusta.
  try {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleOnTargetScope = wins.some((w) => {
      if (w.visibilityState !== 'visible') return false
      try {
        return new URL(w.url).pathname.startsWith(`/${scope}`)
      } catch (_) {
        return w.url.includes(`/${scope}`)
      }
    })
    if (visibleOnTargetScope) return
  } catch (_) { /* fallback: mostra comunque */ }

  self.registration.showNotification(title, {
    body,
    icon: '/icons/pulsar-192.png',
    badge: '/icons/pulsar-192.png',
    // tag basato su messageId quando disponibile → idempotenza visiva:
    // se per qualche motivo arriva due volte, il browser sovrascrive invece di accumulare
    tag: messageId || (chatId ? `chat-${chatId}` : 'pulsar'),
    data: { chatId, messageId, scope, url: targetUrl },
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/pulsar'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && 'focus' in w) return w.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
