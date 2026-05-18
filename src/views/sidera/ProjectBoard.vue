<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MaterialIcon from '../../components/MaterialIcon.vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useProjectTasks, type ProjectTask } from '../../composables/sidera/useProjectTasks'
import { useProjects }     from '../../composables/sidera/useProjects'
import { useCurrentUser }  from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, avatarColor, avatarInitial, displayName } from '../../composables/sidera/useTeamMembers'

const route  = useRoute()
const router = useRouter()

const projectId = route.params.id as string

// ── Project doc ───────────────────────────────────────────────────────────
interface ProjectState { id: string; label: string; color: string; order: number }
interface ProjectData  { name: string; description: string; color: string; states: ProjectState[]; taskCount: number; doneCount: number }

const project = ref<ProjectData | null>(null)
const projLoading = ref(true)

onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'projects', projectId))
    if (snap.exists()) {
      const d = snap.data()
      project.value = {
        name:        d.name        ?? '',
        description: d.description ?? '',
        color:       d.color       ?? '#2F6B4A',
        states:      d.states      ?? [],
        taskCount:   d.taskCount   ?? 0,
        doneCount:   d.doneCount   ?? 0,
      }
    }
  } catch (e) {
    console.error('[ProjectBoard] getDoc', e)
  } finally {
    projLoading.value = false
  }
})

// ── Tasks ─────────────────────────────────────────────────────────────────
const { tasks, loading: tasksLoading, createTask, completeTask, updateTaskStatus, updateTask, deleteTask } = useProjectTasks(projectId)
const { deleteProject } = useProjects()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')

const descExpanded = ref(false)
const descIsLong   = computed(() => (project.value?.description?.length ?? 0) > 140)

async function handleDeleteProject() {
  if (!confirm(`Eliminare il progetto "${project.value?.name}" e tutte le sue azioni? L'operazione è irreversibile.`)) return
  await deleteProject(projectId)
  router.push('/sidera/projects')
}

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

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

const allTasksFlat = computed(() => tasks.value)

const views = [
  { id: 'board', label: 'Board',      icon: 'view_kanban' },
  { id: 'list',  label: 'Lista',      icon: 'list' },
  { id: 'cal',   label: 'Calendario', icon: 'calendar_month' },
  { id: 'notes', label: 'Note',       icon: 'description' },
]

// ── Edit task modal ──────────────────────────────────────────────────────────
const editingTask = ref<ProjectTask | null>(null)
const showEdit    = ref(false)
const editSaving  = ref(false)
const editDeleting = ref(false)

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

const editForm = ref({
  title:     '',
  priority:  'media' as 'alta' | 'media' | 'bassa',
  dueDate:   '',
  assignees: [] as string[],
})

function openEditTask(t: ProjectTask) {
  if (!isAdmin.value) return
  editingTask.value = t
  editForm.value = {
    title:     t.title,
    priority:  t.priority,
    dueDate:   t.dueDate ? (t.dueDate.toISOString().split('T')[0] ?? '') : '',
    assignees: [...t.assignees],
  }
  showEdit.value = true
}

function closeEdit() { showEdit.value = false; editingTask.value = null }

