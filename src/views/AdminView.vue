<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';

// IMPORT ICONE HEROICONS (Sia Solid che Outline)
import { 
  PencilIcon,
  CheckCircleIcon, 
  DocumentTextIcon, 
  EyeIcon, 
  ClockIcon,
  ArrowPathIcon,
  XCircleIcon,
  PaperAirplaneIcon,
  CogIcon,
  CurrencyEuroIcon, 
  ShieldExclamationIcon, 
  ShoppingCartIcon, 
  WrenchScrewdriverIcon,
  UserIcon
} from '@heroicons/vue/24/solid'

const router = useRouter();
const listaPreventivi = ref<any[]>([]);
const anagraficaClienti = ref<Record<string, string>>({}); 
const loading = ref(true);

// STATO UI
const activeTab = ref<'CLIENTI' | 'COMMESSE'>('CLIENTI');
const clientiEspansi = ref<string[]>([]);
const statiEspansi = ref<string[]>(['PENDING_VAL', 'ORDER_REQ', 'WAITING_SIGN', 'SIGNED']); 
let refreshInterval: any = null;

// --- 1. CARICAMENTO ANAGRAFICA ---
const caricaAnagrafica = async () => {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const mappa: Record<string, string> = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d.email && d.ragioneSociale) mappa[d.email] = d.ragioneSociale;
    });
    anagraficaClienti.value = mappa;
  } catch (e) { console.error("Errore anagrafica", e); }
};

// --- 2. CARICAMENTO PREVENTIVI ---
const caricaTutti = async () => {
  try {
    const q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(300));
    const snapshot = await getDocs(q);
    listaPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) { console.error("Errore refresh", e); } 
  finally { loading.value = false; }
};

// --- AZIONI RAPIDE ADMIN ---

// A. ABILITA FIRMA (Sostituisce la mail per ordini > 5000)
const abilitaFirma = async (preventivo: any) => {
    if(!confirm(`Confermi di voler abilitare la firma per l'ordine ${preventivo.codice}?\nIl cliente potrà scaricare e caricare il contratto.`)) return;
    
    try {
        await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'WAITING_SIGN' });
        // Aggiornamento locale ottimistico
        preventivo.stato = 'WAITING_SIGN'; 
    } catch (e) { alert("Errore DB"); }
};

// B. APPROVA DIRETTO (< 5000)
const approvaDiretto = async (preventivo: any) => {
    const totale = preventivo.totaleScontato || preventivo.totale || 0;
    if(!confirm(`Importo basso (${totale.toFixed(2)}€). Mandare direttamente in PRODUZIONE?`)) return;
    
    await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'IN_PRODUZIONE' });
    preventivo.stato = 'IN_PRODUZIONE';
};

// C. CONFERMA PRODUZIONE (Da Firmato)
const confermaProduzione = async (preventivo: any) => {
    const msg = preventivo.stato === 'SIGNED' 
        ? "Ordine firmato digitalmente. Avviare produzione?" 
        : "Hai ricevuto la firma manuale? Passa in PRODUZIONE?";

    if(!confirm(msg)) return;
    await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'IN_PRODUZIONE' });
    preventivo.stato = 'IN_PRODUZIONE';
};

// --- HIGHLIGHTS ---
const globalStats = computed(() => {
  const stats = { da_validare: 0, richieste_ord: 0, in_produzione: 0, totale_valore_aperto: 0 };
  listaPreventivi.value.forEach(p => {
    const st = p.stato;
    if (st === 'PENDING_VAL' || st === 'IN_ATTESA') stats.da_validare++;
    if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') stats.richieste_ord++;
    if (st === 'IN_PRODUZIONE') stats.in_produzione++;
    if (st !== 'DRAFT' && st !== 'BOZZA' && st !== 'REJECTED' && st !== 'RIFIUTATO') {
      stats.totale_valore_aperto += (p.totaleScontato || p.totale || 0);
    }
  });
  return stats;
});

