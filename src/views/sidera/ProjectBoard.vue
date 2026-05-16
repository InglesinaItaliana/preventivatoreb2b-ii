<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftIcon, PlusIcon, XMarkIcon,
  ViewColumnsIcon, Bars3BottomLeftIcon, CalendarIcon, DocumentTextIcon,
} from '@heroicons/vue/24/outline'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useProjectTasks } from '../../composables/sidera/useProjectTasks'
import { useCurrentUser }   from '../../composables/sidera/useCurrentUser'
import { avatarColor, avatarInitial } from '../../composables/sidera/useTeamMembers'

const route  = useRoute()
const router = useRouter()

const projectId = route.params.id as string

// ── Project doc ───────────────────────────────────────────────────────────
interface ProjectState { id: string; label: string; color: string; order: number }
interface ProjectData  { name: string; color: string; states: ProjectState[]; taskCount: number; doneCount: number }

const project = ref<ProjectData | null>(null)
const projLoading = ref(true)

onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'projects', projectId))
    if (snap.exists()) {
      const d = snap.data()
      project.value = {
        name:      d.name      ?? '',
        color:     d.color     ?? '#2F6B4A',
        states:    d.states    ?? [],
        taskCount: d.taskCount ?? 0,
        doneCount: d.doneCount ?? 0,
      }
    }
  } catch (e) {
    console.error('[ProjectBoard] getDoc', e)
  } finally {
    projLoading.value = false
  }
})

// ── Tasks ─────────────────────────────────────────────────────────────────
const { tasks, loading: tasksLoading, createTask, completeTask, updateTaskStatus } = useProjectTasks(projectId)
const { currentUser } = useCurrentUser()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')

// ── Kanban ────────────────────────────────────────────────────────────────
const sortedStates = computed(() =>
  [...(project.value?.states ?? [])].sort((a, b) => a.order - b.order)
)

function tasksInCol(colId: string) {
  return tasks.value.filter(t => t.status === colId)
}

function isTaskDone(t: { id: string; completedAt: Date | null }) {
  return !!t.completedAt || doneLocal.value.has(t.id)
}

// ── Status picker ─────────────────────────────────────────────────────────
const statusPickerFor = ref<string | null>(null)

function openStatusPicker(taskId: string) {
  statusPickerFor.value = statusPickerFor.value === taskId ? null : taskId
}

async function moveTask(taskId: string, newStatus: string) {
  statusPickerFor.value = null
  await updateTaskStatus(taskId, newStatus)
}

function stateLabel(id: string): string {
  return sortedStates.value.find(s => s.id === id)?.label ?? id
}

function stateColor(id: string): string {
  return sortedStates.value.find(s => s.id === id)?.color ?? '#B4B0AA'
}

// ── Inline task creation ──────────────────────────────────────────────────
const addingIn  = ref<string | null>(null)
const newTitle  = ref('')
const addSaving = ref(false)

function startAdd(colId: string) {
  addingIn.value = colId
  newTitle.value = ''
}

function cancelAdd() { addingIn.value = null; newTitle.value = '' }

async function confirmAdd(colId: string, priority: 'alta' | 'media' | 'bassa' = 'media') {
  const title = newTitle.value.trim()
  if (!title || addSaving.value) return
  addSaving.value = true
  try {
    await createTask({ title, status: colId, priority, dueDate: null })
    cancelAdd()
  } finally {
    addSaving.value = false
  }
}

async function handleAddKeydown(e: KeyboardEvent, colId: string) {
  if (e.key === 'Enter')  confirmAdd(colId)
  if (e.key === 'Escape') cancelAdd()
}

// ── Complete from board ───────────────────────────────────────────────────
const doneLocal = ref<Set<string>>(new Set())

async function toggleDone(taskId: string) {
  if (doneLocal.value.has(taskId)) return
  const s = new Set(doneLocal.value)
  s.add(taskId)
  doneLocal.value = s
  await completeTask(taskId)
}

// ── View tab ──────────────────────────────────────────────────────────────
const tab = ref('board')

const pct = computed(() => {
  if (!project.value?.taskCount) return 0
  return Math.round((project.value.doneCount / project.value.taskCount) * 100)
})

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#2F6B4A', bassa: '#7A8FA6' }

const allTasksFlat = computed(() => tasks.value)

