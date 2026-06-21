<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { XMarkIcon, TruckIcon, TrashIcon, PlusIcon, MinusCircleIcon, CheckCircleIcon } from '@heroicons/vue/24/solid';
import NovaVehiclePicker from '../nova/NovaVehiclePicker.vue';

// Componente presentazionale: tutti i dati arrivano già pronti dal parent
// (DeliveryView riusa getShipments per i raggruppamenti). Il modal gestisce solo
// la selezione e emette le intenzioni; le scritture Firestore restano nel parent.
const props = defineProps<{
  show: boolean;
  trip: any | null;
  drivers: any[];
  // Tappe attuali del viaggio, raggruppate (DDT/ordine) con flag `delivered`
  tripShipments: any[];
  // Ordini liberi nel pool (stato DELIVERY, non assegnati), raggruppati
  poolShipments: any[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: { driverId: string; vehicleId: string; addIds: string[]; removeIds: string[] }): void;
  (e: 'delete'): void;
}>();

const form = reactive({ driverId: '', vehicleId: '' });
const selectedAddIds = ref<string[]>([]);
const selectedRemoveIds = ref<string[]>([]);

// All'apertura: pre-compila il form col viaggio corrente e azzera le selezioni
watch(() => props.show, (val) => {
  if (val && props.trip) {
    form.driverId = props.trip.driverId ?? '';
    form.vehicleId = props.trip.vehicleId ?? '';
    selectedAddIds.value = [];
    selectedRemoveIds.value = [];
  }
});

// --- Helpers selezione (per gruppo di id: DDT = più ordini insieme) ---
const toggleIn = (current: string[], ids: string[]): string[] => {
  const all = ids.every(id => current.includes(id));
  return all
    ? current.filter(id => !ids.includes(id))
    : [...current, ...ids.filter(id => !current.includes(id))];
};
const selected = (current: string[], ids: string[]) =>
  ids.length > 0 && ids.every(id => current.includes(id));

const toggleAdd = (ids: string[]) => { selectedAddIds.value = toggleIn(selectedAddIds.value, ids); };
const toggleRemove = (ids: string[]) => { selectedRemoveIds.value = toggleIn(selectedRemoveIds.value, ids); };
const isAddSel = (ids: string[]) => selected(selectedAddIds.value, ids);
const isRemoveSel = (ids: string[]) => selected(selectedRemoveIds.value, ids);

// Tappe consegnate: non rimovibili
const removableShipments = computed(() => props.tripShipments.filter(s => !s.delivered));
const deliveredCount = computed(() => props.tripShipments.filter(s => s.delivered).length);

const hasChanges = computed(() =>
  form.driverId !== (props.trip?.driverId ?? '') ||
  form.vehicleId !== (props.trip?.vehicleId ?? '') ||
  selectedAddIds.value.length > 0 ||
  selectedRemoveIds.value.length > 0
);

const driverPlaceholderInvalid = computed(() => !form.driverId);

