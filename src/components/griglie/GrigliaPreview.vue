<script setup lang="ts">
import { computed } from 'vue';
import type { Progetto, SegmentoBarra } from '../../logic/griglie/progetto';
import { BARRA } from '../../logic/griglie/materiali';
import { coloreFinitura, tinta } from '../../logic/griglie/finiture';

const props = defineProps<{
  progetto: Progetto;
  finitura: string;
  evidenzia?: string | null;   // famiglia da accendere: 'V' | 'O' | 'A' | 'B'
}>();

const W = computed(() => props.progetto.config.larghezza);
const H = computed(() => props.progetto.config.altezza);
const lato = computed(() => props.progetto.latoTelaio);

// Il pannello prende il colore della finitura scelta. Le barre sono dello stesso
// materiale, quindi dello stesso colore: le distinguiamo dal telaio con una tinta
// più scura, non con un colore diverso — sarebbe una bugia visiva.
const colore = computed(() => coloreFinitura(props.finitura));
const coloreBordo = computed(() => tinta(colore.value, -0.45));
const coloreRivetto = computed(() => tinta(colore.value, -0.55));
const tinte: Record<string, number> = { O: -0.14, V: -0.26, A: -0.14, B: -0.26 };

const EVIDENZA = '#FBBF24'; // amber: solo per l'hover, mai come colore del pezzo

/**
 * Una barra è un segmento ingrossato a 18 mm: il poligono dei suoi quattro
 * spigoli. Vale identico per le ortogonali e per le diagonali — l'anteprima non
 * ha bisogno di sapere che stile sta guardando.
 */
function poligono(b: SegmentoBarra): string {
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (BARRA.larghezza / 2);
  const ny = (dx / len) * (BARRA.larghezza / 2);
  return [
    `${b.x1 + nx},${b.y1 + ny}`,
    `${b.x2 + nx},${b.y2 + ny}`,
    `${b.x2 - nx},${b.y2 - ny}`,
    `${b.x1 - nx},${b.y1 - ny}`,
  ].join(' ');
}

const riempimento = (b: SegmentoBarra) =>
  props.evidenzia === b.famiglia ? EVIDENZA : tinta(colore.value, tinte[b.famiglia] ?? -0.2);

const telaio = computed(() => {
  const w = W.value, h = H.value, l = lato.value;
  return `M0,0 H${w} V${h} H0 Z M${l},${l} H${w - l} V${h - l} H${l} Z`;
});

const margine = computed(() => Math.max(W.value, H.value) * 0.04);
const viewBox = computed(() =>
  `${-margine.value} ${-margine.value} ${W.value + 2 * margine.value} ${H.value + 2 * margine.value}`
);
const quotaFont = computed(() => Math.max(W.value, H.value) * 0.028);
const tratto = computed(() => Math.max(W.value, H.value) * 0.0018);
</script>

<template>
  <svg :viewBox="viewBox" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
    <!-- Luce interna (o l'intero pannello, se non c'è il telaio) -->
    <rect
      :x="lato" :y="lato"
      :width="Math.max(0, W - 2 * lato)" :height="Math.max(0, H - 2 * lato)"
      class="fill-slate-50"
    />

    <!-- Le barre, in ordine: la seconda famiglia finisce sopra la prima, come nel
         pannello vero (barre sovrapposte, rivettate agli incroci). -->
    <polygon
      v-for="(b, i) in progetto.disegno.barre" :key="i"
      :points="poligono(b)"
      :fill="riempimento(b)"
      :stroke="coloreBordo" :stroke-width="tratto"
      class="transition-[fill] duration-150"
    />

    <!-- Rivetti: uno per incrocio -->
    <circle
      v-for="(r, i) in progetto.disegno.rivetti" :key="`r${i}`"
      :cx="r.x" :cy="r.y" :r="BARRA.larghezza * 0.17"
      :fill="coloreRivetto"
    />

    <!-- Telaio a U, sopra tutto: le teste delle barre spariscono nel canale.
         Senza bordo perimetrale, qui non si disegna nulla. -->
    <template v-if="lato > 0">
      <path :d="telaio" fill-rule="evenodd" :fill="colore" />
      <path :d="telaio" fill-rule="evenodd" fill="none" :stroke="coloreBordo" :stroke-width="tratto * 1.5" />
    </template>

    <!-- Quote d'ingombro -->
    <text :x="W / 2" :y="-margine * 0.25" text-anchor="middle" :font-size="quotaFont" class="fill-slate-400 font-bold">
      {{ (W / 10).toFixed(1) }} cm
    </text>
    <text
      :x="-margine * 0.25" :y="H / 2" text-anchor="middle" :font-size="quotaFont"
      :transform="`rotate(-90 ${-margine * 0.25} ${H / 2})`"
      class="fill-slate-400 font-bold"
    >{{ (H / 10).toFixed(1) }} cm</text>
  </svg>
</template>
