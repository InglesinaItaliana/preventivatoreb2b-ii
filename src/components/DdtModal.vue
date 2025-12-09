<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue';
import { TruckIcon } from '@heroicons/vue/24/solid';

const props = defineProps<{
  show: boolean;
  orders: any[];
}>();

const emit = defineEmits(['close', 'confirm']);

const dataDdt = ref('');
const numeroColli = ref(1);
const pesoKg = ref(0); 
const loading = ref(false);

const isSingleOrder = computed(() => props.orders.length === 1);

const modalTitle = computed(() => {
    return isSingleOrder.value ? 'Generazione DDT da Ordine' : 'Generazione DDT Cumulativo';
});

const modalDescription = computed(() => {
    if (isSingleOrder.value) {
        const orderId = props.orders[0]?.codice || 'selezionato';
        return `Stai per convertire l'ordine <strong>${orderId}</strong> in un DDT. Verifica e completa i dati di trasporto.`;
    }
    return `Stai per creare un unico DDT per <strong>${props.orders.length} ordini</strong>. Verifica i dati di trasporto qui sotto.`;
});

const form = reactive({
  date: new Date().toISOString().split('T')[0],
  colli: 1,
  weight: 0,
  tipoTrasporto: 'INTERNAL', // 'INTERNAL' o 'COURIER'
  corriere: '', // Es. BRT, GLS
  tracking: ''
});

const corrieriList = ['BRT', 'GLS', 'TNT', 'DHL', 'SDA', 'UPS', 'FEDEX'];

watch(() => props.orders, (newOrders: any[]) => {
  if (newOrders.length > 0) {
    form.date = newOrders[0].dataConsegnaPrevista || new Date().toISOString().split('T')[0];
    
    const totaleColli = newOrders.reduce((somma: number, ordine: any) => {
        return somma + (ordine.colli ? Number(ordine.colli) : 1);
    }, 0);

    form.colli = totaleColli;
  }
}, { immediate: true, deep: true });

const confirm = () => {
  if (form.colli < 1) return alert("Inserire almeno 1 collo");
  if (!form.date) return alert("Data obbligatoria");

  loading.value = true;
  // Passiamo tutto l'oggetto form
  emit('confirm', { ...form });
};
</script>

<template>
  <TransitionRoot as="template" :show="show">
    <Dialog as="div" class="relative z-[100]" @close="!loading && emit('close')">
      <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0" enter-to="opacity-100" leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
      </TransitionChild>

      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95" enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-200" leave-from="opacity-100 translate-y-0 sm:scale-100" leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95">
            <DialogPanel class="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              
              <div class="sm:flex sm:items-start">
                <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                  <TruckIcon class="h-6 w-6 text-blue-600" aria-hidden="true" />
                </div>
                <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <DialogTitle as="h3" class="text-base font-semibold leading-6 text-gray-900">
                    {{ modalTitle }}
                  </DialogTitle>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500" v-html="modalDescription"></p>
                    <div class="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Modalità Spedizione</label>
                      <div class="flex gap-2">
                        <button 
                          type="button"
                          @click="form.tipoTrasporto = 'INTERNAL'"
                          class="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                          :class="form.tipoTrasporto === 'INTERNAL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'"
                        >
                          Mezzi Interni
                        </button>
                        <button 
                          type="button"
                          @click="form.tipoTrasporto = 'COURIER'"
                          class="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                          :class="form.tipoTrasporto === 'COURIER' ? 'bg-amber-400 text-amber-950 border-amber-400' : 'bg-white text-slate-500 border-slate-200'"
                        >
                          Corriere Esterno
                        </button>
                      </div>
                    </div>

                    <div v-if="form.tipoTrasporto === 'COURIER'" class="mb-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Vettore / Corriere</label>
                        <select v-model="form.corriere" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-amber-200">
                          <option value="" disabled>Seleziona Corriere</option>
                          <option v-for="c in corrieriList" :key="c" :value="c">{{ c }}</option>
                          <option value="ALTRO">Altro</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Codice Tracking</label>
                        <input v-model="form.tracking" type="text" placeholder="Es. 1234567890" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-amber-200">
                      </div>
                    </div>
                    <div class="mt-4 grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-2">
                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Data DDT</label>
                            <input type="date" v-model="dataDdt" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                        </div>

                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">N. Colli Totali</label>
                            <input type="number" v-model.number="numeroColli" min="1" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                        </div>
                        
                        <div class="col-span-2">
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Peso Totale (Kg) <span class="text-gray-300 font-normal">- opzionale</span></label>
                            <input type="number" v-model.number="pesoKg" min="0" step="0.1" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                        </div>
                    </div>
                    
                    <div class="mt-4 bg-gray-50 p-3 rounded text-xs text-gray-500 border border-gray-200">
                        <ul class="list-disc pl-4 space-y-1">
                            <li>Causale: <strong>VENDITA</strong></li>
                            <li>Trasporto a cura di: <strong>MITTENTE</strong></li>
                            <li>Numero Doc: <strong>Automatico (Progressivo)</strong></li>
                        </ul>
                    </div>

                  </div>
                </div>
              </div>

              <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button type="button" class="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto flex items-center gap-2" @click="confirm" :disabled="loading">
                  <svg v-if="loading" class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  {{ loading ? 'Creazione in corso...' : 'Conferma e Crea DDT' }}
                </button>
                <button type="button" class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto" @click="emit('close')" :disabled="loading">Annulla</button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>