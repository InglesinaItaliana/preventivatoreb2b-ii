import { ref, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * Auto-hide-on-scroll-down / show-on-scroll-up per header sticky.
 *
 * Pattern noto delle app moderne (iOS Safari toolbar, Twitter, Material You):
 * - Header inizialmente visibile.
 * - Scroll down → header sparisce (translateY(-100%)).
 * - Scroll up (anche solo qualche pixel) → header riappare.
 * - Vicino al top (scrollTop < REVEAL_TOP_PX) l'header è sempre mostrato.
 *
 * Usage:
 *   const scrollEl = ref<HTMLElement | null>(null)
 *   const { hidden } = useAutoHideHeader(scrollEl)
 *   // template: <div class="qd" ref="scrollEl"> + <MdPageHeader :hidden="hidden">
 */
export function useAutoHideHeader(scrollEl: Ref<HTMLElement | null>) {
  const hidden = ref(false)
  let lastY = 0
  let frame = 0
  const THRESHOLD_PX = 6        // ignora micro-movimenti
  const REVEAL_TOP_PX = 40      // sopra questa soglia l'header è sempre visibile

  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const el = scrollEl.value
      if (!el) return
      const y = el.scrollTop
      const dy = y - lastY
      if (y < REVEAL_TOP_PX) {
        hidden.value = false
      } else if (Math.abs(dy) > THRESHOLD_PX) {
        hidden.value = dy > 0
      }
      lastY = y
    })
  }

  const attach = (el: HTMLElement | null) => {
    if (!el) return
    lastY = el.scrollTop
    el.addEventListener('scroll', onScroll, { passive: true })
  }
  const detach = (el: HTMLElement | null) => {
    if (!el) return
    el.removeEventListener('scroll', onScroll)
  }

  onMounted(() => attach(scrollEl.value))
  // Se il ref viene assegnato dopo onMounted (raro, ma sicuro coprire), riattacchiamo
  watch(scrollEl, (newEl, oldEl) => {
    detach(oldEl ?? null)
    attach(newEl ?? null)
  })
  onBeforeUnmount(() => detach(scrollEl.value))

  return { hidden }
}
