<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, useId } from 'vue';
import type { Progetto, SegmentoBarra, PezzoCorniceDisegno } from '../../logic/griglie/progetto';
import { BARRA } from '../../logic/griglie/materiali';
import { coloreFinitura, tinta } from '../../logic/griglie/finiture';
import { poligonoBarra } from '../../logic/griglie/disegno';

const props = defineProps<{
  progetto: Progetto;
  finitura: string;
  evidenzia?: string | null;   // etichetta del TIPO da accendere (es. "Barra tipo B")
}>();

// Clic su un pezzo → il suo TIPO (tutti i pezzi uguali); clic sul vuoto → null.
const emit = defineEmits<{ seleziona: [tipo: string | null] }>();

const W = computed(() => props.progetto.config.larghezza);
const H = computed(() => props.progetto.config.altezza);
const lato = computed(() => props.progetto.latoTelaio);

// Il pannello prende il colore della finitura scelta. Le barre sono dello stesso
// materiale, quindi dello stesso colore: le distinguiamo dal telaio con una tinta
// più scura, non con un colore diverso — sarebbe una bugia visiva.
const colore = computed(() => coloreFinitura(props.finitura));
const coloreBordo = computed(() => tinta(colore.value, -0.45));
const coloreRivetto = computed(() => tinta(colore.value, -0.55));
const coloreLavorazione = computed(() => tinta(colore.value, -0.8)); // più scuro del contorno, o ci sparisce dentro
const tinte: Record<string, number> = { O: -0.14, V: -0.26, A: -0.14, B: -0.26 };

const EVIDENZA = '#FBBF24'; // amber: solo per l'hover, mai come colore del pezzo

// La forma dei pezzi (smussi compresi) sta in logic/griglie/disegno.ts: la usa anche il PDF.
const poligono = (b: SegmentoBarra) =>
  poligonoBarra(b, props.progetto.larghezzaBarra).map((q) => `${q.x},${q.y}`).join(' ');

const puntiCornice = (pz: PezzoCorniceDisegno) => pz.punti.map((q) => `${q.x},${q.y}`).join(' ');
const riempimentoCornice = (pz: PezzoCorniceDisegno) =>
  props.evidenzia && props.evidenzia === pz.tipo ? EVIDENZA : colore.value;

// Si accende il TIPO, non la famiglia: sui rombi un tipo raccoglie barre di
// entrambe le famiglie, e sono proprio quelle che l'officina taglia insieme.
//
// Sul PREMIUM invece cornice e interni sono TUTTI la stessa inglesina, verniciata
// o rivestita insieme: stesso colore pieno, e i pezzi si leggono dal contorno.
// Tinte diverse falserebbero proprio la finitura che si sta scegliendo.
const riempimento = (b: SegmentoBarra) =>
  props.evidenzia && props.evidenzia === b.tipo
    ? EVIDENZA
    : props.progetto.premium ? colore.value : tinta(colore.value, tinte[b.famiglia] ?? -0.2);

// Il disegno si ritaglia sul perimetro del pannello: il contorno è centrato sul
// bordo, e senza ritaglio metà del suo spessore uscirebbe dall'ingombro.
const clipId = `griglia-${useId()}`;

// --- Vista esplosa (solo PREMIUM) ------------------------------------------
// Con un pezzo evidenziato il pannello si apre GIUNTO PER GIUNTO: ogni incastro
// si allarga di quanto il pezzo sormonta, più un piccolo spazio visibile. Così
// ogni pezzo si stacca da tutti i vicini anche sulle griglie fitte (uno
// spostamento proporzionale alla distanza dal centro, sui passi stretti, apriva
// meno del sormonto e lasciava i pezzi incastrati).
//
// In larghezza la sequenza dei pezzi è:
//   montante sx · spezzone · verticale · spezzone · … · verticale · spezzone · montante dx
// e ognuno si sposta di un "passo" in più del precedente, a partire dal centro.
// In altezza si aprono solo i traversi: verticali e spezzoni di file diverse
// non si toccano. I pezzi NON cambiano dimensione: lo spazio per aprirsi è
// riservato nel riquadro fin dall'inizio (`riserva`), perché cambiare il viewBox
// al passaggio del mouse farebbe rimpicciolire tutto il disegno.
const DURATA_MS = 300;
const esploso = computed(() => !!props.progetto.premium && !!props.evidenzia);

