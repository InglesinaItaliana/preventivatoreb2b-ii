<script setup lang="ts">
  import { ref, onMounted, reactive, computed } from 'vue';
  import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
  import { httpsCallable } from 'firebase/functions';
  import { db, functions } from '../firebase';
  import Papa from 'papaparse';
  import { 
    UserPlusIcon, PencilSquareIcon, MagnifyingGlassIcon, PhoneIcon, EnvelopeIcon,
    UsersIcon, BuildingOfficeIcon, CloudArrowUpIcon, PaperAirplaneIcon, CheckCircleIcon, ExclamationTriangleIcon,
    XCircleIcon 
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
  }
  
  // --- STATO ---
  const activeTab = ref<'TEAM' | 'CLIENTI'>('TEAM');
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
    firstName: '', lastName: '', email: '', role: 'COMMERCIALE', phone: '', active: true, color: 'bg-blue-500'
  });
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
  
  // --- CARICAMENTO DATI ---
  const fetchData = async () => {
    loading.value = true;
    try {
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
      
      const qClients = query(collection(db, 'users'), orderBy('ragioneSociale', 'asc'));
    const clientsSnap = await getDocs(qClients);
    
    clients.value = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientUser));
    } catch (e) { console.error(e); } 
    finally { loading.value = false; }
  };
  
  onMounted(fetchData);
  
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
    if (!memberForm.firstName || !memberForm.lastName || !memberForm.email) return alert("Dati mancanti");
    try {
      const payload = { ...memberForm, lastUpdate: serverTimestamp() };
      if (isEditing.value && currentMemberId.value) {
        await updateDoc(doc(db, 'team', currentMemberId.value), payload);
      } else {
        await addDoc(collection(db, 'team'), { ...payload, createdAt: serverTimestamp() });
      }
      showMemberModal.value = false;
      fetchData(); 
    } catch (e) { alert("Errore salvataggio"); }
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
    return alert("Inserisci una P.IVA o carica un CSV");
  }

  const total = pivaList.length;
  if (total === 0) return alert("Nessuna P.IVA trovata.");

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
    alert(msg);

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
    alert("Errore critico importazione: " + e.message);
  } finally {
    processing.value = false;
  }
};
  
  const toggleClientSelection = (id: string) => {
    if (selectedClientIds.value.includes(id)) selectedClientIds.value = selectedClientIds.value.filter(x => x !== id);
    else selectedClientIds.value.push(id);
  };
  
  const sendInvites = async (ids: string[]) => {
    if (ids.length === 0) return alert("Nessun cliente selezionato");
    if (!confirm(`Stai per inviare ${ids.length} email di invito con password. Procedere?`)) return;
  
    processing.value = true;
    try {
      const inviteFn = httpsCallable(functions, 'sendInvitesToClients');
      const res: any = await inviteFn({ uids: ids });
      alert(`Inviti inviati: ${res.data.sent}. Errori: ${res.data.failed}`);
      selectedClientIds.value = [];
      fetchData();
    } catch (e: any) {
      alert("Errore invio: " + e.message);
    } finally {
      processing.value = false;
    }
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
            <p class="text-lg font-medium text-gray-800 leading-none">Pannello di controllo amministrativo</p>
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
  
        <div v-if="activeTab === 'CLIENTI'">
           <div class="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div class="flex gap-4 flex-1 w-full">
                 <div class="relative flex-1">
                    <MagnifyingGlassIcon class="h-5 w-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input v-model="searchQuery" type="text" placeholder="Cerca cliente P.IVA o nome..." class="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-amber-200 text-sm font-bold text-slate-700 placeholder-slate-400">
                 </div>
                 <select v-model="filterClientStatus" class="bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold text-slate-600 cursor-pointer focus:ring-2 focus:ring-amber-200">
                    <option value="ALL">Tutti gli stati</option>
                    <option value="PENDING">Da Invitare</option>
                    <option value="ACTIVE">Attivi</option>
                 </select>
              </div>
              
              <div class="flex gap-2">
                 <button v-if="selectedClientIds.length > 0" @click="sendInvites(selectedClientIds)" class="bg-amber-400 hover:bg-amber-300 text-amber-950 px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-200/50 transition-transform active:scale-95 flex items-center gap-2 animate-pulse">
                    <PaperAirplaneIcon class="h-5 w-5" /> Invia {{ selectedClientIds.length }} Inviti
                 </button>
                 <button @click="showClientImportModal = true" class="bg-amber-400 hover:bg-amber-300 text-amber-950 px-6 py-3 rounded-xl font-bold shadow-lg shadow-slate-300 transition-transform active:scale-95 flex items-center gap-2">
                    <CloudArrowUpIcon class="h-5 w-5" /> Importa / Aggiungi
                 </button>
              </div>
           </div>
  
           <div class="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
              <table class="w-full text-left">
                 <thead class="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <tr>
                       <th class="px-6 py-4 w-10">
                       </th>
                       <th class="px-6 py-4">Ragione Sociale</th>
                       <th class="px-6 py-4">P.IVA / Città</th>
                       <th class="px-6 py-4">Email</th>
                       <th class="px-6 py-4 text-center">Stato</th>
                       <th class="px-6 py-4 text-right">Azioni</th>
                    </tr>
                 </thead>
                 <tbody class="divide-y divide-slate-50">
                    <tr v-for="client in filteredClients" :key="client.id" class="hover:bg-amber-50/30 transition-colors group">
                       <td class="px-6 py-4">
                          <input type="checkbox" :checked="selectedClientIds.includes(client.id)" @change="toggleClientSelection(client.id)" :disabled="client.status === 'ACTIVE'" class="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-5 w-5 cursor-pointer disabled:opacity-30">
                       </td>
                       <td class="px-6 py-4 font-bold text-slate-800">{{ client.ragioneSociale }}</td>
                       <td class="px-6 py-4 text-sm">
                          <div class="font-mono text-slate-600">{{ client.piva }}</div>
                          <div class="text-xs text-slate-400 font-medium">{{ client.citta }}</div>
                       </td>
                       <td class="px-6 py-4 text-sm text-slate-600">{{ client.email }}</td>
                       <td class="px-6 py-4 text-center">
                          <span v-if="client.status === 'ACTIVE'" class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-black border border-green-200 uppercase">
                             <CheckCircleIcon class="h-3 w-3" /> Attivo
                          </span>
                          <span v-else class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black border border-amber-200 uppercase">
                             <ExclamationTriangleIcon class="h-3 w-3" /> Da Invitare
                          </span>
                       </td>
                       <td class="px-6 py-4 text-right">
                          <button v-if="client.status !== 'ACTIVE'" @click="sendInvites([client.id])" class="text-xs font-bold text-blue-600 hover:underline">Invita Ora</button>
                       </td>
                    </tr>
                 </tbody>
              </table>
              <div v-if="filteredClients.length === 0" class="p-10 text-center text-slate-400 font-medium">Nessun cliente trovato.</div>
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
  
              <div v-if="!isEditing"> <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Colore Avatar</label>
                 <div class="flex gap-2 flex-wrap">
                    <div 
                    v-for="c in avatarColors" 
                    :key="c"
                    @click="memberForm.color = c"
                    class="w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 ring-2 ring-offset-2"
                    :class="[c, memberForm.color === c ? 'ring-slate-400' : 'ring-transparent']"
                    ></div>
                 </div>
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
  </template>