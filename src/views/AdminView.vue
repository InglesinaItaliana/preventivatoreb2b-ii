<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  limit, 
  updateDoc, 
  doc, 
  onSnapshot, 
  where // <--- AGGIUNGI QUESTO
} from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from 'vue-router';
// IMPORT CONFIGURAZIONE CONDIVISA (Modifica richiesta)
import OrderModals from '../components/OrderModals.vue';
import { httpsCallable } from 'firebase/functions'; // Importa functions
import { functions } from '../firebase'; // Assicurati di esportare 'functions' dal tuo firebase.ts
import DdtModal from '../components/DdtModal.vue'; // Importa il nuovo componente
import { STATUS_DETAILS, ACTIVE_STATUSES } from '../types';
import ArchiveModal from '../components/ArchiveModal.vue'; // Importa Modale

// IMPORT ICONE HEROICONS
import {
  PencilIcon,
  CheckCircleIcon,
  ChevronDoubleRightIcon,
  DocumentTextIcon,
  EyeIcon,
  XCircleIcon,
  CogIcon,
  CurrencyEuroIcon,
  ShoppingCartIcon,
  UserIcon,
  CubeIcon,
  TruckIcon,      // NUOVO: Per Spedizioni
  ArchiveBoxIcon  // NUOVO: Per Archivio
} from '@heroicons/vue/24/solid'

const router = useRouter();
const listaPreventivi = ref<any[]>([]);
const anagraficaClienti = ref<Record<string, string>>({});
const loading = ref(true);

const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN' | 'PRODUCTION'>('PRODUCTION');
const selectedOrder = ref<any>(null);
const selectedClientName = ref('');
const showDdtModal = ref(false);

// MAPPA ICONE LOCALE
const iconMap: Record<string, any> = {
  'DRAFT': PencilIcon,
  'PENDING_VAL': DocumentTextIcon,
  'QUOTE_READY': DocumentTextIcon,
  'ORDER_REQ': ShoppingCartIcon,
  'WAITING_FAST': ShoppingCartIcon,
  'WAITING_SIGN': ShoppingCartIcon,
  'SIGNED': ChevronDoubleRightIcon, //ChevronDoubleRightIcon,
  'IN_PRODUZIONE': CogIcon,
  'READY': CubeIcon,
  'DELIVERY': TruckIcon,
  'REJECTED': XCircleIcon
};

// STATO UI
const activeView = ref<'CLIENTI' | 'COMMESSE'>('COMMESSE');
// Aggiornato tipo per includere le nuove viste
const activeCategory = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE' | 'SPEDIZIONI'>('ORDINI');
const filtroPeriodo = ref<'TUTTO' | 'CORRENTE' | 'SCORSO'>('CORRENTE');
const showArchive = ref(false); // Stato per il modale archivio

// Calcolo conteggi
const categoryCounts = computed(() => {
  const counts = { PREVENTIVI: 0, ORDINI: 0, PRODUZIONE: 0, SPEDIZIONI: 0 };
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
    
    // LOGICA AGGIORNATA PER CONTEGGI
    if (['PENDING_VAL', 'QUOTE_READY'].includes(st)) counts.PREVENTIVI++;
    else if (['ORDER_REQ', 'WAITING_SIGN'].includes(st)) counts.ORDINI++;
    else if (['SIGNED', 'IN_PRODUZIONE'].includes(st)) counts.PRODUZIONE++;
    else if (['READY', 'DELIVERY'].includes(st)) counts.SPEDIZIONI++;
  });
  return counts;
});

// Funzione per salvare il numero di colli su Firestore
const saveColli = async (orderId: string, colli: number) => {
    // Assicurati che il valore sia un numero intero positivo, default 1
    const colliValue = Math.max(1, Math.round(Number(colli))); 
    
    // Controlla per NaN (Not a Number)
    if (isNaN(colliValue)) return;
    
    try {
        const orderRef = doc(db, 'preventivi', orderId);
        // Salva nel campo 'colli' del documento
        await updateDoc(orderRef, { colli: colliValue }); 
        console.log(`Colli aggiornati per l'ordine ${orderId}: ${colliValue}`);
    } catch (error) {
        console.error("Errore salvataggio colli:", error);
    }
};

