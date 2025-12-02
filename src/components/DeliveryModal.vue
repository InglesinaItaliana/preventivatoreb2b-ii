<script setup lang="ts">
import { ref, watch } from 'vue'; // Rimosso onMounted
import { XMarkIcon, CheckCircleIcon, TrashIcon } from '@heroicons/vue/24/solid';

const props = defineProps<{
  show: boolean;
  order: any;
}>();

const emit = defineEmits(['close', 'confirm']);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const hasSignature = ref(false);
const ctx = ref<CanvasRenderingContext2D | null>(null);

// Gestisce l'inizializzazione del Canvas
const initCanvas = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  
  // Adatta alla larghezza del contenitore (necessario per il corretto mapping delle coordinate)
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  ctx.value = canvas.getContext('2d');
  if (ctx.value) {
    ctx.value.lineWidth = 2;
    ctx.value.lineCap = 'round';
    ctx.value.strokeStyle = '#000000';
  }
};

watch(() => props.show, (val) => {
  if (val) {
    // Aspetta che il DOM sia renderizzato prima di inizializzare
    setTimeout(initCanvas, 100);
    hasSignature.value = false;
  }
});

// NUOVA FUNZIONE HELPER: Estrae le coordinate in modo sicuro
const getEventCoords = (e: MouseEvent | TouchEvent) => {
  // Verifica se l'evento ha la lista dei tocchi
  if ('touches' in e) {
    const touch = e.touches[0]; // Estraiamo il primo tocco
    
    // Controllo di sicurezza: se touch esiste, ritorniamo le coordinate
    if (touch) {
      return { clientX: touch.clientX, clientY: touch.clientY };
    }
  } else if (e instanceof MouseEvent) {
    // Ritorna le coordinate del mouse
    return { clientX: e.clientX, clientY: e.clientY };
  }
  return null;
};

// Gestione Mouse/Touch
const startDrawing = (e: MouseEvent | TouchEvent) => {
  if (!getEventCoords(e)) return;
  isDrawing.value = true;
  draw(e);
};

const stopDrawing = () => {
  isDrawing.value = false;
  if(ctx.value) ctx.value.beginPath();
};

const draw = (e: MouseEvent | TouchEvent) => {
  if (!isDrawing.value || !ctx.value || !canvasRef.value) return;

  const coords = getEventCoords(e);
  if (!coords) return;
  
  const rect = canvasRef.value.getBoundingClientRect();
  const x = coords.clientX - rect.left;
  const y = coords.clientY - rect.top;

  ctx.value.lineTo(x, y);
  ctx.value.stroke();
  ctx.value.beginPath();
  ctx.value.moveTo(x, y);
  hasSignature.value = true;
};

const clearCanvas = () => {
  if (!canvasRef.value || !ctx.value) return;
  ctx.value.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  hasSignature.value = false;
};

const confirmDelivery = () => {
  if (!canvasRef.value) return;
  // Converti in immagine Base64
  const dataUrl = canvasRef.value.toDataURL('image/png');
  emit('confirm', dataUrl);
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
      <div class="bg-gray-800 text-white p-4 flex justify-between items-center shrink-0">
        <div>
          <p class="text-[10px] text-gray-400 uppercase font-bold">Consegna ordine</p>
          <h2 class="text-xl font-bold font-heading">{{ order?.commessa || order?.codice }}</h2>
        </div>
        <button @click="$emit('close')" class="p-2 bg-white/10 rounded-full hover:bg-white/20">
          <XMarkIcon class="w-6 h-6 text-white" />
        </button>
      </div>

      <div class="p-4 overflow-y-auto bg-gray-50 flex-1 space-y-4">
        
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p class="text-xs text-gray-500 font-bold uppercase mb-1">Cliente</p>
          <p class="text-lg font-bold text-gray-900 leading-tight">{{ order?.cliente }}</p>
          <p class="text-sm text-gray-600 mt-1">{{ order?.indirizzoConsegna || 'Indirizzo standard' }}</p>
        </div>

        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
           <div class="flex justify-between items-center mb-2">
             <span class="text-xs text-gray-500 font-bold uppercase">Merce</span>
             <span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">{{ order?.colli || 1 }} Colli</span>
           </div>
           <div v-if="order?.sommarioPreventivo" class="space-y-1">
              <div v-for="(item, idx) in order.sommarioPreventivo" :key="idx" class="text-sm border-b border-gray-100 last:border-0 py-1">
                <span class="font-bold">{{ item.quantitaTotale }}x</span> {{ item.descrizione }}
              </div>
           </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-end">
             <p class="text-xs text-gray-500 font-bold uppercase">Firma per ricevuta</p>
             <button @click="clearCanvas" class="text-xs text-red-500 flex items-center gap-1 hover:text-red-700">
               <TrashIcon class="w-3 h-3"/> Pulisci
             </button>
          </div>
          <div class="border-2 border-dashed border-gray-300 rounded-xl bg-white h-48 relative touch-none">
            <canvas 
              ref="canvasRef" 
              class="w-full h-full cursor-crosshair block"
              @mousedown="startDrawing"
              @mousemove="draw"
              @mouseup="stopDrawing"
              @mouseleave="stopDrawing"
              @touchstart.prevent="startDrawing"
              @touchmove.prevent="draw"
              @touchend.prevent="stopDrawing"
            ></canvas>
            <div v-if="!hasSignature" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
              <span class="text-2xl font-bold text-gray-400 transform -rotate-12">Firma qui</span>
            </div>
          </div>
        </div>

      </div>

      <div class="p-4 bg-white border-t border-gray-100 shrink-0">
        <button 
          @click="confirmDelivery" 
          :disabled="!hasSignature"
          class="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold py-4 rounded-xl shadow-lg text-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <CheckCircleIcon class="w-6 h-6" />
          CONFERMA CONSEGNA
        </button>
      </div>

    </div>
  </div>
</template>