const views = [
  { id: 'board', label: 'Board',      icon: ViewColumnsIcon },
  { id: 'list',  label: 'Lista',      icon: Bars3BottomLeftIcon },
  { id: 'cal',   label: 'Calendario', icon: CalendarIcon },
  { id: 'notes', label: 'Note',       icon: DocumentTextIcon },
]
</script>

<template>
  <div class="bv s-fade-in">
    <!-- Sticky header -->
    <div class="bv-header">
      <div class="bv-breadcrumb">
        <button class="bv-back" @click="router.push('/sidera/projects')">
          <ArrowLeftIcon style="width:13px;height:13px" />Progetti
        </button>
        <span class="bv-sep">/</span>
        <span class="bv-crumb">{{ project?.name ?? '…' }}</span>
      </div>
      <div class="bv-title-row">
        <div v-if="projLoading" class="title-skeleton" />
        <h1 v-else class="bv-title">{{ project?.name ?? 'Progetto' }}</h1>
        <span
          v-if="project"
          class="bv-pct"
          :style="{ color: project.color, background: project.color + '12' }"
        >{{ pct }}% completato</span>
      </div>
      <div class="bv-tabs">
        <button
          v-for="v in views"
          :key="v.id"
          class="view-tab"
          :class="{ 'is-active': tab === v.id }"
          @click="tab = v.id"
        >
          <component :is="v.icon" style="width:12px;height:12px" />{{ v.label }}
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="bv-body">
      <!-- Board -->
      <template v-if="tab === 'board'">
        <div v-if="projLoading || tasksLoading" class="kanban">
          <div v-for="i in 4" :key="i" class="col-skeleton" />
        </div>
        <div v-else class="kanban">
          <div v-for="col in sortedStates" :key="col.id" class="kanban-col">
            <div class="col-header">
              <div class="col-header-left">
                <div class="col-dot" :style="{ background: col.color }" />
                <span class="col-label">{{ col.label }}</span>
                <span class="col-count">{{ tasksInCol(col.id).length }}</span>
              </div>
              <button v-if="isAdmin" class="col-add-btn" @click="startAdd(col.id)">
                <PlusIcon style="width:12px;height:12px" />
              </button>
            </div>

            <div
              v-for="t in tasksInCol(col.id)"
              :key="t.id"
              class="kanban-card"
              :class="{ 'is-done': isTaskDone(t) }"
              :style="{ borderLeftColor: prioColor[t.priority] }"
            >
              <div class="card-title">{{ t.title }}</div>
              <div class="card-footer">
                <!-- Assignee avatar -->
                <div
                  v-if="t.assignee"
                  class="card-avatar"
                  :title="t.assignee"
                  :style="{ background: avatarColor(t.assignee) + '20', border: '1.5px solid ' + avatarColor(t.assignee) + '50', color: avatarColor(t.assignee) }"
                >{{ avatarInitial(t.assignee) }}</div>
                <div v-else class="card-avatar card-avatar--empty">–</div>

                <div class="card-right">
                  <div class="card-prio" :style="{ background: prioColor[t.priority] }" />

                  <!-- Status picker -->
                  <div v-if="isAdmin && !isTaskDone(t)" class="status-picker-wrap">
                    <button
                      class="status-trigger"
                      :title="'Sposta: ' + stateLabel(t.status)"
                      @click.stop="openStatusPicker(t.id)"
                    >
                      <span class="status-dot-sm" :style="{ background: stateColor(t.status) }" />
                      <span class="status-trigger-arrow">▾</span>
                    </button>
                    <div v-if="statusPickerFor === t.id" class="status-dropdown">
                      <button
                        v-for="s in sortedStates.filter(s => s.id !== t.status)"
                        :key="s.id"
                        class="status-option"
                        @click.stop="moveTask(t.id, s.id)"
                      >
                        <span class="status-dot-sm" :style="{ background: s.color }" />
                        {{ s.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Complete btn -->
                  <button
                    v-if="isAdmin && !isTaskDone(t)"
                    class="card-complete-btn"
                    title="Segna come completata"
                    @click.stop="toggleDone(t.id)"
                  >✓</button>
                </div>
              </div>
            </div>

            <!-- Inline add form -->
            <div v-if="addingIn === col.id" class="inline-add">
              <input
                v-model="newTitle"
                class="add-input"
                placeholder="Titolo azione…"
                autofocus
                @keydown="handleAddKeydown($event, col.id)"
              />
              <div class="add-actions">
                <button class="add-confirm" :disabled="!newTitle.trim() || addSaving" @click="confirmAdd(col.id)">
                  Aggiungi
                </button>
                <button class="add-cancel" @click="cancelAdd">
                  <XMarkIcon style="width:11px;height:11px" />
                </button>
              </div>
            </div>

            <div
              v-else-if="isAdmin"
              class="add-task"
              @click="startAdd(col.id)"
            >
              <PlusIcon style="width:11px;height:11px" />Aggiungi azione
            </div>
          </div>

        </div>
      </template>

      <!-- List -->
      <template v-else-if="tab === 'list'">
        <div class="list-view">
          <p class="s-label">Tutte le azioni</p>
          <div v-if="tasksLoading" class="loading-rows">
            <div v-for="i in 4" :key="i" class="row-skeleton" />
          </div>
          <template v-else>
            <div v-for="t in allTasksFlat" :key="t.id" class="list-row">
              <div class="checkbox" :class="{ 'is-checked': !!t.completedAt || doneLocal.has(t.id) }">
                <span v-if="t.completedAt || doneLocal.has(t.id)" style="color:#fff;font-size:9px;font-weight:700">✓</span>
              </div>
              <div class="prio-dot" :style="{ background: prioColor[t.priority] }" />
              <div class="list-title" :class="{ 'is-done': !!t.completedAt }">{{ t.title }}</div>
              <span class="list-state" :style="{ color: sortedStates.find(s => s.id === t.status)?.color }">
                {{ sortedStates.find(s => s.id === t.status)?.label ?? t.status }}
              </span>
            </div>
          </template>
        </div>
      </template>

      <!-- Placeholder -->
      <template v-else>
        <div class="placeholder">
          <div class="placeholder-icon">{{ tab === 'cal' ? '◫' : '▤' }}</div>
          <div>Vista {{ tab === 'cal' ? 'Calendario' : 'Note' }} · disponibile a breve</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bv {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

/* Header */
.bv-header {
  padding: 22px 36px 0;
  border-bottom: 1px solid var(--s-border);
  background: var(--s-surface);
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  flex-shrink: 0;
}

.bv-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }

.bv-back {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim);
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-family: 'Outfit', sans-serif; padding: 0;
  transition: color 0.15s;
}

.bv-back:hover { color: var(--s-text-mid); }
.bv-sep   { color: var(--s-border-mid); }
.bv-crumb { font-size: 12px; color: var(--s-text-mid); }

.bv-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }

.title-skeleton {
  width: 180px; height: 30px;
  background: var(--s-border); border-radius: 6px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.bv-title { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 500; }

.bv-pct { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }

.bv-tabs {
  display: flex; gap: 2px;
  background: var(--s-surface-up);
  padding: 3px; border-radius: 8px;
  width: fit-content;
  border: 1px solid var(--s-border);
  margin-bottom: -1px;
}

.view-tab {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 7px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  border: none; background: transparent;
  color: var(--s-text-dim); font-family: 'Outfit', sans-serif;
  transition: all 0.15s; letter-spacing: 0.02em;
}

.view-tab:hover { color: var(--s-text-mid); background: var(--s-border); }
.view-tab.is-active { background: var(--s-surface); color: var(--s-text); box-shadow: 0 1px 3px rgba(0,0,0,.07); }

/* Body */
.bv-body { flex: 1; overflow: auto; padding: 24px 36px; background: var(--s-bg); }

/* Kanban */
.kanban { display: flex; gap: 12px; align-items: flex-start; }

/* Skeleton cols */
.col-skeleton {
  width: 228px; min-height: 200px; flex-shrink: 0;
  background: var(--s-surface); border: 1px solid var(--s-border);
  border-radius: 10px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

@keyframes s-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.kanban-col {
  background: var(--s-surface-up);
  border: 1px solid var(--s-border);
  border-radius: 10px;
  padding: 12px;
  width: 228px;
  flex-shrink: 0;
}

.kanban-col--done { opacity: 0.65; }

.col-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.col-header-left { display: flex; align-items: center; gap: 7px; }
.col-dot { width: 7px; height: 7px; border-radius: 50%; }

.col-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--s-text-mid); }
.col-count { font-size: 11px; color: var(--s-text-dim); }

.col-add-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); padding: 2px;
  border-radius: 4px; display: flex; align-items: center;
  transition: color 0.15s;
}

.col-add-btn:hover { color: var(--s-text); background: var(--s-border); }

