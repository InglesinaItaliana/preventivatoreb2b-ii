<script setup lang="ts">
import { ref, computed } from 'vue'
import { ClockIcon, PlusIcon, CheckIcon, XMarkIcon, ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import { useAllTasks }    from '../../composables/sidera/useAllTasks'
import { useProjects }    from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, avatarColor, avatarInitial } from '../../composables/sidera/useTeamMembers'

const { tasks, loading: tasksLoading, completeTask, uncompleteTask, createTask } = useAllTasks()
const { projects }   = useProjects()
const { currentUser } = useCurrentUser()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')
const { members }    = useTeamMembers()

// ── Priority config ──────────────────────────────────────────────────────
const prioColor: Record<string, string> = { alta: '#C8521A', media: '#C8821A', bassa: '#7A8FA6' }
const prioLabel: Record<string, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

// ── Optimistic done/undone ────────────────────────────────────────────────
const pendingComplete   = ref<Set<string>>(new Set())
const pendingUncomplete = ref<Set<string>>(new Set())

async function doComplete(task: { id: string; projectId: string }) {
  if (pendingComplete.value.has(task.id)) return
  pendingComplete.value = new Set([...pendingComplete.value, task.id])
  await completeTask(task.projectId, task.id)
}

async function doUncomplete(task: { id: string; projectId: string }) {
  if (pendingUncomplete.value.has(task.id)) return
  pendingUncomplete.value = new Set([...pendingUncomplete.value, task.id])
  await uncompleteTask(task.projectId, task.id)
}

// ── Project map ──────────────────────────────────────────────────────────
const projectMap = computed(() =>
  Object.fromEntries(projects.value.map(p => [p.id, p]))
)

// ── Filter tabs ──────────────────────────────────────────────────────────
type FilterId = 'mie' | 'tutte' | 'ritardo' | 'completate'
const filter = ref<FilterId>('mie')

const filterTabs: { id: FilterId; label: string }[] = [
  { id: 'mie',       label: 'Le mie' },
  { id: 'tutte',     label: 'Tutte' },
  { id: 'ritardo',   label: '⚠ In ritardo' },
  { id: 'completate', label: '✓ Completate' },
]

// ── Derived task lists ────────────────────────────────────────────────────
const activeTasks = computed(() =>
  tasks.value.filter(t => !t.completedAt && !pendingComplete.value.has(t.id))
)

const completedTasks = computed(() =>
  tasks.value.filter(t => (t.completedAt || pendingComplete.value.has(t.id)) && !pendingUncomplete.value.has(t.id))
)

