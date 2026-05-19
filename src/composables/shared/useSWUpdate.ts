import { useRegisterSW } from 'virtual:pwa-register/vue'

// Banner-driven update flow: vite-plugin-pwa è configurato con registerType: 'prompt',
// quindi il nuovo SW resta in 'waiting' finché l'utente non clicca "Aggiorna" nel banner.
// Vedi UpdateBanner.vue e docs/ATLAS.md (sezione "PWA update banner").
export function useSWUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
  })

  async function applyUpdate() {
    await updateServiceWorker(true)
  }

  function dismiss() {
    needRefresh.value = false
  }

  return { needRefresh, applyUpdate, dismiss }
}