// Funzione chiamata dal click su "CREA DDT" nella Sticky Bar
const avviaCreazioneDdt = () => {
    showDdtModal.value = true;
};

// Funzione chiamata dalla conferma della Modale
const handleCreaDdt = async (datiDdt: any) => {
    try {
        const createDdtFn = httpsCallable(functions, 'creaDdtCumulativo');
        
        // Prepariamo i dati: ci servono gli ID di firestore degli ordini selezionati
        const orderIds = ordiniInSpedizione.value.map(o => o.id);
        
        const response: any = await createDdtFn({
            orderIds: orderIds,
            date: datiDdt.date,
            colli: datiDdt.colli,
            weight: datiDdt.weight
        });

        if (response.data.success) {
            alert(`✅ DDT Creato con successo! ID: ${response.data.fic_id}`);
            annullaSpedizione(); // Pulisce la selezione
            showDdtModal.value = false;
            // Qui potresti ricaricare i dati o aggiornare lo stato locale
        } else {
            throw new Error(response.data.message || 'Errore sconosciuto');
        }

    } catch (e: any) {
        console.error(e);
        alert(`❌ Errore creazione DDT: ${e.message}`);
        showDdtModal.value = false; // Chiudiamo comunque per evitare blocchi, o gestisci il loading dentro la modale
    }
};

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

    // 2. Filtro Categoria (LOGICA AGGIORNATA)
    const st = p.stato || 'DRAFT';
    
    // Preventivi: via DRAFT e REJECTED
    if (activeCategory.value === 'PREVENTIVI') return ['PENDING_VAL', 'QUOTE_READY'].includes(st);
    
    // Ordini: via SIGNED (spostato in produzione)
    if (activeCategory.value === 'ORDINI') return ['ORDER_REQ', 'WAITING_SIGN'].includes(st);
    
    // Produzione: include SIGNED e IN_PRODUZIONE (via READY)
    if (activeCategory.value === 'PRODUZIONE') return ['SIGNED', 'IN_PRODUZIONE'].includes(st);

    // Spedizioni: solo READY e DELIVERY
    if (activeCategory.value === 'SPEDIZIONI') return ['READY', 'DELIVERY'].includes(st);
    
    return true;
  });
});

const clientiEspansi = ref<string[]>([]);
  const statiEspansi = ref<string[]>([]);
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

// --- 2. CARICAMENTO PREVENTIVI (REAL TIME OTTIMIZZATO) ---
const caricaTutti = () => {
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, 'preventivi'), 
    where('stato', 'in', ACTIVE_STATUSES), // <--- FILTRO FONDAMENTALE
    orderBy('dataCreazione', 'desc'), 
    limit(300)
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    // 1. Primo caricamento: carichiamo tutto in massa per velocità
    if (loading.value) {
      listaPreventivi.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loading.value = false;
      return;
    }

    // 2. Aggiornamenti successivi: modifichiamo SOLO ciò che è cambiato
    snapshot.docChanges().forEach((change) => {
      const docData = { id: change.doc.id, ...change.doc.data() };
      
      // Cerchiamo se l'elemento esiste già nella nostra lista locale
      const index = listaPreventivi.value.findIndex(p => p.id === change.doc.id);

      if (change.type === "added") {
        // Se è nuovo, lo aggiungiamo (rispettando l'ordine se possibile, o in cima)
        if (index === -1) {
            // newIndex ci dice dove Firestore lo posizionerebbe in base all'ordinamento
            listaPreventivi.value.splice(change.newIndex, 0, docData);
        }
      }
      
      if (change.type === "modified") {
        if (index !== -1) {
          // TRUCCO PER NON PERDERE IL FOCUS:
          // Invece di sostituire l'oggetto (che distrugge l'input), aggiorniamo le sue proprietà
          Object.assign(listaPreventivi.value[index], docData);
        }
      }
      
      if (change.type === "removed") {
        if (index !== -1) {
          listaPreventivi.value.splice(index, 1);
        }
      }
    });

  }, (error) => {
    console.error("Errore real-time:", error);
    loading.value = false;
  });
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

