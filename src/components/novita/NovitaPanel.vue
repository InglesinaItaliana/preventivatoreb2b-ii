<script setup lang="ts">
/**
 * NovitaPanel — pulsante con badge + tendina delle novità di POPS.
 *
 * Sta in ClientDashboard, a sinistra di GUIDA. Sostituisce il vecchio schema
 * "un popup, una volta, e poi mai più": le novità restano consultabili.
 *
 * Il contatore delle non lette è PER POSTAZIONE (localStorage, v. useNovita.ts).
 * Il badge NOVITÀ invece è temporale — 7 giorni dalla pubblicazione — e uguale
 * per tutti: sono due segnali distinti, la card li mostra entrambi.
 *
 * Registro tecnico-neutro: POPS non usa la voce LYRA (docs/LYRA.md, scope
 * limitato alla suite SIDERA).
 */
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue';
import {
  AdjustmentsHorizontalIcon, CheckCircleIcon, DocumentTextIcon, ExclamationTriangleIcon, FireIcon,
  MagnifyingGlassIcon, MapPinIcon, PrinterIcon, ShoppingCartIcon, SparklesIcon, TruckIcon,
} from '@heroicons/vue/24/solid';
import { useNovita } from '../../composables/useNovita';
import {
  ETICHETTA_TIPO, dataRelativa, iconaDi, isNuova, oggiISO,
  type IconaNovita, type Novita, type TipoNovita,
} from '../../lib/novita';
import AnnuncioPrezzoModal from '../AnnuncioPrezzoModal.vue';
import AnnuncioDestinazioneModal from '../AnnuncioDestinazioneModal.vue';

/**
 * Mappa id novità → modale illustrata. Import STATICI di proposito: un
 * `defineAsyncComponent` scarica il chunk al click, e su una scheda rimasta
 * aperta da prima di un deploy quel chunk non esiste più (v. il recupero chunk
 * in lib/recuperoChunk.ts) — la novità si aprirebbe con un errore.
 *
 * Una novità senza modale è legittima: la tendina apre una scheda di testo con
 * titolo e sommario. Serve per gli annunci minori, che non meritano un
 * componente dedicato.
 */
const MODALI: Record<string, Component> = {
  'dettaglio-prezzo-v1': AnnuncioPrezzoModal,
  'destinazione-merce-v1': AnnuncioDestinazioneModal,
};

/**
 * Icone disponibili per le voci del registro. Il tipo `Record<IconaNovita, …>`
 * è la guardia: aggiungere una chiave in `IconaNovita` senza registrarla qui
 * non compila. Dove possibile è la STESSA icona della modale che si apre — la
 * riga e la modale devono sembrare la stessa cosa.
 */
const ICONE: Record<IconaNovita, Component> = {
  mappa: MapPinIcon,
  lente: MagnifyingGlassIcon,
  stampante: PrinterIcon,
  documento: DocumentTextIcon,
  carrello: ShoppingCartIcon,
  camion: TruckIcon,
  regolazione: AdjustmentsHorizontalIcon,
  stella: SparklesIcon,
  avviso: ExclamationTriangleIcon,
  fiamma: FireIcon,
};

/**
 * Tavolozza per tipo. L'ambra è il colore di POPS e se la prende il caso più
 * frequente (una funzione nuova); l'avviso è l'unico che può permettersi il
 * rosso, altrimenti smette di significare "guarda qui".
 */
const STILE_TIPO: Record<TipoNovita, { medaglione: string; etichetta: string }> = {
  funzione:      { medaglione: 'bg-amber-100 text-amber-600', etichetta: 'text-amber-600' },
  miglioramento: { medaglione: 'bg-blue-50 text-blue-600',    etichetta: 'text-blue-500' },
  avviso:        { medaglione: 'bg-red-50 text-red-600',      etichetta: 'text-red-500' },
};

const { elenco, nonLette, isLetta, segnaLetta, segnaTutteLette } = useNovita();