function taskGroup(dueDate: Date | null): 'late' | 'oggi' | 'week' | 'later' | 'nodate' {
  if (!dueDate) return 'nodate'
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const diff = Math.ceil((dueDate.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'late'
  if (diff === 0) return 'oggi'
  if (diff <= 7)  return 'week'
  return 'later'
}

const filtered = computed(() => {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const base = activeTasks.value
  if (filter.value === 'mie')     return base.filter(t => t.assignee === currentUser.value?.email || t.createdBy === currentUser.value?.uid)
  if (filter.value === 'ritardo') return base.filter(t => t.dueDate && t.dueDate < oggi)
  return base
})

const groups = computed(() => {
  if (filter.value === 'ritardo') return [{ key: 'late',   label: 'In ritardo',       color: '#C8521A' }]
  return [
    { key: 'late',   label: 'In ritardo',       color: '#C8521A' },
    { key: 'oggi',   label: 'Oggi',             color: '#2F6B4A' },
    { key: 'week',   label: 'Questa settimana', color: '#6A6560' },
    { key: 'later',  label: 'Più avanti',       color: '#B4B0AA' },
    { key: 'nodate', label: 'Senza scadenza',   color: '#B4B0AA' },
  ]
})

function tasksInGroup(key: string) {
  return filtered.value.filter(t => taskGroup(t.dueDate) === key)
}

// ── Stats ─────────────────────────────────────────────────────────────────
const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
const totalRemaining = computed(() => activeTasks.value.length)
const totalLate      = computed(() => activeTasks.value.filter(t => t.dueDate && t.dueDate < oggi).length)

// ── Formatting ────────────────────────────────────────────────────────────
function formatDue(d: Date | null): string {
  if (!d) return ''
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0)  return 'Oggi'
  if (diff === 1)  return 'Domani'
  if (diff === -1) return 'Ieri'
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

function isLate(d: Date | null): boolean {
  if (!d) return false
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return d < now
}

// ── Modal "Nuova azione" ────────────────────────────────────────────────────
const showModal = ref(false)
const saving    = ref(false)
const form      = ref({
  title:     '',
  projectId: '',
  priority:  'media' as 'alta' | 'media' | 'bassa',
  dueDate:   '',
  assignee:  '' as string,
})

function openModal() {
  form.value = {
    title:     '',
    projectId: projects.value[0]?.id ?? '',
    priority:  'media',
    dueDate:   '',
    assignee:  '',
  }
  showModal.value = true
}

function closeModal() { showModal.value = false }

async function submit() {
  if (!form.value.title.trim() || !form.value.projectId || saving.value) return
  saving.value = true
  try {
    const dueDate = form.value.dueDate ? parseDateInput(form.value.dueDate) : null
    await createTask({
      title:     form.value.title.trim(),
      projectId: form.value.projectId,
      priority:  form.value.priority,
      dueDate,
      assignee:  form.value.assignee || null,
    })
    closeModal()
  } finally {
    saving.value = false
  }
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
</script>

<template>
  <div class="tv s-fade-in">
    <!-- Header -->
    <div class="tv-header">
      <div>
        <h1 class="tv-title">Azioni</h1>
        <p class="tv-subtitle">
          <template v-if="tasksLoading">Caricamento…</template>
          <template v-else>{{ totalRemaining }} da completare · {{ totalLate }} in ritardo</template>
        </p>
      </div>
      <button v-if="isAdmin" class="s-btn" @click="openModal">
        <PlusIcon class="btn-icon" />Nuova azione
      </button>
    </div>

    <!-- Filter tabs -->
    <div class="tv-filters">
      <button
        v-for="f in filterTabs"
        :key="f.id"
        class="filter-tab"
        :class="{ 'is-active': filter === f.id }"
        @click="filter = f.id"
      >{{ f.label }}</button>
    </div>

    <!-- Loading -->
    <div v-if="tasksLoading" class="loading-rows">
      <div v-for="i in 5" :key="i" class="row-skeleton" />
    </div>

    <!-- ── COMPLETATE TAB ─────────────────────────────────────── -->
    <template v-else-if="filter === 'completate'">
      <div v-if="!completedTasks.length" class="empty-state">
        <div class="empty-icon">✓</div>
        <p>Nessuna task completata.</p>
      </div>

      <div v-for="t in completedTasks" :key="t.id" class="task-row task-row--done">
        <button class="undo-btn" title="Riapri task" @click="doUncomplete(t)">
          <ArrowUturnLeftIcon style="width:13px;height:13px" />
        </button>
        <div class="row-title row-title--done">{{ t.title }}</div>
        <span
          v-if="projectMap[t.projectId]"
          class="badge"
          :style="{ color: projectMap[t.projectId].color, background: projectMap[t.projectId].color + '12' }"
        >{{ projectMap[t.projectId].name }}</span>
        <div
          v-if="t.assignee"
          class="assignee-avatar"
          :title="t.assignee"
          :style="{ background: avatarColor(t.assignee) + '20', border: '1.5px solid ' + avatarColor(t.assignee) + '60', color: avatarColor(t.assignee) }"
        >{{ avatarInitial(t.assignee) }}</div>
      </div>
    </template>

    <!-- ── ACTIVE TABS ────────────────────────────────────────── -->
    <template v-else>
      <div v-if="!filtered.length" class="empty-state">
        <div class="empty-icon">✓</div>
        <p>Nessuna azione in questo filtro.</p>
      </div>

      <div v-for="g in groups" :key="g.key" class="group-block">
        <template v-if="tasksInGroup(g.key).length">
          <div class="group-header">
            <div class="group-dot" :style="{ background: g.color }" />
            <span class="group-label" :style="{ color: g.color }">{{ g.label }}</span>
            <div class="group-line" />
            <span class="group-count">{{ tasksInGroup(g.key).length }}</span>
          </div>

          <div
            v-for="t in tasksInGroup(g.key)"
            :key="t.id"
            class="task-row"
            :style="{ borderLeftColor: prioColor[t.priority] }"
          >
            <!-- Checkbox -->
            <div class="checkbox" @click="doComplete(t)">
              <CheckIcon v-if="pendingComplete.has(t.id)" class="check-icon" />
            </div>

            <!-- Title -->
            <div class="row-title">{{ t.title }}</div>

            <!-- Project badge -->
            <span
              v-if="projectMap[t.projectId]"
              class="badge"
              :style="{ color: projectMap[t.projectId].color, background: projectMap[t.projectId].color + '12' }"
            >{{ projectMap[t.projectId].name }}</span>

            <!-- Priority pill -->
            <span
              class="prio-pill"
              :style="{ color: prioColor[t.priority], background: prioColor[t.priority] + '14' }"
            >{{ prioLabel[t.priority] }}</span>

            <!-- Assignee avatar -->
            <div
              v-if="t.assignee"
              class="assignee-avatar"
              :title="t.assignee"
              :style="{ background: avatarColor(t.assignee) + '20', border: '1.5px solid ' + avatarColor(t.assignee) + '60', color: avatarColor(t.assignee) }"
            >{{ avatarInitial(t.assignee) }}</div>
            <div v-else class="assignee-avatar assignee-avatar--empty" title="Non assegnata">–</div>

            <!-- Due date -->
            <div class="row-due" :style="{ color: isLate(t.dueDate) ? '#C8521A' : 'var(--s-text-dim)' }">
              <ClockIcon v-if="t.dueDate" class="clock-icon" />
              {{ formatDue(t.dueDate) }}
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- ── MODAL "Nuova azione" ─────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Nuova azione</span>
            <button class="modal-close" @click="closeModal"><XMarkIcon style="width:16px;height:16px" /></button>
          </div>

          <div class="modal-body">
            <label class="field-label">Titolo *</label>
            <input
              v-model="form.title"
              class="field-input"
              placeholder="Descrivi l'azione"
              autofocus
              @keydown.enter="submit"
            />

            <label class="field-label" style="margin-top:16px">Progetto *</label>
            <select v-model="form.projectId" class="field-input field-select">
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>

            <label class="field-label" style="margin-top:16px">Assegna a</label>
            <select v-model="form.assignee" class="field-input field-select">
              <option value="">— Nessuno —</option>
              <option v-for="m in members" :key="m.email" :value="m.email">{{ m.email }}</option>
            </select>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
              <div>
                <label class="field-label">Priorità</label>
                <select v-model="form.priority" class="field-input field-select">
                  <option value="alta">↑ Alta</option>
                  <option value="media">= Media</option>
                  <option value="bassa">↓ Bassa</option>
                </select>
              </div>
              <div>
                <label class="field-label">Scadenza</label>
                <input v-model="form.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click="closeModal">Annulla</button>
            <button
              class="s-btn"
              :disabled="!form.title.trim() || !form.projectId || saving"
              @click="submit"
            >{{ saving ? 'Salvataggio…' : 'Crea azione' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tv {
  height: 100%;
  overflow: auto;
  padding: 40px 52px;
  background: var(--s-bg);
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

.tv-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32px;
}

.tv-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 400;
  font-style: italic;
}

.tv-subtitle { font-size: 12px; color: var(--s-text-dim); margin-top: 4px; }

.s-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--s-green);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
  letter-spacing: 0.01em;
}

.s-btn:hover:not(:disabled) { background: var(--s-green-light); }
.s-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-icon { width: 14px; height: 14px; }

/* Filter tabs */
.tv-filters {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  background: var(--s-surface-up);
  padding: 4px;
  border-radius: 9px;
  width: fit-content;
  border: 1px solid var(--s-border);
}

.filter-tab {
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--s-text-dim);
  font-family: 'Outfit', sans-serif;
  transition: all 0.15s;
  letter-spacing: 0.02em;
}

.filter-tab:hover { color: var(--s-text-mid); background: var(--s-border); }
.filter-tab.is-active { background: var(--s-surface); color: var(--s-text); box-shadow: 0 1px 3px rgba(0,0,0,.07); }

/* Loading */
.loading-rows { display: flex; flex-direction: column; gap: 6px; }

.row-skeleton {
  height: 46px;
  background: var(--s-surface);
  border-radius: 9px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

@keyframes s-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-top: 60px;
  color: var(--s-text-dim);
  font-size: 13px;
}

.empty-icon { font-size: 32px; opacity: 0.3; }

/* Groups */
.group-block { margin-bottom: 28px; }

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.group-dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.group-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; flex-shrink: 0; }
.group-line  { flex: 1; height: 1px; background: var(--s-border); }
.group-count { font-size: 11px; color: var(--s-text-dim); }

