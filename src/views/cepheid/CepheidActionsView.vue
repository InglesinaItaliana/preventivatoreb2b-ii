<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import { useAllTasks, createStandaloneTask } from '../../composables/sidera/useAllTasks'
import { useProjects } from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarInitial } from '../../composables/sidera/useTeamMembers'
import { pulsarAvatarColor as avatarColor } from '../../composables/pulsar/usePulsarAvatar'

const { tasks, loading: tasksLoading, completeTask, uncompleteTask } = useAllTasks()
const { activeProjects } = useProjects()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

// ── Filtri ────────────────────────────────────────────────────────────────
type Filter = 'mine' | 'all'
const filter = ref<Filter>('mine')

// ── Tasks ─────────────────────────────────────────────────────────────────
const pendingDone = ref<Set<string>>(new Set())
const pendingUndo = ref<Set<string>>(new Set())

async function doComplete(t: { id: string; projectId: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.projectId, t.id)
}

async function doUncomplete(t: { id: string; projectId: string }) {
  if (pendingUndo.value.has(t.id)) return
  pendingUndo.value = new Set([...pendingUndo.value, t.id])
  await uncompleteTask(t.projectId, t.id)
}

const visibleOpen = computed(() => {
  const myEmail = currentUser.value?.email ?? ''
  const myUid   = currentUser.value?.uid ?? ''
  return tasks.value.filter(t => {
    if (t.type && t.type !== 'task') return false
    if (t.completedAt || pendingDone.value.has(t.id)) return false
    if (filter.value === 'all') return true
    return t.assignees.includes(myEmail) || t.createdBy === myUid
  })
})

const doneTasks = computed(() =>
  tasks.value.filter(t =>
    (!t.type || t.type === 'task') &&
    (t.completedAt || pendingDone.value.has(t.id)) &&
    !pendingUndo.value.has(t.id)
  ).slice(0, 10)
)

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

function formatDue(d: Date | null) {
  if (!d) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

function projectName(id: string) {
  return activeProjects.value.find(p => p.id === id)?.name ?? ''
}

function projectColor(id: string) {
  return activeProjects.value.find(p => p.id === id)?.color ?? ''
}

const dueTodayCount = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return visibleOpen.value.filter(t => t.dueDate && t.dueDate >= start && t.dueDate < end).length
})

// Completate di recente: collassabile, collassate di default
const showDone = ref(false)

// ── Nuova azione (modal) ───────────────────────────────────────────────────
const showTaskModal = ref(false)
const taskSaving    = ref(false)
const taskForm = ref({
  title:     '',
  projectId: '',
  priority:  'media' as 'alta' | 'media' | 'bassa',
  dueDate:   '',
  assignees: [] as string[],
})

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

function openTaskModal() {
  taskForm.value = {
    title:     '',
    projectId: '',
    priority:  'media',
    dueDate:   '',
    assignees: currentUser.value?.email ? [currentUser.value.email] : [],
  }
  showTaskModal.value = true
}

