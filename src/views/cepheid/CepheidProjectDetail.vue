<script setup lang="ts">
import { ref, computed, inject, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import GoalChip from '../../components/cepheid/GoalChip.vue'
import { useProjects, DEFAULT_STATES } from '../../composables/sidera/useProjects'
import { useProjectTasks } from '../../composables/sidera/useProjectTasks'
import { useObiettivi } from '../../composables/sidera/useObiettivi'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarInitial } from '../../composables/sidera/useTeamMembers'
import { pulsarAvatarColor as avatarColor } from '../../composables/pulsar/usePulsarAvatar'

const route   = useRoute()
const router  = useRouter()
const projectId = route.params.id as string

const { projects } = useProjects()
const { tasks, loading, createTask, completeTask, uncompleteTask, updateTaskStatus, updateTask, deleteTask } = useProjectTasks(projectId)
const { obiettiviAttivi } = useObiettivi()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

const project = computed(() => projects.value.find(p => p.id === projectId))
const states = computed(() => project.value?.states ?? DEFAULT_STATES)

const obiettivoCollegato = computed(() => {
  if (!project.value?.obiettivoId) return null
  return obiettiviAttivi.value.find(o => o.id === project.value!.obiettivoId) ?? null
})

// ── Tabs ──────────────────────────────────────────────────────────────────
type Tab = 'kanban' | 'list' | 'milestone' | 'deliverable' | 'cal' | 'notes'
const activeTab = ref<Tab>('kanban')

// ── List view: tutti i task flat sortable per state/priority ──────────────
const sortedStates = computed(() => states.value)  // alias semantico per list view

// ── Filtri per tipo ───────────────────────────────────────────────────────
const taskItems = computed(() => tasks.value.filter(t => !t.type || t.type === 'task'))
const milestoneItems = computed(() => tasks.value.filter(t => t.type === 'milestone'))
const deliverableItems = computed(() => tasks.value.filter(t => t.type === 'deliverable'))

// ── KANBAN ────────────────────────────────────────────────────────────────
const grouped = computed(() => {
  const map: Record<string, typeof tasks.value> = {}
  for (const s of states.value) map[s.id] = []
  for (const t of taskItems.value) {
    if (t.completedAt) continue
    if (!map[t.status]) map[t.status] = []
    map[t.status].push(t)
  }
  return map
})

const completedTasks = computed(() => taskItems.value.filter(t => t.completedAt).slice(0, 20))

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

function formatDue(d: Date | null) {
  if (!d) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

function pct(p: { taskCount: number; doneCount: number }) {
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

const pendingDone = ref<Set<string>>(new Set())

async function doComplete(t: { id: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.id)
}

async function doUncomplete(t: { id: string }) {
  await uncompleteTask(t.id)
}

const showDone = ref(false)

const descExpanded = ref(false)
const descIsLong   = computed(() => (project.value?.description?.length ?? 0) > 120)

const movingTaskId = ref('')
function openStatusMenu(id: string) {
  movingTaskId.value = movingTaskId.value === id ? '' : id
}
async function changeStatus(taskId: string, newStatus: string) {
  movingTaskId.value = ''
  await updateTaskStatus(taskId, newStatus)
}

// ── MILESTONE ─────────────────────────────────────────────────────────────
const milestoneSorted = computed(() => {
  return [...milestoneItems.value].sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    return da - db
  })
})

async function toggleMilestone(m: { id: string; completedAt: Date | null }) {
  if (m.completedAt) await uncompleteTask(m.id)
  else await completeTask(m.id)
}

// ── DELIVERABLE ───────────────────────────────────────────────────────────
const deliverableSorted = computed(() => {
  return [...deliverableItems.value].sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    return da - db
  })
})

const expandedDeliverableId = ref('')
function toggleDeliverableExpand(id: string) {
  expandedDeliverableId.value = expandedDeliverableId.value === id ? '' : id
}

function tasksOfDeliverable(deliverableTaskIds: string[]) {
  return taskItems.value.filter(t => deliverableTaskIds.includes(t.id))
}

function deliverablePct(d: { deliverableTaskIds: string[] }): number {
  const sub = tasksOfDeliverable(d.deliverableTaskIds)
  if (!sub.length) return 0
  const done = sub.filter(t => t.completedAt).length
  return Math.round((done / sub.length) * 100)
}

