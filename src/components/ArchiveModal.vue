<script setup lang="ts">
import { ref, watch } from 'vue';
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue';
import { XMarkIcon, ArchiveBoxIcon, ArrowPathIcon, DocumentTextIcon } from '@heroicons/vue/24/solid';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { ARCHIVE_STATUSES, STATUS_DETAILS } from '../types';
import { useRouter } from 'vue-router';

const props = defineProps<{
  show: boolean;
  isAdmin?: boolean;
  clientEmail?: string; // Se presente, filtra per cliente (usato nella dashboard cliente)
}>();

const emit = defineEmits(['close']);
const router = useRouter();

const archivedOrders = ref<any[]>([]);
const loading = ref(false);
const loaded = ref(false);

const loadArchive = async () => {
  loading.value = true;
  try {
    let q;
    const coll = collection(db, 'preventivi');
    
    // Costruzione query dinamica
    const constraints = [
      where('stato', 'in', ARCHIVE_STATUSES),
      orderBy('dataCreazione', 'desc'),
      limit(50) // Limitiamo a 50 per performance iniziale
    ];

    if (!props.isAdmin && props.clientEmail) {
      // Filtro per cliente specifico (Dashboard Cliente)
      constraints.unshift(where('clienteEmail', '==', props.clientEmail));
    }

    q = query(coll, ...constraints);
    
    const snap = await getDocs(q);
    archivedOrders.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loaded.value = true;
  } catch (e) {
    console.error("Errore caricamento archivio:", e);
  } finally {
    loading.value = false;
  }
};

// Carica solo quando il modale si apre
watch(() => props.show, (isOpen) => {
  if (isOpen && !loaded.value) {
    loadArchive();
  }
});

const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString() : '-';

const openOrder = (codice: string) => {
  const url = `/preventivatore?codice=${codice}${props.isAdmin ? '&admin=true&readonly=true' : ''}`;
  router.push(url);
};

const openDdt = (url: string) => {
  window.open(url, '_blank');
};
</script>

<template>
  <TransitionRoot as="template" :show="show">
    <Dialog as="div" class="relative z-[100]" @close="emit('close')">
      <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0" enter-to="opacity-100" leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
        <div class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" />
      </TransitionChild>

      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
          <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95" enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-200" leave-from="opacity-100 translate-y-0 sm:scale-100" leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95">
            <DialogPanel class="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl flex flex-col max-h-[85vh]">
              
              <div class="bg-gray-100 px-6 py-4 flex justify-between items-center border-b border-gray-200">
                <div class="flex items-center gap-3">
                  <div class="bg-gray-300 p-2 rounded-lg">
                    <ArchiveBoxIcon class="h-6 w-6 text-gray-600" />
                  </div>
                  <div>
                    <DialogTitle as="h3" class="text-lg font-bold text-gray-900 leading-none">
                      Archivio Storico
                    </DialogTitle>
                    <p class="text-xs text-gray-500 mt-1">Ordini Consegnati e Annullati</p>
                  </div>
                </div>
                <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                  <XMarkIcon class="h-6 w-6" />
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
                
                <div v-if="loading" class="flex flex-col items-center justify-center py-10 text-gray-400">
                  <ArrowPathIcon class="h-8 w-8 animate-spin mb-2" />
                  <span class="text-sm">Recupero dati in corso...</span>
                </div>

                <div v-else-if="archivedOrders.length === 0" class="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <ArchiveBoxIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nessun ordine in archivio.</p>
                </div>

                <div v-else class="space-y-3">
                  <div 
                    v-for="order in archivedOrders" 
                    :key="order.id"
                    @click="openOrder(order.codice)"
                    class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer transition-all flex justify-between items-center group"
                  >
                    <div v-if="!isAdmin">
                      <div class="flex items-baseline gap-2 mb-1">
                        <span class="font-bold text-gray-800">{{ order.commessa || order.codice }}</span>
                        <span class="text-[10px] text-gray-400">{{ formatDate(order.dataCreazione?.seconds) }}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] px-2 py-0.5 rounded border uppercase font-bold"
                              :class="STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.badge">
                          {{ STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.label }}
                        </span>
                        
                      </div>
                    </div>

                    <div v-else>
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-gray-800">{{ order.commessa || order.codice }}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded border uppercase font-bold"
                              :class="STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.badge">
                          {{ STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.label }}
                        </span>
                      </div>
                      <div class="text-xs text-gray-500 flex gap-2">
                        <span>{{ order.cliente }}</span>
                        <span>•</span>
                        <span>{{ formatDate(order.dataCreazione?.seconds) }}</span>
                      </div>
                    </div>

                    <div class="text-right">
                      <div class="font-bold text-gray-900">{{ (order.totaleScontato || order.totaleImponibile || 0).toFixed(2) }} €</div>
                      <div v-if="isAdmin" class="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">VEDI ></div>
                      <button 
                          v-if="order.fic_ddt_url" 
                          @click.stop="openDdt(order.fic_ddt_url)"
                          class="flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 px-8 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
                          title="Visualizza DDT"
                        >
                          <DocumentTextIcon class="w-3 h-3" /> DDT
                        </button>
                    </div>
                  </div>
                </div>

              </div>

            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>