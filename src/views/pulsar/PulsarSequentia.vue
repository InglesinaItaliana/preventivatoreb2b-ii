<script setup lang="ts">
import { ref, computed } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useAllTasks }    from '../../composables/sidera/useAllTasks'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { tasks, loading: tasksLoading, completeTask, uncompleteTask } = useAllTasks()
const { currentUser } = useCurrentUser()

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

const myTasks = computed(() =>
  tasks.value.filter(t =>
    !t.completedAt &&
    !pendingDone.value.has(t.id) &&
    (t.assignees.includes(currentUser.value?.email ?? '') || t.createdBy === currentUser.value?.uid)
  )
)

const doneTasks = computed(() =>
  tasks.value.filter(t =>
    (t.completedAt || pendingDone.value.has(t.id)) &&
    !pendingUndo.value.has(t.id)
  ).slice(0, 10)
)

const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }

function formatDue(d: Date | null) {
  if (!d) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

// Task in scadenza oggi
const dueTodayCount = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return myTasks.value.filter(t => t.dueDate && t.dueDate >= start && t.dueDate < end).length
})

// Completate di recente: collassabile, collassate di default
const showDone = ref(false)
</script>

<template>
  <div class="seq" ref="scrollEl">
    <MdPageHeader
      title="Azioni"
      :subtitle="dueTodayCount === 0
        ? 'Nessuna in scadenza oggi'
        : (dueTodayCount === 1 ? '1 in scadenza oggi' : dueTodayCount + ' in scadenza oggi')"
      sticky
      :hidden="headerHidden"
    />

    <div class="seq-content">
      <div v-if="tasksLoading" class="loading-rows">
        <div v-for="i in 4" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!myTasks.length" class="empty-state">
        <MIcon name="check_circle" filled :size="20" class="empty-state-icon" />
        Nessuna azione assegnata.
      </div>

      <div v-for="t in myTasks" :key="t.id" class="task-row" :style="{ borderLeftColor: prioColor[t.priority] }">
        <div class="checkbox" @click="doComplete(t)">
          <MIcon v-if="pendingDone.has(t.id)" name="check" :size="14" class="check-icon" />
        </div>
        <div class="row-title">{{ t.title }}</div>
        <div v-if="t.dueDate" class="row-due">
          <MIcon name="schedule" :size="12" />{{ formatDue(t.dueDate) }}
        </div>
      </div>

      <!-- Completate di recente: collassabile (memoria feedback_no_chevrons:
           niente chevron, lo stato espanso si segnala con bordo accent + bg) -->
      <button
        v-if="doneTasks.length"
        class="collapse-toggle"
        :class="{ 'is-open': showDone }"
        @click="showDone = !showDone"
      >
        <span>Completate di recente</span>
        <span class="collapse-count">{{ doneTasks.length }}</span>
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
  </div>
</template>

<style scoped>
.seq {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  height: 100%;
  width: 100%;
  overflow: auto;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .seq { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .seq { --page-bg: #0E0C07; }
}

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
}

.seq-content {
  padding: 16px;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
@media (min-width: 1024px) {
  .seq-content { padding: 24px 40px; max-width: 900px; }
}

.s-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9B9590;
  margin-bottom: 12px;
}

/* Loading */
.loading-rows { display: flex; flex-direction: column; gap: 6px; }

.row-skel {
  height: 56px; border-radius: 16px;
  background: color-mix(in srgb, var(--md-sys-color-outline-variant) 60%, transparent);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state { font-size: 14px; color: var(--md-sys-color-on-surface-variant); padding: 20px 0; }
.empty-state-icon { color: var(--md-sys-color-primary); margin-right: 6px; vertical-align: -4px; }

/* Task rows — card surface allineate al pattern NEBULA Docs */
.task-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-left: 6px solid transparent;
  margin-bottom: 10px;
  box-shadow: var(--md-sys-elevation-level-1);
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.task-row--done { opacity: 0.55; border-left: 6px solid var(--md-sys-color-outline-variant); }

.checkbox {
  width: 18px; height: 18px;
  border-radius: 5px;
  border: 1.5px solid var(--md-sys-color-outline);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: all 0.15s;
}

.checkbox:hover { border-color: var(--md-sys-color-primary); }
.check-icon { color: var(--md-sys-color-primary); }

.row-title { flex: 1; font-size: 14px; color: var(--md-sys-color-on-surface); }
.row-title--done { text-decoration: line-through; color: var(--md-sys-color-on-surface-variant); }

.row-due { font-size: 11px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

.undo-btn {
  background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
  display: flex; align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}

.undo-btn:hover { color: var(--md-sys-color-primary); }

/* Collapsible "Completate di recente": niente chevron (memoria
   feedback_no_chevrons). Stato aperto = bordo accent left + bg surface-container. */
.collapse-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  margin: 16px 0 8px;
  background: var(--md-sys-color-surface-container-low);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-left: 3px solid var(--md-sys-color-outline-variant);
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.collapse-toggle:hover {
  color: var(--md-sys-color-on-surface);
  border-color: color-mix(in srgb, var(--md-sys-color-primary) 30%, var(--md-sys-color-outline-variant));
}

.collapse-toggle.is-open {
  border-left-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-surface);
  background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
}

.collapse-count {
  background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  color: var(--md-sys-color-primary);
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: var(--md-sys-shape-corner-full);
  letter-spacing: 0;
}

.done-list { display: flex; flex-direction: column; }
</style>