// Variabile per tracciare l'ID dell'ordine che sta chiedendo conferma "Sì/No"
const idOrdineInConferma = ref<string | null>(null);

// MODIFICATA: Rimuovi l'alert confirm() da qui, ora la conferma è nella UI
const ordinePronto = async (preventivo: any) => {
  // if(!confirm(...)) return; <--- RIMOSSO
  try {
      await updateDoc(doc(db, 'preventivi', preventivo.id), { stato: 'READY' });
      // Aggiorniamo localmente per reattività immediata
      const index = listaPreventivi.value.findIndex(x => x.id === preventivo.id);
      if (index !== -1) listaPreventivi.value[index].stato = 'READY';
  } catch (e) {
      console.error(e);
      alert("Errore aggiornamento");
  }
};

// NUOVA: Gestisce il click sul pulsante principale
const handleClickAzione = (p: any) => {
  // Se è l'azione "ORDINE PRONTO" (stato IN_PRODUZIONE), attiva la modalità conferma
  if (p.stato === 'IN_PRODUZIONE') {
    idOrdineInConferma.value = p.id;
  } else {
    // Per tutti gli altri stati (es. Apri, Vedi DDT) esegue subito l'azione
    getActionData(p).action();
  }
};

// NUOVA: Conferma effettiva (Click su "Sì")
const confermaOrdinePronto = async (p: any) => {
  await ordinePronto(p);
  idOrdineInConferma.value = null; // Reset
};

// --- HIGHLIGHTS ---
const globalStats = computed(() => {
  const stats = { da_validare: 0, richieste_ord: 0, in_produzione: 0, signed : 0, totale_valore_aperto: 0 };
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  listaPreventivi.value.forEach(p => {
    
    if (filtroPeriodo.value !== 'TUTTO' && p.dataCreazione?.seconds) {
      const d = new Date(p.dataCreazione.seconds * 1000);
      if (filtroPeriodo.value === 'CORRENTE') {
        if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return;
      }
      if (filtroPeriodo.value === 'SCORSO') {
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (d.getMonth() !== lastMonthDate.getMonth() || d.getFullYear() !== lastMonthDate.getFullYear()) return;
      }
    }

    const st = p.stato;
    if (st === 'PENDING_VAL') stats.da_validare++;
    if (st === 'ORDER_REQ') stats.richieste_ord++;
    if (st === 'SIGNED') stats.signed++; 
    
    if (['SIGNED', 'IN_PRODUZIONE', 'READY'].includes(st)) {
      stats.totale_valore_aperto += (p.totaleScontato || p.totaleImponibile || p.totale || 0);
    }
  });

  return stats;
});

// --- RAGGRUPPAMENTO PER CLIENTE ---
const clientiRaggruppati = computed(() => {
  const gruppi: Record<string, any> = {};
    preventiviFiltrati.value.forEach(p => {
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

    if (st !== 'DRAFT') {
      gruppi[nomeReale].preventivi.push(p);
      gruppi[nomeReale].totaleValore += (p.totaleScontato || p.totale || 0);
    }
  });

  return Object.values(gruppi)
    .filter((g: any) => g.preventivi.length > 0 || g.conteggi['DRAFT'] > 0)
    .sort((a: any, b: any) => b.priorita - a.priorita);
});

// --- RAGGRUPPAMENTO PER STATO ---
const ordineStati = ['PENDING_VAL', 'QUOTE_READY', 'ORDER_REQ', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'DELIVERY', 'DRAFT', 'REJECTED'];