const aperto = ref(false);
const radice = ref<HTMLElement | null>(null);
const voceAperta = ref<Novita | null>(null);

const badge = computed(() => (nonLette.value > 9 ? '9+' : String(nonLette.value)));
const modaleAttiva = computed<Component | null>(() =>
  voceAperta.value ? MODALI[voceAperta.value.id] ?? null : null,
);

const oggi = () => oggiISO();

const apriVoce = (n: Novita) => {
  segnaLetta(n.id);
  aperto.value = false; // la modale ha il suo fondale: la tendina sotto è rumore
  voceAperta.value = n;
};

const chiudiVoce = () => { voceAperta.value = null; };

// Click fuori: il pulsante sta DENTRO `radice`, quindi il suo click non passa
// da qui e non c'è il rimbalzo chiudi-e-riapri.
const clickFuori = (e: MouseEvent) => {
  if (!aperto.value) return;
  if (radice.value && !radice.value.contains(e.target as Node)) aperto.value = false;
};
const tastoEsc = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  // Se è aperta la modale tocca a lei: qui chiudiamo solo la tendina.
  if (!voceAperta.value) aperto.value = false;
};

onMounted(() => {
  document.addEventListener('click', clickFuori);
  document.addEventListener('keydown', tastoEsc);
});
onUnmounted(() => {
  document.removeEventListener('click', clickFuori);
  document.removeEventListener('keydown', tastoEsc);
});
</script>

