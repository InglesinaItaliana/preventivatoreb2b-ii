<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  DocumentTextIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  CogIcon, 
  PlusCircleIcon, 
  ExclamationTriangleIcon,
  ShoppingCartIcon, // NUOVA
  TruckIcon,        // NUOVA
  ArchiveBoxIcon    // NUOVA
} from '@heroicons/vue/24/solid';
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

// AGGIORNATO TIPO ACTIVE TAB
const activeTab = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE' | 'SPEDIZIONI' | 'ARCHIVIO'>('PREVENTIVI');

// --- NUOVE VARIABILI PER IL MODALE RISULTATO (SUCCESS/ERROR) ---
const resultModal = ref({
  show: false,
  title: '',
  message: '',
  type: 'SUCCESS' as 'SUCCESS' | 'ERROR'
});

// Helper per aprire il modale
const openResultModal = (title: string, message: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
  resultModal.value = { show: true, title, message, type };
};
const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN'>('FAST');
const selectedOrder = ref<any>(null);
const showConfirmQuoteModal = ref(false); 

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

const openConfirmModal = (p: any) => {
  selectedOrder.value = p;
  showConfirmQuoteModal.value = true;
};

// 1. Callback Conferma FAST
const onConfirmFast = async () => {
  if(!selectedOrder.value) return;
  const user = auth.currentUser; 
  if (!user) return openResultModal("Attenzione", "Utente non loggato. Ricarica la pagina.", "ERROR");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      metodoConferma: 'FAST_TRACK',
      clienteUID: user.uid
    });
    showModals.value = false;
    openResultModal("Ordine Confermato!", "L'ordine è stato accettato con successo ed è pronto per la produzione.", "SUCCESS");
  } catch(e) {
    console.error(e);
    openResultModal("Errore", "Si è verificato un errore durante la conferma.", "ERROR");
  }
};

// 2. Callback Conferma SIGN (Firma caricata)
const onConfirmSign = async (url: string) => {
  if(!selectedOrder.value) return;
  const user = auth.currentUser;
  if (!user) return openResultModal("Attenzione", "Utente non loggato.", "ERROR");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      contrattoFirmatoUrl: url,
      metodoConferma: 'UPLOAD_FIRMA',
      clienteUID: user.uid
    });

    showModals.value = false;
    openResultModal("Documento Caricato!", "Il contratto firmato è stato ricevuto. L'ordine è ora in produzione.", "SUCCESS");
  } catch(e) { 
    console.error(e); 
    openResultModal("Errore", "Impossibile salvare il documento firmato.", "ERROR");
  }
};

// 3. Callback Invio Ordine
const handleFinalOrderConfirmation = async () => {
  if(!selectedOrder.value) return;

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'ORDER_REQ', 
      dataInvioOrdine: serverTimestamp()
    });
    
    showConfirmQuoteModal.value = false;
    openResultModal("Richiesta Inviata", "Il preventivo è stato inviato correttamente per l'elaborazione.", "SUCCESS");
  } catch (e) {
    console.error("Errore invio ordine:", e);
    showConfirmQuoteModal.value = false;
    openResultModal("Errore Invio", "C'è stato un problema durante l'invio dell'ordine.", "ERROR");
  }
};

// --- HELPERS ---

const sortByOrder = (list: any[], order: string[]) => {
  return list.sort((a, b) => {
    const statA = a.stato || 'DRAFT';
    const statB = b.stato || 'DRAFT';
    const indexA = order.indexOf(statA);
    const indexB = order.indexOf(statB);
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return 0;
  });
};

// 1. PREVENTIVI (MODIFICATO: DRAFT -> QUOTE_READY -> PENDING_VAL)
const preventiviInCorso = computed(() => {
  const customOrder = ['DRAFT', 'QUOTE_READY', 'PENDING_VAL']; 
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato || 'DRAFT'));
  return sortByOrder([...filtered], customOrder);
});

