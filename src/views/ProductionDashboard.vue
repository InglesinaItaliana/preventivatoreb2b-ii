<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, getDocs, limit, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';
import { STATUS_DETAILS } from '../types';
import OrderModals from '../components/OrderModals.vue';

// IMPORT ICONE HEROICONS (Ridotte all'essenziale per Produzione)
import {
  ChevronDoubleRightIcon, // Signed
  DocumentTextIcon,
  EyeIcon,
  CogIcon,                // In Produzione
  CubeIcon,               // Ready,
  TruckIcon,              // Consegna
  UserIcon
} from '@heroicons/vue/24/solid'

const router = useRouter();
const listaPreventivi = ref<any[]>([]);
const anagraficaClienti = ref<Record<string, string>>({});
const loading = ref(true);

const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN' | 'PRODUCTION'>('PRODUCTION');
const selectedOrder = ref<any>(null);
const selectedClientName = ref('');

// MAPPA ICONE LOCALE
const iconMap: Record<string, any> = {
  'SIGNED': ChevronDoubleRightIcon,
  'IN_PRODUZIONE': CogIcon,
  'READY': CubeIcon
};

// STATO UI - CATEGORIA BLOCCATA SU PRODUZIONE
const activeView = ref<'CLIENTI' | 'COMMESSE'>('COMMESSE'); // Default su Commesse per vedere la lista operativa
const filtroPeriodo = ref<'TUTTO' | 'CORRENTE' | 'SCORSO'>('TUTTO'); // Default TUTTO per non perdere ordini vecchi

// Calcolo statistiche rapide per la testata
const productionStats = computed(() => {
  const stats = { da_avviare: 0, in_lavorazione: 0 };
  
  listaPreventivi.value.forEach(p => {
    const st = p.stato;
    if (st === 'SIGNED') stats.da_avviare++;
    if (st === 'IN_PRODUZIONE') stats.in_lavorazione++;
  });
  return stats;
});

// Funzione per salvare il numero di colli su Firestore
const saveColli = async (orderId: string, colli: number) => {
    const colliValue = Math.max(1, Math.round(Number(colli))); 
    if (isNaN(colliValue)) return;
    try {
        const orderRef = doc(db, 'preventivi', orderId);
        await updateDoc(orderRef, { colli: colliValue }); 
    } catch (error) { console.error("Errore salvataggio colli:", error); }
};

// Filtro principale: Mostra SOLO 'SIGNED' e 'IN_PRODUZIONE' + ORDINAMENTO DATA CONSEGNA
const preventiviFiltrati = computed(() => {
  const now = new Date();
  
  // 1. PRIMA FILTRIAMO
  const listaFiltrata = listaPreventivi.value.filter(p => {
    // 1. Filtro Data (Logica esistente)
    if (filtroPeriodo.value !== 'TUTTO' && p.dataCreazione?.seconds) {
      const d = new Date(p.dataCreazione.seconds * 1000);
      if (filtroPeriodo.value === 'CORRENTE' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
      if (filtroPeriodo.value === 'SCORSO') {
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (d.getMonth() !== last.getMonth() || d.getFullYear() !== last.getFullYear()) return false;
      }
    }

    // 2. Filtro Categoria FORZATO SU PRODUZIONE
    const st = p.stato;
    return ['IN_PRODUZIONE'].includes(st);
  });

  // 2. POI ORDINIAMO (Data Consegna CRESCENTE: Prima quelli in scadenza)
  return listaFiltrata.sort((a, b) => {
    // Convertiamo la data stringa 'YYYY-MM-DD' in timestamp numerico
    // Se la data manca, usiamo Infinity per metterla in fondo alla lista
    const dateA = a.dataConsegnaPrevista ? new Date(a.dataConsegnaPrevista).getTime() : Infinity;
    const dateB = b.dataConsegnaPrevista ? new Date(b.dataConsegnaPrevista).getTime() : Infinity;

    // Ordine crescente (dal più piccolo/vecchio al più grande/futuro)
    if (dateA !== dateB) {
        return dateA - dateB;
    }

    // Se le date di consegna sono uguali (o mancano entrambe), 
    // manteniamo l'ordinamento secondario per Data di Creazione (dal più recente)
    // così gli ordini nuovi sono in alto tra quelli senza data
    return (b.dataCreazione?.seconds || 0) - (a.dataCreazione?.seconds || 0);
  });
});

const clientiEspansi = ref<string[]>([]);
const statiEspansi = ref<string[]>(['IN_PRODUZIONE']);
let unsubscribe: null | (() => void) = null;

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

// --- 2. CARICAMENTO PREVENTIVI (REAL TIME) ---
const caricaTutti = () => {
  if (unsubscribe) unsubscribe();
  // Carichiamo tutto, poi filtriamo localmente. 
  const q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(300));
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    listaPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loading.value = false;
  }, (error) => {
    console.error("Errore real-time:", error);
    loading.value = false;
  });
};