// ── CALENDARIO ────────────────────────────────────────────────────────────
// Raggruppa task per intervallo di scadenza relativa: ritardo, oggi, settimana, dopo.
interface CalGroup { id: string; label: string; color: string; tasks: typeof taskItems.value }
const calendarGroups = computed<CalGroup[]>(() => {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const withDue = taskItems.value.filter(t => !!t.dueDate && !t.completedAt)
  const sorted = [...withDue].sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))

  const late:    typeof sorted = []
  const today:   typeof sorted = []
  const week:    typeof sorted = []
  const later:   typeof sorted = []
  for (const t of sorted) {
    const d = t.dueDate!
    if (d < now)             late.push(t)
    else if (d < tomorrow)   today.push(t)
    else if (d < weekEnd)    week.push(t)
    else                     later.push(t)
  }
  const out: CalGroup[] = []
  if (late.length)  out.push({ id: 'late',  label: 'In ritardo',         color: '#C8521A', tasks: late })
  if (today.length) out.push({ id: 'today', label: 'Oggi',               color: 'var(--md-sys-color-primary)', tasks: today })
  if (week.length)  out.push({ id: 'week',  label: 'Questa settimana',   color: '#7A8FA6', tasks: week })
  if (later.length) out.push({ id: 'later', label: 'Più avanti',         color: 'var(--md-sys-color-on-surface-variant)', tasks: later })
  return out
})

