<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  collection, addDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, updateDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { useCatalogStore } from '../Data/catalog';
import type { Categoria, RigaPreventivo, StatoPreventivo, Allegato, RiepilogoRiga } from '../types';
import { calculatePrice } from '../logic/pricing';
import { onAuthStateChanged } from 'firebase/auth';
import OrderModals from '../components/OrderModals.vue';
import { STATUS_DETAILS } from '../types';
import {
  RectangleStackIcon,
  PlusCircleIcon,
  ChevronLeftIcon,
  InformationCircleIcon, 
  MagnifyingGlassCircleIcon,
  ShoppingCartIcon,
  CheckBadgeIcon,
  UserIcon,
} from '@heroicons/vue/24/solid'

const toastMessage = ref('');
const showToast = ref(false);
const dataConsegnaPrevista = ref('');
const showCustomToast = (message: string) => {
  toastMessage.value = message;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
    toastMessage.value = '';
  }, 3000); 
};

const dateErrorAnim = ref(false);
const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();

const nomeCliente = ref((route.query?.nome as string) || 'Cliente');
const clienteEmail = ref('');
const riferimentoCommessa = ref('');
const currentDocId = ref<string | null>(null);
const statoCorrente = ref<StatoPreventivo>('DRAFT');

const showModals = ref(false);
const modalMode = ref<'FAST' | 'SIGN'>('FAST');

const inputRicerca = ref('');

const noteCliente = ref('');
const scontoApplicato = ref(0);
const listaAllegati = ref<Allegato[]>([]);
const isUploading = ref(false);

const storicoPreventivi = ref<any[]>([]);
const mostraStorico = ref(false);
const codiceRicerca = ref('');
const isSaving = ref(false);
const isDataLoaded = ref(!route.query.codice);
const riferimentoCommessaInput = ref<HTMLInputElement | null>(null);

// --- NUOVA LOGICA: CREAZIONE ORDINE ADMIN ---
const clienteUID = ref(''); // ID del cliente selezionato
const searchClientQuery = ref('');
const suggestedClients = ref<any[]>([]);
const isSearchingClient = ref(false);

// Determina se siamo in modalità "Nuovo Ordine Admin"
const isNewAdminOrder = computed(() => route.query?.admin === 'true' && route.query?.new === 'true');

// Funzione di ricerca clienti (Autocompletamento)
// --- MODIFICA QUESTA PARTE NELLO SCRIPT ---

const allClients = ref<any[]>([]); // Cache locale clienti

const searchClients = async () => {
  const term = searchClientQuery.value.toLowerCase();
  if (term.length < 2) {
    suggestedClients.value = [];
    return;
  }
  
  // 1. Carica tutti i clienti una volta sola se la lista è vuota
  if (allClients.value.length === 0) {
      isSearchingClient.value = true;
      try {
        const snap = await getDocs(collection(db, 'users'));
        allClients.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.error(e);
      } finally {
        isSearchingClient.value = false;
      }
  }

  // 2. Filtra localmente (case-insensitive e "contiene")
  suggestedClients.value = allClients.value.filter(c => {
      const rs = (c.ragioneSociale || '').toLowerCase();
      const em = (c.email || '').toLowerCase();
      return rs.includes(term) || em.includes(term);
  }).slice(0, 10); // Mostra max 10 risultati
};

// Selezione del cliente dal menu a tendina
const selectClient = (client: any) => {
  nomeCliente.value = client.ragioneSociale || client.email;
  clienteEmail.value = client.email;
  clienteUID.value = client.uid || client.id; // Salviamo l'UID
  searchClientQuery.value = client.ragioneSociale; 
  suggestedClients.value = []; 
};
// ---------------------------------------------