// Il ritaglio sul perimetro torna solo a pannello RICHIUSO: rimesso subito,
// taglierebbe i pezzi mentre rientrano, e sembrerebbero ridisegnarsi di colpo.
const ritaglio = ref(true);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(esploso, (aperto) => {
  clearTimeout(timer);
  if (aperto) ritaglio.value = false;
  else timer = setTimeout(() => { ritaglio.value = true; }, DURATA_MS);
});
onBeforeUnmount(() => clearTimeout(timer));

/** Un passo di apertura: il sormonto, più uno spazio che si veda a ogni scala. */
const passoEsploso = computed(() => {
  const sormonto = props.progetto.premium?.sormontoPerLato ?? 0;
  return sormonto + Math.max(3, Math.max(W.value, H.value) * 0.008);
});
const centroColonne = computed(() => props.progetto.assiVerticali.length + 1);

function sposta(dx: number, dy: number): Record<string, string> {
  return esploso.value
    ? { transform: `translate(${dx * passoEsploso.value}px, ${dy * passoEsploso.value}px)` }
    : { transform: 'translate(0px, 0px)' };
}

function spostaBarra(b: SegmentoBarra): Record<string, string> {
  const assi = props.progetto.assiVerticali;
  const meta = (b.x1 + b.x2) / 2;
  // Verticale i → posto 2i+2; spezzone nella colonna j → posto 2j+1.
  const posto = b.famiglia === 'V'
    ? 2 * assi.findIndex((x) => Math.abs(x - b.x1) < 1e-6) + 2
    : 2 * assi.filter((x) => x < meta).length + 1;
  return sposta(posto - centroColonne.value, 0);
}

function spostaCornice(pz: PezzoCorniceDisegno): Record<string, string> {
  const xs = pz.punti.map((q) => q.x), ys = pz.punti.map((q) => q.y);
  const montante = Math.max(...xs) - Math.min(...xs) <= lato.value + 1e-6;
  if (montante) return sposta(Math.min(...xs) < W.value / 2 ? -centroColonne.value : centroColonne.value, 0);
  return sposta(0, Math.min(...ys) < H.value / 2 ? -1 : 1);
}

// Lavorazioni visibili solo da aperto: a pannello montato stanno sotto le teste
// che sormontano. Sono sui LATI STRETTI (gli 8 mm) del profilo, quindi di fronte
// si vedono come tacche sul bordo del pezzo, ognuna solidale al suo pezzo:
//   cornice   → foro ⌀ 2 mm (trapano) sul solo lato INTERNO, uno per interno
//   verticali → incisione larga 4 mm (pressetta) su ENTRAMBI i lati stretti,
//               una per orizzontale
// Larghezza in scala reale; la profondità della tacca è solo grafica.
const LARGHEZZA_FORO = 2;
const LARGHEZZA_SCASSO = 4;
const PROFONDITA_TACCA = 4;   // abbastanza da uscire dal contorno del pezzo

interface Tacca { x: number; y: number; w: number; h: number; stile: Record<string, string> }

/** Una tacca centrata su (cx, cy), lunga `lungo` lungo il bordo. */
const tacca = (cx: number, cy: number, lungo: number, bordoOrizzontale: boolean, stile: Record<string, string>): Tacca => {
  const w = bordoOrizzontale ? lungo : PROFONDITA_TACCA;
  const h = bordoOrizzontale ? PROFONDITA_TACCA : lungo;
  return { x: cx - w / 2, y: cy - h / 2, w, h, stile };
};

