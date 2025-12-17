<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc, onSnapshot, deleteField } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth } from '../firebase';
import { useRouter } from 'vue-router';
import { onAuthStateChanged } from 'firebase/auth';
import { ACTIVE_STATUSES } from '../types';
import ArchiveModal from '../components/ArchiveModal.vue';
import { 
  DocumentTextIcon, 
  CheckCircleIcon,
  XCircleIcon, 
  CogIcon, 
  CubeIcon,
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon,
  ShoppingCartIcon, // NUOVA
  TruckIcon,        // NUOVA
  ArchiveBoxIcon    // NUOVA
} from '@heroicons/vue/24/solid';
// IMPORT NUOVO COMPONENTE
import OrderModals from '../components/OrderModals.vue';
const showArchive = ref(false); // Stato modale
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

// AGGIORNATO TIPO ACTIVE TAB
const activeTab = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE' | 'SPEDIZIONI'>('PREVENTIVI');

// --- NUOVE VARIABILI PER IL MODALE RISULTATO (SUCCESS/ERROR) ---
const resultModal = ref({
  show: false,
  title: '',
  message: '',
  type: 'SUCCESS' as 'SUCCESS' | 'ERROR'
});

// Helper per aprire il modale
const openResultModal = (title: string, message: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
  resultModal.value = { show: true, title, message, type };
};
const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN'>('FAST');
const selectedOrder = ref<any>(null);
const showConfirmQuoteModal = ref(false); 
const userInputDate = ref('');
const minDays = ref(14);

const minDateStr = computed(() => {
  const d = new Date();
  d.setDate(d.getDate() + minDays.value);
  return d.toISOString().split('T')[0];
});

const maxDateStr = computed(() => {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
});

// --- LOGICA UPLOAD ALLEGATI ---
const uploadedFiles = ref<{ name: string, url: string }[]>([]);
const isUploading = ref(false);

const handleFileUpload = async (event: any) => {
  const file = event.target.files[0];
  if (!file || !selectedOrder.value) return;

  isUploading.value = true;
  try {
    const storage = getStorage();
    // Salva in: allegati_clienti/ID_COMMESSA/TIMESTAMP_NOME
    const fileRef = storageRef(storage, `allegati_clienti/${selectedOrder.value.id}/${Date.now()}_${file.name}`);
    
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    uploadedFiles.value.push({ name: file.name, url: url });
  } catch (e) {
    console.error("Errore upload:", e);
    openResultModal("Errore", "Impossibile caricare il file.", "ERROR");
  } finally {
    isUploading.value = false;
    event.target.value = ''; // Reset input per poter ricaricare se serve
  }
};

const removeFile = (index: number) => {
  uploadedFiles.value.splice(index, 1);
};

const userDefaultDetraction = ref(50); // Valore base utente (default 50 se manca)
const currentDetraction = ref(50);     // Valore modificabile per l'ordine
const isDetractionLocked = ref(true);  // Stato del lucchetto

const caricaProfilo = async (uid: string) => {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      clientName.value = data.ragioneSociale || data.email;
      localStorage.setItem('clientName', clientName.value);
      
      // AGGIUNTA: Carica detrazione default (fallback a 50%)
      userDefaultDetraction.value = data.detraction_value !== undefined ? data.detraction_value : 50;
    }
  } catch (e) { console.error("Errore profilo", e); }
};

