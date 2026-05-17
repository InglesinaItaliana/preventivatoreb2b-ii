/* PULSAR — Service Worker per push FCM in background.
   Registrato automaticamente dall'SDK Firebase Messaging. */

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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'PULSAR'
  const body  = payload.notification?.body  || payload.data?.body  || ''
  const chatId = payload.data?.chatId

  self.registration.showNotification(title, {
    body,
    icon: '/icons/pulsar-192.png',
    badge: '/icons/pulsar-192.png',
    tag:  chatId ? `chat-${chatId}` : 'pulsar',
    data: { chatId, url: chatId ? `/pulsar/chat/${chatId}` : '/pulsar' },
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