// --- AZIONI PRODUZIONE ---
const confermaProduzione = (preventivo: any) => {
  selectedOrder.value = preventivo;
  selectedClientName.value = anagraficaClienti.value[preventivo.clienteEmail] || preventivo.cliente || 'Cliente';
  modalMode.value = 'PRODUCTION';
  showModals.value = true;
};

const onConfirmProduction = async () => {
  if (!selectedOrder.value) return;
  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), { stato: 'IN_PRODUZIONE' });
    showModals.value = false;
  } catch (e) { console.error(e); alert("Errore aggiornamento stato."); }
};

// Gestione Ordine Pronto
const idOrdineInConferma = ref<string | null>(null);

const ordinePronto = async (preventivo: any) => {
  try {
      await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'READY' });
      // L'ordine sparirà dalla lista perché lo stato diventa READY (non incluso nel filtro produzione)
  } catch (e) { console.error(e); alert("Errore aggiornamento"); }
};

const handleClickAzione = (p: any) => {
  if (p.stato === 'IN_PRODUZIONE') {
    idOrdineInConferma.value = p.id;
  } else {
    getActionData(p).action();
  }
};

const confermaOrdinePronto = async (p: any) => {
  await ordinePronto(p);
  idOrdineInConferma.value = null; 
};

// --- RAGGRUPPAMENTI ---
// Raggruppamento per Cliente
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
    preventiviFiltrati.value.forEach(p => {
    const nomeReale = anagraficaClienti.value[p.clienteEmail] || p.cliente || 'Sconosciuto';

    if (!gruppi[nomeReale]) {
      gruppi[nomeReale] = { nome: nomeReale, preventivi: [], conteggi: {}, totaleValore: 0 };
    }
    const st = p.stato;
    if (!gruppi[nomeReale].conteggi[st]) gruppi[nomeReale].conteggi[st] = 0;
    gruppi[nomeReale].conteggi[st]++;
    gruppi[nomeReale].preventivi.push(p);
  });

  return Object.values(gruppi).sort((a: any, b: any) => b.preventivi.length - a.preventivi.length);
});

// Raggruppamento per Stato (Solo i due stati rilevanti)
const ordineStati = ['SIGNED', 'IN_PRODUZIONE'];

const preventiviPerStato = computed(() => {
  const gruppi: Record<string, any[]> = {};
  ordineStati.forEach(st => gruppi[st] = []);

  preventiviFiltrati.value.forEach(p => {
    const st = p.stato;
    if (gruppi[st]) gruppi[st].push(p);
  });

  return ordineStati
    .map(key => ({ stato: key, lista: gruppi[key] || [] }))
    .filter(g => g.lista.length > 0); // Mostra solo se ci sono elementi
});

const getStatusStyling = (stato: string) => {
  const config = STATUS_DETAILS[stato as keyof typeof STATUS_DETAILS] || STATUS_DETAILS['DRAFT'];
  return { ...config, icon: iconMap[stato] || DocumentTextIcon };
}

const getStatusLabel = (stato: string) => {
  return STATUS_DETAILS[stato as keyof typeof STATUS_DETAILS]?.label || stato;
};

