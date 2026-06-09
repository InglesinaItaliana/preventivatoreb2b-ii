<script setup lang="ts">
/**
 * IconPicker — selettore icona per documenti NEBULA-DOCS.
 *
 * Modello dati emesso (v-model):
 *   { set: 'material', name: string, color: string, fill: 0 | 1 } | null
 *
 * Componente locale a NEBULA-DOCS (`src/views/nebula/docs/components/`).
 * Vedi docs/NEBULA-DOCS.md §7 per la spec completa.
 */
import { ref, computed, watch } from 'vue'
import Fuse from 'fuse.js'
import MaterialIcon from './MaterialIcon.vue'
import { ICON_CATEGORIES, ALL_ICONS, NEBULA_COLOR_PALETTE, ICON_COUNT } from '../iconCatalog'

export interface IconValue {
  set: 'material'
  name: string
  color: string
  fill: 0 | 1
}

const props = defineProps<{
  modelValue: IconValue | null
  /** Nasconde la selezione colore (es. callout: il colore è fisso sul tono). */
  hideColor?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: IconValue | null): void
  (e: 'close'): void
}>()

// ── State ─────────────────────────────────────────────────────────────────
const query = ref('')
const activeCategory = ref<string>(ICON_CATEGORIES[0].key)
const selectedName = ref<string>(props.modelValue?.name ?? '')
const selectedColor = ref<string>(props.modelValue?.color ?? NEBULA_COLOR_PALETTE[0].hex)
const selectedFill = ref<0 | 1>(props.modelValue?.fill ?? 0)

// Tieni sync con prop esterno se cambia da fuori (es. reset)
watch(() => props.modelValue, (v) => {
  if (v) {
    selectedName.value = v.name
    selectedColor.value = v.color
    selectedFill.value = v.fill
  }
})

// ── Fuse: ricerca fuzzy sui nomi piatti ───────────────────────────────────
const fuse = new Fuse(ALL_ICONS, {
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
})

// ── Lista visualizzata: filtro per categoria + eventuale ricerca ──────────
const displayedIcons = computed<string[]>(() => {
  const q = query.value.trim()
  if (q) {
    // In ricerca: ignora la categoria, mostra tutto matchato (max 80)
    return fuse.search(q).slice(0, 80).map(r => r.item)
  }
  const cat = ICON_CATEGORIES.find(c => c.key === activeCategory.value)
  return cat ? cat.icons : []
})

// ── Selezione ─────────────────────────────────────────────────────────────
function selectIcon(name: string) {
  selectedName.value = name
  emitCurrent()
}

function selectColor(hex: string) {
  selectedColor.value = hex
  emitCurrent()
}

function toggleFill() {
  selectedFill.value = selectedFill.value === 0 ? 1 : 0
  emitCurrent()
}

function emitCurrent() {
  if (!selectedName.value) {
    emit('update:modelValue', null)
    return
  }
  emit('update:modelValue', {
    set: 'material',
    name: selectedName.value,
    color: selectedColor.value,
    fill: selectedFill.value,
  })
}

function clearSelection() {
  selectedName.value = ''
  emit('update:modelValue', null)
}

function isSelected(name: string) {
  return selectedName.value === name
}

function isSearching() {
  return query.value.trim().length > 0
}
</script>

<template>
  <div class="ip-root">
    <!-- Close (top-right del picker, sempre dentro al box visivo) -->
    <button
      type="button"
      class="ip-close"
      aria-label="Chiudi selettore icona"
      @click="emit('close')"
    >
      <MaterialIcon name="close" :size="16" />
    </button>

    <!-- Search -->
    <div class="ip-search">
      <MaterialIcon name="search" :size="18" color="#888" />
      <input
        v-model="query"
        type="text"
        placeholder="Cerca icona..."
        class="ip-search-input"
        autocomplete="off"
        spellcheck="false"
      />
      <button
        v-if="query"
        class="ip-search-clear"
        type="button"
        aria-label="Cancella ricerca"
        @click="query = ''"
      >
        <MaterialIcon name="close" :size="16" />
      </button>
    </div>

    <!-- Category tabs (nascosti in ricerca) -->
    <div v-if="!isSearching()" class="ip-tabs">
      <button
        v-for="cat in ICON_CATEGORIES"
        :key="cat.key"
        type="button"
        class="ip-tab"
        :class="{ 'ip-tab-active': activeCategory === cat.key }"
        :style="{ '--ip-accent': selectedColor }"
        @click="activeCategory = cat.key"
      >{{ cat.label }}</button>
    </div>

    <!-- Grid -->
    <div class="ip-grid-wrap">
      <div v-if="displayedIcons.length === 0" class="ip-empty">
        Nessuna icona trovata per "{{ query }}"
      </div>
      <div v-else class="ip-grid">
        <button
          v-for="name in displayedIcons"
          :key="name"
          type="button"
          class="ip-cell"
          :class="{ 'ip-cell-selected': isSelected(name) }"
          :style="{ '--ip-accent': selectedColor }"
          :title="name"
          @click="selectIcon(name)"
        >
          <MaterialIcon
            :name="name"
            :size="22"
            :fill="isSelected(name) ? selectedFill : 0"
            :color="isSelected(name) ? selectedColor : '#333'"
          />
        </button>
      </div>
    </div>

    <!-- Footer: color + fill + preview -->
    <div class="ip-footer">
      <div v-if="!hideColor" class="ip-footer-row">
        <span class="ip-footer-label">Colore</span>
        <div class="ip-colors">
          <button
            v-for="c in NEBULA_COLOR_PALETTE"
            :key="c.hex"
            type="button"
            class="ip-color"
            :class="{ 'ip-color-active': selectedColor === c.hex }"
            :style="{ background: c.hex }"
            :title="c.label"
            :aria-label="c.label"
            @click="selectColor(c.hex)"
          />
        </div>
      </div>

      <div class="ip-footer-row">
        <span class="ip-footer-label">Stile</span>
        <button
          type="button"
          class="ip-fill-toggle"
          :aria-pressed="selectedFill === 1"
          @click="toggleFill"
        >
          <span :class="{ 'ip-fill-active': selectedFill === 0 }">Outlined</span>
          <span class="ip-fill-sep">·</span>
          <span :class="{ 'ip-fill-active': selectedFill === 1 }">Filled</span>
        </button>
      </div>

      <div class="ip-footer-row ip-footer-preview">
        <span class="ip-footer-label">Anteprima</span>
        <div class="ip-preview">
          <template v-if="selectedName">
            <MaterialIcon :name="selectedName" :size="24" :color="selectedColor" :fill="selectedFill" />
            <MaterialIcon :name="selectedName" :size="16" :color="selectedColor" :fill="selectedFill" />
            <span class="ip-preview-name">{{ selectedName }}</span>
            <button
              type="button"
              class="ip-preview-clear"
              aria-label="Rimuovi icona"
              @click="clearSelection"
            >
              <MaterialIcon name="close" :size="14" />
            </button>
          </template>
          <span v-else class="ip-preview-empty">Nessuna icona selezionata</span>
        </div>
      </div>

      <div class="ip-meta">{{ ICON_COUNT }} icone disponibili</div>
    </div>
  </div>
