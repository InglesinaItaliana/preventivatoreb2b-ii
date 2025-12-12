<script setup lang="ts">
  import { ref, onMounted, computed, reactive, watch } from 'vue';
  import { 
    collection, query, where, getDocs, orderBy, onSnapshot, 
    addDoc, updateDoc, doc, serverTimestamp, writeBatch 
  } from 'firebase/firestore';
  import { db, auth, storage } from '../firebase';
  import DeliveryModal from '../components/DeliveryModal.vue';
  import { 
    TruckIcon, MapPinIcon, 
    MapIcon, CheckCircleIcon, InboxStackIcon, PlusIcon,ChevronUpIcon, ChevronDownIcon
  } from '@heroicons/vue/24/solid';
  import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
  
  // --- TIPI ---
  interface Order {
    id: string;
    cliente: string;
    indirizzoConsegna: string;
    citta: string;
    provincia: string;
    regione?: string;
    colli: number;
    commessa: string;
    assignedToTrip?: boolean;
    tripId?: string;
    [key: string]: any;
  }
  
  interface Trip {
    id: string;
    driverId: string;
    driverName: string;
    date: string;
    status: 'OPEN' | 'CLOSED';
    stops: string[]; // Array di ID ordini in sequenza
  }
  
  // --- STATO ---
  const currentUser = ref(auth.currentUser);
  const isAdmin = ref(false); // Determinato dall'email o ruolo
  const viewMode = ref<'DISPATCHER' | 'DRIVER'>('DRIVER'); // Toggle per admin
  
  // Dati
  const poolOrders = ref<Order[]>([]); // Ordini 'DELIVERY' non assegnati
  const activeTrip = ref<Trip | null>(null); // Per autista o per visualizzazione admin
  const tripOrders = ref<Order[]>([]); // Ordini del viaggio attivo
  const drivers = ref<any[]>([]);
  
  const confirmModal = reactive({
  show: false,
  message: '',
  onConfirm: () => {}
});

  // Form Creazione Viaggio (Dispatcher)
  const newTrip = reactive({
    driverId: '',
    date: new Date().toISOString().split('T')[0],
    selectedOrderIds: [] as string[]
  });
  
  const showDeliveryModal = ref(false);
  const selectedOrderForDelivery = ref<any>(null);
  
  const checkRole = async () => {
    // Semplice check basato su email fisse o logica esistente
    const email = currentUser.value?.email;
    // Aggiungi qui la tua email se serve per testare
    if (email === 'info@inglesinaitaliana.it' || email === 'lavorazioni.inglesinaitaliana@gmail.com') {
      isAdmin.value = true;
    }
  };
  
  const loadDrivers = async () => {
    const q = query(collection(db, 'team'), orderBy('lastName', 'asc')); 
    const snap = await getDocs(q);
    drivers.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  };
  
  // --- LOGICA DISPATCHER (PIANIFICAZIONE) ---
  
  const loadPool = () => {
    // MODIFICA CRUCIALE: Rimosso where('assignedToTrip', '==', false)
    // Firestore esclude i documenti se il campo manca.
    // Filtriamo client-side per includere anche quelli dove il campo è undefined.
    const q = query(
      collection(db, 'preventivi'), 
      where('stato', '==', 'DELIVERY')
    );
    
    onSnapshot(q, (snap) => {
      console.log(`[DEBUG] Ordini in DELIVERY trovati: ${snap.docs.length}`);
      
      poolOrders.value = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Order))
        .filter(o => !o.assignedToTrip); // Include undefined, null e false
        
      console.log(`[DEBUG] Ordini da pianificare (Pool): ${poolOrders.value.length}`);
    });
  };
  
  // Raggruppamento Pool: Regione > Provincia
  const groupedPool = computed(() => {
    const groups: Record<string, Record<string, Order[]>> = {};
    
    poolOrders.value.forEach(o => {
      const reg = o.regione || 'Zone Varie';
      const prov = o.provincia || 'Altro';
      
      if (!groups[reg]) groups[reg] = {};
      if (!groups[reg][prov]) groups[reg][prov] = [];
      
      groups[reg][prov].push(o);
    });
    
    return groups;
  });
  
  // --- FUNZIONI DI RIORDINAMENTO (SEQUENZA) ---
  const moveStop = async (index: number, direction: 'UP' | 'DOWN') => {
  if (!activeTrip.value || !tripOrders.value) return;
  
  const newIndex = direction === 'UP' ? index - 1 : index + 1;
  
  // Controlli limiti array
  if (newIndex < 0 || newIndex >= tripOrders.value.length) return;

  // 1. Scambia nell'array locale
  // AGGIUNTI I PUNTI ESCLAMATIVI (!) PER CORREGGERE L'ERRORE TYPESCRIPT
  const temp = tripOrders.value[index]!; 
  tripOrders.value[index] = tripOrders.value[newIndex]!;
  tripOrders.value[newIndex] = temp;

  // 2. Aggiorna Firestore
  const newStopsIds = tripOrders.value.map(o => o.id);
  
  try {
    await updateDoc(doc(db, 'trips', activeTrip.value.id), {
       stops: newStopsIds
    });
    // Aggiorniamo anche l'oggetto locale activeTrip per coerenza
    if (activeTrip.value) {
        activeTrip.value.stops = newStopsIds;
    }
  } catch (e) {
    console.error("Errore riordino:", e);
    alert("Errore salvataggio sequenza");
    loadMyTrip(); 
  }
};