const save = () => {
  if (!form.driverId) return;
  emit('save', {
    driverId: form.driverId,
    vehicleId: form.vehicleId,
    addIds: [...selectedAddIds.value],
    removeIds: [...selectedRemoveIds.value],
  });
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

      <!-- Header -->
      <div class="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-white/10 rounded-xl"><TruckIcon class="w-5 h-5 text-amber-400"/></div>
          <div>
            <p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Gestisci viaggio</p>
            <h2 class="text-lg font-black leading-tight">{{ trip?.driverName || 'Viaggio' }}</h2>
          </div>
        </div>
        <button @click="emit('close')" class="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <XMarkIcon class="w-5 h-5 text-white"/>
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 overflow-y-auto bg-slate-50 flex-1 space-y-6">

        <!-- Autista / Mezzo -->
        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Autista</label>
            <select v-model="form.driverId" class="w-full bg-white border border-slate-200 focus:border-amber-400 focus:ring-0 rounded-xl px-4 py-3 font-bold text-slate-700 transition-colors">
              <option value="" disabled>Seleziona Autista</option>
              <option v-for="d in drivers" :key="d.id" :value="d.id">{{ d.firstName }} {{ d.lastName }}</option>
            </select>
            <p v-if="driverPlaceholderInvalid" class="text-[11px] text-red-500 ml-1">Un autista è obbligatorio.</p>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Mezzo (opzionale)</label>
            <NovaVehiclePicker v-model="form.vehicleId" />
          </div>
        </div>

        <!-- Tappe del viaggio (rimuovi) -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tappe nel viaggio</h3>
            <span v-if="deliveredCount" class="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{{ deliveredCount }} consegnate</span>
          </div>

          <p v-if="tripShipments.length === 0" class="text-sm text-slate-400 italic text-center py-3 bg-white rounded-xl border border-dashed border-slate-200">Nessuna tappa.</p>

          <div class="space-y-2">
            <!-- Tappe consegnate: solo lettura -->
            <div v-for="s in tripShipments.filter(x => x.delivered)" :key="s.key"
                 class="flex items-center p-3 rounded-xl border border-green-100 bg-green-50/50 opacity-70">
              <CheckCircleIcon class="w-5 h-5 text-green-600 mr-3 shrink-0"/>
              <div class="flex-1 min-w-0">
                <h4 class="font-bold text-slate-700 text-sm truncate">{{ s.cliente }}</h4>
                <p class="text-[11px] text-slate-400">{{ s.citta }} • {{ s.colli }} colli • Consegnato</p>
              </div>
            </div>

            <!-- Tappe rimovibili -->
            <div v-for="s in removableShipments" :key="s.key"
                 @click="toggleRemove(s.ids)"
                 class="flex items-center p-3 rounded-xl border cursor-pointer transition-all"
                 :class="isRemoveSel(s.ids) ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200 hover:border-slate-300'">
              <div class="w-5 h-5 mr-3 shrink-0 flex items-center justify-center">
                <MinusCircleIcon class="w-5 h-5" :class="isRemoveSel(s.ids) ? 'text-red-500' : 'text-slate-300'"/>
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-bold text-slate-900 text-sm truncate">{{ s.cliente }}</h4>
                <p class="text-[11px] text-slate-500">{{ s.citta }} • {{ s.colli }} colli<span v-if="s.isDdt"> • {{ s.info }}</span></p>
              </div>
              <span v-if="isRemoveSel(s.ids)" class="text-[10px] font-black text-red-600 uppercase">Rimuovi</span>
            </div>
          </div>
        </div>

        <!-- Aggiungi ordini dal pool -->
        <div>
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Aggiungi dal pool</h3>

          <p v-if="poolShipments.length === 0" class="text-sm text-slate-400 italic text-center py-3 bg-white rounded-xl border border-dashed border-slate-200">Nessun ordine libero da aggiungere.</p>

          <div class="space-y-2">
            <div v-for="s in poolShipments" :key="s.key"
                 @click="toggleAdd(s.ids)"
                 class="flex items-center p-3 rounded-xl border cursor-pointer transition-all"
                 :class="isAddSel(s.ids) ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200 hover:border-slate-300'">
              <div class="w-5 h-5 mr-3 shrink-0 flex items-center justify-center">
                <CheckCircleIcon v-if="isAddSel(s.ids)" class="w-5 h-5 text-amber-500"/>
                <PlusIcon v-else class="w-5 h-5 text-slate-300"/>
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-bold text-slate-900 text-sm truncate">{{ s.cliente }}</h4>
                <p class="text-[11px] text-slate-500">{{ s.citta }} ({{ s.provincia }}) • {{ s.colli }} colli<span v-if="s.isDdt"> • {{ s.info }}</span></p>
              </div>
              <span v-if="s.isDdt" class="text-[9px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase">DDT</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-4 bg-white border-t border-slate-100 shrink-0 space-y-3">
        <button
          @click="save"
          :disabled="!hasChanges || !form.driverId"
          class="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/20 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          Salva modifiche
        </button>
        <button
          @click="emit('delete')"
          class="w-full py-3 rounded-xl text-red-600 font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 border border-red-100">
          <TrashIcon class="w-4 h-4"/> Elimina viaggio
        </button>
      </div>

    </div>
  </div>
</template>
