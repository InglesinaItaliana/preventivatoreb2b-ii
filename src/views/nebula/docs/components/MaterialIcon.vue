<script setup lang="ts">
/**
 * Wrapper render-only per Material Symbols Outlined.
 *
 * Usa il font variable già caricato globalmente in index.html.
 * Componente locale a NEBULA-DOCS (non shared); promozione a shared solo
 * quando emerge un secondo consumer reale (regola ATLAS sez. 3).
 *
 * Esempio:
 *   <MaterialIcon name="description" :size="24" color="#C46030" :fill="0" />
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  size?: number       // px
  color?: string      // CSS color
  fill?: 0 | 1        // variable font axis FILL
  weight?: number     // 100..700, default 400
}>(), {
  size: 24,
  color: 'currentColor',
  fill: 0,
  weight: 400,
})

const styleObj = computed(() => ({
  color: props.color,
  fontSize: `${props.size}px`,
  lineHeight: `${props.size}px`,
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontVariationSettings: `'FILL' ${props.fill}, 'wght' ${props.weight}, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, props.size))}`,
}))
</script>

<template>
  <span class="material-symbols-outlined mi" :style="styleObj" aria-hidden="true">{{ name }}</span>
</template>

<style scoped>
.mi {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
  font-feature-settings: 'liga';
  user-select: none;
  flex-shrink: 0;
}
</style>
