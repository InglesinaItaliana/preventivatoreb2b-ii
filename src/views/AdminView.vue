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
  CalculatorIcon,
  DocumentTextIcon,
  XCircleIcon,
  CogIcon,
  ShoppingCartIcon,
  UserIcon,
  CubeIcon,
  TruckIcon,      // NUOVO: Per Spedizioni
  ArchiveBoxIcon  // NUOVO: Per Archivio
} from '@heroicons/vue/24/solid'

// --- TOAST NOTIFICATION ---
const toastMessage = ref('');
const showToast = ref(false);

const showCustomToast = (message: string) => {
  toastMessage.value = message;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
    toastMessage.value = '';
  }, 2500); 
};
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
  'SIGNED': CalculatorIcon, //CalculatorIcon,
  'IN_PRODUZIONE': CogIcon,
  'READY': CubeIcon,
  'DELIVERY': TruckIcon,
  'SHIPPED': TruckIcon, // Icona Camion per spedito
  'REJECTED': XCircleIcon
};

// STATO UI
const activeView = ref<'CLIENTI' | 'COMMESSE'>('COMMESSE');
// Aggiornato tipo per includere le nuove viste
const activeCategory = ref<'PREVENTIVI' | 'ORDINI' | 'PRODUZIONE' | 'SPEDIZIONI'>('ORDINI');
const filtroPeriodo = ref<'TUTTO' | 'CORRENTE' | 'SCORSO'>('TUTTO');
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
    else if (['READY', 'DELIVERY', 'SHIPPED'].includes(st)) counts.SPEDIZIONI++;
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
            weight: datiDdt.weight,
            // NUOVI CAMPI
            tipoTrasporto: datiDdt.tipoTrasporto,
            corriere: datiDdt.corriere,
            tracking: datiDdt.tracking
        });

        if (response.data.success) {
          showCustomToast(`✅ DDT Creato con successo! ID: ${response.data.fic_id}`);
            annullaSpedizione(); // Pulisce la selezione
            showDdtModal.value = false;
            // Qui potresti ricaricare i dati o aggiornare lo stato locale
        } else {
            throw new Error(response.data.message || 'Errore sconosciuto');
        }

    } catch (e: any) {
        console.error(e);
        showCustomToast(`❌ Errore creazione DDT: ${e.message}`);
        showDdtModal.value = false; // Chiudiamo comunque per evitare blocchi, o gestisci il loading dentro la modale
    }
};

