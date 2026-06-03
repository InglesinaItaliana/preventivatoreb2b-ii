<script setup lang="ts">
/**
 * Toggle di completamento con la forma coerente alla timeline CEPHEID:
 *  - 'circle'  → azione/task  (.mk-circle)
 *  - 'diamond' → milestone     (.mk-mile, quadrato ruotato 45°)
 *  - 'square'  → deliverable    (.mk-deliv, quadrato a spigoli vivi)
 *
 * done = pieno (primary) + check; locked = bordo tratteggiato + lucchetto.
 * interactive=false → solo visualizzazione (es. milestone sola lettura).
 */
import MIcon from '../shared/MIcon.vue'

const props = withDefaults(defineProps<{
  shape?: 'circle' | 'diamond' | 'square'
  done?: boolean
  locked?: boolean
  interactive?: boolean
}>(), { shape: 'circle', done: false, locked: false, interactive: true })

const emit = defineEmits<{ (e: 'toggle'): void }>()

function onClick(e: MouseEvent) {
  if (!props.interactive || props.locked) return
  e.stopPropagation()
  emit('toggle')
}
</script>

<template>
  <span
    class="dt"
    :class="[`dt--${shape}`, { 'is-done': done, 'is-locked': locked, 'is-static': !interactive }]"
    :role="interactive && !locked ? 'button' : undefined"
    @click="onClick"
  >
    <span class="dt-ic">
      <MIcon v-if="done" name="check" :size="13" />
      <MIcon v-else-if="locked" name="lock" :size="11" />
    </span>
  </span>
</template>

<style scoped>
.dt {
  position: relative;
  width: 20px; height: 20px;
  flex-shrink: 0;
  box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--md-sys-color-outline);
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-primary);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.dt.is-static { cursor: default; }
.dt--circle { border-radius: 50%; }
.dt--diamond { transform: rotate(45deg); }   /* rombo */
.dt--square { border-radius: 0; }             /* spigoli vivi */

.dt:not(.is-static):not(.is-locked):hover { border-color: var(--md-sys-color-primary); }

.dt.is-done {
  background: var(--md-sys-color-primary);
  border-color: var(--md-sys-color-primary);
}

.dt.is-locked {
  cursor: not-allowed;
  border-style: dashed;
  border-color: #C8C5C0;
  color: #B4B0AA;
}

/* contenuto icona: contro-ruotato nel rombo così il check resta dritto */
.dt-ic { display: inline-flex; align-items: center; justify-content: center; }
.dt--diamond .dt-ic { transform: rotate(-45deg); }
</style>
