<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';
// IMPORT CONFIGURAZIONE CONDIVISA (Modifica richiesta)
import { STATUS_DETAILS } from '../types';
import OrderModals from '../components/OrderModals.vue';

// IMPORT ICONE HEROICONS
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
  UserIcon,
  CubeIcon 
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
  'DRAFT': PencilIcon,
  'PENDING_VAL': ShieldExclamationIcon,
  'QUOTE_READY': CheckCircleIcon,
  'ORDER_REQ': ShoppingCartIcon,
  'WAITING_FAST': ClockIcon,
  'WAITING_SIGN': ClockIcon,
  'SIGNED': PaperAirplaneIcon,
  'IN_PRODUZIONE': CogIcon,
  'READY': CubeIcon,
  'REJECTED': XCircleIcon
};

// STATO UI
const activeView = ref<'CLIENTI' | 'COMMESSE'>('CLIENTI');
const activeCategory = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE'>('ORDINI');
const filtroPeriodo = ref<'TUTTO' | 'CORRENTE' | 'SCORSO'>('CORRENTE');

// Calcolo conteggi
const categoryCounts = computed(() => {
  const counts = { PREVENTIVI: 0, ORDINI: 0, PRODUZIONE: 0 };
  const now = new Date();
  
  listaPreventivi.value.forEach(p => {
    if (filtroPeriodo.value !== 'TUTTO' && p.dataCreazione?.seconds) {
      const d = new Date(p.dataCreazione.seconds * 1000);
      if (filtroPeriodo.value === 'CORRENTE' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return;
      if (filtroPeriodo.value === 'SCORSO') {
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (d.getMonth() !== last.getMonth() || d.getFullYear() !== last.getFullYear()) return;
      }
    }
    
    const st = p.stato || 'DRAFT';
    if (['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'REJECTED'].includes(st)) counts.PREVENTIVI++;
    else if (['ORDER_REQ', 'WAITING_FAST', 'WAITING_SIGN', 'SIGNED'].includes(st)) counts.ORDINI++;
    else if (['IN_PRODUZIONE', 'READY'].includes(st)) counts.PRODUZIONE++;
  });
  return counts;
});

const preventiviFiltrati = computed(() => {
  const now = new Date();
  
  return listaPreventivi.value.filter(p => {
    // 1. Filtro Data
    if (filtroPeriodo.value !== 'TUTTO' && p.dataCreazione?.seconds) {
      const d = new Date(p.dataCreazione.seconds * 1000);
      if (filtroPeriodo.value === 'CORRENTE' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
      if (filtroPeriodo.value === 'SCORSO') {
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (d.getMonth() !== last.getMonth() || d.getFullYear() !== last.getFullYear()) return false;
      }
    }

    // 2. Filtro Categoria
    const st = p.stato || 'DRAFT';
    if (activeCategory.value === 'PREVENTIVI') return ['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'REJECTED'].includes(st);
    if (activeCategory.value === 'ORDINI') return ['ORDER_REQ', 'WAITING_FAST', 'WAITING_SIGN', 'SIGNED'].includes(st);
    if (activeCategory.value === 'PRODUZIONE') return ['IN_PRODUZIONE', 'READY'].includes(st);
    
    return true;
  });
});

const clientiEspansi = ref<string[]>([]);
const statiEspansi = ref<string[]>(['PENDING_VAL', 'ORDER_REQ', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE']);
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
    const item = listaPreventivi.value.find(p => p.id === selectedOrder.value.id);
    if (item) item.stato = 'IN_PRODUZIONE';
    
    showModals.value = false;
    alert("✅ Ordine inviato in produzione!");
  } catch (e) { console.error(e); alert("Errore aggiornamento stato."); }
};

const ordinePronto = async (preventivo: any) => {
  if(!confirm("Confermi che la merce è PRONTA per il ritiro/spedizione?")) return;
  await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'READY' });
  preventivo.stato = 'READY';
};

// --- HIGHLIGHTS ---
const globalStats = computed(() => {
  const stats = { da_validare: 0, richieste_ord: 0, in_produzione: 0, signed : 0, totale_valore_aperto: 0 };
  preventiviFiltrati.value.forEach(p => {
        const st = p.stato;
    
    if (st === 'PENDING_VAL') stats.da_validare++;
    if (st === 'ORDER_REQ') stats.richieste_ord++;
    if (st === 'IN_PRODUZIONE') stats.in_produzione++;
    if (st === 'SIGNED') stats.signed++;
    
    if (['SIGNED', 'IN_PRODUZIONE', 'READY'].includes(st)) {
      stats.totale_valore_aperto += (p.totaleScontato || p.totale || 0);
    }
  });
  return stats;
});

// --- RAGGRUPPAMENTO PER CLIENTE ---
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
    preventiviFiltrati.value.forEach(p => {
    if (p.stato === 'QUOTE_READY') return;

    const nomeReale = anagraficaClienti.value[p.clienteEmail] || p.cliente || 'Sconosciuto';

    if (!gruppi[nomeReale]) {
      gruppi[nomeReale] = {
        nome: nomeReale,
        preventivi: [],
        conteggi: {}, 
        totaleValore: 0,
        priorita: 0
      };
    }

    let st = p.stato || 'DRAFT';
    if (st === 'WAITING_FAST') st = 'WAITING_SIGN';

    if (!gruppi[nomeReale].conteggi[st]) gruppi[nomeReale].conteggi[st] = 0;
    gruppi[nomeReale].conteggi[st]++;

    if (st === 'PENDING_VAL') gruppi[nomeReale].priorita = Math.max(gruppi[nomeReale].priorita, 3);
    else if (st === 'ORDER_REQ') gruppi[nomeReale].priorita = Math.max(gruppi[nomeReale].priorita, 2);
    else if (st === 'SIGNED') gruppi[nomeReale].priorita = Math.max(gruppi[nomeReale].priorita, 1);

    if (st !== 'DRAFT' && st !== 'REJECTED') {
      gruppi[nomeReale].preventivi.push(p);
      gruppi[nomeReale].totaleValore += (p.totaleScontato || p.totale || 0);
    }
  });

  return Object.values(gruppi)
    .filter((g: any) => g.preventivi.length > 0 || g.conteggi['DRAFT'] > 0)
    .sort((a: any, b: any) => b.priorita - a.priorita);
});

// --- RAGGRUPPAMENTO PER STATO ---
const ordineStati = ['PENDING_VAL', 'ORDER_REQ', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'DRAFT', 'REJECTED'];

const preventiviPerStato = computed(() => {
  const gruppi: Record<string, any[]> = {};
  ordineStati.forEach(st => gruppi[st] = []);

  preventiviFiltrati.value.forEach(p => {
    if (p.stato === 'QUOTE_READY') return;

    let st = p.stato || 'DRAFT';
    if(st === 'IN_ATTESA') st = 'PENDING_VAL';
    if(st === 'RICHIESTA_ORDINE') st = 'ORDER_REQ';
    if(st === 'ATTESA_FIRMA') st = 'WAITING_SIGN';
    if(st === 'WAITING_FAST') st = 'WAITING_SIGN';

    // FIX: Check if gruppo exists before pushing (TS2532)
    if (!gruppi[st]) gruppi[st] = [];
    gruppi[st].push(p);
  });

  return ordineStati
    .map(key => ({ stato: key, lista: gruppi[key] }))
    .filter(g => g.lista && g.lista.length > 0);
});

// --- HELPERS STILE ---
const getStatusStyling = (stato: string) => {
  const config = STATUS_DETAILS[stato as keyof typeof STATUS_DETAILS] || STATUS_DETAILS['DRAFT'];
  return { ...config, icon: iconMap[stato] || DocumentTextIcon };
}

const getStatusLabel = (stato: string) => {
  return STATUS_DETAILS[stato as keyof typeof STATUS_DETAILS]?.label || stato;
};

const getUiConfig = (stato: string) => {
  const config = STATUS_DETAILS[stato as keyof typeof STATUS_DETAILS] || STATUS_DETAILS['DRAFT'];
  return { ...config, icon: iconMap[stato] || DocumentTextIcon };
};

const getActionData = (p: any) => {
  const st = p.stato;
  
  if (st === 'PENDING_VAL') 
    return { text: 'CONTROLLA E ACCETTA', class: 'text-orange-500 bg-orange-100 border-orange-200 hover:bg-orange-100 animate-pulse', action: () => apriEditor(p.codice), icon: PencilIcon };
  
  if (st === 'ORDER_REQ') 
    return { text: 'CONTROLLA E ACCETTA', class: 'text-cyan-600 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 animate-pulse', action: () => apriEditor(p.codice), icon: PencilIcon };

  if (st === 'SIGNED')
    return { text: 'AVVIA PRODUZIONE', class: 'text-amber-900 border-amber-200 bg-amber-100  hover:bg-amber-200', action: () => confermaProduzione(p), icon: CogIcon };
    
  if (st === 'WAITING_SIGN' || st === 'WAITING_FAST')
    return { text: 'APRI', class: 'border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50', action: () => apriEditor(p.codice), icon: EyeIcon };

  if (st === 'IN_PRODUZIONE')
    return { text: 'ORDINE PRONTO', class: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200', action: () => ordinePronto(p), icon: CubeIcon };
  
  if (st === 'READY')
    return { text: 'APRI', class: 'border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50', action: () => apriEditor(p.codice), icon: EyeIcon };

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

const apriEditor = (codice: string, readonly: boolean = false) => {
  if (readonly) {
    router.push(`/preventivatore?codice=${codice}&admin=true&readonly=true`);
  } else {
    router.push(`/preventivatore?codice=${codice}&admin=true`);
  }
};
const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '-';

const raggruppaPreventiviClientePerStato = (preventivi: any[]) => {
  const gruppi: Record<string, any[]> = {};
  preventivi.forEach(p => {
    const st = p.stato || 'DRAFT';
    if (!gruppi[st]) gruppi[st] = [];
    gruppi[st].push(p);
  });
  return ordineStati
    .filter(st => gruppi[st] && gruppi[st].length > 0)
    .map(st => ({ stato: st, lista: gruppi[st] }));
};

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
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 font-heading tracking-tight">Dashboard Inglesina Italiana</h1>
            <p class="text-gray-500 text-sm">Panoramica operativa</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400 animate-pulse hidden md:block">Live Sync</span>
          <button @click="caricaTutti" class="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-yellow-50 text-sm font-bold text-gray-700 transition-all shadow-sm hover:border-gray-300">
            <ArrowPathIcon class="h-4 w-4" />
            Aggiorna
          </button>
          <select v-model="filtroPeriodo" class="bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-lg px-3 py-2 outline-none focus:border-yellow-400 cursor-pointer shadow-sm">
            <option value="TUTTO">Tutto</option>
            <option value="CORRENTE">Mese Corrente</option>
            <option value="SCORSO">Mese Scorso</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-emerald-100 cursor-pointer">
          <div class="h-12 w-12 rounded-full flex items-center justify-center bg-emerald-100">
            <CurrencyEuroIcon class="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Valore Ordini</div>
            <div class="text-2xl font-bold font-heading text-gray-900">€ {{ globalStats.totale_valore_aperto.toLocaleString('it-IT', {maximumFractionDigits: 0}) }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-orange-100 cursor-pointer">
          <div class="h-12 w-12 rounded-full flex items-center justify-center bg-orange-100">
            <ShieldExclamationIcon class="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Nuovi Preventivi</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.da_validare }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-cyan-100 cursor-pointer">
          <div class="h-12 w-12 rounded-full flex items-center justify-center bg-cyan-100">
            <ShoppingCartIcon class="h-6 w-6 text-cyan-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Nuovi Ordini</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.richieste_ord }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-yellow-100 cursor-pointer">
          <div class="h-12 w-12 rounded-full flex items-center justify-center bg-yellow-100">
            <PaperAirplaneIcon class="h-6 w-6 text-yellow-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Nuovi Prodotti</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.signed }}</div>
          </div>
        </div>
      </div>

      <div class="flex flex-col md:flex-row border-b border-gray-200 mb-6 justify-between items-end gap-4">
        
        <div class="flex overflow-x-auto">
          <button @click="activeCategory = 'PREVENTIVI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap" :class="activeCategory === 'PREVENTIVI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            PREVENTIVI
            <span v-if="categoryCounts.PREVENTIVI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PREVENTIVI }}</span>
          </button>
          <button @click="activeCategory = 'ORDINI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap" :class="activeCategory === 'ORDINI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            ORDINI
            <span v-if="categoryCounts.ORDINI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.ORDINI }}</span>
          </button>
          <button @click="activeCategory = 'PRODUZIONE'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap" :class="activeCategory === 'PRODUZIONE' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            PRODUZIONE
            <span v-if="categoryCounts.PRODUZIONE" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PRODUZIONE }}</span>
          </button>
        </div>

        <div class="flex items-center gap-2 bg-gray-100 p-1 rounded-lg mb-2">
          <span class="text-[10px] font-bold text-gray-400 px-2 uppercase">Raggruppa per:</span>
          <button @click="activeView = 'CLIENTI'" class="px-3 py-1 rounded text-xs font-bold transition-all" :class="activeView === 'CLIENTI' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Clienti
          </button>
          <button @click="activeView = 'COMMESSE'" class="px-3 py-1 rounded text-xs font-bold transition-all" :class="activeView === 'COMMESSE' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Stato
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400">Caricamento...</div>

      <div v-else-if="activeView === 'CLIENTI'" class="space-y-4">
                <div v-for="gruppo in clientiRaggruppati" :key="gruppo.nome" class="bg-white rounded-xl shadow-sm border overflow-hidden" :class="gruppo.priorita > 0 ? 'border-2 border-orange-300 ring-1 ring-orange-200' : 'border-gray-200'">

          <div @click="toggleCliente(gruppo.nome)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm shrink-0 font-heading" :class="gruppo.priorita > 0 ? 'bg-orange-500' : 'bg-gray-800'">
                <UserIcon class="h-6 w-6" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-gray-900 font-heading">{{ gruppo.nome }}</h2>
                <p class="text-xs text-gray-500 font-medium mt-0.5">Totale: € {{ gruppo.totaleValore.toFixed(2) }}</p>
              </div>
            </div>

            <div class="flex gap-2 w-full md:flex-1 justify-end flex-wrap">
              <template v-for="st in ['PENDING_VAL', 'ORDER_REQ', 'SIGNED']" :key="st">
                <div v-if="gruppo.conteggi[st]" 
                     class="px-2 py-0.5 rounded border text-[10px] font-bold uppercase transition-colors flex items-center gap-1" 
                     :class="getStatusStyling(st).badge">
                  <component :is="getStatusStyling(st).icon" class="w-3 h-3" />
                  {{ gruppo.conteggi[st] }} {{ getStatusLabel(st) }}
                </div>
              </template>
            </div>

            <div class="text-gray-300 hidden md:block transform transition-transform" :class="clientiEspansi.includes(gruppo.nome) ? 'rotate-180' : ''">▼</div>
          </div>

          <div v-if="clientiEspansi.includes(gruppo.nome)" class="border-t border-gray-100 bg-gray-50 p-4 animate-fade-in space-y-4">
            
            <div v-for="statoGruppo in raggruppaPreventiviClientePerStato(gruppo.preventivi)" :key="statoGruppo.stato" class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
              
              <div class="px-4 py-2 border-b flex items-center justify-between" 
                   :class="getStatusStyling(statoGruppo.stato).badge">
                
                <div class="flex items-center gap-2">
                  <component :is="getStatusStyling(statoGruppo.stato).icon" class="h-4 w-4" />
                  <span class="text-xs font-bold uppercase">{{ getStatusLabel(statoGruppo.stato) }}</span>
                </div>
                
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/60 shadow-sm border border-black/5 text-inherit">
                  {{ statoGruppo.lista?.length || 0 }}
                </span>
              </div>

              <table class="min-w-full divide-y divide-gray-100">
                <thead class="bg-gray-50 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                  <tr>
                    <th class="px-4 py-2 text-left">Rif. / Codice</th>
                    <th class="px-4 py-2 text-right w-64">Azioni</th>
                    <th class="px-4 py-2 text-right w-32">Importo</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 text-sm">
                  <tr v-for="p in statoGruppo.lista" :key="p.id" class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3">
                      <div v-if="p.sommarioPreventivo">
                        <div v-for="(item, idx) in p.sommarioPreventivo" :key="idx" class="text text-gray-600 font-medium">
                          <span class="font-bold">{{ item.quantitaTotale }} x</span> {{ item.descrizione }} 
                          <span v-if="item.canalino" class="text-gray-400 italic"> • {{ item.canalino }}</span>
                        </div>
                      </div>
                      <div class="text-xs text-gray-400 mt-1">DATA: {{ formatDate(p.dataCreazione?.seconds) }} • COMMESSA: {{ p.commessa || 'Nessun Rif.' }}</div>
                    </td>
                    <td class="align-middle px-4 py-3 text-right">
                      <div class="flex justify-end items-center gap-2 w-64">
                        <button
                        @click.stop="getActionData(p).action()"
                        class="text-xs font-bold px-3 py-1.5 rounded border transition-all shadow-sm hover:shadow hover:brightness-95 flex items-center gap-2"
                        :class="getActionData(p).class"
                        >
                        <component :is="getActionData(p).icon" class="h-4 w-4" />
                        <span>{{ getActionData(p).text }}</span>
                        </button>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right text-sm font-bold text-gray-900 font-heading w-24">{{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €</td>
                    
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
              <span class="font-bold font-heading text-sm uppercase" :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]">{{ getStatusLabel(gruppo.stato) }}</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold" :class="getUiConfig(gruppo.stato).darkBadge">{{ gruppo.lista?.length || 0 }}</span>            </div>
            <div class="text-current transform transition-transform" :class="statiEspansi.includes(gruppo.stato) ? 'rotate-180' : ''">▼</div>
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
                    <span class="text-xs text-gray-500"> - {{ p.cliente }}</span>
                  </div>
                  <p class="text-xs text-gray-500 font-mono">Cod: {{ p.codice }} • {{ formatDate(p.dataCreazione?.seconds) }}</p>
                  <div v-if="p.sommarioPreventivo" class="mt-2 flex flex-wrap gap-2">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
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
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>