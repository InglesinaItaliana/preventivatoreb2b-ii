<script setup lang="ts">
/**
 * Card "azione" unificata, usata in CEPHEID (Azioni, Scadenze, dettaglio progetto
 * kanban/lista) e PULSAR (Azioni). Campi context-aware via prop:
 *  - spunta cerchio (CepheidDoneToggle), pallino priorità, titolo,
 *    chip progetto (showProject), assegnatari StarAvatar (showAssignees), data (showDue).
 * Slot #trailing per controlli view-specifici (pill stato kanban, link chat PULSAR).
 */
import { computed } from 'vue'
import MIcon from '../shared/MIcon.vue'
import CepheidAssigneePills from './CepheidAssigneePills.vue'
import CepheidDoneToggle from './CepheidDoneToggle.vue'
import { type TeamMember } from '../../composables/sidera/useTeamMembers'

interface TaskLike {
  id: string
  title: string
  priority: 'alta' | 'media' | 'bassa'
  assignees: string[]
  dueDate: Date | null
  projectId: string | null
  completedAt: Date | null
}

const props = withDefaults(defineProps<{
  task: TaskLike
  members?: TeamMember[]
  currentUserEmail?: string | null
  projectName?: string
  projectColor?: string
  pending?: boolean
  showProject?: boolean
  showDue?: boolean
  showAssignees?: boolean
  /** viste "solo mie": nascondi gli assegnatari se l'unico sei tu */
  hideSoleSelfAssignee?: boolean
  /** la riga è cliccabile (emette 'open') */
  clickable?: boolean
}>(), {
  members: () => [],
  showProject: true, showDue: true, showAssignees: true,
  hideSoleSelfAssignee: false, clickable: true, pending: false,
})

const emit = defineEmits<{ (e: 'toggle'): void; (e: 'open'): void }>()

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

const isDone = computed(() => !!props.task.completedAt || props.pending)

const visibleAssignees = computed(() => {
  if (!props.showAssignees) return []
  const a = props.task.assignees ?? []
  if (!a.length) return []
  if (props.hideSoleSelfAssignee && a.length === 1
      && a[0]?.toLowerCase() === (props.currentUserEmail ?? '').toLowerCase()) return []
  return a
})

function formatDue(d: Date | null): string {
  if (!d) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === -1) return 'Ieri'
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

function onRowClick() { if (props.clickable) emit('open') }
</script>

<template>
  <div class="ac" :class="{ clickable }" @click="onRowClick">
    <CepheidDoneToggle shape="circle" :done="isDone" @toggle="emit('toggle')" />

    <div class="ac-body">
      <div class="ac-title" :class="{ 'is-done': !!task.completedAt }">
        <span class="ac-prio" :style="{ background: prioColor[task.priority] }" :title="'Priorità ' + task.priority" />{{ task.title }}
      </div>
      <div v-if="showProject && task.projectId && projectName" class="ac-meta">
        <span
          class="ac-proj"
          :style="{ background: (projectColor || '#7A8FA6') + '22', color: projectColor || '#7A8FA6' }"
        >{{ projectName }}</span>
      </div>
    </div>

    <CepheidAssigneePills
      v-if="visibleAssignees.length"
      :assignees="visibleAssignees"
      :members="members"
      :size="20"
      class="ac-assignees"
    />

    <div v-if="showDue && task.dueDate" class="ac-due">
      <MIcon name="schedule" :size="12" />{{ formatDue(task.dueDate) }}
    </div>

    <slot name="trailing" />
  </div>
</template>

<style scoped>
.ac {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: #FFF8F0;
  border-radius: 12px;
  font-family: 'Outfit', sans-serif;
  transition: background var(--md-sys-motion-duration-short3, 150ms) var(--md-sys-motion-easing-standard, ease);
}
.s-surface-dark .ac { background: #16130B; }
.ac.clickable { cursor: pointer; }
/* hover su tutta la card (anche non cliccabile) come in Azioni */
.ac:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 5%, #FFF8F0); }
.s-surface-dark .ac:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 10%, #16130B); }

.ac-body { flex: 1; min-width: 0; }
.ac-title { font-size: 14px; color: var(--md-sys-color-on-surface); }
.ac-title.is-done { text-decoration: line-through; color: var(--md-sys-color-on-surface-variant); }
.ac-prio {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  margin-right: 8px; vertical-align: middle; flex-shrink: 0;
}
.ac-meta { margin-top: 3px; display: flex; gap: 6px; }
.ac-proj {
  font-size: 10px; font-weight: 600; padding: 1px 7px;
  border-radius: var(--md-sys-shape-corner-full);
  max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* gruppo assegnatari: componente condiviso CepheidAssigneePills.
   Qui solo il vincolo di layout: non farlo schiacciare dal titolo. */
.ac-assignees { flex-shrink: 0; }

.ac-due {
  font-size: 11px; color: var(--md-sys-color-on-surface-variant);
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
}
</style>