function toggleEditAssignee(email: string) {
  const idx = editForm.value.assignees.indexOf(email)
  if (idx === -1) editForm.value.assignees.push(email)
  else editForm.value.assignees.splice(idx, 1)
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

async function saveEdit() {
  if (!editingTask.value || !editForm.value.title.trim() || editSaving.value) return
  editSaving.value = true
  try {
    const dueDate = editForm.value.dueDate ? parseDateInput(editForm.value.dueDate) : null
    await updateTask(editingTask.value.id, {
      title:     editForm.value.title.trim(),
      priority:  editForm.value.priority,
      dueDate,
      assignees: editForm.value.assignees,
    })
    closeEdit()
  } finally {
    editSaving.value = false
  }
}

async function deleteCurrentTask() {
  if (!editingTask.value || editDeleting.value) return
  if (!confirm('Eliminare questa azione?')) return
  editDeleting.value = true
  try {
    await deleteTask(editingTask.value.id, !!editingTask.value.completedAt)
    closeEdit()
  } finally {
    editDeleting.value = false
  }
}
</script>

<template>
  <div class="bv s-fade-in">
    <!-- Sticky header -->
    <div class="bv-header">
      <div class="bv-breadcrumb">
        <button class="bv-back" @click="router.push('/sidera/projects')">
          <MaterialIcon name="arrow_back" :size="15" />Progetti
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
        <button v-if="isAdmin && !projLoading" class="bv-delete-btn" title="Elimina progetto" @click="handleDeleteProject">
          <MaterialIcon name="delete" :size="15" />
        </button>
      </div>
      <div v-if="project?.description" class="bv-description">
        <p class="bv-description-text" :class="{ 'is-collapsed': !descExpanded && descIsLong }">
          {{ project.description }}
        </p>
        <button v-if="descIsLong" class="bv-description-toggle" @click="descExpanded = !descExpanded">
          {{ descExpanded ? 'mostra meno' : 'leggi tutto' }}
        </button>
      </div>
      <div class="bv-tabs">
        <button
          v-for="v in views"
          :key="v.id"
          class="view-tab"
          :class="{ 'is-active': tab === v.id }"
          @click="tab = v.id"
        >
          <MaterialIcon :name="v.icon" :size="14" :filled="tab === v.id" :weight="tab === v.id ? 600 : 400" />{{ v.label }}
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
                <MaterialIcon name="add" :size="14" />
              </button>
            </div>

            <div
              v-for="t in tasksInCol(col.id)"
              :key="t.id"
              class="kanban-card"
              :class="{ 'is-done': isTaskDone(t) }"
              :style="{ borderLeftColor: prioColor[t.priority] }"
              @click="openEditTask(t)"
            >
              <div class="card-title">{{ t.title }}</div>
              <div class="card-footer">
                <!-- Assignees avatars stack -->
                <div class="avatars-stack">
                  <div
                    v-for="email in t.assignees.slice(0, 3)"
                    :key="email"
                    class="card-avatar"
                    :title="email"
                    :style="{ background: avatarColor(email) + '20', border: '1.5px solid ' + avatarColor(email) + '50', color: avatarColor(email) }"
                  >{{ avatarInitial(email, members) }}</div>
                  <div v-if="t.assignees.length > 3" class="card-avatar card-avatar--more">+{{ t.assignees.length - 3 }}</div>
                  <div v-if="!t.assignees.length" class="card-avatar card-avatar--empty">–</div>
                </div>

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
                  <MaterialIcon name="close" :size="13" />
                </button>
              </div>
            </div>

            <div
              v-else-if="isAdmin"
              class="add-task"
              @click="startAdd(col.id)"
            >
              <MaterialIcon name="add" :size="13" />Aggiungi azione
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

    <!-- ── MODAL Modifica azione ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showEdit" class="modal-backdrop" @click.self="closeEdit">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Modifica azione</span>
            <button class="modal-close" @click="closeEdit"><MaterialIcon name="close" :size="18" /></button>
          </div>

          <div class="modal-body">
            <label class="field-label">Titolo *</label>
            <input
              v-model="editForm.title"
              class="field-input"
              placeholder="Descrivi l'azione"
              @keydown.enter="saveEdit"
            />

            <label class="field-label" style="margin-top:16px">Assegna a</label>
            <div class="assignees-chips">
              <div
                v-for="m in members"
                :key="m.email"
                class="assignee-chip"
                :class="{ 'is-selected': editForm.assignees.includes(m.email) }"
                :style="editForm.assignees.includes(m.email) ? { background: avatarColor(m.email) + '20', borderColor: avatarColor(m.email) + '80', color: avatarColor(m.email) } : {}"
                @click="toggleEditAssignee(m.email)"
              >
                <span class="chip-avatar" :style="{ background: avatarColor(m.email), color: '#fff' }">{{ avatarInitial(m.email, members) }}</span>
                {{ displayName(m.email, members) }}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
              <div>
                <label class="field-label">Priorità</label>
                <div class="prio-picker">
                  <button
                    v-for="p in prioOptions"
                    :key="p.id"
                    class="prio-opt"
                    :class="{ 'is-sel': editForm.priority === p.id }"
                    :style="editForm.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                    type="button"
                    @click="editForm.priority = p.id"
                  >
                    <span class="prio-dot-x" :style="{ background: p.color }" />
                    {{ p.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="field-label">Scadenza</label>
                <input v-model="editForm.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-danger" :disabled="editDeleting" @click="deleteCurrentTask">
              <MaterialIcon name="delete" :size="15" />
              {{ editDeleting ? '…' : 'Elimina' }}
            </button>
            <div style="margin-left:auto;display:flex;gap:8px">
              <button class="btn-ghost" @click="closeEdit">Annulla</button>
              <button class="s-btn" :disabled="!editForm.title.trim() || editSaving" @click="saveEdit">
                {{ editSaving ? 'Salvataggio…' : 'Salva' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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

.bv-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }

.bv-description { margin: 0 0 14px 0; }
.bv-description-text {
  margin: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--s-text-mid);
  white-space: pre-wrap;
}
.bv-description-text.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bv-description-toggle {
  margin-top: 4px;
  background: none;
  border: none;
  padding: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: var(--s-text-dim);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.bv-description-toggle:hover { color: var(--s-text-mid); }

.title-skeleton {
  width: 180px; height: 30px;
  background: var(--s-border); border-radius: 6px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.bv-title { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 500; }

.bv-pct { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }

.bv-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 5px;
  margin-left: auto;
  transition: color 0.15s, background 0.15s;
}

.bv-delete-btn:hover { color: #C8521A; background: rgba(200, 82, 26, 0.08); }

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
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 8.5px; font-weight: 700; letter-spacing: 0.02em; flex-shrink: 0;
}

.avatars-stack { display: flex; gap: 2px; align-items: center; }

.card-avatar--empty {
  background: var(--s-surface-up) !important;
  border: 1.5px dashed var(--s-border-mid) !important;
  color: var(--s-text-dim) !important;
  font-size: 11px; font-weight: 400;
}

.card-avatar--more {
  background: var(--s-border) !important;
  border: 1.5px solid var(--s-border-mid) !important;
  color: var(--s-text-dim) !important;
  font-size: 8px; font-weight: 700;
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

/* ── Modal ─────────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 14px;
  width: 460px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  font-family: 'Outfit', sans-serif;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.modal-title { font-size: 15px; font-weight: 600; color: var(--s-text); }

.modal-close {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); padding: 2px;
  border-radius: 4px; transition: color 0.15s;
}

.modal-close:hover { color: var(--s-text); }

.modal-body { padding: 20px 24px; }

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  margin-bottom: 6px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--s-surface-up);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--module-accent); }
.field-input::placeholder { color: var(--s-text-dim); }

.field-date { cursor: pointer; color-scheme: light; }

.assignees-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.assignee-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--s-border);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  background: var(--s-surface-up);
  color: var(--s-text-mid);
  transition: all 0.12s;
  user-select: none;
}

.assignee-chip:hover { border-color: var(--s-border-mid); }
.chip-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 8.5px; font-weight: 700; letter-spacing: 0.02em;
}

.prio-picker { display: flex; gap: 6px; }

.prio-opt {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 10px;
  background: var(--s-surface-up);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text-dim);
  transition: all 0.12s;
}

.prio-opt:hover { color: var(--s-text); }
.prio-dot-x { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

.modal-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px 20px;
  border-top: 1px solid var(--s-border);
  padding-top: 16px;
}

.btn-ghost {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--s-border);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--s-text-mid);
  font-family: 'Outfit', sans-serif;
  transition: all 0.15s;
}

.btn-ghost:hover { border-color: var(--s-border-mid); color: var(--s-text); }

.s-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--module-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: filter 0.15s;
}

.s-btn:hover:not(:disabled) { filter: brightness(1.18); }
.s-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-danger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  background: rgba(200, 82, 26, 0.08);
  border: 1px solid rgba(200, 82, 26, 0.3);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: #C8521A;
  font-family: 'Outfit', sans-serif;
  transition: all 0.15s;
}

.btn-danger:hover:not(:disabled) { background: rgba(200, 82, 26, 0.16); border-color: #C8521A; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