// --- AGGIUNGI QUESTO ALLO STATO ---
const allTrips = ref<Trip[]>([]);

// --- AGGIUNGI QUESTA FUNZIONE ---
const loadAllActiveTrips = () => {
  // Scarica tutti i viaggi APERTI ordinati per data creazione
  const q = query(collection(db, 'trips'), where('status', '==', 'OPEN'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    allTrips.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip));
  });
};

// --- AGGIORNA ONMOUNTED ---
onMounted(async () => {
  await checkRole();
  await loadDrivers();
  
  if (isAdmin.value) {
    viewMode.value = 'DISPATCHER';
    loadPool(); 
    loadAllActiveTrips(); // <--- AGGIUNGI QUESTA CHIAMATA
  } else {
    viewMode.value = 'DRIVER';
    loadMyTrip();
  }
});

// Se passo a "DRIVER", provo a caricare il MIO viaggio (se non ne sto già guardando uno)
watch(viewMode, (newMode: 'DISPATCHER' | 'DRIVER') => {
  if (newMode === 'DRIVER' && !activeTrip.value) {
     loadMyTrip();
  }
});

// --- FUNZIONE PER SPIARE IL VIAGGIO (Opzionale) ---
const inspectTrip = (trip: Trip) => {
    // Impostiamo manualmente il viaggio attivo e andiamo in modalità driver
    // Nota: serve una piccola modifica a loadMyTrip per non sovrascriverlo subito
    activeTrip.value = trip;
    // Carichiamo gli ordini di quel viaggio specifico
    const promises = trip.stops.map(oid => 
       getDocs(query(collection(db, 'preventivi'), where('__name__', '==', oid)))
    );
    Promise.all(promises).then(results => {
        tripOrders.value = results
           .map(r => !r.empty ? { id: r.docs[0]!.id, ...r.docs[0]!.data() } : null)
           .filter(o => o !== null) as Order[];
        viewMode.value = 'DRIVER';
    });
};

  const createTrip = async () => {
    if (!newTrip.driverId || newTrip.selectedOrderIds.length === 0) return alert("Seleziona autista e almeno un ordine.");
    
    try {
      const driver = drivers.value.find(d => d.id === newTrip.driverId);
      
      // 1. Crea documento Trip
      const tripRef = await addDoc(collection(db, 'trips'), {
        driverId: newTrip.driverId,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : 'Autista',
        date: newTrip.date,
        status: 'OPEN',
        stops: newTrip.selectedOrderIds, // Salviamo gli ID per mantenere la sequenza
        createdAt: serverTimestamp()
      });
  
      // 2. Aggiorna gli ordini (Batch)
      const batch = writeBatch(db);
      newTrip.selectedOrderIds.forEach(oid => {
        const ref = doc(db, 'preventivi', oid);
        batch.update(ref, {
          assignedToTrip: true,
          tripId: tripRef.id
        });
      });
      
      await batch.commit();
      
      alert("Viaggio creato con successo!");
      newTrip.selectedOrderIds = [];
      newTrip.driverId = '';
    } catch (e) {
      console.error(e);
      alert("Errore creazione viaggio");
    }
  };
  
  // --- LOGICA DRIVER (ESECUZIONE) ---
  const loadMyTrip = async () => {
  if (!currentUser.value) return;
  
  const q = query(
    collection(db, 'trips'),
    where('driverId', '==', currentUser.value.uid), 
    where('status', '==', 'OPEN')
  );
  
  onSnapshot(q, async (snap) => {
    if (!snap.empty) {
      const docData = snap.docs[0]!.data();
      // FIX: Usiamo una variabile locale per rassicurare TypeScript che non è null
      const currentTrip = { id: snap.docs[0]!.id, ...docData } as Trip;
      activeTrip.value = currentTrip;
      
      // Ora usiamo currentTrip invece di activeTrip.value
      if (currentTrip.stops && currentTrip.stops.length > 0) {
        const promises = currentTrip.stops.map(oid => 
           getDocs(query(collection(db, 'preventivi'), where('__name__', '==', oid)))
        );
        const results = await Promise.all(promises);
        
        tripOrders.value = results
           .map(r => !r.empty ? { id: r.docs[0]!.id, ...r.docs[0]!.data() } : null)
           .filter(o => o !== null) as Order[];
      } else {
        tripOrders.value = [];
      }
    } else {
      activeTrip.value = null;
      tripOrders.value = [];
    }
  });
};
  
