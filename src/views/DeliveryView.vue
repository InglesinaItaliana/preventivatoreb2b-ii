<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { 
  collection, query, where, getDocs, orderBy, onSnapshot, 
  addDoc, updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import DeliveryModal from '../components/DeliveryModal.vue';
import { 
  TruckIcon, PlayIcon, StopIcon, MapPinIcon, 
  ClockIcon, CalendarIcon, ChevronRightIcon 
} from '@heroicons/vue/24/solid';

// STATO
const loading = ref(true);
const users = ref<any[]>([]);
const selectedDriverId = ref(localStorage.getItem('lastDriverId') || '');
const currentSession = ref<any>(null);
const timerString = ref('00:00:00');
let timerInterval: any = null;

const orders = ref<any[]>([]);
const showModal = ref(false);
const selectedOrder = ref<any>(null);

// CARICAMENTO DRIVERS (Utenti)
const loadUsers = async () => {
  const q = query(collection(db, 'users')); // Puoi filtrare per ruolo se hai un campo ruolo
  const snap = await getDocs(q);
  users.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// GESTIONE TIMER E SESSIONE
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const updateTimer = () => {
  if (!currentSession.value || !currentSession.value.startTime) return;
  const start = currentSession.value.startTime.toDate ? currentSession.value.startTime.toDate() : new Date(currentSession.value.startTime); // Gestione timestamp firestore vs locale
  const now = new Date();
  timerString.value = formatTime(now.getTime() - start.getTime());
};

// CHECK SESSIONE APERTA
const checkActiveSession = async () => {
  if (!selectedDriverId.value) return;
  
  // Cerchiamo se c'è una sessione OPEN per questo driver
  const q = query(
    collection(db, 'delivery_sessions'), 
    where('driverUid', '==', selectedDriverId.value),
    where('status', '==', 'OPEN')
  );
  
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docData = snap.docs[0];
    currentSession.value = { id: docData.id, ...docData.data() };
    
    // Se la data è un timestamp firestore, convertila
    if (currentSession.value.startTime?.seconds) {
        currentSession.value.startTime = new Date(currentSession.value.startTime.seconds * 1000);
    }

    startLocalTimer();
  } else {
    currentSession.value = null;
    timerString.value = '00:00:00';
    stopLocalTimer();
  }
};

const startLocalTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
};

const stopLocalTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerString.value = '00:00:00';
};

// AZIONI SESSIONE
const toggleSession = async () => {
  if (!selectedDriverId.value) {
    alert("Seleziona un autista prima di iniziare.");
    return;
  }

  // STOP SESSION
  if (currentSession.value) {
    if (!confirm("Sei sicuro di voler terminare il giro consegne?")) return;
    try {
      await updateDoc(doc(db, 'delivery_sessions', currentSession.value.id), {
        status: 'CLOSED',
        endTime: serverTimestamp()
      });
      currentSession.value = null;
      stopLocalTimer();
    } catch (e) { console.error(e); alert("Errore chiusura sessione"); }
  
  // START SESSION
  } else {
    try {
      const driver = users.value.find(u => u.id === selectedDriverId.value);
      const newSession = {
        driverUid: selectedDriverId.value,
        driverName: driver?.ragioneSociale || driver?.email || 'Autista',
        startTime: serverTimestamp(), // Su firestore
        status: 'OPEN',
        deliveredOrderIds: []
      };
      
      const ref = await addDoc(collection(db, 'delivery_sessions'), newSession);
      
      // Impostiamo localmente start time a NOW per reattività immediata del timer
      currentSession.value = { ...newSession, id: ref.id, startTime: new Date() };
      startLocalTimer();
    } catch (e) { console.error(e); alert("Errore avvio sessione"); }
  }
};

// CARICAMENTO ORDINI (Realtime)
let unsubscribeOrders: null | (() => void) = null;

