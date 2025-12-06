<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { 
  ClockIcon, 
  EyeIcon, 
  ChartBarIcon, 
  DocumentCheckIcon, 
  DevicePhoneMobileIcon, 
  CubeIcon,
  TruckIcon, 
  CogIcon, 
} from '@heroicons/vue/24/solid';

const isScrolled = ref(false);
const isVisible = ref(false);

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
  // Attiva l'animazione dopo il montaggio
  setTimeout(() => {
    isVisible.value = true;
  }, 100);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

// Dati per le card "Funzionalità" per iterare con v-for
const featuresList = [
  {
    icon: ClockIcon,
    title: "Preventivi H24",
    tag: "Istantaneo",
    tagColor: "bg-amber-100 text-amber-800",
    description: "Non dipendere più dai nostri orari. Configura griglie e telai sera tardi o domenica e ottieni il prezzo in tempo reale."
  },
  {
    icon: EyeIcon,
    title: "Configuratore Visivo",
    tag: "Zero Errori",
    tagColor: "bg-purple-100 text-purple-800",
    description: "Basta dubbi su codici o combinazioni. Il nostro sistema 'A Prova di Errore' ti guida passo-passo nella scelta di modelli e finiture."
  },
  {
    icon: ChartBarIcon,
    title: "Torre di Controllo",
    tag: "Live Tracking",
    tagColor: "bg-blue-100 text-blue-800",
    description: "Dimentica le mail 'A che punto è?'. Vedi tutto in diretta: Validazione, Produzione e Spedizione con data prevista."
  },
  {
    icon: DocumentCheckIcon,
    title: "Stop alla Carta",
    tag: "ecologico",
    tagColor: "bg-emerald-100 text-emerald-800",
    description: "Niente stampe o scansioni. Conferma i tuoi ordini con un click o carica gli ordini firmati digitalmente."
  }
];

