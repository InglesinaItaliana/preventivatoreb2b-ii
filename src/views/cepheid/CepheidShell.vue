<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import SideraLayout from '../sidera/SideraLayout.vue'
import CepheidLayout from './CepheidLayout.vue'

// Sceglie il layout in base al contesto:
// - PWA installata (display-mode: standalone) → CepheidLayout (chrome CEPHEID, no link SIDERA)
// - Mobile in browser (viewport ≤ 768px)     → CepheidLayout (UI mobile-friendly)
// - Desktop in browser                        → SideraLayout (sidebar SIDERA piena)

const isStandalone = ref(false)
const isMobile = ref(false)

let standaloneMql: MediaQueryList | null = null
let mobileMql: MediaQueryList | null = null

function syncStandalone() {
  isStandalone.value =
    standaloneMql?.matches === true ||
    (window.navigator as any).standalone === true
}
function syncMobile() {
  isMobile.value = mobileMql?.matches === true
}

onMounted(() => {
  standaloneMql = window.matchMedia('(display-mode: standalone)')
  mobileMql = window.matchMedia('(max-width: 768px)')
  syncStandalone()
  syncMobile()
  standaloneMql.addEventListener('change', syncStandalone)
  mobileMql.addEventListener('change', syncMobile)
})

onBeforeUnmount(() => {
  standaloneMql?.removeEventListener('change', syncStandalone)
  mobileMql?.removeEventListener('change', syncMobile)
})

const layout = computed(() =>
  (isStandalone.value || isMobile.value) ? CepheidLayout : SideraLayout
)
</script>

<template>
  <component :is="layout" />
</template>