const preventiviPerStato = computed(() => {
  const gruppi: Record<string, any[]> = {};
  ordineStati.forEach(st => gruppi[st] = []);

  preventiviFiltrati.value.forEach(p => {
    let st = p.stato || 'DRAFT';
    if(st === 'IN_ATTESA') st = 'PENDING_VAL';
    if(st === 'RICHIESTA_ORDINE') st = 'ORDER_REQ';
    if(st === 'ATTESA_FIRMA') st = 'WAITING_SIGN';
    if(st === 'WAITING_FAST') st = 'WAITING_SIGN';

    if (!gruppi[st]) {
      gruppi[st] = [];
    }
    gruppi[st]!.push(p);
  });

  return ordineStati
    .map(key => ({ stato: key, lista: gruppi[key] || [] }))
    .filter(g => g.lista.length > 0);
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
    return { text: 'QUOTA E ACCETTA', class: 'text-orange-500 bg-orange-100 border-orange-200 hover:bg-orange-100 animate-pulse', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
  
  if (st === 'ORDER_REQ') 
    return { text: 'CONTROLLA E ACCETTA', class: 'text-cyan-600 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 animate-pulse', action: () => apriEditor(p.codice), icon: DocumentTextIcon };

  if (st === 'SIGNED')
    return { text: 'AVVIA PRODUZIONE', class: 'text-emerald-500 border-emerald-200 bg-emerald-100  hover:bg-emerald-200', action: () => confermaProduzione(p), icon: CogIcon };
    
  if (st === 'WAITING_SIGN')
    return { text: 'APRI', class: 'border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50', action: () => apriEditor(p.codice), icon: EyeIcon };

  if (st === 'IN_PRODUZIONE')
    return { text: 'ORDINE PRONTO', class: 'text-emerald-500 border-emerald-200 bg-emerald-100  hover:bg-emerald-200', action: () => ordinePronto(p), icon: CubeIcon };
  
  if (st === 'READY')
    return { text: 'APRI', class: 'border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-50', action: () => apriEditor(p.codice), icon: EyeIcon };

    if (st === 'DELIVERY')
    return { 
      text: 'VEDI DDT', 
      class: 'text-emerald-600 bg-emerald-100 border-emerald-200 hover:bg-emerald-200', 
      // Apre il PDF del DDT se disponibile, altrimenti apre l'editor
      action: () => p.fic_ddt_url ? window.open(p.fic_ddt_url, '_blank') : apriEditor(p.codice), 
      icon: DocumentTextIcon 
    };
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
    let st = p.stato || 'DRAFT';
    if (st === 'WAITING_FAST') st = 'WAITING_SIGN'; 

    if (!gruppi[st]) gruppi[st] = [];
    gruppi[st]!.push(p);
  });
  
  return ordineStati
    .filter(st => gruppi[st] && gruppi[st].length > 0)
    .map(st => ({ stato: st, lista: gruppi[st] }));
};

const formatDateShort = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  }).toUpperCase().replace(/\./g, ''); 
};

// --- LOGICA SPEDIZIONE / DDT ---
const spedizioneAttivaCliente = ref<string | null>(null); // Email del cliente selezionato
const ordiniInSpedizione = ref<any[]>([]); // Lista degli oggetti ordine selezionati

// 1. Definiamo PRIMA la funzione di annullamento
const annullaSpedizione = () => {
  spedizioneAttivaCliente.value = null;
  ordiniInSpedizione.value = [];
};

// 2. Helper per lo stile UI (Disabled/Dimmed)
const isOrderDimmed = (p: any) => {
  // Se non c'è nessuna spedizione attiva, nessuno è dimmed
  if (!spedizioneAttivaCliente.value) return false;
  // Se l'ordine non è READY, non ci interessa (o possiamo lasciarlo normale)
  if (p.stato !== 'READY') return true; 
  // Se l'ordine non è del cliente attivo, è dimmed
  return p.clienteEmail !== spedizioneAttivaCliente.value;
};

// 3. Helper per vedere se è selezionato
const isOrderSelected = (p: any) => {
  return spedizioneAttivaCliente.value === p.clienteEmail 
      && p.stato === 'READY' 
      && ordiniInSpedizione.value.some(o => o.id === p.id);
};

