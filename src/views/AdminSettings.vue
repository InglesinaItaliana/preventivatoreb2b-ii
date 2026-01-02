<script setup lang="ts">
  import { ref, onMounted, reactive, computed } from 'vue';
  import { collection, getDocs, updateDoc, doc, serverTimestamp, query, orderBy, setDoc, getDoc } from 'firebase/firestore';  import { httpsCallable } from 'firebase/functions';
  import { db, functions } from '../firebase';
  import Papa from 'papaparse';
  import { useCatalogStore } from '../Data/catalog'; // <--- AGGIUNGI QUESTO
  import { 
  UserPlusIcon, PencilSquareIcon, MagnifyingGlassIcon, PhoneIcon, EnvelopeIcon,
  UsersIcon, BuildingOfficeIcon, CloudArrowUpIcon, PaperAirplaneIcon, CheckCircleIcon, ExclamationTriangleIcon,
  XCircleIcon, Cog6ToothIcon, TruckIcon, ClockIcon, CurrencyEuroIcon, TagIcon, MapPinIcon, IdentificationIcon
} from '@heroicons/vue/24/solid';
  
  // --- TIPI ---
  interface TeamMember {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'ADMIN' | 'PRODUZIONE' | 'COMMERCIALE' | 'LOGISTICA';
    phone?: string;
    active: boolean;
    color?: string;
  }
  
  interface ClientUser {
    id: string;
    ragioneSociale: string;
    email: string;
    piva: string;
    citta?: string;
    status: 'PENDING_INVITE' | 'ACTIVE';
    dataImportazione?: any;
    delivery_tariff_code?: string;
    detraction_value?: number;
    price_list_mode?: string;
  }

// --- STATO SETTINGS GLOBALI (Tipizzato per evitare errori TS) ---
const globalPricing = reactive<{
    delivery_tariffs: Record<string, number>;
    active_global_default: string;
  }>({
    delivery_tariffs: { 
        'Consegna Diretta V1': 0, 
        'Consegna Diretta V2': 0, 
        'Consegna Diretta V3': 0,
        'Consegna Diretta V4': 0,
        'Consegna Diretta V5': 0,
        'Consegna Diretta V6': 0,
        'Consegna Diretta V7': 0,
        'Consegna Diretta V8': 0,
        'Ritiro in sede': 0,
        'Spedizione': 0 
    },
    active_global_default: '2026-a'
  });

  const deliveryOptions = [
    'Consegna Diretta V1', 
    'Consegna Diretta V2', 
    'Consegna Diretta V3', 
    'Consegna Diretta V4', 
    'Consegna Diretta V5', 
    'Consegna Diretta V6', 
    'Consegna Diretta V7', 
    'Consegna Diretta V8', 
    'Ritiro in sede', 
    'Spedizione'
  ];
  const pricelistOptions = ['default', '2025-a', '2025x', '2026-a'];

  // --- STATO MODALE CLIENTE ---
  const showClientEditModal = ref(false);
  const editingClient = reactive({
    id: '',
    ragioneSociale: '',
    delivery_tariff_code: 'Consegna Diretta V1',
    detraction_value: 0,
    price_list_mode: 'default'
  });
  
  // --- STATO ---
  const activeTab = ref<'TEAM' | 'CLIENTI' | 'VARIE'>('TEAM');
  const minDays = ref(14);
  const members = ref<TeamMember[]>([]);
  const clients = ref<ClientUser[]>([]);
  const loading = ref(true);
  const processing = ref(false);
  
  // Modali
  const showMemberModal = ref(false);
  const showClientImportModal = ref(false);
  const isEditing = ref(false);
  
  // Filtri
  const searchQuery = ref('');
  const filterRole = ref('ALL');
  const filterClientStatus = ref('ALL');
  
  // Selezione Clienti
  const selectedClientIds = ref<string[]>([]);
  

// Form Membro
const memberForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: 'PRODUZIONE' as 'ADMIN' | 'PRODUZIONE' | 'COMMERCIALE' | 'LOGISTICA',
  phone: '',
  password: '', // Campo Password
  active: true, // <--- RIPRISTINATO (Risolve l'errore TS)
  color: 'bg-blue-500' // <--- RIPRISTINATO (Serve per l'avatar)
});

