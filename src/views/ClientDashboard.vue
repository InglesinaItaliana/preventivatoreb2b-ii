<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import { PencilIcon, CheckCircleIcon, DocumentTextIcon, XCircleIcon, CogIcon, PlusCircleIcon, CubeIcon } from '@heroicons/vue/24/solid';
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
const showConfirmQuoteModal = ref(false); // <--- NUOVA VARIABILE

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
const handleFinalOrderConfirmation = async () => {
  if(!selectedOrder.value) return;

  try {
    // Aggiorniamo lo stato a ORDER_REQ
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'ORDER_REQ', 
      dataInvioOrdine: serverTimestamp()
    });
    
    showConfirmQuoteModal.value = false; // <--- Chiudi il popup dopo il successo
    alert("✅ Ordine inviato correttamente!");
  } catch (e) {
    console.error("Errore invio ordine:", e);
    showConfirmQuoteModal.value = false; // <--- Chiudi il popup anche in caso di errore
    alert("Errore durante l'invio dell'ordine. Controlla la console.");
  }
};

// --- CALLBACK DAL COMPONENTE MODALE ---
const onConfirmFast = async () => {
  if(!selectedOrder.value) return;
  const user = auth.currentUser; 
  if (!user) return alert("Utente non loggato");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      metodoConferma: 'FAST_TRACK',
      clienteUID: user.uid
    });
    showModals.value = false;
    alert("✅ Ordine Confermato!");
  } catch(e) {
    console.error(e);
    alert("Errore durante la conferma.");
  }
};

const onConfirmSign = async (url: string) => { // <--- Assicurati che (url: string) sia qui
  if(!selectedOrder.value) return;
  
  const user = auth.currentUser;
  if (!user) return alert("Utente non loggato");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      contrattoFirmatoUrl: url, // Ora 'url' esiste
      metodoConferma: 'UPLOAD_FIRMA',
      clienteUID: user.uid
    });

    showModals.value = false;
    alert("✅ Ordine Confermato e inviato in produzione!");
  } catch(e) { console.error(e); alert("Errore conferma."); }
};

// --- HELPERS ---

// Definizione helper per ordinamento personalizzato
const sortByOrder = (list: any[], order: string[]) => {
  return list.sort((a, b) => {
    const statA = a.stato || 'DRAFT';
    const statB = b.stato || 'DRAFT';
    // Calcola la posizione nell'array dell'ordine
    const indexA = order.indexOf(statA);
    const indexB = order.indexOf(statB);
    
    // Se hanno indici diversi, ordina per stato
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    // Se lo stato è uguale, mantiene l'ordine cronologico (dato che listaMieiPreventivi è già ordinata per data)
    return 0;
  });
};

const preventiviInCorso = computed(() => {
  const customOrder = ['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'REJECTED'];
  // Filtra solo quelli presenti nell'ordine richiesto
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato || 'DRAFT'));
  // Ordina secondo la sequenza
  return sortByOrder([...filtered], customOrder);
});

const ordiniConfermati = computed(() => {
  const customOrder = ['ORDER_REQ', 'WAITING_FAST', 'WAITING_SIGN'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

const ordiniInProduzione = computed(() => {
  const customOrder = ['SIGNED', 'IN_PRODUZIONE', 'READY'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 3. Funzioni di utilità (RIPRISTINATE)
const vaiAlBuilder = (codice?: string) => {
  const route = codice ? `/preventivatore?codice=${codice}` : '/preventivatore';
  router.push(route);
};

const getStatusStyling = (stato: string) => {
  const styles: Record<string, any> = {
    'DRAFT': { badge: 'bg-amber-100 text-amber-500 border-amber-200', icon: PencilIcon, iconBg: 'bg-amber-100 text-amber-500' },
    'PENDING_VAL': { badge: 'bg-stone-200 text-stone-700 border-stone-200', icon: PencilIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'QUOTE_READY': { badge: 'bg-green-100 text-green-600 border-green-200', icon: PencilIcon, iconBg: 'bg-green-100 text-green-600' },
    'ORDER_REQ': { badge: 'bg-stone-200 text-stone-700 border-stone-200', icon: DocumentTextIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'WAITING_FAST': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: DocumentTextIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'WAITING_SIGN': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: DocumentTextIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'SIGNED': { badge: 'bg-stone-200 text-stone-600 border-stone-200', icon: CogIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'IN_PRODUZIONE': { badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: CogIcon, iconBg: 'bg-amber-100 text-amber-700' },
    'READY': { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CubeIcon, iconBg: 'bg-emerald-100 text-emerald-700' },
    'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
  };
  return styles[stato] || styles['DRAFT'];
}

const getStatusLabel = (stato: string) => {
  const map: Record<string, string> = {
    'DRAFT': 'BOZZA', 'PENDING_VAL': 'PREVENTIVO IN ATTESA QUOTAZIONE', 'QUOTE_READY': 'PREVENTIVO VALIDATO',
    'ORDER_REQ': 'ORDINE IN ATTESA DI ACCETTAZIONE DA INGLESINA ITALIANA', 
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
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
    <div class="max-w-5xl mx-auto">

      <div class="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Dashboard POP</p>
            <h1 class="text-4xl font-bold font-heading text-gray-900">{{ clientName }}</h1><br>
            <button @click="vaiAlBuilder()" class="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
            <PlusCircleIcon class="h-7 w-7 text-black" />
            NUOVO
            </button>
          </div>
        </div>
        
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
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8" />
              </div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
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
                  <button v-if="p.stato === 'WAITING_FAST'" @click="gestisciAzioneOrdine(p)" class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse">
                    ACCETTA
                  </button>
                  <button v-else-if="p.stato === 'WAITING_SIGN'" @click="gestisciAzioneOrdine(p)" class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse">
                    FIRMA
                  </button>
                  
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
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-for="p in ordiniConfermati" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8" />
              </div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
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
          <div v-else v-for="p in ordiniInProduzione" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
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
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo netto</div>
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
</template>