// GENERATORE LINK GOOGLE MAPS
const openNavigator = () => {
  if (tripOrders.value.length === 0) return;
  
  // Ordine: Origine (Sede) -> Tappe -> Destinazione (Ultima tappa)
  const origin = "Via Cav. Angelo Manzoni 18, Sant'Angelo Lodigiano"; // TUA SEDE
  
  // FIX ERRORE TS: Estraiamo l'ultima tappa in modo sicuro
  const lastStop = tripOrders.value[tripOrders.value.length - 1];
  const destination = lastStop?.indirizzoConsegna || ''; // Fallback stringa vuota
  
  const waypoints = tripOrders.value
    .slice(0, -1) // Tutti tranne l'ultimo (che è la destinazione)
    .map(o => encodeURIComponent(o.indirizzoConsegna))
    .join('|');
    
  // FIX URL: Sintassi corretta per Google Maps Universal Link
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  
  if (waypoints) {
      url += `&waypoints=${waypoints}`;
  }
  
  window.open(url, '_blank');
};
  
  const openDeliveryModal = (order: Order) => {
    selectedOrderForDelivery.value = {
      ...order,
      // Adatta alla modale esistente
      idsToUpdate: [order.id],
      commessa: order.commessa,
      cliente: order.cliente,
      colli: order.colli,
      sommarioPreventivo: order.sommarioPreventivo || []
    };
    showDeliveryModal.value = true;
  };
  
  const handleConfirmDelivery = async (signatureBase64: string) => {
  if (!selectedOrderForDelivery.value) return;
  
  try {
     const orderId = selectedOrderForDelivery.value.id;

     // 1. Upload della Firma su Firebase Storage
     const firmaRef = storageRef(storage, `firme_consegne/TRIP_${Date.now()}_${orderId}.png`);
     await uploadString(firmaRef, signatureBase64, 'data_url');
     const signatureUrl = await getDownloadURL(firmaRef);

     // 2. Aggiorna lo stato dell'ordine con la firma
     await updateDoc(doc(db, 'preventivi', orderId), {
         stato: 'DELIVERED',
         firmaConsegna: signatureUrl,
         dataConsegnaEffettiva: serverTimestamp()
     });
     
     showDeliveryModal.value = false;
  } catch(e) { 
      console.error("Errore consegna:", e); 
      alert("Errore durante il salvataggio della consegna.");
  }
};
  
const closeTrip = async () => {
  if(!activeTrip.value) return;
  
  confirmModal.message = "Sei sicuro di voler chiudere questo viaggio? Non potrai più modificarlo.";
  confirmModal.onConfirm = async () => {
      await updateDoc(doc(db, 'trips', activeTrip.value!.id), {
          status: 'CLOSED',
          closedAt: serverTimestamp()
      });
      confirmModal.show = false;
  };
  confirmModal.show = true;
};
  