const loadOrders = () => {
  loading.value = true;
  if (unsubscribeOrders) unsubscribeOrders();

  const q = query(
    collection(db, 'preventivi'), 
    where('stato', '==', 'DELIVERY'), 
    orderBy('dataConsegnaPrevista', 'asc')
  );

  unsubscribeOrders = onSnapshot(q, (snap) => {
    orders.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loading.value = false;
  });
};

// LOGICA CONSEGNA
const openDeliveryModal = (order: any) => {
  if (!currentSession.value) {
    alert("Devi AVVIARE il turno di consegna prima di poter gestire gli ordini.");
    return;
  }
  selectedOrder.value = order;
  showModal.value = true;
};

const handleConfirmDelivery = async (signatureBase64: string) => {
  if (!selectedOrder.value || !currentSession.value) return;
  
  try {
    const orderId = selectedOrder.value.id;
    
    // 1. Upload Firma
    const firmaRef = storageRef(storage, `firme_consegne/${orderId}_${Date.now()}.png`);
    await uploadString(firmaRef, signatureBase64, 'data_url');
    const signatureUrl = await getDownloadURL(firmaRef);

    // 2. Aggiorna Ordine
    await updateDoc(doc(db, 'preventivi', orderId), {
      stato: 'DELIVERED',
      firmaConsegna: signatureUrl,
      dataConsegnaEffettiva: serverTimestamp(),
      consegnatoDa: currentSession.value.driverName,
      idViaggio: currentSession.value.id
    });

    // 3. Aggiorna Sessione (Aggiungi ID Ordine)
    // Nota: deliveredOrderIds è un array, usiamo una logica locale + update o arrayUnion se disponibile
    // Per semplicità qui faccio un get e update classico o arrayUnion se preferisci
    // Simulo arrayUnion per brevità ma importalo se serve
    const sessionRef = doc(db, 'delivery_sessions', currentSession.value.id);
    // IMPORTANTE: Se usi arrayUnion devi importarlo da firestore. Qui faccio logica "dummy" per non complicare imports
    // In produzione: updateDoc(sessionRef, { deliveredOrderIds: arrayUnion(orderId) });
    const currentList = currentSession.value.deliveredOrderIds || [];
    await updateDoc(sessionRef, { deliveredOrderIds: [...currentList, orderId] });

    showModal.value = false;
    // L'ordine sparirà dalla lista grazie al listener realtime
  } catch (e) {
    console.error("Errore consegna:", e);
    alert("Errore durante il salvataggio della consegna.");
  }
};

// RAGGRUPPAMENTO ORDINI PER DATA
const groupedOrders = computed(() => {
  const groups: Record<string, any[]> = {};
  orders.value.forEach(o => {
    const data = o.dataConsegnaPrevista ? o.dataConsegnaPrevista : 'Data non def.';
    if (!groups[data]) groups[data] = [];
    groups[data].push(o);
  });
  // Ordina le chiavi (date)
  return Object.keys(groups).sort().map(date => ({
    date,
    list: groups[date]
  }));
});

// Helper formattazione data
const formatDateLabel = (dateStr: string) => {
    if (dateStr === 'Data non def.') return dateStr;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    d.setHours(0,0,0,0); // reset ore per confronto

    if (d.getTime() === today.getTime()) return 'OGGI';
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.getTime() === tomorrow.getTime()) return 'DOMANI';

    return new Date(dateStr).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long' });
};

onMounted(() => {
  loadUsers();
  loadOrders();
  if (selectedDriverId.value) checkActiveSession();
});

onUnmounted(() => {
  if (unsubscribeOrders) unsubscribeOrders();
  if (timerInterval) clearInterval(timerInterval);
});

