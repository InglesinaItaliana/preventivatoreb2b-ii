<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import { jsPDF } from "jspdf";
import {
  PencilIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  ClockIcon,
  XCircleIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  PlusIcon,
  CubeIcon // NUOVA ICONA READY
} from '@heroicons/vue/24/solid';

const router = useRouter();
const listaMieiPreventivi = ref<any[]>([]);
const loading = ref(true);
const currentUserEmail = ref('');
const clientName = ref(localStorage.getItem('clientName') || 'Cliente');

// Variabili Real-Time
let unsub1: null | (() => void) = null;
let unsub2: null | (() => void) = null;
let docsVecchi: any[] = [];
let docsNuovi: any[] = [];
let ready1 = false;
let ready2 = false;

// Stato UI
const activeTab = ref<'PREVENTIVI' | 'ORDINI'>('PREVENTIVI');

// Variabili Modali
const showContractModal = ref(false); // Modale Upload (Esistente)
const showLegalModal = ref(false);    // Modale Fast Track (Nuova)
const selectedOrder = ref<any>(null);
const isUploading = ref(false);
const uploadedContractUrl = ref('');

// Variabili Checkbox Fast Track
const legalCheck1 = ref(false);
const legalCheck2 = ref(false);
const isConfirming = ref(false);

// --- 1. GESTIONE DATI & PROFILO ---

const caricaProfilo = async (uid: string) => {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      clientName.value = data.ragioneSociale || data.email;
      localStorage.setItem('clientName', clientName.value);
    }
  } catch (e) { console.error("Errore profilo", e); }
};

const aggiornaVista = () => {
  const mapUnici = new Map();
  [...docsVecchi, ...docsNuovi].forEach(doc => mapUnici.set(doc.id, doc));

  const arrayOrdinato = Array.from(mapUnici.values()).sort((a: any, b: any) => {
    const timeA = a.dataCreazione?.seconds || 0;
    const timeB = b.dataCreazione?.seconds || 0;
    return timeB - timeA;
  });

  listaMieiPreventivi.value = arrayOrdinato;
  if (ready1 && ready2) loading.value = false;
};

const avviaAscoltoDati = (email: string) => {
  loading.value = true;
  ready1 = false; ready2 = false;

  // Listener 1: Nuovi Preventivi (con campo clienteEmail)
  const q1 = query(collection(db, 'preventivi'), where('clienteEmail', '==', email));
  unsub1 = onSnapshot(q1, (snap) => {
    docsNuovi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    ready1 = true; aggiornaVista();
  }, () => { ready1 = true; aggiornaVista(); });

  // Listener 2: Vecchi Preventivi (compatibilità)
  const q2 = query(collection(db, 'preventivi'), where('cliente', '==', email));
  unsub2 = onSnapshot(q2, (snap) => {
    docsVecchi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    ready2 = true; aggiornaVista();
  }, () => { ready2 = true; aggiornaVista(); });
};

// --- 2. AZIONI ORDINE (LOGICA AGGIORNATA) ---

const gestisciAzioneOrdine = (p: any) => {
  selectedOrder.value = p;

  if (p.stato === 'WAITING_FAST') {
    // Apre Modale Checkbox (Fast Track)
    legalCheck1.value = false;
    legalCheck2.value = false;
    showLegalModal.value = true;
  } 
  else if (p.stato === 'WAITING_SIGN') {
    // Apre Modale Upload (Firma)
    uploadedContractUrl.value = '';
    showContractModal.value = true;
  }
};

// CONFERMA FAST TRACK
const confermaOrdineFast = async () => {
  if (!legalCheck1.value || !legalCheck2.value) return alert("Devi accettare tutte le condizioni per procedere.");
  
  isConfirming.value = true;
  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      metodoConferma: 'FAST_TRACK'
    });
    alert("✅ Ordine Confermato! In attesa di messa in produzione.");
    showLegalModal.value = false;
  } catch(e) {
    console.error(e);
    alert("Errore durante la conferma.");
  } finally {
    isConfirming.value = false;
  }
};

