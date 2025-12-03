<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  HandRaisedIcon,
} from '@heroicons/vue/24/solid';

/**
 * CONFIGURAZIONE SCALA
 * Qui definiamo il rapporto: 1mm reale = 0.28px a schermo
 * Questo ci permette di avere font nitidi e coordinate gestibili.
 */
const SCALE_RATIO = 0.20; 

// Convertiamo le costanti fisiche in pixel a schermo
const PROFILE_THICKNESS = 40 * SCALE_RATIO; // Era 40mm
const EXPLOSION_GAP = 70 * SCALE_RATIO;     // Era 90mm (leggermente ridotto per estetica)
const CORNER_SIZE = 30 * SCALE_RATIO;       // Era 30mm

// Dati Pannelli (Misure Reali in mm)
const RAW_DATA = [
  { w: 500, h: 1890, id: 'A' },
  { w: 750, h: 2018, id: 'B' },
  { w: 688, h: 2320, id: 'C' },
  { w: 450, h: 1233, id: 'D' },
  { w: 655, h: 2018, id: 'E' },
  { w: 688, h: 1233, id: 'F' },
];

const sortedData = computed(() => [...RAW_DATA].sort((a, b) => b.h - a.h));
const totalPanels = sortedData.value.length;

// Stato
const focusIndex = ref(totalPanels - 1);
const isIdle = ref(false);
const isDragging = ref(false);
const dragOffset = ref(0);
let idleTimer: any = null;
let startX = 0;

// Gestione Timer Idle
const startIdleTimer = () => {
  clearTimeout(idleTimer);
  isIdle.value = false;
  idleTimer = setTimeout(() => {
    if (!isDragging.value) isIdle.value = true;
  }, 1200); 
};

onMounted(() => startIdleTimer());
onUnmounted(() => clearTimeout(idleTimer));
watch(focusIndex, () => startIdleTimer());

// Helper Drag
const getClientX = (e: MouseEvent | TouchEvent): number => {
  return ('touches' in e) ? (e.touches[0]?.clientX || 0) : e.clientX;
};

const onDragStart = (e: MouseEvent | TouchEvent) => {
  isDragging.value = true;
  isIdle.value = false;
  clearTimeout(idleTimer);
  startX = getClientX(e);
};

const onDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return;
  dragOffset.value = getClientX(e) - startX;
};

const onDragEnd = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  
  const threshold = 80;
  if (dragOffset.value < -threshold && focusIndex.value > 0) {
    focusIndex.value--;
  } else if (dragOffset.value > threshold && focusIndex.value < totalPanels - 1) {
    focusIndex.value++;
  }
  
  dragOffset.value = 0;
  startIdleTimer();
};

/**
 * CALCOLO STILE
 * Ora lavoriamo direttamente in pixel scalati, senza usare scale() nel CSS transform.
 */
const getPanelStyle = (index: number) => {
  const panel = sortedData.value[index];
  if (!panel) return {};

  // Calcolo dimensioni a schermo
  const displayW = panel.w * SCALE_RATIO;
  const displayH = panel.h * SCALE_RATIO;
  
  // Margine negativo per centrare perfettamente (metà larghezza massima renderizzata)
  const maxW = Math.max(...sortedData.value.map(d => d.w));
  const marginLeft = -(maxW * SCALE_RATIO) / 2;

  const isCurrent = index === focusIndex.value;
  const isFlipped = index > focusIndex.value;
  const isBuried = index < focusIndex.value;

  let rotateY = 0;
  let x = 0;
  let z = 0;
  let opacity = 1;

  if (isFlipped) {
    rotateY = -175; 
    x = -10; // Ridotto offset pixel
    z = 0;
    opacity = 0.50; 
  } else if (isCurrent) {
    rotateY = 0;
    // Offset X leggero quando è idle
    //y = isIdle.value ? 15 : 0;
    x = isIdle.value ? 250 : 0; 
    // Z positivo per staccarlo dagli altri
    z = isIdle.value ? 0 : 0; 
    if (isDragging.value) x += dragOffset.value * 0.4; 
  } else if (isBuried) {
    rotateY = 0;
    x = 0;
    z = 0; 
    opacity = 0.90; 
  }

  return {
    width: `${displayW}px`,
    height: `${displayH}px`,
    bottom: '120px',
    left: '20%',
    marginLeft: `${marginLeft}px`, // Centratura
    zIndex: index,
    transform: `
      perspective(2000px)
      translate3d(${x}px, 0, ${z}px)
      rotateY(${rotateY}deg)
    `,
    // Nota: rimosso 'scale()' dal transform
    opacity,
    transition: isDragging.value ? 'none' : 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
  };
};

