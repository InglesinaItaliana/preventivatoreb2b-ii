<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
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
  ordini, risultatiCommessa, modalita,
  loading, caricandoAltri, errore, troncato, altri,
  carica, caricaAltri, cercaPerCommessa,
} = useArchivio();

const { suggeriti, cerca: cercaClienti, pulisci: pulisciSuggeriti } = useClientiSuggeriti();

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
  contenitore.value?.scrollTo({ top: 0 });
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

// La ricerca parte da sola dopo una pausa di digitazione: senza attesa si
// sparerebbe una query per tasto premuto, con l'attesa giusta si scrive la
// commessa di fiato e parte una sola query.
const PAUSA_DIGITAZIONE_MS = 400;
let timerCommessa: ReturnType<typeof setTimeout> | null = null;
// Copre ANCHE la pausa di digitazione, non solo la query: senza, i primi
// 400 ms sarebbero muti e sembrerebbe che il campo non faccia niente.
const attesaCommessa = ref(false);

const fermaTimerCommessa = () => {
  if (timerCommessa) clearTimeout(timerCommessa);
  timerCommessa = null;
  attesaCommessa.value = false;
};

const ricercaCommessaInCorso = computed(() =>
  attesaCommessa.value || (loading.value && modalita.value === 'commessa')
);

const avviaRicercaCommessa = () => {
  fermaTimerCommessa();
  if (queryCommessa.value.trim().length < 2) return;
  queryCliente.value = '';
  clienteSelezionato.value = null;
  pulisciSuggeriti();
  cercaPerCommessa(queryCommessa.value);
};

const onDigitaCommessa = () => {
  fermaTimerCommessa();
  if (queryCommessa.value.trim().length < 2) {
    // Campo svuotato: si torna ai recenti, invece di lasciare a video i
    // risultati di una ricerca che non è più scritta da nessuna parte.
    if (modalita.value === 'commessa') {
      queryCliente.value = '';
      clienteSelezionato.value = null;
      ricarica();
    }
    return;
  }
  attesaCommessa.value = true;
  timerCommessa = setTimeout(avviaRicercaCommessa, PAUSA_DIGITAZIONE_MS);
};

const azzeraRicerca = () => {
  fermaTimerCommessa();
  queryCliente.value = '';
  queryCommessa.value = '';
  clienteSelezionato.value = null;
  pulisciSuggeriti();
  ricarica();
};

// Un timer in volo su una modale chiusa farebbe partire una query fantasma.
onBeforeUnmount(() => {
  fermaTimerCommessa();
  smontaOsservatore();
});

const ricercaAttiva = computed(() => modalita.value !== 'recenti' && !!props.isAdmin);

// --- Presentazione ---
const archivioVuoto = computed(() =>
  modalita.value === 'commessa' ? risultatiCommessa.value.length === 0 : ordini.value.length === 0
);

// "Nessun ordine in archivio" è vero solo nella vista dei recenti: dopo una
// ricerca a vuoto direbbe che l'archivio è vuoto, che è un'altra cosa.
const messaggioVuoto = computed(() => {
  if (modalita.value === 'commessa') {
    return `Nessuna commessa che inizia per “${queryCommessa.value.trim().toUpperCase()}”.`;
  }
  if (modalita.value === 'cliente' && props.isAdmin) {
    return 'Questo cliente non ha ordini in archivio.';
  }
  return 'Nessun ordine in archivio.';
});

// Con un cliente selezionato la lista copre mesi: senza intestazioni di mese
// diventa un muro indistinto. Nella vista "recenti" copre pochi giorni, quindi
// raggrupparla non aggiungerebbe nulla.
const raggruppa = computed(() => modalita.value === 'cliente');
const gruppi = computed(() => raggruppa.value ? raggruppaPerMese(ordini.value) : []);

// --- Scroll infinito ---
// Una sentinella in fondo alla lista: quando entra nel campo visivo del
// contenitore, la pagina successiva parte da sola. IntersectionObserver e non
// un listener di scroll, che si attiverebbe a ogni pixel.
const contenitore = ref<HTMLElement | null>(null);
const sentinella = ref<HTMLElement | null>(null);
let osservatore: IntersectionObserver | null = null;

const smontaOsservatore = () => {
  osservatore?.disconnect();
  osservatore = null;
};

const montaOsservatore = async () => {
  smontaOsservatore();
  await nextTick();
  if (!contenitore.value || !sentinella.value) return;
  osservatore = new IntersectionObserver(
    voci => { if (voci.some(v => v.isIntersecting)) caricaAltri(); },
    // rootMargin: si parte poco PRIMA del bordo, così la pagina è già lì
    // quando ci si arriva invece di far vedere il vuoto.
    { root: contenitore.value, rootMargin: '200px' }
  );
  osservatore.observe(sentinella.value);
};

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    azzeraRicerca();
    montaOsservatore();
  } else {
    smontaOsservatore();
  }
});

// La sentinella compare e scompare col v-if della lista: va riosservata.
watch(sentinella, () => { if (props.show) montaOsservatore(); });

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

                <!-- Niente pulsante "cerca": la ricerca parte da sola dopo la
                     pausa di digitazione, quindi sarebbe un comando che non fa
                     nulla di più. L'icona resta, ma come segnale (e come
                     indicatore di attesa), non come controllo. -->
                <div class="relative sm:w-64">
                  <input
                    v-model="queryCommessa"
                    @input="onDigitaCommessa"
                    @keyup.enter="avviaRicercaCommessa"
                    type="text"
                    placeholder="Commessa (inizia per…)"
                    class="w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                  />
                  <span class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                    <ArrowPathIcon v-if="ricercaCommessaInCorso" class="h-4 w-4 animate-spin" />
                    <MagnifyingGlassIcon v-else class="h-4 w-4" />
                  </span>
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

              <div ref="contenitore" class="flex-1 overflow-y-auto p-6 bg-gray-50">
                
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
                  <p>{{ messaggioVuoto }}</p>
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
                  <!-- Una lista sola: consegnati e annullati insieme, in ordine
                       di data. Raggruppata per mese quando copre mesi. -->
                  <template v-if="raggruppa">
                    <div v-for="gruppo in gruppi" :key="gruppo.chiave" class="space-y-3">
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
                      v-for="order in ordini"
                      :key="order.id"
                      :order="order"
                      :is-admin="isAdmin"
                      @apri="openOrder"
                      @apri-ddt="openDdt"
                      @apri-ordine="openOrdine"
                    />
                  </template>

                  <!-- Sentinella dello scroll infinito: entrando nel campo
                       visivo fa partire la pagina successiva. Dichiara anche
                       che scorrendo ne arrivano altri, invece di lasciare
                       credere che la lista finisca qui. -->
                  <div ref="sentinella" class="pt-2 pb-1 text-center">
                    <div v-if="altri" class="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      <ArrowPathIcon v-if="caricandoAltri" class="h-3.5 w-3.5 animate-spin" />
                      <span>{{ caricandoAltri ? 'Carico altri ordini…' : 'Scorri per caricarne altri' }}</span>
                    </div>
                    <div v-else class="text-[11px] text-gray-300">
                      Fine dell'archivio
                    </div>
                  </div>
                </div>

                <p v-if="troncato && !loading" class="mt-4 text-[11px] text-gray-400 text-center">
                  Troppi risultati: affina il termine di ricerca.
                </p>

              </div>

            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>