// CONFERMA UPLOAD (Firma)
const chiudiOrdineUpload = async (id: string, urlContratto: string) => {
  await updateDoc(doc(db, 'preventivi', id), {
    stato: 'SIGNED',
    dataConferma: serverTimestamp(),
    contrattoFirmatoUrl: urlContratto,
    metodoConferma: 'UPLOAD_FIRMA'
  });
  alert( "✅ Ordine Confermato e inviato in produzione!" );
  showContractModal.value = false;
};

// --- 3. FUNZIONI PDF & UPLOAD ---

const generaPDFContratto = () => {
  const doc = new jsPDF();
  const p = selectedOrder.value;
  const totale = p.totaleScontato || p.totaleImponibile || 0;

  doc.setFontSize(20); doc.text("CONTRATTO DI FORNITURA", 20, 20);
  doc.setFontSize(12); doc.text(`Rif. Ordine: ${p.codice}`, 20, 30);
  doc.text(`Cliente: ${clientName.value}`, 20, 40);
  doc.text(`Commessa: ${p.commessa}`, 20, 50);

  doc.line(20, 60, 190, 60);
  doc.text("Dettaglio Articoli:", 20, 70);

  let y = 80;
  p.elementi.slice(0, 15).forEach((el: any) => {
    doc.text(`- ${el.quantita}x ${el.descrizioneCompleta} (${el.base_mm}x${el.altezza_mm})`, 20, y);
    y += 8;
  });

  doc.setFontSize(14);
  doc.text(`TOTALE: ${totale.toFixed(2)} €`, 140, y + 10);

  doc.setFontSize(10);
  doc.text("Firma per accettazione:", 20, 250);
  doc.line(20, 265, 100, 265);

  doc.save(`Contratto_${p.codice}.pdf`);
};

