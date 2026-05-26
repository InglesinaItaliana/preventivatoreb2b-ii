import { ref, onMounted } from 'vue'
import { Workbox } from 'workbox-window'

// Workbox-window registrato direttamente (non useRegisterSW del plugin) per filtrare
// gli eventi 'waiting' con isExternal=true: PULSAR/CEPHEID registrano anche
// /firebase-messaging-sw.js con scope '/' tramite useNotifications, e workbox li
// vede come SW "esterni in waiting" → triggerava un loop di banner.
// Vedi docs/ATLAS.md sez. 10 (PWA update banner).
//
// Strategia applyUpdate (2026-05-26 — fix loop banner mobile NEBULA):
// Invece di affidarci a SKIP_WAITING + 'controlling' (che falliva su PWA installate
// con scope diverso dal root, es. NEBULA /nebula/ vs sw scope /), facciamo SEMPRE
// unregister della registration /sw.js prima di reload. Il browser scaricherà
// di nuovo l'app shell servita dal nuovo bundle e re-installerà il SW fresco.
// Sostituisce il vecchio circuit-breaker (riarmabile dopo 10 min) che richiedeva
// un secondo click "Aggiorna" per uscire dal loop.
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
    // Unregister sempre — pattern "hard refresh" che funziona anche quando
    // skipWaiting/clientsClaim non riescono (PWA standalone con scope diverso).
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        regs
          .filter((r) => {
            const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || ''
            return url.endsWith('/sw.js')
          })
          .map((r) => r.unregister().catch(() => false))
      )
    } catch { /* ignore */ }
    window.location.reload()
  }

  function dismiss() {
    needRefresh.value = false
  }

  return { needRefresh, applyUpdate, dismiss }
}
