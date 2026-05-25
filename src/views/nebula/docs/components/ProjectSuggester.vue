<script setup lang="ts">
/**
 * ProjectSuggester — popup typeahead per il trigger `#` (project mention).
 *
 * Stesso pattern di TaskSuggester (Up/Down/Enter/Esc esposti via defineExpose
 * per ricevere keys dal Suggestion plugin).
 */
import { ref, computed, watch, nextTick } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import type { Project } from '../../../../composables/sidera/useProjects'

const props = defineProps<{
  items: Project[]
  command: (item: { id: string }) => void
}>()

const selectedIndex = ref(0)
const listRef = ref<HTMLDivElement | null>(null)

watch(() => props.items, () => { selectedIndex.value = 0 })

function selectItem(index: number) {
  const item = props.items[index]
  if (item) props.command({ id: item.id })
}

function scrollIntoView(idx: number) {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-ps-idx="${idx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function up() {
  selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
  scrollIntoView(selectedIndex.value)
}
function down() {
  selectedIndex.value = (selectedIndex.value + 1) % props.items.length
  scrollIntoView(selectedIndex.value)
}

defineExpose({
  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
    if (event.key === 'ArrowUp')   { up();   return true }
    if (event.key === 'ArrowDown') { down(); return true }
    if (event.key === 'Enter')     { selectItem(selectedIndex.value); return true }
    return false
  },
})

const isEmpty = computed(() => props.items.length === 0)
</script>

<template>
  <div class="ps-root">
    <div class="ps-header">
      <MaterialIcon name="folder" :size="14" color="#5B7F2E" />
      <span>Menziona progetto</span>
    </div>
    <div v-if="isEmpty" class="ps-no-results">
      Nessun progetto trovato
    </div>
    <div v-else ref="listRef" class="ps-list" role="listbox">
      <button
        v-for="(item, idx) in items.slice(0, 50)"
        :key="item.id"
        type="button"
        class="ps-item"
        :class="{
          'ps-item-active': idx === selectedIndex,
          'ps-item-completed': item.completed,
          'ps-item-archived': item.archived,
        }"
        :style="{ '--ps-color': item.color || '#5B7F2E' }"
        :data-ps-idx="idx"
        role="option"
        :aria-selected="idx === selectedIndex"
        @mouseenter="selectedIndex = idx"
        @click="selectItem(idx)"
      >
        <span class="ps-item-icon">
          <MaterialIcon
            :name="item.completed ? 'folder_special' : 'folder'"
            :size="16"
            :fill="item.completed ? 1 : 0"
            :color="item.color || '#5B7F2E'"
          />
        </span>
        <span class="ps-item-title">{{ item.name || '(senza nome)' }}</span>
        <span v-if="item.taskCount > 0" class="ps-item-count">
          {{ item.doneCount }}/{{ item.taskCount }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ps-root {
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.10);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  width: 320px;
  max-height: 360px;
  overflow: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}
.ps-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 11px;
  font-weight: 500;
  color: #5B7F2E;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ps-no-results {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.ps-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: thin;
}
.ps-item {
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
.ps-item:hover,
.ps-item-active {
  background: color-mix(in srgb, var(--ps-color, #5B7F2E) 12%, transparent);
}
.ps-item-icon { flex-shrink: 0; }
.ps-item-title {
  flex: 1;
  font-size: 13px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ps-item-completed .ps-item-title {
  opacity: 0.6;
  text-decoration: line-through;
}
.ps-item-archived .ps-item-title {
  opacity: 0.5;
  font-style: italic;
}
.ps-item-count {
  font-size: 10.5px;
  color: #999;
  padding: 1px 6px;
  background: rgba(0,0,0,0.04);
  border-radius: 999px;
  flex-shrink: 0;
}
</style>
