<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';
import { PencilIcon, CheckCircleIcon, PaperAirplaneIcon, DocumentTextIcon, EyeIcon, CogIcon, ClockIcon } from '@heroicons/vue/24/solid'
import { CurrencyEuroIcon, ShieldExclamationIcon, ShoppingCartIcon, WrenchScrewdriverIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'


const router = useRouter();
const listaPreventivi = ref<any[]>([]);
const anagraficaClienti = ref<Record<string, string>>({}); 
const loading = ref(true);
const clientiEspansi = ref<string[]>([]);
let refreshInterval: any = null;

// --- 1. CARICAMENTO ANAGRAFICA ---
const caricaAnagrafica = async () => {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const mappa: Record<string, string> = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      // Mappiamo sia email che uid se possibile, qui usiamo email come chiave principale
      if (d.email && d.ragioneSociale) {
        mappa[d.email] = d.ragioneSociale;
      }
    });
    anagraficaClienti.value = mappa;
  } catch (e) { console.error("Errore anagrafica", e); }
};

// --- 2. CARICAMENTO PREVENTIVI ---
const caricaTutti = async () => {
  try {
    const q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(200));
    const snapshot = await getDocs(q);
    listaPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) { console.error("Errore refresh", e); } 
  finally { loading.value = false; }
};

// --- AZIONI RAPIDE ---

// A. ABILITA LA FIRMA AL CLIENTE (Passa a WAITING_SIGN)
const abilitaFirma = async (preventivo: any) => {
    if(!confirm(`Confermi di voler abilitare la firma per l'ordine ${preventivo.codice}?\nIl cliente potrà scaricare e caricare il contratto.`)) return;
    
    try {
        await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'WAITING_SIGN' });
        preventivo.stato = 'WAITING_SIGN'; 
    } catch (e) { alert("Errore DB"); }
};

// B. APPROVAZIONE DIRETTA (< 5000€)
const approvaDiretto = async (preventivo: any) => {
    const totale = preventivo.totaleScontato || preventivo.totale || 0;
    if(!confirm(`Importo basso (${totale.toFixed(2)}€). Mandare direttamente in PRODUZIONE?`)) return;
    
    await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'IN_PRODUZIONE' });
    preventivo.stato = 'IN_PRODUZIONE';
};

// C. MANDA IN PRODUZIONE (Da "Firmato" o "Attesa Firma")
const confermaProduzione = async (preventivo: any) => {
    const msg = "Ordine firmato digitalmente dal cliente. Avviare produzione?";

    if(!confirm(msg)) return;
    
    await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'IN_PRODUZIONE' });
    preventivo.stato = 'IN_PRODUZIONE';
};

// --- STATISTICHE GLOBALI ---
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

// --- RAGGRUPPAMENTO CLIENTI ---
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
  
  listaPreventivi.value.forEach(p => {
    // Risoluzione Nome Azienda: Cerca in anagrafica (tramite email o vecchio campo cliente) -> Fallback su 'cliente'
    const nomeReale = anagraficaClienti.value[p.clienteEmail] || anagraficaClienti.value[p.cliente] || p.cliente || 'Sconosciuto';
    const chiaveGruppo = nomeReale; 

    if (!gruppi[chiaveGruppo]) {
      gruppi[chiaveGruppo] = { 
        nome: nomeReale, preventivi: [], 
        contatori: { validare: 0, richiedere: 0, firmare: 0, prod: 0, bozze: 0, tot: 0 },
        priorita: 0 
      };
    }

    const st = p.stato || 'DRAFT';
    const c = gruppi[chiaveGruppo].contatori;

    // Conteggi
    if (st === 'PENDING_VAL' || st === 'IN_ATTESA') { c.validare++; gruppi[chiaveGruppo].priorita = Math.max(gruppi[chiaveGruppo].priorita, 3); }
    else if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') { c.richiedere++; gruppi[chiaveGruppo].priorita = Math.max(gruppi[chiaveGruppo].priorita, 2); }
    else if (st === 'WAITING_SIGN' || st === 'ATTESA_FIRMA') { c.firmare++; }
    else if (st === 'SIGNED') { c.firmare++; } 
    else if (st === 'IN_PRODUZIONE') { c.prod++; }
    else if (st === 'DRAFT' || st === 'BOZZA') { c.bozze++; }
    
    // Lista (Escludiamo bozze e rifiutati dalla vista principale se vuoi, qui mostriamo tutto tranne bozze)
    if (st !== 'DRAFT' && st !== 'BOZZA') {
       gruppi[chiaveGruppo].preventivi.push(p);
       gruppi[chiaveGruppo].contatori.tot += (p.totaleScontato || p.totale || 0);
    }
  });

  return Object.values(gruppi)
    .filter((g: any) => g.preventivi.length > 0 || g.contatori.bozze > 0)
    .sort((a: any, b: any) => b.priorita - a.priorita);
});

