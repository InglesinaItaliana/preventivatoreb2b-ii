<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { 
  collection, addDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit 
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { useCatalogStore } from '../Data/catalog';
import type { Categoria, RigaPreventivo, StatoPreventivo, Allegato } from '../types';
import { calculatePrice } from '../logic/pricing'; 
import { onAuthStateChanged } from 'firebase/auth';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();

const nomeCliente = ref((route.query?.nome as string) || 'Cliente');
const clienteEmail = ref('');
const riferimentoCommessa = ref('');
const currentDocId = ref<string | null>(null); 
const statoCorrente = ref<StatoPreventivo>('DRAFT');

// Modale
const showLegalModal = ref(false);
const legalCheck1 = ref(false);
const legalCheck2 = ref(false);
const isConfirming = ref(false);

const noteCliente = ref('');
const scontoApplicato = ref(0);
const listaAllegati = ref<Allegato[]>([]);
const isUploading = ref(false);

const storicoPreventivi = ref<any[]>([]);
const mostraStorico = ref(false); 
const codiceRicerca = ref('');
const isSaving = ref(false);

const categoriaGriglia = ref<Categoria>('INGLESINA');
const tipoGriglia = ref('');
const dimensioneGriglia = ref('');
const finituraGriglia = ref('');
const tipoCanalino = ref('');
const dimensioneCanalino = ref('');
const finituraCanalino = ref('');
const copiaDuplex = ref(false);

const adminExtraDesc = ref('Supplemento');
const adminExtraPrice = ref(0);

const preventivo = ref<RigaPreventivo[]>([]);
const pannello = reactive({ base: 0, altezza: 0, righe: 0, colonne: 0, qty: 1 });
const opzioniTelaio = reactive({ nonEquidistanti: false, curva: false, tacca: false });

const isAdmin = computed(() => route.query?.admin === 'true');

// CALCOLI
const totaleImponibile = computed(() => preventivo.value.reduce((t, i) => t + i.prezzo_totale, 0));
const totaleFinale = computed(() => {
  const sconto = (totaleImponibile.value * scontoApplicato.value) / 100;
  return totaleImponibile.value - sconto;
});

const richiedeValidazione = computed(() => {
  const haCurve = preventivo.value.some(r => r.curva);
  const haNote = noteCliente.value.trim().length > 0;
  return haCurve || haNote;
});

const isLocked = computed(() => {
  if (isAdmin.value) return false; 
  return statoCorrente.value !== 'DRAFT' && statoCorrente.value !== 'QUOTE_READY'; 
});

// WATCHERS
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

// Fix TypeScript
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

  preventivo.value.push({
    id: Date.now().toString(),
    categoria: categoriaGriglia.value, modello: tipoGriglia.value as any, dimensione: dimensioneGriglia.value, finitura: finituraGriglia.value,
    base_mm: pannello.base, altezza_mm: pannello.altezza, righe: pannello.righe || 0, colonne: pannello.colonne || 0, quantita: pannello.qty,
    descrizioneCompleta: `${categoriaGriglia.value} ${tipoGriglia.value} ${dimensioneGriglia.value} - ${finituraGriglia.value}`,
    infoCanalino: `Canalino: ${tipoCanalino.value} ${dimensioneCanalino.value} ${finituraCanalino.value}`,
    prezzo_unitario: result.prezzo_unitario, prezzo_totale: result.prezzo_totale,
    nonEquidistanti: opzioniTelaio.nonEquidistanti, curva: opzioniTelaio.curva, tacca: opzioniTelaio.tacca,
    rawCanalino: { tipo: tipoCanalino.value, dim: dimensioneCanalino.value, fin: finituraCanalino.value }
  });
  Object.assign(pannello, { base: 0, altezza: 0, righe: 0, colonne: 0, qty: 1 });
  Object.assign(opzioniTelaio, { nonEquidistanti: false, curva: false, tacca: false });
};

