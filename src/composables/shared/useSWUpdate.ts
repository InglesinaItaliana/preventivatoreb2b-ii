import { ref, onMounted } from 'vue'
import { Workbox } from 'workbox-window'

// Workbox-window registrato direttamente (non useRegisterSW del plugin) per filtrare
// gli eventi 'waiting' con isExternal=true: PULSAR/CEPHEID registrano anche
// /firebase-messaging-sw.js con scope '/' tramite useNotifications, e workbox li
// vede come SW "esterni in waiting" → triggerava un loop di banner.
// Vedi docs/ATLAS.md sez. 10 (PWA update banner).
//
// Circuit breaker (2026-05-23): alcuni device hanno installato versioni vecchie del SW
// che NON gestiscono il messaggio SKIP_WAITING. Per loro, dopo "Aggiorna":
//   1. messageSkipWaiting() non viene processato dal SW vecchio
//   2. controllerchange non scatta → fallback setTimeout(reload) reload brutale
//   3. Dopo reload il SW vecchio è ancora active → 'waiting' ri-emesso → banner in loop
// Il circuit breaker rileva: "ho appena cliccato Aggiorna E mi ritrovo un waiting
// subito dopo il reload" → in quel caso forza un unregister + hard reload (una sola
// volta), spezzando il loop. Negli update riusciti il flag scade naturalmente e non
// scatta nulla — quindi non impatta POPS o gli altri scope quando l'update va a buon fine.
const ATTEMPT_KEY = 'sw-update-attempt-ts'
const ATTEMPT_WINDOW_MS = 30_000
const BREAKER_USED_KEY = 'sw-update-breaker-done'
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000  // 10 min: dopo questo, il breaker può riarmarsi

export function useSWUpdate() {
  const needRefresh = ref(false)
  let wb: Workbox | null = null

  onMounted(() => {
    if (!('serviceWorker' in navigator)) return

    // Reset breaker se cooldown passato: in normali update riusciti il flag non c'è;
    // serve solo per device che abbiamo già "salvato" una volta, dopo 10 min può riarmarsi.
    try {
      const breakerTs = Number(localStorage.getItem(BREAKER_USED_KEY) || 0)
      if (breakerTs && Date.now() - breakerTs > BREAKER_COOLDOWN_MS) {
        localStorage.removeItem(BREAKER_USED_KEY)
      }
    } catch { /* ignore */ }

    wb = new Workbox('/sw.js', { scope: '/' })

    wb.addEventListener('waiting', async (event: any) => {
      if (event.isExternal) return
      if (event.sw?.scriptURL && !event.sw.scriptURL.endsWith('/sw.js')) return

      // Loop detection: se un waiting riappare entro 30s da un tentativo "Aggiorna",
      // il SW vecchio non sta passando il testimone → unregister + hard reload.
      try {
        const lastAttempt = Number(localStorage.getItem(ATTEMPT_KEY) || 0)
        const breakerUsed = !!localStorage.getItem(BREAKER_USED_KEY)
        const inLoop = lastAttempt && Date.now() - lastAttempt < ATTEMPT_WINDOW_MS
        if (inLoop && !breakerUsed) {
          localStorage.setItem(BREAKER_USED_KEY, String(Date.now()))
          localStorage.removeItem(ATTEMPT_KEY)
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(
            regs
              .filter((r) => {
                const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || ''
                return url.endsWith('/sw.js')
              })
              .map((r) => r.unregister().catch(() => false))
          )
          window.location.reload()
          return
        }
      } catch { /* ignore — flusso normale */ }

      needRefresh.value = true
    })

    wb.register({ immediate: true })
  })

  async function applyUpdate() {
    try { localStorage.setItem(ATTEMPT_KEY, String(Date.now())) } catch { /* ignore */ }

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
