<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, functions } from '../firebase'; 
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth'; // Importante per la reattività
import { 
  BugAntIcon, 
  XMarkIcon, 
  PaperAirplaneIcon, 
  ComputerDesktopIcon,
  WrenchScrewdriverIcon,
  CalculatorIcon,
  ChartBarIcon,
  TruckIcon,
  UserPlusIcon,
  CogIcon
} from '@heroicons/vue/24/solid';

const isOpen = ref(false);       
const isMenuOpen = ref(false);   
const isSending = ref(false);
const route = useRoute();
const router = useRouter();

// Stato Reattivo
const currentUserEmail = ref<string | null>(null);
const isAuthReady = ref(false); // <--- NUOVO: Blocca il rendering finché non sappiamo chi sei

// Ascolta i cambiamenti di stato dell'autenticazione
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    currentUserEmail.value = user?.email || null;
    isAuthReady.value = true; // <--- ORA possiamo mostrare il componente corretto
  });
});

// Calcola se è admin basandosi sulla variabile reattiva
const isAdmin = computed(() => currentUserEmail.value === 'info@inglesinaitaliana.it');

// Navigazione Menu Admin
const adminLinks = [
  { label: 'Admin Dashboard', route: '/admin', icon: ChartBarIcon },
  { label: 'Crea per Cliente', route: '/preventivatore?admin=true&new=true', icon: UserPlusIcon }, // <--- NUOVA VOCE
  { label: 'Calcoli Lavorazioni', route: '/calcoli', icon: CalculatorIcon }, 
  { label: 'Produzione', route: '/production', icon: CogIcon },
  { label: 'Spedizioni', route: '/delivery', icon: TruckIcon },
];

const form = reactive({
  title: '',
  description: '',
  category: 'Errore Funzionale'
});

const categories = [
  'UI/Grafica', 'Errore Funzionale', 'Performance', 'Dati Errati', 'Suggerimento'
];

const getTechnicalContext = () => ({
  userAgent: navigator.userAgent,
  screenSize: `${window.innerWidth}x${window.innerHeight}`,
  timestamp: new Date().toISOString(),
  path: route.fullPath,
  userUid: auth.currentUser?.uid || 'anon',
  platform: navigator.platform
});

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const openBugReport = () => {
  isMenuOpen.value = false; 
  isOpen.value = true;      
};

const navigateTo = (path: string) => {
  isMenuOpen.value = false;
  router.push(path);
};

const submitBug = async () => {
  if (!form.title || !form.description) return alert("Compila titolo e descrizione.");
  
  isSending.value = true;
  
  try {
    const submitFn = httpsCallable(functions, 'submitBugToNotion');
    await submitFn({
      title: form.title,
      description: form.description,
      category: form.category,
      pageUrl: window.location.href,
      userEmail: currentUserEmail.value || 'sconosciuto',
      technicalContext: getTechnicalContext()
    });

    alert("Segnalazione inviata con successo! Grazie.");
    isOpen.value = false;
    form.title = '';
    form.description = '';
    form.category = 'Errore Funzionale';

  } catch (e) {
    console.error(e);
    alert("Errore durante l'invio. Riprova più tardi.");
  } finally {
    isSending.value = false;
  }
};
</script>

<template>
    <div v-if="isAuthReady" class="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 animate-fade-in">    
    <Transition
      enter-active-class="transition-all duration-300 cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      enter-from-class="opacity-0 scale-90 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-90 translate-y-4"
    >
      <div v-if="isMenuOpen" class="bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 min-w-[220px] flex flex-col gap-1 mb-2 origin-bottom-right overflow-hidden">
        
        <div class="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Strumenti Rapidi</div>

        <button @click="openBugReport" class="flex items-center gap-3 w-full px-4 py-3 rounded-2xl hover:bg-rose-50 text-gray-700 hover:text-rose-600 transition-colors group">
          <div class="bg-rose-100 p-2 rounded-xl group-hover:bg-rose-200 transition-colors">
            <BugAntIcon class="h-5 w-5 text-rose-600" />
          </div>
          <div class="flex flex-col items-start">
            <span class="font-bold text-sm">Segnala un Bug</span>
            <span class="text-[10px] text-gray-400">Invia feedback tecnico</span>
          </div>
        </button>

        <template v-if="isAdmin">
          <div class="h-px bg-gray-100 my-1 mx-2"></div>
          <div class="px-4 py-1 text-[10px] font-bold text-blue-400 uppercase tracking-wider">Amministrazione</div>
          
          <button 
            v-for="link in adminLinks" 
            :key="link.route"
            @click="navigateTo(link.route)"
            class="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-gray-50 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <component :is="link.icon" class="h-5 w-5 opacity-70" />
            <span class="text-sm font-medium">{{ link.label }}</span>
          </button>
        </template>

      </div>
    </Transition>

    <button 
      @click="toggleMenu"
      class="h-16 w-16 bg-yellow-400 hover:bg-yellow-300 text-black rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center justify-center relative overflow-hidden group active:scale-95"
      :class="isMenuOpen ? 'rotate-90 rounded-[1.5rem]' : 'rounded-2xl'"
    >
      <WrenchScrewdriverIcon 
        class="h-7 w-7 absolute transition-all duration-300 transform"
        :class="isMenuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'"
      />
      <XMarkIcon 
        class="h-8 w-8 absolute transition-all duration-300 transform"
        :class="isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'"
      />
    </button>

  </div>

  <Transition name="slide">
    <div v-if="isOpen" class="fixed inset-0 z-[10000] flex justify-end">
      <div class="absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity" @click="isOpen = false"></div>

      <div class="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div class="bg-gray-900 text-white p-6 flex justify-between items-center shadow-sm shrink-0">
          <h2 class="font-bold text-xl flex items-center gap-2 font-heading">
            <BugAntIcon class="h-6 w-6 text-yellow-400" />
            Report Problema
          </h2>
          <button @click="isOpen = false" class="hover:bg-white/20 p-1.5 rounded-full transition-colors">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto bg-gray-50 space-y-6">
          <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 flex gap-3">
            <ComputerDesktopIcon class="h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <p class="font-bold mb-1">Contesto Automatico:</p>
              <ul class="space-y-0.5 opacity-80 font-mono">
                <li>Pagina: {{ route.name || 'Dashboard' }}</li>
                <li>Url: {{ route.path }}</li>
                <li>User: {{ currentUserEmail }}</li>
              </ul>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Titolo</label>
              <input v-model="form.title" type="text" class="w-full bg-white border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-shadow shadow-sm" placeholder="Breve riassunto del problema">
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Categoria</label>
              <select v-model="form.category" class="w-full bg-white border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5">Descrizione</label>
              <textarea v-model="form.description" rows="5" class="w-full bg-white border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-shadow shadow-sm resize-none" placeholder="Cosa è successo?"></textarea>
            </div>
          </div>
        </div>

        <div class="p-5 bg-white border-t border-gray-100 shrink-0">
          <button 
            @click="submitBug" 
            :disabled="isSending"
            class="w-full bg-gray-900 hover:bg-black text-white font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <span v-if="isSending" class="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></span>
            <PaperAirplaneIcon v-else class="h-5 w-5" />
            {{ isSending ? 'Invio in corso...' : 'Invia Report' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* Transizioni Vue per il pannello laterale */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

.slide-enter-to,
.slide-leave-from {
  transform: translateX(0);
}
</style>