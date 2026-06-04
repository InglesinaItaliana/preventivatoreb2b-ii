<script setup lang="ts">
/**
 * Pillola "view-switcher" (rif. risorseesterneperclaude/cepheid-actions.html .vsw/.vbtn):
 * tab di pulsanti-icona compatti. Tenendo l'hover >1s su un pulsante, la sua label
 * si espande a destra dell'icona spingendo gli altri pulsanti.
 * Usato per i filtri di AZIONI e PROGETTI.
 *
 * Variante `labels`: le label sono sempre visibili (niente hover-expand) e ogni tab
 * può mostrare un badge `count`. Usata per le tab delle schermate di dettaglio.
 */
import { ref, onUnmounted } from 'vue'
import MIcon from '../shared/MIcon.vue'

defineProps<{
  modelValue: string
  tabs: { id: string; label: string; icon?: string; count?: number }[]
  /** label sempre visibili + badge count (per le tab di dettaglio) */
  labels?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', id: string): void }>()

const expanded = ref<string | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | null = null
function onEnter(id: string) {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => { expanded.value = id }, 1000)
}
function onLeave() {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
  expanded.value = null
}
onUnmounted(() => { if (hoverTimer) clearTimeout(hoverTimer) })
</script>

<template>
  <div class="vsw" :class="{ 'vsw--labels': labels }">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      class="vbtn"
      :class="{ active: modelValue === t.id, 'is-expanded': !labels && expanded === t.id }"
      :title="t.label"
      :aria-label="t.label"
      @click="emit('update:modelValue', t.id)"
      @mouseenter="!labels && onEnter(t.id)"
      @mouseleave="!labels && onLeave()"
    >
      <MIcon v-if="t.icon" :name="t.icon" :size="18" :filled="modelValue === t.id" />
      <span v-if="t.label" class="vlabel">{{ t.label }}</span>
      <span v-if="labels && t.count != null" class="vcount">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.vsw { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px; background: #EBE2CF; }
.s-surface-dark .vsw { background: #231E13; }
@media (prefers-color-scheme: dark) { .vsw { background: #231E13; } }

.vbtn {
  height: 28px; min-width: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0 5px; border: 0; background: none; border-radius: 8px;
  color: var(--md-sys-color-on-surface-variant); cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s, color 0.15s;
}
.vbtn:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); color: var(--md-sys-color-on-surface); }
.vbtn.active { background: #FFF8F0; color: var(--md-sys-color-primary); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
.s-surface-dark .vbtn.active { background: #16130B; }
@media (prefers-color-scheme: dark) { .vbtn.active { background: #16130B; } }

/* label inline che si espande dopo hover >1s (pattern av-name) */
.vlabel {
  max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0;
  font-size: 12px; font-weight: 500; line-height: 1;
  transition: max-width 0.22s ease, opacity 0.15s ease, padding-left 0.2s ease;
}
.vbtn.is-expanded .vlabel { max-width: 120px; opacity: 1; padding-left: 6px; }
@media (prefers-reduced-motion: reduce) { .vlabel { transition: none; } }

/* ── variante labels: label sempre visibili + badge count (tab di dettaglio) ── */
.vsw--labels { gap: 2px; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
.vsw--labels::-webkit-scrollbar { display: none; }
.vsw--labels .vbtn { padding: 0 10px; gap: 5px; flex: 0 0 auto; }
.vsw--labels .vlabel {
  max-width: none; opacity: 1; padding-left: 0;
  font-size: 12px; font-weight: 600; transition: none;
}
.vcount {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 5px;
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  border-radius: var(--md-sys-shape-corner-full);
  font-size: 10px; font-weight: 700; color: var(--md-sys-color-on-surface-variant);
}
.vbtn.active .vcount {
  background: color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent);
  color: var(--md-sys-color-primary);
}
</style>
