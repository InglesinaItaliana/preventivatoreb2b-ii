<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSWUpdate } from '../composables/shared/useSWUpdate'

const { needRefresh, applyUpdate, dismiss } = useSWUpdate()
const route = useRoute()

// Tematizzazione path-based: il banner adotta il colore della PWA corrente.
// POPS (default) usa amber-400, il giallo accento standard del progetto.
const theme = computed(() => {
  const p = route.path || ''
  if (p.startsWith('/pulsar')) {
    return { btn: 'bg-[#338076] hover:bg-[#2E7268] text-white', ring: 'ring-[#338076]/30' }
  }
  if (p.startsWith('/cepheid')) {
    return { btn: 'bg-[#D4A020] hover:bg-[#B8870E] text-white', ring: 'ring-[#D4A020]/30' }
  }
  return { btn: 'bg-amber-400 hover:bg-amber-500 text-gray-900', ring: 'ring-amber-400/30' }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-4"
  >
    <div
      v-if="needRefresh"
      role="status"
      aria-live="polite"
      class="fixed left-1/2 -translate-x-1/2 bottom-4 z-[9999] w-[min(92vw,420px)]"
      :style="{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }"
    >
      <div
        class="flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg ring-1 px-4 py-3"
        :class="theme.ring"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900">Nuova versione disponibile</p>
          <p class="text-xs text-gray-500">Aggiorna per applicarla ora.</p>
        </div>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
          @click="dismiss"
        >
          Più tardi
        </button>
        <button
          type="button"
          class="text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition"
          :class="theme.btn"
          @click="applyUpdate"
        >
          Aggiorna
        </button>
      </div>
    </div>
  </Transition>
</template>
