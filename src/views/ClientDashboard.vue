<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import { PencilIcon, ShieldExclamationIcon, CheckCircleIcon, PaperAirplaneIcon, ClockIcon, XCircleIcon, CogIcon, WrenchScrewdriverIcon, DocumentTextIcon, PlusIcon, CubeIcon } from '@heroicons/vue/24/solid';
// IMPORT NUOVO COMPONENTE
import OrderModals from '../components/OrderModals.vue';

const router = useRouter();
const listaMieiPreventivi = ref<any[]>([]);
const loading = ref(true);
const currentUserEmail = ref('');
const clientName = ref(localStorage.getItem('clientName') || 'Cliente');

// Variabili Real-Time
let unsub1: null | (() => void) = null;
let unsub2: null | (() => void) = null;
let docsVecchi: any[] = [];
let docsNuovi: any[] = [];
let ready1 = false;
let ready2 = false;

const activeTab = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE'>('PREVENTIVI');

// --- NUOVE VARIABILI MODALE ---
const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN'>('FAST');
const selectedOrder = ref<any>(null);

const caricaProfilo = async (uid: string) => {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      clientName.value = data.ragioneSociale || data.email;
      localStorage.setItem('clientName', clientName.value);
    }
  } catch (e) { console.error("Errore profilo", e); }
};

const aggiornaVista = () => {
  const mapUnici = new Map();
  [...docsVecchi, ...docsNuovi].forEach(doc => mapUnici.set(doc.id, doc));

  const arrayOrdinato = Array.from(mapUnici.values()).sort((a: any, b: any) => {
    const timeA = a.dataCreazione?.seconds || 0;
    const timeB = b.dataCreazione?.seconds || 0;
    return timeB - timeA;
  });

  listaMieiPreventivi.value = arrayOrdinato;
  if (ready1 && ready2) loading.value = false;
};

const avviaAscoltoDati = (email: string) => {
  loading.value = true;
  ready1 = false; ready2 = false;

  // Listener 1: Nuovi Preventivi (con campo clienteEmail)
  const q1 = query(collection(db, 'preventivi'), where('clienteEmail', '==', email));
  unsub1 = onSnapshot(q1, (snap) => {
    docsNuovi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    ready1 = true; aggiornaVista();
  }, () => { ready1 = true; aggiornaVista(); });

  // Listener 2: Vecchi Preventivi (compatibilità)
  const q2 = query(collection(db, 'preventivi'), where('cliente', '==', email));
  unsub2 = onSnapshot(q2, (snap) => {
    docsVecchi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    ready2 = true; aggiornaVista();
  }, () => { ready2 = true; aggiornaVista(); });
};

// --- GESTIONE AZIONI ORDINE ---
const gestisciAzioneOrdine = (p: any) => {
  selectedOrder.value = p;
  
  if (p.stato === 'WAITING_FAST') {
    modalMode.value = 'FAST';
    showModals.value = true;
  } 
  else if (p.stato === 'WAITING_SIGN') {
    modalMode.value = 'SIGN';
    showModals.value = true;
  }
};

// --- CALLBACK DAL COMPONENTE MODALE ---
const onConfirmFast = async () => {
  if(!selectedOrder.value) return;
  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      metodoConferma: 'FAST_TRACK'
    });
    showModals.value = false;
    alert("✅ Ordine Confermato!");
  } catch(e) {
    console.error(e);
    alert("Errore durante la conferma.");
  }
};

const onConfirmSign = async (url: string) => {
  if(!selectedOrder.value) return;
  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      contrattoFirmatoUrl: url,
      metodoConferma: 'UPLOAD_FIRMA'
    });
    showModals.value = false;
    alert("✅ Ordine Confermato e inviato in produzione!");
  } catch(e) { console.error(e); alert("Errore conferma."); }
};