// --- HELPERS VISIVI ---
const getStatusBadge = (stato: string) => {
  switch(stato) {
    case 'PENDING_VAL': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'ORDER_REQ': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'WAITING_SIGN': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'ATTESA_FIRMA': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'SIGNED': return 'bg-green-700 text-white border-green-800'; 
    case 'IN_PRODUZIONE': return 'bg-green-100 text-green-800 border-green-200';
    case 'QUOTE_READY': return 'bg-green-50 text-green-600 border-green-100';
    case 'REJECTED': return 'bg-red-50 text-red-600 border-red-200';
    default: return 'bg-gray-100 text-gray-500 border-gray-200';
  }
};

const getStatusLabel = (stato: string) => {
    const map: Record<string, string> = {
        'PENDING_VAL': 'DA VALIDARE', 'IN_ATTESA': 'DA VALIDARE',
        'ORDER_REQ': 'ORDINE RICHIESTO', 'RICHIESTA_ORDINE': 'ORDINE RICHIESTO',
        'WAITING_SIGN': 'ATTESA FIRMA', 'ATTESA_FIRMA': 'ATTESA FIRMA',
        'SIGNED': 'FIRMATO (DA AVVIARE)', 
        'IN_PRODUZIONE': 'IN PRODUZIONE',
        'QUOTE_READY': 'PRONTO', 'APPROVATO': 'PRONTO',
        'DRAFT': 'BOZZA', 'BOZZA': 'BOZZA',
        'REJECTED': 'ANNULLATO', 'RIFIUTATO': 'ANNULLATO'
    };
    return map[stato] || stato;
};