// --- HELPER RAGGRUPPAMENTO SPEDIZIONI (DDT vs ORDINI) ---
const getShipments = (list: Order[]) => {
  const groups: any[] = [];
  const ddtMap = new Map<string, Order[]>();

  list.forEach(o => {
    if (o.fic_ddt_id) {
      const key = String(o.fic_ddt_id);
      if (!ddtMap.has(key)) ddtMap.set(key, []);
      ddtMap.get(key)!.push(o);
    } else {
      groups.push({
        isDdt: false,
        key: o.id,
        ids: [o.id],
        cliente: o.cliente,
        info: `Ref: ${o.commessa}`,
        colli: Number(o.colli) || 1,
        citta: o.citta,
        provincia: o.provincia
      });
    }
  });

  ddtMap.forEach((orders, ddtId) => {
    const first = orders[0];
    
    // --- FIX: Controllo di sicurezza ---
    if (!first) return; 

    const totColli = orders.reduce((acc, curr) => acc + (Number(curr.colli) || 1), 0);
    groups.push({
      isDdt: true,
      key: `DDT_${ddtId}`,
      ids: orders.map(o => o.id),
      cliente: first.cliente,
      info: `DDT #${first.fic_ddt_number} • ${orders.length} Ordini`,
      colli: totColli,
      citta: first.citta,
      provincia: first.provincia
    });
  });

  return groups.sort((a, b) => a.cliente.localeCompare(b.cliente));
};

// Funzione di selezione modificata per accettare array di ID
const toggleSelection = (ids: string[]) => {
  const allSelected = ids.every(id => newTrip.selectedOrderIds.includes(id));
  if (allSelected) {
    // Deseleziona tutti
    newTrip.selectedOrderIds = newTrip.selectedOrderIds.filter(id => !ids.includes(id));
  } else {
    // Seleziona quelli mancanti
    const toAdd = ids.filter(id => !newTrip.selectedOrderIds.includes(id));
    newTrip.selectedOrderIds.push(...toAdd);
  }
};

// Helper visivo
const isSelected = (ids: string[]) => {
  return ids.length > 0 && ids.every(id => newTrip.selectedOrderIds.includes(id));
};

  </script>
  
  <template>
    <div class="min-h-screen bg-[#F0F4F8] font-sans pb-24 text-slate-700">
      
      <header class="bg-white sticky top-0 z-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
           <h1 class="text-2xl font-heading font-black text-slate-900">Logistica</h1>
           <p class="text-xs text-slate-500 font-bold uppercase tracking-wider">
             {{ viewMode === 'DISPATCHER' ? 'Pianificazione Viaggi' : 'Il mio Viaggio' }}
           </p>
        </div>
        
        <div v-if="isAdmin" class="flex bg-slate-100 p-1 rounded-lg">
           <button @click="viewMode = 'DRIVER'" class="px-3 py-1 text-xs font-bold rounded-md transition-colors" :class="viewMode === 'DRIVER' ? 'bg-white shadow text-slate-900' : 'text-slate-400'">Driver</button>
           <button @click="viewMode = 'DISPATCHER'" class="px-3 py-1 text-xs font-bold rounded-md transition-colors" :class="viewMode === 'DISPATCHER' ? 'bg-white shadow text-slate-900' : 'text-slate-400'">Admin</button>
        </div>
      </header>
  
      <main class="max-w-6xl mx-auto p-6">
        
        <div v-if="viewMode === 'DISPATCHER'" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           <div class="lg:col-span-2 space-y-6">
              <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                  <InboxStackIcon class="w-6 h-6 text-amber-500"/> Ordini da Pianificare
              </h2>
              
              <div v-if="poolOrders.length === 0" class="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                  <p class="text-slate-400 font-medium">Nessun ordine in attesa di spedizione interna.</p>
              </div>
  
              <div v-for="(province, regione) in groupedPool" :key="regione" class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{{ regione }}</h3>
                  
                  <div v-for="(list, prov) in province" :key="prov" class="mb-6 last:mb-0">
                      <div class="flex items-center gap-2 mb-3">
                          <span class="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded">{{ prov }}</span>
                          <div class="h-px bg-slate-100 flex-1"></div>
                      </div>
                      
                      <div class="space-y-3">
                        <div 
                          v-for="shipment in getShipments(list)" 
                          :key="shipment.key"
                          @click="toggleSelection(shipment.ids)"
                          class="flex items-center p-4 rounded-2xl border transition-all cursor-pointer group hover:shadow-md"
                          :class="isSelected(shipment.ids) ? 'bg-amber-50 border-amber-400' : 'bg-slate-50 border-transparent hover:bg-white'"
                        >
                          <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 transition-colors shrink-0"
                                :class="isSelected(shipment.ids) ? 'border-amber-500 bg-amber-500' : 'border-slate-300 group-hover:border-amber-400'">
                                <CheckCircleIcon v-if="isSelected(shipment.ids)" class="w-4 h-4 text-white" />
                          </div>
                          
                          <div class="flex-1 min-w-0">
                              <div class="flex justify-between items-center mb-0.5">
                                  <h4 class="font-bold text-slate-900 truncate">{{ shipment.cliente }}</h4>
                                  <span v-if="shipment.isDdt" class="ml-2 text-[9px] font-black bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">DDT</span>
                              </div>
                              <p class="text-xs text-slate-500 truncate">{{ shipment.citta }} ({{ shipment.provincia }})</p>
                              <p class="text-[10px] text-slate-400 mt-1 font-medium">{{ shipment.info }} • Colli: {{ shipment.colli }}</p>
                          </div>
                        </div>
                    </div>
                  </div>
              </div>
           </div>
  
           <div class="lg:col-span-1">
               <div class="bg-white rounded-[2rem] p-6 shadow-xl sticky top-24 border border-slate-100">
                   <h2 class="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                       <TruckIcon class="w-6 h-6 text-slate-800"/> Nuovo Viaggio
                   </h2>
                   <div class="mt-8">
   <h3 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Viaggi in Corso ({{ allTrips.length }})</h3>
   
   <div v-if="allTrips.length === 0" class="text-sm text-slate-400 italic">Nessun viaggio attivo.</div>

   <div class="space-y-3">
       <div 
         v-for="trip in allTrips" 
         :key="trip.id"
         class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group hover:border-amber-200 transition-all"
       >
           <div>
               <div class="font-bold text-slate-900 flex items-center gap-2">
                   <TruckIcon class="w-4 h-4 text-slate-400"/>
                   {{ trip.driverName }}
               </div>
               <div class="text-xs text-slate-500 mt-0.5">
                   {{ new Date(trip.date).toLocaleDateString('it-IT') }} • {{ trip.stops.length }} Stop
               </div>
           </div>
           
           <button 
             @click="inspectTrip(trip)"
             class="bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
           >
             Vedi
           </button>
       </div>
   </div>
