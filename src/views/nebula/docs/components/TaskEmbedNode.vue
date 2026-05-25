<script setup lang="ts">
/**
 * TaskEmbedNode — NodeView Vue per `task-embed` (database view inline).
 *
 * Mostra lista live di task CEPHEID filtrata. Riusa lo stesso `useAllTasks`
 * del parent (passato come getter via options dell'estensione).
 *
 * Filter UI inline: bottone ⚙ → mostra/nasconde panel filtri sotto l'header.
 * Update attrs via `updateAttributes` di TipTap (passato come prop).
 *
 * Auto-titolo derivato dai filtri attivi ("Task da fare", "Task del progetto X").
 */
import { computed, ref, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import MaterialIcon from './MaterialIcon.vue'
import type { Task } from '../../../../composables/sidera/useAllTasks'
import type { Project } from '../../../../composables/sidera/useProjects'

interface FilterShape {
  status: 'todo' | 'done' | 'all'
  projectId: string | null
  type: 'task' | 'milestone' | 'deliverable' | 'all'
  limit: number
}

const DEFAULT_FILTER: FilterShape = {
  status: 'todo',
  projectId: null,
  type: 'task',
  limit: 20,
}

const props = defineProps<{
  node: {
    attrs: {
      filter: Partial<FilterShape> | null
      view: string
    }
  }
  // updateAttributes da TipTap permette di modificare i node attrs persisted
  updateAttributes: (attrs: Record<string, unknown>) => void
  // Extension options inietta i getter
  extension: {
    options: {
      allTasks: () => Task[]
      allProjects: () => Project[]
    }
  }
}>()

const filter = computed<FilterShape>(() => ({
  ...DEFAULT_FILTER,
  ...(props.node.attrs.filter ?? {}),
}))

// ── Local edit state per panel filtri ───────────────────────────────────────
const showFilters = ref(false)
const draftFilter = ref<FilterShape>({ ...filter.value })

function openFilters() {
  draftFilter.value = { ...filter.value }
  showFilters.value = true
}

function applyFilters() {
  // Deep clone via JSON: la draftFilter è in un ref reattivo. Spread superficiale
  // funziona per primitivi ma vogliamo zero rischio Proxy nella struttura
  // persistita nei node attrs (verrebbe poi serializzata da editor.getJSON).
  const safe = JSON.parse(JSON.stringify(draftFilter.value))
  props.updateAttributes({ filter: safe })
  showFilters.value = false
}

function cancelFilters() {
  showFilters.value = false
}

// ── Filtro client-side su useAllTasks ───────────────────────────────────────
const allTasks = computed(() => props.extension.options.allTasks())
const allProjects = computed(() => props.extension.options.allProjects())

const filteredTasks = computed(() => {
  const f = filter.value
  const list = allTasks.value.filter((t) => {
    if (f.status === 'todo' && t.status === 'done') return false
    if (f.status === 'done' && t.status !== 'done') return false
    if (f.projectId && t.projectId !== f.projectId) return false
    if (f.type !== 'all' && t.type !== f.type) return false
    return true
  })
  return list
})

const totalMatching = computed(() => filteredTasks.value.length)
const visibleTasks = computed(() => filteredTasks.value.slice(0, filter.value.limit))

// ── Auto-titolo ─────────────────────────────────────────────────────────────
const autoTitle = computed(() => {
  const f = filter.value
  const parts: string[] = []
  if (f.type === 'milestone') parts.push('Milestone')
  else if (f.type === 'deliverable') parts.push('Deliverable')
  else parts.push('Task')

  if (f.status === 'todo')      parts.push('da fare')
  else if (f.status === 'done') parts.push('completati')

  if (f.projectId) {
    const proj = allProjects.value.find(p => p.id === f.projectId)
    parts.push(`· ${proj?.name ?? 'progetto'}`)
  }

  return parts.join(' ')
})

// ── Link a CEPHEID con filtri (best-effort) ─────────────────────────────────
const cepheidLink = computed(() => {
  const f = filter.value
  if (f.projectId) return `/cepheid/project/${f.projectId}`
  return '/cepheid'
})

function openCepheid() {
  window.open(cepheidLink.value, '_blank')
}

function projectName(pid: string): string {
  return allProjects.value.find(p => p.id === pid)?.name ?? '(?)'
}

function projectColor(pid: string): string {
  return allProjects.value.find(p => p.id === pid)?.color ?? '#888'
}

// Per il select progetto: lista ordinata
const projectOptions = computed(() =>
  [...allProjects.value]
    .filter(p => !p.archived)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
)

// Per click sul task: apre dettaglio
function openTask(t: Task) {
  if (t.projectId) window.open(`/cepheid/project/${t.projectId}`, '_blank')
  else window.open('/cepheid', '_blank')
}

// Debug currentView attr (può tornare utile)
const view = toRef(() => props.node.attrs.view ?? 'list')
void view
</script>

<template>
  <NodeViewWrapper as="div" class="te-root" contenteditable="false">
    <header class="te-header">
      <div class="te-title">
        <MaterialIcon name="list_alt" :size="18" color="#C46030" />
        <span>{{ autoTitle }}</span>
      </div>
      <button
        type="button"
        class="te-filter-btn"
        :class="{ 'te-filter-btn-active': showFilters }"
        :aria-label="'Modifica filtri'"
        :title="'Modifica filtri'"
        @click="showFilters ? cancelFilters() : openFilters()"
      >
        <MaterialIcon name="tune" :size="14" />
        <span>Filtri</span>
      </button>
    </header>

    <!-- Filter panel (collassabile) -->
    <div v-if="showFilters" class="te-filters">
      <div class="te-filter-row">
        <label>Stato</label>
        <select v-model="draftFilter.status">
          <option value="todo">Da fare</option>
          <option value="done">Completati</option>
          <option value="all">Tutti</option>
        </select>
      </div>
      <div class="te-filter-row">
        <label>Progetto</label>
        <select v-model="draftFilter.projectId">
          <option :value="null">Tutti i progetti</option>
          <option v-for="p in projectOptions" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </div>
      <div class="te-filter-row">
        <label>Tipo</label>
        <select v-model="draftFilter.type">
          <option value="task">Task</option>
          <option value="milestone">Milestone</option>
          <option value="deliverable">Deliverable</option>
          <option value="all">Tutti</option>
        </select>
      </div>
      <div class="te-filter-row">
        <label>Limite</label>
        <input v-model.number="draftFilter.limit" type="number" min="1" max="50" />
      </div>
      <div class="te-filter-actions">
        <button type="button" class="te-btn te-btn-secondary" @click="cancelFilters">Annulla</button>
        <button type="button" class="te-btn te-btn-primary" @click="applyFilters">Applica</button>
      </div>
    </div>

    <!-- Lista task -->
    <ul v-if="visibleTasks.length > 0" class="te-list">
      <li
        v-for="t in visibleTasks"
        :key="t.id"
        class="te-item"
        :class="{ 'te-item-done': t.status === 'done' }"
        @click="openTask(t)"
      >
        <MaterialIcon
          :name="t.type === 'milestone' ? 'flag' : (t.type === 'deliverable' ? 'package_2' : 'task_alt')"
          :size="14"
          :fill="t.status === 'done' ? 1 : 0"
          :color="t.status === 'done' ? '#7a9b7a' : '#8b6a14'"
        />
        <span class="te-item-title">{{ t.title || '(senza titolo)' }}</span>
        <span
          v-if="t.projectId && !filter.projectId"
          class="te-item-proj"
          :style="{ '--te-proj-color': projectColor(t.projectId) }"
        >{{ projectName(t.projectId) }}</span>
      </li>
    </ul>

    <div v-else class="te-empty">
      <MaterialIcon name="inbox" :size="20" color="#bbb" />
      <span>Nessun task corrisponde ai filtri</span>
    </div>

    <!-- Footer count + link -->
    <footer class="te-footer">
      <span class="te-count">
        Mostrando {{ visibleTasks.length }} / {{ totalMatching }}
        <template v-if="totalMatching > filter.limit"> · alcuni nascosti</template>
      </span>
      <button type="button" class="te-cepheid-link" @click="openCepheid">
        Vai a CEPHEID <MaterialIcon name="open_in_new" :size="12" />
      </button>
    </footer>
  </NodeViewWrapper>
</template>

<style scoped>
.te-root {
  display: block;
  margin: 1em 0;
  border-radius: 12px;
  border: 1px solid rgba(196, 96, 48, 0.20);
  background: color-mix(in srgb, #C46030 4%, white);
  overflow: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
}

.te-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: color-mix(in srgb, #C46030 8%, white);
  border-bottom: 1px solid rgba(196, 96, 48, 0.12);
}
.te-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: #8E4621;
  flex: 1;
}
.te-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid rgba(196, 96, 48, 0.30);
  color: #C46030;
  border-radius: 999px;
  padding: 3px 10px;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: background 100ms ease;
}
.te-filter-btn:hover { background: rgba(196, 96, 48, 0.08); }
.te-filter-btn-active {
  background: rgba(196, 96, 48, 0.15);
  border-color: rgba(196, 96, 48, 0.50);
}

