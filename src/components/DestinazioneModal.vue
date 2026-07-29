<script setup lang="ts">
/**
 * Scelta del luogo di consegna di un ordine.
 * Usata sia dal cliente (modale di conferma ordine) sia dall'admin (card ordine),
 * perché l'indirizzo arriva tanto dal portale quanto per telefono.
 *
 * Non scrive nulla: emette la destinazione scelta e lascia al chiamante il
 * salvataggio: chi apre la modale sa se sta scrivendo su un preventivo, su una
 * rubrica o su entrambi.
 */
import { ref, computed, watch } from 'vue';
import { MapPinIcon, HomeIcon, PlusCircleIcon } from '@heroicons/vue/24/solid';
import {
  SIGLE_PROVINCE, validaDestinazione, formatDestinazione, hasDestinazione,
  type DestinazioneMerce, type DestinazioneSalvata,
} from '../lib/destinazione';

const props = defineProps<{
  show: boolean;
  /** Destinazione attualmente sull'ordine (null/undefined = consegna standard). */
  destinazione?: DestinazioneMerce | null;
  /** Rubrica del cliente (users/{uid}.destinazioni). */
  rubrica?: DestinazioneSalvata[];
  /** Indirizzo di sede del cliente, mostrato come opzione "standard". */
  indirizzoCliente?: string;
  /** Nome del cliente, per l'opzione standard. */
  nomeCliente?: string;
  salvataggioInCorso?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', payload: {
    destinazione: DestinazioneMerce | null;
    salvaInRubrica: boolean;
    etichetta: string;
  }): void;
}>();

type Scelta = 'STANDARD' | 'RUBRICA' | 'NUOVO';

const scelta = ref<Scelta>('STANDARD');
const idRubricaScelto = ref<string>('');
const salvaInRubrica = ref(false);
const etichetta = ref('');
const mostraErrori = ref(false);

const vuota = (): DestinazioneMerce => ({
  destinatario: '', indirizzo: '', cap: '', citta: '',
  provincia: '', telefono: '', referente: '', note: '',
});
const form = ref<DestinazioneMerce>(vuota());

// Riapre sempre sullo stato reale dell'ordine: una modale che ricorda la scelta
// precedente farebbe salvare una destinazione che l'utente credeva di aver annullato.
watch(() => props.show, (aperta) => {
  if (!aperta) return;
  mostraErrori.value = false;
  salvaInRubrica.value = false;
  etichetta.value = '';
  idRubricaScelto.value = '';
  if (hasDestinazione(props.destinazione)) {
    scelta.value = 'NUOVO';
    form.value = { ...vuota(), ...props.destinazione };
  } else {
    scelta.value = 'STANDARD';
    form.value = vuota();
  }
});

const scegliDallaRubrica = (voce: DestinazioneSalvata) => {
  scelta.value = 'RUBRICA';
  idRubricaScelto.value = voce.id;
  const { id: _id, etichetta: _et, ...dati } = voce;
  form.value = { ...vuota(), ...dati };
};

const destinazioneScelta = computed<DestinazioneMerce | null>(() =>
  scelta.value === 'STANDARD' ? null : form.value);

const errori = computed(() =>
  scelta.value === 'STANDARD' ? [] : validaDestinazione(form.value));

const puoConfermare = computed(() => errori.value.length === 0);