const uploadContratto = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;

  isUploading.value = true;
  try {
    const file = files[0];
    const path = `contratti_firmati/${selectedOrder.value.codice}_${file.name}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    uploadedContractUrl.value = await getDownloadURL(fileRef);
  } catch (e) { alert("Errore caricamento."); console.error(e); }
  finally { isUploading.value = false; }
};

// --- 4. FILTRI E HELPERS ---

const preventiviInCorso = computed(() =>
  listaMieiPreventivi.value.filter(p => ['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'WAITING_SIGN', 'WAITING_FAST', 'ORDER_REQ', 'REJECTED'].includes(p.stato || 'DRAFT'))
);

const ordiniConfermati = computed(() =>
  listaMieiPreventivi.value.filter(p => ['SIGNED', 'IN_PRODUZIONE', 'READY'].includes(p.stato))
);

const vaiAlBuilder = (codice?: string) => router.push(codice ? `/preventivatore?codice=${codice}` : '/preventivatore');

const getStatusStyling = (stato: string) => {
  const styles: Record<string, { badge: string; icon: any; iconBg: string; }> = {
    'DRAFT': { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: PencilIcon, iconBg: 'bg-gray-100 text-gray-500' },
    'PENDING_VAL': { badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: ShieldExclamationIcon, iconBg: 'bg-orange-100 text-orange-600' },
    'QUOTE_READY': { badge: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircleIcon, iconBg: 'bg-green-100 text-green-600' },
    'ORDER_REQ': { badge: 'bg-purple-100 text-purple-700 border-purple-200', icon: PaperAirplaneIcon, iconBg: 'bg-purple-100 text-purple-600' },
    'WAITING_FAST': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ClockIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'WAITING_SIGN': { badge: 'bg-blue-50 text-blue-600 border-blue-100', icon: ClockIcon, iconBg: 'bg-blue-100 text-blue-600' },
    'SIGNED': { badge: 'bg-green-700 text-white border-green-800', icon: CogIcon, iconBg: 'bg-green-200 text-green-800' },
    'IN_PRODUZIONE': { badge: 'bg-green-100 text-green-800 border-green-200', icon: CogIcon, iconBg: 'bg-green-100 text-green-700' },
    'READY': { badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: CubeIcon, iconBg: 'bg-amber-100 text-amber-700' },
    'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
  };
  return styles[stato] || { badge: 'bg-gray-100 text-gray-500 border-gray-200', icon: DocumentTextIcon, iconBg: 'bg-gray-100 text-gray-500' };
}

const getStatusLabel = (stato: string) => {
  const map: Record<string, string> = {
    'DRAFT': 'BOZZA', 'PENDING_VAL': 'IN ATTESA DI VALIDAZIONE', 'QUOTE_READY': 'VALIDATO',
    'ORDER_REQ': 'ORDINE RICHIESTO', 
    'WAITING_FAST': 'DA ACCETTARE', 'WAITING_SIGN': 'DA FIRMARE',
    'SIGNED': 'IN ATTESA DI PRODUZIONE', 'IN_PRODUZIONE': 'IN PRODUZIONE', 
    'READY': 'ORDINE PRONTO', 'REJECTED': 'ANNULLATO'
  };
  return map[stato] || stato || 'BOZZA';
};

// INIT
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
      currentUserEmail.value = user.email;
      if (clientName.value === 'Cliente') clientName.value = user.email.split('@')[0];
      caricaProfilo(user.uid);
      avviaAscoltoDati(user.email);
    } else { router.push('/'); }
  });
});
onUnmounted(() => { if (unsub1) unsub1(); if (unsub2) unsub2(); });
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6 font-sans text-gray-700">
    <div class="max-w-5xl mx-auto">

      <div class="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div class="flex items-center gap-4">
          <div>
            <h1 class="text-2xl font-bold font-heading text-gray-900">Area Riservata</h1>
            <p class="text-lg font-medium text-gray-800 leading-none">{{ clientName }}</p>
            <p class="text-xs text-gray-500 mt-1">{{ currentUserEmail }}</p>
          </div>
        </div>
        <button @click="vaiAlBuilder()" class="bg-yellow-400 hover:bg-yellow-500 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
          <PlusIcon class="h-5 w-5 text-black" />
          NUOVO
        </button>
      </div>

      <div class="flex border-b border-gray-200 mb-6">
        <button @click="activeTab = 'PREVENTIVI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'PREVENTIVI' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'">
          PREVENTIVI IN CORSO
          <span v-if="preventiviInCorso.length" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{{ preventiviInCorso.length }}</span>
          <div v-if="activeTab === 'PREVENTIVI'" class="absolute bottom-0 left-0 w-full h-1 bg-yellow-400 rounded-t-full"></div>
        </button>
        <button @click="activeTab = 'ORDINI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative" :class="activeTab === 'ORDINI' ? 'text-green-800' : 'text-gray-400 hover:text-gray-600'">
          ORDINI & PRODUZIONE
          <span v-if="ordiniConfermati.length" class="ml-2 bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-[10px]">{{ ordiniConfermati.length }}</span>
          <div v-if="activeTab === 'ORDINI'" class="absolute bottom-0 left-0 w-full h-1 bg-green-600 rounded-t-full"></div>
        </button>
      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400 animate-pulse">Aggiornamento dati...</div>

      <div v-else>
        <div v-if="activeTab === 'PREVENTIVI'" class="grid gap-4">
          <div v-if="preventiviInCorso.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500 mb-4">Non hai preventivi aperti al momento.</p>
            <button @click="vaiAlBuilder()" class="text-blue-600 font-bold underline">Inizia ora</button>
          </div>
          <div v-for="p in preventiviInCorso" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-6 h-6" />
              </div>
              <div class="flex flex-col items-start">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-1" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span>
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">Cod: {{ p.codice }}</p>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-gray-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-gray-400">Totale</div>
              </div>
              <div class="flex gap-2">
                
                <button
                  v-if="p.stato === 'WAITING_FAST'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  ACCETTA ORDINE
                </button>

                <button
                  v-else-if="p.stato === 'WAITING_SIGN'"
                  @click="gestisciAzioneOrdine(p)"
                  class="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 animate-pulse"
                >
                  FIRMA ORDINE
                </button>

                <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50">APRI</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'ORDINI'" class="grid gap-4">
          <div v-if="ordiniConfermati.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-else v-for="p in ordiniConfermati" :key="p.id" class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-6 h-6" />
              </div>
              <div class="flex flex-col items-start">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-1" :class="getStatusStyling(p.stato).badge">{{ getStatusLabel(p.stato) }}</span>
                <h3 class="font-bold text-lg text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <p class="text-xs text-gray-500 font-mono mt-0.5">Cod: {{ p.codice }}</p>
              </div>
            </div>
            <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                <div class="text-xl font-bold font-heading text-green-900">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-green-600">Importo Definitivo</div>
              </div>
              <button @click="vaiAlBuilder(p.codice)" class="bg-white border border-green-200 text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-50">VEDI DETTAGLI</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showContractModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in-up">
          <div class="bg-blue-600 p-5 text-white flex justify-between items-center">
            <h2 class="font-bold text-lg">Firma Contratto</h2>
            <button @click="showContractModal = false" class="text-white hover:text-blue-200" >✕</ button>
          </div>
          <div class="p-6 space-y-6">
            <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
              L'amministrazione ha richiesto la firma del contratto per questo ordine.
            </div>

            <div class="flex items-center gap-4">
              <div class="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500">1</div>
              <div class="flex-1"><p class="text-sm font-bold">Scarica il PDF</p></div>
              <button @click="generaPDFContratto" class="text-blue-600 font-bold text-sm underline">Scarica</button>
            </div>

            <div class="flex items-start gap-4">
              <div class="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500">2</div>
              <div class="flex-1">
                <p class="text-sm font-bold mb-2">Carica il file firmato</p>
                <div class="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                  <input type="file" @change="uploadContratto" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                  <span v-if="isUploading" class="text-xs text-gray-500 animate-pulse">Caricamento...</span>
                  <span v-else-if="uploadedContractUrl" class="text-xs text-green-600 font-bold" >✅ File caricato!</ span>
                  <span v-else class="text-xs text-gray-400">Clicca per caricare</span>
                </div>
              </div>
            </div>

            <button
              @click="chiudiOrdineUpload(selectedOrder.id, uploadedContractUrl)"
              :disabled="!uploadedContractUrl"
              class="w-full py-3 rounded-lg font-bold shadow-md transition-all flex justify-center items-center gap-2"
              :class="uploadedContractUrl ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
            >
              INVIA ORDINE FIRMATO
            </button>
          </div>
        </div>
      </div>

      <div v-if="showLegalModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
          <div class="flex items-center gap-3 mb-4 text-blue-600">
            <CheckCircleIcon class="w-8 h-8" />
            <h2 class="font-bold text-lg text-gray-900">Conferma Ordine Veloce</h2>
          </div>
          
          <div class="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 mb-4 border border-gray-200">
            <p>L'ordine <strong>{{ selectedOrder?.codice }}</strong> è pronto per la conferma rapida.</p>
            <p class="font-bold mt-1 text-gray-900">Totale: {{ (selectedOrder?.totaleScontato || 0).toFixed(2) }} €</p>
          </div>

          <div class="space-y-4">
            <label class="flex items-start gap-3 cursor-pointer group select-none">
              <div class="relative flex items-center mt-0.5">
                <input type="checkbox" v-model="legalCheck1" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
                <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <span class="text-sm text-gray-700 group-hover:text-black transition-colors">Dichiaro di accettare l'ordine esattamente come descritto nel riepilogo e confermo le misure inserite.</span>
            </label>
            
            <label class="flex items-start gap-3 cursor-pointer group select-none">
              <div class="relative flex items-center mt-0.5">
                <input type="checkbox" v-model="legalCheck2" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
                <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <span class="text-sm text-gray-700 group-hover:text-black transition-colors">Ho letto e accetto le Condizioni Generali di Vendita e la Privacy Policy aziendale.</span>
            </label>
          </div>

          <div class="flex justify-end gap-3 mt-8 border-t pt-4">
            <button @click="showLegalModal = false" class="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Annulla</button>
            <button 
              @click="confermaOrdineFast" 
              :disabled="!legalCheck1 || !legalCheck2 || isConfirming" 
              class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <span v-if="isConfirming" class="animate-spin">⌛</span>
              {{ isConfirming ? 'Attendere...' : 'CONFERMA DEFINITIVA' }}
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in-up { animation: fadeInUp 0.3s ease-out; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>