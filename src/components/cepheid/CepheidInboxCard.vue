<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, toEmails, type TeamMember } from '../../composables/sidera/useTeamMembers'
import type { Task } from '../../composables/sidera/useAllTasks'

const props = defineProps<{
  task: Task
  projects: { id: string; name: string }[]
  deliverables: Task[]
  milestones: Task[]
  members: TeamMember[]
}>()

const emit = defineEmits<{
  (e: 'smista', payload: { assignees: string[]; priority: 'alta' | 'media' | 'bassa'; projectId: string; milestoneId: string; deliverableId: string }): void
  (e: 'delete'): void
}>()

// Pre-selezione (opzione B): se la task è GIÀ collocata — referenziata nel
// deliverableTaskIds di un deliverable, oppure con una milestoneId — parti da
// quella selezione invece di chiedere a vuoto. Resta cambiabile (le pillole sono
// interattive). La card è keyed-by-task nel parent → si re-inizializza per ogni task.
const preDeliverableId = props.deliverables.find(
  d => Array.isArray(d.deliverableTaskIds) && d.deliverableTaskIds.includes(props.task.id),
)?.id ?? ''
const preMilestoneId = preDeliverableId ? '' : (props.task.milestoneId ?? '')

const draft = reactive({
  assignees: toEmails(props.task.assignees, props.members),   // uid→email per le chip (post-backfill)
  priority: props.task.priority,
  projectId: props.task.projectId || '',
  milestoneId: preMilestoneId,
  deliverableId: preDeliverableId,
})

const isStandalone = computed(() => !props.task.projectId)
const effectiveProjectId = computed(() => props.task.projectId || draft.projectId)
const hasProject = computed(() => !!effectiveProjectId.value)
const projectName = computed(() => props.projects.find(p => p.id === effectiveProjectId.value)?.name ?? '')
const projectDelivs = computed(() => props.deliverables.filter(d => d.projectId === effectiveProjectId.value))
const projectMiles = computed(() => props.milestones.filter(m => m.projectId === effectiveProjectId.value))
function delivMile(d: Task) { return props.milestones.find(m => m.id === d.milestoneId)?.title ?? '' }

function pickProject(id: string) { draft.projectId = id; draft.milestoneId = ''; draft.deliverableId = '' }
function resetProject() { draft.projectId = ''; draft.milestoneId = ''; draft.deliverableId = '' }
function pickDeliverable(id: string) { draft.deliverableId = draft.deliverableId === id ? '' : id; draft.milestoneId = '' }
function pickMilestone(id: string) { draft.milestoneId = draft.milestoneId === id ? '' : id; draft.deliverableId = '' }
function toggleAssignee(email: string) {
  const i = draft.assignees.indexOf(email)
  if (i === -1) draft.assignees.push(email); else draft.assignees.splice(i, 1)
}

function doSmista() {
  emit('smista', { assignees: draft.assignees, priority: draft.priority, projectId: draft.projectId, milestoneId: draft.milestoneId, deliverableId: draft.deliverableId })
}

/* ── swipe (Tinder) ─────────────────────────────────────────────────────── */
const dx = ref(0)
const dragging = ref(false)
const leaving = ref<'' | 'left' | 'right'>('')
let startX = 0, captured: HTMLElement | null = null
const THRESHOLD = 90
const cardStyle = computed(() => {
  if (leaving.value) return { transition: 'transform .22s ease, opacity .22s ease', transform: `translateX(${leaving.value === 'right' ? 600 : -600}px) rotate(${leaving.value === 'right' ? 18 : -18}deg)`, opacity: 0 }
  return { transform: `translateX(${dx.value}px) rotate(${dx.value * 0.04}deg)`, transition: dragging.value ? 'none' : 'transform .25s ease' }
})

function onDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, select, input, label, .ic-chip, .ic-pill, a')) return
  dragging.value = true; startX = e.clientX
  captured = e.currentTarget as HTMLElement; captured.setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) { if (dragging.value) dx.value = e.clientX - startX }
function onUp() {
  if (!dragging.value) return
  dragging.value = false
  if (dx.value > THRESHOLD) flyOut('right')
  else if (dx.value < -THRESHOLD) flyOut('left')
  else dx.value = 0
}
function flyOut(dir: 'left' | 'right') {
  leaving.value = dir
  setTimeout(() => { dir === 'right' ? doSmista() : emit('delete') }, 200)
}

