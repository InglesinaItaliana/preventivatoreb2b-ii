<script setup lang="ts">
/**
 * UniversalSuggester — popup poliglotta per il trigger `@` (F5-C2).
 *
 * Items unificati con campo `kind`:
 *  - 'user' → inserisce userMention
 *  - 'task' → inserisce taskMention
 *  - 'project' → inserisce projectMention
 *
 * Filter già fatto a monte (nel render del Suggestion plugin). Qui solo
 * UI: grouping per kind, nav keyboard, click select.
 *
 * Esposto onKeyDown via defineExpose per i Up/Down/Enter da Suggestion.
 */
import { ref, computed, watch, nextTick } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import StarAvatar from '../../../../components/shared/StarAvatar.vue'
import { useTeamMembers, starAvatarProps } from '../../../../composables/sidera/useTeamMembers'

export interface UniversalItem {
  kind: 'user' | 'task' | 'milestone' | 'deliverable' | 'project' | 'obiettivo' | 'doc'
  /** ID per dispatch (email, taskId, projectId o docId) */
  id: string
  /** Display label (nome utente, titolo task, nome progetto, titolo doc) */
  label: string
  /** Secondario per il display (es. project name per task, category per user) */
  sub?: string
  /** Status: 'done' per task, 'completed'/'archived' per project, 'inactive' per user */
  status?: string
  /** Per ricerca cross-source (full email per user, projectId per task...) */
  searchKey?: string
  /** Per task: project parent id (passato al taskMention) */
  projectId?: string
  /** Per project: color */
  color?: string
}

const props = defineProps<{
  items: UniversalItem[]
  command: (item: UniversalItem) => void
}>()

const { members } = useTeamMembers()

const selectedIndex = ref(0)
const listRef = ref<HTMLDivElement | null>(null)

watch(() => props.items, () => { selectedIndex.value = 0 })

function selectItem(idx: number) {
  const item = props.items[idx]
  if (item) props.command(item)
}

