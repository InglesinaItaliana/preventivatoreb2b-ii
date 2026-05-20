<script setup lang="ts">
import { ref, computed } from 'vue'
import MIcon from '../../components/pulsar/MIcon.vue'
import { useAllTasks }    from '../../composables/sidera/useAllTasks'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

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
  <div class="seq">
    <header class="seq-header">
      <h2 class="p-page-title">Azioni</h2>
      <p class="p-page-sub">
        {{ dueTodayCount === 0
          ? 'Nessuna in scadenza oggi'
          : (dueTodayCount === 1 ? '1 in scadenza oggi' : dueTodayCount + ' in scadenza oggi') }}
      </p>
    </header>

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

      <!-- Completate di recente: collassabile -->
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
  </div>
</template>

<style scoped>
.seq {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  min-height: calc(100vh - 120px);
}

/* Page header */
.seq-header {
  padding: 18px 20px 14px;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
}

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

.seq-content { padding: 20px 16px; }

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
  height: 48px; border-radius: 10px;
  background: #E8E5DF;
  animation: pulse 1.4s ease-in-out infinite;
}

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

.row-title { flex: 1; font-size: 14px; color: #1A1917; }
.row-title--done { text-decoration: line-through; color: #9B9590; }

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

.collapse-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

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
</style>