// Helper per determinare la data rilevante in base allo stato
const getEffectiveDate = (p: any) => {
  const st = p.stato || 'DRAFT';
  
  // CASO 1: Preventivi in lavorazione -> Data Modifica (o Creazione se manca)
  if (['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'ORDER_REQ'].includes(st)) {
    return p.dataModifica?.seconds || p.dataCreazione?.seconds || 0;
  }
  
  // CASO 2: Ordini (Inviati/Chiusi) -> Data Invio/Conferma (o Creazione se vecchio)
  return p.dataInvioOrdine?.seconds || p.dataConferma?.seconds || p.dataCreazione?.seconds || 0;
};

const aggiornaVista = () => {
  const mapUnici = new Map();
  // Unisce le due liste (nuovi e vecchi preventivi) rimuovendo i duplicati per ID
  [...docsVecchi, ...docsNuovi].forEach(doc => mapUnici.set(doc.id, doc));

  // Crea l'array e lo ordina usando la nostra logica "intelligente" sulla data
  const arrayOrdinato = Array.from(mapUnici.values()).sort((a: any, b: any) => {
    // Ordine decrescente (dal più recente al più vecchio) basato sulla data effettiva
    return getEffectiveDate(b) - getEffectiveDate(a);
  });

  listaMieiPreventivi.value = arrayOrdinato;
  
  // Se entrambi i listener hanno caricato almeno una volta, togliamo il loading
  if (ready1 && ready2) loading.value = false;
};

const avviaAscoltoDati = (email: string) => {
  loading.value = true;
  ready1 = false; ready2 = false;

  // Listener 1: Nuovi Preventivi (con campo clienteEmail)
  const q1 = query(
      collection(db, 'preventivi'), 
      where('clienteEmail', '==', email),
      where('stato', 'in', ACTIVE_STATUSES) // <--- FILTRO
  );
    unsub1 = onSnapshot(q1, (snap) => {
    docsNuovi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    ready1 = true; aggiornaVista();
  }, () => { ready1 = true; aggiornaVista(); });

  // Listener 2: Vecchi Preventivi (compatibilità, opzionale applicare filtro anche qui se i vecchi hanno lo stato)
  const q2 = query(collection(db, 'preventivi'), where('cliente', '==', email));
  unsub2 = onSnapshot(q2, (snap) => {
    docsVecchi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Filtriamo in memoria per i vecchi docs se non supportano la query composta
    docsVecchi = docsVecchi.filter(d => ACTIVE_STATUSES.includes(d.stato));
    ready2 = true; aggiornaVista();
  }, () => { ready2 = true; aggiornaVista(); });
};

// --- GESTIONE AZIONI ORDINE ---
const gestisciAzioneOrdine = (p: any) => {
  selectedOrder.value = p;
  
  if (p.stato === 'WAITING_SIGN') {
    modalMode.value = 'SIGN';
    showModals.value = true;
  }
};

const openConfirmModal = (p: any) => {
  selectedOrder.value = p;
  userInputDate.value = ''; // Reset
  uploadedFiles.value = [];
  currentDetraction.value = userDefaultDetraction.value;
  isDetractionLocked.value = true;
  showConfirmQuoteModal.value = true;
};

// 1. Callback Conferma FAST
const onConfirmFast = async () => {
  if(!selectedOrder.value) return;
  const user = auth.currentUser; 
  if (!user) return openResultModal("Attenzione", "Utente non loggato. Ricarica la pagina.", "ERROR");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      metodoConferma: 'FAST_TRACK',
      clienteUID: user.uid,
      isReopened: deleteField() // <--- RIMUOVE IL FLAG
    });
    showModals.value = false;
    openResultModal("Ordine Confermato!", "L'ordine è stato accettato con successo ed è pronto per la produzione.", "SUCCESS");
  } catch(e) {
    console.error(e);
    openResultModal("Errore", "Si è verificato un errore durante la conferma.", "ERROR");
  }
};

// 2. Callback Conferma SIGN (Firma caricata)
const onConfirmSign = async (url: string) => {
  if(!selectedOrder.value) return;
  const user = auth.currentUser;
  if (!user) return openResultModal("Attenzione", "Utente non loggato.", "ERROR");

  try {
    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), {
      stato: 'SIGNED',
      dataConferma: serverTimestamp(),
      contrattoFirmatoUrl: url,
      metodoConferma: 'UPLOAD_FIRMA',
      clienteUID: user.uid,
      isReopened: deleteField() // <--- RIMUOVE IL FLAG
    });

    showModals.value = false;
    openResultModal("Documento Caricato!", "Il contratto firmato è stato ricevuto. L'ordine è ora in produzione.", "SUCCESS");
  } catch(e) { 
    console.error(e); 
    openResultModal("Errore", "Impossibile salvare il documento firmato.", "ERROR");
  }
};