const uploadFile = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
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
  } catch (e) { 
    alert("Errore upload."); 
    console.error(e); 
  } 
  finally { isUploading.value = false; }
};

const rimuoviAllegato = (index: number) => {
    if(confirm("Rimuovere allegato?")) listaAllegati.value.splice(index, 1);
};

// --- FUNZIONI NAVIGAZIONE ---

const vaiDashboard = () => {
  // Se ci sono modifiche non salvate, avvisa
  if (preventivo.value.length > 0 && !currentDocId.value) {
    if (!confirm("Hai un preventivo in corso non salvato. Vuoi uscire?")) return;
  }
  
  if (isAdmin.value) router.push('/admin');
  else router.push('/dashboard');
};

const nuovaCommessa = () => {
  if (preventivo.value.length > 0 && !confirm("Attenzione: perderai le modifiche non salvate. Iniziare una nuova commessa?")) {
    return;
  }
  
  // RESET TOTALE
  preventivo.value = [];
  currentDocId.value = null;
  statoCorrente.value = 'DRAFT';
  riferimentoCommessa.value = '';
  codiceRicerca.value = '';
  noteCliente.value = '';
  scontoApplicato.value = 0;
  listaAllegati.value = [];
  
  // Reset input parziali
  Object.assign(pannello, { base: 0, altezza: 0, righe: 0, colonne: 0, qty: 1 });
  Object.assign(opzioniTelaio, { nonEquidistanti: false, curva: false, tacca: false });
};

