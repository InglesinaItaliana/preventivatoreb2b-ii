<script setup lang="ts">
/**
 * DocOutline — indice stile Notion sul lato sinistro.
 *
 * Una sequenza leggera di barre (una per heading, larghezza per livello) fissa a
 * sinistra. All'hover compare una card contestuale con i titoli delle sezioni,
 * cliccabile e scorribile; scompare quando il mouse esce. Su touch: tap sulle
 * barre per aprire/chiudere, tap fuori per chiudere.
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { OutlineItem } from '../../../../composables/nebula/useDocOutline'

defineProps<{ headings: OutlineItem[]; active?: number }>()
const emit = defineEmits<{ (e: 'select', pos: number): void }>()

const wrap = ref<HTMLElement | null>(null)
const open = ref(false)   // stato per touch (desktop usa :hover CSS)

// Ancoraggio al bordo sinistro dell'AREA DOCUMENTO (.nd-root), non al viewport:
// così l'indice non finisce sopra la sidebar di SIDERA. Misurato in JS e
// aggiornato su resize + ResizeObserver (copre anche il collapse della sidebar).
const leftPx = ref(8)
let rootEl: HTMLElement | null = null
let ro: ResizeObserver | null = null

function reposition() {
  if (!rootEl) return
  leftPx.value = Math.round(rootEl.getBoundingClientRect().left + 8)
}
function attach() {
  rootEl = (wrap.value?.closest('.nd-root') as HTMLElement | null) ?? null
  reposition()
  if (rootEl && 'ResizeObserver' in window && !ro) {
    ro = new ResizeObserver(() => reposition())
    ro.observe(rootEl)
  }
}

function pick(pos: number) {
  emit('select', pos)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (open.value && wrap.value && !wrap.value.contains(e.target as Node)) {
    open.value = false
  }
}

watch(wrap, (el) => { if (el) nextTick(attach) })
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('resize', reposition)
  if (wrap.value) attach()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', reposition)
  ro?.disconnect()
})
</script>

<template>
  <div
    v-if="headings.length >= 2"
    ref="wrap"
    class="ndo-wrap"
    :class="{ 'is-open': open }"
    :style="{ left: leftPx + 'px' }"
  >
    <!-- Barre: indicatore leggero della struttura -->
    <div class="ndo-rail" aria-hidden="true" @click="open = !open">
      <span
        v-for="(h, i) in headings"
        :key="i"
        class="ndo-bar"
        :class="[`ndo-bar-l${h.level}`, { 'is-active': i === active }]"
      />
    </div>

    <!-- Card contestuale (hover desktop / tap mobile) -->
    <nav class="ndo-card" aria-label="Indice del documento">
      <button
        v-for="(h, i) in headings"
        :key="i"
        type="button"
        class="ndo-item"
        :class="[`ndo-lvl-${h.level}`, { 'is-active': i === active }]"
        @click="pick(h.pos)"
      >
        {{ h.text }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
.ndo-wrap {
  position: fixed;
  /* left impostato in JS = bordo sinistro dell'area documento (.nd-root),
     così non si sovrappone alla sidebar di SIDERA. */
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  align-items: flex-start;
}

/* ── Barre ────────────────────────────────────────────────────────────── */
.ndo-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 6px;
  cursor: pointer;
  max-height: 60vh;
  overflow: hidden;
}
.ndo-bar {
  height: 2px;
  border-radius: 999px;
  background: var(--md-sys-color-outline, #B9B1A1);
  opacity: 0.45;
  transition: opacity 0.15s, background 0.15s, height 0.15s, width 0.15s;
}
/* Giustificate a SINISTRA: tutte allineate al bordo sx, larghezza per livello. */
.ndo-bar-l1 { width: 18px; }
.ndo-bar-l2 { width: 13px; }
.ndo-bar-l3 { width: 9px; }
.ndo-wrap:hover .ndo-bar,
.ndo-wrap.is-open .ndo-bar { opacity: 0.7; }
/* Sezione corrente: barra evidenziata (accent + più marcata). */
.ndo-bar.is-active {
  background: var(--md-sys-color-primary, #C46030);
  opacity: 1;
  height: 3px;
}

/* ── Card contestuale ─────────────────────────────────────────────────── */
.ndo-card {
  /* ASSOLUTA: così il box hoverabile del wrap = solo le barre (l'hover non
     parte passando sul testo). Adiacente al rail (left:100%) → nessun gap, e
     restando figlia DOM del wrap mantiene attivo :hover mentre ci sei sopra. */
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 200px;
  max-width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px;
  background: var(--md-sys-color-surface-container-lowest, #FFFDF9);
  border: 1px solid var(--md-sys-color-outline-variant, #E3DAC9);
  border-radius: 12px;
  box-shadow: var(--md-sys-elevation-level-2, 0 6px 24px rgba(0, 0, 0, 0.14));
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.ndo-wrap:hover .ndo-card,
.ndo-wrap.is-open .ndo-card {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.ndo-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px 9px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--md-sys-color-on-surface, #1A1917);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ndo-item:hover { background: var(--md-sys-color-surface-container, #F5EDDF); }
.ndo-item.is-active {
  color: var(--md-sys-color-primary, #C46030);
  font-weight: 600;
  background: color-mix(in srgb, var(--md-sys-color-primary, #C46030) 8%, transparent);
}
.ndo-lvl-1 { font-weight: 600; }
.ndo-lvl-2 { padding-left: 22px; color: var(--md-sys-color-on-surface-variant, #5d574f); }
.ndo-lvl-3 { padding-left: 36px; font-size: 12.5px; color: var(--md-sys-color-on-surface-variant, #6A6560); }

/* Sotto ~880px la barra laterale si sovrapporrebbe al contenuto centrato
   (padding < larghezza barra) → nascondi su tablet/mobile. */
@media (max-width: 880px) {
  .ndo-wrap { display: none; }
}
</style>