const foriCornice = computed<Tacca[]>(() => {
  if (!props.progetto.premium) return [];
  const L = lato.value, c = centroColonne.value, d = PROFONDITA_TACCA / 2;
  const { assiVerticali: xs, assiOrizzontali: ys } = props.progetto;
  // Sul bordo INTERNO di ogni pezzo, dentro il profilo.
  return [
    ...xs.map((x) => tacca(x, L - d, LARGHEZZA_FORO, true, sposta(0, -1))),               // traverso sopra
    ...xs.map((x) => tacca(x, H.value - L + d, LARGHEZZA_FORO, true, sposta(0, 1))),      // traverso sotto
    ...ys.map((y) => tacca(L - d, y, LARGHEZZA_FORO, false, sposta(-c, 0))),              // montante sx
    ...ys.map((y) => tacca(W.value - L + d, y, LARGHEZZA_FORO, false, sposta(c, 0))),     // montante dx
  ];
});

const scassi = computed<Tacca[]>(() => {
  if (!props.progetto.premium) return [];
  const mezza = props.progetto.larghezzaBarra / 2, c = centroColonne.value, d = PROFONDITA_TACCA / 2;
  return props.progetto.assiVerticali.flatMap((x, i) => props.progetto.assiOrizzontali.flatMap((y) => {
    const stile = sposta(2 * i + 2 - c, 0);
    return [
      tacca(x - mezza + d, y, LARGHEZZA_SCASSO, false, stile),   // lato stretto sinistro
      tacca(x + mezza - d, y, LARGHEZZA_SCASSO, false, stile),   // lato stretto destro
    ];
  }));
});

// Di quanto esce al massimo un pezzo, per lato: i montanti in larghezza, i traversi in altezza.
const riserva = computed(() => props.progetto.premium
  ? { x: centroColonne.value * passoEsploso.value, y: passoEsploso.value }
  : { x: 0, y: 0 });

const telaio = computed(() => {
  const w = W.value, h = H.value, l = lato.value;
  return `M0,0 H${w} V${h} H0 Z M${l},${l} H${w - l} V${h - l} H${l} Z`;
});

const margine = computed(() => Math.max(W.value, H.value) * 0.04);
const viewBox = computed(() => {
  const mx = margine.value + riserva.value.x, my = margine.value + riserva.value.y;
  return `${-mx} ${-my} ${W.value + 2 * mx} ${H.value + 2 * my}`;
});
// Le quote stanno fuori dallo spazio riservato: aperta, la cornice ci finirebbe sopra.
const quotaX = computed(() => -riserva.value.x - margine.value * 0.25);
const quotaY = computed(() => -riserva.value.y - margine.value * 0.25);
const quotaFont = computed(() => Math.max(W.value, H.value) * 0.028);
const tratto = computed(() => Math.max(W.value, H.value) * 0.0018);
</script>

