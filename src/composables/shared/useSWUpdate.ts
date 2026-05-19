import { ref, onMounted } from 'vue'
import { Workbox } from 'workbox-window'

// Workbox-window registrato direttamente (non useRegisterSW del plugin) per filtrare
// gli eventi 'waiting' con isExternal=true: PULSAR/CEPHEID registrano anche
// /firebase-messaging-sw.js con scope '/' tramite useNotifications, e workbox li
// vede come SW "esterni in waiting" → triggerava un loop di banner.
// Vedi docs/ATLAS.md sez. 10 (PWA update banner).
export function useSWUpdate() {
  const needRefresh = ref(false)
  let wb: Workbox | null = null

  onMounted(() => {
    if (!('serviceWorker' in navigator)) return

    wb = new Workbox('/sw.js', { scope: '/' })

    wb.addEventListener('waiting', (event: any) => {
      if (event.isExternal) return
      if (event.sw?.scriptURL && !event.sw.scriptURL.endsWith('/sw.js')) return
      needRefresh.value = true
    })

    wb.register({ immediate: true })
  })

  async function applyUpdate() {
    if (!wb) {
      window.location.reload()
      return
    }
    // Hard-reload fallback: se 'controlling' non scatena entro 2s ricarichiamo noi.
    const fallback = window.setTimeout(() => window.location.reload(), 2000)
    wb.addEventListener('controlling', () => {
      window.clearTimeout(fallback)
      window.location.reload()
    })
    try {
      wb.messageSkipWaiting()
    } catch {
      window.clearTimeout(fallback)
      window.location.reload()
    }
  }

  function dismiss() {
    needRefresh.value = false
  }

  return { needRefresh, applyUpdate, dismiss }
}