// 4. Funzione toggle intelligente (Ora può chiamare annullaSpedizione perché è già definita sopra)
const toggleSpedizione = (preventivo: any) => {
  // Ignora se non è pronto
  if (preventivo.stato !== 'READY') return;

  // CASO 1: Nessuna spedizione attiva -> Attivo questo cliente e seleziono TUTTI i suoi ordini READY
  if (!spedizioneAttivaCliente.value) {
    spedizioneAttivaCliente.value = preventivo.clienteEmail;
    // Riempie l'array con TUTTI gli ordini pronti di questo cliente
    ordiniInSpedizione.value = listaPreventivi.value.filter(p => 
      p.clienteEmail === preventivo.clienteEmail && p.stato === 'READY'
    );
    return;
  }

  // CASO 2: Clicco su un ordine di un ALTRO cliente -> Errore o Ignora
  if (spedizioneAttivaCliente.value !== preventivo.clienteEmail) {
    alert("Puoi creare un DDT solo per un cliente alla volta. Termina o annulla la selezione corrente.");
    return;
  }

  // CASO 3: Clicco su un ordine del cliente GIÀ attivo -> TOGGLE (Aggiungi/Rimuovi singolo)
  const index = ordiniInSpedizione.value.findIndex(o => o.id === preventivo.id);

  if (index !== -1) {
    // A) È già selezionato -> LO RIMUOVO
    ordiniInSpedizione.value.splice(index, 1);
    
    // Se non ci sono più ordini selezionati, annullo la modalità spedizione
    if (ordiniInSpedizione.value.length === 0) {
      annullaSpedizione();
    }
  } else {
    // B) Non è selezionato (ma è del cliente attivo) -> LO AGGIUNGO
    ordiniInSpedizione.value.push(preventivo);
  }
};

