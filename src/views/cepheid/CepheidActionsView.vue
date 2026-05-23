<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import { useAllTasks, createStandaloneTask } from '../../composables/sidera/useAllTasks'
import { useProjects } from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'

const { tasks, loading: tasksLoading, completeTask, uncompleteTask, createTask, updateTask, deleteTask } = useAllTasks()
const { activeProjects } = useProjects()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

// ── Filtri (port da TasksView SIDERA 2026-05-20) ───────────────────────────
type Filter = 'mine' | 'all' | 'late' | 'done'
const filter = ref<Filter>('mine')
const filterTabs: { id: Filter; label: string; icon: string }[] = [
  { id: 'mine', label: 'Le mie',     icon: 'person' },
  { id: 'all',  label: 'Tutte',      icon: 'list' },
  { id: 'late', label: 'In ritardo', icon: 'warning' },
  { id: 'done', label: 'Completate', icon: 'check_circle' },
]


// ── Quick-add: scrivi e premi Invio per creare un'azione (assegnata a me) ───
const quickTitle = ref('')
const quickSaving = ref(false)
async function quickAdd() {
  const title = quickTitle.value.trim()
  if (!title || quickSaving.value) return
  quickSaving.value = true
  try {
    // task "da smistare" (triaged:false) senza assegnatario → entra in Smistamento;
    // resta visibile in "Le mie" perché createdBy sei tu.
    await createTask({
      title,
      projectId: null,
      priority: 'media',
      dueDate: null,
      assignees: [],
    })
    quickTitle.value = ''
  } catch (e) {
    console.error('[CEPHEID] quick-add error', e)
  } finally {
    quickSaving.value = false
  }
}

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

const realTasks = computed(() => tasks.value.filter(t => !t.type || t.type === 'task'))

const activeTasks = computed(() => realTasks.value.filter(t => !t.completedAt && !pendingDone.value.has(t.id)))

const visibleOpen = computed(() => {
  const myEmail = currentUser.value?.email ?? ''
  const myUid   = currentUser.value?.uid ?? ''
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const base = activeTasks.value
  if (filter.value === 'late') return base.filter(t => t.dueDate && t.dueDate < oggi)
  if (filter.value === 'all')  return base
  if (filter.value === 'mine') return base.filter(t => t.assignees.includes(myEmail) || t.createdBy === myUid)
  return []
})

const doneTasks = computed(() =>
  realTasks.value.filter(t =>
    (t.completedAt || pendingDone.value.has(t.id)) &&
    !pendingUndo.value.has(t.id)
  )
)

const visibleDone = computed(() => filter.value === 'done' ? doneTasks.value : doneTasks.value.slice(0, 10))

// ── Group-by-date relativo (port da TasksView SIDERA) ─────────────────────
type GroupKey = 'late' | 'oggi' | 'week' | 'later' | 'nodate'
function taskGroup(dueDate: Date | null): GroupKey {
  if (!dueDate) return 'nodate'
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const diff = Math.ceil((dueDate.getTime() - oggi.getTime()) / 86400000)
  if (diff < 0)  return 'late'
  if (diff === 0) return 'oggi'
  if (diff <= 7)  return 'week'
  return 'later'
}

const groups = computed<{ key: GroupKey; label: string; color: string }[]>(() => {
  if (filter.value === 'late') return [{ key: 'late', label: 'In ritardo', color: '#C8521A' }]
  if (filter.value === 'done') return [] // done usa rendering flat
  return [
    { key: 'late',   label: 'In ritardo',       color: '#C8521A' },
    { key: 'oggi',   label: 'Oggi',             color: 'var(--md-sys-color-primary)' },
    { key: 'week',   label: 'Questa settimana', color: 'var(--md-sys-color-on-surface-variant)' },
    { key: 'later',  label: 'Più avanti',       color: 'var(--md-sys-color-outline)' },
    { key: 'nodate', label: 'Senza scadenza',   color: 'var(--md-sys-color-outline)' },
  ]
})

function tasksInGroup(key: GroupKey) {
  return visibleOpen.value.filter(t => taskGroup(t.dueDate) === key)
}

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

function formatDue(d: Date | null): string {
  if (!d) return ''
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diff === 0)  return 'Oggi'
  if (diff === 1)  return 'Domani'
  if (diff === -1) return 'Ieri'
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

// Reward "nessuna azione aperta" — stesso pattern di CepheidInboxView ("Inbox pulita")
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const confetti = computed(() => Array.from({ length: 14 }, (_, k) => ({
  left: Math.round(6 + k * 88 / 14), color: ['#D4A020', '#C4941C', '#3AAF98', '#C46030', '#98C0D0', '#B06842'][k % 6], delay: ((k % 5) * 90) / 1000,
})))

