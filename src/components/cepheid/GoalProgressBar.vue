<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** Numero progetti totali collegati */
  progetti?: number
  /** Numero progetti completati al 100% */
  progettiCompletati?: number
  /** Override diretto della percentuale (0–100); se fornito ignora progetti/progettiCompletati */
  percentuale?: number | null
  colore?: string
  showLabel?: boolean
}>(), {
  progetti: 0,
  progettiCompletati: 0,
  percentuale: null,
  colore: '#D4A020',
  showLabel: true,
})

const pct = computed(() => {
  if (props.percentuale != null) return Math.max(0, Math.min(100, Math.round(props.percentuale)))
  if (!props.progetti) return 0
  return Math.round((props.progettiCompletati / props.progetti) * 100)
})
</script>

<template>
  <div class="gp">
    <div v-if="showLabel" class="gp-label">
      <span class="gp-pct">{{ pct }}%</span>
      <span v-if="progetti" class="gp-meta">{{ progettiCompletati }}/{{ progetti }} progetti</span>
    </div>
    <div class="gp-track">
      <div class="gp-fill" :style="{ width: pct + '%', background: colore }" />
    </div>
  </div>
</template>

<style scoped>
.gp { width: 100%; }
.gp-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
  font-family: 'Outfit', sans-serif;
}
.gp-pct { font-size: 13px; font-weight: 700; color: #1A1917; }
.gp-meta { font-size: 11px; color: #9B9590; }
.gp-track { height: 5px; background: #F0EDE8; border-radius: 999px; overflow: hidden; }
.gp-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
</style>
