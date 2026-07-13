<script setup lang="ts">
import { computed } from 'vue';
import type { Progetto } from '../../logic/griglie/progetto';
import { BARRA } from '../../logic/griglie/materiali';
import { coloreFinitura, tinta } from '../../logic/griglie/finiture';

const props = defineProps<{
  progetto: Progetto;
  finitura: string;
  evidenzia?: 'verticali' | 'orizzontali' | null;
}>();

const W = computed(() => props.progetto.config.larghezza);
const H = computed(() => props.progetto.config.altezza);

// Telaio e rientro arrivano dal progetto, non li ricalcoliamo qui: senza bordo
// perimetrale valgono entrambi zero, e una copia locale se lo dimenticherebbe.
const lato = computed(() => props.progetto.latoTelaio);
const testa = computed(() => props.progetto.testa);
const mezza = BARRA.larghezza / 2;

// Il pannello prende il colore della finitura scelta. Le barre sono dello stesso
// materiale, quindi dello stesso colore: le distinguiamo dal telaio con una
// tinta appena più scura, non con un colore diverso — sarebbe una bugia visiva.
const colore = computed(() => coloreFinitura(props.finitura));
const coloreTelaio = computed(() => colore.value);
const coloreBarreOriz = computed(() => tinta(colore.value, -0.14));
const coloreBarreVert = computed(() => tinta(colore.value, -0.26));
const coloreBordo = computed(() => tinta(colore.value, -0.45)); // contorno: tiene visibili anche i bianchi
const coloreRivetto = computed(() => tinta(colore.value, -0.55));

const EVIDENZA = '#FBBF24'; // amber-400: solo per l'hover, mai come colore del pezzo

const telaio = computed(() => {
  const w = W.value, h = H.value, l = lato.value;
  return `M0,0 H${w} V${h} H0 Z M${l},${l} H${w - l} V${h - l} H${l} Z`;
});

const margine = computed(() => Math.max(W.value, H.value) * 0.04);
const viewBox = computed(() =>
  `${-margine.value} ${-margine.value} ${W.value + 2 * margine.value} ${H.value + 2 * margine.value}`
);
const quotaFont = computed(() => Math.max(W.value, H.value) * 0.028);
const trattoBordo = computed(() => Math.max(W.value, H.value) * 0.0018);
</script>

<template>
  <svg :viewBox="viewBox" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
    <!-- Luce interna (o l'intero pannello, se non c'è il telaio) -->
    <rect
      :x="lato" :y="lato"
      :width="Math.max(0, W - 2 * lato)" :height="Math.max(0, H - 2 * lato)"
      class="fill-slate-50"
    />

    <!-- Barre orizzontali -->
    <rect
      v-for="(y, i) in progetto.assiOrizzontali" :key="`h${i}`"
      :x="testa" :y="y - mezza"
      :width="Math.max(0, W - 2 * testa)" :height="BARRA.larghezza"
      :fill="evidenzia === 'orizzontali' ? EVIDENZA : coloreBarreOriz"
      :stroke="coloreBordo" :stroke-width="trattoBordo"
      class="transition-[fill] duration-150"
    />

    <!-- Barre verticali: sopra le orizzontali, come nel pannello (barre sovrapposte) -->
    <rect
      v-for="(x, i) in progetto.assiVerticali" :key="`v${i}`"
      :x="x - mezza" :y="testa"
      :width="BARRA.larghezza" :height="Math.max(0, H - 2 * testa)"
      :fill="evidenzia === 'verticali' ? EVIDENZA : coloreBarreVert"
      :stroke="coloreBordo" :stroke-width="trattoBordo"
      class="transition-[fill] duration-150"
    />

    <!-- Rivetti: uno per incrocio -->
    <template v-for="(x, i) in progetto.assiVerticali" :key="`r${i}`">
      <circle
        v-for="(y, j) in progetto.assiOrizzontali" :key="`r${i}-${j}`"
        :cx="x" :cy="y" :r="BARRA.larghezza * 0.17"
        :fill="coloreRivetto"
      />
    </template>

    <!-- Telaio a U, sopra tutto: le teste delle barre spariscono nel canale.
         Se il bordo perimetrale non c'è, qui non si disegna nulla. -->
    <template v-if="progetto.latoTelaio > 0">
      <path :d="telaio" fill-rule="evenodd" :fill="coloreTelaio" />
      <path :d="telaio" fill-rule="evenodd" fill="none" :stroke="coloreBordo" :stroke-width="trattoBordo * 1.5" />
    </template>

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
