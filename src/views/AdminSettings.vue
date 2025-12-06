<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UserPlusIcon, 
  PencilSquareIcon, 
  TrashIcon, 
  XCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PhoneIcon,
  EnvelopeIcon
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
  color?: string; // Per l'avatar
}

// --- STATO ---
const members = ref<TeamMember[]>([]);
const loading = ref(true);
const showModal = ref(false);
const isEditing = ref(false);
const searchQuery = ref('');
const filterRole = ref('ALL');

// Form predefinito
const defaultForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'COMMERCIALE',
  phone: '',
  active: true,
  color: 'bg-blue-500'
};

const form = reactive({ ...defaultForm });
const currentId = ref<string | null>(null);

// Colori Avatar M3 Style
const avatarColors = [
  'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-green-400', 
  'bg-emerald-400', 'bg-teal-400', 'bg-cyan-400', 'bg-sky-400', 
  'bg-blue-400', 'bg-indigo-400', 'bg-violet-400', 'bg-purple-400', 
  'bg-fuchsia-400', 'bg-pink-400', 'bg-rose-400'
];

// --- CARICAMENTO DATI ---
const fetchTeam = async () => {
  loading.value = true;
  try {
    const snap = await getDocs(collection(db, 'team'));
    members.value = snap.docs.map(d => {
      const data = d.data();
      // Forziamo il casting e forniamo valori di default per evitare undefined
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
  } catch (e) {
    console.error("Errore caricamento team:", e);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchTeam);

// --- FILTRI (CORREZIONE QUI) ---
const filteredMembers = computed(() => {
  return members.value.filter(m => {
    // FIX: Aggiunti controlli di sicurezza (|| '') per evitare errori su undefined
    const fullName = (m.firstName || '') + ' ' + (m.lastName || '');
    const email = m.email || '';
    
    const matchSearch = (fullName + email).toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchRole = filterRole.value === 'ALL' || m.role === filterRole.value;
    
    return matchSearch && matchRole;
  });
});

// --- AZIONI ---
const openAddModal = () => {
  isEditing.value = false;
  currentId.value = null;
  Object.assign(form, { ...defaultForm, color: avatarColors[Math.floor(Math.random() * avatarColors.length)] });
  showModal.value = true;
};

const openEditModal = (member: TeamMember) => {
  isEditing.value = true;
  currentId.value = member.id;
  Object.assign(form, {
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    role: member.role,
    phone: member.phone || '',
    active: member.active,
    color: member.color || 'bg-gray-400'
  });
  showModal.value = true;
};

const saveMember = async () => {
  if (!form.firstName || !form.lastName || !form.email) return alert("Compila i campi obbligatori.");

  try {
    const payload = { ...form, lastUpdate: serverTimestamp() };

    if (isEditing.value && currentId.value) {
      await updateDoc(doc(db, 'team', currentId.value), payload);
      // Aggiorna locale
      const idx = members.value.findIndex(m => m.id === currentId.value);
      if (idx !== -1) members.value[idx] = { id: currentId.value, ...payload } as any;
    } else {
      const docRef = await addDoc(collection(db, 'team'), { ...payload, createdAt: serverTimestamp() });
      // Aggiungiamo i valori di default anche qui per coerenza
      members.value.push({ 
        id: docRef.id, 
        ...payload, 
        firstName: payload.firstName || '',
        lastName: payload.lastName || '',
        email: payload.email || ''
      } as any);
    }
    showModal.value = false;
  } catch (e) {
    console.error("Errore salvataggio:", e);
    alert("Errore durante il salvataggio.");
  }
};

const deleteMember = async (id: string) => {
  if (!confirm("Sei sicuro di voler eliminare questo membro? Questa azione è irreversibile.")) return;
  try {
    await deleteDoc(doc(db, 'team', id));
    members.value = members.value.filter(m => m.id !== id);
  } catch (e) {
    console.error(e);
    alert("Impossibile eliminare.");
  }
};

// Helper Initials
const getInitials = (f: string, l: string) => {
  const first = f.charAt(0);
  const last = l.charAt(0);
  return (first + last).toUpperCase();
};

</script>

<template>
  <div class="min-h-screen bg-[#f0f4f8] font-sans text-slate-700 p-6 pb-24">
    <div class="max-w-6xl mx-auto">
      
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 class="text-4xl font-heading font-extrabold text-slate-900">Gestione Team</h1>
          <p class="text-slate-500 mt-1">Amministra i collaboratori e i loro permessi di accesso.</p>
        </div>
        <button 
          @click="openAddModal" 
          class="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-slate-200 transition-all active:scale-95 flex items-center gap-2"
        >
          <UserPlusIcon class="h-5 w-5" />
          Nuovo Membro
        </button>
      </div>

      <div class="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center">
        <div class="relative flex-1 w-full">
          <MagnifyingGlassIcon class="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Cerca per nome o email..." 
            class="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-200 text-sm font-medium placeholder-slate-400"
          >
        </div>
        <div class="relative w-full md:w-auto">
          <FunnelIcon class="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select 
            v-model="filterRole" 
            class="w-full md:w-48 pl-10 pr-8 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-200 text-sm font-bold text-slate-600 appearance-none cursor-pointer"
          >
            <option value="ALL">Tutti i Ruoli</option>
            <option value="ADMIN">Admin</option>
            <option value="PRODUZIONE">Produzione</option>
            <option value="COMMERCIALE">Commerciale</option>
            <option value="LOGISTICA">Logistica</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="text-center py-20 text-slate-400 animate-pulse">Caricamento team...</div>
      
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div 
          v-for="member in filteredMembers" 
          :key="member.id" 
          class="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden"
          :class="!member.active ? 'opacity-60 grayscale-[0.5]' : ''"
        >
          <div class="absolute top-4 right-4">
            <span v-if="member.active" class="flex h-3 w-3 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span v-else class="h-3 w-3 rounded-full bg-slate-300 block"></span>
          </div>

          <div class="flex items-center gap-4 mb-4">
            <div 
              class="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-inner"
              :class="member.color || 'bg-slate-400'"
            >
              {{ getInitials(member.firstName, member.lastName) }}
            </div>
            <div>
              <h3 class="text-lg font-bold text-slate-900 leading-tight">{{ member.firstName }} {{ member.lastName }}</h3>
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{{ member.role }}</span>
            </div>
          </div>

          <div class="space-y-2 mb-6">
            <div class="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg">
              <EnvelopeIcon class="h-4 w-4 text-slate-400" />
              <span class="truncate">{{ member.email }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg">
              <PhoneIcon class="h-4 w-4 text-slate-400" />
              <span>{{ member.phone || 'Nessun telefono' }}</span>
            </div>
          </div>

          <div class="flex gap-2 pt-4 border-t border-slate-50">
            <button @click="openEditModal(member)" class="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs transition-colors flex items-center justify-center gap-1">
              <PencilSquareIcon class="h-4 w-4" /> Modifica
            </button>
            <button @click="deleteMember(member.id)" class="px-3 py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>

    </div>

    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" @click="showModal = false"></div>
      
      <div class="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in duration-200">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold font-heading text-slate-800">
            {{ isEditing ? 'Modifica Membro' : 'Aggiungi Membro' }}
          </h2>
          <button @click="showModal = false" class="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
            <XCircleIcon class="h-6 w-6 text-slate-400" />
          </button>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Nome</label>
              <input v-model="form.firstName" type="text" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 font-medium">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Cognome</label>
              <input v-model="form.lastName" type="text" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 font-medium">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Email Aziendale</label>
            <input v-model="form.email" type="email" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 font-medium">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Ruolo</label>
              <select v-model="form.role" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 font-bold text-slate-700">
                <option value="ADMIN">Admin</option>
                <option value="PRODUZIONE">Produzione</option>
                <option value="COMMERCIALE">Commerciale</option>
                <option value="LOGISTICA">Logistica</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Telefono</label>
              <input v-model="form.phone" type="tel" class="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 font-medium">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Colore Avatar</label>
            <div class="flex gap-2 flex-wrap">
              <div 
                v-for="c in avatarColors" 
                :key="c"
                @click="form.color = c"
                class="w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 ring-2 ring-offset-2"
                :class="[c, form.color === c ? 'ring-slate-400' : 'ring-transparent']"
              ></div>
            </div>
          </div>

          <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-xl mt-2 cursor-pointer" @click="form.active = !form.active">
            <div class="w-12 h-6 rounded-full relative transition-colors duration-300" :class="form.active ? 'bg-green-500' : 'bg-slate-300'">
              <div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 shadow-sm" :class="form.active ? 'left-7' : 'left-1'"></div>
            </div>
            <span class="text-sm font-bold" :class="form.active ? 'text-green-600' : 'text-slate-400'">
              {{ form.active ? 'Utente Attivo' : 'Utente Disabilitato' }}
            </span>
          </div>

        </div>

        <div class="mt-8 flex justify-end gap-3">
          <button @click="showModal = false" class="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Annulla</button>
          <button @click="saveMember" class="px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg shadow-slate-200 transition-transform active:scale-95">
            Salva Modifiche
          </button>
        </div>

      </div>
    </div>

  </div>
</template>