// 2. ORDINI (MODIFICATO: WAITING_FAST/SIGN -> ORDER_REQ)
const ordiniConfermati = computed(() => {
  const customOrder = ['WAITING_FAST', 'WAITING_SIGN', 'ORDER_REQ'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 3. PRODUZIONE (MODIFICATO: SIGNED -> IN_PRODUZIONE)
const ordiniInProduzione = computed(() => {
  const customOrder = ['SIGNED', 'IN_PRODUZIONE'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 4. SPEDIZIONI (Solo READY)
const ordiniSpediti = computed(() => {
  const customOrder = ['READY'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 5. ARCHIVIO (Solo REJECTED)
const archivioPreventivi = computed(() => {
  const customOrder = ['REJECTED'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});


const vaiAlBuilder = (codice?: string) => {
  const route = codice ? `/preventivatore?codice=${codice}` : '/preventivatore';
  router.push(route);
};

const getStatusStyling = (stato: string) => {
  const styles: Record<string, any> = {
    'DRAFT': { badge: 'bg-orange-100 text-orange-500 border-orange-200', icon: DocumentTextIcon, iconBg: 'bg-orange-100 text-orange-500' },
    'PENDING_VAL': { badge: 'bg-stone-200 text-stone-700 border-stone-200', icon: DocumentTextIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'QUOTE_READY': { badge: 'bg-green-100 text-green-600 border-green-200', icon: DocumentTextIcon, iconBg: 'bg-green-100 text-green-600' },
    'ORDER_REQ': { badge: 'bg-stone-200 text-stone-700 border-stone-200', icon: ShoppingCartIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'WAITING_FAST': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ShoppingCartIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'WAITING_SIGN': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ShoppingCartIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'SIGNED': { badge: 'bg-stone-200 text-stone-600 border-stone-200', icon: CogIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'IN_PRODUZIONE': { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CogIcon, iconBg: 'bg-emerald-100 text-emerald-700' },
    'READY': { badge: 'bg-stone-200 text-stone-600 border-stone-200', icon: TruckIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
  };
  return styles[stato] || styles['DRAFT'];
}

const getStatusLabel = (stato: string) => {
  const map: Record<string, string> = {
    'DRAFT': 'BOZZA', 'PENDING_VAL': 'PREVENTIVO IN ATTESA QUOTAZIONE', 'QUOTE_READY': 'PREVENTIVO VALIDATO',
    'ORDER_REQ': 'ORDINE IN ATTESA DI ACCETTAZIONE', 
    'WAITING_FAST': 'ORDINE DA ACCETTARE', 'WAITING_SIGN': 'ORDINE DA FIRMARE',
    'SIGNED': 'ORDINE PRESO IN CARICO', 'IN_PRODUZIONE': 'ORDINE IN CODA DI PRODUZIONE', 'READY': 'ORDINE PRONTO', 'REJECTED': 'ANNULLATO'
  };
  return map[stato] || stato;
};

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
      currentUserEmail.value = user.email;
      if (clientName.value === 'Cliente') clientName.value = user.email?.split('@')[0] || 'Utente';
      caricaProfilo(user.uid);
      avviaAscoltoDati(user.email);
    } else { router.push('/'); }
  });
});
onUnmounted(() => { if (unsub1) unsub1(); if (unsub2) unsub2(); });
</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans">
    <div class="max-w-5xl mx-auto">

      <div class="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">{{ clientName }}</p>
            <h1 class="text-5xl font-bold font-heading text-gray-900">P.O.P.S. Dashboard</h1><br>
            <button @click="vaiAlBuilder()" class="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
            <PlusCircleIcon class="h-7 w-7 text-black" />
            NUOVO
            </button>
          </div>
        </div>
      </div>

      <div class="flex overflow-x-auto border-b border-gray-200 mb-6 gap-2">
        
        <button @click="activeTab = 'PREVENTIVI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative flex items-center gap-2 whitespace-nowrap" :class="activeTab === 'PREVENTIVI' ? 'text-gray-600 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
          <DocumentTextIcon class="h-4 w-4" />
          PREVENTIVI
          <span v-if="preventiviInCorso.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ preventiviInCorso.length }}</span>
        </button>
        
        <button @click="activeTab = 'ORDINI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative flex items-center gap-2 whitespace-nowrap" :class="activeTab === 'ORDINI' ? 'text-gray-600 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
          <ShoppingCartIcon class="h-4 w-4" />
          ORDINI
          <span v-if="ordiniConfermati.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniConfermati.length }}</span>
        </button>
        
        <button @click="activeTab = 'PRODUZIONE'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative flex items-center gap-2 whitespace-nowrap" :class="activeTab === 'PRODUZIONE' ? 'text-gray-600 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
          <CogIcon class="h-4 w-4" />
          PRODUZIONE
          <span v-if="ordiniInProduzione.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniInProduzione.length }}</span>
        </button>

        <button @click="activeTab = 'SPEDIZIONI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative flex items-center gap-2 whitespace-nowrap" :class="activeTab === 'SPEDIZIONI' ? 'text-gray-600 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
          <TruckIcon class="h-4 w-4" />
          SPEDIZIONI
          <span v-if="ordiniSpediti.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniSpediti.length }}</span>
        </button>

        <button @click="activeTab = 'ARCHIVIO'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative flex items-center gap-2 whitespace-nowrap" :class="activeTab === 'ARCHIVIO' ? 'text-stone-600 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
          <ArchiveBoxIcon class="h-4 w-4" />
          ARCHIVIO
          <span v-if="archivioPreventivi.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ archivioPreventivi.length }}</span>
        </button>

      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400 animate-pulse">Aggiornamento dati...</div>

      <div v-else>
        
        <div v-if="activeTab === 'PREVENTIVI'" class="grid gap-4">
          <div v-if="preventiviInCorso.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500 mb-4">Non hai preventivi aperti al momento.</p>
            <button @click="vaiAlBuilder()" class="text-blue-600 font-bold underline">Inizia ora</button>
          </div>
          <div v-for="p in preventiviInCorso" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">            
          <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8" />
              </div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                  </span>
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-2">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-3 w-full md:w-auto">
              <div class="flex items-center gap-6 justify-between w-full md:w-auto">
                <div class="text-right">
                  <div class="text-xl font-bold font-heading text-gray-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                  <div class="text-xs text-gray-400">Importo netto</div>
                </div>

                <div class="flex gap-2">
                   <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50 h-full">
                    APRI
                  </button>
                </div>
              </div>

              <button
                v-if="p.stato === 'QUOTE_READY'"
                @click="openConfirmModal(p)" 
                class="w-full text-white bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg font-bold text-xs shadow-sm flex justify-center items-center gap-2 animate-pulse transition-transform active:scale-95"
              >
                <CheckCircleIcon class="h-5 w-5" />
                CONFERMA PREVENTIVO
              </button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'ORDINI'" class="grid gap-4">
          <div v-if="ordiniConfermati.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in attesa.</p>
          </div>
          <div v-for="p in ordiniConfermati" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
            bg-opacity-70 backdrop-blur 
            border-2 border-white/20 
            shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
            ring-1 ring-black/5" 
     :class="getStatusStyling(p.stato).iconBg">
  <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
</div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                  </span>
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-2">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-3 w-full md:w-auto">
              <div class="flex items-center gap-6 justify-between w-full md:w-auto">
                <div class="text-right">
                  <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                  <div class="text-xs text-green-600">Importo netto</div>
                </div>
                <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50 h-full">
                  APRI
                </button>
              </div>

              <button
                v-if="p.stato === 'WAITING_FAST'"
                @click="gestisciAzioneOrdine(p)"
                class="w-full text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex justify-center items-center gap-2 animate-pulse transition-transform active:scale-95"
              >
                <CheckCircleIcon class="h-5 w-5" />
                ACCETTA ORDINE
              </button>

              <button
                v-else-if="p.stato === 'WAITING_SIGN'"
                @click="gestisciAzioneOrdine(p)"
                class="w-full text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex justify-center items-center gap-2 animate-pulse transition-transform active:scale-95"
              >
                <CheckCircleIcon class="h-5 w-5" />
                FIRMA ORDINE
              </button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'PRODUZIONE'" class="grid gap-4">
          <div v-if="ordiniInProduzione.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-else v-for="p in ordiniInProduzione" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
            bg-opacity-70 backdrop-blur 
            border-2 border-white/20 
            shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
            ring-1 ring-black/5" 
     :class="getStatusStyling(p.stato).iconBg">
  <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
</div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                  </span>
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-2">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo netto</div>
              </div>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'SPEDIZIONI'" class="grid gap-4">
          <div v-if="ordiniSpediti.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessuna spedizione pronta.</p>
          </div>
          <div v-else v-for="p in ordiniSpediti" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
            bg-opacity-70 backdrop-blur 
            border-2 border-white/20 
            shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
            ring-1 ring-black/5" 
     :class="getStatusStyling(p.stato).iconBg">
  <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
</div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                  </span>
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo netto</div>
              </div>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'ARCHIVIO'" class="grid gap-4">
          <div v-if="archivioPreventivi.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun elemento archiviato.</p>
          </div>
          <div v-else v-for="p in archivioPreventivi" :key="p.id" class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
            bg-opacity-70 backdrop-blur 
            border-2 border-white/20 
            shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
            ring-1 ring-black/5" 
     :class="getStatusStyling(p.stato).iconBg">
  <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
</div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight text-gray-400">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                  </span>
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-2">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-gray-500">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-gray-400">Importo netto</div>
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
        @error="(msg) => openResultModal('Attenzione', msg, 'ERROR')" 
      />

    </div>
  </div>
  <div v-if="showConfirmQuoteModal" class="fixed inset-0 z-[100] overflow-y-auto bg-gray-900/50 backdrop-blur-sm transition-opacity duration-300">
    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 p-6">
        
        <div class="flex items-center gap-3 mb-4 border-b pb-3">
          <CheckCircleIcon class="h-8 w-8 text-green-600" />
          <h3 class="text-xl font-bold text-gray-900">Conferma Invio Ordine</h3>
        </div>

        <p class="text-gray-700 mb-6">
          Stai per confermare il preventivo <span class="font-bold">{{ selectedOrder?.commessa || selectedOrder?.codice }}</span> e inviarlo come ordine.        <br>
          Importo Netto: <span class="font-bold text-green-600">{{ (selectedOrder?.totaleScontato || selectedOrder?.totaleImponibile || 0).toFixed(2) }} €</span>
        </p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            @click="showConfirmQuoteModal = false"
            class="px-4 py-2 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium"
          >
            Annulla
          </button>
          <button
            @click="handleFinalOrderConfirmation"
            class="px-4 py-2 rounded-lg text-green-100 bg-green-600 hover:bg-green-500 font-bold shadow-md"
          >
            Sì, Conferma e Invia
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="resultModal.show" class="fixed inset-0 z-[9999] overflow-y-auto bg-gray-900/50 backdrop-blur-sm transition-opacity duration-300 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full transform transition-all scale-100 p-6 text-center animate-in fade-in zoom-in duration-200">
      
      <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-4"
          :class="resultModal.type === 'SUCCESS' ? 'bg-green-100' : 'bg-red-100'">
        <CheckCircleIcon v-if="resultModal.type === 'SUCCESS'" class="h-10 w-10 text-green-600" />
        <ExclamationTriangleIcon v-else class="h-10 w-10 text-red-600" />
      </div>

      <h3 class="text-xl font-bold text-gray-900 mb-2">{{ resultModal.title }}</h3>
      <p class="text-gray-500 mb-6">{{ resultModal.message }}</p>

      <button 
        @click="resultModal.show = false" 
        class="w-full py-2.5 rounded-lg font-bold text-white shadow-md transition-transform active:scale-95 outline-none focus:ring-2 focus:ring-offset-2"
        :class="resultModal.type === 'SUCCESS' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'"
      >
        Ho capito
      </button>
    </div>
  </div>
</template>