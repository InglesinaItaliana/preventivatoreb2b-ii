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

// Edges collegati al vertice attivo, normalizzati con il vertice attivo come "from".
// Gradient applicato direttamente al base edge (no overlay): fade-to-NE color
// a piena opacità, replica del pattern HubView + SideraLayout sidebar.
const activeEdges = computed(() => {
  return EDGES
    .filter(([a, b]) => isEdgeActive(a, b))
    .map(([a, b], i) => {
      const fromScope = a === props.activeScope ? a : b
      const toScope   = a === props.activeScope ? b : a
      return {
        id: `sls-edge-grad-${props.activeScope}-${i}`,
        from: MODULES[fromScope],
        to:   MODULES[toScope],
        fromScope,
        toScope,
      }
    })
})

// Stroke per il base edge [a, b]: gradient se adiacente al vertice attivo, altrimenti NE.
function edgeStrokeFor(a: ScopeKey, b: ScopeKey): string {
  if (a !== props.activeScope && b !== props.activeScope) return COLOR_OFF_EDGE
  const ae = activeEdges.value.find(e =>
    (e.fromScope === a && e.toScope === b) || (e.fromScope === b && e.toScope === a)
  )
  return ae ? `url(#${ae.id})` : COLOR_OFF_EDGE
}

// Width per il base edge: edge attivi più spessi per visibilità.
function edgeWidthFor(a: ScopeKey, b: ScopeKey): number {
  return (a === props.activeScope || b === props.activeScope) ? 3.0 : 1.2
}

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
      <!-- filterUnits=userSpaceOnUse: la regione del filtro è in coord viewBox.
           Le % default sono relative al bbox dell'elemento, che ha altezza 0 per
           le linee orizzontali (NEBULA-CEPHEID, NOVA-PULSAR) → il blur veniva
           clippato e le linee sparivano. -->
      <filter id="sls-gf-sm" filterUnits="userSpaceOnUse" x="0" y="0" width="680" height="480">
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
      <!-- Gradient per ogni edge attivo: 0%/75% color modulo, 100% COLOR_OFF_EDGE.
           Replica del pattern HubView + sidebar: fade-to-NE color a piena opacità.
           Il gradient è applicato direttamente al base edge (non a un overlay)
           così che l'edge resti visibile end-to-end anche sugli orizzontali. -->
      <linearGradient
        v-for="e in activeEdges" :key="e.id"
        :id="e.id"
        gradientUnits="userSpaceOnUse"
        :x1="e.from.x" :y1="e.from.y" :x2="e.to.x" :y2="e.to.y"
      >
        <stop offset="0%"   :stop-color="active.color"/>
        <stop offset="75%"  :stop-color="active.color"/>
        <stop offset="100%" :stop-color="COLOR_OFF_EDGE"/>
      </linearGradient>
    </defs>

    <!-- Edges base: stroke gradient se adiacente al vertice attivo, NE altrimenti.
         Replica HubView + sidebar: niente layer "glow" sovrapposto. -->
    <line
      v-for="([a, b], i) in EDGES" :key="`e-${i}`"
      :x1="MODULES[a].x" :y1="MODULES[a].y"
      :x2="MODULES[b].x" :y2="MODULES[b].y"
      :stroke="edgeStrokeFor(a, b)" :stroke-width="edgeWidthFor(a, b)"
      stroke-linecap="round"
      shape-rendering="geometricPrecision"
    />

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

.sl-halo-lg { opacity: 0; fill-opacity: 0.35; transition: opacity 1s ease; }
.sl-halo-lg.on { opacity: 0.7; }

.sl-halo-md { opacity: 0; fill-opacity: 0.6; transition: opacity 0.8s ease; }
.sl-halo-md.on { opacity: 0.85; }

.sl-vertex { transition: fill 0.5s ease, stroke 0.5s ease; }
</style>