function scrollIntoView(idx: number) {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-us-idx="${idx}"]`) as HTMLElement | null
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
    if (event.key === 'ArrowUp') { up(); return true }
    if (event.key === 'ArrowDown') { down(); return true }
    if (event.key === 'Enter') { selectItem(selectedIndex.value); return true }
    return false
  },
})

// Grouping per render con sticky headers
type Kind = 'user' | 'task' | 'milestone' | 'deliverable' | 'project' | 'obiettivo' | 'doc'
interface Group {
  kind: Kind
  label: string
  startIdx: number
  items: UniversalItem[]
}

const GROUP_LABELS: Record<Kind, string> = {
  user: 'Persone',
  task: 'Task',
  milestone: 'Milestone',
  deliverable: 'Deliverable',
  project: 'Progetti',
  obiettivo: 'Obiettivi',
  doc: 'Documenti',
}

const groups = computed<Group[]>(() => {
  const order: Kind[] = ['user', 'task', 'milestone', 'deliverable', 'project', 'obiettivo', 'doc']
  const out: Group[] = []
  let cursor = 0
  for (const kind of order) {
    const slice = props.items.filter(i => i.kind === kind)
    if (slice.length === 0) continue
    out.push({
      kind,
      label: GROUP_LABELS[kind],
      startIdx: cursor,
      items: slice,
    })
    cursor += slice.length
  }
  return out
})

// Colore vivo = identità di modulo (M3). NEBULA #C46030 (persone+doc),
// CEPHEID #D4A020 (task/milestone/deliverable/progetti), QUASAR #98C0D0 (obiettivi).
function kindAccent(kind: Kind): string {
  if (kind === 'user')        return '#C46030'  // NEBULA
  if (kind === 'task')        return '#D4A020'  // CEPHEID oro
  if (kind === 'milestone')   return '#D4A020'  // CEPHEID oro
  if (kind === 'deliverable') return '#D4A020'  // CEPHEID oro
  if (kind === 'project')     return '#D4A020'  // CEPHEID oro
  if (kind === 'obiettivo')   return '#98C0D0'  // QUASAR azzurro
  return '#C46030'                              // NEBULA (documenti)
}

function kindIcon(kind: Kind): string {
  if (kind === 'user')        return 'person'
  if (kind === 'task')        return 'check_circle'
  if (kind === 'milestone')   return 'flag'
  if (kind === 'deliverable') return 'inventory_2'
  if (kind === 'project')     return 'folder'
  if (kind === 'obiettivo')   return 'track_changes'
  return 'description'
}

const isEmpty = computed(() => props.items.length === 0)
</script>

<template>
  <div class="us-root">
    <div class="us-header">
      <MaterialIcon name="alternate_email" :size="14" color="#777" />
      <span>Menziona</span>
    </div>

    <div v-if="isEmpty" class="us-no-results">Nessun risultato</div>

    <div v-else ref="listRef" class="us-list" role="listbox">
      <template v-for="g in groups" :key="g.kind">
        <div class="us-group-header" :style="{ color: kindAccent(g.kind) }">
          <MaterialIcon :name="kindIcon(g.kind)" :size="11" />
          <span>{{ g.label }}</span>
        </div>
        <button
          v-for="(item, i) in g.items"
          :key="`${g.kind}-${item.id}`"
          type="button"
          class="us-item"
          :class="{
            'us-item-active': (g.startIdx + i) === selectedIndex,
            'us-item-dim': item.status === 'done' || item.status === 'completed' || item.status === 'archived' || item.status === 'inactive',
          }"
          :style="{ '--us-accent': kindAccent(g.kind) }"
          :data-us-idx="g.startIdx + i"
          role="option"
          @mouseenter="selectedIndex = g.startIdx + i"
          @click="selectItem(g.startIdx + i)"
        >
          <span class="us-item-icon">
            <StarAvatar
              v-if="g.kind === 'user'"
              v-bind="starAvatarProps(item.id, members)"
              :size="20"
            />
            <MaterialIcon
              v-else-if="g.kind === 'task'"
              name="check_circle"
              :size="16"
              :fill="item.status === 'done' ? 1 : 0"
              :color="kindAccent(g.kind)"
            />
            <MaterialIcon
              v-else-if="g.kind === 'milestone'"
              name="flag"
              :size="16"
              :fill="item.status === 'done' ? 1 : 0"
              :color="kindAccent(g.kind)"
            />
            <MaterialIcon
              v-else-if="g.kind === 'deliverable'"
              name="inventory_2"
              :size="16"
              :fill="item.status === 'done' ? 1 : 0"
              :color="kindAccent(g.kind)"
            />
            <MaterialIcon
              v-else-if="g.kind === 'project'"
              :name="item.status === 'completed' ? 'folder_special' : 'folder'"
              :size="16"
              :fill="item.status === 'completed' ? 1 : 0"
              :color="item.color || kindAccent(g.kind)"
            />
            <MaterialIcon
              v-else-if="g.kind === 'obiettivo'"
              name="track_changes"
              :size="16"
              :fill="item.status === 'completed' ? 1 : 0"
              :color="kindAccent(g.kind)"
            />
            <MaterialIcon
              v-else
              name="description"
              :size="16"
              :color="kindAccent(g.kind)"
            />
          </span>
          <span class="us-item-meta">
            <span class="us-item-title">{{ item.label }}</span>
            <span v-if="item.sub" class="us-item-sub">{{ item.sub }}</span>
          </span>
        </button>
      </template>
    </div>

    <div v-if="!isEmpty" class="us-footer-hint">
      <kbd>↑↓</kbd> naviga · <kbd>↵</kbd> seleziona · <kbd>Esc</kbd> chiudi
    </div>
  </div>
</template>

<style scoped>
.us-root {
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.10);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  width: 340px;
  max-height: 400px;
  overflow: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}
.us-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  font-size: 11px;
  font-weight: 500;
  color: #777;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.us-no-results {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.us-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: thin;
}

.us-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
}

.us-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background 80ms ease;
}
.us-item:hover,
.us-item-active {
  background: color-mix(in srgb, var(--us-accent, #777) 12%, transparent);
}
.us-item-dim { opacity: 0.55; }
.us-item-icon { flex-shrink: 0; display: inline-flex; align-items: center; }
.us-item-meta {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-width: 0;
}
.us-item-title {
  font-size: 13px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.us-item-sub {
  font-size: 10.5px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.us-item-dim .us-item-title { text-decoration: line-through; }

.us-footer-hint {
  padding: 6px 12px;
  border-top: 1px solid rgba(0,0,0,0.06);
  font-size: 10.5px;
  color: #aaa;
  background: #fafafa;
}
.us-footer-hint kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(0,0,0,0.06);
  border-radius: 3px;
  margin: 0 1px;
}
</style>
