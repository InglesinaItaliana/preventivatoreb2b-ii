<script setup lang="ts">
import { ref, watch } from 'vue'; // Rimosso 'computed'
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

// Calcola i valori di default quando si apre la modale o cambiano gli ordini
watch(() => props.orders, (newOrders) => {
  if (newOrders.length > 0) {
    // 1. Data: Prendi la data prevista del PRIMO ordine, o oggi
    dataDdt.value = newOrders[0].dataConsegnaPrevista || new Date().toISOString().split('T')[0];
    
    // 2. Colli: Default 1 collo per ordine (somma)
    numeroColli.value = newOrders.length;
  }
}, { immediate: true });

const confirm = () => {
  if (numeroColli.value < 1) return alert("Inserire almeno 1 collo");
  if (!dataDdt.value) return alert("Data obbligatoria");

  loading.value = true;
  emit('confirm', {
    date: dataDdt.value,
    colli: numeroColli.value,
    weight: pesoKg.value
  });
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
                    Generazione DDT Cumulativo
                  </DialogTitle>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500">
                      Stai per creare un unico DDT per <strong>{{ orders.length }} ordini</strong>.
                      Verifica i dati di trasporto qui sotto.
                    </p>

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