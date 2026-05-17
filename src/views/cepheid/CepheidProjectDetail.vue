<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import MIcon from '../../components/pulsar/MIcon.vue'
import { useProjects, DEFAULT_STATES } from '../../composables/sidera/useProjects'
import { useProjectTasks } from '../../composables/sidera/useProjectTasks'

const route = useRoute()
const projectId = route.params.id as string

const { projects } = useProjects()
const { tasks, loading, completeTask, uncompleteTask, updateTaskStatus } = useProjectTasks(projectId)

const project = computed(() => projects.value.find(p => p.id === projectId))
const states = computed(() => project.value?.states ?? DEFAULT_STATES)

// Raggruppo task per stato (esclude completedAt → quelle separate)
const grouped = computed(() => {
  const map: Record<string, typeof tasks.value> = {}
  for (const s of states.value) map[s.id] = []
  for (const t of tasks.value) {
    if (t.completedAt) continue
    if (!map[t.status]) map[t.status] = []
    map[t.status].push(t)
  }
  return map
})

const completedTasks = computed(() => tasks.value.filter(t => t.completedAt).slice(0, 20))

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

// Sposta task tra stati: click sul chip di stato apre dropdown semplice
const movingTaskId = ref('')
function openStatusMenu(id: string) {
  movingTaskId.value = movingTaskId.value === id ? '' : id
}
async function changeStatus(taskId: string, newStatus: string) {
  movingTaskId.value = ''
  await updateTaskStatus(taskId, newStatus)
}
</script>

<template>
  <div class="pd">
    <header class="pd-header" v-if="project">
      <div class="pd-stripe" :style="{ background: project.color }" />
      <div class="pd-titles">
        <h2 class="p-page-title">{{ project.name }}</h2>
        <p class="p-page-sub">{{ project.doneCount }}/{{ project.taskCount }} azioni · {{ pct(project) }}%</p>
      </div>
    </header>

    <div class="pd-content">
      <div v-if="loading" class="loading-rows">
        <div v-for="i in 3" :key="i" class="row-skel" />
      </div>

      <template v-else>
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

            <!-- Dropdown stato -->
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

        <!-- Completate -->
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
    </div>
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

.pd-titles { padding: 18px 20px 14px; flex: 1; }

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.p-page-sub { font-size: 12px; color: #9B9590; margin: 0; }

.pd-content { padding: 16px; }

.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 48px; border-radius: 10px; background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.state-section { margin-bottom: 18px; }

.state-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.state-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

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
  border-radius: 999px;
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
  box-shadow: 0 1px 2px rgba(0,0,0,.03);
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

.checkbox:hover { border-color: #D4A020; }
.check-icon { color: #D4A020; }

.row-title { flex: 1; font-size: 14px; min-width: 0; }
.row-title--done { text-decoration: line-through; color: #9B9590; }

.state-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  border-radius: 999px;
  border: none;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
}

.row-due { font-size: 11px; color: #9B9590; display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

.status-menu {
  position: absolute;
  right: 8px;
  top: 100%;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.10);
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
  color: #9B9590; padding: 2px; border-radius: 4px;
  display: flex; align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}

.undo-btn:hover { color: #8C6A14; }

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
  border-radius: 999px;
  letter-spacing: 0;
}

.done-list { display: flex; flex-direction: column; }
</style>