const resetMemberForm = () => {
  memberForm.firstName = '';
  memberForm.lastName = '';
  memberForm.email = '';
  memberForm.role = 'PRODUZIONE';
  memberForm.phone = '';
  memberForm.password = '';
  memberForm.active = true; // <--- Reset active
  // memberForm.color non serve resettarlo qui se lo gestisci in openAddMember, 
  // ma per sicurezza puoi rimettere un default o lasciarlo stare.
  currentMemberId.value = null;
  isEditing.value = false;
};

  const currentMemberId = ref<string | null>(null);
  
  // Form Cliente
  const clientImportForm = reactive({
    manualPiva: '',
    csvFile: null as File | null,
    sendNow: false 
  });
  
  const avatarColors = [
    'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-green-400', 'bg-emerald-400', 
    'bg-teal-400', 'bg-cyan-400', 'bg-sky-400', 'bg-blue-400', 'bg-indigo-400', 
    'bg-violet-400', 'bg-purple-400', 'bg-fuchsia-400', 'bg-pink-400', 'bg-rose-400'
  ];
  
const toastMessage = ref('');
const showToast = ref(false);
const confirmModal = reactive({
  show: false,
  message: '',
  onConfirm: () => {}
});

const showCustomToast = (message: string) => {
  toastMessage.value = message;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
    toastMessage.value = '';
  }, 2500); 
};

const openEditClient = (client: ClientUser) => {
  editingClient.id = client.id;
  editingClient.ragioneSociale = client.ragioneSociale;
  editingClient.delivery_tariff_code = client.delivery_tariff_code || 'Consegna Diretta V1';
  editingClient.detraction_value = client.detraction_value || 0;
  editingClient.price_list_mode = client.price_list_mode || 'default';
  showClientEditModal.value = true;
};

const saveClientSettings = async () => {
  try {
    await updateDoc(doc(db, 'users', editingClient.id), {
      delivery_tariff_code: editingClient.delivery_tariff_code,
      detraction_value: editingClient.detraction_value,
      price_list_mode: editingClient.price_list_mode
    });
    showClientEditModal.value = false;
    showCustomToast("Cliente aggiornato!");
    fetchData(); // Ricarica tabella
  } catch(e) {
    showCustomToast("Errore aggiornamento cliente");
  }
};

const saveSettings = async () => {
    try {
      // Salvataggio General
      await setDoc(doc(db, 'settings', 'general'), { minProcessingDays: minDays.value }, { merge: true });
      
      // Salvataggio Pricing
      await setDoc(doc(db, 'settings', 'pricing'), { 
        delivery_tariffs: globalPricing.delivery_tariffs,
        active_global_default: globalPricing.active_global_default
      }, { merge: true });

      showCustomToast("Impostazioni salvate!");
    } catch (e) { 
      console.error(e);
      showCustomToast("Errore salvataggio"); 
    }
  };

  // --- CARICAMENTO DATI ---
  const fetchData = async () => {
    loading.value = true;
    try {
      // 1. Carica Team
      const teamSnap = await getDocs(collection(db, 'team'));
      members.value = teamSnap.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          role: data.role || 'COMMERCIALE',
          phone: data.phone || '',
          active: data.active ?? true,
          color: data.color || 'bg-gray-400'
        } as TeamMember;
      });
      
      // 2. Carica Clienti
      const qClients = query(collection(db, 'users'), orderBy('ragioneSociale', 'asc'));
      const clientsSnap = await getDocs(qClients);
      clients.value = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientUser));

      // 3. Carica Settings Generali
      const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
      if (settingsSnap.exists()) {
        minDays.value = settingsSnap.data().minProcessingDays || 14;
      }

      // 4. Carica Settings Prezzi (NUOVO)
      const priceSettingsSnap = await getDoc(doc(db, 'settings', 'pricing'));
      if (priceSettingsSnap.exists()) {
        const data = priceSettingsSnap.data();
        if(data.delivery_tariffs) Object.assign(globalPricing.delivery_tariffs, data.delivery_tariffs);
        if(data.active_global_default) globalPricing.active_global_default = data.active_global_default;
      }

    } catch (e) { 
      console.error(e); 
    } finally { 
      loading.value = false; 
    }
  };
  
  // --- LOGICA SYNC PRODOTTI ---