const goToIndex = (i: number) => { focusIndex.value = i; };
const next = () => { if (focusIndex.value < totalPanels - 1) focusIndex.value++; };
const prev = () => { if (focusIndex.value > 0) focusIndex.value--; };

</script>

<template>
  <div 
    class="relative w-full h-screen bg-slate-50 overflow-hidden flex flex-col items-center justify-center font-sans select-none"
    @mousedown="onDragStart"
    @mousemove="onDragMove"
    @mouseup="onDragEnd"
    @mouseleave="onDragEnd"
    @touchstart="onDragStart"
    @touchmove="onDragMove"
    @touchend="onDragEnd"
  >
    
    <div class="absolute top-8 left-8 z-50 pointer-events-none">
      <h1 class="text-3xl font-black text-slate-900 tracking-tighter mb-2">COMPOSITORE STACK</h1>
      <div class="flex items-center gap-2 text-slate-500 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
         <HandRaisedIcon class="w-4 h-4" />
         <span class="font-bold text-xs uppercase tracking-wide">Trascina per sfogliare</span>
      </div>
    </div>

    <div class="relative w-full h-full flex items-center justify-center perspective-container">
      <div class="relative w-full max-w-6xl h-[80vh] flex items-end justify-center perspective-stage">
        
        <div 
          v-for="(data, i) in sortedData" 
          :key="data.id"
          class="absolute origin-bottom-left will-change-transform"
          :style="getPanelStyle(i)"
        >
          <div class="relative w-full h-full">
            
            <Transition name="fade-slide">
              <div 
                v-if="i === focusIndex && isIdle"
                class="absolute inset-0 overflow-visible z-50 pointer-events-none"
              >
                
                <div class="absolute left-1/2 -translate-x-1/2 transition-transform duration-700 ease-out-expo" 
                     :style="{ top: `-${EXPLOSION_GAP + 60}px` }"> <h2 class="text-3xl md:text-4xl font-black text-slate-800 tracking-tight whitespace-nowrap text-center bg-white/80 backdrop-blur px-4 py-1 rounded-xl shadow-sm">
                      PANNELLO {{ data.id }}
                    </h2>
                </div>

                <div class="absolute flex flex-col gap-4" :style="{ left: `${(data.w * SCALE_RATIO) + 40}px`, top: '10%' }">
                    
                    <div class="flex items-center gap-3 group">
                        <div class="bg-white/90 backdrop-blur p-5 rounded-2xl shadow-xl border-l-[6px] border-red-500 min-w-[200px] transition-transform hover:scale-105 origin-left">
                            <div class="text-xs uppercase font-bold text-red-500 tracking-widest mb-1">Larghezza</div>
                            <div class="text-5xl font-black text-slate-800 leading-none tracking-tight">
                                {{ data.w }}<span class="text-lg font-semibold text-slate-400 ml-1">mm</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-3 group">
                        <div class="bg-white/90 backdrop-blur p-5 rounded-2xl shadow-xl border-l-[6px] border-blue-500 min-w-[200px] transition-transform hover:scale-105 origin-left">
                            <div class="text-xs uppercase font-bold text-blue-500 tracking-widest mb-1">Altezza</div>
                            <div class="text-5xl font-black text-slate-800 leading-none tracking-tight">
                                {{ data.h }}<span class="text-lg font-semibold text-slate-400 ml-1">mm</span>
                            </div>
                        </div>
                    </div>

                </div>

              </div>
            </Transition>

            <svg class="w-full h-full overflow-visible drop-shadow-xl">
              <g>
                <rect 
                  :x="0" 
                  :y="0" 
                  :width="data.w * SCALE_RATIO" 
                  :height="PROFILE_THICKNESS" 
                  :fill="(i === focusIndex && isIdle) ? '#fee2e2' : '#f1f5f9'" 
                  :stroke="(i === focusIndex && isIdle) ? '#ef4444' : '#475569'" 
                  :stroke-width="(i === focusIndex && isIdle) ? 2 : 1"
                  class="transition-all duration-700 ease-out-expo"
                  :style="{ transform: (i === focusIndex && isIdle) ? `translateY(-${EXPLOSION_GAP}px)` : 'translateY(0)' }"
                />

                <rect 
                  :x="0" 
                  :y="(data.h * SCALE_RATIO) - PROFILE_THICKNESS" 
                  :width="data.w * SCALE_RATIO" 
                  :height="PROFILE_THICKNESS" 
                  :fill="(i === focusIndex && isIdle) ? '#fee2e2' : '#f1f5f9'" 
                  :stroke="(i === focusIndex && isIdle) ? '#ef4444' : '#475569'" 
                  :stroke-width="(i === focusIndex && isIdle) ? 2 : 1"
                  class="transition-all duration-700 ease-out-expo"
                  :style="{ transform: (i === focusIndex && isIdle) ? `translateY(${EXPLOSION_GAP}px)` : 'translateY(0)' }"
                />

                <rect 
                  :x="0" 
                  :y="0" 
                  :width="PROFILE_THICKNESS" 
                  :height="data.h * SCALE_RATIO" 
                  :fill="(i === focusIndex && isIdle) ? '#eff6ff' : '#f8fafc'" 
                  :stroke="(i === focusIndex && isIdle) ? '#3b82f6' : '#475569'" 
                  :stroke-width="(i === focusIndex && isIdle) ? 2 : 1"
                  class="transition-all duration-700 ease-out-expo"
                  :style="{ transform: (i === focusIndex && isIdle) ? `translateX(-${EXPLOSION_GAP}px)` : 'translateX(0)' }"
                />

                <rect 
                  :x="(data.w * SCALE_RATIO) - PROFILE_THICKNESS" 
                  :y="0" 
                  :width="PROFILE_THICKNESS" 
                  :height="data.h * SCALE_RATIO" 
                  :fill="(i === focusIndex && isIdle) ? '#eff6ff' : '#f8fafc'" 
                  :stroke="(i === focusIndex && isIdle) ? '#3b82f6' : '#475569'" 
                  :stroke-width="(i === focusIndex && isIdle) ? 2 : 1"
                  class="transition-all duration-700 ease-out-expo"
                  :style="{ transform: (i === focusIndex && isIdle) ? `translateX(${EXPLOSION_GAP}px)` : 'translateX(0)' }"
                />

                <g class="transition-opacity duration-500 delay-100" :class="(i === focusIndex && isIdle) ? 'opacity-100' : 'opacity-0'">
                    <path :d="`M-${EXPLOSION_GAP},-${EXPLOSION_GAP} h${CORNER_SIZE} v${CORNER_SIZE} h-${CORNER_SIZE} z`" fill="#1e293b" />
                    <path :d="`M${(data.w * SCALE_RATIO) + EXPLOSION_GAP},-${EXPLOSION_GAP} h-${CORNER_SIZE} v${CORNER_SIZE} h${CORNER_SIZE} z`" fill="#1e293b" />
                    <path :d="`M-${EXPLOSION_GAP},${(data.h * SCALE_RATIO) + EXPLOSION_GAP} h${CORNER_SIZE} v-${CORNER_SIZE} h-${CORNER_SIZE} z`" fill="#1e293b" />
                    <path 
  :d="`M${(data.w * SCALE_RATIO) + EXPLOSION_GAP},${data.h * SCALE_RATIO+ EXPLOSION_GAP} h-${CORNER_SIZE} v-${CORNER_SIZE} h${CORNER_SIZE} z`" 
  fill="#1e293b" 
