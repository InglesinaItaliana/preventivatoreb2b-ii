<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { 
  CheckCircleIcon, DocumentTextIcon, CloudArrowUpIcon, CogIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, EyeIcon 
} from '@heroicons/vue/24/solid';

const props = defineProps<{
  show: boolean;
  mode: 'FAST' | 'SIGN' | 'PRODUCTION';
  order: any; 
  clientName: string;
}>();

const emit = defineEmits(['close', 'confirmFast', 'confirmSign', 'confirmProduction', 'error']);

// STATO INTERNO
const legalCheck1 = ref(false);
const legalCheck2 = ref(false);
const isConfirming = ref(false);
const isUploading = ref(false);
const uploadedUrl = ref('');

// Reset quando si apre
watch(() => props.show, (val) => {
  if (val) {
    legalCheck1.value = false;
    legalCheck2.value = false;
    isConfirming.value = false;
    uploadedUrl.value = '';
    isUploading.value = false;
  }
});

const close = () => emit('close');

const handleFastConfirm = async () => {
  isConfirming.value = true;
  await new Promise(r => setTimeout(r, 500)); 
  emit('confirmFast');
  isConfirming.value = false;
};

const openDocument = () => {
  if (props.order?.fic_order_url) {
    window.open(props.order.fic_order_url, '_blank');
  } else {
    emit('error', 'Il documento non è ancora pronto o non è stato generato. Attendi qualche secondo e riprova.');
  }
};

const openConditions = () => {
    // Placeholder per il file condizioni
    // window.open('LINK_CONDIZIONI', '_blank');
    emit('error', 'File condizioni non ancora disponibile');
};

const handleUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file) return; 
  
  isUploading.value = true;
  try {
    const path = `contratti_firmati/${props.order.codice}_${Date.now()}_${file.name}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    uploadedUrl.value = await getDownloadURL(fileRef);
  } catch (e) {
    console.error(e);
    emit('error', "Errore durante il caricamento del file.")
  } finally {
    isUploading.value = false;
  }
};

const handleSignConfirm = () => {
  emit('confirmSign', uploadedUrl.value);
};

// --- LOGICA PRODUZIONE ---
const copiedState = ref<Record<string, boolean>>({});

// Raggruppa elementi per Descrizione e Canalino
const groupedElements = computed(() => {
  if (!props.order?.elementi) return {};
  const groups: Record<string, any[]> = {};
  props.order.elementi.forEach((el: any) => {
    const key = `${el.descrizioneCompleta} ◆ ${el.infoCanalino || 'Nessun canalino'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(el);
  });
  return groups;
});

const copyToClipboard = (key: string, items: any[]) => {
  const rows = items.map(i => `${i.quantita}\t${i.base_mm}\t${i.altezza_mm}\t${i.righe || 0}\t${i.colonne || 0}`);
  const textToCopy = rows.join('\n');
  navigator.clipboard.writeText(textToCopy).then(() => {
    copiedState.value[key] = true;
    setTimeout(() => copiedState.value[key] = false, 2000);
  });
};

