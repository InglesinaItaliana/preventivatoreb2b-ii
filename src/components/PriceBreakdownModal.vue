<script setup lang="ts">
import { computed } from 'vue';
import { XMarkIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/solid';
import type { Dettaglio } from '../logic/priceBreakdown';

const props = defineProps<{
  show: boolean;
  dettaglio: Dettaglio | null;
  descrizione: string;
  codice?: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const nf = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number) => nf.format(v);
const eur = (v: number) => `${nf.format(v)} €`;
const mt = (v: number) => `${nf.format(v)} m`;
const rate = (v: number) => `${nf.format(v)} €/m`;

const d = computed(() => props.dettaglio);

// La catena aritmetica del blocco ③, scritta come la leggerebbe il cliente.
const formula = computed(() => {
  const x = d.value;
  if (!x) return '';
  if (x.regime === 'SOLO_TELAIO') {
    return `${mt(x.metriPezzo)} × ${rate(x.tariffaCanalino)} = ${eur(x.prezzoRicostruito)}`;
  }
  const tariffe = x.supplementi.length
    ? rate(x.tariffaGriglia)
    : `(${n(x.tariffaGriglia)} + ${n(x.tariffaCanalino)} €/m)`;
  const molt = x.moltiplicatore ? ` × ${n(x.moltiplicatore)}` : '';
  const parziale = x.supplementi.length
    ? x.metriPezzo * x.tariffaGriglia
    : x.prezzoRicostruito;
  return `${mt(x.metriPezzo)} × ${tariffe}${molt} = ${eur(parziale)}`;
});
</script>

<template>
  <div
    v-if="show && d"
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

      <!-- Testata -->
      <div class="bg-amber-400 p-5 text-amber-950 flex justify-between items-start shrink-0 rounded-t-xl">
        <div class="min-w-0">
          <h2 class="font-bold text-xl font-heading flex items-center gap-2">
            <MagnifyingGlassIcon class="w-6 h-6 shrink-0" />
            Come si compone il prezzo
          </h2>
          <p class="text-sm font-bold mt-1 truncate opacity-90">{{ descrizione }}</p>
          <p v-if="codice" class="text-[11px] uppercase tracking-wider opacity-70">cod. {{ codice }}</p>
        </div>
        <button @click="emit('close')" class="p-1 hover:bg-amber-500/40 rounded-lg transition-colors shrink-0" title="Chiudi">
          <XMarkIcon class="w-6 h-6" />
        </button>
      </div>

      <div class="p-5 space-y-4 overflow-auto">

        <!-- ① GEOMETRIA -->
        <section class="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
          <div class="flex items-center gap-3 mb-3">
            <div class="h-7 w-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 text-xs shrink-0">1</div>
            <h3 class="font-bold text-sm text-gray-900 uppercase tracking-wide">La geometria</h3>
          </div>

          <dl class="text-sm space-y-1.5">
            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">Misure inserite</dt>
              <dd class="font-medium text-gray-900 tabular-nums">{{ d.baseInserita }} × {{ d.altezzaInserita }} mm</dd>
            </div>
            <div v-if="d.arrotondata" class="flex justify-between gap-4">
              <dt class="text-gray-500">Misure di calcolo</dt>
              <dd class="font-medium text-gray-900 tabular-nums">{{ d.baseCalcolo }} × {{ d.altezzaCalcolo }} mm</dd>
            </div>
            <p v-if="d.arrotondata" class="text-[11px] text-gray-400 italic -mt-0.5">
              Le misure salgono al multiplo di 50 mm successivo.
            </p>

            <div v-if="d.metrica === 'sviluppo'" class="flex justify-between gap-4">
              <dt class="text-gray-500">Suddivisioni</dt>
              <dd class="font-medium text-gray-900 tabular-nums">{{ d.verticali }} vert. · {{ d.orizzontali }} orizz.</dd>
            </div>

            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">
                {{ d.metrica === 'perimetro' ? 'Perimetro del telaio' : 'Sviluppo lineare' }}
              </dt>
              <dd class="font-medium text-gray-900 tabular-nums">{{ mt(d.metriPezzo) }} a pezzo</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">Quantità</dt>
              <dd class="font-medium text-gray-900 tabular-nums">× {{ d.quantita }}</dd>
            </div>

            <div class="flex justify-between gap-4 pt-2 mt-1 border-t border-gray-100">
              <dt class="font-bold text-gray-900 uppercase text-xs tracking-wide self-center">Metri totali</dt>
              <dd class="font-bold text-lg font-heading text-gray-900 tabular-nums">{{ mt(d.metriTotali) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Riga non riconciliata: tariffe e regola NON sono mostrate -->
        <div v-if="!d.riconcilia" class="border border-amber-200 bg-amber-50 rounded-xl p-4 flex gap-3">
          <ExclamationTriangleIcon class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div class="text-sm text-amber-900">
            <p class="font-bold mb-1">Prezzo bloccato al momento dell'offerta</p>
            <p class="text-[13px] leading-snug">
              Le tariffe in vigore oggi non riproducono questo prezzo: la riga è stata
              quotata con condizioni diverse da quelle correnti. Il prezzo resta quello
              concordato, ma la sua scomposizione per voci non è ricostruibile.
            </p>
          </div>
        </div>

        <template v-else>
          <!-- ② TARIFFE -->
          <section class="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
            <div class="flex items-center gap-3 mb-3">
              <div class="h-7 w-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 text-xs shrink-0">2</div>
              <h3 class="font-bold text-sm text-gray-900 uppercase tracking-wide">Le tariffe</h3>
            </div>

            <dl class="text-sm space-y-1.5">
              <template v-if="d.regime === 'SOLO_TELAIO'">
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500">Canalino perimetrale</dt>
                  <dd class="font-medium text-gray-900 tabular-nums">{{ rate(d.tariffaCanalino) }}</dd>
                </div>
              </template>
              <template v-else>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500">
                    Griglia
                    <span v-if="d.tariffaConcordata" class="text-purple-600 font-bold text-[11px] uppercase ml-1">concordata</span>
                  </dt>
                  <dd class="font-medium text-gray-900 tabular-nums">{{ rate(d.tariffaGriglia) }}</dd>
                </div>
                <div v-if="d.tariffaCanalino > 0" class="flex justify-between gap-4">
                  <dt class="text-gray-500 truncate">{{ d.descrizioneCanalino || 'Canalino' }}</dt>
                  <dd class="font-medium text-gray-900 tabular-nums">{{ rate(d.tariffaCanalino) }}</dd>
                </div>
              </template>
            </dl>

            <p v-if="d.tariffaConcordata" class="text-[11px] text-gray-400 italic mt-2">
              Profilo fuori listino: prezzo al metro concordato con l'azienda.
            </p>
          </section>

          <!-- ③ REGOLA -->
          <section class="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
            <div class="flex items-center gap-3 mb-3">
              <div class="h-7 w-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 text-xs shrink-0">3</div>
              <h3 class="font-bold text-sm text-gray-900 uppercase tracking-wide">La regola applicata</h3>
            </div>

            <div class="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
              <p class="font-bold text-sm text-blue-900">{{ d.regimeLabel }}</p>
              <p class="text-[13px] text-blue-800 leading-snug mt-0.5">{{ d.regimeSpiegazione }}</p>
            </div>

            <p class="text-sm font-mono text-gray-800 tabular-nums">{{ formula }}</p>

            <dl v-if="d.supplementi.length" class="text-sm space-y-1.5 mt-3 pt-3 border-t border-gray-100">
              <div v-for="s in d.supplementi" :key="s.label" class="flex justify-between gap-4">
                <dt class="text-gray-500">+ {{ s.label }}</dt>
                <dd class="font-medium text-gray-900 tabular-nums">{{ eur(s.importo) }}</dd>
              </div>
            </dl>
          </section>

          <!-- ④ TOTALE -->
          <section class="border-2 border-gray-900 rounded-xl p-4 bg-gray-50">
            <div class="flex items-center gap-3 mb-3">
              <div class="h-7 w-7 rounded-full bg-gray-900 flex items-center justify-center font-bold text-white text-xs shrink-0">4</div>
              <h3 class="font-bold text-sm text-gray-900 uppercase tracking-wide">Il totale</h3>
            </div>

            <dl class="text-sm space-y-1.5">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Prezzo a pezzo</dt>
                <dd class="font-medium text-gray-900 tabular-nums">{{ eur(d.prezzoPezzo) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">× {{ d.quantita }} pezzi</dt>
                <dd class="font-bold text-xl font-heading text-gray-900 tabular-nums">{{ eur(d.totaleRiga) }}</dd>
              </div>
            </dl>

            <div v-if="d.tariffaEffettiva !== null" class="mt-3 pt-3 border-t border-gray-300 flex justify-between items-baseline gap-4">
              <span class="text-xs text-gray-500 uppercase tracking-wide font-bold">Verifica</span>
              <span class="text-sm text-gray-700 tabular-nums">
                {{ eur(d.totaleRiga) }} ÷ {{ mt(d.metriTotali) }} = <b class="text-gray-900">{{ rate(d.tariffaEffettiva) }}</b>
              </span>
            </div>
          </section>
        </template>

        <!-- Note -->
        <div v-if="d.lavorazioni.length" class="text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <b class="text-gray-700">Lavorazioni speciali</b> ({{ d.lavorazioni.join(', ') }}):
          non incidono su questo prezzo, sono quotate a parte come voce di supplemento.
        </div>

        <p class="text-[11px] text-gray-400 leading-snug">
          Lo sconto commerciale, se previsto, è applicato sul totale del preventivo e non sulla singola riga.
        </p>
      </div>
    </div>
  </div>
</template>
