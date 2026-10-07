<script setup lang="ts">
// Un blocchetto del piano di taglio: fonte (barra nuova, spezzone), pezzo, o destinazione
// dell'avanzo (banco, magazzino, scarto), con gli stessi colori del PDF. Spezzone e
// banco hanno la coda tagliata in diagonale: sono lo stesso pezzo che esce e torna.
// Il bordo è il guscio esterno, il fondo quello interno: con clip-path un border CSS
// non seguirebbe la diagonale.
import { computed } from 'vue';

export type TipoBlocco = 'nuova' | 'pezzo' | 'spezzone' | 'banco' | 'magazzino' | 'scarto';

const props = defineProps<{ tipo: TipoBlocco }>();

const COLORI: Record<TipoBlocco, { bordo: string; fondo: string }> = {
  nuova: { bordo: 'bg-gray-900', fondo: 'bg-white text-gray-900' },
  pezzo: { bordo: 'bg-amber-700', fondo: 'bg-amber-400 text-amber-950' },
  spezzone: { bordo: 'bg-emerald-700', fondo: 'bg-emerald-200 text-emerald-800' },
  banco: { bordo: 'bg-emerald-700', fondo: 'bg-emerald-200 text-emerald-800' },
  magazzino: { bordo: 'bg-gray-500', fondo: 'bg-gray-200 text-gray-600' },
  scarto: { bordo: 'bg-rose-700', fondo: 'bg-rose-200 text-rose-700' },
};

const CODA_STORTA = 'polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%)';

const storta = computed(() => props.tipo === 'spezzone' || props.tipo === 'banco');
const forma = computed(() => (storta.value ? { clipPath: CODA_STORTA } : {}));
</script>

<template>
  <span class="block h-5 p-px" :class="COLORI[tipo].bordo" :style="forma">
    <span
      class="flex items-center justify-center h-full leading-none whitespace-nowrap"
      :class="[COLORI[tipo].fondo, storta ? 'pr-1.5' : '']"
      :style="forma"
    ><slot /></span>
  </span>
</template>