</template>

<style scoped>
.ip-root {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 560px;
  padding: 16px;
  border-radius: 16px;
  background: var(--md-sys-color-surface-container, #ffffff);
  box-shadow: var(--md-sys-elevation-level-1, 0 1px 3px rgba(0,0,0,0.08));
  font-family: 'Outfit', system-ui, sans-serif;
}

/* Close button: top-right del picker stesso, non del wrap esterno —
   così resta visivamente attaccato al box del componente anche se il
   parent è più largo. Padding-right sulla search per non sovrapporsi. */
.ip-close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 0;
  background: rgba(0,0,0,0.05);
  color: #555;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, color 120ms ease;
}
.ip-close:hover { background: rgba(0,0,0,0.10); color: #1a1a1a; }
.ip-search { padding-right: 44px; }

/* Search */
.ip-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 999px;
  background: var(--md-sys-color-surface, #fafafa);
}
.ip-search:focus-within { border-color: #C46030; }
.ip-search-input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.ip-search-clear {
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  color: #888;
}
.ip-search-clear:hover { color: #333; }

/* Tabs */
.ip-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.ip-tab {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  color: #555;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.ip-tab:hover { background: rgba(0,0,0,0.04); }
.ip-tab-active {
  background: color-mix(in srgb, var(--ip-accent, #C46030) 12%, transparent);
  color: var(--ip-accent, #C46030);
  border-color: color-mix(in srgb, var(--ip-accent, #C46030) 35%, transparent);
}

/* Grid */
.ip-grid-wrap {
  min-height: 200px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 12px;
  background: var(--md-sys-color-surface, #fafafa);
  scrollbar-width: thin;
}
.ip-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
}
@media (max-width: 520px) {
  .ip-grid { grid-template-columns: repeat(8, 1fr); }
}
.ip-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
  transition: background 100ms ease, border-color 100ms ease, transform 100ms ease;
}
.ip-cell:hover {
  background: color-mix(in srgb, var(--ip-accent, #C46030) 10%, transparent);
  transform: scale(1.05);
}
.ip-cell-selected {
  background: color-mix(in srgb, var(--ip-accent, #C46030) 18%, transparent);
  border-color: color-mix(in srgb, var(--ip-accent, #C46030) 50%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ip-accent, #C46030) 30%, transparent);
}
.ip-empty {
  padding: 40px 20px;
  text-align: center;
  color: #888;
  font-size: 13px;
}

/* Footer */
.ip-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
.ip-footer-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ip-footer-label {
  width: 78px;
  font-size: 12px;
  font-weight: 500;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ip-colors {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ip-color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 120ms ease, border-color 120ms ease;
}
.ip-color:hover { transform: scale(1.15); }
.ip-color-active {
  border-color: #1a1a1a;
  transform: scale(1.1);
}
.ip-fill-toggle {
  background: transparent;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 999px;
  padding: 4px 12px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  color: #999;
  display: flex;
  gap: 6px;
  align-items: center;
}
.ip-fill-toggle:hover { background: rgba(0,0,0,0.03); }
.ip-fill-active { color: #1a1a1a; font-weight: 500; }
.ip-fill-sep { color: #ccc; }

.ip-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--md-sys-color-surface, #fafafa);
  border-radius: 8px;
  flex: 1;
}
.ip-preview-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #555;
  flex: 1;
}
.ip-preview-empty {
  font-size: 12.5px;
  color: #aaa;
  font-style: italic;
}
.ip-preview-clear {
  background: transparent;
  border: 0;
  color: #888;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}
.ip-preview-clear:hover { color: #c43030; }

.ip-meta {
  font-size: 11px;
  color: #aaa;
  text-align: right;
  margin-top: 2px;
}
</style>