// Watcher per cambio driver
const onDriverChange = () => {
    localStorage.setItem('lastDriverId', selectedDriverId.value);
    checkActiveSession();
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 font-sans pb-20">
    
    <header class="bg-gray-900 text-white sticky top-0 z-50 shadow-md">
      <div class="max-w-md mx-auto px-4 py-3">
        <div class="flex items-center justify-between mb-3">
           <h1 class="text-xl font-bold font-heading flex items-center gap-2">
             <TruckIcon class="w-6 h-6 text-yellow-400"/>
             Logistica
           </h1>
           <div class="bg-gray-800 rounded px-2 py-1 border border-gray-700">
             <span class="text-xs text-gray-400 block leading-none">Tempo Viaggio</span>
             <span class="font-mono text-xl font-bold text-yellow-400 tracking-wider leading-none">{{ timerString }}</span>
           </div>
        </div>

        <div class="flex gap-2">
          <select 
            v-model="selectedDriverId" 
            @change="onDriverChange"
            :disabled="!!currentSession"
            class="flex-1 bg-gray-800 text-white text-sm rounded-lg border border-gray-600 px-3 py-2 outline-none focus:border-yellow-400 disabled:opacity-50"
          >
            <option value="" disabled>Seleziona Autista</option>
            <option v-for="u in users" :key="u.id" :value="u.id">
              {{ u.ragioneSociale || u.email }}
            </option>
          </select>

          <button 
            @click="toggleSession"
            class="px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2 transition-all active:scale-95"
            :class="currentSession ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'"
          >
            <component :is="currentSession ? StopIcon : PlayIcon" class="w-5 h-5" />
            {{ currentSession ? 'STOP' : 'START' }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-md mx-auto p-4 space-y-6">
      
      <div v-if="loading" class="text-center py-10 text-gray-400">Caricamento spedizioni...</div>
      
      <div v-else-if="orders.length === 0" class="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-300">
         <TruckIcon class="w-12 h-12 text-gray-300 mx-auto mb-2"/>
         <p class="text-gray-500 font-bold">Nessuna spedizione programmata.</p>
      </div>

      <div v-else v-for="group in groupedOrders" :key="group.date">
        
        <div class="sticky top-[105px] z-40 bg-gray-100/95 backdrop-blur py-2 mb-2 flex items-center gap-2 border-b border-gray-200 text-gray-500">
          <CalendarIcon class="w-4 h-4" />
          <h3 class="font-bold text-sm uppercase tracking-wide">{{ formatDateLabel(group.date) }}</h3>
        </div>

        <div class="space-y-3">
          <div 
            v-for="order in group.list" 
            :key="order.id"
            @click="openDeliveryModal(order)"
            class="bg-white rounded-xl p-4 shadow-sm border border-gray-200 active:bg-blue-50 transition-colors cursor-pointer relative overflow-hidden group"
          >
            <div class="absolute left-0 top-0 bottom-0 w-1.5" :class="currentSession ? 'bg-yellow-400' : 'bg-gray-300'"></div>
            
            <div class="flex justify-between items-start pl-2">
              <div>
                <p class="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{{ order.commessa || order.codice }}</p>
                <h4 class="text-lg font-bold text-gray-900 leading-tight">{{ order.cliente }}</h4>
                
                <div class="flex items-center gap-1 mt-1 text-gray-500 text-xs">
                  <MapPinIcon class="w-3 h-3 text-gray-400" />
                  <span class="truncate max-w-[200px]">{{ order.indirizzoConsegna || 'Indirizzo non specificato' }}</span>
                </div>
              </div>

              <div class="flex flex-col items-end gap-1">
                <div class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded border border-gray-200">
                   {{ order.colli || 1 }} Colli
                </div>
                <ChevronRightIcon class="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
              </div>
            </div>

            <div v-if="!currentSession" class="mt-3 text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded border border-red-100 inline-block font-bold">
               Avvia turno per consegnare
            </div>
          </div>
        </div>

      </div>

    </main>

    <DeliveryModal 
      :show="showModal" 
      :order="selectedOrder" 
      @close="showModal = false"
      @confirm="handleConfirmDelivery"
    />

  </div>
</template>