// ── Modal create + edit (port da TasksView SIDERA 2026-05-20) ───────────────
type TaskLike = { id: string; projectId: string | null; title: string; priority: 'alta' | 'media' | 'bassa'; dueDate: Date | null; assignees: string[]; completedAt: Date | null }
const showTaskModal = ref(false)
const taskSaving    = ref(false)
const taskDeleting  = ref(false)
const editingTask   = ref<TaskLike | null>(null)
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
  editingTask.value = null
  taskForm.value = {
    title:     '',
    projectId: '',
    priority:  'media',
    dueDate:   '',
    assignees: currentUser.value?.email ? [currentUser.value.email] : [],
  }
  showTaskModal.value = true
}

function openEditTaskModal(t: TaskLike) {
  editingTask.value = t
  taskForm.value = {
    title:     t.title,
    projectId: t.projectId ?? '',
    priority:  t.priority,
    dueDate:   t.dueDate ? t.dueDate.toISOString().split('T')[0] : '',
    assignees: [...t.assignees],
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
    if (editingTask.value) {
      await updateTask(editingTask.value.projectId, editingTask.value.id, {
        title:     taskForm.value.title.trim(),
        priority:  taskForm.value.priority,
        dueDate,
        assignees: taskForm.value.assignees,
      })
    } else {
      await createStandaloneTask({
        title:     taskForm.value.title.trim(),
        projectId: taskForm.value.projectId || null,
        priority:  taskForm.value.priority,
        dueDate,
        assignees: taskForm.value.assignees,
      })
    }
    showTaskModal.value = false
  } catch (e) {
    console.error('[CEPHEID] task save error', e)
  } finally {
    taskSaving.value = false
  }
}