const getActionData = (p: any) => {
  const st = p.stato;
  
  if (st === 'SIGNED')
    return { text: 'AVVIA PRODUZIONE', class: 'text-emerald-500 border-emerald-200 bg-emerald-100  hover:bg-emerald-200', action: () => confermaProduzione(p), icon: CogIcon };
    
  if (st === 'IN_PRODUZIONE')
    return { text: 'ORDINE PRONTO', class: 'text-emerald-500 border-emerald-200 bg-emerald-100  hover:bg-emerald-200', action: () => ordinePronto(p), icon: CubeIcon };
  
  return { text: 'APRI', class: 'text-gray-500 border-gray-200', action: () => apriEditor(p.codice), icon: EyeIcon };
};

const toggleCliente = (nome: string) => {
  if (clientiEspansi.value.includes(nome)) clientiEspansi.value = clientiEspansi.value.filter(n => n !== nome);
  else clientiEspansi.value.push(nome);
};
const toggleStato = (stato: string) => {
  if (statiEspansi.value.includes(stato)) statiEspansi.value = statiEspansi.value.filter(s => s !== stato);
  else statiEspansi.value.push(stato);
};

const apriEditor = (codice: string) => {
  // Modalità readonly per la produzione, possono solo vedere i dettagli tecnici
  router.push(`/preventivatore?codice=${codice}&admin=true&readonly=true`);
};

// Funzione oggetto del warning 6133
const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '-'; 

const formatDateShort = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }).toUpperCase().replace(/\./g, ''); 
};

const raggruppaPreventiviClientePerStato = (preventivi: any[]) => {
  const gruppi: Record<string, any[]> = {};
  preventivi.forEach(p => {
    const st = p.stato;
    if (!gruppi[st]) gruppi[st] = [];
    gruppi[st]!.push(p);
  });
  return ordineStati
    .filter(st => gruppi[st] && gruppi[st].length > 0)
    .map(st => ({ stato: st, lista: gruppi[st] }));
};