const scrollToTopOnFocus = () => {
  if (riferimentoCommessaInput.value) {
    // Scorri l'elemento all'inizio della viewport (in alto) in modo fluido
    riferimentoCommessaInput.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
const categoriaGriglia = ref<Categoria>('INGLESINA');
const tipoGriglia = ref('');
const dimensioneGriglia = ref('');
const finituraGriglia = ref('');
const tipoCanalino = ref('');
const dimensioneCanalino = ref('');
const finituraCanalino = ref('');
const copiaDuplex = ref(false);
const fuseruolo = ref<number | '' | null>('');
const adminExtraDesc = ref('Supplemento');
const adminExtraPrice = ref(0);

const preventivo = ref<RigaPreventivo[]>([]);
const pannello = reactive({ base: 800, altezza: 1750, righe: 1, colonne: 4, qty: 1 });
const opzioniTelaio = reactive({ nonEquidistanti: false, curva: false, tacca: false });

const isAdmin = computed(() => route.query?.admin === 'true');

const totaleImponibile = computed(() => preventivo.value.reduce((t, i) => t + i.prezzo_totale, 0));
const totaleFinale = computed(() => {
  const sconto = (totaleImponibile.value * scontoApplicato.value) / 100;
  return totaleImponibile.value - sconto;
});

const isStandard = computed(() => {
  const haCurve = preventivo.value.some(r => r.curva);
  const haNote = noteCliente.value.trim().length > 0;
  return !haCurve && !haNote;
});

const isLocked = computed(() => {
  if (isAdmin.value) {
    return ['WAITING_FAST', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'REJECTED'].includes(statoCorrente.value);
  }
  return statoCorrente.value !== 'DRAFT';
});

const showConfigurationPanels = computed(() => {
  // Se stiamo ancora caricando i dati iniziali, nascondi tutto per evitare il "flash"
  if (!isDataLoaded.value) return false;
  
  const hiddenStatuses = ['ORDER_REQ', 'WAITING_FAST', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE', 'READY', 'DELIVERY', 'DELIVERED', 'REJECTED'];
  return !hiddenStatuses.includes(statoCorrente.value);
});

watch(categoriaGriglia, () => { tipoGriglia.value = ''; dimensioneGriglia.value = ''; finituraGriglia.value = ''; });
watch(tipoGriglia, () => { dimensioneGriglia.value = ''; finituraGriglia.value = ''; });
watch(dimensioneGriglia, () => { finituraGriglia.value = ''; });

watch([copiaDuplex, tipoGriglia, dimensioneGriglia, finituraGriglia, categoriaGriglia], ([attivo, tipo, dim, fin, cat]) => {
  if (attivo && cat === 'DUPLEX') {
    tipoCanalino.value = tipo as string;
    dimensioneCanalino.value = dim as string;
    finituraCanalino.value = fin as string;
  }
  if (cat !== 'DUPLEX' && attivo) copiaDuplex.value = false;
});

const categorieGrigliaDisp = computed(() => ['INGLESINA', 'DUPLEX', 'MUNTIN'].filter(c => catalog.listino[c]));
const tipiGrigliaDisp = computed(() => (categoriaGriglia.value && catalog.listino[categoriaGriglia.value]) ? Object.keys(catalog.listino[categoriaGriglia.value]) : []);
const dimensioniGrigliaDisp = computed(() => (tipoGriglia.value && catalog.listino[categoriaGriglia.value]?.[tipoGriglia.value]) ? Object.keys(catalog.listino[categoriaGriglia.value][tipoGriglia.value]) : []);
const finitureGrigliaDisp = computed(() => (dimensioneGriglia.value && catalog.listino[categoriaGriglia.value]?.[tipoGriglia.value]?.[dimensioneGriglia.value]) ? Object.keys(catalog.listino[categoriaGriglia.value][tipoGriglia.value][dimensioneGriglia.value]) : []);

const tipiCanalinoDisp = computed(() => catalog.listino.CANALINO ? Object.keys(catalog.listino.CANALINO) : []);
const dimensioniCanalinoDisp = computed(() => (tipoCanalino.value && catalog.listino.CANALINO?.[tipoCanalino.value]) ? Object.keys(catalog.listino.CANALINO[tipoCanalino.value]) : []);
const finitureCanalinoDisp = computed(() => (dimensioneCanalino.value && catalog.listino.CANALINO?.[tipoCanalino.value]?.[dimensioneCanalino.value]) ? Object.keys(catalog.listino.CANALINO[tipoCanalino.value][dimensioneCanalino.value]) : []);

watch(tipiGrigliaDisp, (v) => { if (v.length === 1) tipoGriglia.value = v[0] as string; });
watch(dimensioniGrigliaDisp, (v) => { if (v.length === 1) dimensioneGriglia.value = v[0] as string; });
watch(finitureGrigliaDisp, (v) => { if (v.length === 1) finituraGriglia.value = v[0] as string; });
watch(tipiCanalinoDisp, (v) => { if (v.length === 1 && !copiaDuplex.value) tipoCanalino.value = v[0] as string; });

const aggiungi = () => {
  if (!tipoGriglia.value || !dimensioneGriglia.value || !finituraGriglia.value || !pannello.base || !pannello.altezza) return;

  const pGriglia = catalog.listino[categoriaGriglia.value]?.[tipoGriglia.value]?.[dimensioneGriglia.value]?.[finituraGriglia.value]?.prezzo || 0;
  const pCanalino = catalog.listino.CANALINO?.[tipoCanalino.value]?.[dimensioneCanalino.value]?.[finituraCanalino.value]?.prezzo || 0;

  const result = calculatePrice({
    base_mm: pannello.base, altezza_mm: pannello.altezza, qty: pannello.qty,
    num_orizzontali: pannello.colonne || 0, num_verticali: pannello.righe || 0,
    tipo_canalino: tipoCanalino.value,
    prezzo_unitario_griglia: pGriglia, prezzo_unitario_canalino: pCanalino
  });

  let descStart = categoriaGriglia.value;
  if (categoriaGriglia.value === 'DUPLEX' && fuseruolo.value) {
    descStart += ` ${fuseruolo.value}`;
  }

  preventivo.value.push({
    id: Date.now().toString(),
    categoria: categoriaGriglia.value, modello: tipoGriglia.value as any, dimensione: dimensioneGriglia.value, finitura: finituraGriglia.value,
    base_mm: pannello.base, altezza_mm: pannello.altezza, righe: pannello.righe || 0, colonne: pannello.colonne || 0, quantita: pannello.qty,
    descrizioneCompleta: `${categoriaGriglia.value} ${fuseruolo.value} ${tipoGriglia.value} ${dimensioneGriglia.value} - ${finituraGriglia.value}`,
    infoCanalino: `Canalino: ${tipoCanalino.value} ${dimensioneCanalino.value} ${finituraCanalino.value}`,
    prezzo_unitario: result.prezzo_unitario, prezzo_totale: result.prezzo_totale,
    nonEquidistanti: opzioniTelaio.nonEquidistanti, curva: opzioniTelaio.curva, tacca: opzioniTelaio.tacca,
    rawCanalino: { tipo: tipoCanalino.value, dim: dimensioneCanalino.value, fin: finituraCanalino.value },
    fuseruolo: fuseruolo.value ? Number(fuseruolo.value) : null
  });
  Object.assign(pannello, { base: 0, altezza: 0, righe: 0, colonne: 0, qty: 1 });
  Object.assign(opzioniTelaio, { nonEquidistanti: false, curva: false, tacca: false });
};

const uploadFile = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  
  // FIX: Type safe check (TS18048)
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file) return;

  isUploading.value = true;
  try {
    const path = `allegati/${Date.now()}_${file.name}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    listaAllegati.value.push({
      nome: file.name,
      url: url,
      tipo: file.name.split('.').pop()?.toUpperCase() || 'FILE',
      dataCaricamento: new Date().toISOString()
    });
  } catch (e) { alert("Errore upload."); console.error(e); }
  finally { isUploading.value = false; }
};

const rimuoviAllegato = (index: number) => { if(confirm("Rimuovere allegato?")) listaAllegati.value.splice(index, 1); };

const vaiDashboard = () => {
  if (preventivo.value.length > 0 && !currentDocId.value) {
    if (!confirm("Hai un preventivo in corso non salvato. Vuoi uscire?")) return;
  }
  if (isAdmin.value) router.push('/admin');
  else router.push('/dashboard');
};

const nuovaCommessa = () => {
  if (preventivo.value.length > 0 && !confirm("Attenzione: perderai le modifiche non salvate. Iniziare una nuova commessa?")) return;
  preventivo.value = [];
  currentDocId.value = null;
  statoCorrente.value = 'DRAFT';
  riferimentoCommessa.value = '';
  codiceRicerca.value = '';
  noteCliente.value = '';
  scontoApplicato.value = 0;
  listaAllegati.value = [];
  Object.assign(pannello, { base: 0, altezza: 0, righe: 0, colonne: 0, qty: 1 });
  Object.assign(opzioniTelaio, { nonEquidistanti: false, curva: false, tacca: false });
};

const apriModaleAzione = () => {
  if (statoCorrente.value === 'WAITING_FAST') modalMode.value = 'FAST';
  else if (statoCorrente.value === 'WAITING_SIGN') modalMode.value = 'SIGN';
  showModals.value = true;
};

const onConfirmFast = async () => {
  if (!currentDocId.value) return;
  try {
    await updateDoc(doc(db, 'preventivi', currentDocId.value), {
      stato: 'SIGNED', dataConferma: serverTimestamp(), metodoConferma: 'FAST_TRACK'
    });
    statoCorrente.value = 'SIGNED';
    showModals.value = false;
    alert("✅ Ordine Confermato!");
    router.push('/dashboard');
  } catch(e) { console.error(e); alert("Errore conferma."); }
};

const onConfirmSign = async (url: string) => {
  if (!currentDocId.value) return;
  try {
    await updateDoc(doc(db, 'preventivi', currentDocId.value), {
      stato: 'SIGNED', dataConferma: serverTimestamp(), contrattoFirmatoUrl: url, metodoConferma: 'UPLOAD_FIRMA'
    });
    statoCorrente.value = 'SIGNED';
    showModals.value = false;
    alert("✅ Ordine Confermato e inviato in produzione!");
    router.push('/dashboard');
  } catch(e) { console.error(e); alert("Errore conferma."); }
};

// SOSTITUISCI LA FUNZIONE salvaPreventivo CON QUESTA:
const salvaPreventivo = async (azione?: 'RICHIEDI_VALIDAZIONE' | 'ORDINA' | 'ADMIN_VALIDA' | 'ADMIN_RIFIUTA' | 'ADMIN_FIRMA' | 'FORCE_EDIT' | 'CREA_PREVENTIVO_ADMIN' | 'CREA_ORDINE_ADMIN') => {
  if (preventivo.value.length === 0) return alert("Preventivo vuoto.");
  if (!riferimentoCommessa.value.trim()) return alert("Il campo 'Riferimento Cantiere' è obbligatorio.");
  
  // Validazione specifica per Admin
  if (isNewAdminOrder.value && !clienteUID.value) return alert("Seleziona un cliente prima di salvare.");

  isSaving.value = true;

  try {
    const codice = codiceRicerca.value || `${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    let nuovoStato: StatoPreventivo = statoCorrente.value;

    // Logica Stati
    if (!isAdmin.value) {
      if (!azione && statoCorrente.value === 'DRAFT') nuovoStato = 'DRAFT';
      else if (azione === 'RICHIEDI_VALIDAZIONE') nuovoStato = 'PENDING_VAL';
      else if (azione === 'ORDINA') nuovoStato = 'ORDER_REQ';
      else if (azione === 'FORCE_EDIT') nuovoStato = 'PENDING_VAL';
    }

    if (isAdmin.value && azione) {
      if (azione === 'ADMIN_VALIDA') nuovoStato = 'QUOTE_READY';
      if (azione === 'ADMIN_RIFIUTA') nuovoStato = 'REJECTED';
      if (azione === 'ADMIN_FIRMA') nuovoStato = 'WAITING_SIGN';
      // NUOVI STATI PER CREAZIONE DIRETTA
      if (azione === 'CREA_PREVENTIVO_ADMIN') nuovoStato = 'QUOTE_READY';
      if (azione === 'CREA_ORDINE_ADMIN') nuovoStato = 'WAITING_SIGN';
    }

    // Calcolo Sommario
    const sommario: RiepilogoRiga[] = [];
    preventivo.value.forEach(r => {
      const key = r.descrizioneCompleta + '|' + (r.infoCanalino || '');
      const existing = sommario.find(s => (s.descrizione + '|' + s.canalino) === key);
      if (existing) existing.quantitaTotale += r.quantita;
      else sommario.push({ descrizione: r.descrizioneCompleta, canalino: r.infoCanalino || '', quantitaTotale: r.quantita });
    });

    const docData: any = {
      codice,
      cliente: nomeCliente.value,
      clienteEmail: clienteEmail.value,
      commessa: riferimentoCommessa.value.toUpperCase(),
      totaleImponibile: totaleImponibile.value,
      scontoPercentuale: scontoApplicato.value,
      totaleScontato: totaleFinale.value,
      stato: nuovoStato,
      noteCliente: noteCliente.value,
      allegati: listaAllegati.value,
      sommarioPreventivo: sommario, 
      dataModifica: serverTimestamp(),
      dataScadenza: new Date(Date.now() + 30*24*60*60*1000),
      elementi: preventivo.value.map(r => ({ ...r })),
      dataConsegnaPrevista: dataConsegnaPrevista.value || null
    };

    // LOGICA ASSEGNAZIONE CLIENTE (UID)
    if (!currentDocId.value) {
        docData.dataCreazione = serverTimestamp();
        if (isNewAdminOrder.value) {
            // Se Admin crea per un cliente
            docData.uid = clienteUID.value;
            docData.clienteUID = clienteUID.value;
        } else {
            // Se Cliente crea per sé
            const user = auth.currentUser;
            if (user) {
                docData.uid = user.uid;
                docData.clienteUID = user.uid;
                docData.clienteEmail = user.email; 
            }
        }
    } 

    if (currentDocId.value) {
      await setDoc(doc(db, 'preventivi', currentDocId.value), docData, { merge: true });
    } else {
      const ref = await addDoc(collection(db, 'preventivi'), docData);
      currentDocId.value = ref.id;
      codiceRicerca.value = codice;
    }

    statoCorrente.value = nuovoStato;
    showCustomToast(`✅ Salvato in stato: ${nuovoStato}`);

    if (isAdmin.value) router.push('/admin');
    else caricaListaStorico();

  } catch (e) { alert("Errore salvataggio."); console.error(e); }
  finally { isSaving.value = false; }
};

// SOSTITUISCI onMounted CON QUESTO:
onMounted(() => {
  catalog.fetchCatalog();
  
  // Se NON è un nuovo ordine admin, carica il nome cliente dalla memoria
  if (!isNewAdminOrder.value) {
      const storedName = localStorage.getItem('clientName');
      if (storedName) nomeCliente.value = storedName;
  } else {
      nomeCliente.value = ''; // Pulisce il nome per permettere la ricerca
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Se non è admin creation mode, l'email è quella dell'utente corrente
      if(!isNewAdminOrder.value) clienteEmail.value = user.email || '';
      caricaListaStorico();
    }
  });

  if(route.query.codice) { 
    isSaving.value = true;
    codiceRicerca.value = route.query.codice as string; 
    setTimeout(caricaPreventivo, 1000); 
  }
});