function toggleTaskAssignee(email: string) {
  const idx = taskForm.value.assignees.indexOf(email)
  if (idx === -1) taskForm.value.assignees.push(email)
  else taskForm.value.assignees.splice(idx, 1)
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function submitTask() {
  if (!taskForm.value.title.trim() || taskSaving.value) return
  taskSaving.value = true
  try {
    const dueDate = taskForm.value.dueDate ? parseDateInput(taskForm.value.dueDate) : null
    await createStandaloneTask({
      title:     taskForm.value.title.trim(),
      projectId: taskForm.value.projectId || null,
      priority:  taskForm.value.priority,
      dueDate,
      assignees: taskForm.value.assignees,
    })
    showTaskModal.value = false
  } catch (e) {
    console.error('[CEPHEID] task creation error', e)
  } finally {
    taskSaving.value = false
  }
}

// ── Triggers dal FAB del layout ────────────────────────────────────────────
const newTaskTick = inject<Ref<number>>('cepheid-new-task-tick', null as any)
if (newTaskTick) {
  watch(newTaskTick, () => openTaskModal())
}

onMounted(() => {
  if (sessionStorage.getItem('cepheid-pending-new-task') === '1') {
    sessionStorage.removeItem('cepheid-pending-new-task')
    nextTick(() => openTaskModal())
  }
})
</script>

<template>
  <div class="av s-scope-cepheid">
    <header class="av-header">
      <div class="av-header-text">
        <h2 class="p-page-title">Azioni</h2>
        <p class="p-page-sub">
          {{ dueTodayCount === 0
            ? 'Nessuna in scadenza oggi'
            : (dueTodayCount === 1 ? '1 in scadenza oggi' : dueTodayCount + ' in scadenza oggi') }}
        </p>
      </div>
      <button class="header-cta" @click="openTaskModal">
        <MIcon name="add" :size="16" /> Nuova azione
      </button>
    </header>

    <div class="av-content">
      <!-- Filtro Le mie / Tutte -->
      <div class="filter-pills">
        <button :class="['filter-pill', { 'is-active': filter === 'mine' }]" @click="filter = 'mine'">Le mie</button>
        <button :class="['filter-pill', { 'is-active': filter === 'all' }]"  @click="filter = 'all'">Tutte</button>
      </div>

      <div v-if="tasksLoading" class="loading-rows">
        <div v-for="i in 4" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!visibleOpen.length" class="empty-state">
        <MIcon name="check_circle" filled :size="20" class="empty-state-icon" />
        {{ filter === 'mine' ? 'Nessuna azione assegnata.' : 'Nessuna azione aperta.' }}
      </div>

      <div v-for="t in visibleOpen" :key="t.id" class="task-row" :style="{ borderLeftColor: prioColor[t.priority] }">
        <div class="checkbox" @click="doComplete(t)">
          <MIcon v-if="pendingDone.has(t.id)" name="check" :size="14" class="check-icon" />
        </div>
        <div class="row-body">
          <div class="row-title">{{ t.title }}</div>
          <div v-if="t.projectId" class="row-meta">
            <span class="row-proj" :style="{ background: projectColor(t.projectId) + '20', color: projectColor(t.projectId) }">{{ projectName(t.projectId) }}</span>
          </div>
        </div>
        <div v-if="t.dueDate" class="row-due">
          <MIcon name="schedule" :size="12" />{{ formatDue(t.dueDate) }}
        </div>
      </div>

      <!-- Completate di recente -->
      <button
        v-if="doneTasks.length"
        class="collapse-toggle"
        :class="{ 'is-open': showDone }"
        @click="showDone = !showDone"
      >
        <span>Completate di recente</span>
        <span class="collapse-meta">
          <span class="collapse-count">{{ doneTasks.length }}</span>
          <MIcon :name="showDone ? 'expand_less' : 'expand_more'" :size="20" class="collapse-chevron" />
        </span>
      </button>

      <div v-if="showDone" class="done-list">
        <div v-for="t in doneTasks" :key="t.id" class="task-row task-row--done">
          <button class="undo-btn" @click="doUncomplete(t)">
            <MIcon name="undo" :size="14" />
          </button>
          <div class="row-title row-title--done">{{ t.title }}</div>
        </div>
      </div>
    </div>

    <!-- Modal Nuova azione -->
    <Teleport to="body">
      <div v-if="showTaskModal" class="modal-backdrop" @click.self="showTaskModal = false">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <span class="modal-title">Nuova azione</span>
            <button class="modal-close" @click="showTaskModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body">
            <label class="field-label">Titolo *</label>
            <input v-model="taskForm.title" class="field-input" autofocus />

            <label class="field-label" style="margin-top:12px">Progetto</label>
            <select v-model="taskForm.projectId" class="field-input">
              <option value="">— Nessun progetto —</option>
              <option v-for="p in activeProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>

            <label class="field-label" style="margin-top:12px">Assegna a</label>
            <div class="assignees-chips">
              <div
                v-for="m in members"
                :key="m.email"
                class="assignee-chip"
                :class="{ 'is-selected': taskForm.assignees.includes(m.email) }"
                :style="taskForm.assignees.includes(m.email) ? { background: avatarColor(m.email) + '20', borderColor: avatarColor(m.email) + '80', color: avatarColor(m.email) } : {}"
                @click="toggleTaskAssignee(m.email)"
              >
                <span class="chip-avatar" :style="{ background: avatarColor(m.email), color: '#fff' }">{{ avatarInitial(m.email) }}</span>
                {{ displayName(m.email, members) }}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label">Priorità</label>
                <div class="prio-picker">
                  <button
                    v-for="p in prioOptions"
                    :key="p.id"
                    class="prio-opt"
                    :class="{ 'is-sel': taskForm.priority === p.id }"
                    :style="taskForm.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                    type="button"
                    @click="taskForm.priority = p.id"
                  >
                    <span class="prio-dot" :style="{ background: p.color }" />
                    {{ p.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="field-label">Scadenza</label>
                <input v-model="taskForm.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" @click="showTaskModal = false">Annulla</button>
            <button
              class="btn-primary"
              :disabled="!taskForm.title.trim() || taskSaving"
              @click="submitTask"
            >{{ taskSaving ? 'Creazione…' : 'Crea azione' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.av {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  min-height: calc(100vh - 120px);
}

.av-header {
  padding: 18px 20px 14px;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.av-header-text { flex: 1; min-width: 0; }
.header-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 14px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}
.header-cta:hover { background: #B8870E; }
@media (max-width: 768px) { .header-cta { display: none; } }

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.p-page-sub { font-size: 12px; color: #9B9590; margin: 0; }

.av-content { padding: 16px 16px; }

.filter-pills {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.filter-pill {
  padding: 6px 14px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 1px solid transparent;
  background: var(--md-sys-color-surface-container);
  font-size: 12px;
  font-weight: 600;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.filter-pill.is-active { background: color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent); color: var(--md-sys-color-primary-hover); }

/* Loading */
.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 48px; border-radius: 10px; background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state { font-size: 14px; color: #9B9590; padding: 20px 0; }
.empty-state-icon { color: var(--md-sys-color-primary); margin-right: 6px; vertical-align: -4px; }

/* Task rows */
.task-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #E8E5DF;
  border-left: 6px solid transparent;
  margin-bottom: 6px;
  box-shadow: var(--md-sys-elevation-level-1);
}

.task-row--done { opacity: 0.5; border-left: 6px solid #E8E5DF; }

.checkbox {
  width: 18px; height: 18px;
  border-radius: 5px;
  border: 1.5px solid #C8C5C0;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: all 0.15s;
}

.checkbox:hover { border-color: var(--md-sys-color-primary); }
.check-icon { color: var(--md-sys-color-primary); }

.row-body { flex: 1; min-width: 0; }
.row-title { font-size: 14px; color: #1A1917; }
.row-title--done { text-decoration: line-through; color: #9B9590; flex: 1; }
.row-meta { margin-top: 3px; display: flex; gap: 6px; }
.row-proj { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small); }

.row-due { font-size: 11px; color: #9B9590; display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

.undo-btn {
  background: none; border: none; cursor: pointer;
  color: #9B9590; padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
  display: flex; align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}

.undo-btn:hover { color: var(--md-sys-color-primary-hover); }

/* Collapsible "Completate di recente" */
.collapse-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  margin-top: 12px;
  background: none;
  border: none;
  border-top: 1px solid #E8E5DF;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9B9590;
  transition: color 0.15s;
}

.collapse-toggle:hover { color: var(--md-sys-color-primary-hover); }

.collapse-meta { display: inline-flex; align-items: center; gap: 6px; }

.collapse-count {
  background: #F4F2EE;
  color: #6A6560;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--md-sys-shape-corner-full);
  letter-spacing: 0;
}

.collapse-chevron { color: inherit; }
.done-list { display: flex; flex-direction: column; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #9B9590;
  padding: 2px;
  border-radius: var(--md-sys-shape-corner-extra-small);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9B9590;
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: #F4F2EE;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: var(--md-sys-color-primary); }
.field-date { color-scheme: light; }

.assignees-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.assignee-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-full);
  font-size: 12px;
  font-weight: 500;
  color: #6A6560;
  cursor: pointer;
  background: #fff;
  transition: all 0.15s;
}

.chip-avatar {
  width: 22px; height: 22px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
  flex-shrink: 0;
}

.prio-picker { display: flex; gap: 4px; }
.prio-opt {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 8px;
  border: 1.5px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 12px;
  font-weight: 500;
  font-family: 'Outfit', sans-serif;
  cursor: pointer;
  background: #fff;
  color: #6A6560;
}

.prio-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid #E8E5DF;
}

.btn-ghost {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #6A6560;
  font-family: 'Outfit', sans-serif;
}

.btn-primary {
  flex: 2;
  padding: 12px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: #B8870E; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