/* Filter panel */
.te-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  padding: 12px 14px;
  background: rgba(255,255,255,0.6);
  border-bottom: 1px solid rgba(196, 96, 48, 0.12);
  font-size: 12.5px;
}
.te-filter-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.te-filter-row label {
  font-size: 10.5px;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}
.te-filter-row select,
.te-filter-row input {
  padding: 4px 8px;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 6px;
  background: white;
  font: inherit;
  font-size: 12.5px;
}
.te-filter-row select:focus,
.te-filter-row input:focus {
  border-color: #C46030;
  outline: 0;
}
.te-filter-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.te-btn {
  border: 0;
  border-radius: 999px;
  padding: 5px 14px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.te-btn-secondary { background: rgba(0,0,0,0.06); color: #444; }
.te-btn-secondary:hover { background: rgba(0,0,0,0.10); }
.te-btn-primary { background: #C46030; color: white; }
.te-btn-primary:hover { background: #B85425; }

/* List */
.te-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
}
.te-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 80ms ease;
  font-size: 13px;
}
.te-item:hover { background: rgba(196, 96, 48, 0.06); }
.te-item-done { opacity: 0.5; }
.te-item-done .te-item-title { text-decoration: line-through; }
.te-item-title {
  flex: 1;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.te-item-proj {
  font-size: 10.5px;
  padding: 1px 7px;
  background: color-mix(in srgb, var(--te-proj-color, #5B7F2E) 14%, transparent);
  color: color-mix(in srgb, var(--te-proj-color, #5B7F2E) 85%, #1a1a1a);
  border-radius: 999px;
  flex-shrink: 0;
}

.te-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #999;
  font-size: 13px;
}

/* Footer */
.te-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(255,255,255,0.6);
  border-top: 1px solid rgba(196, 96, 48, 0.10);
  font-size: 11.5px;
}
.te-count { color: #888; }
.te-cepheid-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  color: #C46030;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  padding: 2px 6px;
  border-radius: 4px;
}
.te-cepheid-link:hover { background: rgba(196, 96, 48, 0.08); }
</style>
