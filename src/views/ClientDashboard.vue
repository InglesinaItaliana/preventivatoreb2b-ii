<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase'; 
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';

const router = useRouter();
const listaMieiPreventivi = ref<any[]>([]);
const loading = ref(true);
const currentUserEmail = ref('');
const clientName = ref(localStorage.getItem('clientName') || 'Cliente');

const caricaDati = async (email: string) => {
  loading.value = true;
  try {
    const q = query(
      collection(db, 'preventivi'), 
      where('clienteEmail', '==', email), 
      orderBy('dataCreazione', 'desc')
    );
    
    const snapshot = await getDocs(q);
    listaMieiPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Errore Dashboard:", e);
    // Fallback
    try {
        const q2 = query(collection(db, 'preventivi'), where('cliente', '==', email), orderBy('dataCreazione', 'desc'));
        const snap2 = await getDocs(q2);
        listaMieiPreventivi.value = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch(ex) {}
  } finally {
    loading.value = false;
  }
};

const confermaOrdine = async (p: any) => {
    const totale = p.totaleScontato || p.totaleImponibile || 0;
    
    // SOTTO 5000 NON CONFERMA DIRETTO MA MANDA RICHIESTA (Come da tue indicazioni)
    if(!confirm(`L'ordine sarà inviato all'amministrazione per la validazione finale.`)) return;
    
    await updateDoc(doc(db, 'preventivi', p.id), { stato: 'ORDER_REQ' });
    p.stato = 'ORDER_REQ';
    alert("🚀 Richiesta inviata.");
};

const vaiAlBuilder = (codice?: string) => {
  if (codice) router.push(`/preventivatore?codice=${codice}`);
  else router.push(`/preventivatore`);
};

const getStatusColor = (stato: string) => {
    if (stato === 'QUOTE_READY') return 'bg-green-100 text-green-700 border-green-200';
    if (stato === 'SIGNED') return 'bg-green-800 text-white border-green-900';
    if (stato === 'PENDING_VAL') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (stato === 'ORDER_REQ') return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-gray-100 text-gray-500 border-gray-200';
};

onMounted(() => {
    onAuthStateChanged(auth, (user) => {
        if (user && user.email) {
            currentUserEmail.value = user.email;
            if (clientName.value === 'Cliente') clientName.value = user.email.split('@')[0];
            caricaDati(user.email);
        } else {
            router.push('/');
        }
    });
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6 font-sans text-gray-700">
    <div class="max-w-5xl mx-auto">
      <div class="flex justify-between items-end mb-8">
        <div class="flex items-center gap-4">
             <img src="/logo.svg" alt="Logo" class="h-10 w-auto" />
             <div>
                 <h1 class="text-2xl font-bold font-heading text-gray-900">Area Riservata</h1>
                 <p class="text-sm text-gray-500">{{ clientName }} ({{ currentUserEmail }})</p>
             </div>
        </div>
        <button @click="vaiAlBuilder()" class="bg-yellow-400 hover:bg-yellow-500 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            NUOVO PREVENTIVO
        </button>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400">Caricamento tuoi ordini...</div>
      
      <div v-else-if="listaMieiPreventivi.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
          <p class="text-gray-500 mb-4">Non hai ancora creato nessun preventivo.</p>
          <button @click="vaiAlBuilder()" class="text-blue-600 font-bold underline">Crea il primo ora</button>
      </div>
      
      <div v-else class="grid gap-4">
        <div v-for="p in listaMieiPreventivi" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">📄</div>
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-lg text-gray-900">{{ p.commessa || 'Senza Nome' }}</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" :class="getStatusColor(p.stato)">{{ p.stato }}</span>
                    </div>
                    <p class="text-xs text-gray-500 font-mono mt-1">Cod: {{ p.codice }} • {{ p.dataCreazione ? new Date(p.dataCreazione.seconds * 1000).toLocaleDateString() : '-' }}</p>
                </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div class="text-right">
                    <div class="text-xl font-bold font-heading text-gray-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                    <div class="text-xs text-gray-400">Totale</div>
                </div>
                <div class="flex gap-2">
                    <button v-if="p.stato === 'QUOTE_READY'" @click="confermaOrdine(p)" class="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold shadow-sm hover:bg-green-700">
                        CONFERMA
                    </button>
                    <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-50">APRI</button>
                </div>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>