// ── NOTE (text editor con autosave su projects/{id}.notes) ────────────────
import { onBeforeUnmount } from 'vue'
import { updateDoc, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'

const notesDraft = ref('')
const notesSaving = ref(false)
const notesSaved = ref(false)
let notesLoaded = false
let notesTimer: ReturnType<typeof setTimeout> | null = null

;(async () => {
  try {
    const snap = await getDoc(doc(db, 'projects', projectId))
    if (snap.exists()) notesDraft.value = snap.data().notes ?? ''
  } catch (_) { /* ignore */ }
  finally { notesLoaded = true }
})()

function onNotesInput() {
  if (!notesLoaded) return
  notesSaved.value = false
  if (notesTimer) clearTimeout(notesTimer)
  notesTimer = setTimeout(async () => {
    notesSaving.value = true
    try {
      await updateDoc(doc(db, 'projects', projectId), { notes: notesDraft.value })
      notesSaved.value = true
      setTimeout(() => { notesSaved.value = false }, 2000)
    } catch (e) {
      console.error('[CEPHEID notes] save error', e)
    } finally {
      notesSaving.value = false
    }
  }, 1000)
}

onBeforeUnmount(() => { if (notesTimer) clearTimeout(notesTimer) })

// ── Modale unificata per nuova creazione (task / milestone / deliverable) ─
type NewKind = 'task' | 'milestone' | 'deliverable'
const showModal = ref(false)
const modalKind = ref<NewKind>('task')
const saving    = ref(false)
const form = ref({
  title:     '',
  priority:  'media' as 'alta' | 'media' | 'bassa',
  dueDate:   '',
  assignees: [] as string[],
  status:    'todo',
  deliverableTaskIds: [] as string[],
})

function openModal(kind: NewKind) {
  modalKind.value = kind
  form.value = {
    title:              '',
    priority:           'media',
    dueDate:            '',
    assignees:          kind === 'milestone' ? [] : (currentUser.value?.email ? [currentUser.value.email] : []),
    status:             'todo',
    deliverableTaskIds: [],
  }
  showModal.value = true
}

function toggleAssignee(email: string) {
  const idx = form.value.assignees.indexOf(email)
  if (idx === -1) form.value.assignees.push(email)
  else form.value.assignees.splice(idx, 1)
}

function toggleDeliverableSubTask(taskId: string) {
  const idx = form.value.deliverableTaskIds.indexOf(taskId)
  if (idx === -1) form.value.deliverableTaskIds.push(taskId)
  else form.value.deliverableTaskIds.splice(idx, 1)
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function submitForm() {
  if (!form.value.title.trim() || saving.value) return
  saving.value = true
  try {
    const dueDate = form.value.dueDate ? parseDateInput(form.value.dueDate) : null
    await createTask({
      title:              form.value.title.trim(),
      status:             form.value.status,
      priority:           form.value.priority,
      dueDate,
      assignees:          form.value.assignees,
      type:               modalKind.value,
      deliverableTaskIds: modalKind.value === 'deliverable' ? form.value.deliverableTaskIds : [],
    })
    showModal.value = false
  } catch (e) {
    console.error('[CEPHEID] item creation error', e)
  } finally {
    saving.value = false
  }
}

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

const modalTitle = computed(() => {
  if (modalKind.value === 'milestone') return 'Nuova milestone'
  if (modalKind.value === 'deliverable') return 'Nuovo deliverable'
  return 'Nuova azione'
})
const ctaLabel = computed(() => {
  if (activeTab.value === 'milestone')   return 'Nuova milestone'
  if (activeTab.value === 'deliverable') return 'Nuovo deliverable'
  return 'Nuova azione'
})
function openCurrentTabModal() {
  openModal(activeTab.value === 'kanban' ? 'task' : activeTab.value)
}
const modalCta = computed(() => {
  if (modalKind.value === 'milestone') return saving.value ? 'Creazione…' : 'Crea milestone'
  if (modalKind.value === 'deliverable') return saving.value ? 'Creazione…' : 'Crea deliverable'
  return saving.value ? 'Creazione…' : 'Crea azione'
})

// ── FAB del layout → apre il modal del tab attivo ─────────────────────────
const newTaskTick = inject<Ref<number>>('cepheid-new-task-tick', null as any)
if (newTaskTick) {
  watch(newTaskTick, () => openModal(activeTab.value === 'kanban' ? 'task' : activeTab.value))
}

// ── Delete con conferma ───────────────────────────────────────────────────
async function deleteItem(t: { id: string; completedAt: Date | null; title: string }) {
  if (!confirm(`Eliminare "${t.title}"?`)) return
  await deleteTask(t.id, !!t.completedAt)
}
</script>

<template>
  <div class="pd s-scope-cepheid">
    <header class="pd-header" v-if="project">
      <div class="pd-stripe" :style="{ background: project.color }" />
      <div class="pd-titles">
        <div class="pd-top-row">
          <h2 class="p-page-title">{{ project.name }}</h2>
          <GoalChip
            v-if="obiettivoCollegato"
            :titolo="obiettivoCollegato.titolo"
            :colore="obiettivoCollegato.colore"
            size="sm"
            clickable
            @click="router.push('/cepheid/goal/' + obiettivoCollegato.id)"
          />
        </div>
        <p class="p-page-sub">{{ project.doneCount }}/{{ project.taskCount }} azioni · {{ pct(project) }}%</p>
        <div v-if="project.description" class="pd-description">
          <p class="pd-description-text" :class="{ 'is-collapsed': !descExpanded && descIsLong }">
            {{ project.description }}
          </p>
          <button v-if="descIsLong" class="pd-description-toggle" @click="descExpanded = !descExpanded">
            {{ descExpanded ? 'mostra meno' : 'leggi tutto' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Tab bar -->
    <div class="pd-tabs">
      <div class="pd-tabs-list">
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'kanban' }]"
          @click="activeTab = 'kanban'"
        >
          <MIcon name="view_kanban" :size="14" /> Kanban
          <span v-if="taskItems.length" class="pd-tab-count">{{ taskItems.length }}</span>
        </button>
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'list' }]"
          @click="activeTab = 'list'"
        >
          <MIcon name="list" :size="14" /> Lista
          <span v-if="taskItems.length" class="pd-tab-count">{{ taskItems.length }}</span>
        </button>
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'milestone' }]"
          @click="activeTab = 'milestone'"
        >
          <MIcon name="flag" :size="14" /> Milestone
          <span v-if="milestoneItems.length" class="pd-tab-count">{{ milestoneItems.length }}</span>
        </button>
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'deliverable' }]"
          @click="activeTab = 'deliverable'"
        >
          <MIcon name="inventory_2" :size="14" /> Deliverable
          <span v-if="deliverableItems.length" class="pd-tab-count">{{ deliverableItems.length }}</span>
        </button>
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'cal' }]"
          @click="activeTab = 'cal'"
        >
          <MIcon name="calendar_month" :size="14" /> Calendario
        </button>
        <button
          :class="['pd-tab', { 'is-active': activeTab === 'notes' }]"
          @click="activeTab = 'notes'"
        >
          <MIcon name="description" :size="14" /> Note
        </button>
      </div>
      <button class="header-cta" @click="openCurrentTabModal">
        <MIcon name="add" :size="16" /> {{ ctaLabel }}
      </button>
    </div>

    <div class="pd-content">
      <div v-if="loading" class="loading-rows">
        <div v-for="i in 3" :key="i" class="row-skel" />
      </div>

      <!-- KANBAN ─────────────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'kanban'">
        <section v-for="s in states" :key="s.id" class="state-section">
          <div class="state-header">
            <span class="state-dot" :style="{ background: s.color }" />
            <span class="state-label">{{ s.label }}</span>
            <span class="state-count">{{ grouped[s.id]?.length ?? 0 }}</span>
          </div>

          <div v-if="!grouped[s.id]?.length" class="state-empty">—</div>

          <div
            v-for="t in grouped[s.id]"
            :key="t.id"
            class="task-row"
            :style="{ borderLeftColor: prioColor[t.priority] }"
          >
            <div class="checkbox" @click="doComplete(t)">
              <MIcon v-if="pendingDone.has(t.id)" name="check" :size="14" class="check-icon" />
            </div>
            <div class="row-title">{{ t.title }}</div>
            <button class="state-pill" :style="{ background: s.color + '20', color: s.color }" @click.stop="openStatusMenu(t.id)">
              {{ s.label }}
              <MIcon name="expand_more" :size="14" />
            </button>
            <div v-if="t.dueDate" class="row-due">
              <MIcon name="schedule" :size="12" />{{ formatDue(t.dueDate) }}
            </div>

            <div v-if="movingTaskId === t.id" class="status-menu" @click.stop>
              <button
                v-for="opt in states"
                :key="opt.id"
                class="status-menu-item"
                :class="{ 'is-current': opt.id === t.status }"
                @click="changeStatus(t.id, opt.id)"
              >
                <span class="state-dot" :style="{ background: opt.color }" />
                {{ opt.label }}
              </button>
            </div>
          </div>
        </section>

        <button
          v-if="completedTasks.length"
          class="collapse-toggle"
          :class="{ 'is-open': showDone }"
          @click="showDone = !showDone"
        >
          <span>Completate</span>
          <span class="collapse-meta">
            <span class="collapse-count">{{ completedTasks.length }}</span>
            <MIcon :name="showDone ? 'expand_less' : 'expand_more'" :size="20" />
          </span>
        </button>

        <div v-if="showDone" class="done-list">
          <div v-for="t in completedTasks" :key="t.id" class="task-row task-row--done">
            <button class="undo-btn" @click="doUncomplete(t)">
              <MIcon name="undo" :size="14" />
            </button>
            <div class="row-title row-title--done">{{ t.title }}</div>
          </div>
        </div>
      </template>

      <!-- MILESTONE ──────────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'milestone'">
        <div v-if="!milestoneSorted.length" class="empty-tab">
          <MIcon name="flag" filled :size="32" class="empty-tab-icon" />
          <div>Nessuna milestone.</div>
          <div class="empty-tab-hint">Una milestone è un checkpoint datato senza sotto-task.<br/>Es. "Prototipo approvato dal cliente — 15 marzo".</div>
        </div>

        <div v-else class="milestone-timeline">
          <div
            v-for="m in milestoneSorted"
            :key="m.id"
            class="milestone-item"
            :class="{ 'is-done': m.completedAt }"
          >
            <div class="milestone-line" />
            <button
              class="milestone-circle"
              :class="{ 'is-done': m.completedAt }"
              @click="toggleMilestone(m)"
              :title="m.completedAt ? 'Riapri' : 'Segna come raggiunta'"
            >
              <MIcon v-if="m.completedAt" name="check" :size="14" />
            </button>
            <div class="milestone-body">
              <div class="milestone-title" :class="{ 'is-done': m.completedAt }">{{ m.title }}</div>
              <div v-if="m.dueDate" class="milestone-date">{{ formatDue(m.dueDate) }}</div>
              <div v-else class="milestone-date milestone-date--missing">data non impostata</div>
            </div>
            <button class="row-del-btn" @click="deleteItem(m)" title="Elimina">
              <MIcon name="close" :size="14" />
            </button>
          </div>
        </div>
      </template>

      <!-- DELIVERABLE ────────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'deliverable'">
        <div v-if="!deliverableSorted.length" class="empty-tab">
          <MIcon name="inventory_2" filled :size="32" class="empty-tab-icon" />
          <div>Nessun deliverable.</div>
          <div class="empty-tab-hint">Un deliverable è l'output tangibile del progetto.<br/>Es. un documento, un software, una campagna.</div>
        </div>

        <div v-else class="deliverable-list">
          <div
            v-for="d in deliverableSorted"
            :key="d.id"
            class="deliverable-card"
            :class="{ 'is-done': d.completedAt }"
          >
            <div class="deliverable-stripe" :style="{ background: prioColor[d.priority] }" />
            <div class="deliverable-body">
              <div class="deliverable-top">
                <div class="checkbox" @click="d.completedAt ? doUncomplete(d) : doComplete(d)">
                  <MIcon v-if="d.completedAt" name="check" :size="14" class="check-icon" />
                </div>
                <div class="deliverable-title" :class="{ 'is-done': d.completedAt }">{{ d.title }}</div>
                <button class="row-del-btn" @click="deleteItem(d)" title="Elimina">
                  <MIcon name="close" :size="14" />
                </button>
              </div>

              <div class="deliverable-meta">
                <span v-if="d.dueDate" class="d-meta-chip">
                  <MIcon name="schedule" :size="11" /> {{ formatDue(d.dueDate) }}
                </span>
                <span v-if="d.assignees.length" class="d-meta-chip">
                  <MIcon name="person" :size="11" /> {{ displayName(d.assignees[0], members) }}
                </span>
                <span class="d-meta-chip" :style="{ background: prioColor[d.priority] + '15', color: prioColor[d.priority] }">
                  {{ d.priority }}
                </span>
              </div>

              <div v-if="d.deliverableTaskIds.length" class="deliverable-sub">
                <button
                  class="deliverable-expand"
                  @click="toggleDeliverableExpand(d.id)"
                >
                  <MIcon :name="expandedDeliverableId === d.id ? 'expand_less' : 'expand_more'" :size="16" />
                  {{ tasksOfDeliverable(d.deliverableTaskIds).filter(t => t.completedAt).length }} /
                  {{ tasksOfDeliverable(d.deliverableTaskIds).length }} task ·
                  {{ deliverablePct(d) }}%
                </button>

                <div class="prog-track" style="margin-top:6px">
                  <div class="prog-fill" :style="{ width: deliverablePct(d) + '%', background: prioColor[d.priority] }" />
                </div>

                <div v-if="expandedDeliverableId === d.id" class="deliverable-subtasks">
                  <div
                    v-for="sub in tasksOfDeliverable(d.deliverableTaskIds)"
                    :key="sub.id"
                    class="deliverable-subtask"
                  >
                    <div class="checkbox checkbox--sm" @click="sub.completedAt ? doUncomplete(sub) : doComplete(sub)">
                      <MIcon v-if="sub.completedAt" name="check" :size="12" class="check-icon" />
                    </div>
                    <span class="subtask-title" :class="{ 'is-done': sub.completedAt }">{{ sub.title }}</span>
                    <span v-if="sub.dueDate" class="subtask-due">{{ formatDue(sub.dueDate) }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="deliverable-no-sub">Nessun task collegato</div>
            </div>
          </div>
        </div>
      </template>

      <!-- LIST (flat list di tutti i task del progetto, sortati per stato) ─────── -->
      <template v-else-if="activeTab === 'list'">
        <div v-if="!taskItems.length" class="empty-tab">
          <MIcon name="list" :filled="true" :size="32" class="empty-tab-icon" />
          <div>Nessuna azione.</div>
          <div class="empty-tab-hint">Le azioni create dal Kanban appaiono anche in lista, ordinabili per stato e priorità.</div>
        </div>
        <div v-else class="list-view">
          <div v-for="t in taskItems" :key="t.id" class="list-row" @click="doComplete(t)">
            <div class="checkbox" :class="{ 'is-checked': !!t.completedAt || pendingDone.has(t.id) }">
              <MIcon v-if="t.completedAt || pendingDone.has(t.id)" name="check" :size="12" class="check-icon" />
            </div>
            <div class="prio-dot" :style="{ background: prioColor[t.priority] }" />
            <div class="list-title" :class="{ 'is-done': !!t.completedAt }">{{ t.title }}</div>
            <span
              class="list-state"
              :style="{ color: sortedStates.find(s => s.id === t.status)?.color }"
            >
              {{ sortedStates.find(s => s.id === t.status)?.label ?? t.status }}
            </span>
            <span v-if="t.dueDate" class="list-due">{{ formatDue(t.dueDate) }}</span>
          </div>
        </div>
      </template>

      <!-- CALENDARIO (group-by dueDate) ─────────────────────────────────────── -->
      <template v-else-if="activeTab === 'cal'">
        <div v-if="!taskItems.filter(t => t.dueDate).length" class="empty-tab">
          <MIcon name="calendar_month" :filled="true" :size="32" class="empty-tab-icon" />
          <div>Nessuna azione con scadenza.</div>
          <div class="empty-tab-hint">Imposta una data di scadenza alle tue azioni per vederle nel calendario.</div>
        </div>
        <div v-else class="cal-view">
          <div
            v-for="g in calendarGroups"
            :key="g.id"
            class="cal-group"
          >
            <div class="cal-group-header">
              <span class="cal-group-dot" :style="{ background: g.color }" />
              <span class="cal-group-label">{{ g.label }}</span>
              <span class="cal-group-count">{{ g.tasks.length }}</span>
            </div>
            <div v-for="t in g.tasks" :key="t.id" class="list-row" @click="doComplete(t)">
              <div class="checkbox" :class="{ 'is-checked': !!t.completedAt || pendingDone.has(t.id) }">
                <MIcon v-if="t.completedAt || pendingDone.has(t.id)" name="check" :size="12" class="check-icon" />
              </div>
              <div class="prio-dot" :style="{ background: prioColor[t.priority] }" />
              <div class="list-title" :class="{ 'is-done': !!t.completedAt }">{{ t.title }}</div>
              <span v-if="t.dueDate" class="list-due">{{ formatDue(t.dueDate) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- NOTE (markdown-style per progetto, salvate in projects/{id}.notes) ──── -->
      <template v-else-if="activeTab === 'notes'">
        <div class="notes-view">
          <p class="notes-help">Note del progetto: appunti, link, riferimenti. Salvataggio automatico dopo 1s di inattività.</p>
          <textarea
            v-model="notesDraft"
            class="notes-textarea md-text-field-input"
            placeholder="Scrivi qui le note del progetto…"
            @input="onNotesInput"
          />
          <div class="notes-status">
            <span v-if="notesSaving">Salvataggio…</span>
            <span v-else-if="notesSaved">✓ Salvato</span>
            <span v-else>&nbsp;</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal unificata (task / milestone / deliverable) -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop md-modal-backdrop" @click.self="showModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title md-modal-title">{{ modalTitle }}</span>
            <button class="modal-close md-modal-close" @click="showModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Titolo *</label>
            <input v-model="form.title" class="field-input md-text-field-input" autofocus />

            <!-- Assegnatari (no per milestone) -->
            <template v-if="modalKind !== 'milestone'">
              <label class="field-label md-text-field-label" style="margin-top:12px">{{ modalKind === 'deliverable' ? 'Owner' : 'Assegna a' }}</label>
              <div class="assignees-chips">
                <div
                  v-for="m in members"
                  :key="m.email"
                  class="assignee-chip"
                  :class="{ 'is-selected': form.assignees.includes(m.email) }"
                  :style="form.assignees.includes(m.email) ? { background: avatarColor(m.email) + '20', borderColor: avatarColor(m.email) + '80', color: avatarColor(m.email) } : {}"
                  @click="toggleAssignee(m.email)"
                >
                  <span class="chip-avatar" :style="{ background: avatarColor(m.email), color: '#fff' }">{{ avatarInitial(m.email) }}</span>
                  {{ displayName(m.email, members) }}
                </div>
              </div>
            </template>

            <!-- Priorità (no per milestone) + Scadenza -->
            <div :style="modalKind === 'milestone' ? 'margin-top:12px' : 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px'">
              <div v-if="modalKind !== 'milestone'">
                <label class="field-label md-text-field-label">Priorità</label>
                <div class="prio-picker">
                  <button
                    v-for="p in prioOptions"
                    :key="p.id"
                    class="prio-opt"
                    :class="{ 'is-sel': form.priority === p.id }"
                    :style="form.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                    type="button"
                    @click="form.priority = p.id"
                  >
                    <span class="prio-dot" :style="{ background: p.color }" />
                    {{ p.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="field-label md-text-field-label">{{ modalKind === 'milestone' ? 'Data checkpoint' : 'Scadenza' }}</label>
                <input v-model="form.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>

            <!-- Stato iniziale (solo task) -->
            <template v-if="modalKind === 'task'">
              <label class="field-label md-text-field-label" style="margin-top:12px">Stato iniziale</label>
              <select v-model="form.status" class="field-input md-text-field-input">
                <option v-for="s in states" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </template>

            <!-- Task collegati (solo deliverable) -->
            <template v-if="modalKind === 'deliverable'">
              <label class="field-label md-text-field-label" style="margin-top:12px">Task collegati</label>
              <div v-if="!taskItems.length" class="modal-empty">
                Nessun task disponibile in questo progetto.
              </div>
              <div v-else class="subtask-picker">
                <label
                  v-for="t in taskItems"
                  :key="t.id"
                  class="subtask-picker-item"
                  :class="{ 'is-sel': form.deliverableTaskIds.includes(t.id) }"
                >
                  <input
                    type="checkbox"
                    :checked="form.deliverableTaskIds.includes(t.id)"
                    @change="toggleDeliverableSubTask(t.id)"
                  />
                  <span>{{ t.title }}</span>
                </label>
              </div>
            </template>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!form.title.trim() || saving"
              @click="submitForm"
            >{{ modalCta }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pd {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  min-height: calc(100vh - 120px);
}

.pd-header {
  display: flex;
  align-items: stretch;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
}

.pd-stripe { width: 6px; flex-shrink: 0; }

.pd-titles { padding: 18px 20px 14px; flex: 1; min-width: 0; }

.pd-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.p-page-sub { font-size: 12px; color: #9B9590; margin: 0; }

.pd-description { margin-top: 8px; }
.pd-description-text {
  margin: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #6A6560;
  white-space: pre-wrap;
}
.pd-description-text.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pd-description-toggle {
  margin-top: 4px;
  background: none;
  border: none;
  padding: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #9B9590;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pd-description-toggle:hover { color: #6A6560; }

/* Tabs */
.pd-tabs {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px 0;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
}
.pd-tabs-list { display: flex; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; }

.header-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  margin-bottom: 6px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}
.header-cta:hover { background: #B8870E; }
@media (max-width: 768px) { .header-cta { display: none; } }

.pd-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px 10px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #9B9590;
  cursor: pointer;
  transition: all 0.15s;
}
.pd-tab:hover { color: #6A6560; }
.pd-tab.is-active {
  color: var(--md-sys-color-primary);
  border-bottom-color: var(--md-sys-color-primary);
}
.pd-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  background: #F4F2EE;
  border-radius: var(--md-sys-shape-corner-full);
  font-size: 10px;
  font-weight: 700;
  color: #6A6560;
}
.pd-tab.is-active .pd-tab-count {
  background: color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent);
  color: var(--md-sys-color-primary-hover);
}

.pd-content { padding: 16px; }

/* Desktop wide: container centrato + padding generoso. Le tabs interne
   (kanban/milestone/deliverable) sono gia' responsive multi-colonna.
   ProjectBoard SIDERA (/sidera/projects/:id) ha viste aggiuntive
   list/cal/notes — power-view, accessibile via URL diretto. */
@media (min-width: 1024px) {
  .pd-header  { padding: 24px 40px 18px; }
  .pd-content { padding: 24px 40px; max-width: 1280px; margin: 0 auto; }
}
@media (min-width: 1440px) {
  .pd-content { max-width: 1440px; padding: 32px 56px; }
}

.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 48px; border-radius: 10px; background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Empty state per tab */
.empty-tab {
  padding: 50px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-tab-icon { color: var(--md-sys-color-primary); opacity: 0.35; margin-bottom: 4px; }

/* ── LIST view (assorbita da ProjectBoard SIDERA 2026-05-20) ───────────── */
.list-view { max-width: 720px; display: flex; flex-direction: column; gap: 6px; }
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-small);
  border: 1px solid var(--md-sys-color-outline-variant);
  cursor: pointer;
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              box-shadow   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.list-row:hover {
  border-color: var(--md-sys-color-outline);
  box-shadow: var(--md-sys-elevation-level-1);
}
.list-title { flex: 1; font-size: 13px; color: var(--md-sys-color-on-surface); }
.list-title.is-done { text-decoration: line-through; color: var(--md-sys-color-on-surface-variant); }
.list-state { font-size: 11px; font-weight: 600; flex-shrink: 0; }
.list-due {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ── CAL view (group-by relative due date) ─────────────────────────────── */
.cal-view { max-width: 720px; display: flex; flex-direction: column; gap: 20px; }
.cal-group { display: flex; flex-direction: column; gap: 6px; }
.cal-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 4px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.cal-group-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--md-sys-shape-corner-full);
  flex-shrink: 0;
}
.cal-group-label {
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size:   var(--md-sys-typescale-label-medium-size);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface);
  flex: 1;
}
.cal-group-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
}

/* ── NOTES view ─────────────────────────────────────────────────────────── */
.notes-view {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.notes-help {
  font-family: var(--md-sys-typescale-body-small-font);
  font-size:   var(--md-sys-typescale-body-small-size);
  color: var(--md-sys-color-on-surface-variant);
  margin: 0;
}
.notes-textarea {
  min-height: 360px;
  resize: vertical;
  font-family: var(--md-sys-typescale-body-large-font);
  font-size:   var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
}
.notes-status {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  text-align: right;
  min-height: 18px;
}
.empty-tab-hint {
  font-size: 12px;
  color: #B4B0AA;
  max-width: 320px;
  line-height: 1.6;
}

/* Kanban — invariato */
.state-section { margin-bottom: 18px; }

.state-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.state-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.state-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6A6560;
}

.state-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: #9B9590;
  background: #F4F2EE;
  padding: 1px 7px;
  border-radius: var(--md-sys-shape-corner-full);
}

.state-empty { font-size: 12px; color: #C8C5C0; padding: 6px 0 10px 14px; }

.task-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
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
.checkbox--sm { width: 14px; height: 14px; border-radius: var(--md-sys-shape-corner-extra-small); }

.checkbox:hover { border-color: var(--md-sys-color-primary); }
.check-icon { color: var(--md-sys-color-primary); }

.row-title { flex: 1; font-size: 14px; min-width: 0; }
.row-title--done { text-decoration: line-through; color: #9B9590; }

.state-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  border-radius: var(--md-sys-shape-corner-full);
  border: none;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
}

.row-due { font-size: 11px; color: #9B9590; display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

.row-del-btn {
  background: none; border: none; cursor: pointer;
  color: #C8C5C0; padding: 4px; border-radius: var(--md-sys-shape-corner-extra-small);
  display: flex; align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}
.row-del-btn:hover { color: #C8521A; }

.status-menu {
  position: absolute;
  right: 8px;
  top: 100%;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px;
  z-index: 20;
  min-width: 160px;
  margin-top: 4px;
}

.status-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  cursor: pointer;
  text-align: left;
}

.status-menu-item:hover { background: #F4F2EE; }
.status-menu-item.is-current { font-weight: 600; }

.undo-btn {
  background: none; border: none; cursor: pointer;
  color: #9B9590; padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
  display: flex; align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}

.undo-btn:hover { color: var(--md-sys-color-primary-hover); }

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
}

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

.done-list { display: flex; flex-direction: column; }

/* Milestone timeline */
.milestone-timeline {
  position: relative;
  padding-left: 8px;
}
.milestone-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
}
.milestone-item .milestone-line {
  position: absolute;
  left: 17px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #E8E5DF;
}
.milestone-item:first-child .milestone-line { top: 50%; }
.milestone-item:last-child .milestone-line { bottom: 50%; }

.milestone-circle {
  width: 22px; height: 22px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 2px solid #B4B0AA;
  background: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  z-index: 1;
  color: #fff;
  flex-shrink: 0;
  transition: all 0.15s;
}
.milestone-circle:hover { border-color: var(--md-sys-color-primary); }
.milestone-circle.is-done {
  background: #2F6B4A;
  border-color: #2F6B4A;
}

.milestone-body {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
}
.milestone-item.is-done .milestone-body { background: #FAF8F4; opacity: 0.7; }

.milestone-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1917;
  margin-bottom: 2px;
}
.milestone-title.is-done { text-decoration: line-through; color: #9B9590; }

.milestone-date {
  font-size: 11px;
  font-weight: 600;
  color: #2F6B4A;
}
.milestone-date--missing { color: #C8C5C0; font-style: italic; font-weight: 400; }

/* Deliverable */
.deliverable-list { display: flex; flex-direction: column; gap: 8px; }

.deliverable-card {
  display: flex;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
}
.deliverable-card.is-done { opacity: 0.6; }

.deliverable-stripe { width: 5px; flex-shrink: 0; }

.deliverable-body { flex: 1; padding: 12px 14px; min-width: 0; }

.deliverable-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.deliverable-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1917;
  min-width: 0;
}
.deliverable-title.is-done { text-decoration: line-through; color: #9B9590; }

.deliverable-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.d-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
  background: #F4F2EE;
  font-size: 10px;
  font-weight: 600;
  color: #6A6560;
}

.deliverable-sub { margin-top: 4px; }
.deliverable-expand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #6A6560;
}
.deliverable-expand:hover { color: #1A1917; }

.deliverable-subtasks {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 8px;
  border-left: 2px solid #F0EDE8;
}

.deliverable-subtask {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.subtask-title {
  flex: 1;
  font-size: 12px;
  color: #6A6560;
  min-width: 0;
}
.subtask-title.is-done { text-decoration: line-through; color: #B4B0AA; }
.subtask-due { font-size: 10px; color: #9B9590; flex-shrink: 0; }

.deliverable-no-sub {
  font-size: 11px;
  color: #B4B0AA;
  font-style: italic;
}

.prog-track { height: 4px; background: #F0EDE8; border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
.prog-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); transition: width 0.3s ease; }

/* Modal */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: 540px;
  max-height: 86vh;
  display: flex; flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }
.modal-close { background: none; border: none; cursor: pointer; color: #9B9590; padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small); }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.modal-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #B4B0AA;
  font-style: italic;
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

.assignees-chips { display: flex; gap: 6px; flex-wrap: wrap; }

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

.subtask-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  padding: 8px;
  background: #F4F2EE;
}

.subtask-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #6A6560;
  background: #fff;
  transition: background 0.15s;
}
.subtask-picker-item:hover { background: #FAF8F4; }
.subtask-picker-item.is-sel { background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent); color: #1A1917; font-weight: 500; }
.subtask-picker-item input { accent-color: var(--md-sys-color-primary); }

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
