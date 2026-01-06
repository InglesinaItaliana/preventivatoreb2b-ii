<script setup lang="ts">
  import { ref, onMounted, computed, reactive, watch } from 'vue';
  import { 
  collection, query, where, getDocs, getDoc, orderBy, onSnapshot, // <--- Aggiunto getDoc
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
  const clientDataMap = reactive<Record<string, any>>({});
  const confirmModal = reactive({
  show: false,
  message: '',
  onConfirm: () => {}
});

const fetchClientAddresses = async () => {
  console.log("🚀 AVVIO RICERCA INDIRIZZI CLIENTI...");
  
  const uids = new Set<string>();
  const emails = new Set<string>();

  // Raccogliamo tutti gli ID e le Email dal viaggio
  tripOrders.value.forEach(o => {
     if (o.clienteUID) uids.add(o.clienteUID);
     if (o.clienteEmail) emails.add(o.clienteEmail);
  });

  console.log(`🔍 Trovati ${uids.size} UID e ${emails.size} Email da cercare.`);

  // 1. TENTATIVO TRAMITE UID
  const uidPromises = [...uids].map(async (uid) => {
    if (clientDataMap[uid]) return;
    try {
      // Nota: Funziona solo se l'ID del documento è ESATTAMENTE l'UID
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        const addr = data.indirizzo 
           ? `${data.indirizzo}, ${data.citta || ''} (${data.provincia || ''})`
           : 'Indirizzo non presente nel profilo';
           
        clientDataMap[uid] = { address: addr, found: true };
        console.log(`✅ Cliente trovato per UID: ${uid}`);
      } else {
        console.warn(`⚠️ Nessun documento user trovato con ID: ${uid}`);
      }
    } catch (e) {
      console.error(`❌ Errore accesso DB users (UID ${uid}). VERIFICA REGOLE FIRESTORE!`, e);
    }
  });

  await Promise.all(uidPromises);

  // 2. TENTATIVO TRAMITE EMAIL (Fallback)
  const emailPromises = [...emails].map(async (email) => {
      const key = `EMAIL_${email}`;
      if (clientDataMap[key]) return;

      try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
           const data = snap.docs[0]!.data();
           const addr = data.indirizzo 
               ? `${data.indirizzo}, ${data.citta || ''} (${data.provincia || ''})`
               : 'Indirizzo non presente nel profilo';
           
           // Salviamo sia con chiave Email che con chiave UID (se lo troviamo) per sicurezza
           clientDataMap[key] = { address: addr, found: true };
           if (data.id || snap.docs[0]!.id) {
               clientDataMap[snap.docs[0]!.id] = { address: addr, found: true };
           }
           console.log(`✅ Cliente trovato per EMAIL: ${email} -> ${addr}`);
        } else {
            console.warn(`⚠️ Nessun utente trovato con email: ${email}`);
        }
      } catch (e: any) {
          console.error(`❌ Errore ricerca EMAIL ${email}:`, e);
          if (e.message.includes('index')) {
              alert("Manca l'indice su Firestore! Guarda la console per il link da cliccare.");
          }
      }
  });

  await Promise.all(emailPromises);
};

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
  
  const moveStop = async (index: number, direction: 'UP' | 'DOWN') => {
  if (!activeTrip.value) return;
  
  const groups = groupedTripStops.value;
  const newIndex = direction === 'UP' ? index - 1 : index + 1;
  
  if (newIndex < 0 || newIndex >= groups.length) return;

  const currentGroup = groups[index];
  const targetGroup = groups[newIndex];

  // Ricostruiamo la lista piatta di ID scambiando i blocchi
  const newStopsIds: string[] = [];
  
  groups.forEach((g, i) => {
    if (i === index) {
      newStopsIds.push(...targetGroup.ids); // Metti qui quello scambiato
    } else if (i === newIndex) {
      newStopsIds.push(...currentGroup.ids); // Metti qui quello corrente
    } else {
      newStopsIds.push(...g.ids); // Mantieni gli altri
    }
  });

  try {
    // Aggiorna Firestore
    await updateDoc(doc(db, 'trips', activeTrip.value.id), { stops: newStopsIds });
    // Aggiorna locale (opzionale se hai onSnapshot attivo, ma rende l'UI reattiva subito)
    if (activeTrip.value) activeTrip.value.stops = newStopsIds;
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
const inspectTrip = async (trip: Trip) => {
    // 1. Impostiamo il viaggio attivo
    activeTrip.value = trip;
    
    try {
        // 2. Carichiamo gli ordini di quel viaggio
        const promises = trip.stops.map(oid => 
           getDocs(query(collection(db, 'preventivi'), where('__name__', '==', oid)))
        );
        
        const results = await Promise.all(promises);
        
        tripOrders.value = results
        .map(r => !r.empty ? { ...r.docs[0]!.data(), id: r.docs[0]!.id } : null) // <--- PRIMA i dati, POI l'ID
          .filter(o => o !== null) as Order[];

        // 3. AGGIUNTA FONDAMENTALE: Scarichiamo gli indirizzi anche qui!
        await fetchClientAddresses(); 

        // 4. Cambiamo vista
        viewMode.value = 'DRIVER';
        
    } catch (e) {
        console.error("Errore ispezione viaggio:", e);
        alert("Impossibile caricare i dettagli del viaggio.");
    }
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
  // --- LOGICA DRIVER (ESECUZIONE) ---
const loadMyTrip = async () => {
  if (!currentUser.value || !currentUser.value.email) return;

  // CORREZIONE: Usiamo l'email minuscola, non l'UID
  const myEmail = currentUser.value.email.toLowerCase().trim();
  
  const q = query(
    collection(db, 'trips'),
    where('driverId', '==', myEmail), // <--- ORA CERCA L'EMAIL CORRETTA
    where('status', '==', 'OPEN')
  );
  
  onSnapshot(q, async (snap) => {
    // ... (il resto della funzione rimane identico) ...
    if (!snap.empty) {
      const docData = snap.docs[0]!.data();
      const currentTrip = { id: snap.docs[0]!.id, ...docData } as Trip;
      activeTrip.value = currentTrip;
      
      if (currentTrip.stops && currentTrip.stops.length > 0) {
        // ... caricamento ordini ...
        const promises = currentTrip.stops.map(oid => 
           getDocs(query(collection(db, 'preventivi'), where('__name__', '==', oid)))
        );
        const results = await Promise.all(promises);
        tripOrders.value = results
        .map(r => !r.empty ? { ...r.docs[0]!.data(), id: r.docs[0]!.id } : null) // <--- PRIMA i dati, POI l'ID
           .filter(o => o !== null) as Order[];
           await fetchClientAddresses();
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
// GENERATORE LINK GOOGLE MAPS (Versione Corretta)
const openNavigator = () => {
  // 1. Usiamo groupedTripStops perché contiene gli indirizzi CORRETTI (presi da users)
  // Non usare tripOrders perché lì l'indirizzo spesso manca!
  const stops = groupedTripStops.value;

  if (stops.length === 0) return;

  // 2. Definisci l'origine (La tua sede)
  const origin = "Via Cav. Angelo Manzoni 18, Sant'Angelo Lodigiano";

  // 3. L'ultima tappa è la DESTINAZIONE finale
  const lastStop = stops[stops.length - 1];
  
  // Se l'indirizzo manca o è generico, usiamo almeno la città
  let destination = lastStop.indirizzo;
  if (!destination || destination.includes('mancante')) {
      // Fallback estremo se ancora non c'è l'indirizzo
      destination = `${lastStop.primaryOrder.citta} ${lastStop.primaryOrder.provincia}`;
  }

  // 4. Tutte le altre tappe prima dell'ultima sono WAYPOINTS (Tappe intermedie)
  const waypoints = stops
    .slice(0, -1) // Prendi tutti tranne l'ultimo
    .map(s => {
        let addr = s.indirizzo;
        if (!addr || addr.includes('mancante')) {
             addr = `${s.primaryOrder.citta} ${s.primaryOrder.provincia}`;
        }
        return encodeURIComponent(addr);
    })
    .join('|');

  // 5. Costruisci l'URL Universale per Google Maps
  // Usiamo l'API 'dir' (Directions) che supporta bene origine, destinazione e tappe
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

  if (waypoints) {
      url += `&waypoints=${waypoints}`;
  }

  // Apre Google Maps (App su mobile o Sito su Desktop)
  window.open(url, '_blank');
};
  
const openDeliveryModal = (stopGroup: any) => {
  const mergedContent = stopGroup.orders.flatMap((o: any) => o.sommarioPreventivo || []);

  selectedOrderForDelivery.value = {
    ...stopGroup.primaryOrder,
    
    cliente: stopGroup.cliente,
    commessa: stopGroup.commessa,
    
    // CORREZIONE QUI: Passiamo il numero, non la stringa!
    colli: stopGroup.totalColli, 
    
    sommarioPreventivo: mergedContent, 
    idsToUpdate: stopGroup.ids
  };

  showDeliveryModal.value = true;
};
  
const handleConfirmDelivery = async (signatureBase64: string) => {
  if (!selectedOrderForDelivery.value) return;
  const ids = selectedOrderForDelivery.value.idsToUpdate;
  console.log("🛠️ ID ORDINI DA AGGIORNARE:", ids);
  try {
     const ids = selectedOrderForDelivery.value.idsToUpdate;
     const timestamp = serverTimestamp();

     // 1. Upload Firma (Unica per tutto il gruppo)
     const mainId = ids[0];
     const firmaRef = storageRef(storage, `firme_consegne/TRIP_${Date.now()}_${mainId}.png`);
     await uploadString(firmaRef, signatureBase64, 'data_url');
     const signatureUrl = await getDownloadURL(firmaRef);

     // 2. Batch Update (Aggiorna TUTTI gli ordini del DDT)
     const batch = writeBatch(db);
     ids.forEach((id: string) => {
        const ref = doc(db, 'preventivi', id);
        batch.update(ref, {
           stato: 'DELIVERED',
           firmaConsegna: signatureUrl,
           dataConsegnaEffettiva: timestamp
        });
     });
     
     await batch.commit();
     // --- AGGIUNTA: AGGIORNAMENTO LOCALE IMMEDIATO ---
     // Aggiorniamo l'array in memoria così la vista cambia subito senza ricaricare
     tripOrders.value = tripOrders.value.map(order => {
        if (ids.includes(order.id)) {
            return {
                ...order,
                stato: 'DELIVERED',
                firmaConsegna: signatureUrl,
                // Creiamo un oggetto compatibile col metodo .toDate() usato nel template
                dataConsegnaEffettiva: { toDate: () => new Date() } 
            };
        }
        return order;
     });
     // -----------------------------------------------
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

const groupedTripStops = computed(() => {
  const groups: any[] = [];
  const processedKeys = new Set<string>();

  tripOrders.value.forEach(order => {
    const key = order.fic_ddt_id ? `DDT_${order.fic_ddt_id}` : `ORD_${order.id}`;

    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    // --- LOGICA INDIRIZZO SUPER ROBUSTA ---
    // 1. Proviamo con UID
    let profileData = order.clienteUID ? clientDataMap[order.clienteUID] : null;
    
    // 2. Se fallisce, proviamo con Email
    if (!profileData && order.clienteEmail) {
        profileData = clientDataMap[`EMAIL_${order.clienteEmail}`];
    }
    
    // 3. Fallback finale a cascata
    const finalAddress = 
        profileData?.address || // Dal profilo (UID o Email)
        order.indirizzoConsegna || 
        order.indirizzo || 
        order.via ||
        // Se abbiamo città/provincia nell'ordine usiamo almeno quelle
        (order.citta ? `${order.citta} (${order.provincia || ''})` : null) ||
        'Indirizzo mancante (Profilo non trovato)';
    // ---------------------------------------

    let totColli = 0;
    let groupOrders: any[] = [];
    let firstOrder: any = order;

    if (order.fic_ddt_id) {
      groupOrders = tripOrders.value.filter(o => o.fic_ddt_id === order.fic_ddt_id);
      firstOrder = groupOrders[0]!;
      totColli = groupOrders.reduce((s, o) => s + (Number(o.colli)||1), 0);
    } else {
      groupOrders = [order];
      totColli = Number(order.colli) || 1;
    }

    groups.push({
      type: order.fic_ddt_id ? 'DDT' : 'ORDER',
      key,
      
      cliente: firstOrder.cliente || 'Cliente',
      indirizzo: finalAddress, // <--- ORA È POPOLATO
      commessa: order.fic_ddt_id ? `DDT #${firstOrder.fic_ddt_number || '?'}` : `Commessa ${firstOrder.commessa}`,
      
      primaryOrder: firstOrder,
      orders: groupOrders,
      ids: groupOrders.map(o => o.id),
      status: groupOrders.every(o => o.stato === 'DELIVERED') ? 'DELIVERED' : 'OPEN',
      
      totalColli: totColli,
      infoColli: order.fic_ddt_id 
          ? `${groupOrders.length} Ordini • ${totColli} Colli`
          : `1 Ordine • ${totColli} Colli`
    });
  });

  return groups;
});

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
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
    <div class="max-w-7xl mx-auto">
    <header class="flex justify-between items-center mb-8">
      <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Inglesina Italiana Srl</p>
            <div class="relative inline-block">
              <h1 class="relative z-10 text-6xl font-bold font-heading text-gray-900">P.O.P.S. Spedizioni</h1>
              <div class="absolute bottom-6 left-0 w-full h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
              <br>

              
            </div>
            <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              
              {{ viewMode === 'DISPATCHER' ? 'Pianificazione' : 'Il mio Viaggio' }}
            </p>
          </div>
        
         
      </div>
      
      <div v-if="isAdmin" class="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
         <button @click="viewMode = 'DRIVER'" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200" :class="viewMode === 'DRIVER' ? 'bg-white shadow-sm text-slate-900 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'">Driver</button>
         <button @click="viewMode = 'DISPATCHER'" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200" :class="viewMode === 'DISPATCHER' ? 'bg-white shadow-sm text-slate-900 ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'">Admin</button>
      </div>
    </header>
    </div>

    <main class="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      
      <div v-if="viewMode === 'DISPATCHER'" class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
         
         <div class="lg:col-span-2 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                    <div class="p-2 bg-amber-100 rounded-lg text-amber-600"><InboxStackIcon class="w-5 h-5"/></div>
                    Da Pianificare
                </h2>
                <span class="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-md">{{ poolOrders.length }} Ordini</span>
            </div>
            
            <div v-if="poolOrders.length === 0" class="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <InboxStackIcon class="w-8 h-8 text-slate-300"/>
                </div>
                <p class="text-slate-400 font-bold">Tutto spedito!</p>
                <p class="text-slate-400 text-xs">Nessun ordine in attesa.</p>
            </div>

            <div v-for="(province, regione) in groupedPool" :key="regione" class="bg-white rounded-[2rem] p-1 shadow-sm border border-slate-100 overflow-hidden">
                <div class="bg-slate-50/50 px-6 py-4 border-b border-slate-100">
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest">{{ regione }}</h3>
                </div>
                
                <div class="p-4 space-y-6">
                    <div v-for="(list, prov) in province" :key="prov">
                        <div class="flex items-center gap-3 mb-3 pl-2">
                            <span class="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">{{ prov }}</span>
                            <div class="h-px bg-slate-100 flex-1"></div>
                        </div>
                        
                        <div class="space-y-2">
                            <div 
                              v-for="shipment in getShipments(list)" 
                              :key="shipment.key"
                              @click="toggleSelection(shipment.ids)"
                              class="flex items-center p-4 rounded-2xl border transition-all duration-200 cursor-pointer group relative overflow-hidden"
                              :class="isSelected(shipment.ids) ? 'bg-amber-50 border-amber-400 shadow-md transform scale-[1.01]' : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'"
                            >
                              <div class="absolute left-0 top-0 bottom-0 w-1 transition-colors" :class="isSelected(shipment.ids) ? 'bg-amber-500' : 'bg-transparent'"></div>

                              <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 transition-all shrink-0 ml-2"
                                    :class="isSelected(shipment.ids) ? 'border-amber-500 bg-amber-500 scale-110' : 'border-slate-200 group-hover:border-slate-300'">
                                    <CheckCircleIcon v-if="isSelected(shipment.ids)" class="w-4 h-4 text-white" />
                              </div>
                              
                              <div class="flex-1 min-w-0">
                                  <div class="flex justify-between items-center mb-1">
                                      <h4 class="font-bold text-slate-900 truncate text-sm">{{ shipment.cliente }}</h4>
                                      <span v-if="shipment.isDdt" class="ml-2 text-[9px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 shadow-sm">DDT</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-xs text-slate-500">
                                      <span class="truncate">{{ shipment.citta }}</span>
                                      <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                                      <span class="font-medium text-slate-600">{{ shipment.colli }} Colli</span>
                                  </div>
                              </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
         </div>

         <div class="lg:col-span-1">
             <div class="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 sticky top-28 border border-slate-100 ring-1 ring-slate-900/5">
                 <h2 class="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                     <div class="p-2 bg-slate-100 rounded-lg"><TruckIcon class="w-5 h-5 text-slate-800"/></div>
                     Nuovo Viaggio
                 </h2>
                 
                 <div class="mb-8">
                     <div class="flex justify-between items-end mb-4">
                         <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Corso</h3>
                         <span class="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{{ allTrips.length }} attivi</span>
                     </div>

                     <div v-if="allTrips.length === 0" class="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">Nessun viaggio attivo.</div>

                     <div class="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                         <div v-for="trip in allTrips" :key="trip.id" class="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                             <div>
                                 <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                     <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                     {{ trip.driverName }}
                                 </div>
                                 <div class="text-[10px] text-slate-500 mt-0.5 pl-3.5">
                                     {{ new Date(trip.date).toLocaleDateString('it-IT') }} • {{ trip.stops.length }} Stop
                                 </div>
                             </div>
                             <button @click="inspectTrip(trip)" class="bg-white text-slate-600 border border-slate-200 hover:border-slate-900 hover:text-slate-900 p-1.5 rounded-lg transition-colors">
                               <MapIcon class="w-4 h-4"/>
                             </button>
                         </div>
                     </div>
                 </div>

                 <div class="space-y-5 pt-6 border-t border-slate-100">
                     <div class="space-y-1">
                         <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Data Partenza</label>
                         <input v-model="newTrip.date" type="date" class="w-full bg-slate-50 border-transparent focus:border-amber-400 focus:ring-0 rounded-xl px-4 py-3 font-bold text-slate-700 transition-colors">
                     </div>
                     
                     <div class="space-y-1">
                         <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Autista Assegnato</label>
                         <div class="relative">
                             <select v-model="newTrip.driverId" class="w-full bg-slate-50 border-transparent focus:border-amber-400 focus:ring-0 rounded-xl px-4 py-3 font-bold text-slate-700 appearance-none transition-colors cursor-pointer">
                                 <option value="" disabled>Seleziona Autista</option>
                                 <option v-for="d in drivers" :key="d.id" :value="d.id">{{ d.firstName }} {{ d.lastName }}</option>
                             </select>
                             <ChevronDownIcon class="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none"/>
                         </div>
                     </div>

                     <div class="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center justify-between">
                         <span class="text-xs font-bold text-amber-900 uppercase">Ordini<br>Selezionati</span>
                         <span class="text-3xl font-black text-amber-500">{{ newTrip.selectedOrderIds.length }}</span>
                     </div>

                     <button 
                        @click="createTrip"
                        :disabled="!newTrip.driverId || newTrip.selectedOrderIds.length === 0"
                        class="w-full py-4 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/20 hover:bg-black hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all flex justify-center items-center gap-2"
                     >
                        <PlusIcon class="w-5 h-5"/> Crea Viaggio
                     </button>
                 </div>
             </div>
         </div>
      </div>

      <div v-if="viewMode === 'DRIVER'" class="max-w-md mx-auto">
          
          <div v-if="!activeTrip" class="text-center py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-slate-200/50">
                  <TruckIcon class="w-10 h-10 text-slate-300"/>
              </div>
              <h2 class="text-xl font-black text-slate-900 mb-2">Nessun Viaggio</h2>
              <p class="text-slate-500 text-sm max-w-[200px] mx-auto">Tutto tranquillo oggi.</p>
          </div>

          <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div class="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-900/20 mb-10 relative overflow-hidden group">
                  <div class="absolute -right-10 -top-10 w-40 h-40 bg-slate-800 rounded-full blur-3xl opacity-50 group-hover:bg-slate-700 transition-colors duration-500"></div>
                  <div class="absolute -left-10 -bottom-10 w-40 h-40 bg-amber-600 rounded-full blur-3xl opacity-20"></div>

                  <div class="relative z-10">
                      <div class="flex justify-between items-start mb-6">
                          <div>
                              <p class="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-1">Viaggio Attivo</p>
                              <h2 class="text-3xl font-black tracking-tight">{{ new Date(activeTrip.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long'}) }}</h2>
                              <p class="text-slate-400 text-sm font-medium mt-1">{{ activeTrip?.driverName }} al volante</p>
                          </div>
                          <div class="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-center">
                              <span class="block text-lg font-black text-white">{{ groupedTripStops.filter(g => g.status !== 'DELIVERED').length }}</span>
                              <span class="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Stop Rimasti</span>
                          </div>
                      </div>
                      
                      <button @click="openNavigator" class="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-900/20">
                          <MapIcon class="w-5 h-5"/> Avvia Navigatore
                      </button>
                  </div>
              </div>

              <div class="relative pl-4 pb-20">
                <div class="absolute left-11 -translate-x-1/2 top-6 bottom-0 w-4 bg-amber-400 rounded-full opacity-80"></div>
                  <div v-for="(stop, index) in groupedTripStops" :key="stop.key" class="relative pb-10 last:pb-0 group">
                      
                      <div class="absolute left-0 top-0 z-10 transition-transform duration-300 group-hover:scale-110">
                           <div v-if="stop.status === 'DELIVERED'" class="w-14 h-14 rounded-full bg-green-100 border-4 border-white shadow-sm flex items-center justify-center">
                               <CheckCircleIcon class="w-6 h-6 text-green-600" />
                           </div>
                           
                           <div v-else-if="index === 0 || groupedTripStops[index-1]?.status === 'DELIVERED'" class="w-14 h-14 rounded-full bg-slate-900 border-4 border-white shadow-lg flex items-center justify-center relative">
                               <div class="absolute inset-0 rounded-full border border-slate-900/10 animate-ping opacity-20"></div>
                               <span class="font-black text-white text-lg">{{ index + 1 }}</span>
                           </div>
                           
                           <div v-else class="w-14 h-14 rounded-full bg-white border-4 border-slate-50 shadow-sm flex items-center justify-center text-slate-300 font-bold text-lg">
                               {{ index + 1 }}
                           </div>
                      </div>

                      <div class="ml-20 bg-white rounded-[2rem] p-5 border transition-all duration-300"
                        :class="[
                          stop.status === 'DELIVERED' ? 'border-green-100 opacity-60 grayscale-[0.5]' : 'border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:scale-[1.02] hover:border-amber-200',
                          (index === 0 || groupedTripStops[index-1]?.status === 'DELIVERED') && stop.status !== 'DELIVERED' ? 'ring-2 ring-amber-400/20' : ''
                        ]">
                        
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-black text-slate-900 text-lg leading-tight truncate pr-2">{{ stop.cliente }}</h3>
                            
                            <div v-if="stop.status !== 'DELIVERED' && activeTrip && activeTrip.status === 'OPEN'" class="flex flex-col gap-1 -mr-2">
                                <button @click.stop="moveStop(index, 'UP')" :disabled="index === 0" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-0 transition-colors"><ChevronUpIcon class="w-4 h-4"/></button>
                                <button @click.stop="moveStop(index, 'DOWN')" :disabled="index === groupedTripStops.length - 1" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-0 transition-colors"><ChevronDownIcon class="w-4 h-4"/></button>
                            </div>
                        </div>
                        
                        <p class="text-sm text-slate-500 font-medium flex items-start gap-1.5 mb-4 leading-relaxed">
                            <MapPinIcon class="w-4 h-4 shrink-0 mt-0.5 text-slate-400"/> 
                            {{ stop.indirizzo }}
                        </p>
                        
                        <div class="flex items-center flex-wrap gap-2 mb-4">
                           <span v-if="stop.type === 'DDT'" class="text-[10px] font-black bg-slate-900 text-white px-2 py-1 rounded-lg uppercase tracking-wider shadow-sm">DDT</span>
                           <span class="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200">{{ stop.commessa }}</span>
                           <span class="text-xs font-medium text-slate-400 px-1">{{ stop.infoColli }}</span>
                        </div>

                        <div v-if="stop.status !== 'DELIVERED'">
                            <button 
                                @click="openDeliveryModal(stop)"
                                class="w-full bg-slate-50 hover:bg-slate-900 hover:text-white text-slate-900 text-sm font-bold py-3.5 rounded-xl transition-all duration-300 border border-slate-200 hover:border-slate-900 flex items-center justify-center gap-2 group/btn"
                            >
                                <span>Firma Consegna</span>
                                <ChevronDownIcon class="w-4 h-4 -rotate-90 group-hover/btn:translate-x-1 transition-transform"/>
                            </button>
                        </div>
                        <div v-else class="mt-2 text-xs font-bold text-green-600 flex items-center gap-1.5 bg-green-50 p-2 rounded-lg w-fit">
                            <CheckCircleIcon class="w-4 h-4"/> Consegnato alle {{ stop.orders[0].dataConsegnaEffettiva ? new Date(stop.orders[0].dataConsegnaEffettiva.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '' }}
                        </div>
                    </div>
                  </div>
              </div>

              <div v-if="groupedTripStops.length > 0 && groupedTripStops.every(g => g.status === 'DELIVERED')" class="mt-8 pb-10 animate-in zoom-in duration-300">
                  <div class="bg-green-500/10 p-6 rounded-[2rem] text-center border border-green-500/20 mb-4">
                      <div class="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-green-500/30">
                          <CheckCircleIcon class="w-8 h-8"/>
                      </div>
                      <h3 class="text-green-800 font-black text-xl mb-1">Giro Completato!</h3>
                      <p class="text-green-700/80 text-sm">Tutte le consegne sono state effettuate.</p>
                  </div>
                  
                  <button @click="closeTrip" class="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-black active:scale-[0.98] transition-all">
                      Termina e Chiudi Viaggio
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

    <div v-if="confirmModal.show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div class="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center transform transition-all scale-100">
        <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <SparklesIcon class="w-6 h-6"/>
        </div>
        <h3 class="text-xl font-black text-slate-900 mb-2">Conferma</h3>
        <p class="text-slate-500 mb-8 text-sm leading-relaxed">{{ confirmModal.message }}</p>
        <div class="grid grid-cols-2 gap-3">
          <button @click="confirmModal.show = false" class="px-4 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">Annulla</button>
          <button @click="confirmModal.onConfirm" class="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black shadow-lg shadow-slate-900/10 transition-transform active:scale-95">Procedi</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Scrollbar personalizzata per la lista viaggi admin */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
}
</style>  
