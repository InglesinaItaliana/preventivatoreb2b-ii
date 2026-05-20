<script setup lang="ts">
/**
 * SVG single-vertex brand icon — mirror del PWA icon (scripts/<scope>-icon.svg).
 *
 * Per ogni scope, i 4 raggi puntano ai vertici realmente collegati nel diagramma
 * Schlegel ottaedro (stesse coordinate di SideraLogoSchlegel/SideraLayout/HubView).
 * Trasformazione k=1.21 attorno al vertice attivo, identica a scripts/*-icon.svg
 * → coerenza visiva PWA home-screen ↔ top bar header.
 *
 * Il colore viene da currentColor (eredita da --md-sys-color-primary dello scope).
 */
import { computed } from 'vue'
import type { ScopeId } from '../../views/sidera/scopeConfig'

const props = defineProps<{
  scope: ScopeId
  size?: number
}>()

// Vertici Schlegel — stesse coord di SideraLogoSchlegel (viewBox 680x480)
const VERTICES: Record<Exclude<ScopeId, 'sidera'>, { x: number; y: number }> = {
  quasar:   { x: 340, y: 68  },
  nebula:   { x: 155, y: 400 },
  cepheid:  { x: 525, y: 400 },
  pulsar:   { x: 405, y: 252 },
  nova:     { x: 275, y: 252 },
  magnetar: { x: 340, y: 364 },
}

const EDGES: [keyof typeof VERTICES, keyof typeof VERTICES][] = [
  ['quasar', 'nebula'], ['nebula', 'cepheid'], ['cepheid', 'quasar'],
  ['nova', 'pulsar'],   ['pulsar', 'magnetar'], ['magnetar', 'nova'],
  ['quasar', 'pulsar'], ['quasar', 'nova'],
  ['nebula', 'nova'],   ['nebula', 'magnetar'],
  ['cepheid', 'pulsar'],['cepheid', 'magnetar'],
]

// Trasformazione: k=1.21 attorno al vertice attivo, scalato in viewBox 32.
// Identica a scripts/*-icon.svg (1024 viewBox) divisa per 32. La factor finale
// è (k / 32) = (1.21 / 32) = 0.0378125 per ottenere coord in 32-viewBox direttamente.
const K = 1.21
const VIEWBOX_SCALE = K / 32

// 4 endpoint dei raggi, calcolati una volta per scope
const rays = computed(() => {
  if (props.scope === 'sidera') return []
  const center = VERTICES[props.scope as keyof typeof VERTICES]
  return EDGES
    .filter(([a, b]) => a === props.scope || b === props.scope)
    .map(([a, b]) => {
      const other = a === props.scope ? b : a
      const n = VERTICES[other]
      return {
        x2: (n.x - center.x) * VIEWBOX_SCALE + 16,
        y2: (n.y - center.y) * VIEWBOX_SCALE + 16,
      }
    })
})
</script>

<template>
  <svg
    class="sbi-icon"
    :width="size ?? 32"
    :height="size ?? 32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Alone esterno -->
    <circle cx="16" cy="16" r="8" fill="currentColor" opacity="0.10" />
    <!-- 4 raggi verso i vertici realmente collegati nel Schlegel -->
    <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.85"
       shape-rendering="geometricPrecision">
      <line
        v-for="(r, i) in rays" :key="i"
        x1="16" y1="16" :x2="r.x2" :y2="r.y2"
      />
    </g>
    <!-- Halo medio + nucleo (vertice) -->
    <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28" />
    <circle cx="16" cy="16" r="2.9" fill="currentColor" />
  </svg>
</template>

<style scoped>
.sbi-icon {
  flex-shrink: 0;
  color: var(--md-sys-color-primary);
}
</style>
