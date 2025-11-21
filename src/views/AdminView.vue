<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';

const router = useRouter();
const listaPreventivi = ref<any[]>([]);
const loading = ref(true);
const clientiEspansi = ref<string[]>([]);
let refreshInterval: any = null;

// --- CARICAMENTO DATI ---
const caricaTutti = async () => {
  try {
    const q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(200));
    const snapshot = await getDocs(q);
    listaPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Errore auto-refresh:", e);
  } finally {
    loading.value = false;
  }
};

// --- AZIONI RAPIDE ---
const gestisciInvioMail = async (preventivo: any) => {
    if(!confirm(`Inviare mail conferma per ordine ${preventivo.codice}?`)) return;
    const oggetto = encodeURIComponent(`Conferma Ordine #${preventivo.codice} - ${preventivo.commessa}`);
    const corpo = encodeURIComponent(`Gentile Cliente,\n\nIn allegato la conferma d'ordine.\n\nSaluti,\nInglesina Italiana`);
    window.open(`mailto:?subject=${oggetto}&body=${corpo}`);
    try {
        await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'ATTESA_FIRMA' });
        preventivo.stato = 'ATTESA_FIRMA'; 
    } catch (e) { alert("Errore DB"); }
};

const confermaProduzione = async (preventivo: any) => {
    if(!confirm("Confermi ricezione firma? Passa in PRODUZIONE?")) return;
    await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'IN_PRODUZIONE' });
    preventivo.stato = 'IN_PRODUZIONE';
};

// --- STATISTICHE GLOBALI (HIGHLIGHTS) ---
const globalStats = computed(() => {
  const stats = {
    da_validare: 0,
    richieste_ord: 0,
    in_produzione: 0,
    totale_valore_aperto: 0
  };

  listaPreventivi.value.forEach(p => {
    const st = p.stato;
    if (st === 'PENDING_VAL' || st === 'IN_ATTESA') stats.da_validare++;
    if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') stats.richieste_ord++;
    if (st === 'IN_PRODUZIONE') stats.in_produzione++;
    
    // Calcolo valore (escluse bozze e rifiutati)
    if (st !== 'DRAFT' && st !== 'BOZZA' && st !== 'REJECTED' && st !== 'RIFIUTATO') {
      stats.totale_valore_aperto += (p.totaleScontato || p.totale || 0);
    }
  });
  return stats;
});

// --- RAGGRUPPAMENTO CLIENTI (CORRETTO) ---
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
  
  listaPreventivi.value.forEach(p => {
    const nome = p.cliente || 'Sconosciuto';
    
    // Inizializzazione Sicura
    if (!gruppi[nome]) {
      gruppi[nome] = { 
        nome, 
        preventivi: [], 
        // Struttura che il template si aspetta
        contatori: { 
            validare: 0, 
            richiedere: 0, 
            firmare: 0, 
            prod: 0,
            bozze: 0, 
            tot: 0 // <--- Questo campo 'tot' mancava e causava l'errore!
        },
        priorita: 0 
      };
    }

    const st = p.stato || 'DRAFT';

    // CONTEGGIO SPECIFICO (Granulare)
    if (st === 'PENDING_VAL' || st === 'IN_ATTESA') { 
        gruppi[nome].contatori.validare++; 
        gruppi[nome].priorita = Math.max(gruppi[nome].priorita, 3); 
    }
    else if (st === 'ORDER_REQ' || st === 'RICHIESTA_ORDINE') { 
        gruppi[nome].contatori.richiedere++; 
        gruppi[nome].priorita = Math.max(gruppi[nome].priorita, 2); 
    }
    else if (st === 'WAITING_SIGN' || st === 'ATTESA_FIRMA') { 
        gruppi[nome].contatori.firmare++; 
    }
    else if (st === 'IN_PRODUZIONE') { 
        gruppi[nome].contatori.prod++; 
    }
    else if (st === 'DRAFT' || st === 'BOZZA') { 
        gruppi[nome].contatori.bozze++; 
    }
    
    // POPOLAMENTO LISTA E TOTALE VALORE
    // (Mettiamo nella lista espandibile tutto tranne le bozze)
    if (st !== 'DRAFT' && st !== 'BOZZA') {
       gruppi[nome].preventivi.push(p);
       // Somma sicura del valore
       gruppi[nome].contatori.tot += (p.totaleScontato || p.totale || 0);
    }
  });

  // Ordina e restituisci
  return Object.values(gruppi)
    .filter((g: any) => g.preventivi.length > 0 || g.contatori.bozze > 0)
    .sort((a: any, b: any) => b.priorita - a.priorita);
});

// --- HELPERS STILE ---
const getStatusBadge = (stato: string) => {
  switch(stato) {
    case 'PENDING_VAL': case 'IN_ATTESA': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'ORDER_REQ': case 'RICHIESTA_ORDINE': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'WAITING_SIGN': case 'ATTESA_FIRMA': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'IN_PRODUZIONE': return 'bg-green-100 text-green-800 border-green-200';
    case 'QUOTE_READY': case 'APPROVATO': case 'SIGNED': return 'bg-green-50 text-green-600 border-green-100';
    case 'REJECTED': case 'RIFIUTATO': return 'bg-red-50 text-red-600 border-red-200';
    default: return 'bg-gray-100 text-gray-500 border-gray-200';
  }
};