const catalogStore = useCatalogStore();

  onMounted(fetchData);
  onMounted(async () => {
  // Carichiamo il catalogo all'avvio della pagina
  await catalogStore.fetchCatalog();
  
  // Se c'erano altre funzioni di caricamento (es. loadSettings, loadUsers) 
  // che venivano chiamate "libere" nel codice, è meglio spostarle qui dentro, 
  // ma se funzionava tutto puoi lasciare solo il fetchCatalog.
});
  
  // --- COMPUTED ---
  const filteredMembers = computed(() => {
    return members.value.filter(m => {
      const fullName = ((m.firstName || '') + ' ' + (m.lastName || ''));
      const searchMatch = (fullName + m.email).toLowerCase().includes(searchQuery.value.toLowerCase());
      const roleMatch = filterRole.value === 'ALL' || m.role === filterRole.value;
      return searchMatch && roleMatch;
    });
  });
  
  const filteredClients = computed(() => {
    return clients.value.filter(c => {
      const searchMatch = (c.ragioneSociale + c.piva + c.email).toLowerCase().includes(searchQuery.value.toLowerCase());
      const statusMatch = filterClientStatus.value === 'ALL' || 
                          (filterClientStatus.value === 'ACTIVE' && c.status === 'ACTIVE') ||
                          (filterClientStatus.value === 'PENDING' && c.status === 'PENDING_INVITE');
      return searchMatch && statusMatch;
    });
  });
  
  // --- AZIONI TEAM ---
  const openAddMember = () => {
    isEditing.value = false; currentMemberId.value = null;
    // Assegna colore casuale all'apertura del modale di creazione
    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    Object.assign(memberForm, { 
      firstName: '', lastName: '', email: '', role: 'COMMERCIALE', phone: '', 
      active: true, color: randomColor 
    });
    showMemberModal.value = true;
  };
  

  const saveMember = async () => {
  if (!memberForm.firstName || !memberForm.lastName || !memberForm.email) {
    return showCustomToast("Dati mancanti (Nome, Cognome, Email)");
  }

  // Se è un NUOVO utente, la password è obbligatoria
  if (!isEditing.value && !memberForm.password) {
    return showCustomToast("Inserisci una password per il nuovo utente.");
  }
  
  // Se la password c'è ma è troppo corta
  if (!isEditing.value && memberForm.password.length < 6) {
    return showCustomToast("La password deve essere di almeno 6 caratteri.");
  }

  try {
    if (isEditing.value) {
      // --- MODIFICA (Resta su Firestore diretto) ---
      // Nota: Non modifichiamo la password qui, solo i dati anagrafici
      if (currentMemberId.value) {
         await updateDoc(doc(db, 'team', currentMemberId.value), {
            firstName: memberForm.firstName,
            lastName: memberForm.lastName,
            role: memberForm.role,
            phone: memberForm.phone,
            lastUpdate: serverTimestamp()
         });
         showCustomToast("Membro aggiornato correttamente");
      }
    } else {
      // --- CREAZIONE (Chiama Cloud Function) ---
      showCustomToast("Creazione utente in corso..."); // Feedback visivo
      
      const createFn = httpsCallable(functions, 'createTeamMember');
      await createFn({
        email: memberForm.email,
        password: memberForm.password,
        firstName: memberForm.firstName,
        lastName: memberForm.lastName,
        role: memberForm.role,
        phone: memberForm.phone
      });

      showCustomToast("Utente e Accesso creati con successo!");
    }

    showMemberModal.value = false;
    fetchData(); // Ricarica la lista
    resetMemberForm();
    
  } catch (e: any) { 
    console.error(e);
    showCustomToast("Errore: " + (e.message || "Impossibile salvare")); 
  }
};
  
  // --- AZIONI CLIENTI ---
  const handleCsvUpload = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) clientImportForm.csvFile = target.files[0];
  };

  const processImport = async () => {
  let pivaList: string[] = [];

  // 1. Recupera P.IVA (Manuale o CSV)
  if (clientImportForm.manualPiva) {
    pivaList.push(clientImportForm.manualPiva.trim());
  } else if (clientImportForm.csvFile) {
    // Parsing CSV
    await new Promise<void>((resolve) => {
      Papa.parse(clientImportForm.csvFile!, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          results.data.forEach((row: any) => {
            // Cerca colonna P.IVA con varie intestazioni possibili
            const val = row['P.IVA'] || row['piva'] || row['VAT'] || Object.values(row)[0]; 
            if (val) pivaList.push(String(val).trim());
          });
          resolve();
        }
      });
    });
  } else {
    return showCustomToast("Inserisci una P.IVA o carica un CSV");
  }

  const total = pivaList.length;
  if (total === 0) return showCustomToast("Nessuna P.IVA trovata.");

  processing.value = true;
  
  // --- INIZIO LOGICA BATCH ---
  const BATCH_SIZE = 10; // Elaboriamo 10 clienti alla volta per sicurezza
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  let allErrors: string[] = [];

  try {
    const importFn = httpsCallable(functions, 'importClientsFromFiC');

    // Ciclo sui blocchi
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = pivaList.slice(i, i + BATCH_SIZE);
      
      try {
        // Chiamata al backend per il blocco corrente
        const res: any = await importFn({ vatNumbers: chunk });
        
        successCount += res.data.success;
        failedCount += res.data.failed;
        if (res.data.errors && res.data.errors.length > 0) {
          allErrors.push(...res.data.errors);
        }
      } catch (err: any) {
        console.error(`Errore nel blocco ${i}-${i + BATCH_SIZE}:`, err);
        failedCount += chunk.length;
        allErrors.push(`Errore di rete nel blocco ${i + 1}-${i + chunk.length}`);
      }

      processed += chunk.length;
      // Opzionale: qui potresti aggiornare una variabile di stato per una progress bar
      // console.log(`Progresso: ${processed}/${total}`);
    }
    
    // Report Finale
    let msg = `Importazione completata.\nSuccessi: ${successCount}\nFalliti: ${failedCount}`;
    if (allErrors.length > 0) {
      // Mostriamo solo i primi 10 errori per non intasare l'alert
      msg += `\n\nPrimi errori riscontrati:\n${allErrors.slice(0, 10).join('\n')}`;
      if (allErrors.length > 10) msg += `\n...e altri ${allErrors.length - 10}`;
    }
    showCustomToast(msg);

    // 3. Gestione "Invia Subito" per inserimento singolo manuale
    if (clientImportForm.manualPiva && clientImportForm.sendNow && successCount > 0) {
        await fetchData();
        const newClient = clients.value.find(c => c.piva === clientImportForm.manualPiva);
        if (newClient) {
            await sendInvites([newClient.id]);
        }
    } else {
        fetchData();
    }
    
    showClientImportModal.value = false;
    clientImportForm.manualPiva = '';
    clientImportForm.csvFile = null;

  } catch (e: any) {
    console.error(e);
    showCustomToast("Errore critico importazione: " + e.message);
  } finally {
    processing.value = false;
  }
};
  
  const toggleClientSelection = (id: string) => {
    if (selectedClientIds.value.includes(id)) selectedClientIds.value = selectedClientIds.value.filter(x => x !== id);
    else selectedClientIds.value.push(id);
  };
  
  const sendInvites = async (ids: string[]) => {
  if (ids.length === 0) return alert("Nessun cliente selezionato"); // Qui puoi usare showCustomToast se l'hai aggiunto
  
  confirmModal.message = `Stai per inviare ${ids.length} email di invito con password. Procedere?`;
  confirmModal.onConfirm = async () => {
    confirmModal.show = false; // Chiudi prima dell'azione
    processing.value = true;
    try {
      const inviteFn = httpsCallable(functions, 'sendInvitesToClients');
      const res: any = await inviteFn({ uids: ids });
      alert(`Inviti inviati: ${res.data.sent}. Errori: ${res.data.failed}`); // O showCustomToast
      selectedClientIds.value = [];
      fetchData();
    } catch (e: any) {
      alert("Errore invio: " + e.message);
    } finally {
      processing.value = false;
    }
  };
  confirmModal.show = true;
};
  
  const getInitials = (f: string, l: string) => {
    const first = f ? f.charAt(0) : '';
    const last = l ? l.charAt(0) : '';
    return (first + last).toUpperCase();
  };
  </script>
  
  <template>
    <div class="min-h-screen bg-[#F0F4F8] font-sans text-slate-700 p-6 pb-32">
      <div class="max-w-7xl mx-auto">
        
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Inglesina Italiana Srl</p>
            <div class="relative inline-block">
              <h1 class="relative z-10 text-6xl font-bold font-heading text-gray-900">P.O.P.S. Settings</h1>
              <div class="absolute bottom-2 left-0 w-full h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
          </div>
  
          <div class="flex bg-white p-1.5 rounded-full shadow-sm border border-slate-200">
            <button @click="activeTab = 'TEAM'" class="px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2" :class="activeTab === 'TEAM' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'">
              <UsersIcon class="h-4 w-4" /> Team Interno
            </button>
            <button @click="activeTab = 'CLIENTI'" class="px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2" :class="activeTab === 'CLIENTI' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'">
              <BuildingOfficeIcon class="h-4 w-4" /> Clienti B2B
            </button>
            <button @click="activeTab = 'VARIE'" class="px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2" :class="activeTab === 'VARIE' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'">
              <Cog6ToothIcon class="h-4 w-4" /> Varie
            </button>
          </div>
        </div>
  
        <div v-if="activeTab === 'TEAM'">
           <div class="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center">
              <div class="relative flex-1 w-full">
                <MagnifyingGlassIcon class="h-5 w-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input v-model="searchQuery" type="text" placeholder="Cerca membro..." class="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-200 text-sm font-bold text-slate-700 placeholder-slate-400 transition-all">
              </div>
              <button @click="openAddMember" class="bg-amber-400 hover:bg-amber-300 text-amber-950 px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-200/50 transition-transform active:scale-95 flex items-center gap-2">
                <UserPlusIcon class="h-5 w-5" /> Aggiungi
              </button>
           </div>
  
           <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div 
                v-for="member in filteredMembers" 
                :key="member.id" 
                class="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-amber-200 transition-all group relative" 
                :class="!member.active ? 'opacity-60 grayscale' : ''"
              >
                 <div class="absolute top-6 right-6">
                    <span v-if="member.active" class="flex h-3 w-3 relative">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span v-else class="h-3 w-3 rounded-full bg-slate-300 block"></span>
                 </div>
  
                 <div class="flex items-center gap-4 mb-4">
                    <div 
                      class="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-inner" 
                      :class="member.color || 'bg-slate-400'"
                    >
                      {{ getInitials(member.firstName, member.lastName) }}
                    </div>
                    <div>
                      <h3 class="text-lg font-bold text-slate-900 leading-tight">{{ member.firstName }} {{ member.lastName }}</h3>
                      <span class="text-[10px] font-black uppercase tracking-widest text-amber-500">{{ member.role }}</span>
                    </div>
                 </div>
                 
                 <div class="space-y-2 mb-6 text-sm font-medium text-slate-500">
                    <div class="flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><EnvelopeIcon class="h-4 w-4 text-slate-400"/> <span class="truncate">{{ member.email }}</span></div>
                    <div class="flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><PhoneIcon class="h-4 w-4 text-slate-400"/> {{ member.phone || '-' }}</div>
                 </div>
                 
                 <button @click="showMemberModal = true; isEditing=true; currentMemberId=member.id; Object.assign(memberForm, member)" class="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-amber-100 hover:text-amber-900 transition-colors flex items-center justify-center gap-2">
                    <PencilSquareIcon class="h-4 w-4"/> Modifica Scheda
                 </button>
              </div>
           </div>
        </div>
  
        <div v-if="activeTab === 'CLIENTI'" class="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div class="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div class="flex flex-col md:flex-row gap-4 flex-1 w-full">
                  <div class="relative flex-1">
                      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <MagnifyingGlassIcon class="h-5 w-5 text-slate-400" />
                      </div>
                      <input 
                          v-model="searchQuery" 
                          type="text" 
                          placeholder="Cerca per Ragione Sociale, P.IVA..." 
                          class="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-amber-200 text-sm font-bold text-slate-700 placeholder-slate-400 transition-all hover:bg-slate-100"
                      >
                  </div>
                  
                  <div class="relative min-w-[160px]">
                      <select v-model="filterClientStatus" class="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold text-slate-600 cursor-pointer focus:ring-2 focus:ring-amber-200 appearance-none hover:bg-slate-100 transition-all">
                          <option value="ALL">Tutti gli Stati</option>
                          <option value="PENDING">Da Invitare</option>
                          <option value="ACTIVE">Attivi</option>
                      </select>
                  </div>
              </div>
              
              <div class="flex gap-2 w-full md:w-auto">
                  <button v-if="selectedClientIds.length > 0" @click="sendInvites(selectedClientIds)" class="flex-1 md:flex-none bg-amber-400 hover:bg-amber-300 text-amber-950 px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-200/50 transition-transform active:scale-95 flex items-center justify-center gap-2 animate-pulse">
                      <PaperAirplaneIcon class="h-5 w-5" /> Invia Inviti ({{ selectedClientIds.length }})
                  </button>
                  <button @click="showClientImportModal = true" class="flex-1 md:flex-none bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-slate-300 transition-transform active:scale-95 flex items-center justify-center gap-2">
                      <CloudArrowUpIcon class="h-5 w-5" /> Importa
                  </button>
              </div>
          </div>

          <div class="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
              <table class="w-full text-left border-collapse">
                  <thead class="bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <tr>
                          <th class="px-6 py-5 w-10 text-center">
                              <span class="text-slate-300">#</span>
                          </th>
                          <th class="px-6 py-5">Azienda / Info</th>
                          <th class="px-6 py-5 hidden md:table-cell">Contatti & Sede</th>
                          <th class="px-6 py-5 text-center">Stato Account</th>
                          <th class="px-6 py-5 text-right">Azioni</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                      <tr v-for="client in filteredClients" :key="client.id" class="hover:bg-amber-50/40 transition-colors group">
                          
                          <td class="px-6 py-4 text-center">
                              <input 
                                  type="checkbox" 
                                  :checked="selectedClientIds.includes(client.id)" 
                                  @change="toggleClientSelection(client.id)" 
                                  :disabled="client.status === 'ACTIVE'" 
                                  class="rounded-[6px] border-slate-300 text-amber-500 focus:ring-amber-400 h-5 w-5 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                              >
                          </td>

                          <td class="px-6 py-4">
                              <div class="flex items-center gap-4">
                                  <div class="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:shadow-sm transition-all border border-slate-100">
                                      <BuildingOfficeIcon class="h-6 w-6" />
                                  </div>
                                  <div>
                                      <div class="font-bold text-slate-800 text-base leading-tight">{{ client.ragioneSociale }}</div>
                                      <div class="flex items-center gap-1 mt-1 text-slate-400 text-xs font-mono">
                                          <IdentificationIcon class="h-3 w-3" />
                                          <span>{{ client.piva }}</span>
                                      </div>
                                  </div>
                              </div>
                          </td>

                          <td class="px-6 py-4 hidden md:table-cell">
                              <div class="space-y-1.5">
                                  <div class="flex items-center gap-2 text-sm font-medium text-slate-600">
                                      <EnvelopeIcon class="h-4 w-4 text-slate-300" />
                                      <span>{{ client.email }}</span>
                                  </div>
                                  <div v-if="client.citta" class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase">
                                      <MapPinIcon class="h-3 w-3 text-slate-300" />
                                      <span>{{ client.citta }}</span>
                                  </div>
                              </div>
                          </td>

                          <td class="px-6 py-4 text-center">
                              <span v-if="client.status === 'ACTIVE'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black border border-emerald-200 uppercase tracking-wide shadow-sm">
                                  <CheckCircleIcon class="h-3.5 w-3.5" /> Attivo
                              </span>
                              <span v-else class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black border border-amber-200 uppercase tracking-wide shadow-sm animate-pulse">
                                  <ExclamationTriangleIcon class="h-3.5 w-3.5" /> Da Invitare
                              </span>
                          </td>

                          <td class="px-6 py-4 text-right">
                              <div class="flex justify-end gap-2">
                                  <button 
                                      @click="openEditClient(client)" 
                                      class="p-2.5 bg-slate-100 hover:bg-white hover:text-amber-600 hover:shadow-md border border-transparent hover:border-amber-100 text-slate-500 rounded-xl transition-all" 
                                      title="Configura Cliente"
                                  >
                                      <PencilSquareIcon class="h-5 w-5" />
                                  </button>

                                  <button 
                                      v-if="client.status !== 'ACTIVE'" 
                                      @click="sendInvites([client.id])" 
                                      class="p-2.5 bg-blue-50 hover:bg-blue-500 hover:text-white border border-blue-100 text-blue-600 rounded-xl transition-all shadow-sm"
                                      title="Invia Email di Invito"
                                  >
                                      <PaperAirplaneIcon class="h-5 w-5" />
                                  </button>
                              </div>
                          </td>
                      </tr>
                  </tbody>
              </table>
              
              <div v-if="filteredClients.length === 0" class="py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
                  <div class="bg-slate-50 p-6 rounded-full">
                      <UsersIcon class="h-12 w-12 text-slate-300" />
                  </div>
                  <p class="font-bold text-lg">Nessun cliente trovato</p>
                  <p class="text-sm opacity-60">Prova a modificare i filtri di ricerca</p>
              </div>
          </div>
      </div>
        <div v-if="activeTab === 'VARIE'" class="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div class="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div class="bg-slate-50/50 px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                <div class="bg-blue-100 p-2.5 rounded-xl text-blue-600 shadow-sm">
                  <TruckIcon class="w-6 h-6" />
                </div>
                <div>
                  <h3 class="text-lg font-bold text-slate-800 leading-tight">Tariffe Spedizioni</h3>
                  <p class="text-xs text-slate-400 font-medium">Gestione costi di consegna globali</p>
                </div>
              </div>

              <div class="p-8 flex-1">
                <div class="grid grid-cols-1 gap-5">
                  <div v-for="code in deliveryOptions" :key="code" class="relative group">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{{ code }}</label>
                    <div class="relative">
                      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <CurrencyEuroIcon class="w-5 h-5 text-slate-400" />
                      </div>
                      <input 
                        type="number" 
                        step="0.5" 
                        v-model.number="globalPricing.delivery_tariffs[code]" 
                        class="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-xl font-bold text-slate-700 text-lg focus:ring-2 focus:ring-blue-200 transition-all outline-none group-hover:bg-slate-100 focus:bg-white"
                        placeholder="0.00"
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <div class="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                <div class="bg-slate-50/50 px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                  <div class="bg-amber-100 p-2.5 rounded-xl text-amber-600 shadow-sm">
                    <Cog6ToothIcon class="w-6 h-6" />
                  </div>
                  <div>
                    <h3 class="text-lg font-bold text-slate-800 leading-tight">Impostazioni Generali</h3>
                    <p class="text-xs text-slate-400 font-medium">Parametri di sistema</p>
                  </div>
                </div>

                <div class="p-8 space-y-8">
                  
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Listino Default Nuovi Clienti</label>
                    <div class="relative">
                      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <TagIcon class="w-5 h-5 text-slate-400" />
                      </div>
                      <select 
                        v-model="globalPricing.active_global_default" 
                        class="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-200 outline-none appearance-none cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <option v-for="opt in pricelistOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Tempo min. Produzione</label>
                    <div class="relative">
                      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <ClockIcon class="w-5 h-5 text-slate-400" />
                      </div>
                      <input 
                        type="number" 
                        v-model.number="minDays" 
                        min="1"
                        class="w-full pl-12 pr-4 py-4 border-none bg-slate-50 rounded-xl font-bold text-slate-700 text-lg focus:ring-2 focus:ring-amber-200 outline-none hover:bg-slate-100 transition-colors"
                        placeholder="Es. 14"
                      >
                      <div class="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                          <span class="text-[10px] font-black text-slate-400 uppercase bg-slate-200/50 px-2 py-1 rounded-md">Giorni</span>
                        </div>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-2 ml-1">Blocca la selezione di date antecedenti nel calendario ordini.</p>
                  </div>

                </div>
              </div>
              
              <button 
                @click="saveSettings" 
                class="w-full bg-slate-900 text-white py-4 rounded-[1.5rem] font-bold text-lg shadow-xl shadow-slate-200 hover:bg-black hover:scale-[1.01] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Salva Tutte le Impostazioni</span>
                <CheckCircleIcon class="w-6 h-6 text-green-400" />
              </button>

            </div>

          </div>
        </div>
      </div>
      <div v-if="showMemberModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" @click="showMemberModal = false"></div>
        <div class="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in duration-200">
           
           <div class="flex justify-between items-center mb-6">
              <h2 class="text-2xl font-bold text-slate-900">{{ isEditing ? 'Modifica Membro' : 'Nuovo Membro' }}</h2>
              <button @click="showMemberModal = false" class="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                 <XCircleIcon class="h-6 w-6 text-slate-400" />
              </button>
           </div>
  
           <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Nome</label>
                    <input v-model="memberForm.firstName" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-amber-200">
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Cognome</label>
                    <input v-model="memberForm.lastName" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-amber-200">
                 </div>
              </div>
              
              <div>
                 <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Email Aziendale</label>
                 <input v-model="memberForm.email" type="email" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-amber-200">
              </div>
  
              <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Ruolo</label>
                    <select v-model="memberForm.role" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-amber-200">
                       <option value="ADMIN">Admin</option>
                       <option value="PRODUZIONE">Produzione</option>
                       <option value="COMMERCIALE">Commerciale</option>
                       <option value="LOGISTICA">Logistica</option>
                    </select>
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Telefono</label>
                    <input v-model="memberForm.phone" type="tel" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-amber-200">
                 </div>
              </div>
  
              <div v-if="!isEditing" class="animate-in fade-in slide-in-from-top-2">
                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Password Iniziale *</label>
                <div class="relative">
                  <KeyIcon class="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                  <input 
                    v-model="memberForm.password" 
                    type="text" 
                    class="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 font-bold text-slate-700 focus:ring-2 focus:ring-amber-400" 
                    placeholder="Es. Inglesina2025!"
                  >
                </div>
                <p class="text-[10px] text-slate-400 mt-1 pl-1">Minimo 6 caratteri. Comunica questa password all'utente.</p>
              </div>
  
              <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-xl mt-4 cursor-pointer" @click="memberForm.active = !memberForm.active">
                 <div class="w-12 h-6 rounded-full relative transition-colors duration-300" :class="memberForm.active ? 'bg-green-500' : 'bg-slate-300'">
                    <div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 shadow-sm" :class="memberForm.active ? 'left-7' : 'left-1'"></div>
                 </div>
                 <span class="text-sm font-bold" :class="memberForm.active ? 'text-green-600' : 'text-slate-400'">
                    {{ memberForm.active ? 'Utente Attivo' : 'Utente Disabilitato' }}
                 </span>
              </div>
  
           </div>
           
           <div class="mt-8 flex justify-end gap-3">
              <button @click="showMemberModal = false" class="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Annulla</button>
              <button @click="saveMember" class="px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg shadow-slate-200 transition-transform active:scale-95">
                 Salva Modifiche
              </button>
           </div>
        </div>
      </div>
  
      <div v-if="showClientImportModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" @click="!processing && (showClientImportModal = false)"></div>
        <div class="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in duration-200 border border-slate-100">
           
           <div class="flex items-center gap-3 mb-6">
              <div class="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><CloudArrowUpIcon class="h-6 w-6"/></div>
              <div>
                 <h2 class="text-xl font-bold text-slate-900">Importa Clienti da FiC</h2>
                 <p class="text-xs text-slate-500">Sincronizzazione tramite P.IVA</p>
              </div>
           </div>
  
           <div class="space-y-6">
              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-amber-400 transition-colors cursor-pointer relative group">
                 <label class="block text-xs font-black uppercase text-slate-400 mb-2">Massiva da CSV</label>
                 <input type="file" accept=".csv" @change="handleCsvUpload" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300">
                 <p class="text-[10px] text-slate-400 mt-2">Il file deve avere una colonna "P.IVA"</p>
              </div>
  
              <div class="relative flex py-1 items-center"><div class="flex-grow border-t border-slate-200"></div><span class="flex-shrink-0 mx-4 text-slate-300 text-xs font-bold">OPPURE</span><div class="flex-grow border-t border-slate-200"></div></div>
  
              <div>
                 <label class="block text-xs font-black uppercase text-slate-400 mb-2">Singola P.IVA</label>
                 <input v-model="clientImportForm.manualPiva" type="text" placeholder="IT00000000000" class="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-lg font-mono font-bold text-slate-700 focus:border-amber-400 focus:ring-0 outline-none">
                 
                 <div v-if="clientImportForm.manualPiva" class="mt-3 flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                    <input v-model="clientImportForm.sendNow" type="checkbox" class="h-5 w-5 text-amber-500 rounded border-gray-300 focus:ring-amber-400 cursor-pointer">
                    <span class="text-xs font-bold text-amber-800">Invia subito email di benvenuto e password?</span>
                 </div>
              </div>
           </div>
  
           <div class="mt-8 flex justify-end gap-3">
              <button @click="showClientImportModal = false" :disabled="processing" class="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Annulla</button>
              <button @click="processImport" :disabled="processing || (!clientImportForm.manualPiva && !clientImportForm.csvFile)" class="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                 <span v-if="processing" class="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></span>
                 {{ processing ? 'Elaborazione...' : 'Avvia Importazione' }}
              </button>
           </div>
  
        </div>
      </div>
  
    </div>
    <div 
      v-if="showToast" 
      class="fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300"
      :class="showToast ? 'opacity-100 backdrop-blur-sm bg-black/10' : 'opacity-0'">
      <div 
        class="bg-gray-800 text-white px-6 py-3 rounded-xl shadow-2xl transition-all duration-300 transform scale-100"
        :class="showToast ? 'translate-y-0' : 'translate-y-10'">
        <p class="font-bold text-lg whitespace-pre-line text-center">{{ toastMessage }}</p>
      </div>
    </div>
    <div v-if="confirmModal.show" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <h3 class="text-lg font-bold text-gray-900 mb-2">Conferma Invio</h3>
        <p class="text-gray-500 mb-6 text-sm">{{ confirmModal.message }}</p>
        <div class="flex gap-3 justify-center">
          <button @click="confirmModal.show = false" class="px-4 py-2 rounded-lg text-gray-600 font-bold hover:bg-gray-100">Annulla</button>
          <button @click="confirmModal.onConfirm" class="px-6 py-2 rounded-lg bg-amber-400 text-amber-950 font-bold hover:bg-amber-300 shadow-md">Procedi</button>
        </div>
      </div>
    </div>

    <div v-if="showClientEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="showClientEditModal = false"></div>
      <div class="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in duration-200">
        <h2 class="text-xl font-bold text-slate-900 mb-1">Settings Cliente</h2>
        <p class="text-sm text-slate-500 mb-6">{{ editingClient.ragioneSociale }}</p>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Listino Applicato</label>
            <select v-model="editingClient.price_list_mode" class="w-full bg-slate-50 border-none rounded-xl p-3 font-bold">
              <option value="default">Usa Default ({{ globalPricing.active_global_default }})</option>
              <option value="2025-a">Listino 2025-a</option>
              <option value="2025-x">Listino 2025-x (LEALI)</option>
              <option value="2026-a">Listino 2026-a</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Tariffa Consegna</label>
            <select v-model="editingClient.delivery_tariff_code" class="w-full bg-slate-50 border-none rounded-xl p-3 font-bold">
              <option v-for="code in deliveryOptions" :key="code" :value="code">{{ code }} ({{ globalPricing.delivery_tariffs[code] }}€)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Detrazione (Valore Intero)</label>
            <input type="number" v-model.number="editingClient.detraction_value" class="w-full bg-slate-50 border-none rounded-xl p-3 font-bold">
            <p class="text-[10px] text-slate-400 mt-1">Valore usato per calcoli futuri, non modifica il preventivo corrente.</p>
          </div>
        </div>

        <div class="mt-8 flex justify-end gap-3">
          <button @click="showClientEditModal = false" class="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Annulla</button>
          <button @click="saveClientSettings" class="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black shadow-lg">Salva</button>
        </div>
      </div>
    </div>

  </template>