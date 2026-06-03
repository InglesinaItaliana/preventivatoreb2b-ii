<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../shared/MIcon.vue'
import GoalChip from './GoalChip.vue'
import CepheidTimeline from './CepheidTimeline.vue'
import CepheidCreateMenu from './CepheidCreateMenu.vue'
import CepheidCreateModal from './CepheidCreateModal.vue'
import { useProjectTasks } from '../../composables/sidera/useProjectTasks'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import type { Project } from '../../composables/sidera/useProjects'
import type { TeamMember } from '../../composables/sidera/useTeamMembers'

const props = defineProps<{
  project: Project
  members: TeamMember[]
  isAdmin: boolean
  obiettivo: { titolo: string; colore: string } | null
  updateProject: (id: string, data: Partial<{ startDate: Date | null; dueDate: Date | null }>) => Promise<void>
  setCompleted: (id: string, done: boolean) => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'edit', p: Project, ev: Event): void
  (e: 'delete', id: string, ev: Event): void
  (e: 'toggle-active', id: string, active: boolean): void
}>()

const router = useRouter()
const projectId = props.project.id
const timelineRef = ref<{ expanded: boolean } | null>(null)
const isExpanded = computed(() => timelineRef.value?.expanded ?? false)
const { tasks, updateTask, completeTask, uncompleteTask, approvePhase, unapprovePhase, createTask, createPhaseBundle } = useProjectTasks(projectId)
const { currentUser } = useCurrentUser()

const menuOpen = ref(false)
function openDetail() { router.push('/cepheid/project/' + projectId) }

const createOpen = ref(false)
const createKind = ref<'fase' | 'deliverable' | 'milestone' | 'task'>('fase')
function openCreate(kind: 'fase' | 'deliverable' | 'milestone' | 'task') { createKind.value = kind; createOpen.value = true }

const projectDueIso = computed(() => {
  const d = props.project.dueDate
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined
})
</script>

<template>
  <div
    class="pcard"
    :class="{
      'pcard--inactive': project.active === false || project.completed,
      'pcard--quiet': (project.completed || project.active === false) && !isExpanded,
    }"
  >
      <!-- overlay stato: trofeo (completato) o pausa (inattivo), grande al centro
           della card collassata; nascosto quando la card è aperta -->
      <div v-if="(project.completed || project.active === false) && !isExpanded" class="pcard-state-overlay">
        <MIcon :name="project.completed ? 'emoji_events' : 'pause'" :size="72" :filled="project.completed" />
      </div>
      <CepheidTimeline
        ref="timelineRef"
        collapsible
        :title="project.name"
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
        @completed="(done) => setCompleted(project.id, done).catch(e => console.error('[CEPHEID] setCompleted', e))"
      >
        <template #head-actions>
          <!-- indicatore di stato compatto (card quiet): visibile finché non si fa hover -->
          <span
            v-if="(project.completed || project.active === false) && !isExpanded"
            class="pcard-state-mini"
            :title="project.completed ? 'Completato' : 'In pausa'"
          >
            <MIcon :name="project.completed ? 'emoji_events' : 'pause'" :size="16" :filled="project.completed" />
          </span>
          <GoalChip v-if="obiettivo" :titolo="obiettivo.titolo" :colore="obiettivo.colore" size="sm" />
          <span v-if="project.active === false" class="badge-inactive">Inattivo</span>
          <CepheidCreateMenu v-if="isAdmin" @select="openCreate" />
          <button
            v-if="isAdmin"
            class="pcard-icon"
            :title="project.active !== false ? 'Disattiva' : 'Attiva'"
            @click="emit('toggle-active', project.id, project.active === false)"
          >
            <MIcon :name="project.active !== false ? 'pause' : 'play_arrow'" :size="16" />
          </button>
          <button class="pcard-icon" title="Apri dettaglio" @click="openDetail">
            <MIcon name="open_in_full" :size="16" />
          </button>
          <div v-if="isAdmin" class="pcard-menu-wrap">
            <button class="pcard-icon" aria-label="Menu progetto" @click="menuOpen = !menuOpen">
              <MIcon name="more_horiz" :size="18" />
            </button>
            <div v-if="menuOpen" class="pcard-dropdown" @click="menuOpen = false">
              <button class="pcard-dropdown-item" @click="emit('edit', project, $event)">
                <MIcon name="edit" :size="14" /> Modifica progetto
              </button>
              <button class="pcard-dropdown-item pcard-dropdown-item--danger" @click="emit('delete', project.id, $event)">
                <MIcon name="delete" :size="14" /> Elimina progetto
              </button>
            </div>
          </div>
        </template>
      </CepheidTimeline>

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
.pcard {
  position: relative;
  /* isolation: isolate crea uno stacking context locale così gli z-index interni
     (`.pcard-state-overlay` z-index:7, header sticky interno z-index:6,
     `.pcard-menu` z-index:50) sono CONFINATI alla card e non risalgono nello
     stacking context globale, dove altrimenti finirebbero sopra la pillola
     bottom-nav (z-index:5) e il MdPageHeader sticky (z-index:10). */
  isolation: isolate;
  background: #FFF8F0;
  border-radius: 16px;
  padding: 12px 14px;
  flex-shrink: 0;   /* in un flex-column scrollabile evita che la card espansa venga compressa */
}

/* overlay grande centrato: distingue a colpo d'occhio completato (trofeo) da in pausa (pause).
   z-index alto perché su card collassata deve stare SOPRA l'header sticky (opaco, z-index 6);
   pointer-events:none così i pulsanti dell'header restano cliccabili sotto. */
.pcard-state-overlay {
  position: absolute; inset: 0; z-index: 7;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
  color: var(--md-sys-color-on-surface-variant);
  opacity: 0.5;
}
.s-surface-dark .pcard { background: #16130B; }
@media (prefers-color-scheme: dark) { .pcard { background: #16130B; } }
.pcard--inactive { opacity: 0.6; }

/* card "quiet" (conclusi/in pausa): di default solo la riga del titolo + icone azione.
   topbar e overlay grande riappaiono all'hover → torna come una card collassata normale. */
.pcard--quiet :deep(.topbar) { display: none; }
.pcard--quiet .pcard-state-overlay { display: none; }
.pcard--quiet:hover :deep(.topbar) { display: block; }
.pcard--quiet:hover .pcard-state-overlay { display: flex; }
.pcard--quiet:hover .pcard-state-mini { display: none; }
.pcard-state-mini { display: inline-flex; align-items: center; color: var(--md-sys-color-on-surface-variant); }

/* la card timeline interna non ha bisogno del suo chrome: il wrapper lo fornisce */
.pcard :deep(.cph-timeline.is-card) { background: transparent; border: 0; border-radius: 0; padding: 0; }

.badge-inactive {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant); background: var(--md-sys-color-surface-container);
  padding: 2px 7px; border-radius: var(--md-sys-shape-corner-full);
}
.pcard-icon {
  background: none; border: none; padding: 4px; border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer; color: var(--md-sys-color-on-surface-variant); display: inline-flex; align-items: center;
}
.pcard-icon:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); color: var(--md-sys-color-primary); }
.pcard-menu-wrap { position: relative; }
.pcard-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium); box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px; min-width: 180px; z-index: 50;
}
.pcard-dropdown-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px;
  background: none; border: none; font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size); color: var(--md-sys-color-on-surface);
  text-align: left; cursor: pointer; border-radius: var(--md-sys-shape-corner-small);
}
.pcard-dropdown-item:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.pcard-dropdown-item--danger { color: var(--md-sys-color-error); }
</style>