<template>
  <svg
    :viewBox="viewBox" class="w-full h-full" preserveAspectRatio="xMidYMid meet" stroke-linejoin="round"
    @click="emit('seleziona', null)"
  >
    <defs>
      <clipPath :id="clipId"><rect x="0" y="0" :width="W" :height="H" /></clipPath>
    </defs>
    <!-- Giunzioni ARROTONDATE: a punta, sugli angoli a 45° della cornice e degli
         smussi il contorno si allunga in uno spuntone fuori dal pezzo. -->
    <!-- Esploso, il ritaglio taglierebbe i pezzi che si sono allontanati. -->
    <g :clip-path="ritaglio ? `url(#${clipId})` : undefined">
      <!-- Luce interna (o l'intero pannello, se non c'è il telaio) -->
      <rect
        :x="lato" :y="lato"
        :width="Math.max(0, W - 2 * lato)" :height="Math.max(0, H - 2 * lato)"
        class="fill-slate-50 transition-opacity duration-300"
        :class="{ 'opacity-0': esploso }"
      />

      <!-- PREMIUM: la cornice è fatta di pezzi veri a 45°, e sta SOTTO gli interni,
           che la sormontano. -->
      <polygon
        v-for="(pz, i) in progetto.disegno.cornice ?? []" :key="`c${i}`"
        :points="puntiCornice(pz)"
        :fill="riempimentoCornice(pz)"
        :stroke="coloreBordo" :stroke-width="tratto * 1.5"
        :style="spostaCornice(pz)"
        class="transition-[fill,transform] duration-300 ease-out cursor-pointer"
        @click.stop="emit('seleziona', pz.tipo)"
      />

      <!-- Le barre, in ordine: la seconda famiglia finisce sopra la prima, come nel
           pannello vero (barre sovrapposte, rivettate agli incroci). -->
      <polygon
        v-for="(b, i) in progetto.disegno.barre" :key="i"
        :points="poligono(b)"
        :fill="riempimento(b)"
        :stroke="coloreBordo" :stroke-width="tratto"
        :style="progetto.premium ? spostaBarra(b) : undefined"
        class="transition-[fill,transform] duration-300 ease-out cursor-pointer"
        @click.stop="emit('seleziona', b.tipo || null)"
      />

      <!-- PREMIUM, solo da aperto: fori della cornice e scassi dei verticali, sui lati stretti -->
      <g
        class="transition-opacity duration-300" :class="esploso ? 'opacity-100' : 'opacity-0'"
        :fill="coloreLavorazione" pointer-events="none"
      >
        <rect
          v-for="(t, i) in [...foriCornice, ...scassi]" :key="`t${i}`"
          :x="t.x" :y="t.y" :width="t.w" :height="t.h" :style="t.stile"
          class="transition-transform duration-300 ease-out"
        />
      </g>

      <!-- Rivetti: uno per incrocio -->
      <circle
        v-for="(r, i) in progetto.disegno.rivetti" :key="`r${i}`"
        :cx="r.x" :cy="r.y" :r="BARRA.larghezza * 0.17"
        :fill="coloreRivetto"
        pointer-events="none"
      />

      <!-- Telaio a U, sopra tutto: le teste delle barre spariscono nel canale.
           Senza bordo perimetrale, qui non si disegna nulla. -->
      <template v-if="lato > 0 && !progetto.disegno.cornice">
        <path :d="telaio" fill-rule="evenodd" :fill="colore" />
        <path :d="telaio" fill-rule="evenodd" fill="none" :stroke="coloreBordo" :stroke-width="tratto * 1.5" />
      </template>

    </g>

    <!-- Il filo esterno, ridisegnato DENTRO l'ingombro: il ritaglio ne ha tolto la
         metà di fuori, e senza questo resterebbe sottile la metà delle linee interne. -->
    <rect
      v-if="lato > 0"
      :x="tratto * 0.75" :y="tratto * 0.75"
      :width="Math.max(0, W - tratto * 1.5)" :height="Math.max(0, H - tratto * 1.5)"
      fill="none" :stroke="coloreBordo" :stroke-width="tratto * 1.5"
      class="transition-opacity duration-300" :class="{ 'opacity-0': esploso }"
    />

    <!-- Quote d'ingombro -->
    <text :x="W / 2" :y="quotaY" text-anchor="middle" :font-size="quotaFont" class="fill-slate-400 font-bold">
      {{ (W / 10).toFixed(1) }} cm
    </text>
    <text
      :x="quotaX" :y="H / 2" text-anchor="middle" :font-size="quotaFont"
      :transform="`rotate(-90 ${quotaX} ${H / 2})`"
      class="fill-slate-400 font-bold"
    >{{ (H / 10).toFixed(1) }} cm</text>
  </svg>
</template>