// 3. Callback Invio Ordine
const handleFinalOrderConfirmation = async () => {
  if(!selectedOrder.value) return;
  
  // 1. Controllo Data
  if(!userInputDate.value) return openResultModal("Attenzione", "Seleziona una data di consegna desiderata.", "ERROR");
  
  // 2. Controllo Curve / Lavorazioni Speciali (AGGIORNATO)
  // Verifica puntuale sui flag booleani degli elementi del preventivo
  const elementi = selectedOrder.value.elementi || [];
  const hasSpecialProcessing = elementi.some((el: any) => 
    el.tacca === true || 
    el.curva === true || 
    el.nonEquidistanti === true
  );

  // Controlliamo se ci sono allegati NUOVI (appena caricati) o GIÀ PRESENTI (nel DB)
  const hasNewFiles = uploadedFiles.value.length > 0;
  const hasExistingFiles = selectedOrder.value.allegati && selectedOrder.value.allegati.length > 0;

  // Se ci sono lavorazioni speciali MA non c'è nessun file -> BLOCCA
  if (hasSpecialProcessing && !hasNewFiles && !hasExistingFiles) {
    return openResultModal(
      "Allegati Mancanti", 
      "Questo ordine contiene articoli con lavorazioni speciali (Curve, Tacche o Non Equidistanti). È obbligatorio caricare i disegni tecnici prima di confermare.", 
      "ERROR"
    );
  }

  try {
    // Preparazione Payload
    const updatePayload: any = {
      stato: 'ORDER_REQ', 
      dataInvioOrdine: serverTimestamp(),
      dataConsegnaPrevista: userInputDate.value,
    };

    // Se ho caricato NUOVI file, li uniamo a quelli esistenti
    if (hasNewFiles) {
       const oldFiles = selectedOrder.value.allegati || [];
       updatePayload.allegati = [...oldFiles, ...uploadedFiles.value];
    }

    // Salvataggio Detrazione (se modificata)
    if (currentDetraction.value !== userDefaultDetraction.value) {
      updatePayload.order_detraction_value = currentDetraction.value;
    }

    await updateDoc(doc(db, 'preventivi', selectedOrder.value.id), updatePayload);
    
    showConfirmQuoteModal.value = false;
    openResultModal("Richiesta Inviata", "Il preventivo è stato inviato correttamente per l'elaborazione.", "SUCCESS");
  } catch (e) {
    console.error("Errore invio ordine:", e);
    showConfirmQuoteModal.value = false;
    openResultModal("Errore Invio", "C'è stato un problema durante l'invio dell'ordine.", "ERROR");
  }
};

// --- HELPERS ---

const sortByOrder = (list: any[], order: string[]) => {
  return list.sort((a, b) => {
    const statA = a.stato || 'DRAFT';
    const statB = b.stato || 'DRAFT';
    const indexA = order.indexOf(statA);
    const indexB = order.indexOf(statB);
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return 0;
  });
};

// 1. PREVENTIVI (MODIFICATO: DRAFT -> QUOTE_READY -> PENDING_VAL)
const preventiviInCorso = computed(() => {
  const customOrder = ['DRAFT', 'QUOTE_READY', 'PENDING_VAL']; 
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato || 'DRAFT'));
  return sortByOrder([...filtered], customOrder);
});