const eliminaPreventivo = async () => {
  if (!currentDocId.value) {
    alert("Nessun preventivo selezionato da annullare.");
    return;
  }
  if (!confirm("Sei sicuro di voler ELIMINARE questo preventivo?")) {
    return;
  }
  try {
    // Aggiorna lo stato su Firestore a REJECTED
    await updateDoc(doc(db, 'preventivi', currentDocId.value), {
      stato: 'REJECTED',
      dataModifica: serverTimestamp(),
    });
    
    // Aggiorna lo stato locale
    statoCorrente.value = 'REJECTED';
    showCustomToast("❌ Preventivo annullato e archiviato.");

    // Reindirizza l'utente alla dashboard appropriata dopo l'annullamento
    if (isAdmin.value) router.push('/admin');
    else router.push('/dashboard');

  } catch (e) {
    console.error("Errore annullamento:", e);
    alert("Errore durante l'annullamento del preventivo.");
  }
};

const sbloccaPerModifica = () => {
  if(!confirm("Attenzione: Se modifichi questo preventivo, tornerà in stato 'DA VALIDARE' e dovrà essere riapprovato. Procedere?")) return;
  statoCorrente.value = 'DRAFT';
};

const caricaPreventivo = async () => {
  const termine = inputRicerca.value || codiceRicerca.value;
  if (!termine) return;

  isSaving.value = true;
  try {
    let q;
    if (inputRicerca.value) {
        q = query(collection(db, 'preventivi'), where('commessa', '==', inputRicerca.value));
    } else {
        q = query(collection(db, 'preventivi'), where('codice', '==', termine.trim().toUpperCase()));
    }

    const snap = await getDocs(q);
    if (snap.empty) return alert("Commessa non trovata (Attenzione a maiuscole/minuscole)");
    
    // FIX: Safe access to docs[0] (TS2532)
    const docSnapshot = snap.docs[0];
    if (!docSnapshot) return;
    const d = docSnapshot.data();
    currentDocId.value = docSnapshot.id;
    
    // Aggiorniamo i dati locali
    codiceRicerca.value = d.codice;
    nomeCliente.value = d.cliente;
    riferimentoCommessa.value = d.commessa;
    clienteEmail.value = d.clienteEmail || '';
    statoCorrente.value = d.stato || 'DRAFT';
    noteCliente.value = d.noteCliente || '';
    scontoApplicato.value = d.scontoPercentuale || 0;
    listaAllegati.value = d.allegati || [];
    dataConsegnaPrevista.value = d.dataConsegnaPrevista || ''; // Recupera dal DB o stringa vuota

    preventivo.value = d.elementi.map((el: any) => ({
      ...el,
      nonEquidistanti: el.nonEquidistanti || false,
      rawCanalino: el.rawCanalino || null,
      righe: Number(el.righe) || 0,
      colonne: Number(el.colonne) || 0
    }));
  } catch(e) { 
    console.error(e); 
    alert("Errore ricerca"); 
  } finally { 
    isSaving.value = false;
    isDataLoaded.value = true; // <--- NUOVO: Sblocca la visualizzazione dei pannelli (se lo stato lo permette)
  }
};

