<script setup lang="ts">
/**
 * DocOutline — bottone flottante + pannello indice del documento.
 *
 * Lista gli heading (da useDocOutline) e ci scrolla al click. Drawer a destra
 * su desktop, bottom-sheet su mobile. Presentazionale: riceve `headings` ed
 * emette `select(pos)`.
 */
import { ref } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import type { OutlineItem } from '../../../../composables/nebula/useDocOutline'

defineProps<{ headings: OutlineItem[] }>()
const emit = defineEmits<{ (e: 'select', pos: number): void }>()

const open = ref(false)

function pick(pos: number) {
  emit('select', pos)
  open.value = false
}
</script>

<template>
  <!-- FAB: solo se c'è una struttura reale -->
  <button
    v-if="headings.length >= 2"
    type="button"
    class="ndo-fab"
    aria-label="Indice del documento"
    title="Indice del documento"
    @click="open = true"
  >
    <MaterialIcon name="format_list_bulleted" :size="22" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="ndo-backdrop" @click.self="open = false">
      <aside class="ndo-panel" role="dialog" aria-label="Indice">
        <header class="ndo-head">
          <span class="ndo-title">Indice</span>
          <button type="button" class="ndo-close" aria-label="Chiudi" @click="open = false">
            <MaterialIcon name="close" :size="20" />
          </button>
        </header>
        <nav class="ndo-list">
          <button
            v-for="(h, i) in headings"
            :key="i"
            type="button"
            class="ndo-item"
            :class="`ndo-lvl-${h.level}`"
            @click="pick(h.pos)"
          >
            {{ h.text }}
          </button>
          <p v-if="headings.length === 0" class="ndo-empty">Nessuna sezione.</p>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.ndo-fab {
  position: fixed;
  right: 20px;
  bottom: 92px;
  z-index: 40;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  background: var(--md-sys-color-surface-container-lowest, #fff);
  color: var(--md-sys-color-on-surface-variant, #6A6560);
  box-shadow: var(--md-sys-elevation-level-2, 0 2px 8px rgba(0, 0, 0, 0.14));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.ndo-fab:hover {
  background: var(--md-sys-color-surface-container, #F5EDDF);
  color: var(--md-sys-color-on-surface, #1A1917);
}

.ndo-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  justify-content: flex-end;
}
.ndo-panel {
  background: var(--md-sys-color-surface, #FFF8F0);
  width: 300px;
  max-width: 86vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.18);
  animation: ndo-slide-right 180ms ease-out;
}
@keyframes ndo-slide-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.ndo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
}
.ndo-title {
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface, #1A1917);
}
.ndo-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant, #6A6560);
  display: inline-flex;
  border-radius: 8px;
  padding: 4px;
}
.ndo-close:hover { background: var(--md-sys-color-surface-container, #F5EDDF); }

.ndo-list {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px 10px 20px;
}
.ndo-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 7px 10px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  line-height: 1.35;
  color: var(--md-sys-color-on-surface, #1A1917);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ndo-item:hover { background: var(--md-sys-color-surface-container, #F5EDDF); }
.ndo-lvl-1 { font-weight: 600; }
.ndo-lvl-2 { padding-left: 24px; color: var(--md-sys-color-on-surface-variant, #5d574f); }
.ndo-lvl-3 { padding-left: 40px; font-size: 13px; color: var(--md-sys-color-on-surface-variant, #6A6560); }
.ndo-empty {
  padding: 16px 10px;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant, #6A6560);
}

/* Mobile: bottom-sheet invece del drawer laterale */
@media (max-width: 600px) {
  .ndo-backdrop { align-items: flex-end; justify-content: stretch; }
  .ndo-panel {
    width: 100%;
    max-width: none;
    height: auto;
    max-height: 72vh;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.2);
    animation: ndo-slide-up 200ms ease-out;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  @keyframes ndo-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .ndo-fab { bottom: calc(92px + env(safe-area-inset-bottom, 0)); }
}
</style>
