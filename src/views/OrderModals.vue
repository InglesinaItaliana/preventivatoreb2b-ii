<script setup lang="ts">
import { ref, computed } from 'vue';
import { jsPDF } from "jspdf";
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { 
  CheckCircleIcon, DocumentTextIcon, CloudArrowUpIcon 
} from '@heroicons/vue/24/outline';

const props = defineProps<{
  show: boolean;
  mode: 'FAST' | 'SIGN';
  order: any; // Oggetto con { id, codice, totale, elementi... }
  clientName: string;
}>();

const emit = defineEmits(['close', 'confirmFast', 'confirmSign']);

// STATO INTERNO FAST TRACK
const legalCheck1 = ref(false);
const legalCheck2 = ref(false);
const isConfirming = ref(false);

// STATO INTERNO FIRMA
const isUploading = ref(false);
const uploadedUrl = ref('');

// CHIUSURA
const close = () => {
  // Reset stati
  legalCheck1.value = false; legalCheck2.value = false; isConfirming.value = false;
  uploadedUrl.value = ''; isUploading.value = false;
  emit('close');
};

// AZIONE 1: FAST TRACK
const handleFastConfirm = async () => {
  isConfirming.value = true;
  // Simuliamo un piccolo delay per UX
  await new Promise(r => setTimeout(r, 500));
  emit('confirmFast'); // Il genitore farà il salvataggio su DB
  isConfirming.value = false;
};

// AZIONE 2: GENERAZIONE PDF
const downloadPdf = () => {
  const doc = new jsPDF();
  const p = props.order;
  const tot = p.totaleScontato || p.totaleImponibile || p.totale || 0;

  doc.setFontSize(20); doc.text("CONTRATTO DI FORNITURA", 20, 20);
  doc.setFontSize(12); doc.text(`Rif: ${p.codice}`, 20, 30);
  doc.text(`Cliente: ${props.clientName}`, 20, 40);
  doc.text(`Commessa: ${p.commessa || '-'}`, 20, 50);

  doc.line(20, 60, 190, 60);
  let y = 70;
  
  // Gestione sicura degli elementi
  const items = p.elementi || [];
  items.slice(0, 15).forEach((el: any) => {
    const desc = el.descrizioneCompleta || 'Articolo';
    const dims = el.base_mm ? `(${el.base_mm}x${el.altezza_mm})` : '';
    doc.text(`- ${el.quantita}x ${desc} ${dims}`, 20, y);
    y += 8;
  });

  doc.setFontSize(14);
  doc.text(`TOTALE: ${Number(tot).toFixed(2)} €`, 140, y + 10);

  doc.setFontSize(10);
  doc.text("Firma per accettazione:", 20, 250);
  doc.line(20, 265, 100, 265);

  doc.save(`Contratto_${p.codice}.pdf`);
};

// AZIONE 3: UPLOAD FIRMA
const handleUpload = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (!files || !files.length) return;
  
  isUploading.value = true;
  try {
    const file = files[0];
    // Percorso univoco
    const path = `contratti_firmati/${props.order.codice}_${Date.now()}_${file.name}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    uploadedUrl.value = await getDownloadURL(fileRef);
  } catch (e) {
    console.error(e);
    alert("Errore durante il caricamento del file.");
  } finally {
    isUploading.value = false;
  }
};

const handleSignConfirm = () => {
  emit('confirmSign', uploadedUrl.value);
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    
    <div v-if="mode === 'FAST'" class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
      <div class="flex items-center gap-3 mb-4 text-blue-600">
        <CheckCircleIcon class="w-8 h-8" />
        <h2 class="font-bold text-lg text-gray-900">Conferma Ordine Veloce</h2>
      </div>
      
      <div class="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4 border border-blue-100">
        <p>Ordine: <strong>{{ order.codice }}</strong></p>
        <p class="font-bold mt-1 text-lg">Totale: {{ (order.totaleScontato || order.totaleImponibile || 0).toFixed(2) }} €</p>
      </div>

      <div class="space-y-4">
        <label class="flex items-start gap-3 cursor-pointer group select-none">
          <div class="relative flex items-center mt-0.5">
            <input type="checkbox" v-model="legalCheck1" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
            <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="text-sm text-gray-700 group-hover:text-black transition-colors">Dichiaro di accettare l'ordine esattamente come descritto nel riepilogo.</span>
        </label>
        
        <label class="flex items-start gap-3 cursor-pointer group select-none">
          <div class="relative flex items-center mt-0.5">
            <input type="checkbox" v-model="legalCheck2" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
            <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="text-sm text-gray-700 group-hover:text-black transition-colors">Ho letto e accetto le Condizioni Generali di Vendita.</span>
        </label>
      </div>

      <div class="flex justify-end gap-3 mt-8 border-t pt-4">
        <button @click="close" class="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Annulla</button>
        <button 
          @click="handleFastConfirm" 
          :disabled="!legalCheck1 || !legalCheck2 || isConfirming" 
          class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          <span v-if="isConfirming" class="animate-spin">⌛</span>
          {{ isConfirming ? 'Attendere...' : 'CONFERMA DEFINITIVA' }}
        </button>
      </div>
    </div>

    <div v-if="mode === 'SIGN'" class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
      <div class="bg-blue-600 p-5 text-white flex justify-between items-center">
        <h2 class="font-bold text-lg flex items-center gap-2"><DocumentTextIcon class="w-6 h-6"/> Firma Contratto</h2>
        <button @click="close" class="text-white hover:text-blue-200">✕</button>
      </div>
      <div class="p-6 space-y-6">
        <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
          Per procedere è necessario firmare il contratto.
        </div>

        <div class="flex items-center gap-4 border p-3 rounded-lg hover:bg-gray-50 transition-colors">
          <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">1</div>
          <div class="flex-1"><p class="text-sm font-bold text-gray-700">Scarica il Modulo PDF</p></div>
          <button @click="downloadPdf" class="text-blue-600 font-bold text-sm underline hover:text-blue-800">Scarica</button>
        </div>

        <div class="flex items-start gap-4">
          <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">2</div>
          <div class="flex-1">
            <p class="text-sm font-bold mb-2 text-gray-700">Carica il file firmato</p>
            <div class="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer">
              <input type="file" @change="handleUpload" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
              
              <div v-if="isUploading" class="flex flex-col items-center text-blue-500">
                <span class="animate-spin text-2xl">⌛</span>
                <span class="text-xs font-bold mt-2">Caricamento in corso...</span>
              </div>
              
              <div v-else-if="uploadedUrl" class="flex flex-col items-center text-green-600 animate-bounce">
                <CheckCircleIcon class="w-10 h-10"/>
                <span class="font-bold mt-1">File Caricato con Successo!</span>
                <span class="text-xs text-gray-400 mt-1">Clicca per cambiarlo</span>
              </div>
              
              <div v-else class="flex flex-col items-center text-gray-400">
                <CloudArrowUpIcon class="w-10 h-10 mb-2"/>
                <span class="text-sm font-bold">Clicca qui per caricare</span>
                <span class="text-xs">PDF o Immagine (Max 10MB)</span>
              </div>
            </div>
          </div>
        </div>

        <button
          @click="handleSignConfirm"
          :disabled="!uploadedUrl"
          class="w-full py-3 rounded-lg font-bold shadow-md transition-all flex justify-center items-center gap-2 mt-2"
          :class="uploadedUrl ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
        >
          INVIA ORDINE FIRMATO
        </button>
      </div>
    </div>

  </div>
</template>