/* Task rows */
.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: var(--s-surface);
  border-radius: 9px;
  border: 1px solid var(--s-border);
  border-left: 3px solid transparent;
  margin-bottom: 6px;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,.04);
}

.task-row:hover { border-color: var(--s-border-mid); box-shadow: var(--s-shadow-hover); }

/* Completed rows */
.task-row--done {
  opacity: 0.55;
  cursor: default;
  border-left: 3px solid var(--s-border);
}

.task-row--done:hover { opacity: 0.75; }

.checkbox {
  width: 17px;
  height: 17px;
  border-radius: 5px;
  border: 1.5px solid var(--s-border-mid);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.checkbox:hover { border-color: var(--s-green); }
.check-icon { width: 10px; height: 10px; color: var(--s-green); stroke-width: 3; }

.row-title { flex: 1; font-size: 13.5px; color: var(--s-text); min-width: 0; }
.row-title--done { text-decoration: line-through; color: var(--s-text-dim); }

.badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.01em;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Priority pill */
.prio-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  letter-spacing: 0.03em;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Assignee avatar */
.assignee-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.assignee-avatar--empty {
  background: var(--s-surface-up) !important;
  border: 1.5px dashed var(--s-border-mid) !important;
  color: var(--s-text-dim) !important;
  font-size: 12px;
  font-weight: 400;
}

.row-due {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  min-width: 54px;
  justify-content: flex-end;
}

.clock-icon { width: 10px; height: 10px; }

/* Undo button (completate tab) */
.undo-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.15s;
}

.undo-btn:hover { color: var(--s-green); }

/* ── Modal ──────────────────────────────────────────────────────────────── */
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
  width: 420px;
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
  color: var(--s-text-dim); padding: 2px; border-radius: 4px;
  transition: color 0.15s;
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

.field-input:focus { border-color: var(--s-green); }
.field-input::placeholder { color: var(--s-text-dim); }
.field-select { cursor: pointer; }
.field-date { cursor: pointer; color-scheme: light; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
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
</style>