const PRIO = [
  { id: 'alta', label: 'Alta', color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const
</script>

<template>
  <div class="ic-card" :style="cardStyle"
    @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
    <!-- hint swipe -->
    <div class="ic-hint ic-hint--right" :style="{ opacity: Math.max(0, Math.min(1, dx / 120)) }"><MIcon name="check" :size="20" /> Smista</div>
    <div class="ic-hint ic-hint--left" :style="{ opacity: Math.max(0, Math.min(1, -dx / 120)) }"><MIcon name="delete" :size="20" /> Elimina</div>

    <div class="ic-head">
      <span class="ic-title">{{ task.title }}</span>
      <span class="ic-tag" :class="{ standalone: isStandalone }">{{ isStandalone ? 'Sciolto' : projectName }}</span>
    </div>

    <div class="ic-section">
      <span class="ic-lab">Delega</span>
      <div class="ic-row">
        <div v-for="m in members" :key="m.email" class="ic-chip" :class="{ on: draft.assignees.includes(m.email) }"
          @click="toggleAssignee(m.email)">
          <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="18" /> {{ displayName(m.email, members) }}
        </div>
      </div>
    </div>

    <div class="ic-section">
      <span class="ic-lab">Priorità</span>
      <div class="ic-row">
        <button v-for="p in PRIO" :key="p.id" type="button" class="ic-pill" :class="{ on: draft.priority === p.id }" @click="draft.priority = p.id">
          <span class="ic-dot" :style="{ background: p.color }" />{{ p.label }}
        </button>
      </div>
    </div>

    <div class="ic-section">
      <span class="ic-lab">Dipendenza</span>
      <!-- standalone senza progetto scelto: lista progetti -->
      <div v-if="!hasProject" class="ic-row">
        <button v-for="p in projects" :key="p.id" type="button" class="ic-pill" @click="pickProject(p.id)">{{ p.name }}</button>
        <span v-if="!projects.length" class="ic-hintnote">Nessun progetto disponibile.</span>
      </div>
      <!-- progetto scelto/assegnato: pillole deliverable (o milestone) -->
      <template v-else>
        <div class="ic-row">
          <template v-if="projectDelivs.length">
            <button v-for="d in projectDelivs" :key="d.id" type="button" class="ic-pill" :class="{ on: draft.deliverableId === d.id }"
              @click="pickDeliverable(d.id)">
              <MIcon name="inventory_2" :size="13" /> {{ d.title }}<span v-if="delivMile(d)" class="ic-pill-sub"> · {{ delivMile(d) }}</span>
            </button>
          </template>
          <template v-else-if="projectMiles.length">
            <button v-for="m in projectMiles" :key="m.id" type="button" class="ic-pill" :class="{ on: draft.milestoneId === m.id }"
              @click="pickMilestone(m.id)">
              <MIcon name="rocket_launch" :size="13" /> {{ m.title }}
            </button>
          </template>
          <span v-else class="ic-hintnote">Nessuna fase nel progetto (resta a livello progetto).</span>
        </div>
        <button v-if="isStandalone" type="button" class="ic-change" @click="resetProject">↺ cambia progetto ({{ projectName }})</button>
      </template>
    </div>

    <div class="ic-actions">
      <button type="button" class="ic-btn ic-del" @click="flyOut('left')"><MIcon name="delete" :size="18" /></button>
      <button type="button" class="ic-btn ic-smista" @click="flyOut('right')"><MIcon name="check" :size="18" /> Smista</button>
    </div>
  </div>
</template>

<style scoped>
.ic-card {
  position: relative; background: #FFF8F0;
  border-radius: 20px; padding: 18px 18px 16px;
  display: flex; flex-direction: column; gap: 14px; touch-action: pan-y; user-select: none; cursor: grab;
}
.ic-card:active { cursor: grabbing; }
.s-surface-dark .ic-card { background: #16130B; }
@media (prefers-color-scheme: dark) { .ic-card { background: #16130B; } }

.ic-hint { position: absolute; top: 16px; display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 14px; letter-spacing: .06em; text-transform: uppercase; padding: 4px 10px; border-radius: var(--md-sys-shape-corner-full); pointer-events: none; }
.ic-hint--right { right: 16px; color: #2F8F4A; border: 2px solid #2F8F4A; transform: rotate(8deg); }
.ic-hint--left { left: 16px; color: var(--md-sys-color-error); border: 2px solid var(--md-sys-color-error); transform: rotate(-8deg); }

.ic-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ic-title { font-family: var(--md-sys-typescale-headline-small-font, 'Cormorant Garamond', serif); font-size: 22px; line-height: 1.15; font-weight: 500; color: var(--md-sys-color-on-surface); flex: 1; min-width: 0; }
.ic-tag { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--md-sys-shape-corner-full); background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent); color: var(--md-sys-color-primary); flex: 0 0 auto; }
.ic-tag.standalone { background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface-variant); }

.ic-section { display: flex; flex-direction: column; gap: 6px; }
.ic-lab { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }
.ic-row { display: flex; flex-wrap: wrap; gap: 6px; }
.ic-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px 4px 4px; border: 1.5px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); font-size: 12px; cursor: pointer; color: var(--md-sys-color-on-surface); background: transparent; transition: background .12s, border-color .12s; }
.ic-pill { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border: 1.5px solid var(--md-sys-color-outline-variant); background: transparent; border-radius: var(--md-sys-shape-corner-full); font-family: inherit; font-size: 13px; cursor: pointer; color: var(--md-sys-color-on-surface-variant); transition: background .12s, border-color .12s; }
/* selezione UNIFORME per chip e pillole */
.ic-chip.on, .ic-pill.on { background: var(--md-sys-color-primary-container); border-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary-container); font-weight: 600; }
.ic-pill-sub { color: var(--md-sys-color-on-surface-variant); opacity: .75; }
.ic-dot { width: 8px; height: 8px; border-radius: 50%; }
.ic-hintnote { font-size: 12px; color: var(--md-sys-color-on-surface-variant); font-style: italic; }
.ic-change { align-self: flex-start; background: none; border: none; color: var(--md-sys-color-primary); font-size: 12px; cursor: pointer; padding: 2px 0; }

.ic-actions { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
.ic-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: var(--md-sys-shape-corner-full); cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 600; }
.ic-del { width: 46px; height: 46px; background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
.ic-smista { flex: 1; height: 46px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
</style>
