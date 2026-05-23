/* CEPHEID — Service Worker FCM dedicato, scope '/cepheid/'.
   Registrato da useNotifications('cepheid'). Al momento CEPHEID non emette push
   (nessuna Cloud Function attiva sul modulo), ma la registration scope-isolata è
   ciò che separa i token FCM CEPHEID da quelli PULSAR: senza questo SW, condividerebbero
   il SW root '/' e quindi lo stesso token, riportando il leak cross-PWA. */

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

messaging.onBackgroundMessage(async (payload) => {
  const title = payload.notification?.title || payload.data?.title || 'CEPHEID'
  const body  = payload.notification?.body  || payload.data?.body  || ''
  const targetUrl = payload.data?.url || '/cepheid'
  const messageId = payload.data?.messageId

  try {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleCepheid = wins.some((w) => {
      if (w.visibilityState !== 'visible') return false
      try { return new URL(w.url).pathname.startsWith('/cepheid') } catch (_) { return w.url.includes('/cepheid') }
    })
    if (visibleCepheid) return
  } catch (_) { /* fallback: mostra comunque */ }

  self.registration.showNotification(title, {
    body,
    icon: '/icons/cepheid-192.png',
    badge: '/icons/cepheid-192.png',
    tag: messageId || 'cepheid',
    data: { messageId, url: targetUrl },
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/cepheid'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && 'focus' in w) return w.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