onMounted(() => {
  caricaAnagrafica();
  caricaTutti();
});
onUnmounted(() => { if (unsubscribe) unsubscribe(); });
</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
    <div class="max-w-7xl mx-auto">

      <div class="flex justify-between items-center mb-8">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Inglesina Italiana Srl</p>
            <h1 class="text-5xl font-bold font-heading text-gray-900">Dashboard Produzione</h1>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400 animate-pulse hidden md:block">Live Sync</span>
          <select v-model="filtroPeriodo" class="bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-lg px-3 py-2 outline-none cursor-pointer shadow-sm">
            <option value="TUTTO">Tutto</option>
            <option value="CORRENTE">Mese Corrente</option>
            <option value="SCORSO">Mese Scorso</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-emerald-100">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-emerald-100">
            <ChevronDoubleRightIcon class="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Ordini da Avviare</div>
            <div class="text-2xl font-bold text-gray-900">{{ productionStats.da_avviare }}</div>
          </div>
        </div>
        <div class="group bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-yellow-100">
            <div class="h-14 w-14 rounded-full flex items-center justify-center bg-yellow-100">
                <CogIcon class="h-8 w-8 text-yellow-600 spin-on-hover" /> 
            </div>
            <div>
                <div class="text-xs font-bold text-gray-400 uppercase">In Lavorazione</div>
                <div class="text-2xl font-bold text-gray-900">{{ productionStats.in_lavorazione }}</div>
            </div>
        </div>
      </div>

      <div class="flex flex-col md:flex-row border-b border-gray-200 mb-6 justify-end items-center gap-4">
        <div class="flex items-center gap-2 bg-gray-100 p-1 rounded-lg mb-2">
          <span class="text-[10px] font-bold text-gray-400 px-2 uppercase">Vista:</span>
          <button @click="activeView = 'CLIENTI'" class="px-3 py-1 rounded text-xs font-bold transition-all" :class="activeView === 'CLIENTI' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Raggruppa Clienti
          </button>
          <button @click="activeView = 'COMMESSE'" class="px-3 py-1 rounded text-xs font-bold transition-all" :class="activeView === 'COMMESSE' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Lista Lavorazione
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400">Caricamento ordini in corso...</div>

      <div v-else-if="activeView === 'CLIENTI'" class="space-y-4">
          <div v-for="gruppo in clientiRaggruppati" :key="gruppo.nome" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div @click="toggleCliente(gruppo.nome)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="h-12 w-12 rounded-full flex items-center justify-center bg-gray-800 text-xl font-bold text-white shadow-sm shrink-0 font-heading">
                        <UserIcon class="h-6 w-6" />
                    </div>
                    <div>
                        <h2 class="text-lg font-bold text-gray-900 font-heading">{{ gruppo.nome }}</h2>
                        <p class="text-xs text-gray-500 font-medium mt-0.5">Ordini attivi: {{ gruppo.preventivi.length }}</p>
                    </div>
                </div>
                <div class="text-gray-300 hidden md:block transform transition-transform" :class="clientiEspansi.includes(gruppo.nome) ? 'rotate-180' : ''">▼</div>
            </div>

            <div v-if="clientiEspansi.includes(gruppo.nome)" class="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                <div v-for="statoGruppo in raggruppaPreventiviClientePerStato(gruppo.preventivi)" :key="statoGruppo.stato" class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                     <div class="px-4 py-2 border-b flex items-center justify-between" :class="getStatusStyling(statoGruppo.stato).badge">
                        <div class="flex items-center gap-2">
                            <component :is="getStatusStyling(statoGruppo.stato).icon" class="h-4 w-4" />
                            <span class="text-xs font-bold uppercase">{{ getStatusLabel(statoGruppo.stato) }}</span>
                        </div>
                     </div>
                     <table class="min-w-full divide-y divide-gray-100">
                        <tbody class="divide-y divide-gray-50 text-sm">
                            <tr v-for="p in statoGruppo.lista" :key="p.id" class="hover:bg-yellow-50 transition-colors">
                                <td class="px-4 py-3">
                                    <div class="font-bold text-gray-900">{{ p.commessa || 'Nessun Rif.' }}</div>
                                    <div class="text-xs text-gray-500 mt-1">DATA CREAZIONE: {{ formatDate(p.dataCreazione?.seconds) }}</div>
                                    <div v-if="p.dataConsegnaPrevista" class="flex items-center gap-1 mt-1 text-yellow-500 font-bold text-[10px] uppercase">
                                        <TruckIcon class="h-3 w-3" />
                                        <span>CONSEGNA: {{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                                    </div>
                                    <div v-if="p.sommarioPreventivo" class="mt-2">
                                        <div v-for="(item, idx) in p.sommarioPreventivo" :key="idx" class="text-xs text-gray-600">
                                            <span class="font-bold">{{ item.quantitaTotale }} x</span> {{ item.descrizione }}
                                            <span v-if="item.canalino" class="text-gray-400 italic"> • {{ item.canalino }}</span>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button @click.stop="handleClickAzione(p)" class="text-xs font-bold px-4 py-2 rounded border transition-all shadow-sm flex items-center gap-2 ml-auto" :class="getActionData(p).class">
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

      <div v-else-if="activeView === 'COMMESSE'" class="space-y-4">
        <div v-for="gruppo in preventiviPerStato" :key="gruppo.stato" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
           <div @click="toggleStato(gruppo.stato)" class="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center border-l-4" :class="getStatusStyling(gruppo.stato).badge.replace('text-','border-').split(' ')[0]">
             <div class="flex items-center gap-3">
                 <component :is="getStatusStyling(gruppo.stato).icon" class="h-8 w-8" :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]" />
                 <span class="text-xl font-bold font-heading text-l uppercase" :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]">
                    {{ getStatusLabel(gruppo.stato) }}
                 </span>
                 <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border">{{ gruppo.lista.length }}</span>
             </div>
             <div class="text-current transform transition-transform" :class="statiEspansi.includes(gruppo.stato) ? 'rotate-180' : ''">▼</div>
           </div>

           <div v-if="statiEspansi.includes(gruppo.stato)" class="border-t border-gray-100 bg-gray-50 p-4 grid gap-3 animate-fade-in">
                <div v-for="p in gruppo.lista" :key="p.id" class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all hover:shadow-md">
                    <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div class="flex items-center gap-4 w-full md:w-auto">
                             <div class="h-10 w-10 rounded-full flex items-center justify-center" :class="getStatusStyling(p.stato).iconBg">
                                <component :is="getStatusStyling(p.stato).icon" class="h-6 w-6" />
                             </div>
                             <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="text-xl font-bold text-gray-900">{{ p.cliente }}</h3>
                                </div>
                                <div v-if="p.dataConsegnaPrevista" class="mt-1 flex items-center gap-1 px-2 py-0.5 bg-yellow-100 border border-yellow-200 rounded text-yellow-800 w-fit">
                                    <TruckIcon class="h-3 w-3" />
                                    <span class="text-[10px] font-bold uppercase">{{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                                </div>
                                <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1 mt-2 items-start">
                                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" class="text-sm bg-gray-50 px-2 py-1 rounded border text-gray-700">
                                        <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }} 
                                        <span v-if="item.canalino" class="text-gray-500 italic">({{ item.canalino }})</span>
                                    </span>
                                </div>
                             </div>
                        </div>

                        <div class="flex flex-col items-end gap-2 w-full md:w-auto justify-center">
                             <button @click.stop="apriEditor(p.codice)" class="border border-gray-300 text-gray-600 px-3 py-2 rounded font-bold text-xs hover:bg-gray-50 w-full mb-2">
                                VEDI DETTAGLI TECNICI
                             </button>

                             <div class="flex items-end gap-2">
                                <div v-if="p.stato === 'IN_PRODUZIONE'" class="flex flex-col items-start justify-end" @click.stop>
                                    <label class="text-[9px] font-bold text-gray-400 uppercase mb-0.5 leading-none">N° Colli</label>
                                    <div class="flex items-center bg-gray-50 rounded border border-gray-300 h-[34px] overflow-hidden shadow-sm">
                                        <button @click="() => { if((p.colli || 1) > 1) { p.colli = (p.colli || 1) - 1; saveColli(p.id, p.colli); } }" class="w-8 h-full flex items-center justify-center text-gray-500 hover:text-red-500 active:bg-gray-200">−</button>
                                        <input type="number" :value="p.colli || 1" @input="event => p.colli = Number((event.target as HTMLInputElement).value)" @blur="event => saveColli(p.id, Number((event.target as HTMLInputElement).value))" class="w-10 text-center bg-transparent text-sm font-bold text-gray-900 border-gray-50 appearance-none"/>
                                        <button @click="() => { p.colli = (p.colli || 1) + 1; saveColli(p.id, p.colli); }" class="w-8 h-full flex items-center justify-center text-gray-500 hover:text-emerald-600 active:bg-gray-200 ">+</button>
                                    </div>
                                </div>

                                <div class="h-[34px] flex items-center">
                                    <div v-if="idOrdineInConferma === p.id" class="flex gap-1 h-full animate-fade-in">
                                        <button @click.stop="confermaOrdinePronto(p)" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-600 border border-emerald-200 font-bold text-[10px] px-8 rounded shadow-sm h-full">SÌ, PRONTO</button>
                                        <button @click.stop="idOrdineInConferma = null" class="bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 font-bold text-[10px] px-4 rounded shadow-sm h-full">NO</button>
                                    </div>
                                    <button v-else @click.stop="handleClickAzione(p)" class="text-xs font-bold px-8 py-2 rounded border transition-all shadow-sm hover:shadow whitespace-nowrap flex items-center gap-2 h-full" :class="getActionData(p).class" :disabled="p.stato === 'IN_PRODUZIONE' && !p.colli">
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
      </div>

    </div>
  </div>

  <OrderModals 
      :show="showModals"
      :mode="modalMode"
      :order="selectedOrder"
      :clientName="selectedClientName"
      @close="showModals = false"
      @confirmProduction="onConfirmProduction"
    />
</template>

<style scoped>
/* 1. Definisci i keyframes della rotazione */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 2. La regola Magica: 
   Seleziona .spin-on-hover SOLO quando il genitore .group è in stato :hover */
.group:hover .spin-on-hover {
  animation: spin 3s linear infinite;
}
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>