<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue';
import { XMarkIcon, ArchiveBoxIcon, ArrowPathIcon, DocumentTextIcon } from '@heroicons/vue/24/solid';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { STATUS_DETAILS } from '../types';
import { useRouter } from 'vue-router';
import { resolveBackend } from '../lib/billing';
import { openDdtPdf, openOrderPdf } from '../lib/billingPdf';
import { useArchivio } from '../composables/useArchivio';

const props = defineProps<{
  show: boolean;
  isAdmin?: boolean;
  clientUid?: string; // Se presente, filtra per cliente (usato nella dashboard cliente)
}>();

const emit = defineEmits(['close']);
const router = useRouter();

const { consegnati, annullati, loading, errore, carica } = useArchivio();

// Gli annullati stanno chiusi in fondo: sono rumore, non storico da consultare.
const mostraAnnullati = ref(false);

const archivioVuoto = computed(() => consegnati.value.length === 0 && annullati.value.length === 0);

// Due sezioni, stessa riga: la seconda è collassata e si apre a richiesta.
const sezioni = computed(() => [
  { key: 'consegnati', orders: consegnati.value, collassabile: false },
  { key: 'annullati', orders: annullati.value, collassabile: true },
]);

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    mostraAnnullati.value = false;
    // Solo il percorso cliente vincola la query al proprio UID; l'admin vede tutto.
    carica(!props.isAdmin && props.clientUid ? props.clientUid : undefined);
  }
});

const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString() : '-';

// La data mostrata deve essere quella su cui la lista è ordinata, altrimenti
// l'ordine sembra casuale: DDT per i consegnati, creazione per gli annullati.
const formatDataOrdinamento = (order: any) => {
  if (order?.stato === 'DELIVERED') {
    const d = order?.dataConsegnaPrevista;
    return d ? new Date(d).toLocaleDateString() : '-';
  }
  return formatDate(order?.dataCreazione?.seconds);
};

const openOrder = (codice: string) => {
  const url = `/preventivatore?codice=${codice}${props.isAdmin ? '&admin=true&readonly=true' : ''}`;
  router.push(url);
};

const openDdt = async (order: any) => {
  // FiC: link al documento FiC (invariato).
  if (resolveBackend(order) !== 'cic') {
    if (order?.fic_ddt_url) window.open(order.fic_ddt_url, '_blank');
    return;
  }
  // CiC: il PDF POPS deve essere fedele al DDT, cioè contenere TUTTI gli ordini
  // del DDT cumulativo (N ordini che condividono cic_ddt_id), non solo questo.
  // Un DDT cumulativo è per singolo cliente → vincolo su clienteUID (anche per le
  // regole Firestore lato cliente).
  try {
    if (order?.cic_ddt_id != null) {
      const constraints: any[] = [where('cic_ddt_id', '==', order.cic_ddt_id)];
      if (!props.isAdmin && props.clientUid) constraints.unshift(where('clienteUID', '==', props.clientUid));
      const snap = await getDocs(query(collection(db, 'preventivi'), ...constraints));
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (orders.length > 1) { openDdtPdf(orders); return; }
    }
  } catch (e) {
    console.error('Errore raccolta ordini del DDT, ripiego sul singolo ordine:', e);
  }
  openDdtPdf(order);
};

const openOrdine = (order: any) => {
  // CiC: PDF ordine POPS. FiC: link al documento FiC.
  if (resolveBackend(order) === 'cic') { openOrderPdf(order); return; }
  if (order?.fic_order_url) window.open(order.fic_order_url, '_blank');
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

                <div v-else-if="errore" class="text-center py-10 text-red-500 border-2 border-dashed border-red-200 rounded-xl">
                  <ArchiveBoxIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{{ errore }}</p>
                </div>

                <div v-else-if="archivioVuoto" class="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <ArchiveBoxIcon class="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nessun ordine in archivio.</p>
                </div>

                <div v-else class="space-y-3">
                  <template v-for="sezione in sezioni" :key="sezione.key">

                  <button
                    v-if="sezione.collassabile && sezione.orders.length"
                    type="button"
                    @click="mostraAnnullati = !mostraAnnullati"
                    class="w-full mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-left text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    <span>Ordini annullati ({{ sezione.orders.length }})</span>
                    <span class="text-[10px] font-bold text-gray-400">{{ mostraAnnullati ? 'Nascondi' : 'Mostra' }}</span>
                  </button>

                  <div v-if="!sezione.collassabile || mostraAnnullati" class="space-y-3">
                  <div
                    v-for="order in sezione.orders"
                    :key="order.id"
                    @click="openOrder(order.codice)"
                    class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer transition-all flex justify-between items-center group"
                  >
                    <div v-if="!isAdmin">
                      <div class="flex items-baseline gap-2 mb-1">
                        <span class="font-bold text-gray-800">{{ order.commessa || order.codice }}</span>
                        <span class="text-[10px] text-gray-400">{{ formatDataOrdinamento(order) }}</span>
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
                        <span>{{ formatDataOrdinamento(order) }}</span>
                      </div>
                    </div>

                    <div class="text-right">
                      <div class="font-bold text-gray-900">{{ (order.totaleScontato || order.totaleImponibile || 0).toFixed(2) }} €</div>
                      <div v-if="isAdmin" class="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">VEDI ></div>
                      <div class="flex items-center justify-end gap-2 mt-1">
                        <button
                            v-if="order.cic_order_id || order.fic_order_id"
                            @click.stop="openOrdine(order)"
                            class="flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 px-8 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
                            title="Visualizza Ordine"
                          >
                            <DocumentTextIcon class="w-3 h-3" /> ORDINE
                          </button>
                        <button
                            v-if="order.fic_ddt_url || order.cic_ddt_id"
                            @click.stop="openDdt(order)"
                            class="flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 px-8 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
                            title="Visualizza DDT"
                          >
                            <DocumentTextIcon class="w-3 h-3" /> DDT
                          </button>
                      </div>
                    </div>
                  </div>
                  </div>

                  </template>
                </div>

              </div>

            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>