// Helper per determinare la data rilevante in base allo stato
const getEffectiveDate = (p: any) => {
  const st = p.stato || 'DRAFT';
  
  // GRUPPO 1: Data Modifica
  // PENDING_VAL | QUOTE_READY | DRAFT | ORDER_REQ
  if (['DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'ORDER_REQ'].includes(st)) {
    return p.dataModifica?.seconds || p.dataCreazione?.seconds || 0;
  }
  
  // GRUPPO 2: Data Consegna Prevista
  // WAITING_SIGN | SIGNED | IN_PRODUZIONE | READY | DELIVERY
  if (['WAITING_SIGN', 'WAITING_FAST', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'DELIVERY'].includes(st)) {
    if (p.dataConsegnaPrevista) {
      // Convertiamo la stringa "YYYY-MM-DD" in timestamp per mantenere coerenza con il resto
      return new Date(p.dataConsegnaPrevista).getTime() / 1000;
    }
    // Fallback se manca la data consegna: Data Conferma o Invio
    return p.dataInvioOrdine?.seconds || p.dataConferma?.seconds || 0;
  }

  return p.dataCreazione?.seconds || 0;
};

// --- NUOVI HELPER PER IL CERCHIO DATA ---
const getDay = (seconds: number) => {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.getDate();
};

// Estrae il Mese (es. OTT) dal timestamp
const getMonth = (seconds: number) => {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase().replace('.', '');
};

const preventiviFiltrati = computed(() => {
  const now = new Date();
  
  // 1. Filtriamo la lista originale
  const filtered = listaPreventivi.value.filter(p => {
    // A. Filtro Data (MODIFICATO: Usa getEffectiveDate)
    if (filtroPeriodo.value !== 'TUTTO') {
      const seconds = getEffectiveDate(p); // <--- Usa la data "logica"
      if (seconds) {
        const d = new Date(seconds * 1000);
        if (filtroPeriodo.value === 'CORRENTE' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
        if (filtroPeriodo.value === 'SCORSO') {
          const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (d.getMonth() !== last.getMonth() || d.getFullYear() !== last.getFullYear()) return false;
        }
      }
    }

    // B. Filtro Categoria (Invariato)
    const st = p.stato || 'DRAFT';
    if (activeCategory.value === 'PREVENTIVI') return ['PENDING_VAL', 'QUOTE_READY'].includes(st);
    if (activeCategory.value === 'ORDINI') return ['ORDER_REQ', 'WAITING_SIGN'].includes(st);
    if (activeCategory.value === 'PRODUZIONE') return ['SIGNED', 'IN_PRODUZIONE'].includes(st);
    if (activeCategory.value === 'SPEDIZIONI') return ['READY', 'DELIVERY', 'SHIPPED'].includes(st);
    
    return true;
  });

  // 2. Ordinamento (MODIFICATO: Usa getEffectiveDate)
  return filtered.sort((b, a) => {
    return getEffectiveDate(b) - getEffectiveDate(a); // Decrescente
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
    showCustomToast("✅ Ordine inviato in produzione!");
  } catch (e) { console.error(e); showCustomToast("Errore aggiornamento stato."); }
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
      showCustomToast("Errore aggiornamento.");
  }
};

// NUOVA: Gestisce il click sul pulsante principale
const handleClickAzione = (p: any) => {
  // Se è l'azione "ORDINE PRONTO" (stato IN_PRODUZIONE), attiva la modalità conferma
  if (p.stato === 'IN_PRODUZIONE') {
    idOrdineInConferma.value = p.id;
  } else {
    // Per tutti gli altri stati (es. Apri, Vedi DDT) esegue subito l'azione
    getActionData(p)?.action();
  }
};

// NUOVA: Conferma effettiva (Click su "Sì")
const confermaOrdinePronto = async (p: any) => {
  await ordinePronto(p);
  idOrdineInConferma.value = null; // Reset
};

// --- HIGHLIGHTS ---
const globalStats = computed(() => {
  const stats = { da_validare: 0, richieste_ord: 0, in_produzione: 0, signed : 0, productisready: 0 };
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
    if (st === 'READY') stats.productisready++; 
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
const ordineStati = ['PENDING_VAL', 'QUOTE_READY', 'ORDER_REQ', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'SHIPPED', 'DELIVERY', 'DRAFT', 'REJECTED'];

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
const apriDdt = (url: string) => {
  window.open(url, '_blank');
};

const getActionData = (p: any) => {
  const st = p.stato;
  
  if (st === 'PENDING_VAL') 
    return { text: 'QUOTA E ACCETTA', class: 'text-amber-950 border-amber-500 bg-amber-400 rounded-full hover:bg-amber-300 animate-pulse', action: () => apriEditor(p.codice), icon: DocumentTextIcon };
  
  if (st === 'ORDER_REQ') 
    return { text: 'CONTROLLA E ACCETTA', class: 'text-amber-950 border-amber-500 bg-amber-400 rounded-full hover:bg-amber-300 animate-pulse', action: () => apriEditor(p.codice), icon: DocumentTextIcon };

  if (st === 'SIGNED')
    return { text: 'AVVIA PRODUZIONE', class: 'text-amber-950 border-amber-500 bg-amber-400 rounded-full hover:bg-amber-300', action: () => confermaProduzione(p), icon: CogIcon };
    
  if (st === 'IN_PRODUZIONE')
    return { text: 'ORDINE PRONTO', class: 'text-amber-950 border-amber-500 bg-amber-400 rounded-full hover:bg-amber-300', action: () => ordinePronto(p), icon: CubeIcon };

  if (st === 'DELIVERY')
    return { 
      text: 'VEDI DDT', 
      class: 'text-amber-950 border-amber-500 bg-amber-400  hover:bg-amber-300 rounded-full', 
      // Apre il PDF del DDT se disponibile, altrimenti apre l'editor
      action: () => p.fic_ddt_url ? window.open(p.fic_ddt_url, '_blank') : apriEditor(p.codice), 
      icon: DocumentTextIcon 
    };
    return null;
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
    showCustomToast("Puoi creare un DDT solo per un cliente alla volta. Termina o annulla la selezione corrente.");
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

// Funzione per raggruppare gli ordini DELIVERY per DDT
const raggruppaPerDdt = (lista: any[]) => {
  const gruppi: Record<string, { id: string, number?: string, items: any[], url?: string, data?: string }> = {};
  
  lista.forEach(p => {
    // Usa l'ID del DDT o un placeholder se mancante
    const id = p.fic_ddt_id ? String(p.fic_ddt_id) : 'Senza DDT';
    
    if (!gruppi[id]) {
      gruppi[id] = { 
        id, 
        number: p.fic_ddt_number,
        items: [], 
        url: p.fic_ddt_url, // URL del PDF (assumiamo sia uguale per tutti nel gruppo)
        data: p.dataConsegnaPrevista 
      };
    }
    gruppi[id].items.push(p);
  });

  // Ordina per ID decrescente (i DDT più recenti in alto)
  return Object.values(gruppi).sort((a, b) => {
      if (a.id === 'Senza DDT') return 1;
      if (b.id === 'Senza DDT') return -1;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
  });
};

const mostraDaQuotare = () => {
  activeCategory.value = 'PREVENTIVI';
  activeView.value = 'COMMESSE'; // Assicura che la vista sia per Stato
  if (!statiEspansi.value.includes('PENDING_VAL')) {
    statiEspansi.value.push('PENDING_VAL');
  }
};

const mostraDaConfermare = () => {
  activeCategory.value = 'ORDINI';
  activeView.value = 'COMMESSE'; // Assicura che la vista sia per Stato
  if (!statiEspansi.value.includes('ORDER_REQ')) {
    statiEspansi.value.push('ORDER_REQ');
  }
};

const mostraDaProdurre = () => {
  activeCategory.value = 'PRODUZIONE';
  activeView.value = 'COMMESSE'; // Assicura che la vista sia per Stato
  if (!statiEspansi.value.includes('SIGNED')) {
    statiEspansi.value.push('SIGNED');
  }
};

const mostraDaSpedire = () => {
  activeCategory.value = 'SPEDIZIONI';
  activeView.value = 'COMMESSE'; // Assicura che la vista sia per Stato
  if (!statiEspansi.value.includes('READY')) {
    statiEspansi.value.push('READY');
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
            <div class="relative inline-block">
              <h1 class="relative z-10 text-6xl font-bold font-heading text-gray-900">P.O.P.S. Dashboard</h1>
              <div class="absolute bottom-2 left-0 w-full h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3"><br>
          <span class="text-xs text-gray-400 animate-pulse hidden md:block">Live Sync</span>
          <button @click="showArchive = true" class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 px-3 py-2 rounded-full font-bold shadow-sm flex items-center gap-2 transition-transform active:scale-95 text-xs">
            <ArchiveBoxIcon class="h-5 w-5 text-gray-600" /> ARCHIVIO
          </button>
          <select v-model="filtroPeriodo" class="bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-full px-3 py-2 outline-none hover:bg-stone-100 focus:border-amber-400 cursor-pointer shadow-sm">
            <option value="TUTTO">Tutto</option>
            <option value="CORRENTE">Mese Corrente</option>
            <option value="SCORSO">Mese Scorso</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div @click="mostraDaQuotare" class="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-amber-400 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-amber-400">
            <DocumentTextIcon class="h-8 w-8 text-amber-950" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Da quotare</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.da_validare }}</div>
          </div>
        </div>
        <div @click="mostraDaConfermare" class="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-amber-400 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-amber-400">
            <ShoppingCartIcon class="h-8 w-8 text-amber-950" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Da accettare</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.richieste_ord }}</div>
          </div>
        </div>
        <div @click="mostraDaProdurre" class="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-amber-400 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-amber-400">
            <CalculatorIcon class="h-8 w-8 text-amber-950" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Da mettere in produzione</div>
            <div class="text-2xl font-bold text-gray-900">{{ globalStats.signed }}</div>
          </div>
        </div>
        <div @click="mostraDaSpedire" class="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-200 flex items-center gap-5 transition-colors hover:bg-amber-400 cursor-pointer">
          <div class="h-14 w-14 rounded-full flex items-center justify-center bg-amber-400">
            <CubeIcon class="h-8 w-8 text-amber-950" />
          </div>
          <div>
            <div class="text-xs font-bold text-gray-500 uppercase">Da mettere in consegna</div>
            <div class="text-2xl font-bold font-heading text-gray-900">{{ globalStats.productisready}}</div>
          </div>
        </div>
      </div>

      <div class="flex flex-col md:flex-row border-gray-200 justify-between items-center gap-4">
        
        <div class="flex overflow-x-auto gap-2 p-4 -ml-4">
          <button @click="activeCategory = 'PREVENTIVI'" class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" :class="activeCategory === 'PREVENTIVI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
            <DocumentTextIcon class="h-4 w-4" />
            PREVENTIVI
            <span v-if="categoryCounts.PREVENTIVI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PREVENTIVI }}</span>
          </button>
          <button @click="activeCategory = 'ORDINI'" class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" :class="activeCategory === 'ORDINI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
            <ShoppingCartIcon class="h-4 w-4" />
            ORDINI
            <span v-if="categoryCounts.ORDINI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.ORDINI }}</span>
          </button>
          <button @click="activeCategory = 'PRODUZIONE'" class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" :class="activeCategory === 'PRODUZIONE' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
            <CogIcon class="h-4 w-4" />
            PRODUZIONE
            <span v-if="categoryCounts.PRODUZIONE" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.PRODUZIONE }}</span>
          </button>
           <button @click="activeCategory = 'SPEDIZIONI'" class="px-6 py-3 rounded-full font-bold text-xl transition-all flex items-center gap-2 whitespace-nowrap active:scale-95" :class="activeCategory === 'SPEDIZIONI' ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-200' : 'bg-white text-gray-500 hover:bg-gray-100'">
            <TruckIcon class="h-4 w-4" />
            SPEDIZIONI
            <span v-if="categoryCounts.SPEDIZIONI" class="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] border">{{ categoryCounts.SPEDIZIONI }}</span>
          </button>
        </div>

        <ArchiveModal :show="showArchive" :isAdmin="true" @close="showArchive = false" />

        <div class="flex items-center gap-2 bg-gray-100 p-1 rounded-[2rem] shrink-0">
          <span class="text-[10px] font-bold text-gray-400 px-2 uppercase">Raggruppa per:</span>
          <button @click="activeView = 'CLIENTI'" class="px-3 py-1 rounded-full text-xs font-bold transition-all" :class="activeView === 'CLIENTI' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Clienti
          </button>
          <button @click="activeView = 'COMMESSE'" class="px-3 py-1 rounded-full text-xs font-bold transition-all" :class="activeView === 'COMMESSE' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'">
            Stato
          </button>
        </div>

      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400">Caricamento...</div>

      <div v-else-if="activeView === 'CLIENTI'" class="space-y-4">
                <div v-for="gruppo in clientiRaggruppati" :key="gruppo.nome" class="bg-white rounded-[2rem] shadow-sm border overflow-hidden" :class="gruppo.priorita > 0 ? 'border-2 border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'">

          <div @click="toggleCliente(gruppo.nome)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm shrink-0 font-heading" :class="gruppo.priorita > 0 ? 'bg-amber-400' : 'bg-gray-800'">
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
                          isOrderDimmed(p) ? 'opacity-30 grayscale pointer-events-none bg-gray-50' : 'hover:bg-amber-50',
                          isOrderSelected(p) ? 'bg-blue-50/80' : 'odd:bg-gray-50'
                        ]"
                    >                    
                    <td class="px-4 py-3">
                      <div v-if="p.stato === 'READY'" @click.stop="toggleSpedizione(p)" class="cursor-pointer">
                                <CheckCircleIcon v-if="isOrderSelected(p)" class="h-6 w-6 text-blue-600" />
                                <div v-else class="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-blue-400"></div>
                            </div>
                      <div class="text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-2">
                        <span>DATA: {{ formatDate(getEffectiveDate(p)) }} • COMMESSA: {{ p.commessa || 'Nessun Rif.' }}</span>
                        <span v-if="p.isReopened" class="text-[9px] px-2 py-0.5 rounded border uppercase font-bold bg-purple-100 text-purple-700 border-purple-200">
                          RIAPERTO
                        </span>
                      </div>
                      <div v-if="p.dataConsegnaPrevista" class="flex items-center gap-1 mt-1 text-amber-950 font-bold text-[10px] uppercase">
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
                        v-if="getActionData(p)"
                        @click.stop="getActionData(p)?.action()"
                        class="text-xs font-bold px-3 py-1.5 rounded border transition-all shadow-sm hover:shadow hover:brightness-95 flex items-center gap-2"
                        :class="getActionData(p)?.class"
                        >
                        <component :is="getActionData(p)?.icon" class="h-4 w-4" />
                        <span>{{ getActionData(p)?.text }}</span>
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
        <div v-for="gruppo in preventiviPerStato" :key="gruppo.stato" class="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">

          <div @click="toggleStato(gruppo.stato)" class="p-5 cursor-pointer hover:bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            
            <div class="flex items-center gap-4 w-full md:w-auto">
              <div class="h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold shadow-sm shrink-0" 
                   :class="getUiConfig(gruppo.stato).darkBadge">
                <component :is="getStatusStyling(gruppo.stato).icon" class="h-6 w-6" />
              </div>
              
              <div>
                <h2 class="text-lg font-bold text-gray-900 font-heading uppercase flex items-center gap-2">
                  {{ getStatusLabel(gruppo.stato) }}
                  <span class="bg-gray-100 text-gray-600 text-xs px-2.5 py-0.5 rounded-full border border-gray-200 font-sans shadow-sm">
                    {{ gruppo.lista.length }}
                  </span>
                </h2>              
              </div>
            </div>

            <div class="text-gray-300 hidden md:block transform transition-transform" :class="statiEspansi.includes(gruppo.stato) ? 'rotate-180' : ''">▼</div>
          </div>

          <div v-if="statiEspansi.includes(gruppo.stato)" class="border-t border-gray-100 bg-gray-50 p-4 animate-fade-in space-y-4">
            
            <template v-if="gruppo.stato === 'DELIVERY'">
              <div v-for="ddt in raggruppaPerDdt(gruppo.lista)" :key="ddt.id" class="mb-6 bg-white rounded-xl border border-gray-300 overflow-hidden shadow-sm">
                
                <div class="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <div class="flex items-center gap-3">
                    <div v-if="ddt.data" class="h-12 w-12 rounded-full flex flex-col items-center justify-center shrink-0 border border-amber-200 shadow-sm overflow-hidden bg-white">
                      <span class="text-lg font-bold leading-none tracking-tighter text-amber-950">
                        {{ new Date(ddt.data + 'T00:00:00').getDate() }}
                      </span>
                      <span class="text-[9px] font-bold uppercase leading-none mt-0.5 text-amber-800">
                        {{ new Date(ddt.data + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short' }).toUpperCase().replace('.', '') }}
                      </span>
                    </div>

                    <div v-else class="h-12 w-12 rounded-full flex items-center justify-center shrink-0 border border-gray-200 shadow-sm overflow-hidden bg-gray-100 text-gray-400">
                      <DocumentTextIcon class="h-6 w-6" />
                    </div>
                    <div>
                      <h3 class="font-bold text-gray-800 text-sm">
                        {{ ddt.id === 'Senza DDT' ? 'ORDINI DA SPEDIRE (NO DDT)' : `DDT #${ddt.number}` }}
                      </h3>
                    </div>
                  </div>
                  <button v-if="ddt.url" @click="apriDdt(ddt.url!)" class="text-xs bg-amber-400 border border-amber-500 hover:bg-amber-300 hover:text-amber-950 px-4 py-2 rounded-full font-bold transition-all shadow-sm flex items-center gap-2">
                    APRI DDT
                  </button>
                </div>

                <div class="p-4 grid gap-3 bg-gray-50/50">
                  <div v-for="p in ddt.items" :key="p.id" 
                       class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all hover:shadow-md relative group">
                       <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                          <div class="flex items-center gap-4 w-full md:w-auto">
                              <div class="h-10 w-10 rounded-full flex items-center justify-center" :class="getStatusStyling(p.stato).iconBg">
                                <component :is="getStatusStyling(p.stato).icon" class="h-6 w-6" />
                              </div>
                              <div>
                                <div class="flex items-center gap-2">
                                  <h3 class="text-xl font-bold text-gray-900">{{ p.cliente }}</h3>
                                  <p class="text-xs text-gray-500">• {{ formatDate(getEffectiveDate(p)) }}</p>
                                  <span class="text-xs text-gray-500">• Rif. {{ p.commessa || 'Senza Nome' }}</span>
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
                                  <button @click.stop="apriEditor(p.codice)" class="border border-gray-300 text-gray-600 px-3 py-2 rounded-full p-1.5 font-bold text-xs hover:bg-gray-50 h-[34px] whitespace-nowrap shrink-0">APRI</button>
                              </div>
                          </div>
                       </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
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
                  <div v-else class="h-8 w-8 rounded-full border border-gray-300 bg-amber-400 text-amber-950 flex items-center justify-center shadow-sm hover:border-blue-400 hover:text-blue-500">
                    <TruckIcon class="h-4 w-4" />
                  </div>
                </div>

                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                   <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="h-12 w-12 rounded-full flex flex-col items-center justify-center shrink-0 border border-black/5 shadow-sm overflow-hidden bg-amber-400" 
                        :class="getStatusStyling(p.stato).iconBg">
                      
                      <template v-if="getEffectiveDate(p)">
                        <span class="text-lg font-bold leading-none tracking-tighter" 
                              :class="['READY', 'DELIVERY', 'SIGNED', 'IN_PRODUZIONE'].includes(p.stato) ? 'text-amber-950' : 'text-gray-900'">
                          {{ getDay(getEffectiveDate(p)) }}
                        </span>
                        <span class="text-[9px] font-bold uppercase leading-none mt-0.5"
                              :class="['READY', 'DELIVERY', 'SIGNED', 'IN_PRODUZIONE'].includes(p.stato) ? 'text-amber-800' : 'text-gray-600'">
                          {{ getMonth(getEffectiveDate(p)) }}
                        </span>
                      </template>

                      <component v-else :is="getStatusStyling(p.stato).icon" class="h-6 w-6" />
                      
                    </div>
                      <div>
                        <div class="flex items-center gap-2">
                          <h3 class="text-xl font-bold text-gray-900">{{ p.cliente }}</h3>
                          <span class="text-xs text-gray-500">• Rif. {{ p.commessa || 'Senza Nome' }}</span>
                          <span v-if="p.isReopened" class="text-[9px] px-2 py-0.5 rounded border uppercase font-bold bg-purple-100 text-purple-700 border-purple-200">RIAPERTO</span>
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
                           <button @click.stop="apriEditor(p.codice)" class="border border-gray-300 text-gray-600 px-3 py-2 rounded-full p-1.5 font-bold text-xs hover:bg-gray-50 h-[34px] whitespace-nowrap shrink-0" title="Apri l'editor per visualizzare i dettagli">APRI</button>
                      </div>
                      <div class="flex items-end gap-2">
                        <div v-if="p.stato === 'IN_PRODUZIONE'" class="flex flex-col items-start justify-end" @click.stop>
                          <label class="text-[9px] font-bold text-gray-400 uppercase mb-0.5 leading-none">Colli</label>
                          <div class="flex items-center bg-gray-50 rounded border border-gray-300 h-[34px] overflow-hidden shadow-sm">
                            <button @click="() => { if((p.colli || 1) > 1) { p.colli = (p.colli || 1) - 1; saveColli(p.id, p.colli); } }" class="w-8 h-full flex items-center justify-center text-gray-400 hover:text-amber-400 transition-colors active:bg-gray-200" title="Diminuisci"><span class="text-lg font-bold leading-none mb-0.5">−</span></button>
                            <input type="number" :value="p.colli || 1" @input="event => p.colli = Number((event.target as HTMLInputElement).value)" @blur="event => saveColli(p.id, Number((event.target as HTMLInputElement).value))" @keyup.enter="event => saveColli(p.id, Number((event.target as HTMLInputElement).value))" class="w-10 text-center bg-transparent text-sm font-bold text-gray-900 border-gray-50 appearance-none"/>
                            <button @click="() => { p.colli = (p.colli || 1) + 1; saveColli(p.id, p.colli); }" class="w-8 h-full flex items-center justify-center text-gray-400 hover:text-amber-400 transition-colors active:bg-gray-200 " title="Aumenta"><span class="text-lg font-bold leading-none mb-0.5">+</span></button>
                          </div>
                        </div>
                        <div class="h-[34px] flex items-center">
                          <div v-if="idOrdineInConferma === p.id" class="flex gap-1 h-full animate-fade-in">
                              <button @click.stop="confermaOrdinePronto(p)" class="bg-green-100 hover:bg-green-200 text-green-600 border border-green-200 font-bold text-[10px] px-12 rounded shadow-sm transition-colors h-full flex items-center" title="Conferma">SÌ</button>
                              <button @click.stop="idOrdineInConferma = null" class="bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 font-bold text-[10px] px-12 rounded shadow-sm transition-colors h-full flex items-center" title="Annulla">NO</button>
                          </div>
                          <button v-else-if="getActionData(p)" @click.stop="handleClickAzione(p)" class="text-xs font-bold px-12 py-2 rounded border transition-all shadow-sm hover:shadow whitespace-nowrap flex items-center gap-2 h-full" :class="getActionData(p)?.class" :disabled="p.stato === 'IN_PRODUZIONE' && !p.colli">
                          <component :is="getActionData(p)?.icon" class="h-4 w-4" />
                          <span>{{ getActionData(p)?.text }}</span>
                          </button>
                        </div>
                      </div>
                  </div>
               </div> </div>
            </template>
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
          <div class="bg-blue-600 p-2 rounded-[2rem] shadow-lg shadow-blue-900/20 shrink-0">
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
          <button @click="annullaSpedizione" class="flex-1 md:flex-none px-4 py-2 md:px-6 md:py-3 rounded-[2rem] text-xs font-bold text-gray-300 hover:bg-gray-800 transition-colors border border-gray-700 whitespace-nowrap">
            ANNULLA
          </button>
          
          <button @click="avviaCreazioneDdt" class="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 md:px-6 md:py-3 rounded-[2rem] font-bold text-sm shadow-xl shadow-blue-900/40 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap">
            <span>CREA DDT</span>
            <CalculatorIcon class="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
    <div 
      v-if="showToast" 
      class="fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300"
      :class="showToast ? 'opacity-100 backdrop-blur-sm bg-black/10' : 'opacity-0'">
      <div 
        class="bg-gray-800 text-white px-6 py-3 rounded-xl shadow-2xl transition-all duration-300 transform scale-100"
        :class="showToast ? 'translate-y-0' : 'translate-y-10'">
        <p class="font-bold text-lg whitespace-nowrap">{{ toastMessage }}</p>
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