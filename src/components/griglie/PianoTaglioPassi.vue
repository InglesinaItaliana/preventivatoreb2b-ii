<script setup lang="ts">
// Il piano di taglio come lo si esegue alla sega: una riga per misura, la battuta
// si imposta una volta sola; sotto, da dove escono i pezzi (prima gli spezzoni
// rimasti sul banco, poi le barre nuove). Stessa impostazione del PDF della
// scheda di produzione. Legge solo il PianoTaglio.
import { computed } from 'vue';
import { AVANZO_MINIMO, type PianoTaglio, type Prelievo } from '../../logic/griglie/nesting';
import BloccoTaglio from './BloccoTaglio.vue';

const props = defineProps<{
  piano: PianoTaglio;
  nome?: string;
  kerf: number;
  senzaLegenda?: boolean;   // con più piani uno sotto l'altro, la legenda basta una volta (in fondo)
}>();

const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm = (v: number) => `${nf.format(v)} mm`;
const m = (v: number) => `${nf2.format(v / 1000)} m`;

/**
 * Dove vanno i metri comprati, fatto 100 il totale delle barre: profilo, magazzino,
 * scarto (avanzi corti + lama + rifilo). In scala, con un minimo perché i numeri di
 * un blocco piccolo restino leggibili.
 */
const ripartizione = computed(() => {
  const p = props.piano, totale = p.materialeAcquistato;
  if (!totale) return [];
  return ([
    ['pezzo', p.materialeUtile], ['magazzino', p.materialeMagazzino], ['scarto', p.materialeScarto],
  ] as const).filter(([, v]) => v > 0.5).map(([tipo, v]) => ({ tipo, v, quota: (v / totale) * 100 }));
});

/** Dove va l'avanzo: banco (verde), magazzino (grigio), scarto sotto AVANZO_MINIMO (rosa). */
const destinazione = (p: Prelievo) => (p.alBanco ? 'banco' : p.avanzo < AVANZO_MINIMO ? 'scarto' : 'magazzino');
/** Il tratto dell'avanzo nella barretta: fondo e bordo del suo colore, come il blocchetto. */
const TRATTO = {
  banco: 'bg-emerald-200 border border-emerald-700',
  magazzino: 'bg-gray-200 border border-gray-500',
  scarto: 'bg-rose-200 border border-rose-700',
} as const;

// Le barrette sono in scala sulla barra commerciale: uno spezzone si vede corto.
const perc = (v: number) => `${(v / props.piano.lunghezzaStecca) * 100}%`;
// Dentro la barretta di una fonte le misure sono in percentuale della FONTE: una
// percentuale si applica al contenitore, che è già scalato sulla barra commerciale.
const quota = (v: number, fonte: number) => `${(v / fonte) * 100}%`;
</script>