<template>
  <div ref="radice" class="relative">

    <button
      @click="aperto = !aperto"
      class="relative bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 p-2 rounded-full shadow-sm flex items-center transition-transform active:scale-95"
      :class="{ 'ring-2 ring-amber-300': aperto }"
      :title="nonLette ? `Novità (${nonLette} da leggere)` : 'Novità'"
      :aria-label="nonLette ? `Novità, ${nonLette} da leggere` : 'Novità'"
      aria-haspopup="true"
      :aria-expanded="aperto"
    >
      <FireIcon class="h-5 w-5 text-gray-600" />
      <span
        v-if="nonLette"
        class="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-white tabular-nums"
      >{{ badge }}</span>
    </button>

    <!-- Tendina. z sotto le modali POPS (z-[999]) e sopra le card. -->
    <div
      v-if="aperto"
      class="absolute z-[500] top-full mt-2 left-0 md:left-auto md:right-0 w-[min(22rem,calc(100vw-3rem))] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden tendina"
    >
      <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <span class="font-bold font-heading text-gray-900 text-sm uppercase tracking-wide">Novità</span>
        <button
          v-if="nonLette"
          @click="segnaTutteLette()"
          class="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-amber-600 transition-colors"
        >Segna tutte come lette</button>
      </div>

      <div class="max-h-[70vh] overflow-y-auto">
        <p v-if="!elenco.length" class="px-4 py-8 text-center text-sm text-gray-400">
          Nessuna novità per ora.
        </p>

        <button
          v-for="n in elenco"
          :key="n.id"
          @click="apriVoce(n)"
          class="w-full text-left px-4 py-2.5 flex items-start gap-3 border-b last:border-0 border-gray-50 hover:bg-amber-50/60 transition-colors"
        >
          <!-- Medaglione: colore dal TIPO, icona dalla singola novità. -->
          <span
            class="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            :class="STILE_TIPO[n.tipo].medaglione"
          >
            <component :is="ICONE[iconaDi(n)]" class="h-[18px] w-[18px]" />
          </span>

          <!-- Solo tipo, titolo e data: il sommario si legge nella scheda, qui
               allungherebbe ogni riga di due righe per niente. -->
          <span class="min-w-0 flex-1">
            <span
              class="block text-[10px] font-bold uppercase tracking-widest leading-tight"
              :class="STILE_TIPO[n.tipo].etichetta"
            >{{ ETICHETTA_TIPO[n.tipo] }}</span>
            <span
              class="block text-sm text-gray-900 leading-snug line-clamp-2"
              :class="isLetta(n.id) ? 'font-medium' : 'font-bold'"
            >{{ n.titolo }}</span>
            <span class="block text-[10px] uppercase tracking-wide text-gray-400 leading-tight mt-0.5">{{ dataRelativa(n, oggi()) }}</span>
          </span>

          <!-- Colonna dei segnali: NOVITÀ è temporale (7 giorni), il pallino è
               "non letta su questo PC". Due cose diverse, stessa colonna. -->
          <span class="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
            <span
              v-if="isNuova(n, oggi())"
              class="bg-amber-400 text-amber-950 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            >Novità</span>
            <span v-if="!isLetta(n.id)" class="h-2 w-2 rounded-full bg-red-500"></span>
          </span>
        </button>
      </div>
    </div>

    <!-- Le modali vanno in <body>: un `position: fixed` dentro un antenato con
         transform/filter/backdrop-blur si ancora all'antenato, non alla
         finestra, e il fondale coprirebbe mezza pagina. Teleport ci mette al
         riparo da qualsiasi CSS futuro sull'header. -->
    <Teleport to="body">
      <!-- Novità con modale illustrata dedicata -->
      <component :is="modaleAttiva" v-if="modaleAttiva" :show="true" @close="chiudiVoce" />

      <!-- Novità senza modale illustrata: scheda costruita dal registro, così
           pubblicare un annuncio minore non costa un componente nuovo. Testata
           con lo STESSO medaglione della riga da cui si è cliccato: clicchi la
           stampante, si apre la stampante. -->
      <div
        v-else-if="voceAperta"
        class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        @click.self="chiudiVoce()"
      >
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

          <div class="bg-amber-400 p-5 text-amber-950 shrink-0 rounded-t-xl flex gap-4">
            <span
              class="h-12 w-12 rounded-xl bg-white/90 flex items-center justify-center shrink-0"
              :class="STILE_TIPO[voceAperta.tipo].etichetta"
            >
              <component :is="ICONE[iconaDi(voceAperta)]" class="h-6 w-6" />
            </span>
            <div class="min-w-0">
              <p class="text-[10px] font-bold uppercase tracking-widest text-amber-900/80">
                {{ ETICHETTA_TIPO[voceAperta.tipo] }} · {{ dataRelativa(voceAperta, oggi()) }}
              </p>
              <h2 class="font-bold text-2xl font-heading leading-tight mt-0.5">{{ voceAperta.titolo }}</h2>
            </div>
          </div>

          <div class="p-5 space-y-4 overflow-auto">
            <p class="text-sm text-gray-600 leading-relaxed">{{ voceAperta.sommario }}</p>

            <!-- "Il pulsante è questo": mostrarlo vale più che descriverlo. -->
            <div
              v-if="voceAperta.pulsante"
              class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
            >
              <span class="h-8 w-8 rounded-lg bg-amber-400 text-amber-950 flex items-center justify-center shrink-0">
                <component :is="ICONE[voceAperta.pulsante.icona]" class="h-4 w-4" />
              </span>
              <span class="text-xs text-gray-600">{{ voceAperta.pulsante.testo }}</span>
            </div>

            <ul v-if="voceAperta.punti?.length" class="space-y-2">
              <li v-for="(p, i) in voceAperta.punti" :key="i" class="flex gap-2.5 text-sm text-gray-700">
                <CheckCircleIcon class="h-5 w-5 text-amber-500 shrink-0" />
                <span>{{ p }}</span>
              </li>
            </ul>
          </div>

          <div class="p-5 pt-0 shrink-0">
            <button
              @click="chiudiVoce()"
              class="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 py-3 rounded-lg font-bold shadow-md transition-colors"
            >Ho capito</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Le utility `animate-in` usate altrove in POPS non esistono (nessun plugin
   tailwindcss-animate installato): qui l'animazione è vera. */
.tendina {
  animation: novita-apri 0.16s cubic-bezier(0.175, 0.885, 0.32, 1.1);
  transform-origin: top;
}
@keyframes novita-apri {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
