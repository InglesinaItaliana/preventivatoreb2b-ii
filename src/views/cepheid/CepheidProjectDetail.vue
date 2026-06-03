<script setup lang="ts">
import { ref, computed, inject, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import GoalChip from '../../components/cepheid/GoalChip.vue'
import { useProjects, DEFAULT_STATES } from '../../composables/sidera/useProjects'
import { useProjectTasks } from '../../composables/sidera/useProjectTasks'
import { useObiettivi } from '../../composables/sidera/useObiettivi'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import CepheidTimeline from '../../components/cepheid/CepheidTimeline.vue'
import CepheidCreateMenu from '../../components/cepheid/CepheidCreateMenu.vue'
import CepheidCreateModal from '../../components/cepheid/CepheidCreateModal.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import LinkedDocsPanel from '../../components/shared/LinkedDocsPanel.vue'

const route   = useRoute()
const router  = useRouter()
const projectId = route.params.id as string

const { projects, updateProject } = useProjects()
const { tasks, loading, createTask, completeTask, uncompleteTask, updateTaskStatus, updateTask, deleteTask, approvePhase, unapprovePhase, createPhaseBundle } = useProjectTasks(projectId)
const { obiettiviAttivi } = useObiettivi()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

const project = computed(() => projects.value.find(p => p.id === projectId))
const projectDueIso = computed(() => {
  const d = project.value?.dueDate
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined
})
const states = computed(() => project.value?.states ?? DEFAULT_STATES)

const obiettivoCollegato = computed(() => {
  if (!project.value?.obiettivoId) return null
  return obiettiviAttivi.value.find(o => o.id === project.value!.obiettivoId) ?? null
})

// ── Tabs ──────────────────────────────────────────────────────────────────
type Tab = 'kanban' | 'list' | 'milestone' | 'deliverable' | 'timeline' | 'notes'
const activeTab = ref<Tab>('kanban')

// ── List view: tutti i task flat sortable per state/priority ──────────────
const sortedStates = computed(() => states.value)  // alias semantico per list view

// ── Filtri per tipo ───────────────────────────────────────────────────────
const taskItems = computed(() => tasks.value.filter(t => !t.type || t.type === 'task'))
const milestoneItems = computed(() => tasks.value.filter(t => t.type === 'milestone'))
const deliverableItems = computed(() => tasks.value.filter(t => t.type === 'deliverable'))

// definizioni tab per la pillola view-switcher (label + icona + count opzionale)
const tabDefs = computed(() => [
  { id: 'kanban',      label: 'Kanban',      icon: 'view_kanban', count: taskItems.value.length || undefined },
  { id: 'list',        label: 'Lista',       icon: 'list',        count: taskItems.value.length || undefined },
  { id: 'milestone',   label: 'Milestone',   icon: 'flag',        count: milestoneItems.value.length || undefined },
  { id: 'deliverable', label: 'Deliverable', icon: 'inventory_2', count: deliverableItems.value.length || undefined },
  { id: 'timeline',    label: 'Timeline',    icon: 'timeline' },
  { id: 'notes',       label: 'Note',        icon: 'description' },
])

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
// data milestone DERIVATA = scadenza del deliverable più tardivo collegato
function mileDerivedDate(mId: string): Date | null {
  const ds = tasks.value.filter(t => t.type === 'deliverable' && t.milestoneId === mId && t.dueDate)
  if (!ds.length) return null
  return new Date(Math.max(...ds.map(d => d.dueDate!.getTime())))
}
function mileDateLabel(mId: string): string {
  const d = mileDerivedDate(mId)
  return d ? formatDue(d) : 'definita dai deliverable'
}

const milestoneSorted = computed(() => {
  return [...milestoneItems.value].sort((a, b) => {
    const da = mileDerivedDate(a.id)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = mileDerivedDate(b.id)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return da - db
  })
})

async function toggleMilestone(m: { id: string; completedAt: Date | null }) {
  if (m.completedAt) await uncompleteTask(m.id)
  else await completeTask(m.id)
}

// edit titolo milestone (inline)
const editingMileId = ref<string | null>(null)
const editMileTitle = ref('')
function startEditMile(m: { id: string; title: string }) { editingMileId.value = m.id; editMileTitle.value = m.title }
async function saveMile() {
  const id = editingMileId.value
  if (id && editMileTitle.value.trim()) await updateTask(id, { title: editMileTitle.value.trim() })
  editingMileId.value = null
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

// ── Creazione (menu + modal condiviso) ─────────────────────────────────────
const createOpen = ref(false)
const createKind = ref<'fase' | 'deliverable' | 'milestone' | 'task'>('task')
function openCreate(kind: 'fase' | 'deliverable' | 'milestone' | 'task') { createKind.value = kind; createOpen.value = true }

// ── FAB del layout → crea task rapida ─────────────────────────────────────
const newTaskTick = inject<Ref<number>>('cepheid-new-task-tick', null as any)
if (newTaskTick) {
  watch(newTaskTick, () => openCreate('task'))
}

// ── Delete con conferma ───────────────────────────────────────────────────
async function deleteItem(t: { id: string; completedAt: Date | null; title: string }) {
  if (!confirm(`Eliminare "${t.title}"?`)) return
  await deleteTask(t.id, !!t.completedAt)
}
</script>

<template>
  <div class="pd s-scope-cepheid">
    <!-- Header coerente con le altre schede CEPHEID (MdPageHeader + accento colore progetto).
         Le tab (collassabili come nei Progetti) + il menu crea stanno nello slot #tools. -->
    <MdPageHeader
      v-if="project"
      :title="project.name"
      :subtitle="`${project.doneCount}/${project.taskCount} azioni · ${pct(project)}%`"
      :accent-color="project.color"
    >
      <template #tools>
        <div class="pd-tools">
          <CepheidViewSwitcher
            :model-value="activeTab"
            :tabs="tabDefs"
            @update:model-value="(v) => (activeTab = v as Tab)"
          />
          <CepheidCreateMenu @select="openCreate" />
        </div>
      </template>
    </MdPageHeader>

    <!-- Sotto-header: obiettivo collegato + descrizione + "citato in N doc" -->
    <div v-if="project" class="pd-subhead">
      <GoalChip
        v-if="obiettivoCollegato"
        :titolo="obiettivoCollegato.titolo"
        :colore="obiettivoCollegato.colore"
        size="sm"
        clickable
        @click="router.push('/cepheid/goal/' + obiettivoCollegato.id)"
      />
      <div v-if="project.description" class="pd-description">
        <p class="pd-description-text" :class="{ 'is-collapsed': !descExpanded && descIsLong }">
          {{ project.description }}
        </p>
        <button v-if="descIsLong" class="pd-description-toggle" @click="descExpanded = !descExpanded">
          {{ descExpanded ? 'mostra meno' : 'leggi tutto' }}
        </button>
      </div>
      <LinkedDocsPanel kind="project" :id="projectId" />
    </div>

    <div class="pd-content" :class="{ 'pd-content--timeline': activeTab === 'timeline' }">
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
          >
            <div class="checkbox" @click="doComplete(t)">
              <MIcon v-if="pendingDone.has(t.id)" name="check" :size="14" class="check-icon" />
            </div>
            <span class="prio-dot" :style="{ background: prioColor[t.priority] }" :title="'Priorità ' + t.priority" />
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
              <input
                v-if="editingMileId === m.id"
                v-model="editMileTitle"
                class="milestone-edit-input"
                @keyup.enter="saveMile"
                @blur="saveMile"
              />
              <div v-else class="milestone-title" :class="{ 'is-done': m.completedAt }" @click="startEditMile(m)">{{ m.title }}</div>
              <div class="milestone-date">{{ mileDateLabel(m.id) }}</div>
            </div>
            <button class="row-del-btn" @click="startEditMile(m)" title="Rinomina">
              <MIcon name="edit" :size="14" />
            </button>
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

      <!-- TIMELINE (ciclo di vita: fasi → task → deliverable → milestone) ────── -->
      <template v-else-if="activeTab === 'timeline'">
        <CepheidTimeline
          :project="project"
          :tasks="tasks"
          :members="members"
          :update-task="updateTask"
          :complete-task="completeTask"
          :uncomplete-task="uncompleteTask"
          :update-project="updateProject"
          :approve-phase="approvePhase"
          :unapprove-phase="unapprovePhase"
          @new-phase="openCreate('fase')"
        />
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

    <!-- Modal di creazione condiviso (fase / deliverable / milestone / task) -->
    <CepheidCreateModal
      v-model:open="createOpen"
      v-model:kind="createKind"
      :tasks="tasks"
      :members="members"
      :current-user-email="currentUser?.email ?? null"
      :create-task="createTask"
      :create-phase-bundle="createPhaseBundle"
      :update-task="updateTask"
      :project-due-iso="projectDueIso"
    />
  </div>
</template>

<style scoped>
.pd {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  /* riempie l'altezza disponibile di .s-main (overflow:hidden) e delega
     lo scroll a .pd-content, così le tab alte (es. Timeline) scorrono */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* sfondo come la pagina CEPHEID Progetti */
  background: #EFE7D9;
}
.s-surface-dark .pd { background: #0E0C07; color: #F5EFE3; }

/* header (MdPageHeader) + sotto-header non scrollano (lo scroll è in .pd-content) */
.pd > :deep(.md-page-header) { flex-shrink: 0; padding: 18px 16px 14px; }
.pd-subhead { flex-shrink: 0; background: var(--md-sys-color-surface); padding: 0 16px 12px; }
.pd-subhead > * + * { margin-top: 8px; }
.pd-tools { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; overflow-x: auto; }

.pd-description {}
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

/* sfondo del contenuto = pagina CEPHEID Progetti (#EFE7D9), per tutti i tab */
.pd-content { padding: 16px; flex: 1; min-height: 0; overflow-y: auto; background: #EFE7D9; }
.s-surface-dark .pd-content { background: #0E0C07; }

/* Desktop wide: container centrato + padding generoso. Le tabs interne
   (kanban/milestone/deliverable) sono gia' responsive multi-colonna.
   ProjectBoard SIDERA (/sidera/projects/:id) ha viste aggiuntive
   list/cal/notes — power-view, accessibile via URL diretto. */
@media (min-width: 1024px) {
  .pd > :deep(.md-page-header) { padding: 24px 40px 18px; }
  .pd-subhead { padding: 0 40px 14px; }
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
  background: #FFF8F0;
  border-radius: 12px;
  margin-bottom: 6px;
}
.s-surface-dark .task-row { background: #16130B; }

.task-row--done { opacity: 0.5; }

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
  cursor: text;
}
.milestone-title.is-done { text-decoration: line-through; color: #9B9590; }
.milestone-edit-input {
  font-size: 14px; font-weight: 600; color: #1A1917; margin-bottom: 2px;
  border: 1px solid var(--md-sys-color-primary); border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 2px 6px; font-family: 'Outfit', sans-serif; outline: none; width: 100%;
}

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
  z-index: 100;
}

.modal {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: 540px;
  max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex; flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
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
