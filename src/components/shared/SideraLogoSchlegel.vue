<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

// Diagramma Schlegel dell'ottaedro proiettato — stesse coordinate di SideraHubView.vue.
// Riusato come "logo dinamico" per le login screen di ogni modulo (vertice attivo evidenziato).
// Vedi POLARIS.md azione 3 per la decisione di design.

export type ScopeKey = 'quasar' | 'nebula' | 'cepheid' | 'pulsar' | 'nova' | 'magnetar'

interface Props {
  activeScope: ScopeKey
  /** Dimensione del logo in px. Default 280. Il viewBox interno è 680x480 quindi proporzioni 1.42:1. */
  size?: number
}
const props = withDefaults(defineProps<Props>(), { size: 280 })

interface Vertex { x: number; y: number; r: number; color: string }
const MODULES: Record<ScopeKey, Vertex> = {
  quasar:   { x: 340, y: 68,  r: 14, color: '#98C0D0' },
  nebula:   { x: 155, y: 400, r: 14, color: '#C46030' },
  cepheid:  { x: 525, y: 400, r: 14, color: '#D4A020' },
  pulsar:   { x: 405, y: 252, r: 12, color: '#3AAF98' },
  nova:     { x: 275, y: 252, r: 12, color: '#8FAB35' },
  magnetar: { x: 340, y: 364, r: 12, color: '#B06842' },
}

const EDGES: [ScopeKey, ScopeKey][] = [
  ['quasar', 'nebula'], ['nebula', 'cepheid'], ['cepheid', 'quasar'],
  ['nova', 'pulsar'], ['pulsar', 'magnetar'], ['magnetar', 'nova'],
  ['quasar', 'pulsar'], ['quasar', 'nova'],
  ['nebula', 'nova'], ['nebula', 'magnetar'],
  ['cepheid', 'pulsar'], ['cepheid', 'magnetar'],
]

const COLOR_OFF_VERTEX = '#243648'
const COLOR_OFF_STROKE = '#364F66'
const COLOR_OFF_EDGE   = '#2A3F52'

const active = computed(() => MODULES[props.activeScope])
const moduleEntries = computed(() => Object.entries(MODULES) as [ScopeKey, Vertex][])
const isEdgeActive = (a: ScopeKey, b: ScopeKey) => a === props.activeScope || b === props.activeScope

// Edges collegati al vertice attivo, normalizzati con il vertice attivo come "from" (opaco)
// e l'altro vertice come "to" (trasparente). Replica il pattern del logo PULSAR/CEPHEID originale.
const activeEdges = computed(() => {
  return EDGES
    .filter(([a, b]) => isEdgeActive(a, b))
    .map(([a, b], i) => {
      const from = a === props.activeScope ? MODULES[a] : MODULES[b]
      const to   = a === props.activeScope ? MODULES[b] : MODULES[a]
      return { id: `sls-edge-grad-${props.activeScope}-${i}`, from, to }
    })
})

// Stagger animation: SVG fade-in, poi il vertice attivo "si accende"
const svgMounted = ref(false)
const activeOn = ref(false)
onMounted(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => { svgMounted.value = true }))
  setTimeout(() => { activeOn.value = true }, 500)
})

const widthPx  = computed(() => props.size)
const heightPx = computed(() => Math.round(props.size * 480 / 680))
</script>

<template>
  <svg
    class="sl-schlegel"
    :class="{ on: svgMounted }"
    :width="widthPx"
    :height="heightPx"
    viewBox="0 0 680 480"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <filter id="sls-gf-sm" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="4.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="sls-gf-md" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="9" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="sls-gf-lg" x="-180%" y="-180%" width="460%" height="460%">
        <feGaussianBlur stdDeviation="18" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <!-- Gradient dinamico per ogni edge attivo: opaco al vertice attivo, trasparente all'altro -->
      <linearGradient
        v-for="e in activeEdges" :key="e.id"
        :id="e.id"
        gradientUnits="userSpaceOnUse"
        :x1="e.from.x" :y1="e.from.y" :x2="e.to.x" :y2="e.to.y"
      >
        <!-- 100% opacity 0.45 (non 0.15) per evitare che edges lunghi (es. NEBULA-CEPHEID)
             sembrino interrotti vicino al vertice opposto. Vedi SideraLayout.vue per
             la stessa correzione applicata al logo della sidebar. -->
        <stop offset="0%"   :stop-color="active.color" stop-opacity="0.95"/>
        <stop offset="75%"  :stop-color="active.color" stop-opacity="0.8"/>
        <stop offset="100%" :stop-color="active.color" stop-opacity="0.45"/>
      </linearGradient>
    </defs>

    <!-- Edges base (tenui) -->
    <line
      v-for="([a, b], i) in EDGES" :key="`e-${i}`"
      :x1="MODULES[a].x" :y1="MODULES[a].y"
      :x2="MODULES[b].x" :y2="MODULES[b].y"
      :stroke="COLOR_OFF_EDGE"
      stroke-width="1.2"
    />

    <!-- Edge glow (solo edges collegati al vertice attivo, con gradient sfumato verso l'esterno) -->
    <g class="sl-edge-glow" :class="{ on: activeOn }">
      <line
        v-for="e in activeEdges" :key="`eg-${e.id}`"
        :x1="e.from.x" :y1="e.from.y"
        :x2="e.to.x"   :y2="e.to.y"
        :stroke="`url(#${e.id})`"
        stroke-width="3.5"
        stroke-linecap="round"
        :filter="'url(#sls-gf-sm)'"
      />
    </g>

    <!-- Halo grande (solo vertice attivo) -->
    <circle
      class="sl-halo-lg" :class="{ on: activeOn }"
      :cx="active.x" :cy="active.y" r="48"
      :fill="active.color"
      :filter="'url(#sls-gf-lg)'"
    />
    <!-- Halo medio (solo vertice attivo) -->
    <circle
      class="sl-halo-md" :class="{ on: activeOn }"
      :cx="active.x" :cy="active.y" r="28"
      :fill="active.color"
      :filter="'url(#sls-gf-md)'"
    />

    <!-- Vertici tutti -->
    <circle
      v-for="[key, v] in moduleEntries" :key="`v-${key}`"
      :cx="v.x" :cy="v.y"
      :r="v.r"
      :fill="key === props.activeScope ? v.color : COLOR_OFF_VERTEX"
      :stroke="key === props.activeScope ? v.color : COLOR_OFF_STROKE"
      stroke-width="0.8"
      :filter="'url(#sls-gf-sm)'"
      class="sl-vertex"
    />
  </svg>
</template>

<style scoped>
.sl-schlegel {
  display: block;
  margin: 0 auto;
  opacity: 0;
  transition: opacity 0.9s ease;
}
.sl-schlegel.on { opacity: 1; }

.sl-edge-glow { opacity: 0; transition: opacity 0.8s ease; }
.sl-edge-glow.on { opacity: 0.55; }

.sl-halo-lg { opacity: 0; fill-opacity: 0.35; transition: opacity 1s ease; }
.sl-halo-lg.on { opacity: 0.7; }

.sl-halo-md { opacity: 0; fill-opacity: 0.6; transition: opacity 0.8s ease; }
.sl-halo-md.on { opacity: 0.85; }

.sl-vertex { transition: fill 0.5s ease, stroke 0.5s ease; }
</style>
