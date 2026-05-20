<script setup lang="ts">
/**
 * SVG single-vertex brand icon, scope-agnostic.
 *
 * Il disegno è identico per ogni modulo (cerchio centrale + 4 raggi obliqui +
 * alone + nucleo). Cambia solo il colore via `currentColor`, che eredita dal
 * --md-sys-color-primary dello scope attivo (.s-scope-pulsar / -cepheid / ...).
 *
 * Quando si vorranno disegni unici per modulo (es. PULSAR teal con onde,
 * CEPHEID oro con variazione di intensità), sostituire il <g> inner con un
 * <component :is="..." /> in base a props.scope.
 */
import type { ScopeId } from '../../views/sidera/scopeConfig'

defineProps<{
  scope: ScopeId
  size?: number
}>()
</script>

<template>
  <svg
    class="sbi-icon"
    :width="size ?? 32"
    :height="size ?? 32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="16" cy="16" r="8"   fill="currentColor" opacity="0.10" />
    <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
      <line x1="16" y1="16" x2="12"   y2="4.7" />
      <line x1="16" y1="16" x2="23.6" y2="25.3" />
      <line x1="16" y1="16" x2="4"    y2="16" />
      <line x1="16" y1="16" x2="10"   y2="26.4" />
    </g>
    <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28" />
    <circle cx="16" cy="16" r="2.9" fill="currentColor" />
  </svg>
</template>

<style scoped>
.sbi-icon {
  flex-shrink: 0;
  color: var(--md-sys-color-primary);
}
</style>