.kanban-card {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-left: 3px solid transparent;
  border-radius: 9px;
  padding: 12px;
  margin-bottom: 7px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px; line-height: 1.4; color: var(--s-text);
}

.kanban-card:hover { border-color: var(--s-border-mid); box-shadow: 0 2px 8px rgba(0,0,0,.05); }
.kanban-card.is-done { opacity: 0.35; }
.kanban-card--done { cursor: default; }

.card-title { margin-bottom: 10px; }

.card-footer { display: flex; align-items: center; gap: 6px; }

.card-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; flex-shrink: 0;
}

.card-avatar--empty {
  background: var(--s-surface-up) !important;
  border: 1.5px dashed var(--s-border-mid) !important;
  color: var(--s-text-dim) !important;
  font-size: 11px; font-weight: 400;
}

.card-right { display: flex; align-items: center; gap: 5px; margin-left: auto; }

.card-prio { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

.card-complete-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); font-size: 11px; padding: 0;
  transition: color 0.15s; line-height: 1;
}

.card-complete-btn:hover { color: var(--s-green); }

/* Status picker */
.status-picker-wrap { position: relative; }

.status-trigger {
  display: flex; align-items: center; gap: 3px;
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); padding: 2px 4px;
  border-radius: 4px; transition: background 0.12s;
}

.status-trigger:hover { background: var(--s-border); color: var(--s-text-mid); }
.status-trigger-arrow { font-size: 8px; }

.status-dot-sm {
  width: 6px; height: 6px; border-radius: 50%;
  display: inline-block; flex-shrink: 0;
}

.status-dropdown {
  position: absolute;
  bottom: calc(100% + 4px); right: 0;
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 50; min-width: 140px; padding: 4px;
}

.status-option {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 10px;
  background: none; border: none; cursor: pointer;
  font-size: 12px; font-family: 'Outfit', sans-serif;
  color: var(--s-text-mid); border-radius: 6px;
  transition: background 0.12s; text-align: left;
}

.status-option:hover { background: var(--s-surface-up); color: var(--s-text); }

/* Inline add */
.inline-add {
  background: var(--s-surface);
  border: 1px solid var(--s-green);
  border-radius: 9px;
  padding: 10px;
  margin-bottom: 7px;
}

.add-input {
  width: 100%;
  box-sizing: border-box;
  background: none;
  border: none;
  outline: none;
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
  margin-bottom: 8px;
}

.add-input::placeholder { color: var(--s-text-dim); }

.add-actions { display: flex; gap: 6px; align-items: center; }

.add-confirm {
  padding: 4px 10px;
  background: var(--s-green); color: #fff;
  border: none; border-radius: 6px;
  font-size: 11px; font-weight: 500;
  font-family: 'Outfit', sans-serif;
  cursor: pointer; transition: background 0.15s;
}

.add-confirm:hover:not(:disabled) { background: var(--s-green-light); }
.add-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

.add-cancel {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); display: flex; align-items: center; padding: 2px;
}

.add-task {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 8px;
  font-size: 11px; color: var(--s-text-dim);
  cursor: pointer; border-radius: 6px; transition: all 0.15s;
}

.add-task:hover { background: var(--s-border); color: var(--s-text-mid); }

/* List view */
.list-view { max-width: 640px; }

.s-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--s-text-dim); margin-bottom: 16px; }

.loading-rows { display: flex; flex-direction: column; gap: 6px; }

.row-skeleton { height: 44px; background: var(--s-surface); border-radius: 9px; animation: s-pulse 1.4s ease-in-out infinite; }

.list-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px;
  background: var(--s-surface);
  border-radius: 9px; border: 1px solid var(--s-border);
  margin-bottom: 6px; cursor: pointer; transition: all 0.15s;
}

.list-row:hover { border-color: var(--s-border-mid); box-shadow: var(--s-shadow-hover); }

.checkbox {
  width: 17px; height: 17px;
  border-radius: 5px; border: 1.5px solid var(--s-border-mid);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.checkbox.is-checked { background: var(--s-green); border-color: var(--s-green); }

.prio-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.list-title { flex: 1; font-size: 13px; }
.list-title.is-done { text-decoration: line-through; color: var(--s-text-dim); }
.list-state { font-size: 11px; font-weight: 600; flex-shrink: 0; }

/* Placeholder */
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 60%; gap: 12px; color: var(--s-text-dim); font-size: 13px;
}

.placeholder-icon { font-size: 36px; opacity: 0.3; }
</style>
