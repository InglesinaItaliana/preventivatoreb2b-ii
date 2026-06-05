<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAllTasks, createStandaloneTask } from '../../composables/sidera/useAllTasks'
import CepheidActionCard from '../../components/cepheid/CepheidActionCard.vue'
import { useProjects } from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps, toUids } from '../../composables/sidera/useTeamMembers'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)
import StarAvatar from '../../components/shared/StarAvatar.vue'

const { tasks, loading, completeTask } = useAllTasks()
const { activeProjects } = useProjects()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

function projectName(id: string) {
  return activeProjects.value.find(p => p.id === id)?.name ?? ''
}
function projectColor(id: string) {
  return activeProjects.value.find(p => p.id === id)?.color ?? ''
}

const pendingDone = ref<Set<string>>(new Set())
async function doComplete(t: { id: string; projectId: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.projectId, t.id)
}

// Bucket per scadenza
const buckets = computed(() => {
  const myEmail = currentUser.value?.email ?? ''
  const myUid   = currentUser.value?.uid ?? ''

  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(tomorrow); dayAfter.setDate(tomorrow.getDate() + 1)
  const weekEnd  = new Date(today); weekEnd.setDate(today.getDate() + 7)

  const overdue: typeof tasks.value = []
  const todayList: typeof tasks.value = []
  const tomorrowList: typeof tasks.value = []
  const weekList: typeof tasks.value = []

  for (const t of tasks.value) {
    if (t.type && t.type !== 'task') continue
    if (t.completedAt || pendingDone.value.has(t.id)) continue
    if (!t.dueDate) continue
    // Mostro solo task mie (assegnatario o creatore)
    if (!t.assignees.includes(myEmail) && !t.assignees.includes(myUid) && t.createdBy !== myUid) continue

    if (t.dueDate < today) overdue.push(t)
    else if (t.dueDate < tomorrow) todayList.push(t)
    else if (t.dueDate < dayAfter) tomorrowList.push(t)
    else if (t.dueDate < weekEnd) weekList.push(t)
  }

  overdue.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
  todayList.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
  tomorrowList.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
  weekList.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))

  return [
    { id: 'overdue',  label: 'In ritardo',     list: overdue,     dotColor: '#C8521A' },
    { id: 'today',    label: 'Oggi',           list: todayList,   dotColor: '#D4A020' },
    { id: 'tomorrow', label: 'Domani',         list: tomorrowList,dotColor: '#7A8FA6' },
    { id: 'week',     label: 'Questa settimana', list: weekList,  dotColor: '#B4B0AA' },
  ].filter(b => b.list.length > 0)
})

const totalCount = computed(() => buckets.value.reduce((sum, b) => sum + b.list.length, 0))

// ── Nuova azione modal (riusa stesso pattern di Actions) ───────────────────
const showTaskModal = ref(false)
const taskSaving = ref(false)
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
      assignees: toUids(taskForm.value.assignees, members.value),
    })
    showTaskModal.value = false
  } catch (e) {
    console.error('[CEPHEID/due] task creation error', e)
  } finally {
    taskSaving.value = false
  }
}

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
  <div class="dv s-scope-cepheid" ref="scrollEl">
    <MdPageHeader
      title="Scadenze"
      :subtitle="totalCount === 0
        ? 'Nessuna scadenza nei prossimi 7 giorni'
        : (totalCount === 1 ? '1 scadenza in vista' : totalCount + ' scadenze in vista')"
      sticky
      :hidden="headerHidden"
    >
      <template #cta>
        <button class="md-btn md-btn--filled md-btn--sm md-btn--square" @click="openTaskModal">
          <MIcon name="add" :size="16" /> Nuova azione
        </button>
      </template>
    </MdPageHeader>

    <div class="dv-content">
      <div v-if="loading" class="loading-rows">
        <div v-for="i in 4" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!buckets.length" class="empty-state">
        <MIcon name="event_available" filled :size="40" class="empty-icon" />
        Tutto sotto controllo.
      </div>

      <section v-for="b in buckets" :key="b.id" class="bucket">
        <div class="bucket-header">
          <span class="bucket-dot" :style="{ background: b.dotColor }" />
          <span class="bucket-label">{{ b.label }}</span>
          <span class="bucket-count">{{ b.list.length }}</span>
        </div>

        <CepheidActionCard
          v-for="t in b.list"
          :key="t.id"
          :task="t"
          :members="members"
          :current-user-email="currentUser?.email"
          :project-name="projectName(t.projectId)"
          :project-color="projectColor(t.projectId)"
          :pending="pendingDone.has(t.id)"
          :clickable="false"
          @toggle="doComplete(t)"
        />
      </section>
    </div>

    <!-- Modal Nuova azione -->
    <Teleport to="body">
      <div v-if="showTaskModal" class="modal-backdrop md-modal-backdrop" @click.self="showTaskModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">Nuova azione</span>
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
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showTaskModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
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
.dv {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  /* Pattern Cruscotto: scroll sul root (.s-main ha overflow:hidden in PWA mobile);
     --page-bg letto da MdPageHeader.is-sticky per match-are il bg pagina. */
  height: 100%;
  overflow: auto;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .dv { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .dv { --page-bg: #0E0C07; } }

.dv-content { padding: 16px; }

.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 48px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-outline-variant); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; }

.bucket { margin-bottom: 18px; display: flex; flex-direction: column; gap: 6px; }

.bucket-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.bucket-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.bucket-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
}

.bucket-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container);
  padding: 1px 7px;
  border-radius: var(--md-sys-shape-corner-full);
}

/* flat: niente bordo/ombra; priorità = pallino accanto al titolo (.row-prio-dot) */
.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  margin-bottom: 6px;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.task-row:hover {
  background: var(--md-sys-color-primary-state-hover);
}

.row-prio-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  margin-right: 8px; vertical-align: middle; flex-shrink: 0;
}

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
.row-meta { margin-top: 3px; display: flex; gap: 6px; }
.row-proj { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small); }

.row-due {
  font-size: 11px; color: var(--md-sys-color-on-surface-variant);
  display: flex; align-items: center; gap: 3px;
  flex-shrink: 0;
}
.row-due.is-overdue { color: var(--md-sys-color-error); font-weight: 600; }

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

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.modal-close { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small); }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }

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

.assignees-chips { display: flex; gap: 6px; flex-wrap: wrap; }

.assignee-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full);
  font-size: 12px; font-weight: 500;
  color: var(--md-sys-color-on-surface-variant); cursor: pointer;
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
  display: flex; gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.btn-ghost {
  flex: 1; padding: 12px;
  background: none; border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px; font-weight: 500;
  cursor: pointer; color: var(--md-sys-color-on-surface-variant);
  font-family: 'Outfit', sans-serif;
}

.btn-primary {
  flex: 2; padding: 12px;
  background: var(--md-sys-color-primary); border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px; font-weight: 600;
  cursor: pointer; color: var(--md-sys-color-on-primary);
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