<template>
  <div>
    <div v-if="nome" class="flex items-baseline justify-between gap-3 mb-2">
      <p class="text-xs font-bold uppercase text-gray-800">{{ nome }}</p>
      <p class="text-xs font-bold text-gray-800 tabular-nums">
        {{ piano.nStecche }} {{ piano.nStecche === 1 ? 'barra' : 'barre' }} da {{ m(piano.lunghezzaStecca) }}
      </p>
    </div>

    <div class="grid grid-cols-[2rem_3rem_1fr_3.5rem_4.25rem] gap-2 px-2 pb-1 text-[9px] font-bold uppercase text-gray-400">
      <span class="col-span-2">Da</span><span>Schema di taglio</span><span class="text-right">Tagli</span><span>Avanzo</span>
    </div>
    <div class="border-t border-gray-200">
      <template v-for="(passo, i) in piano.passi" :key="i">
        <!-- La misura: si imposta una volta sola -->
        <div class="flex items-baseline justify-between bg-gray-50 px-2 py-1 border-b border-gray-200">
          <span class="text-base font-bold font-heading text-gray-900 tabular-nums">{{ mm(passo.lunghezza) }}</span>
          <span class="text-sm font-bold text-amber-700 tabular-nums pr-[4.75rem]">{{ passo.quantita }} pz</span>
        </div>
        <div
          v-for="(p, j) in passo.prelievi" :key="j"
          class="grid grid-cols-[2rem_3rem_1fr_3.5rem_4.25rem] items-center gap-2 px-2 py-1 border-b border-gray-100 text-[11px]"
        >
          <span class="font-bold text-gray-900 tabular-nums">{{ p.ripetizioni }}×</span>
          <!-- La lunghezza della fonte: lo spezzone si cerca sul banco per misura -->
          <BloccoTaglio :tipo="p.da === 'NUOVA' ? 'nuova' : 'spezzone'" class="font-bold tabular-nums"
            :title="p.da === 'NUOVA' ? 'barra nuova' : 'spezzone dal banco'">{{ nf.format(p.lunghezza) }}</BloccoTaglio>
          <div class="h-5 bg-gray-50 rounded-sm">
            <div class="flex h-full" :style="{ width: perc(p.lunghezza) }">
              <!-- Ogni pezzo col suo bordo e un distacco dal successivo: il distacco sta dentro
                   il pezzo più la lama, così le posizioni restano in scala. Il rifilo della
                   barra nuova non si disegna: resta come spazio vuoto in coda. -->
              <div v-for="k in p.pezzi" :key="k" class="shrink-0 pr-[3px]" :style="{ width: quota(passo.lunghezza + kerf, p.lunghezza) }">
                <div class="h-full bg-amber-400 border border-amber-700"></div>
              </div>
              <div v-if="p.avanzo > 0" class="shrink-0" :class="TRATTO[destinazione(p)]" :style="{ width: quota(p.avanzo, p.lunghezza) }"></div>
            </div>
          </div>
          <!-- Tagli da fare su OGNI fonte della riga -->
          <span class="text-right tabular-nums whitespace-nowrap">
            <b class="text-sm text-gray-900">{{ p.pezzi }}</b><span class="text-[10px] text-gray-500"> cad.</span>
          </span>
          <!-- Il blocchetto dell'avanzo, sempre largo uguale: la sola misura, il colore dice dove va -->
          <BloccoTaglio v-if="p.avanzo > 0" :tipo="destinazione(p)" class="font-bold tabular-nums">{{ nf.format(p.avanzo) }}</BloccoTaglio>
          <span v-else class="h-5 leading-5 text-center text-[10px] text-gray-400 border border-gray-200 rounded-sm">nessuno</span>
        </div>
      </template>
    </div>

    <!-- Ripartizione dei metri comprati -->
    <p v-if="ripartizione.length" class="text-[10px] font-bold uppercase text-gray-400 mt-6 mb-1">Ripartizione del materiale</p>
    <div v-if="ripartizione.length" class="flex gap-1 text-[11px] font-bold tabular-nums">
      <BloccoTaglio v-for="r in ripartizione" :key="r.tipo" :tipo="r.tipo" class="!h-7 min-w-[8.5rem]" :style="{ flexGrow: r.quota, flexBasis: 0 }">
        {{ nf.format(r.quota) }}% · {{ m(r.v) }}
      </BloccoTaglio>
    </div>

    <!-- Legenda: la stessa del PDF, blocchetti tutti uguali col significato dentro.
         Spezzone e avanzo al banco sono lo stesso pezzo: una voce sola. -->
    <template v-if="!senzaLegenda">
    <p class="text-[10px] font-bold uppercase text-gray-400 mt-4 mb-1">Legenda</p>
    <div class="flex flex-wrap gap-2 text-[10px]">
      <BloccoTaglio tipo="nuova" class="w-24 font-bold">NUOVA</BloccoTaglio>
      <BloccoTaglio tipo="pezzo" class="w-24 font-bold">PEZZO</BloccoTaglio>
      <BloccoTaglio tipo="banco" class="w-24 font-bold">BANCO</BloccoTaglio>
      <BloccoTaglio tipo="magazzino" class="w-24 font-bold">MAGAZZINO</BloccoTaglio>
      <BloccoTaglio tipo="scarto" class="w-24 font-bold">SCARTO</BloccoTaglio>
    </div>
    </template>
    <p v-if="piano.nonRicavabili.length" class="text-[11px] text-amber-700 font-bold mt-2">
      Pezzi che non escono da una barra nuova: {{ piano.nonRicavabili.map((p) => p.etichetta).join(', ') }}.
    </p>
  </div>
</template>