// --- RAGGRUPPAMENTO PER CLIENTE ---
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
  
  listaPreventivi.value.forEach(p => {
    const nomeReale = anagraficaClienti.value[p.clienteEmail] || anagraficaClienti.value[p.cliente] || p.cliente || 'Sconosciuto';
    const chiave = nomeReale; 

    if (!gruppi[chiave]) {
      gruppi[chiave] = { 
        nome: nomeReale, preventivi: [], 
        contatori: { validare: 0, richiedere: 0, firmare: 0, prod: 0, bozze: 0, tot: 0 },
        priorita: 0 
      };
    }

    const st = p.stato || 'DRAFT';
    const c = gruppi[chiave].contatori;

    if (st === 'PENDING_VAL' || st === 'IN_ATTESA') { c.validare++; gruppi[chiave].priorita = Math.max(gruppi[chiave].priorita, 3); }
    else if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') { c.richiedere++; gruppi[chiave].priorita = Math.max(gruppi[chiave].priorita, 2); }
    else if (['WAITING_SIGN', 'ATTESA_FIRMA', 'SIGNED'].includes(st)) { c.firmare++; }
    else if (st === 'IN_PRODUZIONE') { c.prod++; }
    else if (st === 'DRAFT' || st === 'BOZZA') { c.bozze++; }
    
    if (st !== 'DRAFT' && st !== 'BOZZA') {
       gruppi[chiave].preventivi.push(p);
       gruppi[chiave].contatori.tot += (p.totaleScontato || p.totale || 0);
    }
  });

  return Object.values(gruppi)
    .filter((g: any) => g.preventivi.length > 0 || g.contatori.bozze > 0)
    .sort((a: any, b: any) => b.priorita - a.priorita);
});

// --- RAGGRUPPAMENTO PER STATO ---
const ordineStati = ['PENDING_VAL', 'ORDER_REQ', 'SIGNED', 'WAITING_SIGN', 'IN_PRODUZIONE', 'QUOTE_READY', 'DRAFT', 'REJECTED'];

const preventiviPerStato = computed(() => {
    const gruppi: Record<string, any[]> = {};
    ordineStati.forEach(st => gruppi[st] = []);

    listaPreventivi.value.forEach(p => {
        let st = p.stato || 'DRAFT';
        if(st === 'IN_ATTESA') st = 'PENDING_VAL';
        if(st === 'RICHIESTA_ORDINE') st = 'ORDER_REQ';
        if(st === 'ATTESA_FIRMA') st = 'WAITING_SIGN';
        if(st === 'APPROVATO') st = 'QUOTE_READY';
        
        if (!gruppi[st]) gruppi[st] = [];
        gruppi[st].push(p);
    });

    return ordineStati
        .map(key => ({ stato: key, lista: gruppi[key] }))
        .filter(g => g.lista && g.lista.length > 0);
});


// --- HELPERS STILE ---
const getStatusStyling = (stato: string) => {
    const styles: Record<string, { badge: string; icon: any; iconBg: string; }> = {
        'DRAFT': { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: PencilIcon, iconBg: 'bg-gray-100 text-gray-500' },
        'PENDING_VAL': { badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: ShieldExclamationIcon, iconBg: 'bg-orange-100 text-orange-600' },
        'QUOTE_READY': { badge: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircleIcon, iconBg: 'bg-green-100 text-green-600' },
        'ORDER_REQ': { badge: 'bg-purple-100 text-purple-700 border-purple-200', icon: PaperAirplaneIcon, iconBg: 'bg-purple-100 text-purple-600' },
        'WAITING_SIGN': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ClockIcon, iconBg: 'bg-blue-100 text-blue-600' },
        'ATTESA_FIRMA': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ClockIcon, iconBg: 'bg-blue-100 text-blue-600' },
        'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
        'SIGNED': { badge: 'bg-green-700 text-white border-green-800', icon: CogIcon, iconBg: 'bg-green-200 text-green-800' },
        'IN_PRODUZIONE': { badge: 'bg-green-100 text-green-800 border-green-200', icon: WrenchScrewdriverIcon, iconBg: 'bg-green-100 text-green-700' },
    };
    return styles[stato] || { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: DocumentTextIcon, iconBg: 'bg-gray-100 text-gray-500' };
}