onMounted(() => {
  caricaAnagrafica();
  caricaTutti();
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
    <div class="max-w-7xl mx-auto">

      <div class="flex justify-between items-center mb-8">
        <div class="flex items-center gap-4">
          <div>
            <p class="text-lg font-medium text-gray-800 leading-none">Inglesina Italiana Srl</p>
            <h1 class="text-5xl font-bold font-heading text-gray-900">P.O.P.S. Dashboard</h1>
          </div>
        </div>
        <div class="flex items-center gap-3"><br>
          <span class="text-xs text-gray-400 animate-pulse hidden md:block">Live Sync</span>
          <select v-model="filtroPeriodo" class="bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-lg px-3 py-2 outline-none hover:bg-stone-100 focus:border-yellow-400 cursor-pointer shadow-sm">
            <option value="TUTTO">Tutto</option>
            <option value="CORRENTE">Mese Corrente</option>
            <option value="SCORSO">Mese Scorso</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-yellow-100 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-yellow-100">
            <CurrencyEuroIcon class="h-8 w-8 text-yellow-600" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Valore Ordini</div>
            <div class="text-2xl font-bold font-heading text-gray-900">€ {{ globalStats.totale_valore_aperto.toLocaleString('it-IT', {maximumFractionDigits: 0}) }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-orange-100 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-orange-100">
            <DocumentTextIcon class="h-8 w-8 text-orange-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Preventivi da quotare</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.da_validare }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-cyan-100 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-cyan-100">
            <ShoppingCartIcon class="h-8 w-8 text-cyan-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Ordini da accettare</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.richieste_ord }}</div>
          </div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-emerald-100 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-emerald-100">
            <ChevronDoubleRightIcon class="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-400 uppercase">Da mettere in produzione</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.signed }}</div>
          </div>
        </div>
      </div>

      <div class="flex flex-col md:flex-row border-b border-gray-200 mb-6 justify-between items-end gap-4">
        
        <div class="flex overflow-x-auto">
          <button @click="activeCategory = 'PREVENTIVI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap flex items-center gap-2" :class="activeCategory === 'PREVENTIVI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            <DocumentTextIcon class="h-4 w-4" />
            PREVENTIVI
            <span v-if="categoryCounts.PREVENTIVI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PREVENTIVI }}</span>
          </button>
          <button @click="activeCategory = 'ORDINI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap flex items-center gap-2" :class="activeCategory === 'ORDINI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            <ShoppingCartIcon class="h-4 w-4" />
            ORDINI
            <span v-if="categoryCounts.ORDINI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.ORDINI }}</span>
          </button>
          <button @click="activeCategory = 'PRODUZIONE'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap flex items-center gap-2" :class="activeCategory === 'PRODUZIONE' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            <CogIcon class="h-4 w-4" />
            PRODUZIONE
            <span v-if="categoryCounts.PRODUZIONE" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PRODUZIONE }}</span>
          </button>
           <button @click="activeCategory = 'SPEDIZIONI'" class="pb-3 px-6 font-heading font-bold text-sm transition-all relative whitespace-nowrap flex items-center gap-2" :class="activeCategory === 'SPEDIZIONI' ? 'text-gray-900 border-b-4 border-yellow-400' : 'text-gray-400 hover:text-gray-600'">
            <TruckIcon class="h-4 w-4" />
            SPEDIZIONI
            <span v-if="categoryCounts.SPEDIZIONI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.SPEDIZIONI }}</span>
          </button>
        </div>
        <ArchiveModal :show="showArchive" :isAdmin="true" @close="showArchive = false" />

        <button 
          @click="showArchive = true"
          class="fixed bottom-6 left-6 z-40 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-4 shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 group"
          title="Apri Archivio"
        >
          <ArchiveBoxIcon class="h-7 w-7 group-hover:text-yellow-400 transition-colors" />
          <span class="absolute left-full ml-3 bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Archivio
          </span>
        </button>
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
                  <tr v-for="p in statoGruppo.lista" :key="p.id" 
                        class="transition-colors border-b border-gray-50 last:border-0 relative"
                        :class="[
                          isOrderDimmed(p) ? 'opacity-30 grayscale pointer-events-none bg-gray-50' : 'hover:bg-yellow-50',
                          isOrderSelected(p) ? 'bg-blue-50/80' : 'odd:bg-gray-50'
                        ]"
                    >                    
                    <td class="px-4 py-3">
                      <div v-if="p.stato === 'READY'" @click.stop="toggleSpedizione(p)" class="cursor-pointer">
                                <CheckCircleIcon v-if="isOrderSelected(p)" class="h-6 w-6 text-blue-600" />
                                <div v-else class="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-blue-400"></div>
                            </div>
                      <div class="text-xs text-gray-500 mt-1">DATA: {{ formatDate(p.dataCreazione?.seconds) }} • COMMESSA: {{ p.commessa || 'Nessun Rif.' }}</div>
                      <div v-if="p.dataConsegnaPrevista" class="flex items-center gap-1 mt-1 text-emerald-600 font-bold text-[10px] uppercase">
                          <TruckIcon class="h-3 w-3" />
                          <span>Consegna: {{ formatDateShort(p.dataConsegnaPrevista) }}</span>
                      </div>
                      <div v-if="p.sommarioPreventivo">
                        <div v-for="(item, idx) in p.sommarioPreventivo" :key="idx" class="text text-gray-600 font-medium">
                          <span class="font-bold">{{ item.quantitaTotale }} x</span> {{ item.descrizione }} 
                          <span v-if="item.canalino" class="text-gray-400 italic"> • {{ item.canalino }}</span>
                        </div>
                      </div>
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
                <component 
                    :is="getStatusStyling(gruppo.stato).icon" 
                    class="h-8 w-8" 
                    :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]" 
                />

              <span class="text-xl font-bold font-heading text-l uppercase" :class="getStatusStyling(gruppo.stato).badge.split(' ')[1]">
                {{ getStatusLabel(gruppo.stato) }}
              </span>
              
              <span class="px-2 py-0.5 rounded-full text-xs font-bold" :class="getUiConfig(gruppo.stato).darkBadge">
                {{ gruppo.lista?.length || 0 }}
              </span>            
            </div>
            <div class="text-current transform transition-transform" :class="statiEspansi.includes(gruppo.stato) ? 'rotate-180' : ''">▼</div>
          </div>

          <div v-if="statiEspansi.includes(gruppo.stato)" class="border-t border-gray-100 bg-gray-50 p-4 grid gap-3 animate-fade-in">
            <div v-for="p in gruppo.lista" :key="p.id" 
     class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all relative group"
     :class="[
        isOrderDimmed(p) ? 'opacity-40 grayscale pointer-events-none' : 'hover:shadow-md',
        isOrderSelected(p) ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''
     ]">

    <div v-if="p.stato === 'READY'" 
         @click.stop="toggleSpedizione(p)"
         class="absolute -top-2 -right-2 z-20 cursor-pointer transition-transform hover:scale-110">
      <CheckCircleIcon v-if="isOrderSelected(p)" class="h-8 w-8 text-blue-600 bg-white rounded-full shadow-md" />
      <div v-else class="h-8 w-8 rounded-full border border-gray-300 bg-white text-gray-400 flex items-center justify-center shadow-sm hover:border-blue-400 hover:text-blue-500">
        <TruckIcon class="h-4 w-4" />
      </div>
    </div>

    <div class="flex flex-col md:flex-row justify-between items-center gap-4">
       
       <div class="flex items-center gap-4 w-full md:w-auto">
          <div class="h-10 w-10 rounded-full flex items-center justify-center" :class="getStatusStyling(p.stato).iconBg">
            <component :is="getStatusStyling(p.stato).icon" class="h-6 w-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xl font-bold text-gray-900">{{ p.cliente }}</h3>
              <p class="text-xs text-gray-500">• {{ formatDate(p.dataCreazione?.seconds) }}</p>
              <span class="text-xs text-gray-500">• Rif. {{ p.commessa || 'Senza Nome' }}</span>
            </div>
            
            <div v-if="p.dataConsegnaPrevista" class="mt-1 flex items-center gap-1 px-2 py-0.5 bg-emerald-100 border border-emerald-200 rounded text-emerald-800 w-fit">
                <TruckIcon class="h-3 w-3" />
                <span class="text-[10px] font-bold uppercase">{{ formatDateShort(p.dataConsegnaPrevista) }}</span>
            </div>

            <div v-if="p.sommarioPreventivo" class="flex flex-col gap-1 mt-2 items-start">
              <span v-for="(item, idx) in p.sommarioPreventivo" :key="idx" 
                    class="text-[10px] bg-gray-50 px-2 py-1 rounded border text-gray-600">
                <strong>{{ item.quantitaTotale }}x</strong> {{ item.descrizione }}
              </span>
            </div>
          </div>
       </div>

       <div class="flex flex-col items-end gap-2 w-full md:w-auto justify-center">
                  
                  <div class="flex items-center gap-4">
                       <div class="text-right">
                         <div class="text-xl font-bold font-heading text-gray-900">{{ (p.totaleScontato || p.totale || 0).toFixed(2) }} €</div>
                       </div>
                       
                       <button @click.stop="apriEditor(p.codice)" 
                               class="border border-gray-300 text-gray-600 px-3 py-2 rounded p-1.5 font-bold text-xs hover:bg-gray-50 h-[34px] whitespace-nowrap shrink-0"
                               title="Apri l'editor per visualizzare i dettagli">
                           APRI
                       </button>
                  </div>

                  <div class="flex items-end gap-2">
                      
                    <div v-if="p.stato === 'IN_PRODUZIONE'" class="flex flex-col items-start justify-end" @click.stop>
                      <label class="text-[9px] font-bold text-gray-400 uppercase mb-0.5 leading-none">Colli</label>
     
                    <div class="flex items-center bg-gray-50 rounded border border-gray-300 h-[34px] overflow-hidden shadow-sm">
                        
                        <button 
                            @click="() => { if((p.colli || 1) > 1) { p.colli = (p.colli || 1) - 1; saveColli(p.id, p.colli); } }"
                            class="w-8 h-full flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors active:bg-gray-200"
                            title="Diminuisci"
                        >
                            <span class="text-lg font-bold leading-none mb-0.5">−</span>
                        </button>

                        <input
                            type="number"
                            :value="p.colli || 1"
                            @input="event => p.colli = Number((event.target as HTMLInputElement).value)" 
                            @blur="event => saveColli(p.id, Number((event.target as HTMLInputElement).value))" 
                            @keyup.enter="event => saveColli(p.id, Number((event.target as HTMLInputElement).value))" 
                            class="w-10 text-center bg-transparent text-sm font-bold text-gray-900 border-gray-50 appearance-none"
                        />

                        <button 
                            @click="() => { p.colli = (p.colli || 1) + 1; saveColli(p.id, p.colli); }"
                            class="w-8 h-full flex items-center justify-center text-gray-500 hover:text-emerald-600 transition-colors active:bg-gray-200 "
                            title="Aumenta"
                        >
                            <span class="text-lg font-bold leading-none mb-0.5">+</span>
                        </button>

                    </div>
                    </div>

                    <div class="h-[34px] flex items-center">
    
                      <div v-if="idOrdineInConferma === p.id" class="flex gap-1 h-full animate-fade-in">
                          <button 
                              @click.stop="confermaOrdinePronto(p)"
                              class="bg-emerald-100 hover:bg-emerald-200 text-emerald-600 border border-emerald-200 font-bold text-[10px] px-12 rounded shadow-sm transition-colors h-full flex items-center"
                              title="Conferma"
                          >
                              SÌ
                          </button>
                          <button 
                              @click.stop="idOrdineInConferma = null"
                              class="bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 font-bold text-[10px] px-12 rounded shadow-sm transition-colors h-full flex items-center"
                              title="Annulla"
                          >
                              NO
                          </button>
                      </div>

                      <button
                        v-else
                        @click.stop="handleClickAzione(p)"
                        class="text-xs font-bold px-12 py-2 rounded border transition-all shadow-sm hover:shadow whitespace-nowrap flex items-center gap-2 h-full"
                        :class="getActionData(p).class"
                        :disabled="p.stato === 'IN_PRODUZIONE' && !p.colli" 
                      >
                        <component :is="getActionData(p).icon" class="h-4 w-4" />
                        <span>{{ getActionData(p).text }}</span>
                      </button>

                  </div>
                  </div>

              </div>

    </div> </div>
  </div>

        </div>
      </div>

    </div>
  </div>
  <DdtModal 
    :show="showDdtModal"
    :orders="ordiniInSpedizione"
    @close="showDdtModal = false"
    @confirm="handleCreaDdt"
  />
  <OrderModals 
      :show="showModals"
      :mode="modalMode"
      :order="selectedOrder"
      :clientName="selectedClientName"
      @close="showModals = false"
      @confirmProduction="onConfirmProduction"
    />
    <div v-if="spedizioneAttivaCliente" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-bounce-in w-[95%] md:w-auto max-w-[95vw]">
      <div class="bg-gray-900/95 backdrop-blur text-white px-4 py-3 md:px-6 md:py-4 rounded-2xl shadow-2xl flex flex-col md:flex-row items-center gap-3 md:gap-8 border border-gray-700/50 ring-1 ring-white/10 overflow-hidden">
        
        <div class="flex items-center gap-3 w-full md:w-auto overflow-hidden">
          <div class="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/20 shrink-0">
            <TruckIcon class="h-5 w-5 md:h-6 md:w-6 text-white" />
          </div>
          <div class="min-w-0"> <div class="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Spedizione per</div>
            <div class="font-bold text-base md:text-lg leading-none truncate max-w-[150px] md:max-w-[200px]">
              {{ anagraficaClienti[spedizioneAttivaCliente] || spedizioneAttivaCliente }}
            </div>
          </div>
        </div>

        <div class="hidden md:block h-8 w-px bg-gray-700 shrink-0"></div>

        <div class="flex items-center gap-3 shrink-0">
           <span class="text-3xl font-heading font-bold text-white">{{ ordiniInSpedizione.length }}</span>
           <div class="flex flex-col leading-none">
             <span class="text-xs font-bold text-gray-400 uppercase">Ordini</span>
             <span class="text-xs text-gray-500">Pronti</span>
           </div>
        </div>

        <div class="flex gap-2 w-full md:w-auto mt-1 md:mt-0">
          <button @click="annullaSpedizione" class="flex-1 md:flex-none px-4 py-2 md:px-6 md:py-3 rounded-xl text-xs font-bold text-gray-300 hover:bg-gray-800 transition-colors border border-gray-700 whitespace-nowrap">
            ANNULLA
          </button>
          
          <button @click="avviaCreazioneDdt" class="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 md:px-6 md:py-3 rounded-xl font-bold text-sm shadow-xl shadow-blue-900/40 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap">
            <span>CREA DDT</span>
            <ChevronDoubleRightIcon class="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.animate-bounce-in {
  animation: bounceIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes bounceIn {
  0% { opacity: 0; transform: translate(-50%, 100%); }
  100% { opacity: 1; transform: translate(-50%, 0); }
}
</style>