async function doDeleteTask() {
  if (!editingTask.value || taskDeleting.value) return
  if (!confirm('Eliminare questa azione?')) return
  taskDeleting.value = true
  try {
    await deleteTask(editingTask.value.projectId, editingTask.value.id, !!editingTask.value.completedAt)
    showTaskModal.value = false
  } catch (e) {
    console.error('[CEPHEID] task delete error', e)
  } finally {
    taskDeleting.value = false
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
    <MdPageHeader
      title="Azioni"
      :subtitle="dueTodayCount === 0
        ? 'Nessuna in scadenza oggi'
        : (dueTodayCount === 1 ? '1 in scadenza oggi' : dueTodayCount + ' in scadenza oggi')"
    >
      <template #tools>
        <CepheidViewSwitcher :model-value="filter" :tabs="filterTabs" @update:model-value="(v) => (filter = v as Filter)" />
      </template>
    </MdPageHeader>

    <div class="av-content">
      <!-- quick-add: scrivi e premi Invio per aggiungere un'azione (iperrapido) -->
      <div class="quick-add">
        <MIcon name="add" :size="18" class="quick-add-icon" />
        <input
          v-model="quickTitle"
          class="quick-add-input"
          type="text"
          placeholder="Scrivi un'azione e premi Invio…"
          @keyup.enter="quickAdd"
        />
      </div>

      <div v-if="tasksLoading" class="loading-rows">
        <div v-for="i in 4" :key="i" class="row-skel" />
      </div>

      <!-- Tab 'done': rendering flat completate -->
      <template v-else-if="filter === 'done'">
        <div v-if="!visibleDone.length" class="empty-state">
          <MIcon name="check_circle" filled :size="20" class="empty-state-icon" />
          Nessuna azione completata.
        </div>
        <div v-for="t in visibleDone" :key="t.id" class="task-row task-row--done">
          <button class="undo-btn" @click="doUncomplete(t)">
            <MIcon name="undo" :size="14" />
          </button>
          <div class="row-title row-title--done" @click="openEditTaskModal(t as TaskLike)">{{ t.title }}</div>
        </div>
      </template>

      <!-- Tab mine/all/late: rendering group-by relative-date -->
      <template v-else>
        <!-- reward "tutto fatto" (mine/all) — stesso linguaggio di Inbox pulita / progetto completato -->
        <div v-if="!visibleOpen.length && filter !== 'late'" class="av-fin">
          <template v-if="!reduceMotion">
            <span v-for="(c, i) in confetti" :key="i" class="av-pc" :style="{ left: c.left + '%', background: c.color, animationDelay: c.delay + 's' }" />
          </template>
          <div class="av-rk"><MIcon name="emoji_events" :size="28" /></div>
          <div class="av-ft">{{ filter === 'mine' ? 'Tutto fatto' : 'Nessuna azione aperta' }}</div>
          <div class="av-fs">{{ filter === 'mine' ? 'Nessuna azione assegnata da fare. 🎉' : 'Niente in sospeso qui. 🎉' }}</div>
        </div>
        <div v-else-if="!visibleOpen.length" class="empty-state">
          <MIcon name="check_circle" filled :size="20" class="empty-state-icon" />
          Nessuna azione in ritardo. 🎉
        </div>

        <template v-for="g in groups" :key="g.key">
          <div v-if="tasksInGroup(g.key).length" class="task-group">
            <div class="task-group-header">
              <span class="task-group-dot" :style="{ background: g.color }" />
              <span class="task-group-label">{{ g.label }}</span>
              <span class="task-group-count">{{ tasksInGroup(g.key).length }}</span>
            </div>
            <div
              v-for="t in tasksInGroup(g.key)"
              :key="t.id"
              class="task-row"
              :style="{ borderLeftColor: prioColor[t.priority] }"
              @click="openEditTaskModal(t as TaskLike)"
            >
              <div class="checkbox" @click.stop="doComplete(t)">
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
          </div>
        </template>

        <!-- Completate collassabili (solo in tab mine/all, non in late) -->
        <button
          v-if="filter !== 'late' && doneTasks.length"
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

        <div v-if="showDone && filter !== 'late'" class="done-list">
          <div v-for="t in doneTasks.slice(0, 10)" :key="t.id" class="task-row task-row--done">
            <span class="row-state-icon" title="Completata"><MIcon name="check_circle" filled :size="16" /></span>
            <div class="row-title row-title--done" @click="openEditTaskModal(t as TaskLike)">{{ t.title }}</div>
            <button class="undo-btn" title="Riapri" @click="doUncomplete(t)">
              <MIcon name="undo" :size="14" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal Nuova azione -->
    <Teleport to="body">
      <div v-if="showTaskModal" class="modal-backdrop md-modal-backdrop" @click.self="showTaskModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">{{ editingTask ? 'Modifica azione' : 'Nuova azione' }}</span>
            <button class="modal-close md-modal-close" @click="showTaskModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Titolo *</label>
            <input v-model="taskForm.title" class="field-input md-text-field-input" autofocus />

            <label class="field-label md-text-field-label" style="margin-top:12px">Progetto</label>
            <select v-model="taskForm.projectId" class="field-input md-text-field-input">
              <option value="">— Nessun progetto —</option>
              <option v-for="p in activeProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>

            <label class="field-label md-text-field-label" style="margin-top:12px">Assegna a</label>
            <div class="assignees-chips">
              <div
                v-for="m in members"
                :key="m.email"
                class="assignee-chip"
                :class="{ 'is-selected': taskForm.assignees.includes(m.email) }"
                :style="taskForm.assignees.includes(m.email) ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' } : {}"
                @click="toggleTaskAssignee(m.email)"
              >
                <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
                {{ displayName(m.email, members) }}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label md-text-field-label">Priorità</label>
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
                <label class="field-label md-text-field-label">Scadenza</label>
                <input v-model="taskForm.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>
          </div>
          <div class="modal-footer md-modal-footer">
            <button
              v-if="editingTask"
              class="btn-danger md-btn md-btn--danger md-btn--rounded"
              :disabled="taskDeleting"
              style="margin-right: auto"
              @click="doDeleteTask"
            >{{ taskDeleting ? 'Eliminazione…' : 'Elimina' }}</button>
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showTaskModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!taskForm.title.trim() || taskSaving"
              @click="submitTask"
            >{{ taskSaving ? 'Salvataggio…' : (editingTask ? 'Salva' : 'Crea azione') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.av {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  min-height: calc(100vh - 120px);
  /* sfondo cream coerente con la pagina Progetti */
  background: #EFE7D9;
}
.s-surface-dark .av { background: #0E0C07; }
@media (prefers-color-scheme: dark) { .av { background: #0E0C07; } }
.av :deep(.md-page-header) { flex-shrink: 0; }
/* header allineato al contenuto: padding L/R = gutter del contenuto (mobile 16px) */
:deep(.md-page-header) { padding: 18px 16px 14px; }

.av-content { padding: 16px 16px; }

/* Desktop wide: container centrato + padding generoso. La lista resta
   verticale (pattern Asana inbox). Per multi-colonna serve redesign,
   ProjectBoard SIDERA resta accessibile via /sidera/tasks come power-view. */
@media (min-width: 1024px) {
  /* contenuto max-width 900 centrato (rif. card Progetti); header allineato a esso:
     L/R = max(40px, metà-spazio-laterale + 40px) così testo/pillola seguono il box centrato */
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .av-content  { padding: 24px 40px; max-width: 900px; margin: 0 auto; width: 100%; }
}

/* quick-add: barra pill in cima al contenuto, Invio per creare l'azione */
.quick-add {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 14px;
  margin-bottom: 14px;
  background: #FFF8F0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
}
.s-surface-dark .quick-add { background: #16130B; }
@media (prefers-color-scheme: dark) { .quick-add { background: #16130B; } }
.quick-add-icon { color: var(--md-sys-color-primary); flex-shrink: 0; }
.quick-add-input {
  flex: 1; min-width: 0;
  border: 0; background: none; outline: none;
  font-family: 'Outfit', sans-serif; font-size: 14px;
  color: var(--md-sys-color-on-surface);
}
.quick-add-input::placeholder { color: var(--md-sys-color-on-surface-variant); }

/* Loading */
.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 48px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-outline-variant); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state { font-size: 14px; color: var(--md-sys-color-on-surface-variant); padding: 20px 0; }

/* reward "tutto fatto" — riuso del pattern Inbox pulita / progetto completato */
.av-fin { position: relative; overflow: hidden; margin-top: 8px; padding: 36px 18px; border-radius: 16px; background: #FFF8F0; text-align: center; box-shadow: var(--md-sys-elevation-level-1); border: 1px solid var(--md-sys-color-outline-variant); }
.s-surface-dark .av-fin { background: #16130B; }
@media (prefers-color-scheme: dark) { .av-fin { background: #16130B; } }
.av-rk { display: inline-flex; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 50%; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); margin-bottom: 10px; }
.av-ft { font-family: var(--md-sys-typescale-headline-small-font, serif); font-size: 24px; color: var(--md-sys-color-on-surface); }
.av-fs { font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px; }
.av-pc { position: absolute; top: 8px; width: 8px; height: 8px; border-radius: 2px; opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  @keyframes avconf { 0% { transform: translateY(0) rotate(0); opacity: 0 } 12% { opacity: 1 } 100% { transform: translateY(200px) rotate(420deg); opacity: 0 } }
  .av-pc { animation: avconf 1.7s cubic-bezier(.3,.1,.5,1) forwards; }
}

/* Task group-by relative-date (port da TasksView SIDERA 2026-05-20) */
.task-group { margin-bottom: 20px; }
.task-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.task-group-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--md-sys-shape-corner-full);
  flex-shrink: 0;
}
.task-group-label {
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size:   var(--md-sys-typescale-label-medium-size);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface);
  flex: 1;
}
.task-group-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
}
.empty-state-icon { color: var(--md-sys-color-primary); margin-right: 6px; vertical-align: -4px; }

/* Task rows */
/* stesso "materiale" delle card progetto (.pcard): surface #FFF8F0, raggio 16px,
   ombra level-1, bordo outline; hover sobrio (niente lift, come le card progetto).
   Il bordo sinistro colorato resta come affordance di priorità. */
.task-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: #FFF8F0;
  border-radius: 16px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-left: 6px solid transparent;
  margin-bottom: 6px;
  box-shadow: var(--md-sys-elevation-level-1);
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.task-row:hover {
  border-color: var(--md-sys-color-primary);
  background:   color-mix(in srgb, var(--md-sys-color-primary) 5%, #FFF8F0);
}
.s-surface-dark .task-row:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 10%, #16130B); }

.s-surface-dark .task-row { background: #16130B; }
@media (prefers-color-scheme: dark) { .task-row { background: #16130B; } }

.task-row--done { opacity: 0.5; border-left: 6px solid var(--md-sys-color-outline-variant); }

.checkbox {
  width: 18px; height: 18px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  border: 1.5px solid var(--md-sys-color-outline);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: all 0.15s;
}

.checkbox:hover { border-color: var(--md-sys-color-primary); }
.check-icon { color: var(--md-sys-color-primary); }

.row-body { flex: 1; min-width: 0; }
.row-title { font-size: 14px; color: var(--md-sys-color-on-surface); }
.row-title--done { text-decoration: line-through; color: var(--md-sys-color-on-surface-variant); flex: 1; }
/* icona di stato "completata" (coerente con pcard-state-mini dei progetti) */
.row-state-icon { display: inline-flex; align-items: center; color: var(--md-sys-color-primary); flex-shrink: 0; }
.row-meta { margin-top: 3px; display: flex; gap: 6px; }
.row-proj { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small); }

.row-due { font-size: 11px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

.undo-btn {
  background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-on-surface-variant); padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
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
  border-top: 1px solid var(--md-sys-color-outline-variant);
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
  transition: color 0.15s;
}

.collapse-toggle:hover { color: var(--md-sys-color-primary-hover); }

.collapse-meta { display: inline-flex; align-items: center; gap: 6px; }

.collapse-count {
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface-variant);
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
  z-index: 100;
}

.modal {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
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
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
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
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  background: var(--md-sys-color-surface);
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
  border: 1.5px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 12px;
  font-weight: 500;
  font-family: 'Outfit', sans-serif;
  cursor: pointer;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface-variant);
}

.prio-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.btn-ghost {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
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
  color: var(--md-sys-color-on-primary);
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