</div>
                   <div class="space-y-4">
                       <div>
                           <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Data Partenza</label>
                           <input v-model="newTrip.date" type="date" class="w-full bg-slate-50 border-none rounded-xl p-3 font-bold text-slate-700">
                       </div>
                       
                       <div>
                           <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Autista</label>
                           <select v-model="newTrip.driverId" class="w-full bg-slate-50 border-none rounded-xl p-3 font-bold text-slate-700">
                               <option value="" disabled>Seleziona Autista</option>
                               <option v-for="d in drivers" :key="d.id" :value="d.id">{{ d.firstName }} {{ d.lastName }}</option>
                           </select>
                       </div>
  
                       <div class="bg-amber-50 rounded-xl p-4 border border-amber-100">
                           <div class="text-center">
                               <span class="block text-3xl font-black text-amber-500">{{ newTrip.selectedOrderIds.length }}</span>
                               <span class="text-xs font-bold text-amber-800 uppercase">Ordini Selezionati</span>
                           </div>
                       </div>
  
                       <button 
                          @click="createTrip"
                          :disabled="!newTrip.driverId || newTrip.selectedOrderIds.length === 0"
                          class="w-full py-4 rounded-xl bg-slate-900 text-white font-bold shadow-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
                       >
                          <PlusIcon class="w-5 h-5"/> Crea Viaggio
                       </button>
                   </div>
               </div>
           </div>
        </div>
  
        <div v-if="viewMode === 'DRIVER'" class="max-w-md mx-auto">
            
            <div v-if="!activeTrip" class="text-center py-20">
                <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <TruckIcon class="w-10 h-10 text-slate-300"/>
                </div>
                <h2 class="text-xl font-bold text-slate-900">Nessun Viaggio Attivo</h2>
                <p class="text-slate-500 text-sm mt-2">Non hai viaggi pianificati per oggi o il viaggio è chiuso.</p>
            </div>
  
            <div v-else>
                <div class="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl mb-6 relative overflow-hidden">
                    <div class="relative z-10">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Viaggio del</p>
                                <h2 class="text-2xl font-black">{{ new Date(activeTrip.date).toLocaleDateString('it-IT') }}</h2>
                            </div>
                            <div class="bg-amber-400 text-black text-xs font-black px-2 py-1 rounded">
                                {{ tripOrders.filter(o => o.stato !== 'DELIVERED').length }} / {{ tripOrders.length }} STOP
                            </div>
                        </div>
                        
                        <button @click="openNavigator" class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-white/10 backdrop-blur-sm">
                            <MapIcon class="w-5 h-5 text-amber-400"/> Avvia Navigatore Giro
                        </button>
                    </div>
                    <div class="absolute -right-6 -bottom-10 w-32 h-32 bg-amber-500 rounded-full blur-3xl opacity-20"></div>
                </div>
  
                <div class="space-y-0 relative pl-4">
                    <div class="absolute left-[27px] top-4 bottom-4 w-0.5 bg-slate-200"></div>
  
                    <div v-for="(stop, index) in tripOrders" :key="stop.id" class="relative pb-8 last:pb-0">
                        
                        <div class="absolute left-0 top-0 w-6 h-6 rounded-full border-2 z-10 flex items-center justify-center bg-white"
                             :class="stop.stato === 'DELIVERED' ? 'border-green-500' : (index === 0 || tripOrders[index-1]?.stato === 'DELIVERED' ? 'border-amber-500 scale-110' : 'border-slate-300')">
                             <div v-if="stop.stato === 'DELIVERED'" class="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                             <div v-else-if="index === 0 || tripOrders[index-1]?.stato === 'DELIVERED'" class="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></div>
                        </div>
  
                        <div class="ml-10 bg-white rounded-2xl p-4 shadow-sm border transition-all"
                          :class="stop.stato === 'DELIVERED' ? 'border-green-100 opacity-60' : 'border-slate-100'">
                          
                          <div class="flex justify-between items-start">
                              <h3 class="font-bold text-slate-900 truncate pr-2">{{ stop.cliente }}</h3>
                              
                              <div class="flex items-center gap-2">
                                  <div v-if="stop.stato !== 'DELIVERED' && activeTrip?.status === 'OPEN'" class="flex flex-col gap-1">
                                      <button 
                                        @click.stop="moveStop(index, 'UP')" 
                                        :disabled="index === 0"
                                        class="p-1 rounded bg-slate-100 hover:bg-amber-100 disabled:opacity-20 disabled:cursor-not-allowed"
                                      >
                                        <ChevronUpIcon class="w-3 h-3 text-slate-600"/>
                                      </button>
                                      <button 
                                        @click.stop="moveStop(index, 'DOWN')" 
                                        :disabled="index === tripOrders.length - 1"
                                        class="p-1 rounded bg-slate-100 hover:bg-amber-100 disabled:opacity-20 disabled:cursor-not-allowed"
                                      >
                                        <ChevronDownIcon class="w-3 h-3 text-slate-600"/>
                                      </button>
                                  </div>

                                  <span class="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 whitespace-nowrap">
                                      STOP {{ index + 1 }}
                                  </span>
                              </div>
                          </div>
                          
                          <p class="text-sm text-slate-500 mt-1 flex items-start gap-1">
                              <MapPinIcon class="w-4 h-4 shrink-0 mt-0.5 text-slate-400"/> 
                              {{ stop.indirizzoConsegna }}
                          </p>

                          <div v-if="stop.stato !== 'DELIVERED'" class="mt-4 flex gap-2">
                              <button 
                                  @click="openDeliveryModal(stop)"
                                  class="flex-1 bg-slate-900 text-white text-xs font-bold py-2.5 rounded-xl hover:bg-black transition-colors"
                              >
                                  Consegna
                              </button>
                          </div>
                          <div v-else class="mt-2 text-xs font-bold text-green-600 flex items-center gap-1">
                              <CheckCircleIcon class="w-4 h-4"/> Consegnato
                          </div>
                      </div>
                    </div>
                </div>
  
                <div v-if="tripOrders.length > 0 && tripOrders.every(o => o.stato === 'DELIVERED')" class="mt-8">
                    <button @click="closeTrip" class="w-full py-4 bg-green-500 text-white font-bold rounded-2xl shadow-lg shadow-green-200">
                        Termina Giro e Chiudi Viaggio
                    </button>
                </div>
  
            </div>
        </div>
  
      </main>
  
      <DeliveryModal 
        :show="showDeliveryModal" 
        :order="selectedOrderForDelivery" 
        @close="showDeliveryModal = false"
        @confirm="handleConfirmDelivery"
      />
  
    </div>
    <div v-if="confirmModal.show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <h3 class="text-lg font-bold text-gray-900 mb-2">Conferma Azione</h3>
        <p class="text-gray-500 mb-6 text-sm">{{ confirmModal.message }}</p>
        <div class="flex gap-3 justify-center">
          <button @click="confirmModal.show = false" class="px-4 py-2 rounded-lg text-gray-600 font-bold hover:bg-gray-100">Annulla</button>
          <button @click="confirmModal.onConfirm" class="px-6 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 shadow-md">Conferma</button>
        </div>
      </div>
    </div>
  </template>