// --- HELPERS ---
const preventiviInCorso = computed(() =>
  listaMieiPreventivi.value.filter(p => ['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'REJECTED'].includes(p.stato || 'DRAFT'))
);

const ordiniConfermati = computed(() =>
  listaMieiPreventivi.value.filter(p => ['ORDER_REQ', 'WAITING_FAST', 'WAITING_SIGN', 'SIGNED'].includes(p.stato))
);

const ordiniInProduzione = computed(() =>
  listaMieiPreventivi.value.filter(p => ['IN_PRODUZIONE', 'READY'].includes(p.stato))
);

const vaiAlBuilder = (codice?: string) => router.push(codice ? `/preventivatore?codice=${codice}` : '/preventivatore');

const getStatusStyling = (stato: string) => {
  const styles: Record<string, any> = {
    'DRAFT': { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: PencilIcon, iconBg: 'bg-gray-100 text-gray-500' },
    'PENDING_VAL': { badge: 'bg-stone-100 text-stone-700 border-stone-200', icon: ShieldExclamationIcon, iconBg: 'bg-stone-100 text-stone-600' },
    'QUOTE_READY': { badge: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircleIcon, iconBg: 'bg-green-100 text-green-600' },
    'ORDER_REQ': { badge: 'bg-stone-100 text-stone-700 border-stone-200', icon: ClockIcon, iconBg: 'bg-stone-100 text-stone-600' },
    'WAITING_FAST': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: PencilIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'WAITING_SIGN': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: PencilIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'SIGNED': { badge: 'bg-stone-100 text-stone-600 border-stone-200', icon: CogIcon, iconBg: 'bg-stone-100 text-stone-600' },
    'IN_PRODUZIONE': { badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: CogIcon, iconBg: 'bg-amber-100 text-amber-700' },
    'READY': { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CubeIcon, iconBg: 'bg-emerald-100 text-emerald-700' },
    'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
  };
  return styles[stato] || styles['DRAFT'];
}

const getStatusLabel = (stato: string) => {
  const map: Record<string, string> = {
    'DRAFT': 'BOZZA', 'PENDING_VAL': 'ATTESA VALIDAZIONE DA INGLESINA ITALIANA', 'QUOTE_READY': 'PREVENTIVO VALIDATO',
    'ORDER_REQ': 'ATTESA VALIDAZIONE DA INGLESINA ITALIANA', 
    'WAITING_FAST': 'ORDINE DA ACCETTARE', 'WAITING_SIGN': 'ORDINE DA FIRMARE',
    'SIGNED': 'ATTESA PRODUZIONE DA INGLESINA ITALIANA', 'IN_PRODUZIONE': 'ORDINE INVIATO IN PRODUZIONE', 'READY': 'ORDINE PRONTO', 'REJECTED': 'ANNULLATO'
  };
  return map[stato] || stato;
};

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
      currentUserEmail.value = user.email;
      if (clientName.value === 'Cliente') clientName.value = user.email.split('@')[0];
      caricaProfilo(user.uid);
      avviaAscoltoDati(user.email);
    } else { router.push('/'); }
  });
});
onUnmounted(() => { if (unsub1) unsub1(); if (unsub2) unsub2(); });
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6 font-sans text-gray-700">
    <div class="max-w-5xl mx-auto">

      <div class="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Area Riservata</p>
            <h1 class="text-4xl font-bold font-heading text-gray-900">{{ clientName }}</h1>
            <p class="text-xs text-gray-500 mt-1">{{ currentUserEmail }}</p>
          </div>
        </div>
        <button @click="vaiAlBuilder()" class="bg-yellow-400 hover:bg-yellow-500 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
          <PlusIcon class="h-5 w-5 text-black" />
          NUOVA COMMESSA
        </button>
      </div>

      <div class="flex border-b border-gray-200 mb-6">
        <button @click="activeTab = 'PREVENTIVI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'PREVENTIVI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400'">
          PREVENTIVI
          <span v-if="preventiviInCorso.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ preventiviInCorso.length }}</span>
          <div v-if="activeTab === 'PREVENTIVI'" class="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-t-full"></div>
        </button>
        <button @click="activeTab = 'ORDINI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'ORDINI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400'">
          ORDINI
          <span v-if="ordiniConfermati.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniConfermati.length }}</span>
          <div v-if="activeTab === 'ORDINI'" class="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-t-full"></div>
        </button>
        <button @click="activeTab = 'PRODUZIONE'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'PRODUZIONE' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400'">
          PRODUZIONE
          <span v-if="ordiniInProduzione.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniInProduzione.length }}</span>
          <div v-if="activeTab === 'PRODUZIONE'" class="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-t-full"></div>
        </button>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400 animate-pulse">Aggiornamento dati...</div>

      <div v-else>
        <div v-if="activeTab === 'PREVENTIVI'" class="grid gap-4">
          <div v-if="preventiviInCorso.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500 mb-4">Non hai preventivi aperti al momento.</p>
            <button @click="vaiAlBuilder()" class="text-blue-600 font-bold underline">Inizia ora</button>
          </div>
          <div v-for="p in preventiviInCorso" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-6 h-6" />
              </div>
              <div class="flex flex-col items-start">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-1" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span>
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">Cod: {{ p.codice }}</p>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-gray-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-gray-400">Totale</div>
              </div>
              <div class="flex gap-2">
                
                <button
                  v-if="p.stato === 'WAITING_FAST'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  ACCETTA ORDINE
                </button>

                <button
                  v-else-if="p.stato === 'WAITING_SIGN'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  FIRMA ORDINE
                </button>

                <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'ORDINI'" class="grid gap-4">
          <div v-if="ordiniConfermati.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-else v-for="p in ordiniConfermati" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-6 h-6" />
              </div>
              <div class="flex flex-col items-start">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-1" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span>
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">Cod: {{ p.codice }}</p>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              
              <div class="flex gap-2">
                
                <button
                  v-if="p.stato === 'WAITING_FAST'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  ACCETTA ORDINE
                </button>

                <button
                  v-else-if="p.stato === 'WAITING_SIGN'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  FIRMA ORDINE
                </button>
              </div>
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo Bloccato</div>
              </div>
              <div>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>            
              </div>

            </div>
          </div>
        </div>
        <div v-if="activeTab === 'PRODUZIONE'" class="grid gap-4">
          <div v-if="ordiniInProduzione.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-else v-for="p in ordiniInProduzione" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-6 h-6" />
              </div>
              <div class="flex flex-col items-start">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-1" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span>
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">Cod: {{ p.codice }}</p>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo Bloccato</div>
              </div>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>
            </div>
          </div>
        </div>
      </div>

      <OrderModals 
        :show="showModals"
        :mode="modalMode"
        :order="selectedOrder"
        :clientName="clientName"
        @close="showModals = false"
        @confirmFast="onConfirmFast"
        @confirmSign="onConfirmSign"
      />

    </div>
  </div>
</template>