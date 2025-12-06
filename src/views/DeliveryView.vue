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
  TruckIcon, PlayIcon, StopIcon, MapPinIcon, CalendarIcon, ChevronRightIcon, DocumentTextIcon 
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

// CARICAMENTO DRIVERS
const loadUsers = async () => {
  const q = query(collection(db, 'team'), orderBy('lastName', 'asc')); 
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
  const start = currentSession.value.startTime.toDate ? currentSession.value.startTime.toDate() : new Date(currentSession.value.startTime);
  const now = new Date();
  timerString.value = formatTime(now.getTime() - start.getTime());
};

// CHECK SESSIONE APERTA
const checkActiveSession = async () => {
  if (!selectedDriverId.value) return;
  const q = query(
    collection(db, 'delivery_sessions'), 
    where('driverUid', '==', selectedDriverId.value),
    where('status', '==', 'OPEN')
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const doc = snap.docs[0]; 
    if (doc) {
      currentSession.value = { id: doc.id, ...doc.data() };
      if (currentSession.value.startTime?.seconds) {
          currentSession.value.startTime = new Date(currentSession.value.startTime.seconds * 1000);
      }
      startLocalTimer();
    }
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
  if (!selectedDriverId.value) return alert("Seleziona un autista prima di iniziare.");

  if (currentSession.value) { // STOP
    if (!confirm("Sei sicuro di voler terminare il giro consegne?")) return;
    try {
      await updateDoc(doc(db, 'delivery_sessions', currentSession.value.id), {
        status: 'CLOSED',
        endTime: serverTimestamp()
      });
      currentSession.value = null;
      stopLocalTimer();
    } catch (e) { console.error(e); alert("Errore chiusura sessione"); }
  } else { // START
    try {
      const driver = users.value.find(u => u.id === selectedDriverId.value);
      const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Autista';
      const newSession = {
        driverUid: selectedDriverId.value,
        driverName: driverName,
        startTime: serverTimestamp(),
        status: 'OPEN',
        deliveredOrderIds: []
      };
      const ref = await addDoc(collection(db, 'delivery_sessions'), newSession);
      currentSession.value = { ...newSession, id: ref.id, startTime: new Date() };
      startLocalTimer();
    } catch (e) { console.error(e); alert("Errore avvio sessione"); }
  }
};

// CARICAMENTO ORDINI
let unsubscribeOrders: null | (() => void) = null;
const loadOrders = () => {
  loading.value = true;
  if (unsubscribeOrders) unsubscribeOrders();
  
  const q = query(
    collection(db, 'preventivi'), 
    where('stato', '==', 'DELIVERY'), 
    orderBy('dataConsegnaPrevista', 'asc')
  );

  unsubscribeOrders = onSnapshot(q, 
    (snap) => {
      orders.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loading.value = false;
    }, 
    (error) => { // <--- AGGIUNTA GESTIONE ERRORE
      console.error("Errore caricamento ordini:", error);
      loading.value = false;
      alert("Errore caricamento dati: " + error.message);
    }
  );
};

// HELPER RAGGRUPPAMENTO DDT
const raggruppaPerDdt = (lista: any[]) => {
  const gruppi: Record<string, any> = {};
  lista.forEach(p => {
    // Se c'è DDT ID, usa quello, altrimenti crea un gruppo univoco per l'ordine singolo
    const key = p.fic_ddt_id ? `DDT_${p.fic_ddt_id}` : `ORD_${p.id}`;
    
    if(!gruppi[key]) {
        gruppi[key] = {
            uniqueKey: key,
            isDdt: !!p.fic_ddt_id,
            idDdt: p.fic_ddt_id,
            number: p.fic_ddt_number,
            url: p.fic_ddt_url,
            // Dati comuni (assumiamo che il DDT sia per lo stesso cliente/indirizzo)
            cliente: p.cliente,
            indirizzo: p.indirizzoConsegna,
            items: [], // Lista ordini in questo DDT
            colliTotali: 0
        };
    }
    gruppi[key].items.push(p);
    gruppi[key].colliTotali += (Number(p.colli) || 1);
  });
  
  // Ordina: Prima i DDT reali, poi gli ordini sfusi
  return Object.values(gruppi).sort((a:any, b:any) => {
      if (a.isDdt && !b.isDdt) return -1;
      if (!a.isDdt && b.isDdt) return 1;
      return 0; 
  });
};

// LOGICA CONSEGNA (GROUPED)
const openDeliveryModal = (group: any) => {
  if (!currentSession.value) return alert("Devi AVVIARE il turno di consegna.");
  
  // Creiamo un oggetto "virtuale" che aggrega i dati del DDT per il modale di firma
  const mergedSummary = group.items.flatMap((i:any) => i.sommarioPreventivo || []);
  
  selectedOrder.value = {
    // ID Fittizio per il modale (usiamo il primo), ma salviamo la lista di tutti gli ID
    id: group.items[0].id, 
    idsToUpdate: group.items.map((i:any) => i.id), // ARRAY DI ID DA AGGIORNARE
    commessa: group.isDdt ? `DDT #${group.number} (${group.items.length} Ordini)` : group.items[0].commessa,
    codice: group.isDdt ? `DDT ${group.number}` : group.items[0].codice,
    cliente: group.cliente,
    indirizzoConsegna: group.indirizzo,
    colli: group.colliTotali,
    sommarioPreventivo: mergedSummary
  };
  showModal.value = true;
};

const handleConfirmDelivery = async (signatureBase64: string) => {
  if (!selectedOrder.value || !currentSession.value) return;
  
  try {
    // FIX: Garantiamo che ids sia sempre un array
    const rawIds = selectedOrder.value.idsToUpdate || [selectedOrder.value.id];
    const ids: any[] = Array.isArray(rawIds) ? rawIds : [rawIds];
    
    // 1. Upload Firma (Unica per il gruppo)
    const firmaRef = storageRef(storage, `firme_consegne/DDT_${Date.now()}_${ids[0]}.png`);
    await uploadString(firmaRef, signatureBase64, 'data_url');
    const signatureUrl = await getDownloadURL(firmaRef);

    // 2. Aggiorna TUTTI gli ordini del gruppo
    const updatePromises = ids.map((id: string) => 
       updateDoc(doc(db, 'preventivi', id), {
          stato: 'DELIVERED',
          firmaConsegna: signatureUrl,
          dataConsegnaEffettiva: serverTimestamp(),
          consegnatoDa: currentSession.value.driverName,
          idViaggio: currentSession.value.id
       })
    );
    await Promise.all(updatePromises);

    // 3. Aggiorna Sessione (Aggiungi tutti gli ID)
    const sessionRef = doc(db, 'delivery_sessions', currentSession.value.id);
    
    // FIX RIGOROSO ERRORE 2345: Controllo esplicito su Array.isArray
    const existingIds = currentSession.value.deliveredOrderIds;
    const currentList: any[] = Array.isArray(existingIds) ? existingIds : [];
    
    // Unione sicura
    const newList = [...new Set([...currentList, ...ids])];
    
    await updateDoc(sessionRef, { deliveredOrderIds: newList });
    
    // Aggiorna locale
    if (currentSession.value) {
        currentSession.value.deliveredOrderIds = newList;
    }

    showModal.value = false;
  } catch (e) {
    console.error("Errore consegna:", e);
    alert("Errore durante il salvataggio.");
  }
};

// HELPER UI
const formatDateLabel = (dateStr: string) => {
    if (dateStr === 'Data non def.') return dateStr;
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
    if (d.getTime() === today.getTime()) return 'OGGI';
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.getTime() === tomorrow.getTime()) return 'DOMANI';
    return new Date(dateStr).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long' });
};