const handleProductionConfirm = () => emit('confirmProduction');
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    
    <div v-if="mode === 'FAST'" class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
      <div class="flex items-center gap-3 mb-4 text-blue-600">
        <CheckCircleIcon class="w-8 h-8" />
        <h2 class="font-bold text-lg text-gray-900">Conferma Ordine Veloce</h2>
      </div>
      
      <div class="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4 border border-blue-100">
        <div class="flex justify-between items-start">
          <div>
            <p>Ordine: <strong>{{ order?.codice }}</strong></p>
            <p class="font-bold mt-1 text-lg">Totale: {{ (order?.totaleScontato || order?.totaleImponibile || 0).toFixed(2) }} €</p>
          </div>
          <button @click="openDocument" class="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-bold border border-blue-200 bg-white px-2 py-1 rounded shadow-sm hover:bg-blue-50 transition-colors">
            <EyeIcon class="w-3 h-3"/> VEDI DOC
          </button>
        </div>
      </div>

      <div class="space-y-4">
        <label class="flex items-start gap-3 cursor-pointer group select-none">
          <div class="relative flex items-center mt-0.5">
            <input type="checkbox" v-model="legalCheck1" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
            <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="text-sm text-gray-700 group-hover:text-black transition-colors">Dichiaro di accettare l'ordine esattamente come descritto nel documento allegato.</span>
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
      
      <div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        
        <div class="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800">
          Per procedere è necessario scaricare, firmare e ricaricare il contratto.
        </div>

        <div class="border border-gray-200 rounded-xl p-4 flex items-center gap-4 bg-white shadow-sm hover:border-blue-300 transition-colors">
          <div class="h-8 w-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 shrink-0">1</div>
          <div class="flex-1 font-bold text-gray-700 text-sm">Scarica Contratto</div>
          <button @click="openDocument" class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
            <EyeIcon class="w-4 h-4"/> APRI FILE
          </button>
        </div>

        <div class="border border-gray-200 rounded-xl p-4 flex items-start gap-4 bg-white shadow-sm hover:border-blue-300 transition-colors">
          <div class="h-8 w-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 shrink-0">2</div>
          <div class="flex-1 w-full">
            <p class="text-sm font-bold text-gray-700 mb-2">Carica file firmato</p>
            <div class="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-blue-50 hover:border-blue-400 transition-colors cursor-pointer group">
              <input type="file" @change="handleUpload" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
              
              <div v-if="isUploading" class="flex flex-col items-center text-blue-500">
                <span class="animate-spin text-2xl">⌛</span>
                <span class="text-xs font-bold mt-2">Caricamento...</span>
              </div>
              
              <div v-else-if="uploadedUrl" class="flex flex-col items-center text-green-600 animate-bounce">
                <CheckCircleIcon class="w-8 h-8"/>
                <span class="font-bold mt-1 text-sm">Caricato!</span>
                <span class="text-[10px] text-gray-400">Clicca per cambiare</span>
              </div>
              
              <div v-else class="flex flex-col items-center text-gray-400 group-hover:text-blue-500 transition-colors">
                <CloudArrowUpIcon class="w-8 h-8 mb-1"/>
                <span class="text-xs font-bold">Clicca per caricare</span>
                <span class="text-[10px]">PDF/IMG (Max 10MB)</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border border-gray-200 rounded-xl p-4 flex items-start gap-4 bg-white shadow-sm hover:border-blue-300 transition-colors">
            <div class="h-8 w-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-500 shrink-0">3</div>
            <div class="flex-1 space-y-3 w-full">
                
                <label class="flex items-start gap-3 cursor-pointer group select-none">
                    <div class="relative flex items-center mt-0.5">
                    <input type="checkbox" v-model="legalCheck1" class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
                    <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <span class="text-xs text-gray-700 group-hover:text-black transition-colors font-medium leading-tight">Accetto l'ordine come descritto nel documento.</span>
                </label>
                
                <div class="flex items-start justify-between gap-2">
                    <label class="flex items-start gap-3 cursor-pointer group select-none">
                        <div class="relative flex items-center mt-0.5">
                        <input type="checkbox" v-model="legalCheck2" class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-400 focus:ring-blue-200">
                        <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                        <span class="text-xs text-gray-700 group-hover:text-black transition-colors font-medium leading-tight">Accetto Condizioni di Vendita.</span>
                    </label>
                    
                    <button @click="openConditions" class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap">
                        <EyeIcon class="w-4 h-4"/> VEDI FILE
                    </button>
                </div>

            </div>
        </div>

        <button
          @click="handleSignConfirm"
          :disabled="!uploadedUrl || !legalCheck1 || !legalCheck2"
          class="w-full py-3 rounded-lg font-bold shadow-md transition-all flex justify-center items-center gap-2 mt-2"
          :class="(uploadedUrl && legalCheck1 && legalCheck2) ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
        >
          INVIA ORDINE FIRMATO
        </button>
      </div>
    </div>

    <div v-if="mode === 'PRODUCTION'" class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
      <div class="bg-amber-100 p-5 text-amber-900 flex justify-between items-center shrink-0 rounded-t-xl">
        <h2 class="font-bold text-2xl flex items-center gap-2"><CogIcon class="w-10 h-10"/> Composizione Telai</h2>
      </div>

      <div class="p-6 overflow-y-auto flex-1 bg-gray-50">
        <div class="bg-white p-4 rounded-lg shadow-sm mb-6 border border-gray-200 flex justify-between items-center">
          <div><p class="text-sm text-gray-500 uppercase font-bold">Cliente</p><p class="text-xl font-bold text-gray-900">{{ clientName }}</p></div>
          <div class="text-right"><p class="text-sm text-gray-500 uppercase font-bold">Commessa</p><p class="font-medium">{{ order?.commessa || order?.codice }}</p></div>
        </div>

        <div v-for="(items, groupName) in groupedElements" :key="groupName" class="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h3 class="font-bold text-sm text-gray-700">{{ groupName }}</h3>
            <button @click="copyToClipboard(groupName, items)" class="text-xs flex items-center gap-1 px-2 py-1 rounded border transition-all" :class="copiedState[groupName] ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'">
              <component :is="copiedState[groupName] ? ClipboardDocumentCheckIcon : ClipboardDocumentIcon" class="w-4 h-4"/> {{ copiedState[groupName] ? 'Copiato!' : 'Copia Tabella' }}
            </button>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold"><tr><th class="px-4 py-2 text-center w-16">Q.tà</th><th class="px-4 py-2">Base (mm)</th><th class="px-4 py-2">Altezza (mm)</th><th class="px-4 py-2 text-center">Verticali</th><th class="px-4 py-2 text-center">Orizzontali</th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="item in items" :key="item.id"><td class="px-4 py-2 text-center font-bold">{{ item.quantita }}</td><td class="px-4 py-2 font-mono">{{ item.base_mm }}</td><td class="px-4 py-2 font-mono">{{ item.altezza_mm }}</td><td class="px-4 py-2 text-center">{{ item.righe || 0 }}</td><td class="px-4 py-2 text-center">{{ item.colonne || 0 }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="p-4 border-t bg-white shrink-0 flex justify-end gap-3 rounded-b-xl">
        <button @click="close" class="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Annulla</button>
        <button @click="handleProductionConfirm" class="bg-amber-100 text-amber-900 px-6 py-2 rounded-lg font-bold shadow-md hover:bg-amber-200 flex items-center gap-2">AVVIA PRODUZIONE</button>
      </div>
    </div>
  </div>
</template>