// Dati per le righe di stato
const statusRows = [
  {
    icon: CogIcon,
    color: "bg-amber-400 text-black",
    title: "In Produzione",
    desc: "La tua commessa è in lavorazione nelle nostre officine."
  },
  {
    icon: CubeIcon,
    color: "bg-amber-400 text-black",
    title: "Pronto per la Spedizione",
    desc: "Materiale pronto. Data di consegna confermata."
  },
  {
    icon: TruckIcon,
    color: "bg-amber-400 text-black",
    title: "In Consegna",
    desc: "Merce su strada. DDT disponibile."
  }
];
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-600 selection:bg-amber-200 selection:text-amber-900">
    <!-- --- NAVBAR --- -->
    <nav 
      class="fixed w-full z-50 transition-all duration-300"
      :class="isScrolled ? 'bg-white/80 backdrop-blur-md shadow-sm py-4' : 'bg-transparent py-6'"
    >
      <div class="container mx-auto px-6 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <div class="h-10 w-10 bg-amber-400 rounded-lg flex items-center justify-center text-amber-950 font-bold text-xl shadow-lg shadow-amber-200">
            I
          </div>
          <span class="text-2xl font-bold text-gray-900 tracking-tight">
            Inglesina Italiana <span class="text-gray-400 font-normal">P.O.P.S.</span>
          </span>
        </div>
      </div>
    </nav>

    <!-- --- HERO SECTION --- -->
    <header class="relative pt-32 pb-20 lg:pt-36 lg:pb-8 px-6 overflow-hidden">
      <!-- Background Decorative Blobs -->
      <div class="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div class="absolute top-0 left-0 -ml-20 -mt-20 w-72 h-72 bg-gray-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

      <div class="container mx-auto max-w-6xl relative z-10">
        <div 
          class="transition-all duration-1000 transform"
          :class="isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'"
        >
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm mb-6">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-sm font-bold text-gray-600 tracking-wide uppercase">Nuovo Portale B2B P.O.P.S.</span>
          </div>
          
          <h1 class="text-5xl md:text-7xl font-extrabold text-gray-900 leading-[1.1] mb-6 tracking-tight">
            Tradizione Artigianale, <br />
            <span class="relative inline-block mt-2">
              <span class="relative z-10">Velocità Digitale.</span>
              <div class="absolute bottom-2 left-0 w-full h-4 md:h-6 bg-amber-400 rounded-sm -z-0 opacity-80 rotate-1"></div>
            </span>
          </h1>
          
          <p class="text-xl md:text-2xl text-gray-500 max-w-2xl leading-relaxed">
            Non è solo un sito, è il tuo nuovo assistente personale. 
            Preventivi istantanei, ordini veloci e controllo totale della commessa.
          </p>
        </div>
      </div>
    </header>

    <!-- --- FEATURES GRID --- -->
    <section id="funzionalita" class="py-20 px-6 bg-white/50 relative">
      <div class="container mx-auto max-w-6xl">
        <div class="text-center mb-16">
            <div class="relative inline-block">
              <h1 class="relative z-10 text-8xl font-extrabold font-heading text-gray-900">P.O.P.S.</h1>
              <div class="absolute bottom-2 left-0 w-full h-12 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
          <h2 class="text-3xl md:text-5xl font-bold text-gray-900 mb-4">Perché non potrai più farne a meno</h2>
          <p class="text-xl text-gray-500">Abbiamo eliminato le attese. Ecco cosa potrai fare.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          <!-- Cards dinamiche -->
          <div 
            v-for="(feature, idx) in featuresList" 
            :key="idx"
            class="bg-white/60 backdrop-blur-md p-8 rounded-[2rem] border border-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
          >
            <div class="flex justify-between items-start mb-6">
              <div class="h-14 w-14 bg-amber-400 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
                <component :is="feature.icon" class="w-8 h-8 text-amber-950" />
              </div>
              <span 
                v-if="feature.tag" 
                class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                :class="feature.tagColor"
              >
                {{ feature.tag }}
              </span>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-3">{{ feature.title }}</h3>
            <p class="text-gray-600 leading-relaxed text-sm md:text-base">
              {{ feature.description }}
            </p>
           
          </div>

          <!-- Card Mobile (Speciale) -->
          <div class="md:col-span-2 lg:col-span-2 bg-gray-900 rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden group hover:shadow-2xl transition-all duration-500">
            <div class="absolute top-0 right-0 w-64 h-64 bg-amber-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
            
            <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div class="max-w-md">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 border border-gray-700 mb-6">
                  <DevicePhoneMobileIcon class="w-4 h-4 text-amber-400" />
                  <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Mobile First</span>
                </div>
                <h3 class="text-3xl font-bold mb-4">Sempre con Te</h3>
                <p class="text-gray-400 text-lg leading-relaxed mb-8">
                  In cantiere o in furgone? Il portale P.O.P.S. è ottimizzato per funzionare perfettamente anche dal tuo smartphone o tablet. Il tuo ufficio è dove sei tu.
                </p>
              </div>
              
              <!-- Mockup visuale stilizzato -->
              <div class="bg-gray-800 p-4 rounded-3xl border border-gray-700 shadow-2xl transform rotate-3 group-hover:rotate-0 transition-transform duration-500">
                 <div class="bg-gray-900 w-48 h-64 rounded-2xl flex flex-col p-4 gap-3">
                    <div class="w-full h-8 bg-gray-800 rounded-full"></div>
                    <div class="w-2/3 h-4 bg-gray-800 rounded-full"></div>
                    <div class="flex-1 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-center justify-center">
                      <ChartBarIcon class="w-12 h-12 text-amber-500" />
                    </div>
                 </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- --- LIVE STATUS PREVIEW SECTION --- -->
    <section class="py-20 px-6 bg-white overflow-hidden">
      <div class="container mx-auto max-w-5xl">
        <div class="flex flex-col md:flex-row items-center gap-12">
          <div class="w-full md:w-1/2">
            <h2 class="text-4xl font-bold text-gray-900 mb-6">Tutto sotto controllo.</h2>
            <p class="text-lg text-gray-500 mb-8">
              La dashboard ti mostra lo stato esatto di ogni commessa. Nessuna sorpresa, solo chiarezza.
            </p>
            
            <div class="space-y-4">
              <div 
                v-for="(row, idx) in statusRows" 
                :key="idx"
                class="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
              >
                <div 
                  class="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                  :class="row.color"
                >
                  <component :is="row.icon" class="w-5 h-5" />
                </div>
                <div>
                  <h4 class="font-bold text-gray-900">{{ row.title }}</h4>
                  <p class="text-sm text-gray-500">{{ row.desc }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="w-full md:w-1/2 relative group cursor-default">
  <div class="absolute inset-0 bg-gradient-to-tr from-amber-300 to-amber-100 rounded-[2.5rem] transform rotate-3 scale-105 opacity-60 blur-md transition-all duration-500 group-hover:rotate-2 group-hover:scale-110"></div>
  
  <div class="bg-white backdrop-blur-md backdrop-saturate-150 p-6 rounded-[2rem] shadow-2xl border border-white/60 relative z-10 flex flex-col gap-5 transition-transform duration-300 hover:-translate-y-1">
     
     <div class="flex items-start gap-4">
        <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 bg-amber-400 text-black border border-amber-400 shadow-sm">
            <CogIcon class="h-8 w-8 text-amber-950" />
        </div>

        <div class="flex flex-col items-start w-full min-w-0">
           <h3 class="font-bold text-xl text-gray-900 leading-tight truncate w-full">Rossi S.r.l - Lotto A</h3>
           
           <div class="mt-2 flex items-center gap-1.5 px-3 py-1 bg-amber-400 border border-amber-200 rounded shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-amber-950">
                 <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 116 0h3a.75.75 0 00.75-.75V15z" />
                 <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
                 <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
              </svg>
              <span class="text-xs font-bold text-amber-950 uppercase tracking-wide">Prevista il 25 DIC</span>
           </div>

           <div class="mt-2.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-400 text-black border-amber-400">
                 ORDINE IN PRODUZIONE
              </span>
           </div>
        </div>
     </div>

     <div class="flex flex-col gap-1.5 pl-[4.5rem]">
        <span class="text-[10px] bg-gray-50 px-2 py-1.5 rounded border border-gray-100 text-gray-600 truncate">
           <strong>12x</strong> INGLESINA VARSAVIA 26 - BIANCO 9010
        </span>
        <span class="text-[10px] bg-gray-50 px-2 py-1.5 rounded border border-gray-100 text-gray-600 truncate">
           <strong>2x</strong> TELAI SOLO CANALINO
        </span>
     </div>

     <div class="flex items-end justify-between border-t border-gray-100 pt-4 mt-1">
        <div class="text-left">
           <div class="text-2xl font-bold font-heading text-gray-600 tracking-tight">€ 550<span class="text-lg">,00</span></div>
           <div class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Importo netto</div>
        </div>
        <button class="border border-gray-300 text-gray-600 px-6 py-2.5 rounded-full font-bold text-xs hover:bg-gray-50 hover:text-amber-900 hover:border-amber-200 transition-colors shadow-sm">
           APRI
        </button>
     </div>
  </div>
</div>
        </div>
      </div>
    </section>

    <!-- --- CTA FOOTER --- -->
    <footer class="bg-amber-50 py-20 px-6 relative overflow-hidden">
      
        
        <div class=" border-gray-200 text-gray-400 text-sm flex flex-col md:flex-row justify-center items-center gap-4">
          <p>&copy; 2025 Inglesina Italiana S.p.A. Tutti i diritti riservati.</p>
          <div class="flex gap-6">
          </div>
        </div>
    </footer>
  </div>
</template>