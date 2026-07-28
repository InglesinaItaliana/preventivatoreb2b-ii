<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue';
import { XMarkIcon, ArchiveBoxIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/solid';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';
import { resolveBackend } from '../lib/billing';
import { openDdtPdf, openOrderPdf } from '../lib/billingPdf';
import { useArchivio } from '../composables/useArchivio';
import { useClientiSuggeriti } from '../composables/useClientiSuggeriti';
import { raggruppaPerMese } from '../lib/archivio';
import ArchiveOrderRow from './ArchiveOrderRow.vue';

const props = defineProps<{
  show: boolean;
  isAdmin?: boolean;
  clientUid?: string; // Se presente, filtra per cliente (usato nella dashboard cliente)
}>();

const emit = defineEmits(['close']);
const router = useRouter();

const {
  consegnati, annullati, risultatiCommessa, modalita,
  loading, errore, troncato, carica, cercaPerCommessa,
} = useArchivio();

const { suggeriti, cerca: cercaClienti, pulisci: pulisciSuggeriti } = useClientiSuggeriti();

// Gli annullati stanno chiusi in fondo: sono rumore, non storico da consultare.
const mostraAnnullati = ref(false);

// --- Ricerca (solo admin) ---
// Cliente e commessa sono modalità ALTERNATIVE, non filtri che si sommano: chi
// cerca una commessa quasi mai sa di che cliente sia, e metterle in AND
// renderebbe il campo commessa inutile proprio nel caso d'uso principale.
const queryCliente = ref('');
const clienteSelezionato = ref<any | null>(null);
const queryCommessa = ref('');

// Il vincolo per cliente vale sia per la dashboard cliente (il proprio UID, per
// le regole Firestore) sia per l'admin che ne seleziona uno.
const uidVincolato = computed(() =>
  clienteSelezionato.value?.uid || clienteSelezionato.value?.id ||
  (!props.isAdmin && props.clientUid ? props.clientUid : undefined)
);

const ricarica = () => {
  mostraAnnullati.value = false;
  carica(uidVincolato.value);
};

const onDigitaCliente = () => {
  // Digitare qui abbandona qualunque ricerca in corso: cambiare il testo dopo
  // aver scelto un cliente significa volerne un altro, e una ricerca commessa
  // non può restare a video con il proprio campo ormai svuotato.
  const stavaFiltrando = !!clienteSelezionato.value || !!queryCommessa.value;
  queryCommessa.value = '';
  clienteSelezionato.value = null;
  if (stavaFiltrando) ricarica();
  cercaClienti(queryCliente.value);
};

const selezionaCliente = (cliente: any) => {
  clienteSelezionato.value = cliente;
  queryCliente.value = cliente.ragioneSociale || cliente.email || '';
  pulisciSuggeriti();
  ricarica();
};

const avviaRicercaCommessa = () => {
  if (queryCommessa.value.trim().length < 2) return;
  queryCliente.value = '';
  clienteSelezionato.value = null;
  pulisciSuggeriti();
  mostraAnnullati.value = false;
  cercaPerCommessa(queryCommessa.value);
};

const azzeraRicerca = () => {
  queryCliente.value = '';
  queryCommessa.value = '';
  clienteSelezionato.value = null;
  pulisciSuggeriti();
  ricarica();
};

const ricercaAttiva = computed(() => modalita.value !== 'recenti' && !!props.isAdmin);

// --- Presentazione ---
const archivioVuoto = computed(() =>
  modalita.value === 'commessa'
    ? risultatiCommessa.value.length === 0
    : consegnati.value.length === 0 && annullati.value.length === 0
);

// Con un cliente selezionato la lista copre mesi: senza intestazioni di mese
// diventa un muro indistinto. Nella vista "recenti" copre pochi giorni, quindi
// raggrupparla non aggiungerebbe nulla.
const raggruppa = computed(() => modalita.value === 'cliente');
const gruppiConsegnati = computed(() => raggruppa.value ? raggruppaPerMese(consegnati.value) : []);

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    azzeraRicerca();
  }
});

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

              <!-- Ricerca: solo admin. Un cliente vede già solo i propri ordini,
                   e la ricerca commessa richiede una query che le regole
                   Firestore gli negano. -->
              <div v-if="isAdmin" class="px-6 py-3 bg-white border-b border-gray-200 flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="queryCliente"
                    @input="onDigitaCliente"
                    type="text"
                    placeholder="Cerca cliente…"
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                  />
                  <ul
                    v-if="suggeriti.length"
                    class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto"
                  >
                    <li
                      v-for="c in suggeriti"
                      :key="c.id"
                      @click="selezionaCliente(c)"
                      class="px-3 py-2 text-sm text-left hover:bg-amber-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <div class="font-bold text-gray-800">{{ c.ragioneSociale || c.email }}</div>
                      <div v-if="c.ragioneSociale && c.email" class="text-[10px] text-gray-400">{{ c.email }}</div>
                    </li>
                  </ul>
                </div>

                <div class="flex gap-2 sm:w-64">
                  <input
                    v-model="queryCommessa"
                    @keyup.enter="avviaRicercaCommessa"
                    type="text"
                    placeholder="Commessa (inizia per…)"
                    class="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                  />
                  <button
                    @click="avviaRicercaCommessa"
                    :disabled="queryCommessa.trim().length < 2"
                    class="px-3 rounded-lg bg-amber-400 border border-amber-500 text-amber-950 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Cerca commessa"
                  >
                    <MagnifyingGlassIcon class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div v-if="ricercaAttiva" class="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
                <span class="text-xs text-amber-900 truncate">
                  <template v-if="modalita === 'cliente'">
                    Storico di <strong>{{ queryCliente }}</strong>
                  </template>
                  <template v-else>
                    Commesse che iniziano per <strong>{{ queryCommessa.trim().toUpperCase() }}</strong>
                  </template>
                </span>
                <button @click="azzeraRicerca" class="text-xs font-bold text-amber-900 hover:underline shrink-0">
                  Azzera
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

                <div v-else-if="modalita === 'commessa'" class="space-y-3">
                  <ArchiveOrderRow
                    v-for="order in risultatiCommessa"
                    :key="order.id"
                    :order="order"
                    :is-admin="isAdmin"
                    @apri="openOrder"
                    @apri-ddt="openDdt"
                    @apri-ordine="openOrdine"
                  />
                </div>

                <div v-else class="space-y-3">
                  <!-- Consegnati: raggruppati per mese quando la lista copre mesi
                       (storico di un cliente), piatti nella vista dei recenti. -->
                  <template v-if="raggruppa">
                    <div v-for="gruppo in gruppiConsegnati" :key="gruppo.chiave" class="space-y-3">
                      <h4 class="text-xs font-bold uppercase tracking-wide text-gray-500 pt-2 first:pt-0">
                        {{ gruppo.etichetta }}
                      </h4>
                      <ArchiveOrderRow
                        v-for="order in gruppo.ordini"
                        :key="order.id"
                        :order="order"
                        :is-admin="isAdmin"
                        @apri="openOrder"
                        @apri-ddt="openDdt"
                        @apri-ordine="openOrdine"
                      />
                    </div>
                  </template>

                  <template v-else>
                    <ArchiveOrderRow
                      v-for="order in consegnati"
                      :key="order.id"
                      :order="order"
                      :is-admin="isAdmin"
                      @apri="openOrder"
                      @apri-ddt="openDdt"
                      @apri-ordine="openOrdine"
                    />
                  </template>

                  <button
                    v-if="annullati.length"
                    type="button"
                    @click="mostraAnnullati = !mostraAnnullati"
                    class="w-full mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-left text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    <span>Ordini annullati ({{ annullati.length }})</span>
                    <span class="text-[10px] font-bold text-gray-400">{{ mostraAnnullati ? 'Nascondi' : 'Mostra' }}</span>
                  </button>

                  <div v-if="mostraAnnullati" class="space-y-3">
                    <ArchiveOrderRow
                      v-for="order in annullati"
                      :key="order.id"
                      :order="order"
                      :is-admin="isAdmin"
                      @apri="openOrder"
                      @apri-ddt="openDdt"
                      @apri-ordine="openOrdine"
                    />
                  </div>
                </div>

                <p v-if="troncato && !loading" class="mt-4 text-[11px] text-gray-400 text-center">
                  Elenco troncato al limite di caricamento: potrebbero esserci altri ordini più vecchi.
                </p>

              </div>

            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>