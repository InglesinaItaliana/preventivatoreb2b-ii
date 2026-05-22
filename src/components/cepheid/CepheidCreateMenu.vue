<script lang="ts">
import { ref as _ref } from 'vue'
// stato condiviso a livello MODULO (un solo menu aperto alla volta su tutta l'app)
let _counter = 0
const _active = _ref(0)
export function _nextMenuId() { return ++_counter }
</script>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import MIcon from '../shared/MIcon.vue'

type Kind = 'fase' | 'deliverable' | 'milestone' | 'task'
const emit = defineEmits<{ (e: 'select', kind: Kind): void }>()

const id = _nextMenuId()

const btnRef = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0 })
const open = computed(() => _active.value === id)

function toggle() {
  if (open.value) { _active.value = 0; return }
  _active.value = id
  nextTick(() => {
    const r = btnRef.value?.getBoundingClientRect()
    if (r) pos.value = { top: Math.round(r.bottom + 6), left: Math.round(Math.max(8, r.right - 200)) }
  })
}
function close() { _active.value = 0 }
function pick(k: Kind) { _active.value = 0; emit('select', k) }

const OPTIONS: { kind: Kind; icon: string; label: string }[] = [
  { kind: 'fase',        icon: 'layers',        label: 'Nuova fase' },
  { kind: 'deliverable', icon: 'inventory_2',   label: 'Nuovo deliverable' },
  { kind: 'milestone',   icon: 'rocket_launch', label: 'Nuova milestone' },
  { kind: 'task',        icon: 'check_circle',  label: 'Nuova task' },
]
</script>

<template>
  <button ref="btnRef" class="cmenu-btn" title="Crea" type="button" @click="toggle">
    <MIcon name="add" :size="18" />
  </button>
  <Teleport to="body">
    <template v-if="open">
      <div class="cmenu-scrim" @click="close" />
      <div class="cmenu-pop s-scope-cepheid" :style="{ top: pos.top + 'px', left: pos.left + 'px' }">
        <button v-for="o in OPTIONS" :key="o.kind" type="button" class="cmenu-item" @click="pick(o.kind)">
          <MIcon :name="o.icon" :size="16" /> {{ o.label }}
        </button>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.cmenu-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--md-sys-shape-corner-full); border: 0; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); cursor: pointer; }
.cmenu-btn:hover { filter: brightness(1.05); }
.cmenu-scrim { position: fixed; inset: 0; z-index: 1000; }
.cmenu-pop {
  position: fixed; z-index: 1001; width: 200px;
  background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium); box-shadow: var(--md-sys-elevation-level-3); padding: 4px;
}
.cmenu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px;
  background: none; border: none; font-family: var(--md-sys-typescale-body-medium-font);
  font-size: 14px; color: var(--md-sys-color-on-surface); text-align: left; cursor: pointer;
  border-radius: var(--md-sys-shape-corner-small);
}
.cmenu-item:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent); color: var(--md-sys-color-primary); }
</style>