const salvaPreventivo = async (azione?: string) => {
  if (preventivo.value.length === 0) return alert("Preventivo vuoto.");

  isSaving.value = true;

  try {
    const codice = codiceRicerca.value || `${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // --- LOGICA STATI RIGIDA ---
    let nuovoStato: StatoPreventivo = 'DRAFT';

    // 1. Se sto solo salvando dati in bozza
    if (currentDocId.value && !azione) {
        nuovoStato = statoCorrente.value === 'DRAFT' ? 'DRAFT' : statoCorrente.value;
    }

    // 2. Se il cliente chiede validazione (O se ci sono curve/note) -> PENDING_VAL
    // (Questo vale per TUTTI gli ordini nuovi, indipendentemente dall'importo)
    if (azione === 'RICHIEDI_VALIDAZIONE' || richiedeValidazione.value) {
        // Non permettiamo di tornare indietro se è già approvato/firmato
        if (!['QUOTE_READY', 'SIGNED', 'IN_PRODUZIONE', 'ORDER_REQ', 'WAITING_SIGN'].includes(statoCorrente.value)) {
             nuovoStato = 'PENDING_VAL';
        }
    }

    // 3. Logica Admin
    if (isAdmin.value && azione) {
       if (azione === 'APPROVA') nuovoStato = 'QUOTE_READY';
       if (azione === 'RIFIUTA') nuovoStato = 'REJECTED';
    }
    
    // Casi speciali (Firma > 5000)
    if (azione === 'RICHIESTA_CONTRATTO') nuovoStato = 'ORDER_REQ';

    const docData = {
      codice, 
      cliente: nomeCliente.value,
      clienteEmail: clienteEmail.value, 
      commessa: riferimentoCommessa.value,
      
      totaleImponibile: totaleImponibile.value,
      scontoPercentuale: scontoApplicato.value,
      totaleScontato: totaleFinale.value,
      
      stato: nuovoStato,
      noteCliente: noteCliente.value,
      allegati: listaAllegati.value,
      
      dataModifica: serverTimestamp(),
      ...(currentDocId.value ? {} : { dataCreazione: serverTimestamp() }),
      dataScadenza: new Date(Date.now() + 30*24*60*60*1000),
      
      elementi: preventivo.value.map(r => ({ ...r }))
    };

    if (currentDocId.value) {
      await setDoc(doc(db, 'preventivi', currentDocId.value), docData, { merge: true });
    } else {
      const ref = await addDoc(collection(db, 'preventivi'), docData);
      currentDocId.value = ref.id; codiceRicerca.value = codice;
    }
    
    statoCorrente.value = nuovoStato;
    
    // Feedback
    let msg = "✅ Salvato.";
    if (nuovoStato === 'PENDING_VAL') msg = "⚠️ Inviato all'amministrazione per validazione.";
    if (nuovoStato === 'QUOTE_READY') msg = "✅ Preventivo Validato.";
    
    alert(msg);
    
    if (isAdmin.value) router.push('/admin');
    else caricaListaStorico();

  } catch (e) { alert("Errore salvataggio."); console.error(e); } 
  finally { isSaving.value = false; }
};

const confermaOrdineLegale = async () => {
    if (!legalCheck1.value || !legalCheck2.value) return alert("Devi accettare tutte le condizioni.");
    
    isConfirming.value = true;
    try {
        // ... (recupero IP e User uguale a prima) ...
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        const user = auth.currentUser;
        
        const datiLegali = {
            accettazioneTermini: true, accettazioneClausole: true,
            ipCliente: ipData.ip, userAgent: navigator.userAgent,
            dataFirma: new Date().toISOString(), firmatarioEmail: user?.email, firmatarioUid: user?.uid
        };

        // STATO FINALE: SIGNED (Perché siamo < 5000)
        const nextState = 'SIGNED'; 

        if (currentDocId.value) {
            await setDoc(doc(db, 'preventivi', currentDocId.value), {
                stato: nextState,
                datiLegali: datiLegali,
                dataOrdine: serverTimestamp(),
                dataConferma: serverTimestamp() // Aggiungiamo data conferma
            }, { merge: true });
        }

        alert(`✅ Ordine Confermato e Firmato Digitalmente!`);
        showLegalModal.value = false;
        statoCorrente.value = nextState;
        router.push('/dashboard');

    } catch(e) { console.error(e); alert("Errore firma"); }
    finally { isConfirming.value = false; }
};

const caricaPreventivo = async () => {
  if (!codiceRicerca.value) return;
  isSaving.value = true;
  try {
    const q = query(collection(db, 'preventivi'), where('codice', '==', codiceRicerca.value.trim().toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) return alert("Non trovato");
    const d = snap.docs[0].data();
    currentDocId.value = snap.docs[0].id;
    
    nomeCliente.value = d.cliente; riferimentoCommessa.value = d.commessa; statoCorrente.value = d.stato || 'DRAFT';
    noteCliente.value = d.noteCliente || ''; scontoApplicato.value = d.scontoPercentuale || 0; listaAllegati.value = d.allegati || [];
    
    preventivo.value = d.elementi.map((el: any) => ({
        ...el,
        nonEquidistanti: el.nonEquidistanti || false,
        rawCanalino: el.rawCanalino || null,
        righe: Number(el.righe) || 0,
        colonne: Number(el.colonne) || 0
    }));
  } catch(e) { console.error(e); } finally { isSaving.value = false; }
};

const caricaListaStorico = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    let q;
    if (isAdmin.value) {
         q = query(collection(db, 'preventivi'), orderBy('dataCreazione', 'desc'), limit(20));
    } else {
         // Query Ibrida
         q = query(collection(db, 'preventivi'), where('clienteEmail', '==', user.email), orderBy('dataCreazione', 'desc'), limit(20));
    }
    const s = await getDocs(q);
    storicoPreventivi.value = s.docs.map(d => ({ id: d.id, ...d.data(), stato: d.data().stato || 'DRAFT' }));
  } catch (e) { console.warn("Errore storico:", e); }
};

const modificaRiga = async (index: number) => {
    if (isLocked.value) return;
    const r = preventivo.value[index];
    categoriaGriglia.value = r?.categoria; await nextTick();
    tipoGriglia.value = r?.modello; await nextTick();
    dimensioneGriglia.value = r?.dimensione; await nextTick();
    finituraGriglia.value = r?.finitura;
    if (r?.rawCanalino) {
        tipoCanalino.value = r.rawCanalino.tipo; await nextTick();
        dimensioneCanalino.value = r.rawCanalino.dim; await nextTick();
        finituraCanalino.value = r.rawCanalino.fin;
    }
    pannello.base = r?.base_mm; pannello.altezza = r?.altezza_mm; 
    pannello.righe = r?.righe; pannello.colonne = r?.colonne; 
    pannello.qty = r?.quantita;
    opzioniTelaio.nonEquidistanti = r?.nonEquidistanti || false; opzioniTelaio.curva = r?.curva; opzioniTelaio.tacca = r?.tacca;
    preventivo.value.splice(index, 1);
};
const eliminaRiga = (i:number) => { if(!isLocked.value) preventivo.value.splice(i,1); };
const aggiungiExtraAdmin = () => {
    preventivo.value.push({ id: Date.now().toString(), categoria: 'EXTRA', modello: 'MANUALE' as any, dimensione:'-', finitura:'-', descrizioneCompleta:`[ADMIN] ${adminExtraDesc.value}`, infoCanalino:'', base_mm:0, altezza_mm:0, righe:0, colonne:0, quantita:1, prezzo_unitario:adminExtraPrice.value, prezzo_totale:adminExtraPrice.value, curva:false, tacca:false });
    adminExtraPrice.value=0;
};

onMounted(() => {
    catalog.fetchCatalog();
    const storedName = localStorage.getItem('clientName');
    if (storedName) nomeCliente.value = storedName;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            clienteEmail.value = user.email || '';
            caricaListaStorico();
        }
    });
    
    if(route.query.codice) { codiceRicerca.value = route.query.codice as string; setTimeout(caricaPreventivo, 1000); }
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20 font-sans">
    
    <header class="bg-white shadow-sm p-4 sticky top-0 z-30 border-b border-gray-200">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="flex items-center gap-4">
           <button @click="vaiDashboard" class="text-gray-400 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100" title="Torna alla Dashboard">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
           </button>
           
           <img src="/logo.svg" class="h-8 w-auto" alt="Logo" />
           <div class="pl-3 border-l border-gray-300">
             <div class="font-bold text-xl font-heading leading-none text-gray-800">PREVENTIVATORE</div>
             <div class="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">{{ nomeCliente }}</div>
           </div>
        </div>
        
        <div class="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-1.5 border border-gray-200 shadow-inner">
            
          <button @click="nuovaCommessa" class="text-xs font-bold text-green-700 hover:bg-green-50 px-2 py-1 rounded uppercase flex items-center gap-1 mr-2 border-r border-gray-300 pr-3">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
             NUOVO
          </button>

          <button @click="mostraStorico = true" class="text-sm font-bold text-gray-600 hover:text-black flex items-center gap-2 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Storico
          </button>
          <div class="w-px h-4 bg-gray-300 mx-2"></div>
          <input v-model="codiceRicerca" @keyup.enter="caricaPreventivo" type="text" placeholder="CERCA CODICE" class="bg-transparent border-none outline-none text-sm w-32 uppercase font-mono placeholder-gray-400">
          <button @click="caricaPreventivo" class="text-xs font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded uppercase">Apri</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      
      <div class="lg:col-span-1 space-y-6">
        
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-5">
            <h2 class="font-bold text-lg font-heading border-b pb-2 flex items-center gap-2 text-gray-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-yellow-500"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                Dati Commessa
            </h2>
            
            <div>
               <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Riferimento Cantiere</label>
               <input v-model="riferimentoCommessa" :disabled="isLocked" type="text" class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all" placeholder="Es. Rossi Cucina">
            </div>
            
            <div>
                <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Note Tecniche (Opzionale)</label>
                <textarea v-model="noteCliente" :disabled="isLocked" rows="2" class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition-all" placeholder="Es. Consegna tassativa entro..."></textarea>
                <div v-if="noteCliente" class="flex items-center gap-1 mt-1 text-orange-600 text-xs font-bold animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                    Richiede validazione
                </div>
            </div>
            <div>
                <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Allegati (PDF, DWG)</label>
                <div class="relative border-2 border-dashed border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:border-yellow-400 transition-all text-center cursor-pointer group" :class="isLocked ? 'opacity-50 pointer-events-none' : ''">
                    <input type="file" @change="uploadFile" :disabled="isLocked" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                    <div v-if="isUploading" class="flex flex-col items-center gap-2">
                        <svg class="animate-spin h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span class="text-xs font-bold text-gray-500">Caricamento...</span>
                    </div>
                    <div v-else class="flex flex-col items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-300 group-hover:text-yellow-500 transition-colors"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                        <span class="text-xs text-gray-400"><strong class="text-yellow-600">Clicca</strong> o trascina file</span>
                    </div>
                </div>
                <div v-if="listaAllegati.length > 0" class="mt-3 space-y-2">
                    <div v-for="(file, idx) in listaAllegati" :key="file.url" class="flex justify-between items-center text-xs bg-gray-50 border border-gray-200 p-2 rounded-md">
                        <a :href="file.url" target="_blank" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium truncate max-w-[180px]">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-gray-400"><path fill-rule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.551a.75.75 0 111.061 1.06l-3.45 3.551a1.125 1.125 0 001.587 1.595l3.456-3.553a3 3 0 000-4.242z" clip-rule="evenodd" /></svg>
                            {{ file.nome }}
                        </a>
                        <button @click="rimuoviAllegato(idx)" :disabled="isLocked" class="text-gray-400 hover:text-red-500 p-1 disabled:opacity-30"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg></button>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 class="font-bold text-lg border-b pb-2 font-heading text-gray-800">1. Griglia</h2>
          <div v-if="catalog.loading" class="text-center p-4 text-sm text-gray-400">Caricamento...</div>
          <div v-else>
            <div class="flex bg-gray-50 p-1 rounded-lg">
              <button v-for="c in categorieGrigliaDisp" :key="c" @click="categoriaGriglia = c as Categoria" :disabled="isLocked" :class="categoriaGriglia === c ? 'bg-white shadow text-black' : 'text-gray-500'" class="flex-1 py-2 text-xs font-bold rounded-md transition-all uppercase disabled:opacity-50">{{ c }}</button>
            </div>
            <select v-model="tipoGriglia" :disabled="!tipiGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Tipo</option><option v-for="m in tipiGrigliaDisp" :key="m" :value="m">{{ m }}</option></select>
            <select v-if="tipoGriglia" v-model="dimensioneGriglia" :disabled="!dimensioniGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Dimensione</option><option v-for="d in dimensioniGrigliaDisp" :key="d" :value="d">{{ d }}</option></select>
            <select v-if="dimensioneGriglia" v-model="finituraGriglia" :disabled="!finitureGrigliaDisp.length || isLocked" class="w-full p-2 border rounded mt-4 bg-white text-sm disabled:opacity-60"><option value="" disabled>Seleziona Finitura</option><option v-for="f in finitureGrigliaDisp" :key="f" :value="f">{{ f }}</option></select>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div class="flex justify-between items-center border-b pb-2">
              <h2 class="font-bold text-lg font-heading text-gray-800">2. Canalino</h2>
              <label v-if="categoriaGriglia === 'DUPLEX'" class="flex items-center gap-2 text-[10px] font-bold text-blue-600 cursor-pointer bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 uppercase">
                  <input type="checkbox" v-model="copiaDuplex" :disabled="isLocked" class="rounded border-blue-300 text-blue-600 focus:ring-blue-500">
                  Copia da Griglia
              </label>
            </div>
             <div v-if="catalog.loading" class="text-center p-4 text-sm text-gray-400">Caricamento...</div>
             <div v-else>
              <select v-model="tipoCanalino" :disabled="copiaDuplex || !tipiCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Tipo</option><option v-for="t in tipiCanalinoDisp" :key="t" :value="t">{{ t }}</option></select>
              <select v-if="tipoCanalino" v-model="dimensioneCanalino" :disabled="copiaDuplex || !dimensioniCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 mt-4 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Dimensione</option><option v-for="d in dimensioniCanalinoDisp" :key="d" :value="d">{{ d }}</option></select>
              <select v-if="dimensioneCanalino" v-model="finituraCanalino" :disabled="copiaDuplex || !finitureCanalinoDisp.length || isLocked" class="w-full p-2 border rounded bg-gray-50 mt-4 text-sm disabled:opacity-60"><option value="" disabled>Seleziona Finitura</option><option v-for="f in finitureCanalinoDisp" :key="f" :value="f">{{ f }}</option></select>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4" :class="{'opacity-50': !finituraGriglia}">
          <h2 class="font-bold text-lg border-b pb-2 font-heading text-gray-800">3. Telaio</h2>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Base (mm)</label><input v-model.number="pannello.base" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-100"></div>
            <div><label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Altezza (mm)</label><input v-model.number="pannello.altezza" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-sm focus:ring-2 focus:ring-yellow-400 outline-none disabled:bg-gray-100"></div>
          </div>
          
          <div class="grid grid-cols-3 gap-2">
            <div>
               <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block text-center">Verticali</label>
               <input v-model.number="pannello.righe" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm disabled:bg-gray-100" placeholder="0">
            </div>
            <div>
               <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block text-center">Orizz.</label>
               <input v-model.number="pannello.colonne" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center text-sm disabled:bg-gray-100" placeholder="0">
            </div>
            <div>
               <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block text-center">Q.tà</label>
               <input v-model.number="pannello.qty" :disabled="isLocked" type="number" class="border p-2 rounded w-full text-center font-bold bg-yellow-50 text-sm disabled:bg-gray-100">
            </div>
          </div>

           <div class="grid grid-cols-3 gap-4 pt-4 border-t mt-4">
                <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" v-model="opzioniTelaio.nonEquidistanti" :disabled="isLocked" class="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"><span class="text-xs text-gray-700 font-bold">Non Equid.</span></label>
                 <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" v-model="opzioniTelaio.curva" :disabled="isLocked" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"><span class="text-xs text-gray-700 font-bold">Curva</span></label>
                 <label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" v-model="opzioniTelaio.tacca" :disabled="isLocked" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"><span class="text-xs text-gray-700 font-bold">Tacca</span></label>
            </div>
          
          <button 
            @click="aggiungi" 
            :disabled="!pannello.base || !pannello.altezza || !finituraGriglia || isLocked" 
            class="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 transition-all flex justify-center items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" /></svg>
            AGGIUNGI PANNELLO
          </button>
        </div>

      </div>

      <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-[600px] overflow-hidden">
        
        <div class="p-6 bg-gray-900 text-white flex justify-between items-center">
            <div class="space-y-1">
                <div class="text-xs text-gray-400 uppercase tracking-widest font-bold">Totale Ordine</div>
                <div class="flex items-baseline gap-3">
                    <div class="text-3xl font-heading font-bold text-yellow-400">{{ totaleFinale.toFixed(2) }} €</div>
                    <div v-if="scontoApplicato > 0" class="text-sm text-green-400 line-through opacity-60">{{ totaleImponibile.toFixed(2) }} €</div>
                </div>
                <div class="mt-2">
                    <span v-if="statoCorrente === 'QUOTE_READY'" class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold border border-green-500/50">✅ PREVENTIVO PRONTO</span>
                    <span v-else-if="statoCorrente === 'PENDING_VAL'" class="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs font-bold border border-orange-500/50">⚠️ DA VALIDARE</span>
                    <span v-else-if="statoCorrente === 'ORDER_REQ'" class="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-bold border border-purple-500/50">🚀 ORDINE RICHIESTO</span>
                </div>
            </div>

            <div class="flex gap-3">
                <template v-if="!isAdmin">
                    
                    <div v-if="statoCorrente === 'QUOTE_READY'">
                        <button 
                            @click="avviaProceduraOrdine" 
                            class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-green-900/30 flex items-center gap-2 animate-pulse"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                            CONFERMA ORDINE
                        </button>
                    </div>

                    <div v-else-if="statoCorrente === 'PENDING_VAL'">
                         <button disabled class="bg-orange-100 text-orange-500 px-6 py-3 rounded-lg font-bold cursor-not-allowed border border-orange-200 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" /></svg>
                            IN ATTESA DI VALIDAZIONE...
                        </button>
                    </div>

                    <div v-else-if="['ORDER_REQ', 'WAITING_SIGN', 'SIGNED', 'IN_PRODUZIONE'].includes(statoCorrente)" class="text-right px-4">
                        <span class="text-sm font-bold text-gray-600">Ordine in lavorazione</span>
                    </div>

                    <div v-else>
                        <button 
                            @click="salvaPreventivo('RICHIEDI_VALIDAZIONE')" 
                            :disabled="preventivo.length === 0"
                            class="bg-yellow-400 hover:bg-yellow-500 text-black px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                        >
                            INVIA PER VALIDAZIONE
                        </button>
                    </div>
                </template>

                <template v-else>
                    <div v-if="statoCorrente === 'ORDER_REQ'" class="flex gap-2">
                        <button @click="alert('Usa la Dashboard per inviare la mail di conferma!')" class="bg-purple-100 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg font-bold hover:bg-purple-200">
                            📧 GESTISCI ORDINE
                        </button>
                        <button @click="salvaPreventivo()" class="text-gray-400 hover:text-gray-600 text-xs underline">Salva forzato</button>
                    </div>

                    <div v-else-if="statoCorrente === 'PENDING_VAL' || statoCorrente === 'DRAFT'" class="flex gap-2">
                        <button @click="salvaPreventivo('RIFIUTA')" class="text-red-400 hover:text-red-300 font-bold px-4 text-sm">RIFIUTA</button>
                        <button @click="salvaPreventivo('APPROVA')" class="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2">
                            VALIDA E INVIA
                        </button>
                    </div>

                    <div v-else>
                        <button @click="salvaPreventivo()" class="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-black">
                            💾 SALVA MODIFICHE
                        </button>
                    </div>
                </template>
            </div>
        </div>

        <div class="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 class="font-bold text-lg font-heading text-gray-800">Dettaglio Elementi</h2>
          <span class="bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{{ preventivo.length }} Articoli</span>
        </div>

        <div class="flex-1 overflow-auto p-0">
          <table class="w-full text-left text-sm" v-if="preventivo.length">
            <thead class="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 border-b border-gray-100">
              <tr>
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
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    {{ r.infoCanalino || (r.rawCanalino ? `${r.rawCanalino.tipo} ${r.rawCanalino.fin}` : 'Senza Canalino') }}
                  </div>
                </td>
                <td class="p-3 text-center"><span class="bg-gray-100 text-gray-700 font-bold px-2 py-1 rounded text-xs">{{ r.quantita }}</span></td>
                <td class="p-3 text-gray-600 text-xs font-mono">{{ r.base_mm }} x {{ r.altezza_mm }}</td>
                
                <td class="p-3 text-center text-xs font-mono text-blue-600 bg-blue-50/30 rounded">
                    <div v-if="r.righe > 0 || r.colonne > 0">{{ r.righe }}V x {{ r.colonne }}O</div>
                    <div v-else class="text-gray-300">-</div>
                </td>

                <td class="p-3 text-center">
                    <div class="flex justify-center gap-1 flex-wrap max-w-[100px] mx-auto">
                        <span v-if="r.nonEquidistanti" class="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold border border-red-200">Non Eq.</span>
                        <span v-if="r.curva" class="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[9px] font-bold border border-orange-200">Curva</span>
                        <span v-if="r.tacca" class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200">Tacca</span>
                    </div>
                </td>

                <td class="p-3 text-right font-bold font-heading text-gray-900">{{ r.prezzo_totale.toFixed(2) }} €</td>
                
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
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <p>Inizia configurando il prodotto a sinistra</p>
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
          <button @click="mostraStorico = false" class="p-2 hover:bg-gray-200 rounded-full">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-for="ordine in storicoPreventivi" :key="ordine.id" @click="codiceRicerca = ordine.codice; caricaPreventivo(); mostraStorico = false;" class="group border border-gray-200 rounded-lg p-4 hover:border-yellow-400 hover:bg-yellow-50 cursor-pointer transition-all shadow-sm relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1.5" :class="{'bg-gray-300': !ordine.stato || ordine.stato === 'DRAFT', 'bg-orange-500': ordine.stato === 'PENDING_VAL', 'bg-green-500': ordine.stato === 'QUOTE_READY' || ordine.stato === 'SIGNED', 'bg-purple-500': ordine.stato === 'ORDER_REQ', 'bg-red-500': ordine.stato === 'REJECTED'}"></div>
            <div class="flex justify-between items-start mb-1 pl-3">
              <span class="font-bold text-lg text-gray-800 truncate">{{ ordine.commessa || 'Senza Nome' }}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border" :class="{'bg-gray-100 text-gray-500 border-gray-200': !ordine.stato || ordine.stato === 'DRAFT', 'bg-orange-50 text-orange-600 border-orange-200': ordine.stato === 'PENDING_VAL', 'bg-green-50 text-green-600 border-green-200': ordine.stato === 'QUOTE_READY', 'bg-purple-50 text-purple-600 border-purple-200': ordine.stato === 'ORDER_REQ'}">{{ ordine.stato || 'DRAFT' }}</span>
            </div>
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

    <div v-if="showLegalModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in-up">
        <div class="bg-yellow-400 p-4 flex items-center gap-3">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           <h2 class="font-heading font-bold text-lg text-black">Conferma D'Ordine Ufficiale</h2>
        </div>
        <div class="p-6 space-y-4">
           <p class="text-sm text-gray-600">Stai per confermare l'ordine <strong>{{ codiceRicerca || 'BOZZA' }}</strong> per un totale di <strong>{{ totaleFinale.toFixed(2) }} €</strong>. Azione vincolante.</p>
           <div class="bg-gray-50 p-3 rounded border border-gray-200 text-xs text-gray-500 font-mono">👤 {{ auth.currentUser?.email }}<br>📅 {{ new Date().toLocaleDateString() }}</div>
           <div class="space-y-3 mt-4">
              <label class="flex items-start gap-3 cursor-pointer"><input type="checkbox" v-model="legalCheck1" class="mt-1 h-4 w-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"><span class="text-sm text-gray-800">Accetto l'ordine come descritto.</span></label>
              <label class="flex items-start gap-3 cursor-pointer"><input type="checkbox" v-model="legalCheck2" class="mt-1 h-4 w-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"><span class="text-sm text-gray-800">Accetto Condizioni Generali di Vendita.</span></label>
           </div>
        </div>
        <div class="p-4 bg-gray-50 border-t flex justify-end gap-3">
           <button @click="showLegalModal = false" class="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg">Annulla</button>
           <button @click="confermaOrdineLegale" :disabled="!legalCheck1 || !legalCheck2 || isConfirming" class="px-6 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
             <svg v-if="isConfirming" class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
             {{ isConfirming ? 'FIRMA...' : 'CONFERMA' }}
           </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-slide-in { animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.animate-fade-in-up { animation: fadeInUp 0.4s ease-out; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>