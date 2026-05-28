<script setup lang="ts">
import { ref, computed } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useAllTasks }    from '../../composables/sidera/useAllTasks'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { tasks, loading: tasksLoading, completeTask } = useAllTasks()
const { currentUser } = useCurrentUser()

// ── Tasks ─────────────────────────────────────────────────────────────────
const pendingDone = ref<Set<string>>(new Set())

async function doComplete(t: { id: string; projectId: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.projectId, t.id)
}

const myTasks = computed(() =>
  tasks.value.filter(t =>
    !t.completedAt &&
    !pendingDone.value.has(t.id) &&
    (t.assignees.includes(currentUser.value?.email ?? '') || t.createdBy === currentUser.value?.uid)
  )
)

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

      <div v-for="t in myTasks" :key="t.id" class="task-row">
        <div class="checkbox" @click="doComplete(t)">
          <MIcon v-if="pendingDone.has(t.id)" name="check" :size="14" class="check-icon" />
        </div>
        <div class="row-title">{{ t.title }}</div>
        <div v-if="t.dueDate" class="row-due">
          <MIcon name="schedule" :size="12" />{{ formatDue(t.dueDate) }}
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

/* Header flat: stesso bg della pagina, niente bordo/ombra. */
:deep(.md-page-header) {
  padding: 18px 16px 14px;
  background: var(--page-bg);
  border-bottom: none;
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
  margin-bottom: 10px;
  /* Bordi, ombre e indicatore priorità rimossi per look piatto coerente. */
}

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

.row-due { font-size: 11px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
</style>
