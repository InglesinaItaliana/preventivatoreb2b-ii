<script setup lang="ts">
/**
 * TaskSuggester — popup di typeahead per il trigger `@` (task mention).
 *
 * Riceve dal Suggestion plugin TipTap:
 *   - items: array già filtrato di task (sorted by relevance)
 *   - command(item) → inserisce il task-mention node con attrs
 *
 * Esposto via defineExpose({ onKeyDown }) per ricevere Up/Down/Enter dal
 * Suggestion plugin (stesso pattern di SlashMenu.vue).
 *
 * Limita a max 8 risultati visibili (scrollable se serve).
 */
import { ref, computed, watch, nextTick } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import type { Task } from '../../../../composables/sidera/useAllTasks'

const props = defineProps<{
  items: Task[]
  command: (item: { id: string; projectId: string }) => void
}>()

const selectedIndex = ref(0)
const listRef = ref<HTMLDivElement | null>(null)

watch(() => props.items, () => { selectedIndex.value = 0 })

function selectItem(index: number) {
  const item = props.items[index]
  if (item) props.command({ id: item.id, projectId: item.projectId })
}

function scrollIntoView(idx: number) {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-ts-idx="${idx}"]`) as HTMLElement | null
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
  <div class="ts-root">
    <div class="ts-header">
      <MaterialIcon name="task_alt" :size="14" color="#8b6a14" />
      <span>Menziona task</span>
    </div>
    <div v-if="isEmpty" class="ts-no-results">
      Nessun task trovato
    </div>
    <div v-else ref="listRef" class="ts-list" role="listbox">
      <button
        v-for="(item, idx) in items.slice(0, 50)"
        :key="item.id"
        type="button"
        class="ts-item"
        :class="{
          'ts-item-active': idx === selectedIndex,
          'ts-item-done': item.status === 'done',
        }"
        :data-ts-idx="idx"
        role="option"
        :aria-selected="idx === selectedIndex"
        @mouseenter="selectedIndex = idx"
        @click="selectItem(idx)"
      >
        <span class="ts-item-icon">
          <MaterialIcon
            name="task_alt"
            :size="16"
            :fill="item.status === 'done' ? 1 : 0"
            :color="item.status === 'done' ? '#7a9b7a' : '#8b6a14'"
          />
        </span>
        <span class="ts-item-title">{{ item.title || '(senza titolo)' }}</span>
        <span v-if="item.projectId" class="ts-item-project" title="In progetto">
          <MaterialIcon name="folder" :size="11" /> {{ item.projectId.slice(0, 6) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ts-root {
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
.ts-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 11px;
  font-weight: 500;
  color: #8b6a14;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ts-no-results {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.ts-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: thin;
}
.ts-item {
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
.ts-item:hover,
.ts-item-active {
  background: rgba(212, 160, 32, 0.12);
}
.ts-item-icon { flex-shrink: 0; }
.ts-item-title {
  flex: 1;
  font-size: 13px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-item-done .ts-item-title {
  opacity: 0.55;
  text-decoration: line-through;
}
.ts-item-project {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10.5px;
  color: #999;
  padding: 1px 6px;
  background: rgba(0,0,0,0.04);
  border-radius: 999px;
  flex-shrink: 0;
}
</style>