const getStatusLabel = (stato: string) => {
    const map: Record<string, string> = {
        'DRAFT': 'BOZZA', 'PENDING_VAL': 'DA VALIDARE', 'QUOTE_READY': 'PRONTO',
        'ORDER_REQ': 'RICHIESTA INVIATA', 'WAITING_SIGN': 'ATTESA FIRMA', 'ATTESA_FIRMA': 'ATTESA FIRMA',
        'SIGNED': 'CONFERMATO', 'IN_PRODUZIONE': 'IN PRODUZIONE', 'REJECTED': 'ANNULLATO'
    };
    return map[stato] || stato || 'BOZZA';
};

// LOGICA BOTTONE AZIONE (Con Icone)
const getActionData = (p: any) => {
  const st = p.stato;
  const tot = p.totaleScontato || p.totale || 0;
  
  if (st === 'PENDING_VAL' || st === 'IN_ATTESA') 
    return { text: 'VALIDA', class: 'text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100', action: () => apriEditor(p.codice), icon: PencilIcon };
  
  if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') {
      if (tot < 5000) return { text: 'APPROVA SUBITO', class: 'text-green-700 bg-green-100 border-green-200 hover:bg-green-200', action: () => approvaDiretto(p), icon: CheckCircleIcon };
      else return { text: 'ABILITA FIRMA', class: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100', action: () => abilitaFirma(p), icon: DocumentTextIcon };
  }
  
  if (st === 'SIGNED' || st === 'WAITING_SIGN' || st === 'ATTESA_FIRMA') 
    return { text: 'AVVIA PRODUZIONE', class: 'text-white bg-green-700 border-green-800 hover:bg-green-800', action: () => confermaProduzione(p), icon: CogIcon };

  if (st === 'IN_PRODUZIONE') return { text: 'SCHEDA', class: 'text-gray-600 bg-gray-50 border-gray-200', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
  if (st === 'QUOTE_READY' || st === 'APPROVATO') return { text: 'VEDI', class: 'text-green-600 bg-green-50 border-green-200', action: () => apriEditor(p.codice), icon: EyeIcon };
  
  return { text: 'APRI', class: 'text-gray-500 border-gray-200', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
};

const toggleCliente = (nome: string) => {
  if (clientiEspansi.value.includes(nome)) clientiEspansi.value = clientiEspansi.value.filter(n => n !== nome);
  else clientiEspansi.value.push(nome);
};
const toggleStato = (stato: string) => {
    if (statiEspansi.value.includes(stato)) statiEspansi.value = statiEspansi.value.filter(s => s !== stato);
    else statiEspansi.value.push(stato);
};

const apriEditor = (codice: string) => router.push(`/preventivatore?codice=${codice}&admin=true`);
const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '-';

onMounted(() => {
  caricaAnagrafica();
  caricaTutti();
  refreshInterval = setInterval(caricaTutti, 60000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6 font-sans text-gray-700">
    <div class="max-w-7xl mx-auto">
      
      <div class="flex justify-between items-center mb-8">
        <div class="flex items-center gap-4">
            <div>
                <h1 class="text-2xl md:text-3xl font-bold text-gray-900 font-heading tracking-tight">Dashboard Admin</h1>
                <p class="text-gray-500 text-sm">Panoramica operativa</p>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 animate-pulse">Live Sync</span>
            <button @click="caricaTutti" class="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-yellow-50 text-sm font-bold text-gray-700 transition-all shadow-sm hover:border-gray-300">
                <ArrowPathIcon class="h-4 w-4" />
                Aggiorna
            </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-yellow-100 cursor-pointer">
              <div class="h-12 w-12 rounded-full flex items-center justify-center bg-yellow-100">
                  <CurrencyEuroIcon class="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                  <div class="text-xs font-bold text-gray-500 uppercase">Valore Ordini Attivi</div>
                  <div class="text-2xl font-bold font-heading text-gray-900">€ {{ globalStats.totale_valore_aperto.toLocaleString('it-IT', {maximumFractionDigits: 0}) }}</div>
              </div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-orange-100 cursor-pointer">
              <div class="h-12 w-12 rounded-full flex items-center justify-center bg-orange-100">
                  <ShieldExclamationIcon class="h-6 w-6 text-orange-500" />
              </div>
              <div>
                  <div class="text-xs font-bold text-gray-400 uppercase">Da Validare</div>
                  <div class="text-2xl font-bold text-gray-900">{{ globalStats.da_validare }}</div>
              </div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-purple-100 cursor-pointer">
              <div class="h-12 w-12 rounded-full flex items-center justify-center bg-purple-100">
                  <ShoppingCartIcon class="h-6 w-6 text-purple-500" />
              </div>
              <div>
                  <div class="text-xs font-bold text-gray-400 uppercase">Nuovi Ordini</div>
                  <div class="text-2xl font-bold text-gray-900">{{ globalStats.richieste_ord }}</div>
              </div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-green-100 cursor-pointer">
              <div class="h-12 w-12 rounded-full flex items-center justify-center bg-green-100">
                  <CogIcon class="h-6 w-6 text-green-500" />
              </div>
              <div>
                  <div class="text-xs font-bold text-gray-400 uppercase">In Produzione</div>
                  <div class="text-2xl font-bold text-gray-900">{{ globalStats.in_produzione }}</div>
              </div>
          </div>
      </div>

      <div class="flex border-b border-gray-200 mb-6">
          <button @click="activeTab = 'CLIENTI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'CLIENTI' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'">
            VISTA CLIENTI
            <div v-if="activeTab === 'CLIENTI'" class="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-t-full"></div>
          </button>
          <button @click="activeTab = 'COMMESSE'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'COMMESSE' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'">
            VISTA PER STATO
            <div v-if="activeTab === 'COMMESSE'" class="absolute bottom-0 left-0 w-full h-1 bg-blue-600 rounded-t-full"></div>
          </button>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400">Caricamento...</div>

      <div v-else-if="activeTab === 'CLIENTI'" class="space-y-4">
        <div v-for="gruppo in clientiRaggruppati" :key="gruppo.nome" class="bg-white rounded-xl shadow-sm border overflow-hidden" :class="gruppo.priorita > 0 ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'">
          
          <div @click="toggleCliente(gruppo.nome)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm shrink-0 font-heading" :class="gruppo.priorita > 0 ? 'bg-orange-500' : 'bg-gray-800'">
                  <UserIcon class="h-6 w-6" />
                </div>
                <div><h2 class="text-lg font-bold text-gray-900 font-heading">{{ gruppo.nome }}</h2><p class="text-xs text-gray-500 font-medium mt-0.5">Totale: € {{ gruppo.contatori.tot.toFixed(2) }}</p></div>
            </div>
            <div class="flex gap-2 w-full md:w-auto justify-start md:justify-end flex-wrap">
                <div v-if="gruppo.contatori.validare > 0" class="px-2 py-0.5 bg-orange-100 text-orange-800 rounded border border-orange-200 text-[10px] font-bold animate-pulse">{{ gruppo.contatori.validare }} DA VALIDARE</div>
                <div v-if="gruppo.contatori.richiedere > 0" class="px-2 py-0.5 bg-purple-100 text-purple-800 rounded border border-purple-200 text-[10px] font-bold">{{ gruppo.contatori.richiedere }} RICHIESTE</div>
                <div v-if="gruppo.contatori.firmare > 0" class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 text-[10px] font-bold">{{ gruppo.contatori.firmare }} FIRME</div>
                <div v-if="gruppo.contatori.prod > 0" class="px-2 py-0.5 bg-green-100 text-green-800 rounded border border-green-200 text-[10px] font-bold">{{ gruppo.contatori.prod }} PROD.</div>
                <div v-if="gruppo.contatori.bozze > 0" class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200 text-[10px] font-bold">{{ gruppo.contatori.bozze }} BOZZE</div>
            </div>
            <div class="text-gray-300 hidden md:block transform transition-transform" :class="clientiEspansi.includes(gruppo.nome) ? 'rotate-180' : ''">▼</div>
          </div>

          <div v-if="clientiEspansi.includes(gruppo.nome)" class="border-t border-gray-100 bg-gray-50 p-4 animate-fade-in">
            <table class="min-w-full divide-y divide-gray-200 bg-white rounded-lg overflow-hidden shadow-sm">
                <thead class="bg-gray-100 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                    <tr><th class="px-4 py-3 text-left">Stato</th><th class="px-4 py-3 text-left">Rif. / Codice</th><th class="px-4 py-3 text-right">Importo</th><th class="px-4 py-3 text-right">Azioni</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                    <tr v-for="p in gruppo.preventivi" :key="p.id" class="hover:bg-yellow-50/50 transition-colors">
                        <td class="px-4 py-3 text-center"><span class="px-2 py-1 text-[10px] font-bold rounded border uppercase" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span></td>
                        <td class="px-4 py-3"><div class="font-bold text-gray-800">{{ p.commessa || 'Nessun Rif.' }}</div><div class="text-xs font-mono text-gray-400">{{ formatDate(p.dataCreazione?.seconds) }} • {{ p.codice }}</div></td>
                        <td class="px-4 py-3 text-right text-sm font-bold text-gray-900 font-heading">{{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €</td>
                        <td class="px-4 py-3 text-right flex justify-end gap-2 items-center">
                             <button 
                                @click.stop="getActionData(p).action()" 
                                class="text-xs font-bold px-3 py-1.5 rounded border transition-all shadow-sm hover:shadow hover:brightness-95 flex items-center gap-2"
                                :class="getActionData(p).class"
                             >
                               <component :is="getActionData(p).icon" class="h-4 w-4" />
                               <span>{{ getActionData(p).text }}</span>
                             </button>
                        </td>
                    </tr>
                </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'COMMESSE'" class="space-y-4">
        <div v-for="gruppo in preventiviPerStato" :key="gruppo.stato" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
           
           <div @click="toggleStato(gruppo.stato)" class="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center border-l-4" :class="getStatusStyling(gruppo.stato).badge.replace('text-','border-').split(' ')[0]">
               <div class="flex items-center gap-3">
                   <span class="font-bold font-heading text-sm uppercase" :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]">{{ getStatusLabel(gruppo.stato) }}</span>
                   <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">{{ gruppo.lista.length }}</span>
               </div>
               <div class="text-gray-300 transform transition-transform" :class="statiEspansi.includes(gruppo.stato) ? 'rotate-180' : ''">▼</div>
           </div>

           <div v-if="statiEspansi.includes(gruppo.stato)" class="border-t border-gray-100 bg-gray-50 p-4 grid gap-3 animate-fade-in">
               <div v-for="p in gruppo.lista" :key="p.id" class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
                    
                    <div class="flex items-center gap-4 w-full md:w-auto">
                        <div class="h-10 w-10 rounded-full flex items-center justify-center" :class="getStatusStyling(p.stato).iconBg">
                            <component :is="getStatusStyling(p.stato).icon" class="h-6 w-6" />
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="font-bold text-gray-900">{{ p.commessa || 'Senza Nome' }}</h3>
                                <span class="text-xs text-gray-500">({{ anagraficaClienti[p.clienteEmail] || p.cliente }})</span>
                            </div>
                            <p class="text-xs text-gray-500 font-mono">Cod: {{ p.codice }} • {{ formatDate(p.dataCreazione?.seconds) }}</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div class="text-right">
                            <div class="font-bold text-gray-900">{{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €</div>
                        </div>
                        <button 
                            @click.stop="getActionData(p).action()" 
                            class="text-xs font-bold px-3 py-2 rounded border transition-all shadow-sm hover:shadow whitespace-nowrap flex items-center gap-2"
                            :class="getActionData(p).class"
                        >
                            <component :is="getActionData(p).icon" class="h-4 w-4" />
                            <span>{{ getActionData(p).text }}</span>
                        </button>
                    </div>
               </div>
           </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>
