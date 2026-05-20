<script setup lang="ts">
/**
 * Mobile FAB: bottone azione primaria del modulo (es. nuova chat per PULSAR,
 * nuova task per CEPHEID). Emette `trigger` con l'identifier dell'azione,
 * gestito dal layout o dal parent route via provide/inject.
 *
 * Pattern d'uso:
 *   <ContextualFab :config="config" @trigger="handleFabAction" />
 *
 * Il `handleFabAction` può ad esempio scrivere su sessionStorage e/o emettere
 * un tick reattivo via provide/inject — vedi PulsarLayout precedente.
 */
import MIcon from '../pulsar/MIcon.vue'
import type { ScopeConfig } from '../../views/sidera/scopeConfig'

const props = defineProps<{
  config: ScopeConfig
}>()

const emit = defineEmits<{
  (e: 'trigger', action: NonNullable<ScopeConfig['fab']>['action']): void
}>()

function onClick() {
  if (props.config.fab) emit('trigger', props.config.fab.action)
}
</script>

<template>
  <button
    v-if="config.fab"
    class="cm-fab"
    :aria-label="config.fab.ariaLabel"
    @click="onClick"
  >
    <MIcon :name="config.fab.icon" filled :size="28" />
  </button>
</template>

<style scoped>
.cm-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66px;
  height: 66px;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  border: none;
  cursor: pointer;
  box-shadow: var(--md-sys-elevation-level-3);
  transition: transform   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              box-shadow  var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background  var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink: 0;
}
.cm-fab:hover {
  background: var(--md-sys-color-primary-hover);
  box-shadow: var(--md-sys-elevation-level-4);
}
.cm-fab:active { transform: scale(0.96); }
</style>