// Logica Bottoni Tabella
const getActionData = (p: any) => {
  const st = p.stato;
  const tot = p.totaleScontato || p.totale || 0;

  if (st === 'PENDING_VAL' || st === 'IN_ATTESA') 
    return { text: 'VALIDA', class: 'text-orange-600 bg-orange-50 border-orange-200', action: () => apriEditor(p.codice), icon: PencilIcon };
  
  if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') {
      if (tot < 5000) return { text: 'APPROVA SUBITO', class: 'text-green-700 bg-green-100 border-green-200', action: () => approvaDiretto(p), icon: CheckCircleIcon };
      else return { text: 'ABILITA FIRMA', class: 'text-blue-600 bg-blue-50 border-blue-200', action: () => abilitaFirma(p), icon: PaperAirplaneIcon };
  }

  if (st === 'WAITING_SIGN' || st === 'ATTESA_FIRMA') 
    return { text: 'IN ATTESA DI FIRMA', class: 'text-gray-500 bg-gray-100 border-gray-200 cursor-not-allowed', action: () => {}, icon: ClockIcon };

  if (st === 'SIGNED') 
    return { text: 'AVVIA PRODUZIONE', class: 'text-green-600 bg-green-50 border-green-200', action: () => confermaProduzione(p), icon: CogIcon };

  if (st === 'IN_PRODUZIONE') return { text: 'SCHEDA', class: 'text-gray-600 bg-gray-50 border-gray-200', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
  if (st === 'QUOTE_READY' || st === 'APPROVATO') return { text: 'VEDI', class: 'text-green-600 bg-green-50 border-green-200', action: () => apriEditor(p.codice), icon: EyeIcon };
  
  return { text: 'APRI', class: 'text-gray-500 border-gray-200', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
};

const toggleCliente = (nome: string) => {
  if (clientiEspansi.value.includes(nome)) clientiEspansi.value = clientiEspansi.value.filter(n => n !== nome);
  else clientiEspansi.value.push(nome);
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
            <img src="/logo.svg" alt="Logo" class="h-12 w-auto" />
            <div>
                <h1 class="text-2xl md:text-3xl font-bold text-gray-900 font-heading tracking-tight">Dashboard Admin</h1>
                <p class="text-gray-500 text-sm">Panoramica operativa</p>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 animate-pulse">Live Sync</span>
            <button @click="caricaTutti" class="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-700 transition-all shadow-sm hover:border-gray-300">
                <ArrowPathIcon class="h-4 w-4" />
                Aggiorna
            </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-5 rounded-xl shadow-sm border-t-4 border-yellow-400 text-black transition-colors hover:bg-yellow-50">
            <div class="flex justify-between items-start">
                <span class="text-xs font-bold text-gray-500 uppercase">Valore Ordini Attivi</span>
                <CurrencyEuroIcon class="h-6 w-6 text-yellow-400" />
            </div>
            <div class="mt-2"><span class="text-2xl font-bold font-heading">€ {{ globalStats.totale_valore_aperto.toLocaleString('it-IT', {maximumFractionDigits: 0}) }}</span></div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border-t-4 border-orange-500 transition-colors hover:bg-orange-50">
            <div class="flex justify-between items-start">
                <span class="text-xs font-bold text-gray-400 uppercase">Da Validare</span>
                <ShieldExclamationIcon class="h-6 w-6 text-orange-400" />
            </div>
            <div class="mt-2"><span class="text-3xl font-bold text-gray-900">{{ globalStats.da_validare }}</span></div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border-t-4 border-purple-500 transition-colors hover:bg-purple-50">
            <div class="flex justify-between items-start">
                <span class="text-xs font-bold text-gray-400 uppercase">Nuovi Ordini</span>
                <ShoppingCartIcon class="h-6 w-6 text-purple-400" />
            </div>
            <div class="mt-2"><span class="text-3xl font-bold text-gray-900">{{ globalStats.richieste_ord }}</span></div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border-t-4 border-green-600 transition-colors hover:bg-green-50">
            <div class="flex justify-between items-start">
                <span class="text-xs font-bold text-gray-400 uppercase">In Produzione</span>
                <WrenchScrewdriverIcon class="h-6 w-6 text-green-500" />
            </div>
            <div class="mt-2"><span class="text-3xl font-bold text-gray-900">{{ globalStats.in_produzione }}</span></div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400">Caricamento...</div>

      <div v-else class="space-y-4">
        <div v-for="gruppo in clientiRaggruppati" :key="gruppo.nome" class="bg-white rounded-xl shadow-sm border overflow-hidden" :class="gruppo.priorita > 0 ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'">
          
          <div @click="toggleCliente(gruppo.nome)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm shrink-0 font-heading" :class="gruppo.priorita > 0 ? 'bg-orange-500' : 'bg-gray-800'">{{ gruppo.nome.charAt(0).toUpperCase() }}</div>
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
                    <tr><th class="px-4 py-3 text-left">Data</th><th class="px-4 py-3 text-left">Rif. / Codice</th><th class="px-4 py-3 text-center">Stato</th><th class="px-4 py-3 text-right">Importo</th><th class="px-4 py-3 text-right">Azioni</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                    <tr v-for="p in gruppo.preventivi" :key="p.id" class="hover:bg-yellow-50/50 transition-colors">
                        <td class="px-4 py-3 text-xs text-gray-500 font-mono">{{ formatDate(p.dataCreazione?.seconds) }}</td>
                        <td class="px-4 py-3"><div class="font-bold text-gray-800">{{ p.commessa || 'Nessun Rif.' }}</div><div class="text-xs font-mono text-gray-400">{{ p.codice }}</div></td>
                        <td class="px-4 py-3 text-center"><span class="px-2 py-1 text-[10px] font-bold rounded border uppercase" :class="getStatusBadge(p.stato)">{{ getStatusLabel(p.stato) }}</span></td>
                        <td class="px-4 py-3 text-right text-sm font-bold text-gray-900 font-heading">{{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €</td>
                        
                        <td class="px-4 py-3 text-right flex justify-end gap-2 items-center">
                             <button 
                                @click.stop="getActionData(p).action()" 
                                class="text-xs font-bold px-3 py-1.5 rounded border transition-all shadow-sm hover:shadow hover:brightness-95 flex items-center gap-2"
                                :class="getActionData(p).class"
                                :disabled="getActionData(p).class.includes('cursor-not-allowed')"
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
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>