const getStatusLabel = (stato: string) => {
    const map: Record<string, string> = {
        'PENDING_VAL': 'DA VALIDARE', 'IN_ATTESA': 'DA VALIDARE',
        'ORDER_REQ': 'ORDINE RICHIESTO', 'RICHIESTA_ORDINE': 'ORDINE RICHIESTO',
        'WAITING_SIGN': 'ATTESA FIRMA', 'ATTESA_FIRMA': 'ATTESA FIRMA',
        'IN_PRODUZIONE': 'IN PRODUZIONE',
        'QUOTE_READY': 'PRONTO', 'APPROVATO': 'PRONTO',
        'SIGNED': 'FIRMATO',
        'DRAFT': 'BOZZA', 'BOZZA': 'BOZZA',
        'REJECTED': 'ANNULLATO', 'RIFIUTATO': 'ANNULLATO'
    };
    return map[stato] || stato;
};

const getActionButton = (stato: string) => {
  switch(stato) {
    case 'PENDING_VAL': case 'IN_ATTESA': return { text: '✏️ VALIDA', class: 'text-orange-600 bg-orange-50 border-orange-200' };
    case 'ORDER_REQ': case 'RICHIESTA_ORDINE': return { text: '📧 GESTISCI', class: 'text-purple-600 bg-purple-50 border-purple-200' };
    case 'WAITING_SIGN': case 'ATTESA_FIRMA': return { text: '✅ CONFERMA', class: 'text-blue-600 bg-blue-50 border-blue-200' };
    case 'QUOTE_READY': case 'APPROVATO': return { text: 'VEDI', class: 'text-green-600 bg-green-50 border-green-200' };
    case 'IN_PRODUZIONE': return { text: 'SCHEDA', class: 'text-gray-600 bg-gray-50 border-gray-200' };
    default: return { text: 'APRI', class: 'text-gray-500 border-gray-200' };
  }
};

const toggleCliente = (nome: string) => {
  if (clientiEspansi.value.includes(nome)) clientiEspansi.value = clientiEspansi.value.filter(n => n !== nome);
  else clientiEspansi.value.push(nome);
};
const apriEditor = (codice: string) => router.push(`/preventivatore?codice=${codice}&admin=true`);
const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '-';

