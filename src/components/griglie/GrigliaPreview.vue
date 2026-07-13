<script setup lang="ts">
import { computed } from 'vue';
import type { Progetto } from '../../logic/griglie/progetto';
import { BARRA, PROFILO_U, FONDO_CANALE } from '../../logic/griglie/materiali';

const props = defineProps<{
  progetto: Progetto;
  evidenzia?: 'verticali' | 'orizzontali' | null;
}>();

const W = computed(() => props.progetto.config.larghezza);
const H = computed(() => props.progetto.config.altezza);

// Le barre partono dal fondo del canale (+ gioco): le loro teste restano NASCOSTE
// sotto il telaio, esattamente come nel pannello vero.
const testa = computed(() => FONDO_CANALE + props.progetto.config.gioco);
const mezza = BARRA.larghezza / 2;

// Telaio come banda: rettangolo esterno con il buco della luce (fill-rule evenodd).
// Disegnato DOPO le barre, così ne copre le teste — è l'ordine di montaggio reale.
const telaio = computed(() => {
  const w = W.value, h = H.value, l = PROFILO_U.lato;
  return `M0,0 H${w} V${h} H0 Z M${l},${l} H${w - l} V${h - l} H${l} Z`;
});

const margine = computed(() => Math.max(W.value, H.value) * 0.04);
const viewBox = computed(() =>
  `${-margine.value} ${-margine.value} ${W.value + 2 * margine.value} ${H.value + 2 * margine.value}`
);

const quotaFont = computed(() => Math.max(W.value, H.value) * 0.028);
</script>

<template>
  <svg :viewBox="viewBox" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
    <!-- Luce interna -->
    <rect
      :x="PROFILO_U.lato" :y="PROFILO_U.lato"
      :width="Math.max(0, W - 2 * PROFILO_U.lato)" :height="Math.max(0, H - 2 * PROFILO_U.lato)"
      class="fill-slate-50"
    />

    <!-- Barre orizzontali -->
    <rect
      v-for="(y, i) in progetto.assiOrizzontali" :key="`h${i}`"
      :x="testa" :y="y - mezza"
      :width="Math.max(0, W - 2 * testa)" :height="BARRA.larghezza"
      class="transition-colors"
      :class="evidenzia === 'orizzontali' ? 'fill-amber-400' : (evidenzia === 'verticali' ? 'fill-slate-200' : 'fill-slate-300')"
    />

    <!-- Barre verticali: sopra le orizzontali, come nel pannello (barre sovrapposte) -->
    <rect
      v-for="(x, i) in progetto.assiVerticali" :key="`v${i}`"
      :x="x - mezza" :y="testa"
      :width="BARRA.larghezza" :height="Math.max(0, H - 2 * testa)"
      class="transition-colors"
      :class="evidenzia === 'verticali' ? 'fill-amber-400' : (evidenzia === 'orizzontali' ? 'fill-slate-300' : 'fill-slate-400')"
    />

    <!-- Rivetti: uno per incrocio -->
    <template v-for="(x, i) in progetto.assiVerticali" :key="`r${i}`">
      <circle
        v-for="(y, j) in progetto.assiOrizzontali" :key="`r${i}-${j}`"
        :cx="x" :cy="y" :r="BARRA.larghezza * 0.17"
        class="fill-slate-600"
      />
    </template>

    <!-- Telaio a U, sopra tutto: le teste delle barre spariscono nel canale -->
    <path :d="telaio" fill-rule="evenodd" class="fill-amber-400" />
    <path :d="telaio" fill-rule="evenodd" fill="none" stroke-width="1.5" class="stroke-amber-600/40" />

    <!-- Quote d'ingombro -->
    <text
      :x="W / 2" :y="-margine * 0.25"
      text-anchor="middle" :font-size="quotaFont"
      class="fill-slate-400 font-bold"
    >{{ (W / 10).toFixed(1) }} cm</text>
    <text
      :x="-margine * 0.25" :y="H / 2"
      text-anchor="middle" :font-size="quotaFont"
      :transform="`rotate(-90 ${-margine * 0.25} ${H / 2})`"
      class="fill-slate-400 font-bold"
    >{{ (H / 10).toFixed(1) }} cm</text>
  </svg>
</template>