const conferma = () => {
  if (!puoConfermare.value) { mostraErrori.value = true; return; }
  emit('confirm', {
    destinazione: destinazioneScelta.value,
    // Si salva in rubrica solo un indirizzo digitato adesso: risalvare una voce
    // già in rubrica creerebbe doppioni a ogni ordine.
    salvaInRubrica: scelta.value === 'NUOVO' && salvaInRubrica.value,
    etichetta: etichetta.value.trim() || form.value.citta.trim(),
  });
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[110] overflow-y-auto bg-gray-900/60 backdrop-blur-sm">
    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-6">

        <div class="flex items-center gap-3 mb-4 border-b pb-3">
          <MapPinIcon class="h-7 w-7 text-indigo-600" />
          <h3 class="text-lg font-bold text-gray-900">Dove consegniamo la merce</h3>
        </div>

        <!-- Consegna standard -->
        <button
          type="button"
          @click="scelta = 'STANDARD'"
          class="w-full text-left mb-2 p-3 rounded-xl border transition-colors flex items-start gap-3"
          :class="scelta === 'STANDARD' ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200 hover:bg-gray-50'"
        >
          <HomeIcon class="h-5 w-5 shrink-0 mt-0.5" :class="scelta === 'STANDARD' ? 'text-indigo-600' : 'text-gray-400'" />
          <span class="min-w-0">
            <span class="block text-sm font-bold text-gray-900">Indirizzo abituale</span>
            <span class="block text-xs text-gray-500 truncate">{{ indirizzoCliente || nomeCliente || 'La tua sede' }}</span>
          </span>
        </button>

        <!-- Rubrica -->
        <button
          v-for="voce in (rubrica || [])"
          :key="voce.id"
          type="button"
          @click="scegliDallaRubrica(voce)"
          class="w-full text-left mb-2 p-3 rounded-xl border transition-colors flex items-start gap-3"
          :class="scelta === 'RUBRICA' && idRubricaScelto === voce.id ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200 hover:bg-gray-50'"
        >
          <MapPinIcon class="h-5 w-5 shrink-0 mt-0.5" :class="scelta === 'RUBRICA' && idRubricaScelto === voce.id ? 'text-indigo-600' : 'text-gray-400'" />
          <span class="min-w-0">
            <span class="block text-sm font-bold text-gray-900">{{ voce.etichetta || voce.destinatario }}</span>
            <span class="block text-xs text-gray-500 truncate">{{ voce.destinatario }} — {{ formatDestinazione(voce) }}</span>
          </span>
        </button>

        <!-- Nuovo indirizzo -->
        <button
          type="button"
          @click="scelta = 'NUOVO'"
          class="w-full text-left mb-3 p-3 rounded-xl border transition-colors flex items-center gap-3"
          :class="scelta === 'NUOVO' ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-gray-200 hover:bg-gray-50'"
        >
          <PlusCircleIcon class="h-5 w-5 shrink-0" :class="scelta === 'NUOVO' ? 'text-indigo-600' : 'text-gray-400'" />
          <span class="text-sm font-bold text-gray-900">Un altro indirizzo</span>
        </button>

        <div v-if="scelta === 'NUOVO'" class="space-y-3 mb-4 animate-in fade-in">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Destinatario *</label>
            <input v-model="form.destinatario" type="text" placeholder="Ragione sociale o nome di chi riceve"
                   class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Indirizzo *</label>
            <input v-model="form.indirizzo" type="text" placeholder="Via e numero civico"
                   class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
          </div>
          <div class="grid grid-cols-[5.5rem_1fr_5rem] gap-2">
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">CAP *</label>
              <input v-model="form.cap" type="text" inputmode="numeric" maxlength="5" placeholder="20121"
                     class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Città *</label>
              <input v-model="form.citta" type="text" placeholder="Milano"
                     class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Prov.</label>
              <select v-model="form.provincia"
                      class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">—</option>
                <option v-for="s in SIGLE_PROVINCE" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Referente</label>
              <input v-model="form.referente" type="text" placeholder="Chi ritira"
                     class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Telefono</label>
              <input v-model="form.telefono" type="tel" placeholder="Facoltativo"
                     class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
            </div>
          </div>
          <p class="text-[10px] text-gray-400 leading-tight -mt-1">
            Il telefono non è obbligatorio, ma senza un numero il corriere può non riuscire a consegnare.
          </p>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Note per la consegna</label>
            <input v-model="form.note" type="text" placeholder="Citofono, orari, accesso mezzi…"
                   class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
          </div>

          <label class="flex items-center gap-2 cursor-pointer select-none pt-1">
            <input type="checkbox" v-model="salvaInRubrica" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400">
            <span class="text-xs font-medium text-gray-700">Salva questo indirizzo per i prossimi ordini</span>
          </label>
          <input v-if="salvaInRubrica" v-model="etichetta" type="text" placeholder="Nome dell'indirizzo (es. Cantiere Via Roma)"
                 class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200">
        </div>

        <div v-if="mostraErrori && errori.length" class="mb-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <p v-for="e in errori" :key="e" class="text-xs text-red-700 font-medium">• {{ e }}</p>
        </div>

        <div class="flex justify-end gap-3 pt-1">
          <button type="button" @click="emit('close')" :disabled="salvataggioInCorso"
                  class="px-4 py-2 rounded-full text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium text-sm disabled:opacity-50">
            Annulla
          </button>
          <button type="button" @click="conferma" :disabled="salvataggioInCorso"
                  class="px-5 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 font-bold text-sm shadow-md disabled:opacity-50">
            {{ salvataggioInCorso ? 'Salvataggio…' : 'Conferma' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