onMounted(() => {
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
            <button 
                @click="caricaTutti" 
                class="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-yellow-50 text-sm font-bold text-gray-700 transition-all shadow-sm hover:border-yellow-400"
            >
                🔄 Aggiorna
            </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        
        <div class="bg-yellow-400 p-5 rounded-xl shadow-md border border-yellow-500 flex flex-col justify-between text-black transition-all hover:bg-yellow-300 cursor-default group">
            <span class="text-xs font-bold text-yellow-900/70 uppercase tracking-wider">Valore Ordini Attivi</span>
            <div class="flex justify-between items-end mt-2">
                <span class="text-2xl font-bold font-heading truncate">€ {{ globalStats.totale_valore_aperto.toLocaleString('it-IT', {maximumFractionDigits: 0}) }}</span>
                <div class="p-2 bg-white/30 rounded-lg text-yellow-900 group-hover:bg-white/50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
            </div>
        </div>

        <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500 flex flex-col justify-between transition-colors duration-200 hover:bg-orange-50 cursor-pointer group">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider group-hover:text-orange-600">Da Validare</span>
            <div class="flex justify-between items-end mt-2">
                <span class="text-3xl font-bold text-gray-900 font-heading group-hover:text-orange-700">{{ globalStats.da_validare }}</span>
                <div class="p-2 bg-orange-50 rounded-lg text-orange-500 group-hover:bg-orange-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </div>
            </div>
        </div>

        <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500 flex flex-col justify-between transition-colors duration-200 hover:bg-purple-50 cursor-pointer group">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider group-hover:text-purple-600">Nuovi Ordini</span>
            <div class="flex justify-between items-end mt-2">
                <span class="text-3xl font-bold text-gray-900 font-heading group-hover:text-purple-700">{{ globalStats.richieste_ord }}</span>
                <div class="p-2 bg-purple-50 rounded-lg text-purple-500 group-hover:bg-purple-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" /></svg>
                </div>
            </div>
        </div>

        <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-600 flex flex-col justify-between transition-colors duration-200 hover:bg-green-50 cursor-pointer group">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider group-hover:text-green-700">In Produzione</span>
            <div class="flex justify-between items-end mt-2">
                <span class="text-3xl font-bold text-gray-900 font-heading group-hover:text-green-800">{{ globalStats.in_produzione }}</span>
                <div class="p-2 bg-green-50 rounded-lg text-green-600 group-hover:bg-green-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
            </div>
        </div>

      </div>

      <div v-if="loading && listaPreventivi.length === 0" class="text-center py-20 text-gray-400">
        Caricamento dati...
      </div>

      <div v-else class="space-y-4">
        
        <div 
          v-for="gruppo in clientiRaggruppati" 
          :key="gruppo.nome"
          class="bg-white rounded-xl shadow-sm border transition-all overflow-hidden"
          :class="gruppo.priorita > 0 ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'"
        >
          <div 
            @click="toggleCliente(gruppo.nome)"
            class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4"
          >
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div 
                    class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm shrink-0 font-heading"
                    :class="gruppo.priorita > 0 ? 'bg-orange-500' : 'bg-gray-800'"
                >
                    {{ gruppo.nome.charAt(0).toUpperCase() }}
                </div>
                <div>
                    <h2 class="text-lg font-bold text-gray-900 font-heading">{{ gruppo.nome }}</h2>
                    <p class="text-xs text-gray-500 font-medium mt-0.5">Totale: € {{ gruppo.contatori.tot.toFixed(2) }}</p>
                </div>
            </div>

            <div class="flex gap-2 w-full md:w-auto justify-start md:justify-end flex-wrap">
                <div v-if="gruppo.contatori.validare > 0" class="px-2 py-0.5 bg-orange-100 text-orange-800 rounded border border-orange-200 text-[10px] font-bold animate-pulse">
                    {{ gruppo.contatori.validare }} DA VALIDARE
                </div>
                <div v-if="gruppo.contatori.richiedere > 0" class="px-2 py-0.5 bg-purple-100 text-purple-800 rounded border border-purple-200 text-[10px] font-bold">
                    {{ gruppo.contatori.richiedere }} RICHIESTE
                </div>
                <div v-if="gruppo.contatori.firmare > 0" class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 text-[10px] font-bold">
                    {{ gruppo.contatori.firmare }} FIRMA
                </div>
                <div v-if="gruppo.contatori.prod > 0" class="px-2 py-0.5 bg-green-100 text-green-800 rounded border border-green-200 text-[10px] font-bold">
                    {{ gruppo.contatori.prod }} PROD.
                </div>
                <div v-if="gruppo.contatori.bozze > 0" class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200 text-[10px] font-bold">
                    {{ gruppo.contatori.bozze }} BOZZE
                </div>
            </div>

            <div class="text-gray-300 hidden md:block transform transition-transform" :class="clientiEspansi.includes(gruppo.nome) ? 'rotate-180' : ''">
                ▼
            </div>
          </div>

          <div v-if="clientiEspansi.includes(gruppo.nome)" class="border-t border-gray-100 bg-gray-50 p-4 animate-fade-in">
            
            <div v-if="gruppo.preventivi.length === 0" class="text-center text-xs text-gray-400 py-3 italic">
                Questo cliente ha salvato {{ gruppo.contatori.bozze }} bozze ma nessun ordine attivo.
            </div>

            <table v-else class="min-w-full divide-y divide-gray-200 bg-white rounded-lg overflow-hidden shadow-sm">
                <thead class="bg-gray-100 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                    <tr>
                        <th class="px-4 py-3 text-left">Data</th>
                        <th class="px-4 py-3 text-left">Rif. / Codice</th>
                        <th class="px-4 py-3 text-center">Stato</th>
                        <th class="px-4 py-3 text-right">Importo</th>
                        <th class="px-4 py-3 text-right">Azioni</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                    <tr v-for="p in gruppo.preventivi" :key="p.id" class="hover:bg-yellow-50/50 transition-colors">
                        
                        <td class="px-4 py-3 text-xs text-gray-500 font-mono">
                            {{ formatDate(p.dataCreazione?.seconds) }}
                        </td>
                        
                        <td class="px-4 py-3">
                            <div class="font-bold text-gray-800">{{ p.commessa || 'Nessun Rif.' }}</div>
                            <div class="text-xs font-mono text-gray-400">{{ p.codice }}</div>
                        </td>
                        
                        <td class="px-4 py-3 text-center">
                            <span class="px-2 py-1 text-[10px] font-bold rounded border uppercase" :class="getStatusBadge(p.stato)">
                                {{ getStatusLabel(p.stato) }}
                            </span>
                        </td>
                        
                        <td class="px-4 py-3 text-right text-sm font-bold text-gray-900 font-heading">
                            {{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €
                        </td>
                        
                        <td class="px-4 py-3 text-right flex justify-end gap-2 items-center">
                             <button 
                                @click.stop="p.stato === 'RICHIESTA_ORDINE' || p.stato === 'ORDER_REQ' ? gestisciInvioMail(p) : (p.stato === 'ATTESA_FIRMA' || p.stato === 'WAITING_SIGN' ? confermaProduzione(p) : apriEditor(p.codice))" 
                                class="text-xs font-bold px-3 py-1.5 rounded border transition-all shadow-sm hover:shadow hover:brightness-95"
                                :class="getActionButton(p.stato).class"
                             >
                                {{ getActionButton(p.stato).text }}
                             </button>
                        </td>
                    </tr>
                </tbody>
            </table>
          </div>

        </div>

        <div v-if="listaPreventivi.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-400">Nessun preventivo presente nel database.</p>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>