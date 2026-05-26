<script setup lang="ts">
import { ref, computed } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidInboxCard from '../../components/cepheid/CepheidInboxCard.vue'
import { useAllTasks, type Task } from '../../composables/sidera/useAllTasks'
import { useProjects } from '../../composables/sidera/useProjects'
import { useTeamMembers } from '../../composables/sidera/useTeamMembers'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { tasks, loading, updateTask, deleteTask, fileStandaloneTask, attachToDeliverable } = useAllTasks()
const { activeProjects } = useProjects()
const { members } = useTeamMembers()

const inbox = computed(() =>
  tasks.value
    .filter(t => t.type === 'task' && !t.completedAt && t.triaged !== true)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))

const deliverables = computed(() => tasks.value.filter(t => t.type === 'deliverable'))
const milestones   = computed(() => tasks.value.filter(t => t.type === 'milestone'))
const projectsList = computed(() => activeProjects.value.map(p => ({ id: p.id, name: p.name })))

const top  = computed(() => inbox.value[0] ?? null)
const peek = computed(() => inbox.value[1] ?? null)

// progress di sessione
const processed = ref(0)
const total = computed(() => processed.value + inbox.value.length)
const progressPct = computed(() => total.value ? Math.round(processed.value / total.value * 100) : 0)

async function onSmista(task: Task, d: { assignees: string[]; priority: 'alta' | 'media' | 'bassa'; projectId: string; milestoneId: string; deliverableId: string }) {
  try {
    if (!task.projectId && d.projectId) {
      await fileStandaloneTask(task, d.projectId, d.deliverableId || null, d.milestoneId || null, { assignees: d.assignees, priority: d.priority })
    } else if (!task.projectId) {
      await updateTask(null, task.id, { assignees: d.assignees, priority: d.priority, triaged: true })
    } else {
      await updateTask(task.projectId, task.id, { assignees: d.assignees, priority: d.priority, triaged: true, milestoneId: d.deliverableId ? null : (d.milestoneId || null) })
      if (d.deliverableId) await attachToDeliverable(task.projectId, d.deliverableId, task.id)
    }
    processed.value++
  } catch (e) { console.error('[SMISTAMENTO] errore smista', e) }
}
async function onDelete(task: Task) {
  try { await deleteTask(task.projectId || null, task.id, !!task.completedAt); processed.value++ }
  catch (e) { console.error('[SMISTAMENTO] errore delete', e) }
}

</script>

<template>
  <div class="ib-page s-scope-cepheid" ref="scrollEl">
    <MdPageHeader
      title="Smistamento"
      :subtitle="inbox.length === 0
        ? 'Nessuna task da smistare'
        : (inbox.length === 1 ? '1 task da smistare' : inbox.length + ' task da smistare')"
      sticky
      :hidden="headerHidden"
    />

    <div class="ib-content">
     <div class="ib-inner">
      <!-- contatore + progress -->
      <div class="ib-progress">
        <div class="ib-progress-top">
          <span class="ib-count">{{ inbox.length }}</span>
          <span class="ib-count-lab">{{ inbox.length === 1 ? 'task da smistare' : 'task da smistare' }}</span>
          <span class="ib-progress-pct">{{ progressPct }}%</span>
        </div>
        <div class="ib-progress-track"><div class="ib-progress-fill" :style="{ width: progressPct + '%' }" /></div>
      </div>

      <div v-if="loading" class="ib-loading">Caricamento…</div>

      <!-- LYRA §6 — quiete inbox-zero: stella oro senza animazione, niente confetti -->
      <div v-else-if="!top" class="ib-fin">
        <div class="ib-rk"><MIcon name="star" filled :size="40" /></div>
        <div class="ib-ft">Inbox pulita</div>
        <div class="ib-fs">Tutto smistato. Il cielo è sereno.</div>
      </div>

      <!-- stack -->
      <div v-else class="ib-stack">
        <div v-if="peek" class="ib-peek">{{ peek.title }}</div>
        <CepheidInboxCard
          :key="top.id"
          :task="top"
          :projects="projectsList"
          :deliverables="deliverables"
          :milestones="milestones"
          :members="members"
          @smista="onSmista(top, $event)"
          @delete="onDelete(top)"
        />
      </div>
     </div>
    </div>
  </div>
</template>

<style scoped>
/* Pattern Cruscotto: scroll sul root → padding-bottom 110px+safe (da SideraLayout)
   lascia spazio alla pillola fluttuante e il bg copre la zona della pillola.
   overflow-x:hidden preserva il requisito originale (card in swipe non tagliata
   dai lati di un contenitore stretto).
   --page-bg letto da MdPageHeader.is-sticky per match-are il bg pagina. */
.ib-page { font-family: 'Outfit', sans-serif; color: var(--md-sys-color-on-surface); height: 100%; overflow-y: auto; overflow-x: hidden; --page-bg: #EFE7D9; background: var(--page-bg); }
.s-surface-dark .ib-page { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .ib-page { --page-bg: #0E0C07; } }

.ib-content { padding: 16px 0; }
.ib-inner { max-width: 560px; margin: 0 auto; padding: 0 16px; display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 700px) { .ib-inner { padding: 0 20px; } }

.ib-progress { flex-shrink: 0; }
.ib-progress-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ib-count { font-family: var(--md-sys-typescale-headline-small-font, serif); font-size: 32px; font-weight: 600; line-height: 1; color: var(--md-sys-color-on-surface); }
.ib-count-lab { font-size: 13px; color: var(--md-sys-color-on-surface-variant); flex: 1; }
.ib-progress-pct { font-size: 13px; font-weight: 600; color: var(--md-sys-color-primary); }
.ib-progress-track { height: 8px; border-radius: var(--md-sys-shape-corner-full); background: color-mix(in srgb, var(--md-sys-color-primary) 14%, var(--md-sys-color-surface-container-high)); overflow: hidden; }
.ib-progress-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary); transition: width .35s cubic-bezier(.2,0,0,1); }

.ib-loading { text-align: center; color: var(--md-sys-color-on-surface-variant); padding: 40px; }

.ib-stack { position: relative; }
.ib-peek { position: absolute; left: 10px; right: 10px; top: 10px; bottom: -8px; background: #FFF8F0; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 20px; z-index: 0; opacity: .55; transform: scale(.97); padding: 18px; font-size: 16px; color: var(--md-sys-color-on-surface-variant); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.s-surface-dark .ib-peek { background: #16130B; }
.ib-stack > :deep(.ic-card) { position: relative; z-index: 1; }

.ib-fin { position: relative; overflow: hidden; margin-top: 16px; padding: 36px 18px; border-radius: 20px; background: #FFF8F0; text-align: center; }
.s-surface-dark .ib-fin { background: #16130B; }
/* LYRA — stella oro CEPHEID quieta, glow soffuso senza animazione. */
.ib-rk { display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; color: #D4A020; filter: drop-shadow(0 0 10px rgba(212, 160, 32, 0.4)); }
.ib-ft { font-family: var(--md-sys-typescale-headline-small-font, serif); font-size: 24px; color: var(--md-sys-color-on-surface); }
.ib-fs { font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px; }
</style>
