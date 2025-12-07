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
    unsubscribeOrders = onSnapshot(q, (snap) => {
      orders.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loading.value = false;
    }, (error) => {
        console.error("Errore caricamento ordini:", error);
        loading.value = false;
    });
  };
  
  // HELPER RAGGRUPPAMENTO DDT
  const raggruppaPerDdt = (lista: any[]) => {
    const gruppi: Record<string, any> = {};
    lista.forEach(p => {
      const key = p.fic_ddt_id ? `DDT_${p.fic_ddt_id}` : `ORD_${p.id}`;
      if(!gruppi[key]) {
          gruppi[key] = {
              uniqueKey: key,
              isDdt: !!p.fic_ddt_id,
              idDdt: p.fic_ddt_id,
              number: p.fic_ddt_number,
              url: p.fic_ddt_url,
              cliente: p.cliente,
              indirizzo: p.indirizzoConsegna,
              items: [],
              colliTotali: 0
          };
      }
      gruppi[key].items.push(p);
      gruppi[key].colliTotali += (Number(p.colli) || 1);
    });
    
    return Object.values(gruppi).sort((a:any, b:any) => {
        if (a.isDdt && !b.isDdt) return -1;
        if (!a.isDdt && b.isDdt) return 1;
        return 0; 
    });
  };
  
  // LOGICA CONSEGNA (GROUPED)
  const openDeliveryModal = (group: any) => {
    if (!currentSession.value) return alert("Devi AVVIARE il turno di consegna.");
    
    const mergedSummary = group.items.flatMap((i:any) => i.sommarioPreventivo || []);
    
    selectedOrder.value = {
      id: group.items[0].id, 
      idsToUpdate: group.items.map((i:any) => i.id), 
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
      const rawIds = selectedOrder.value.idsToUpdate || [selectedOrder.value.id];
      const ids: any[] = Array.isArray(rawIds) ? rawIds : [rawIds];
      
      const firmaRef = storageRef(storage, `firme_consegne/DDT_${Date.now()}_${ids[0]}.png`);
      await uploadString(firmaRef, signatureBase64, 'data_url');
      const signatureUrl = await getDownloadURL(firmaRef);
  
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
  
      const sessionRef = doc(db, 'delivery_sessions', currentSession.value.id);
      const existingIds = currentSession.value.deliveredOrderIds;
      const currentList: any[] = Array.isArray(existingIds) ? existingIds : [];
      const newList = [...new Set([...currentList, ...ids])];
      
      await updateDoc(sessionRef, { deliveredOrderIds: newList });
      
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
      ddtGroups: raggruppaPerDdt(groups[date] || []) 
    }));
  });
  
  const isGroupDelivered = (group: any) => {
      return group.items.some((i: any) => currentSession.value?.deliveredOrderIds?.includes(i.id));
  };
  
  onMounted(() => { loadUsers(); loadOrders(); if (selectedDriverId.value) checkActiveSession(); });
  onUnmounted(() => { if (unsubscribeOrders) unsubscribeOrders(); if (timerInterval) clearInterval(timerInterval); });
  const onDriverChange = () => { localStorage.setItem('lastDriverId', selectedDriverId.value); checkActiveSession(); };
  </script>
  
  <template>
    <div class="min-h-screen bg-[#F0F4F8] font-sans pb-24 text-slate-700"> <header class="sticky top-0 z-50 transition-all duration-300">
         <div class="absolute inset-0 bg-white/90 backdrop-blur-md shadow-sm border-b border-white/20"></div>
         <div class="relative max-w-lg mx-auto px-6 py-4">
            <div class="flex justify-between items-center mb-4">
              <div class="relative inline-block">
              <h1 class="relative z-10 text-4xl font-bold font-heading text-gray-900">P.O.P.S. Dashboard</h1>
              <div class="absolute bottom-2 left-0 w-52 h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
               <div class="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg shadow-slate-900/20 flex items-center gap-2 font-mono text-lg font-bold border border-slate-700">
                  <span class="w-2 h-2 rounded-full animate-pulse" :class="currentSession ? 'bg-red-500' : 'bg-slate-600'"></span>
                  {{ timerString }}
               </div>
            </div>
  
            <div class="flex gap-3">
               <div class="relative flex-1 group">
                  <select 
                    v-model="selectedDriverId" 
                    @change="onDriverChange"
                    :disabled="!!currentSession"
                    class="w-full appearance-none bg-slate-100 hover:bg-slate-50 disabled:bg-slate-200 border-none rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 transition-all cursor-pointer shadow-inner"
                  >
                    <option value="" disabled>Seleziona Autista</option>
                    <option v-for="u in users" :key="u.id" :value="u.id">
                      {{ u.firstName }} {{ u.lastName }}
                    </option>
                  </select>
               </div>
  
               <button 
                  @click="toggleSession"
                  class="px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-amber-900/10 flex items-center gap-2 transition-all active:scale-95 hover:shadow-xl"
                  :class="currentSession ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-amber-400 text-amber-950 hover:bg-amber-300'"
               >
                  <component :is="currentSession ? StopIcon : PlayIcon" class="w-5 h-5" />
                  {{ currentSession ? 'STOP' : 'START' }}
               </button>
            </div>
         </div>
      </header>
  
      <main class="max-w-lg mx-auto p-4 space-y-8">
        
        <div v-if="loading" class="flex flex-col items-center justify-center py-20 opacity-50">
           <div class="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4"></div>
           <span class="font-bold text-sm">Caricamento itinerario...</span>
        </div>
        
        <div v-else-if="orders.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
           <div class="w-20 h-20 bg-white rounded-3xl shadow-sm border border-dashed border-slate-300 flex items-center justify-center mb-4">
              <TruckIcon class="w-10 h-10 text-slate-300"/>
           </div>
           <h3 class="text-lg font-bold text-slate-900">Nessuna consegna</h3>
           <p class="text-sm text-slate-500">Non ci sono spedizioni programmate.</p>
        </div>
  
        <div v-else v-for="group in groupedOrders" :key="group.date" class="relative">
          
          <div class="sticky top-[140px] z-30 flex justify-center mb-6 pointer-events-none">
             <div class="bg-slate-800/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wide border border-white/10">
                <CalendarIcon class="w-3.5 h-3.5 text-amber-400" />
                {{ formatDateLabel(group.date) }}
             </div>
          </div>
  
          <div class="space-y-4">
            <div 
              v-for="ddt in group.ddtGroups" 
              :key="ddt.uniqueKey"
              @click="openDeliveryModal(ddt)"
              class="bg-white rounded-[2rem] p-1 shadow-sm border border-slate-100 hover:shadow-xl hover:border-amber-200 transition-all duration-300 cursor-pointer relative overflow-hidden group isolate"
              :class="{ 'opacity-50 grayscale pointer-events-none mix-blend-luminosity': isGroupDelivered(ddt) }"
            >
              <div class="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity -z-10"></div>
  
              <div class="p-5">
                  <div class="flex justify-between items-start mb-3">
                      <div class="flex items-center gap-2">
                          <span v-if="ddt.isDdt" class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border border-slate-200 shadow-sm">
                              <DocumentTextIcon class="w-3 h-3"/> DDT #{{ ddt.number }}
                          </span>
                          <span v-else class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border border-blue-100 shadow-sm">
                              ORDINE SINGOLO
                          </span>
                      </div>
                      
                      <div class="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          <span>{{ ddt.colliTotali }}</span>
                          <span class="text-[9px] uppercase font-medium">Colli</span>
                      </div>
                  </div>
  
                  <div class="mb-4">
                      <h4 class="text-xl font-black text-slate-800 leading-tight mb-1 group-hover:text-amber-600 transition-colors">{{ ddt.cliente }}</h4>
                      <div class="flex items-start gap-2 text-sm text-slate-500 font-medium">
                          <MapPinIcon class="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                          <span class="leading-snug">{{ ddt.indirizzo || 'Ritiro in sede / Indirizzo non spec.' }}</span>
                      </div>
                  </div>
  
                  <div class="flex items-center justify-between pt-4 border-t border-dashed border-slate-100">
                      <div class="text-[10px] font-medium text-slate-400 flex flex-col">
                          <span class="uppercase tracking-wider text-[9px] text-slate-300 font-bold">Riferimenti ordini</span>
                          <span class="line-clamp-1 max-w-[200px]">
                              <span v-for="(item, idx) in ddt.items" :key="item.id">
                                  {{ item.commessa || item.codice }}<span v-if="idx < ddt.items.length-1">, </span>
                              </span>
                          </span>
                      </div>
                      
                      <button class="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md group-hover:scale-110 group-hover:bg-amber-400 group-hover:text-amber-950 transition-all duration-300">
                          <ChevronRightIcon class="w-5 h-5" />
                      </button>
                  </div>
              </div>
  
              <div v-if="currentSession && !isGroupDelivered(ddt)" class="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 rounded-l-full"></div>
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