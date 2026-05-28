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
// Marker sessione: dopo applyUpdate il banner viene soppresso per ~10s
// per assorbire il fragment di tempo in cui il nuovo SW passa da
// installed → activated. Senza, in alcuni edge case workbox-window
// riemette 'waiting' sul reload e il banner riappare immediatamente.
const SUPPRESS_KEY = 'sw-update-suppressed-until'
const SUPPRESS_MS = 10_000

function isSuppressed(): boolean {
  try {
    const until = Number(sessionStorage.getItem(SUPPRESS_KEY) || '0')
    return Date.now() < until
  } catch { return false }
}

export function useSWUpdate() {
  const needRefresh = ref(false)
  let wb: Workbox | null = null

  onMounted(() => {
    if (!('serviceWorker' in navigator)) return

    wb = new Workbox('/sw.js', { scope: '/' })

    wb.addEventListener('waiting', (event: any) => {
      if (event.isExternal) return
      if (event.sw?.scriptURL && !event.sw.scriptURL.endsWith('/sw.js')) return
      if (isSuppressed()) return  // appena applicato un update, dai tempo al SW di attivarsi
      needRefresh.value = true
    })

    wb.register({ immediate: true })
  })

  async function applyUpdate() {
    // Soppressione banner per 10s — copre il caso in cui workbox-window
    // riemette 'waiting' subito dopo il reload (skipWaiting:true nel
    // build dovrebbe già evitarlo, ma è cintura+bretelle).
    try { sessionStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_MS)) } catch { /* ignore */ }

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

    // Svuota le caches HTTP del SW così il prossimo fetch di /sw.js arriva
    // fresco dal server invece che dalla cache stale.
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    } catch { /* ignore */ }

    window.location.reload()
  }

  function dismiss() {
    needRefresh.value = false
  }

  return { needRefresh, applyUpdate, dismiss }
}