const caricaListaStorico = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return;
    let q;
    if (isAdmin.value) {
      q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(20));
    } else {
      // MODIFICA: Filtro per 'uid' invece che per 'clienteEmail'
      q = query(collection(db, 'preventivi'), where('uid', '==', user.uid), orderBy('dataCreazione', 'desc'), limit(20));
    }
    const s = await getDocs(q);
    storicoPreventivi.value = s.docs.map(d => ({ id: d.id, ...d.data(), stato: d.data().stato || 'DRAFT' }));
  } catch (e) { console.warn("Errore storico:", e); }
};

const modificaRiga = async (index: number) => {
  if (isLocked.value) return;
  const r = preventivo.value[index];
  
  // FIX: Cast/Default values for refs (TS2322)
  categoriaGriglia.value = r?.categoria as Categoria || 'INGLESINA'; await nextTick();
  fuseruolo.value = r?.fuseruolo || ''; await nextTick();
  tipoGriglia.value = r?.modello || ''; await nextTick();
  dimensioneGriglia.value = r?.dimensione || ''; await nextTick();
  finituraGriglia.value = r?.finitura || '';
  
  if (r?.rawCanalino) {
    tipoCanalino.value = r.rawCanalino.tipo; await nextTick();
    dimensioneCanalino.value = r.rawCanalino.dim; await nextTick();
    finituraCanalino.value = r.rawCanalino.fin;
  }
  
  // FIX: Defaults for numeric refs
  pannello.base = r?.base_mm || 0; 
  pannello.altezza = r?.altezza_mm || 0;
  pannello.righe = r?.righe || 0; 
  pannello.colonne = r?.colonne || 0;
  pannello.qty = r?.quantita || 1;
  
  // FIX: Defaults for boolean refs
  opzioniTelaio.nonEquidistanti = r?.nonEquidistanti || false; 
  opzioniTelaio.curva = r?.curva || false; 
  opzioniTelaio.tacca = r?.tacca || false;
  
  preventivo.value.splice(index, 1);
};

const eliminaRiga = (i:number) => { if(!isLocked.value) preventivo.value.splice(i,1); };
const aggiungiExtraAdmin = () => {
  preventivo.value.push({ id: Date.now().toString(), categoria: 'EXTRA', modello: 'MANUALE' as any, dimensione:'-', finitura:'-', descrizioneCompleta:`${adminExtraDesc.value}`, infoCanalino:'', base_mm:0, altezza_mm:0, righe:0, colonne:0, quantita:1, prezzo_unitario:adminExtraPrice.value, prezzo_totale:adminExtraPrice.value, curva:false, tacca:false });
  adminExtraPrice.value=0;
};