// 2. ORDINI (MODIFICATO: WAITING_FAST/SIGN -> ORDER_REQ)
const ordiniConfermati = computed(() => {
  const customOrder = ['WAITING_SIGN', 'ORDER_REQ'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 3. PRODUZIONE (MODIFICATO: SIGNED -> IN_PRODUZIONE)
const ordiniInProduzione = computed(() => {
  const customOrder = ['IN_PRODUZIONE','SIGNED'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

// 4. SPEDIZIONI (Solo READY)
const ordiniSpediti = computed(() => {
  const customOrder = ['SHIPPED','DELIVERY', 'READY'];
  const filtered = listaMieiPreventivi.value.filter(p => customOrder.includes(p.stato));
  return sortByOrder([...filtered], customOrder);
});

const vaiAlBuilder = (codice?: string) => {
  const route = codice ? `/preventivatore?codice=${codice}` : '/preventivatore';
  router.push(route);
};

// Helper per aprire link esterni (risolve errore TS su window)
const apriDdt = (url: string) => {
  window.open(url, '_blank');
};

const getStatusStyling = (stato: string) => {
  const styles: Record<string, any> = {
    'DRAFT': { badge: 'bg-amber-400 text-black border-amber-200', icon: DocumentTextIcon, iconBg: 'bg-amber-400 text-black' },
    'PENDING_VAL': { badge: 'bg-stone-200 text-stone-700 border-stone-300', icon: DocumentTextIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'QUOTE_READY': { badge: 'bg-amber-400 text-black border-amber-200', icon: DocumentTextIcon, iconBg: 'bg-amber-400 text-amber-950' },
    'ORDER_REQ': { badge: 'bg-stone-200 text-stone-700 border-stone-300', icon: ShoppingCartIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'WAITING_FAST': { badge: 'bg-amber-400 text-black border-amber-100', icon: ShoppingCartIcon, iconBg: 'bg-amber-400 text-black' },
    'WAITING_SIGN': { badge: 'bg-amber-400 text-black border-amber-100', icon: ShoppingCartIcon, iconBg: 'bg-amber-400 text-black' },
    'SIGNED': { badge: 'bg-stone-200 text-stone-600 border-stone-300', icon: CogIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'IN_PRODUZIONE': { badge: 'bg-amber-400 text-black border-amber-400', icon: CogIcon, iconBg: 'bg-amber-400 text-black' },
    'READY': { badge: 'bg-stone-200 text-stone-600 border-stone-300', icon: CubeIcon, iconBg: 'bg-stone-200 text-stone-600' },
    'DELIVERY': { badge: 'bg-amber-400 text-black border-amber-200', icon: CubeIcon, iconBg: 'bg-amber-400 text-black' },
    'SHIPPED': { badge: 'bg-amber-400 text-black border-amber-200', icon: TruckIcon, iconBg: 'bg-amber-400 text-black' },
    'REJECTED': { badge: 'bg-red-100 text-red-700 border-red-200', icon: XCircleIcon, iconBg: 'bg-red-100 text-red-600' },
  };
  return styles[stato] || styles['DRAFT'];
}

const getStatusLabel = (stato: string) => {
  const map: Record<string, string> = {
    'DRAFT': 'BOZZA', 'PENDING_VAL': 'PREVENTIVO IN ATTESA QUOTAZIONE', 'QUOTE_READY': 'PREVENTIVO VALIDATO',
    'ORDER_REQ': 'ORDINE IN ATTESA DI ACCETTAZIONE', 
    'WAITING_FAST': 'ORDINE DA ACCETTARE', 'WAITING_SIGN': 'ORDINE DA FIRMARE',
    'SIGNED': 'ORDINE PRESO IN CARICO', 'IN_PRODUZIONE': 'ORDINE IN CODA DI PRODUZIONE', 'READY': 'ORDINE PRONTO', 'DELIVERY': 'SPEDIZIONE PROGRAMMATA', 'REJECTED': 'ANNULLATO'
  };
  return map[stato] || stato;
};

// --- FUNZIONE PER FORMATTARE LA DATA (YYYY-MM-DD -> DD-MMM) ---
const formatDateShort = (dateString: string) => {
  if (!dateString) return '-';
  
  // Parso la stringa YYYY-MM-DD in un oggetto Data
  // Aggiungo 'T00:00:00' per evitare problemi di fuso orario che potrebbero 
  // far tornare indietro la data al giorno precedente
  const date = new Date(dateString + 'T00:00:00');
  
  if (isNaN(date.getTime())) return dateString; // Fallback se non valida

  // Formatto nel formato italiano DD-MMM, rimuovo i punti e metto in maiuscolo.
  // Es: 10/ott. -> 10 OTT
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  }).toUpperCase().replace(/\./g, ''); 
};

onMounted(async() => {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
      currentUserEmail.value = user.email;
      if (clientName.value === 'Cliente') clientName.value = user.email?.split('@')[0] || 'Utente';
      caricaProfilo(user.uid);
      avviaAscoltoDati(user.email);
    } else { router.push('/'); }
  });
  try {
    const s = await getDoc(doc(db, 'settings', 'general'));
    if (s.exists()) minDays.value = s.data().minProcessingDays || 14;
  } catch(e) { console.error(e); }
});
onUnmounted(() => { if (unsub1) unsub1(); if (unsub2) unsub2(); });
</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans">
    <div class="max-w-5xl mx-auto">

      <div class="flex flex-col md:flex-row justify-between items-start mb-12 gap-4">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">{{ clientName }}</p>
            <div class="relative inline-block">
              <h1 class="relative z-10 text-6xl font-bold font-heading text-gray-900">P.O.P.S. Dashboard</h1>
              <div class="absolute bottom-2 left-0 w-full h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
          </div>
          
        </div>

        <div class="flex items-center gap-3 mt-4 md:mt-0">
          <button @click="showArchive = true" class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 px-3 py-2 rounded-full font-bold shadow-sm flex items-center gap-2 transition-transform active:scale-95 text-xs">
              <ArchiveBoxIcon class="h-5 w-5 text-gray-600" /> ARCHIVIO
          </button>
        </div>
      </div>

      <div class="flex overflow-x-auto mb-4 gap-2 p-4 -ml-4">        
        <button @click="activeTab = 'PREVENTIVI'" 
          class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" 
          :class="activeTab === 'PREVENTIVI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
          <DocumentTextIcon class="h-5 w-5" />
          PREVENTIVI
          <span v-if="preventiviInCorso.length" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] border" :class="activeTab === 'PREVENTIVI' ? 'bg-white/20 text-amber-950 border-transparent' : 'bg-gray-100 text-gray-600 border-gray-200'">{{ preventiviInCorso.length }}</span>
        </button>
        
        <button @click="activeTab = 'ORDINI'" 
          class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" 
          :class="activeTab === 'ORDINI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
          <ShoppingCartIcon class="h-5 w-5" />
          ORDINI
          <span v-if="ordiniConfermati.length" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] border" :class="activeTab === 'ORDINI' ? 'bg-white/20 text-amber-950 border-transparent' : 'bg-gray-100 text-gray-600 border-gray-200'">{{ ordiniConfermati.length }}</span>
        </button>
        
        <button @click="activeTab = 'PRODUZIONE'" 
          class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" 
          :class="activeTab === 'PRODUZIONE' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
          <CogIcon class="h-5 w-5" />
          PRODUZIONE
          <span v-if="ordiniInProduzione.length" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] border" :class="activeTab === 'PRODUZIONE' ? 'bg-white/20 text-amber-950 border-transparent' : 'bg-gray-100 text-gray-600 border-gray-200'">{{ ordiniInProduzione.length }}</span>
        </button>

        <button @click="activeTab = 'SPEDIZIONI'" 
          class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" 
          :class="activeTab === 'SPEDIZIONI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
          <TruckIcon class="h-5 w-5" />
          SPEDIZIONI
          <span v-if="ordiniSpediti.length" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] border" :class="activeTab === 'SPEDIZIONI' ? 'bg-white/20 text-amber-950 border-transparent' : 'bg-gray-100 text-gray-600 border-gray-200'">{{ ordiniSpediti.length }}</span>
        </button>

      </div>

      <div v-if="loading" class="text-center py-10 text-gray-400 animate-pulse">Aggiornamento dati...</div>

      <div v-else>
        
        <div v-if="activeTab === 'PREVENTIVI'" class="grid gap-4">
          <div v-if="preventiviInCorso.length === 0" class="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-300">
            <p class="text-gray-500 mb-4">Non hai preventivi aperti al momento.</p>
            <button @click="vaiAlBuilder()" class="text-amber-950 font-bold underline">Inizia ora</button>
          </div>
          <div v-for="p in preventiviInCorso" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-[2rem] shadow-lg border border-white/80 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">            
          <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0" :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8" />
              </div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div class="mt-2 flex flex-col items-start gap-2">
                  
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-2 w-full md:w-auto">
  
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                    :class="getStatusStyling(p.stato).badge">
                {{ getStatusLabel(p.stato) }}
              </span>

              <div class="text-right my-1">
                <div class="text-xl font-bold font-heading text-gray-600">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-gray-600">Importo netto</div>
              </div>

              <div class="flex items-center gap-2">
                  
                  <button
                    v-if="p.stato === 'QUOTE_READY'"
                    @click="openConfirmModal(p)" 
                    class="text-black bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded-full font-bold text-xs shadow-sm flex justify-center items-center gap-1 animate-pulse transition-transform active:scale-95 whitespace-nowrap"
                  >
                    <CheckCircleIcon class="h-4 w-4" />
                    CONFERMA PREVENTIVO
                  </button>

                  <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-5 py-2 rounded-full font-bold text-xs hover:bg-gray-50 whitespace-nowrap">
                    APRI
                  </button>

              </div>

            </div>
          </div>
        </div>

        <div v-if="activeTab === 'ORDINI'" class="grid gap-4">
          <div v-if="ordiniConfermati.length === 0" class="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in attesa.</p>
          </div>
          <div v-for="p in ordiniConfermati" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-[2rem] shadow-lg border border-white/80 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
                bg-opacity-100 backdrop-blur 
                border-2 border-white/20 
                shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
                ring-1 ring-black/5" 
                :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
              </div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div v-if="p.dataConsegnaPrevista" class="mt-2 flex items-center gap-1.5 px-3 py-1 bg-stone-200 border border-stone-300 rounded shadow-sm">
                    <TruckIcon class="h-4 w-4" /> <span class="text-xs font-bold text-black uppercase">Prevista il {{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                </div>
                <div class="mt-2 flex flex-col items-start gap-2">
                  
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-end gap-2 w-full md:w-auto">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                        :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
              </span>
                <div class="text-right my-1">
                  <div class="text-xl font-bold font-heading text-gray-600">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                  <div class="text-xs text-gray-600">Importo netto</div>
                </div>
                <div class="flex items-center gap-2">
                <button
                v-if="['WAITING_SIGN', 'WAITING_FAST'].includes(p.stato)"
                @click="gestisciAzioneOrdine(p)"
                class="w-full text-amber-950 bg-amber-400 hover:bg-amber-300 px-12 py-2 rounded-full font-bold text-xs shadow-sm flex justify-center items-center gap-2 animate-pulse transition-transform active:scale-95"
              >
                <CheckCircleIcon class="h-5 w-5" />
                {{ p.stato === 'WAITING_FAST' ? 'ACCETTA ORDINE' : 'FIRMA ORDINE' }}
              </button>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-full font-bold text-xs hover:bg-gray-50 h-full">
                  APRI
                </button>
              </div>

            </div>
          </div>
        </div>

        <div v-if="activeTab === 'PRODUZIONE'" class="grid gap-4">
          <div v-if="ordiniInProduzione.length === 0" class="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-300">
            <p class="text-gray-500">Nessun ordine in produzione.</p>
          </div>
          <div v-else v-for="p in ordiniInProduzione" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-[2rem] shadow-lg border border-white/80 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 backdrop-blur"
                  :class="getStatusStyling(p.stato).iconBg">
                <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
              </div>    
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div v-if="p.dataConsegnaPrevista" class="mt-2 flex items-center gap-1.5 px-3 py-1 bg-stone-200 border border-stone-300 rounded shadow-sm">
                  <TruckIcon class="h-4 w-4" /> <span class="text-xs font-bold text-black uppercase">Prevista il {{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                </div>
                <div class="mt-2 flex flex-col items-start gap-2">
                  
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end gap-2 w-full md:w-auto">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                :class="getStatusStyling(p.stato).badge">
                {{ getStatusLabel(p.stato) }}
              </span>
              <div class="text-right my-1">
                <div class="text-xl font-bold font-heading text-gray-600">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                <div class="text-xs text-gray-600">Importo netto</div>
              </div>
              <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-full font-bold text-xs hover:bg-gray-50">APRI</button>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'SPEDIZIONI'" class="grid gap-4">
          <div v-if="ordiniSpediti.length === 0" class="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-300">
            <p class="text-gray-500">Nessuna spedizione pronta.</p>
          </div>
          <div v-else v-for="p in ordiniSpediti" :key="p.id" 
          class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-[2rem] shadow-lg border border-white/80 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-14 w-14 rounded-full flex items-center justify-center shrink-0 
            bg-opacity-100 backdrop-blur 
            border-2 border-white/20 
            shadow-[inset_0_0_15px_rgba(255,255,255,0.1)] 
            ring-1 ring-black/5" 
     :class="getStatusStyling(p.stato).iconBg">
  <component :is="getStatusStyling(p.stato).icon" class="w-8 h-8 drop-shadow-sm" />
</div>
              <div class="flex flex-col items-start">
                <h3 class="font-bold text-xl text-gray-900 leading-tight">{{ p.commessa || 'Senza Nome' }}</h3>
                <div v-if="p.dataConsegnaPrevista" class="mt-2 flex items-center gap-1.5 px-3 py-1 bg-stone-200 border border-stone-300 rounded shadow-sm">
                  <TruckIcon class="h-4 w-4" /> <span class="text-xs font-bold text-black uppercase">Prevista il {{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                </div>
                <div v-if="p.stato === 'SHIPPED'" class="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 w-full max-w-sm">
                  <div class="flex items-center gap-2 text-blue-800 font-bold text-xs uppercase mb-1">
                    <TruckIcon class="h-4 w-4" />
                    <span>Spedito con {{ p.corriere || 'Corriere' }}</span>
                  </div>
                  <div v-if="p.trackingCode" class="text-xs text-blue-600 font-mono select-all">
                    Tracking: {{ p.trackingCode }}
                  </div>
                </div>
                <div class="mt-2 flex flex-col items-start gap-2">
                  
                  <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1">
                    <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                          class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                      <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-2 flex flex-col items-start gap-2">
            </div>
            <div class="flex flex-col items-end gap-2 w-full md:w-auto">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" 
                    :class="getStatusStyling(p.stato).badge">
                    {{ getStatusLabel(p.stato) }}
                </span>                
                <div class="text-right my-1">
                  <div class="text-xl font-bold font-heading text-gray-600">{{ (p.totaleScontato || p.totaleImponibile || 0).toFixed(2) }} €</div>
                  <div class="text-xs text-gray-600">Importo netto</div>
                </div>
                <div class="flex items-center gap-2">
                <button 
                  v-if="p.stato === 'DELIVERY' && p.fic_ddt_url"
                  @click="apriDdt(p.fic_ddt_url)"
                  class="w-full text-amber-950 bg-amber-400 hover:bg-amber-300 px-12 py-2 rounded-full font-bold text-xs shadow-sm flex justify-center items-center gap-2 transition-transform active:scale-95"
                  >
                  <DocumentTextIcon class="h-5 w-5" />
                  VEDI DDT
                </button>
                <button @click="vaiAlBuilder(p.codice)" class="border border-gray-300 text-gray-600 px-4 py-2 rounded-full font-bold text-xs hover:bg-gray-50">APRI</button>
              </div>             
            </div>
          </div>
        </div>

      </div>

      <OrderModals 
        :show="showModals"
        :mode="modalMode"
        :order="selectedOrder"
        :clientName="clientName"
        @close="showModals = false"
        @confirmFast="onConfirmFast"
        @confirmSign="onConfirmSign"
        @error="(msg) => openResultModal('Attenzione', msg, 'ERROR')" 
      />

    </div>
  </div>
  <div v-if="showConfirmQuoteModal" class="fixed inset-0 z-[100] overflow-y-auto bg-gray-900/50 backdrop-blur-sm transition-opacity duration-300">
    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-100 p-6">
        
        <div class="flex items-center gap-3 mb-4 border-b pb-3">
          <CheckCircleIcon class="h-8 w-8 text-amber-950" />
          <h3 class="text-xl font-bold text-gray-900">Conferma Invio Ordine</h3>
        </div>

        <p class="text-gray-700 mb-6">
          Stai per confermare il preventivo <span class="font-bold">{{ selectedOrder?.commessa || selectedOrder?.codice }}</span> e inviarlo come ordine.        <br>
          Importo Netto: <span class="font-bold text-stone-600">{{ (selectedOrder?.totaleScontato || selectedOrder?.totaleImponibile || 0).toFixed(2) }} €</span>
        </p>
        <div class="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-100">
          <label class="block text-xs font-bold text-amber-800 uppercase mb-2">Data Consegna Desiderata *</label>
          <input 
            type="date" 
            v-model="userInputDate" 
            :min="minDateStr" 
            :max="maxDateStr"
            class="w-full bg-white border border-amber-200 rounded-lg p-3 text-gray-800 font-bold outline-none focus:ring-2 focus:ring-amber-400"
          >
          <p class="text-[10px] text-amber-700 mt-2 leading-tight">
            Seleziona una data a partire da {{ minDays }} giorni da oggi. L'azienda farà il possibile per rispettarla.
          </p>
        </div>
        <div class="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Detrazione normale</label>
            <p class="text-[10px] text-gray-500">Clicca sul lucchetto se vuoi modificarla per questa commessa</p>
          </div>
          
          <div class="flex items-center gap-3">
            <div class="relative">
              <input 
                type="number" 
                v-model="currentDetraction" 
                :disabled="isDetractionLocked"
                class="w-20 text-center font-bold text-lg border rounded-lg py-2 outline-none transition-colors"
                :class="isDetractionLocked ? 'bg-gray-100 text-gray-500 border-transparent' : 'bg-white text-amber-900 border-amber-300 ring-2 ring-amber-100'"
              >
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400"></span>
            </div>

            <button 
              @click="isDetractionLocked = !isDetractionLocked"
              class="p-2 rounded-full transition-colors"
              :class="isDetractionLocked ? 'bg-gray-100 text-gray-400 hover:bg-gray-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'"
              title="Modifica Detrazione"
            >
              <LockClosedIcon v-if="isDetractionLocked" class="w-5 h-5" />
              <LockOpenIcon v-else class="w-5 h-5" />
            </button>
          </div>
        </div>
        <div class="mb-6 p-4 rounded-xl border border-gray-200 bg-gray-50">
          <label class="block text-xs font-bold text-gray-700 uppercase mb-2">Allegati Tecnici (Disegni, Sagome, ecc.)</label>
          
          <div class="flex items-center gap-2 mb-3">
            <input 
              type="file" 
              @change="handleFileUpload" 
              :disabled="isUploading"
              class="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-xs file:font-semibold
                file:bg-amber-50 file:text-amber-700
                hover:file:bg-amber-100 cursor-pointer"
            />
            <span v-if="isUploading" class="text-xs text-amber-600 font-bold animate-pulse">Caricamento...</span>
          </div>

          <div v-if="uploadedFiles.length > 0" class="flex flex-col gap-2">
            <div v-for="(file, index) in uploadedFiles" :key="index" class="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-xs shadow-sm">
              <div class="flex items-center gap-2 overflow-hidden">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
                </svg>
                <span class="truncate font-medium text-gray-700">{{ file.name }}</span>
              </div>
              <button @click="removeFile(index)" class="text-gray-400 hover:text-red-500 transition-colors p-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          <p class="text-[10px] text-gray-500 mt-2 italic">
            * Obbligatorio allegare disegni per lavorazioni curve o fuori squadro.
          </p>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button
            @click="showConfirmQuoteModal = false"
            class="px-4 py-2 rounded-full text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium"
          >
            Annulla
          </button>
          <button
            @click="handleFinalOrderConfirmation"
            :disabled="!userInputDate"
            class="px-4 py-2 rounded-full text-amber-950 bg-amber-400 hover:bg-amber-300 font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sì, Conferma e Invia
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="resultModal.show" class="fixed inset-0 z-[9999] overflow-y-auto bg-gray-900/50 backdrop-blur-sm transition-opacity duration-300 flex items-center justify-center p-4">
    <div class="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full transform transition-all scale-100 p-6 text-center animate-in fade-in zoom-in duration-200">
      
      <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-4"
          :class="resultModal.type === 'SUCCESS' ? 'bg-amber-400' : 'bg-red-100'">
        <CheckCircleIcon v-if="resultModal.type === 'SUCCESS'" class="h-10 w-10 text-amber-950" />
        <ExclamationTriangleIcon v-else class="h-10 w-10 text-red-600" />
      </div>

      <h3 class="text-xl font-bold text-gray-900 mb-2">{{ resultModal.title }}</h3>
      <p class="text-gray-500 mb-6">{{ resultModal.message }}</p>

      <button 
        @click="resultModal.show = false" 
        class="w-full py-2.5 rounded-full font-bold text-white shadow-md transition-transform active:scale-95 outline-none focus:ring-2 focus:ring-offset-2"
        :class="resultModal.type === 'SUCCESS' ? 'bg-amber-400 hover:bg-amber-300 focus:ring-amber-500' : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'"
      >
        Ho capito
      </button>
    </div>
  </div>
  <ArchiveModal :show="showArchive" :clientEmail="currentUserEmail" @close="showArchive = false" />
</template>