// GROUPED ORDERS
const groupedOrders = computed(() => {
  const groups: Record<string, any[]> = {};
  orders.value.forEach(o => {
    const data = o.dataConsegnaPrevista || 'Data non def.';
    if (!groups[data]) groups[data] = [];
    groups[data].push(o);
  });
  
  return Object.keys(groups).sort().map(date => ({
    date,
    // FIX: Aggiunto '|| []' per garantire a TypeScript che l'argomento non sia mai undefined
    ddtGroups: raggruppaPerDdt(groups[date] || []) 
  }));
});

const isGroupDelivered = (group: any) => {
    // Se almeno un ordine del gruppo è stato consegnato (sono aggiornati insieme)
    return group.items.some((i: any) => currentSession.value?.deliveredOrderIds?.includes(i.id));
};

onMounted(() => { loadUsers(); loadOrders(); if (selectedDriverId.value) checkActiveSession(); });
onUnmounted(() => { if (unsubscribeOrders) unsubscribeOrders(); if (timerInterval) clearInterval(timerInterval); });
const onDriverChange = () => { localStorage.setItem('lastDriverId', selectedDriverId.value); checkActiveSession(); };
</script>

<template>
  <div class="min-h-screen bg-gray-100 font-sans pb-20">
    
    <header class="bg-white text-white sticky top-0 z-50 shadow-md">
      <div class="max-w-md mx-auto px-4 py-3">
        <div class="flex items-center justify-between mb-3">
          <div class="relative inline-block">
              <h1 class="relative z-10 text-5xl font-bold font-heading text-gray-900">P.O.P.S. Consegne</h1>
              <div class="absolute bottom-2 left-0 w-64 h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
           <div class="bg-gray-800 rounded px-2 py-1 border border-gray-700">
             <span class="text-xs text-gray-400 block leading-none">Tempo Viaggio</span>
             <span class="font-mono text-xl font-bold text-amber-400 tracking-wider leading-none">{{ timerString }}</span>
           </div>
        </div>

        <div class="flex gap-2">
          <select v-model="selectedDriverId" @change="onDriverChange" :disabled="!!currentSession" class="flex-1 bg-gray-800 text-white text-sm rounded-lg border border-gray-600 px-3 py-2 outline-none focus:border-amber-400 disabled:opacity-50">
            <option value="" disabled>Seleziona Autista</option>
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.firstName }} {{ u.lastName }}</option>
          </select>
          <button @click="toggleSession" class="px-4 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2 transition-all active:scale-95" :class="currentSession ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-400 hover:bg-amber-400 text-white'">
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
            v-for="ddt in group.ddtGroups" 
            :key="ddt.uniqueKey"
            @click="openDeliveryModal(ddt)"
            class="bg-white rounded-xl p-4 shadow-sm border border-gray-200 active:bg-blue-50 transition-colors cursor-pointer relative overflow-hidden group"
            :class="{ 'opacity-40 grayscale pointer-events-none': isGroupDelivered(ddt) }"
          >
            <div class="absolute left-0 top-0 bottom-0 w-1.5" :class="currentSession ? 'bg-amber-400' : 'bg-gray-300'"></div>
            
            <div class="flex justify-between items-start pl-2">
              <div>
                <div class="flex items-center gap-2 mb-1">
                    <span v-if="ddt.isDdt" class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 font-bold flex items-center gap-1">
                        <DocumentTextIcon class="w-3 h-3"/> DDT #{{ ddt.number }}
                    </span>
                    <span v-else class="text-[10px] text-gray-400 font-bold uppercase">ORDINE SINGOLO</span>
                </div>
                
                <h4 class="text-lg font-bold text-gray-900 leading-tight">{{ ddt.cliente }}</h4>
                
                <div class="flex items-center gap-1 mt-1 text-gray-500 text-xs">
                  <MapPinIcon class="w-3 h-3 text-gray-400" />
                  <span class="truncate max-w-[200px]">{{ ddt.indirizzo || 'Indirizzo non specificato' }}</span>
                </div>
                
                <div class="mt-2 text-[10px] text-gray-400 line-clamp-1">
                    Ref: <span v-for="(item, idx) in ddt.items" :key="item.id">{{ item.commessa || item.codice }}<span v-if="idx < ddt.items.length-1">, </span></span>
                </div>
              </div>

              <div class="flex flex-col items-end gap-1">
                <div class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded border border-gray-200">
                   {{ ddt.colliTotali }} Colli
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