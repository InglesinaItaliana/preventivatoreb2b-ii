<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useAllTasks }    from '../../composables/sidera/useAllTasks'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers } from '../../composables/sidera/useTeamMembers'
import { useProjects }    from '../../composables/sidera/useProjects'
import CepheidActionCard  from '../../components/cepheid/CepheidActionCard.vue'

const router = useRouter()

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { tasks, loading: tasksLoading, completeTask } = useAllTasks()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { projects } = useProjects()

function projectName(id: string | null) { return id ? (projects.value.find(p => p.id === id)?.name ?? '') : '' }
function projectColor(id: string | null) { return id ? (projects.value.find(p => p.id === id)?.color ?? '#7A8FA6') : '#7A8FA6' }

// ── Tasks ─────────────────────────────────────────────────────────────────
const pendingDone = ref<Set<string>>(new Set())

async function doComplete(t: { id: string; projectId: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.projectId, t.id)
}

// Solo le azioni affidate a me (assegnatario), non quelle che ho solo creato.
const myTasks = computed(() =>
  tasks.value.filter(t =>
    !t.completedAt &&
    !pendingDone.value.has(t.id) &&
    t.assignees.includes(currentUser.value?.email ?? '')
  )
)

// Back-link: apre la chat PULSAR da cui l'azione è stata creata.
function openSource(t: { sourceChatId: string | null; sourceMessageId: string | null }) {
  if (!t.sourceChatId) return
  router.push({
    path: '/pulsar/chat/' + t.sourceChatId,
    query: t.sourceMessageId ? { msg: t.sourceMessageId } : {},
  })
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

      <CepheidActionCard
        v-for="t in myTasks"
        :key="t.id"
        :task="t"
        :members="members"
        :current-user-email="currentUser?.email"
        :project-name="projectName(t.projectId)"
        :project-color="projectColor(t.projectId)"
        :show-project="!!t.projectId"
        hide-sole-self-assignee
        :pending="pendingDone.has(t.id)"
        :clickable="false"
        @toggle="doComplete(t)"
      >
        <template #trailing>
          <button
            v-if="t.sourceChatId"
            class="row-source"
            title="Apri la chat d'origine"
            @click.stop="openSource(t)"
          >
            <MIcon name="forum" :size="14" />
          </button>
        </template>
      </CepheidActionCard>
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.row-source {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; padding: 4px;
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface-variant); transition: background 0.15s, color 0.15s;
}
.row-source:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent); color: var(--md-sys-color-primary); }

.row-due { font-size: 11px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
</style>