/>
                    </g>
              </g>
            </svg>

            <div 
              class="absolute inset-0 bg-sky-200/20 border border-sky-100/50 transition-opacity duration-700 pointer-events-none"
              :class="(i === focusIndex && isIdle) ? 'opacity-0' : 'opacity-100'"
              style="z-index: -1;"
            ></div>

          </div>
        </div>
      </div>
    </div>

    <div class="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg border border-slate-100 z-50">
      <button @click="prev" :disabled="focusIndex === 0" class="disabled:opacity-30 text-slate-400 hover:text-indigo-600 transition-colors">
        <ChevronLeftIcon class="w-6 h-6" />
      </button>
      
      <div class="flex gap-2">
        <div 
          v-for="(_, i) in sortedData" 
          :key="i"
          @click="goToIndex(i)"
          class="h-2.5 rounded-full transition-all duration-300 cursor-pointer"
          :class="i === focusIndex ? 'bg-indigo-600 w-8' : (i > focusIndex ? 'bg-slate-200 w-2.5' : 'bg-indigo-200 w-2.5')"
        ></div>
      </div>

      <button @click="next" :disabled="focusIndex === totalPanels - 1" class="disabled:opacity-30 text-slate-400 hover:text-indigo-600 transition-colors">
        <ChevronRightIcon class="w-6 h-6" />
      </button>
    </div>

    <div class="absolute bottom-0 w-full h-32 bg-gradient-to-t from-slate-200/50 to-transparent pointer-events-none" />
  </div>
</template>

<style scoped>
.perspective-container {
  perspective: 2500px; /* Prospettiva leggermente aumentata per appiattire la scena */
  overflow: hidden;
}
.perspective-stage {
  transform-style: preserve-3d;
}

.ease-out-expo {
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>