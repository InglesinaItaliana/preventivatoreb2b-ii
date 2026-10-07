<script setup lang="ts">
// La scheda di un TIPO di pezzo (tutti i pezzi uguali): misura, quanti, come si
// taglia e quali lavorazioni ha. Legge solo dal Progetto: gli stessi numeri
// della distinta, mai ricalcolati qui.
import { computed } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/solid';
import { PEZZO, type Progetto } from '../../logic/griglie/progetto';

const props = defineProps<{
  progetto: Progetto;
  tipo: string;
  telai: number;
}>();
const emit = defineEmits<{ chiudi: [] }>();

const barra = computed(() => props.progetto.barre.find((b) => b.etichetta === props.tipo) ?? null);
const bordo = computed(() => props.progetto.bordi.find((b) => b.etichetta === props.tipo) ?? null);
const pezzo = computed(() => barra.value ?? bordo.value);
const premium = computed(() => props.progetto.premium ?? null);

const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const mm = (v: number) => `${nf.format(v)} mm`;
</script>

<template>
  <div v-if="pezzo" class="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl p-4 text-sm" @click.stop>
    <div class="flex items-start justify-between gap-3 mb-3">
      <div>
        <p class="text-[10px] font-bold uppercase text-amber-600">Scheda pezzo</p>
        <h3 class="font-bold text-gray-900 leading-tight">{{ tipo }}</h3>
      </div>
      <button @click="emit('chiudi')" class="p-1 -m-1 text-gray-400 hover:text-gray-700" title="Chiudi (Esc)">
        <XMarkIcon class="h-5 w-5" />
      </button>
    </div>

    <dl class="space-y-1.5">
      <div class="flex justify-between gap-3">
        <dt class="text-gray-500">Lunghezza{{ bordo ? ' (punta lunga)' : '' }}</dt>
        <dd class="font-bold tabular-nums">{{ mm(pezzo.lunghezza) }}</dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-gray-500">Pezzi</dt>
        <dd class="font-bold tabular-nums">
          {{ pezzo.quantitaPerTelaio * telai }}
          <span v-if="telai > 1" class="text-[11px] text-gray-400 font-normal">({{ pezzo.quantitaPerTelaio }} × {{ telai }} telai)</span>
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-gray-500">Taglio</dt>
        <dd class="font-medium">{{ pezzo.taglio }}</dd>
      </div>
    </dl>

    <div v-if="!(premium && barra && tipo !== PEZZO.VERTICALE)" class="mt-3 pt-3 border-t border-gray-100">
      <p class="text-[10px] font-bold uppercase text-gray-500 mb-2">Lavorazioni</p>
      <ul class="space-y-2.5">

        <!-- PREMIUM: verticale → scasso alla pressetta -->
        <li v-if="premium && barra && tipo === PEZZO.VERTICALE">
          <p class="font-bold text-gray-800">Scasso · <span class="tabular-nums">{{ premium.scasso.etichetta }}</span></p>
          <div class="flex flex-wrap gap-1 mt-1">
            <span v-for="(a, i) in premium.scasso.assi" :key="i"
              class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-bold tabular-nums"
            >{{ nf.format(a) }}</span>
          </div>
        </li>

        <!-- PREMIUM: cornice → fori -->
        <li v-if="premium && bordo">
          <p class="font-bold text-gray-800">Fori</p>
          <div class="flex flex-wrap gap-1 mt-1">
            <span v-for="(f, i) in bordo.fori" :key="i"
              class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-bold tabular-nums"
            >{{ nf.format(f) }}</span>
          </div>
        </li>

        <!-- Altri stili: foratura per rivetti -->
        <li v-if="!premium && barra">
          <p class="font-bold text-gray-800">
            Foratura ·
            <template v-if="barra.nFori">{{ barra.nFori }} fori</template>
            <template v-else>nessun foro</template>
          </p>
          <p v-if="barra.quantitaCieca || barra.quantitaPassante" class="text-[11px] text-gray-500">
            <template v-if="barra.quantitaCieca">{{ barra.quantitaCieca * telai }} a foro cieco (strato a vista)</template>
            <template v-if="barra.quantitaCieca && barra.quantitaPassante"> · </template>
            <template v-if="barra.quantitaPassante">{{ barra.quantitaPassante * telai }} a foro passante</template>
          </p>
          <template v-if="barra.nFori">
            <p class="text-[11px] text-gray-500 tabular-nums">
              primo foro {{ mm(barra.primoForo) }} · interasse {{ mm(barra.interasse) }} · coda {{ mm(barra.codaForo) }}
            </p>
            <div class="flex flex-wrap gap-1 mt-1">
              <span v-for="(f, i) in barra.posizioni" :key="i"
                class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-bold tabular-nums"
              >{{ nf.format(f) }}</span>
            </div>
          </template>
        </li>

        <li v-if="!premium && bordo" class="text-[11px] text-gray-500">Nessuna lavorazione oltre al taglio.</li>
      </ul>
    </div>
  </div>
</template>
