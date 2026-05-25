<script setup lang="ts">
/**
 * SlashMenu — popup Vue per il slash command menu di NEBULA-DOCS.
 *
 * Esposto via `defineExpose({ onKeyDown })` perché TipTap Suggestion render()
 * propaga i keydown events qui per navigation/select/escape.
 *
 * Props passati dal Suggestion plugin:
 *  - items: array filtrato di SlashCommandItem
 *  - command: callback(item) → triggera l'item selezionato (rimuove la query
 *    e applica il comando all'editor)
 */
import { ref, computed, watch, nextTick } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import type { SlashCommandItem } from '../slashCommands'

const props = defineProps<{
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}>()

const selectedIndex = ref(0)
const listRef = ref<HTMLDivElement | null>(null)

// Reset selezione quando i filtered items cambiano (l'utente sta digitando)
watch(() => props.items, () => {
  selectedIndex.value = 0
})

function selectItem(index: number) {
  const item = props.items[index]
  if (item) props.command(item)
}

function scrollIntoView(idx: number) {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-sm-idx="${idx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function upHandler() {
  selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
  scrollIntoView(selectedIndex.value)
}
function downHandler() {
  selectedIndex.value = (selectedIndex.value + 1) % props.items.length
  scrollIntoView(selectedIndex.value)
}
function enterHandler() {
  selectItem(selectedIndex.value)
}

defineExpose({
  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
    if (event.key === 'ArrowUp')   { upHandler();   return true }
    if (event.key === 'ArrowDown') { downHandler(); return true }
    if (event.key === 'Enter')     { enterHandler();return true }
    return false
  },
})

const isEmpty = computed(() => props.items.length === 0)
</script>

<template>
  <div class="sm-root" :class="{ 'sm-empty': isEmpty }">
    <div v-if="isEmpty" class="sm-no-results">
      Nessun comando trovato
    </div>
    <div v-else ref="listRef" class="sm-list" role="listbox">
      <button
        v-for="(item, idx) in items"
        :key="item.title"
        type="button"
        class="sm-item"
        :class="{ 'sm-item-active': idx === selectedIndex }"
        :data-sm-idx="idx"
        role="option"
        :aria-selected="idx === selectedIndex"
        @mouseenter="selectedIndex = idx"
        @click="selectItem(idx)"
      >
        <span class="sm-item-icon">
          <MaterialIcon :name="item.icon" :size="20" />
        </span>
        <span class="sm-item-meta">
          <span class="sm-item-title">{{ item.title }}</span>
          <span class="sm-item-desc">{{ item.description }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sm-root {
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.10);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 4px;
  width: 280px;
  max-height: 320px;
  overflow: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
}
.sm-empty { padding: 12px; }
.sm-no-results {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 8px;
}
.sm-list {
  max-height: 312px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.sm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background 80ms ease;
}
.sm-item:hover,
.sm-item-active {
  background: rgba(196, 96, 48, 0.10);
}
.sm-item-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.04);
  border-radius: 6px;
  color: #555;
  flex-shrink: 0;
}
.sm-item-active .sm-item-icon {
  background: rgba(196, 96, 48, 0.15);
  color: #C46030;
}
.sm-item-meta {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.sm-item-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  line-height: 1.3;
}
.sm-item-desc {
  font-size: 11.5px;
  color: #888;
  line-height: 1.3;
  margin-top: 1px;
}
</style>