</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
      <main class="max-w-5xl mx-auto flex flex-col gap-2">
        <div class="relative flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        
        <button 
          @click="vaiDashboard" 
          class="md:absolute md:-left-14 md:top-1.5 text-gray-400 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100 mb-4 md:mb-0" 
          title="Torna alla Dashboard"
        >
          <ChevronLeftIcon class="h-8 w-8 text-yellow-500" />         
        </button>

        <div class="flex items-center gap-4 w-full">
          <div class="w-full">
            
            <div v-if="isNewAdminOrder && !currentDocId" class="mb-4 relative z-50">
                <label class="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <UserIcon class="h-4 w-4"/> Seleziona Cliente
                </label>
                <div class="relative">
                    <input 
                        v-model="searchClientQuery" 
                        @input="searchClients"
                        type="text" 
                        class="w-full md:w-96 p-3 border-2 border-yellow-400 rounded-lg text-lg font-bold text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-4 focus:ring-yellow-100"
                        placeholder="Cerca Ragione Sociale..."
                        :disabled="!!clienteUID" 
                    >
                    <button v-if="clienteUID" @click="() => { clienteUID=''; searchClientQuery=''; nomeCliente=''; }" class="absolute right-3 top-3 text-gray-400 hover:text-red-500">✕</button>
                </div>
                
                <div v-if="suggestedClients.length > 0" class="absolute top-full left-0 w-full md:w-96 bg-white shadow-xl rounded-lg border border-gray-100 mt-1 overflow-hidden">
                    <div 
                        v-for="client in suggestedClients" 
                        :key="client.id" 
                        @click="selectClient(client)"
                        class="p-3 hover:bg-yellow-50 cursor-pointer border-b last:border-0 border-gray-50 transition-colors"
                    >
                        <div class="font-bold text-gray-800">{{ client.ragioneSociale }}</div>
                        <div class="text-xs text-gray-400">{{ client.email }}</div>
                    </div>
                </div>
            </div>
            
            <div v-else>
                <p class="text-lg font-medium text-gray-800 leading-none">{{ nomeCliente }}</p>
            </div>

            <h1 class="text-5xl font-bold font-heading text-gray-900">P.O.P.S. Commesse</h1>
            
            <div v-if="!isNewAdminOrder" class="flex items-center gap-3 mt-4">
              <button v-if="!isAdmin" @click="nuovaCommessa" class="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
                <PlusCircleIcon class="h-7 w-7 text-black" /> NUOVO
              </button>
              <button v-if="!isAdmin" @click="mostraStorico = true" class="bg-stone-100 hover:bg-stone-50 text-black px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 transition-transform active:scale-95">
                <MagnifyingGlassCircleIcon class="h-7 w-7 text-black" /> STORICO
              </button>
            </div>

          </div>
        </div>
      </div>
      
      <div 
        class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all p-5 card-dati-commessa"
        ref="riferimentoCommessaInput"
        >
        <h2 class="font-bold text-lg font-heading border-b pb-2 mb-4 flex items-center gap-2 text-gray-800">
          Dati Commessa
        </h2>
          <div class="flex bg-gray-100 p-1 rounded-lg mb-4">
            <button v-for="c in categorieGrigliaDisp" :key="c" @click="categoriaGriglia = c as Categoria" :disabled="isLocked" :class="categoriaGriglia === c ? 'bg-yellow-400 shadow text-black' : 'text-gray-00'" class="flex-1 py-2 text-xs font-bold rounded-md transition-all uppercase disabled:opacity-50">{{ c }}</button>
          </div>
        <div class="flex flex-col lg:flex-row gap-4 items-start">
          <div class="flex-1 w-full flex flex-col justify-between">
              <div>
                  <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Riferimento Cantiere <span class="text-red-500">*</span></label>
                  <input 
                    v-model="riferimentoCommessa" 
                    :disabled="isLocked" 
                    type="text" 
                    class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all" 
                    placeholder="Es. Rossi Cucina"
                    ref="riferimentoCommessaInput"
                    @focus="scrollToTopOnFocus"
                  >              
              </div>
              <div></div>
          </div>

          <div class="flex-1 w-full flex flex-col justify-between">
            <div>
                <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Note Tecniche</label>
                <textarea 
                    v-model="noteCliente" 
                    :disabled="isLocked" 
                    rows="1" 
                    class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all resize-none" 
                    placeholder="Es. Consegna tassativa..."
                    @focus="scrollToTopOnFocus"
                    >
                </textarea>            
            </div>
            <div v-if="noteCliente" class="flex items-center gap-1 mt-1 text-yellow-500 text-xs font-bold animate-pulse">
                <InformationCircleIcon class="h-5 w-5 text-yellow-500" />         
                La presenza di una nota richiede una validazione
            </div>
          </div>

          <div class="flex-1 w-full flex flex-col justify-between">
            <div>
                <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Allegati</label>
                <div class="flex gap-2 items-center">
                    <div class="relative border border-dashed border-gray-300 rounded-lg px-3 py-2 bg-gray-50 hover:bg-white transition-all text-center cursor-pointer flex-1" :class="isLocked ? 'opacity-50 pointer-events-none' : ''">
                        <input type="file" @change="uploadFile" :disabled="isLocked" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                        <span v-if="isUploading" class="text-xs text-yellow-600 font-bold">Caricamento...</span>
                        <span v-else class="text-xs text-gray-500">Carica File</span>
                    </div>
                    <div v-if="listaAllegati.length > 0" class="flex flex-wrap gap-1">
                        <div v-for="(file, idx) in listaAllegati" :key="file.url" class="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                            <a :href="file.url" target="_blank" class="truncate max-w-[60px]">{{ file.nome }}</a>
                            <button @click="rimuoviAllegato(idx)" :disabled="isLocked" class="hover:text-red-500">×</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div v-if="listaAllegati.length > 0" class="flex items-center gap-1 mt-1 text-yellow-500 text-xs font-bold animate-pulse">
                <InformationCircleIcon class="h-5 w-5 text-yellow-500" />         
                Ci sono file in allegato
            </div>
          </div>
        </div>
      </div>
      <div v-if="showConfigurationPanels" class="grid grid-cols-1 md:grid-cols-3 gap-6">
    
      <div class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all p-5 h-full">
        <h2 class="font-bold text-lg border-b pb-2 font-heading text-gray-800">1. Griglia</h2>
        <div v-if="catalog.loading" class="text-center p-4 text-sm text-gray-400">Caricamento...</div>
        <div v-else>
            <select v-model="tipoGriglia" :disabled="!tipiGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Tipo</option><option v-for="m in tipiGrigliaDisp" :key="m" :value="m">{{ m }}</option></select>
            <select v-if="tipoGriglia" v-model="dimensioneGriglia" :disabled="!dimensioniGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Dimensione</option><option v-for="d in dimensioniGrigliaDisp" :key="d" :value="d">{{ d }}</option></select>
            <select v-if="dimensioneGriglia" v-model="finituraGriglia" :disabled="!finitureGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Finitura</option><option v-for="f in finitureGrigliaDisp" :key="f" :value="f">{{ f }}</option></select>
            <div v-if="categoriaGriglia === 'DUPLEX'" class="mt-4 animate-slide-in">
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Fuseruolo</label>
              <input v-model="fuseruolo" :disabled="isLocked" type="number" class="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:opacity-60" placeholder="Es. 20">
            </div>
        </div>
      </div>

      <div class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all p-5 space-y-4 h-full">
        <div class="flex justify-between items-center border-b pb-2">
            <h2 class="font-bold text-lg font-heading text-gray-800">2. Canalino</h2>
            <label v-if="categoriaGriglia === 'DUPLEX'" class="flex items-center gap-2 text-[10px] font-bold text-yellow-400 cursor-pointer px-2 py-1 rounded uppercase">
              <input type="checkbox" v-model="copiaDuplex" :disabled="isLocked" class="rounded border-yellow-300 text-yellow-400">
              Copia
            </label>
        </div>
        <div v-if="catalog.loading" class="text-center p-4 text-sm text-gray-400">Caricamento...</div>
          <div v-else>
            <select v-model="tipoCanalino" :disabled="copiaDuplex || !tipiCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Tipo</option><option v-for="t in tipiCanalinoDisp" :key="t" :value="t">{{ t }}</option></select>
            <select v-if="tipoCanalino" v-model="dimensioneCanalino" :disabled="copiaDuplex || !dimensioniCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 mt-4 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Dimensione</option><option v-for="d in dimensioniCanalinoDisp" :key="d" :value="d">{{ d }}</option></select>
            <select v-if="dimensioneCanalino" v-model="finituraCanalino" :disabled="copiaDuplex || !finitureCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 mt-4 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Finitura</option><option v-for="f in finitureCanalinoDisp" :key="f" :value="f">{{ f }}</option></select>
          </div>
      </div>

      <div class="bg-white/50 backdrop-blur-sm backdrop-saturate-150 p-5 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all p-5 space-y-4 h-full">
        <h2 class="font-bold text-lg border-b pb-2 font-heading text-gray-800">3. Telaio</h2>
          <div class="grid grid-cols-2 gap-4">
            <div><input v-model.number="pannello.base" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-100" placeholder="Base (mm)"></div>
            <div><input v-model.number="pannello.altezza" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-100" placeholder="Altezza (mm)"></div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div>
              <input v-model.number="pannello.righe" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm disabled:bg-gray-100" placeholder="Vert">
            </div>
            <div>
              <input v-model.number="pannello.colonne" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm disabled:bg-gray-100" placeholder="Oriz">
            </div>
            <div>
              <input v-model.number="pannello.qty" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm disabled:bg-gray-100" placeholder="Q.tà">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 pt-4 border-t mt-4">
            <label 
              class="flex items-center space-x-2 cursor-pointer"
              title="Indica che le divisioni interne del telaio (montanti e traversi) non sono distanziate uniformemente." >
              <input type="checkbox" v-model="opzioniTelaio.nonEquidistanti" :disabled="isLocked" class="h-4 w-4 rounded border-teal-600 text-teal-400">
              <span class="text-[10px] text-gray-700 font-bold">Non Equidistanti</span>
            </label>
            <label 
              class="flex items-center space-x-2 cursor-pointer"
              title="Indica che il telaio ha una forma non rettangolare con una o più sezioni curve.">
              <input type="checkbox" v-model="opzioniTelaio.curva" :disabled="isLocked" class="h-4 w-4 rounded border-orange-760 text-orange-400">
              <span class="text-[10px] text-gray-700 font-bold">Curva</span>
            </label>
            <label 
              class="flex items-center space-x-2 cursor-pointer"
              title="Aggiunge un piccolo intaglio o un recesso (tacca) sul perimetro del telaio per facilitare l'installazione in profili specifici.">
              <input type="checkbox" v-model="opzioniTelaio.tacca" :disabled="isLocked" class="h-4 w-4 rounded border-gray-600 text-purple-400">
              <span class="text-[10px] text-gray-700 font-bold">Tacca</span>
            </label>
          </div>

          <button 
            @click="aggiungi" 
            :disabled="
              !pannello.base || 
              !pannello.altezza || 
              !finituraGriglia || 
              isLocked || 
              (categoriaGriglia === 'DUPLEX' && (!fuseruolo || Number(fuseruolo) <= 0))
            "
            class="w-full bg-yellow-200 hover:bg-yellow-300 text-yellow-600 font-bold py-3 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 transition-all flex justify-center items-center gap-2">
            <PlusCircleIcon class="h-7 w-7 text-yellow-600" />         
            AGGIUNGI
          </button>
      </div>

    </div>
    <div class="lg:col-span-2 bg-white/50 backdrop-blur-sm backdrop-saturate-150 rounded-xl shadow-lg border border-white/80 hover:shadow-xl transition-all flex flex-col min-h-[600px] overflow-hidden">
      <div v-if="isSaving" class="p-6 bg-gray-900/80 backdrop-blur-md text-white flex justify-center items-center h-[120px]">
          <span class="text-sm font-medium text-gray-400">Caricamento stato preventivo...</span>
          <svg class="animate-spin h-5 w-5 text-yellow-400 ml-3" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

        <div v-else class="p-6 bg-gray-900/80 backdrop-blur-md backdrop-saturate-150 text-white flex justify-between items-center border-b border-white/10">
          
          <div class="space-y-1">
            <div class="text-xs text-gray-400 uppercase tracking-widest font-bold">Totale Ordine</div>
            <div class="flex items-baseline gap-3">
              <template v-if="isAdmin || isStandard || ['QUOTE_READY', 'SIGNED', 'IN_PRODUZIONE', 'READY'].includes(statoCorrente)">
                <div class="text-3xl font-heading font-bold text-yellow-400">{{ totaleFinale.toFixed(2) }} €</div>
                <div v-if="scontoApplicato > 0" class="text-sm text-green-400 line-through opacity-60">{{ totaleImponibile.toFixed(2) }} €</div>
              </template>
              <div v-else class="text-xl font-bold text-gray-500">DA CALCOLARE</div>
            </div>
            <div class="mt-2">
              <span class="px-2 py-1 rounded text-xs font-bold border uppercase" 
                    :class="STATUS_DETAILS[statoCorrente as keyof typeof STATUS_DETAILS]?.badge || 'bg-gray-500 text-white'">
                {{ STATUS_DETAILS[statoCorrente as keyof typeof STATUS_DETAILS]?.label || statoCorrente }}
              </span>
            </div>
          </div>

          <div class="flex gap-3">
            
            <template v-if="isNewAdminOrder && !currentDocId">
                <div class="flex flex-col gap-2 w-full">
                    <button @click="salvaPreventivo('CREA_PREVENTIVO_ADMIN')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 w-full">
                        <DocumentTextIcon class="h-6 w-6"/> CREA PREVENTIVO
                    </button>
                    
                    <hr class="border-gray-600/20 my-1">
                    
                    <button @click="salvaPreventivo('CREA_ORDINE_ADMIN')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 w-full">
                        <CheckBadgeIcon class="h-6 w-6"/> CREA ORDINE
                    </button>
                </div>
            </template>

            <template v-else-if="isAdmin">
              
               <div v-if="statoCorrente === 'ORDER_REQ'" class="flex flex-col md:flex-row items-end md:items-center gap-6">
                <span class="text-xl text-gray-400 uppercase font-bold hidden xl:block">RICHIEDI CONFERMA D'ORDINE</span>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase font-bold text-yellow-500 flex items-center gap-1">
                    <CalendarIcon class="h-3 w-3 text-white" /> Data Consegna Prevista
                  </label>
                  <input type="date" v-model="dataConsegnaPrevista" class="bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm font-bold outline-none native-date-icon-fix transition-all duration-300" :class="{'focus:border-yellow-400': !dateErrorAnim, 'ring-4 ring-red-500 bg-red-900/50 border-red-500 animate-pulse': dateErrorAnim }">
                </div>
                <div class="flex gap-2">
                  <button @click="salvaPreventivo('ADMIN_FIRMA')" class="bg-blue-600 hover:bg-blue-500 text-blue-100 flex items-center px-6 py-3 rounded font-bold text-lg shadow-lg shadow-blue-600/20">FIRMA</button>
                </div>
              </div>
              
              <div v-else-if="statoCorrente === 'PENDING_VAL' || statoCorrente === 'DRAFT'" class="flex gap-2">
                <button @click="salvaPreventivo('ADMIN_VALIDA')" class="bg-yellow-400 hover:bg-yellow-300 text-yellow-900 flex items-center px-12 py-3 rounded font-bold text-xl">VALIDA E INVIA</button>
              </div>

              <div v-else>
                <button v-if="!isLocked" @click="salvaPreventivo()" class="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-black">💾 SALVA MODIFICHE</button>
                <span v-else class="text-gray-400 font-bold text-sm border border-gray-300 px-3 py-1 rounded bg-gray-50">🔒 SOLA LETTURA</span>
              </div>
            </template>

            <template v-else>
               <template v-if="statoCorrente === 'DRAFT'">
                <button @click="eliminaPreventivo()" class="bg-red-200 flex items-center gap-2 hover:bg-red-300 text-red-600 px-4 py-3 rounded-lg font-bold shadow-lg">ELIMINA</button>
                <button @click="salvaPreventivo()" class="bg-green-200 flex items-center gap-2 hover:bg-green-300 text-green-600 px-4 py-3 rounded-lg font-bold shadow-lg">SALVA</button>
                <button v-if="isStandard" @click="salvaPreventivo('ORDINA')" class="bg-yellow-400 flex items-center gap-2 hover:bg-yellow-300 text-yellow-900 px-12 py-3 rounded-lg font-bold shadow-lg"><ShoppingCartIcon class="h-7 w-7 text-yellow-900" /> ORDINA</button>
                <div v-else class="flex flex-col items-end">
                  <button @click="salvaPreventivo('RICHIEDI_VALIDAZIONE')" class="bg-yellow-400 hover:bg-yellow-500 text-black px-6 py-3 rounded-lg font-bold shadow-lg">INVIA PER VALIDAZIONE</button>
                  <span class="text-[10px] text-gray-400 mt-1">Richiesta verifica tecnica</span>
                </div>
              </template>

              <div v-else-if="statoCorrente === 'PENDING_VAL'" class="text-right">
                <span class="text-yellow-500 font-bold text-2xl flex items-center gap-2">IN ATTESA DI VALIDAZIONE</span>
              </div>

              <div v-else-if="statoCorrente === 'QUOTE_READY'" class="flex gap-3">
                <button @click="sbloccaPerModifica()" class="bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600 text-sm">MODIFICA</button>
                <button @click="salvaPreventivo('ORDINA')" class="bg-yellow-400 hover:bg-yellow-300 text-yellow-50 px-6 py-3 rounded-lg font-bold shadow-lg animate-pulse">CONFERMA ORDINE</button>
              </div>

              <template v-else-if="['WAITING_FAST', 'WAITING_SIGN'].includes(statoCorrente)">
                <button @click="apriModaleAzione()" class="bg-blue-600 hover:bg-blue-500 text-white px-12 py-3 rounded-lg font-bold shadow-lg animate-pulse flex items-center gap-2">
                  <ShoppingCartIcon class="h-7 w-7" /> {{ statoCorrente === 'WAITING_FAST' ? 'ACCETTA ORDINE' : 'FIRMA ORDINE' }}
                </button>
              </template>

              <div v-else-if="statoCorrente === 'REJECTED'" class="text-right px-4">
                <span class="text-red-500 font-bold text-2xl flex items-center gap-2"><InformationCircleIcon class="h-6 w-6" /> ANNULLATO</span>
              </div>

              <div v-else class="text-right px-4">
                <span class="text-yellow-500 font-bold text-2xl flex items-center gap-2">ORDINE IN LAVORAZIONE</span>
              </div>
            </template>
          </div>
        </div>

        <div class="p-5 border-b border-gray-200/60 flex justify-between items-center bg-gray-50/60 backdrop-blur-sm">
          <h2 class="font-bold text-lg font-heading text-gray-800">Dettaglio Elementi</h2>
          <span class="bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{{ preventivo.length }} Articoli</span>
        </div>

        <div class="flex-1 overflow-auto p-0">
          <table class="w-full text-left text-sm" v-if="preventivo.length">
            <thead class="bg-gray-50/50 backdrop-blur-sm text-gray-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 border-b border-gray-200/60 z-10">              <tr>
                <th class="p-3 pl-5">Articolo</th>
                <th class="p-3 text-center">Q.tà</th>
                <th class="p-3">Misure</th>
                <th class="p-3 text-center">Griglia</th>
                <th class="p-3 text-center">Opzioni</th>
                <th class="p-3 text-right">Totale</th>
                <th class="p-3 text-right w-16">Azioni</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="(r, idx) in preventivo" :key="r.id" class="hover:bg-yellow-50/30 transition-colors group">
                <td class="p-3 pl-5">
                  <div class="font-bold text-gray-900 text-sm">{{ r.descrizioneCompleta }}</div>
                  <div class="text-[10px] text-gray-500 uppercase mt-0.5 flex items-center gap-1">
                    {{ r.infoCanalino || (r.rawCanalino ? `${r.rawCanalino.tipo} ${r.rawCanalino.fin}` : 'Senza Canalino') }}
                  </div>
                </td>
                <td class="p-3 text-center"><span class="bg-gray-100 text-gray-700 font-bold px-2 py-1 rounded text-xs">{{ r.quantita }}</span></td>
                <td class="p-3 text-gray-600 text-xs">{{ r.base_mm }} x {{ r.altezza_mm }}</td>
                <td class="p-3 text-center text-xs text-gray-600">
                  {{ r.righe }} x {{ r.colonne }}
                </td>
                <td class="p-3 text-center">
                  <div class="flex justify-center gap-1 flex-wrap max-w-[100px] mx-auto">
                    <span v-if="r.nonEquidistanti" class="px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 text-[9px] font-bold border border-teal-200">Non Eq.</span>
                    <span v-if="r.curva" class="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[9px] font-bold border border-orange-200">Curva</span>
                    <span v-if="r.tacca" class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">Tacca</span>
                  </div>
                </td>

                <td class="p-3 text-right font-bold font-heading text-gray-900">
                  {{ (isAdmin || isStandard || ['QUOTE_READY', 'SIGNED', 'IN_PRODUZIONE', 'READY'].includes(statoCorrente)) ? r.prezzo_totale.toFixed(2) + ' €' : '-' }}
                </td>

                <td class="p-3 text-right">
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" v-if="!isLocked">
                    <button @click="modificaRiga(idx)" class="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition-colors" title="Modifica"><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                    <button @click="eliminaRiga(idx)" class="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors" title="Elimina"><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
            <br>
            <RectangleStackIcon class="h-10 w-10 text-black" />         
            <p>Inizia configurando il prodotto in alto</p>
          </div>
        </div>

        <div v-if="isAdmin" class="p-5 bg-slate-50 border-t border-gray-200 grid grid-cols-2 gap-6">
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase mb-1 block">Sconto Commerciale (%)</label>
            <div class="relative">
              <input v-model.number="scontoApplicato" type="number" class="w-full p-2 pr-8 border border-gray-300 rounded-md text-right font-bold text-green-700 outline-none focus:ring-2 focus:ring-green-200" placeholder="0">
              <span class="absolute right-3 top-2 text-gray-400 font-bold">%</span>
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase mb-1 block">Aggiungi Extra Manuale</label>
            <div class="flex gap-2">
              <input v-model="adminExtraDesc" type="text" class="flex-1 p-2 border border-gray-300 rounded-md text-sm outline-none">
              <input v-model.number="adminExtraPrice" type="number" class="w-20 p-2 border border-gray-300 rounded-md text-sm text-right outline-none">
              <button @click="aggiungiExtraAdmin" class="bg-gray-800 text-white w-8 rounded-md hover:bg-black shadow-sm flex items-center justify-center font-bold text-lg">+</button>
            </div>
          </div>
        </div>

      </div>
    </main>

    <div v-if="mostraStorico" class="fixed inset-0 z-50 flex justify-end">
      <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="mostraStorico = false"></div>
      <div class="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in">
        <div class="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 class="font-bold text-lg font-heading">Ultimi Preventivi</h2>
          <button @click="mostraStorico = false" class="p-2 hover:bg-gray-200 rounded-full" >✕</ button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-for="ordine in storicoPreventivi" :key="ordine.id" @click="codiceRicerca = ordine.codice; caricaPreventivo(); mostraStorico = false;"
            class="group border border-gray-200 rounded-lg p-4 hover:border-yellow-400 hover:bg-yellow-50 cursor-pointer transition-all shadow-sm relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1.5" :class="{'bg-gray-300': !ordine.stato || ordine.stato === 'DRAFT', 'bg-orange-500': ordine.stato === 'PENDING_VAL', 'bg-green-500': ordine.stato === 'QUOTE_READY' || ordine.stato === 'SIGNED', 'bg-purple-500': ordine.stato === 'ORDER_REQ', 'bg-red-500': ordine.stato === 'REJECTED'}"></div>
            <div class="flex justify-between items-start mb-1 pl-3">
              <span class="font-bold text-lg text-gray-800 truncate">{{ ordine.commessa || 'Senza Nome' }}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border" 
                    :class="STATUS_DETAILS[ordine.stato as keyof typeof STATUS_DETAILS]?.badge || 'bg-gray-100 text-gray-500 border-gray-200'">
                {{ STATUS_DETAILS[ordine.stato as keyof typeof STATUS_DETAILS]?.label || ordine.stato || 'BOZZA' }}
              </span>            </div>
            <div class="flex justify-between text-sm text-gray-500 pl-3 mt-1">
              <span class="font-mono text-xs bg-gray-100 px-1 rounded">{{ ordine.codice }}</span>
              <span>{{ ordine.dataLeggibile }}</span>
            </div>
            <div class="text-right font-bold text-gray-900 text-lg pl-3">{{ typeof ordine.totaleScontato === 'number' ? ordine.totaleScontato.toFixed(2) : (ordine.totaleImponibile || 0).toFixed(2) }} €</div>
          </div>
          <div v-if="storicoPreventivi.length === 0" class="text-center text-gray-400 py-10">Nessun preventivo salvato ancora.</div>
        </div>
      </div>
    </div>

    <OrderModals 
      :show="showModals"
      :mode="modalMode"
      :order="{ id: currentDocId, codice: codiceRicerca, totaleScontato: totaleFinale, elementi: preventivo, commessa: riferimentoCommessa }"
      :clientName="nomeCliente"
      @close="showModals = false"
      @confirmFast="onConfirmFast"
      @confirmSign="onConfirmSign"
    />
    <div 
      v-if="showToast" 
      class="fixed inset-0 z-[60] flex items-center justify-center transition-all duration-300"
      :class="showToast ? 'opacity-100 backdrop-blur-sm bg-black/10' : 'opacity-0'">
      <div 
        class="bg-gray-800 text-white px-6 py-3 rounded-xl shadow-2xl transition-all duration-300 transform scale-100"
        :class="showToast ? 'translate-y-0' : 'translate-y-10'">
        <p class="font-bold text-lg whitespace-nowrap">{{ toastMessage }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Stili per l'icona del calendario nativa (Chrome, Edge, Safari) */
.native-date-icon-fix::-webkit-calendar-picker-indicator {
    /* Rende l'icona completamente bianca (invertendo i colori e aumentando la luminosità) */
    filter: invert(1); 
    /* Forse la risoluzione su Firefox è sufficiente solo con la proprietà color: */
    color: white; 
    cursor: pointer;
}
.animate-slide-in { animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.card-dati-commessa {
  /* Imposta un margine di 24px sopra l'elemento quando viene portato in vista */
  scroll-margin-top: 24px; 
}
</style>