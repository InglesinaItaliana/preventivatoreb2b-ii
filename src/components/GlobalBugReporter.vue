<script setup lang="ts">
  import { ref, reactive, computed, onMounted } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { auth, functions } from '../firebase'; 
  import { httpsCallable } from 'firebase/functions';
  import { onAuthStateChanged } from 'firebase/auth';
  import { 
    BugAntIcon, 
    XMarkIcon, 
    PaperAirplaneIcon,
    AdjustmentsHorizontalIcon, 
    ComputerDesktopIcon,
    PlusIcon,
    CalculatorIcon,
    ChartBarIcon,
    TruckIcon,
    UserPlusIcon,
    PlusCircleIcon,
    CubeIcon,
    CogIcon,
    SparklesIcon
  } from '@heroicons/vue/24/solid';
  
  const isOpen = ref(false);       
  const isMenuOpen = ref(false);   
  const isSending = ref(false);
  const route = useRoute();
  const router = useRouter();
  
  // Stato Reattivo
  const currentUserEmail = ref<string | null>(null);
  const isAuthReady = ref(false);
  
  // Ascolta i cambiamenti di stato dell'autenticazione
  onMounted(() => {
    onAuthStateChanged(auth, (user) => {
      currentUserEmail.value = user?.email || null;
      isAuthReady.value = true;
    });
  });
  
  // Calcola se è admin
  const isAdmin = computed(() => currentUserEmail.value === 'info@inglesinaitaliana.it');
  
  // Navigazione Menu Admin
  const adminLinks = [
    { label: 'Admin Dashboard', route: '/admin', icon: ChartBarIcon, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Crea per Cliente', route: '/preventivatore?admin=true&new=true', icon: UserPlusIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Calcoli Lavorazioni', route: '/calcoli', icon: CalculatorIcon, color: 'text-emerald-600', bg: 'bg-emerald-50' }, 
    { label: 'Produzione', route: '/production', icon: CogIcon, color: 'text-slate-600', bg: 'bg-slate-50' },
    { label: 'Spedizioni', route: '/delivery', icon: TruckIcon, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Stack Viewer', route: '/stack', icon: CubeIcon, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Impostazioni', route: '/admin/settings', icon: AdjustmentsHorizontalIcon, color: 'text-gray-600', bg: 'bg-gray-100' },
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
  
  const avviaNuovoPreventivo = () => {
    isMenuOpen.value = false;
    router.push(`/preventivatore?cmd=new&ts=${Date.now()}`);
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
    <div v-if="isAuthReady" class="fixed bottom-8 right-8 z-[9999] flex flex-col items-end gap-4 pointer-events-none">
      
      <Transition
        enter-active-class="transition-all duration-400 cubic-bezier(0.34, 1.56, 0.64, 1)"
        enter-from-class="opacity-0 scale-90 translate-y-8"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-90 translate-y-8"
      >
        <div v-if="isMenuOpen" class="pointer-events-auto bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-gray-200/50 border border-white/50 p-2 min-w-[260px] flex flex-col origin-bottom-right overflow-hidden ring-1 ring-black/5">
          
          <div class="px-5 py-3 border-b border-gray-100/50 mb-1">
            <div class="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-0.5">Utente Attuale</div>
            <div class="text-xs font-medium text-gray-700 truncate max-w-[200px]">{{ currentUserEmail }}</div>
          </div>
  
          <div class="px-5 py-2 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Azioni Rapide</div>
          
          <button v-if="!isAdmin" @click="avviaNuovoPreventivo" class="flex items-center gap-4 w-full px-3 py-3 rounded-2xl hover:bg-amber-50 transition-colors group relative overflow-hidden">
            <div class="absolute inset-0 bg-amber-100/50 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500 ease-out rounded-2xl"></div>
            <div class="relative bg-amber-400/20 p-2 rounded-xl group-hover:bg-amber-400 group-hover:text-white transition-colors duration-300">
              <PlusCircleIcon class="h-5 w-5 text-amber-600 group-hover:text-white transition-colors" />
            </div>
            <div class="flex flex-col items-start relative z-10">
              <span class="font-bold text-sm text-gray-800">Nuova Commessa</span>
              <span class="text-[10px] text-gray-500 font-medium group-hover:text-amber-700 transition-colors">Configuratore</span>
            </div>
          </button>
  
          <button @click="openBugReport" class="flex items-center gap-4 w-full px-3 py-3 rounded-2xl hover:bg-rose-50 transition-colors group relative overflow-hidden">
            <div class="absolute inset-0 bg-rose-50 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500 ease-out rounded-2xl"></div>
            <div class="relative bg-rose-100 p-2 rounded-xl group-hover:bg-rose-500 group-hover:text-white transition-colors duration-300">
              <BugAntIcon class="h-5 w-5 text-rose-500 group-hover:text-white transition-colors" />
            </div>
            <div class="flex flex-col items-start relative z-10">
              <span class="font-bold text-sm text-gray-800">Segnala Problema</span>
              <span class="text-[10px] text-gray-500 font-medium group-hover:text-rose-700 transition-colors">Supporto Tecnico</span>
            </div>
          </button>
  
          <template v-if="isAdmin">
            <div class="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-3 mx-4"></div>
            <div class="px-5 py-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <SparklesIcon class="w-3 h-3 text-amber-400" />
              Amministrazione
            </div>
            
            <div class="grid grid-cols-1 gap-1 p-1">
              <button 
                v-for="link in adminLinks" 
                :key="link.route"
                @click="navigateTo(link.route)"
                class="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all group"
              >
                <div :class="[link.bg, 'p-1.5 rounded-lg transition-transform duration-300 group-hover:scale-110 shadow-sm']">
                  <component :is="link.icon" :class="[link.color, 'h-4 w-4']" />
                </div>
                <span class="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">{{ link.label }}</span>
              </button>
            </div>
          </template>
  
        </div>
      </Transition>
  
      <button 
        @click="toggleMenu"
        class="pointer-events-auto h-16 w-16 shadow-[0_8px_30px_rgb(251,191,36,0.4)] flex items-center justify-center relative overflow-hidden group z-50 transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)"
        :class="[
          isMenuOpen 
            ? 'bg-gray-900 rotate-90 scale-90 rounded-2xl shadow-gray-900/30' 
            : 'bg-amber-400 hover:bg-amber-300 hover:scale-110 rounded-[2.5rem] hover:rotate-180'
        ]"
      >
        <PlusIcon 
          class="h-8 w-8 text-amber-950 absolute transition-all duration-500 ease-out"
          :class="isMenuOpen ? 'opacity-0 rotate-180 scale-50' : 'opacity-100 rotate-0 scale-100'"
        />
        <XMarkIcon 
          class="h-8 w-8 text-white absolute transition-all duration-500 ease-out"
          :class="isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-180 scale-50'"
        />
      </button>
  
    </div>
  
    <Transition name="slide">
      <div v-if="isOpen" class="fixed inset-0 z-[10000] flex justify-end">
        <div class="absolute inset-0 bg-gray-900/30 backdrop-blur-sm transition-opacity" @click="isOpen = false"></div>
  
        <div class="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-gray-100">
          <div class="bg-gray-900 text-white px-8 py-6 flex justify-between items-center shadow-md shrink-0 z-10">
            <div>
               <h2 class="font-bold text-xl flex items-center gap-2.5 font-heading">
                <div class="bg-white/10 p-2 rounded-lg">
                  <BugAntIcon class="h-6 w-6 text-amber-400" />
                </div>
                Report Problema
              </h2>
              <p class="text-xs text-gray-400 mt-1 pl-1">Invia un feedback tecnico al team di sviluppo</p>
            </div>
           
            <button @click="isOpen = false" class="hover:bg-white/10 p-2 rounded-full transition-colors active:scale-95">
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
  
          <div class="p-8 flex-1 overflow-y-auto bg-gray-50/50 space-y-8">
            
            <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3 relative overflow-hidden">
               <div class="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full -mr-4 -mt-4 z-0"></div>
               <div class="flex items-center gap-3 relative z-10">
                  <div class="bg-amber-100 p-2 rounded-lg shrink-0">
                    <ComputerDesktopIcon class="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                     <p class="text-xs font-bold text-gray-900 uppercase tracking-wide">Contesto Rilevato</p>
                     <p class="text-[10px] text-gray-500">Queste info vengono allegate automaticamente</p>
                  </div>
               </div>
               
               <div class="grid grid-cols-2 gap-2 mt-1 relative z-10">
                  <div class="bg-gray-50 p-2 rounded-lg border border-gray-100">
                    <span class="block text-[9px] text-gray-400 uppercase font-bold">Pagina</span>
                    <span class="text-xs font-mono font-medium text-gray-700 truncate block">{{ route.name || 'Dash' }}</span>
                  </div>
                  <div class="bg-gray-50 p-2 rounded-lg border border-gray-100">
                    <span class="block text-[9px] text-gray-400 uppercase font-bold">Utente</span>
                    <span class="text-xs font-mono font-medium text-gray-700 truncate block">{{ currentUserEmail ? currentUserEmail.split('@')[0] : 'Anon' }}</span>
                  </div>
               </div>
            </div>
  
            <div class="space-y-6">
              <div class="group">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1 group-focus-within:text-amber-500 transition-colors">Titolo Problema</label>
                <input v-model="form.title" type="text" class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-400 transition-all shadow-sm placeholder:text-gray-300" placeholder="Es. Errore calcolo preventivo...">
              </div>
  
              <div class="group">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1 group-focus-within:text-amber-500 transition-colors">Categoria</label>
                <div class="relative">
                  <select v-model="form.category" class="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-400 transition-all shadow-sm cursor-pointer">
                    <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                  </select>
                  <AdjustmentsHorizontalIcon class="h-5 w-5 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
  
              <div class="group">
                <label class="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1 group-focus-within:text-amber-500 transition-colors">Dettagli</label>
                <textarea v-model="form.description" rows="5" class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-400 transition-all shadow-sm resize-none placeholder:text-gray-300" placeholder="Descrivi i passaggi per riprodurre l'errore..."></textarea>
              </div>
            </div>
          </div>
  
          <div class="p-6 bg-white border-t border-gray-100 shrink-0 z-20">
            <button 
              @click="submitBug" 
              :disabled="isSending"
              class="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-xl shadow-gray-900/10 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98] group"
            >
              <span v-if="isSending" class="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></span>
              <PaperAirplaneIcon v-else class="h-5 w-5 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
              {{ isSending ? 'Invio Segnalazione...' : 'Invia Report' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </template>
  
  <style scoped>
  /* Personalizzazione della bezier curve per un effetto "bouncy" */
  .cubic-bezier {
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .slide-enter-active,
  .slide-leave-active {
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
  }
  
  .slide-enter-from,
  .slide-leave-to {
    transform: translateX(100%);
    opacity: 0.5;
  }
  
  .slide-enter-to,
  .slide-leave-from {
    transform: translateX(0);
    opacity: 1;
  }
  </style>