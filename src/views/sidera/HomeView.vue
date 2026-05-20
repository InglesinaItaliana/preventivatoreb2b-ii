<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/pulsar/MIcon.vue'
import { usePopsMetrics }  from '../../composables/sidera/usePopsMetrics'
import { useAllTasks }     from '../../composables/sidera/useAllTasks'
import { useProjects }     from '../../composables/sidera/useProjects'
import { useCurrentUser }  from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarColor, avatarInitial } from '../../composables/sidera/useTeamMembers'
import { ref } from 'vue'

const router = useRouter()
const { daGestire, inProduzione, pronti, valorePipeline, urgenze, loading: metricsLoading } = usePopsMetrics()
const { tasks, loading: tasksLoading, completeTask } = useAllTasks()
const { projects, loading: projsLoading } = useProjects()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

// ── Greeting ──────────────────────────────────────────────────────────────
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Buongiorno'
  if (h >= 12 && h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
})

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
    .replace(/^\w/, c => c.toUpperCase())
)

const userName = computed(() => currentUser.value?.email ? displayName(currentUser.value.email, members.value) : '…')

// ── Azioni di oggi ────────────────────────────────────────────────────────
const pendingDone = ref<Set<string>>(new Set())

async function doComplete(t: { id: string; projectId: string }) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  await completeTask(t.projectId, t.id)
}

const azioniOggi = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setHours(23, 59, 59, 999)
  return tasks.value.filter(t =>
    !t.completedAt &&
    !pendingDone.value.has(t.id) &&
    t.dueDate && t.dueDate >= start && t.dueDate <= end &&
    (t.assignees.includes(currentUser.value?.email ?? '') || t.createdBy === currentUser.value?.uid)
  )
})

// ── Progetti attivi ───────────────────────────────────────────────────────
const activeProjects = computed(() =>
  projects.value.filter(p => !p.archived && p.active !== false).slice(0, 4)
)

function pct(p: { taskCount: number; doneCount: number }) {
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

function formatDue(d: Date | null) {
  if (!d) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

// ── Priorità ──────────────────────────────────────────────────────────────
const prioColor: Record<string, string> = { alta: '#C8521A', media: '#D4A020', bassa: '#7A8FA6' }
const prioLabel: Record<string, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

// ── Feed team reale ───────────────────────────────────────────────────────
interface FeedEvent {
  key: string
  actor: string
  action: string
  what: string
  when: Date
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)     return 'adesso'
  if (diff < 3_600_000)  return Math.floor(diff / 60_000) + 'm fa'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h fa'
  return Math.floor(diff / 86_400_000) + 'g fa'
}

const feedEvents = computed((): FeedEvent[] => {
  const events: FeedEvent[] = []

  for (const t of tasks.value) {
    if (t.createdByEmail && t.createdAt) {
      events.push({
        key:    'c-' + t.id,
        actor:  t.createdByEmail,
        action: 'ha creato',
        what:   t.title,
        when:   t.createdAt,
      })
    }
    if (t.completedBy && t.completedAt) {
      events.push({
        key:    'd-' + t.id,
        actor:  t.completedBy,
        action: 'ha completato',
        what:   t.title,
        when:   t.completedAt,
      })
    }
  }

  return events
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 6)
})

// ── KPI ───────────────────────────────────────────────────────────────────
function formatEuro(v: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

// ── Urgenze ───────────────────────────────────────────────────────────────
function urgenzaColor(giorni: number) {
  if (giorni <= 3) return '#C8521A'
  if (giorni <= 7) return '#C8821A'
  return 'var(--s-text-dim)'
}

function urgenzaLabel(giorni: number) {
  if (giorni <= 0) return 'Scaduto'
  if (giorni === 1) return 'Domani'
  return giorni + 'g'
}
</script>

<template>
  <div class="hv s-fade-in">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="hv-header">
      <h1 class="hv-greeting">{{ greeting }}, {{ userName }}.</h1>
      <p class="hv-subtitle">
        {{ todayLabel }}
        <template v-if="!tasksLoading">
          · {{ azioniOggi.length }} azioni per oggi
        </template>
      </p>
    </div>

    <!-- ── Le mie azioni — oggi ────────────────────────────────────── -->
    <section class="hv-section">
      <p class="s-label">Le mie azioni — oggi</p>

      <div v-if="tasksLoading" class="skeleton-rows">
        <div v-for="i in 3" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!azioniOggi.length" class="empty-today">
        Nessuna azione in scadenza oggi
      </div>

      <div
        v-for="t in azioniOggi"
        :key="t.id"
        class="azione-row"
        :style="{ borderLeftColor: prioColor[t.priority] }"
        @click="doComplete(t)"
      >
        <div class="checkbox" :class="{ 'is-checked': pendingDone.has(t.id) }">
          <MIcon v-if="pendingDone.has(t.id)" name="check" :size="12" :weight="700" class="check-icon" />
        </div>
        <div class="azione-title">{{ t.title }}</div>
        <span
          class="prio-pill"
          :style="{ color: prioColor[t.priority], background: prioColor[t.priority] + '14' }"
        >{{ prioLabel[t.priority] }}</span>
        <div v-for="email in t.assignees.slice(0,3)" :key="email" class="az-avatar"
          :style="{ background: avatarColor(email) + '20', border: '1.5px solid ' + avatarColor(email) + '60', color: avatarColor(email) }"
        >{{ avatarInitial(email, members) }}</div>
      </div>
    </section>

    <!-- ── Progetti attivi ─────────────────────────────────────────── -->
    <section class="hv-section">
      <p class="s-label">Progetti attivi</p>

      <div v-if="projsLoading" class="proj-grid">
        <div v-for="i in 4" :key="i" class="proj-skel" />
      </div>

      <div v-else-if="!activeProjects.length" class="empty-today">
        Nessun progetto attivo ancora.
      </div>

      <div v-else class="proj-grid">
        <div
          v-for="p in activeProjects"
          :key="p.id"
          class="proj-mini"
          @click="router.push('/sidera/projects/' + p.id)"
        >
          <div class="proj-stripe" :style="{ background: p.color }" />
          <div class="proj-inner">
            <div class="proj-mini-top">
              <span class="proj-mini-name">{{ p.name }}</span>
              <span class="proj-mini-pct" :style="{ color: p.color }">{{ pct(p) }}%</span>
            </div>
            <div class="prog-track">
              <div class="prog-fill" :style="{ width: pct(p) + '%', background: p.color }" />
            </div>
            <div class="proj-mini-info">
              <MIcon name="schedule" :size="13" class="clock-icon" />
              {{ p.doneCount }}/{{ p.taskCount }} azioni
              <template v-if="p.dueDate"> · {{ formatDue(p.dueDate) }}</template>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── POPS KPI strip ─────────────────────────────────────────── -->
    <div class="pops-strip">
      <a href="https://b2b.inglesinaitaliana.it" target="_blank" rel="noopener noreferrer" class="kpi-card">
        <div class="kpi-label">Da gestire</div>
        <div class="kpi-value" style="color:#C8521A">
          <span v-if="metricsLoading" class="kpi-skeleton" />
          <span v-else>{{ daGestire }}</span>
        </div>
        <div class="kpi-sub">Preventivi · Ordini</div>
      </a>
      <a href="https://b2b.inglesinaitaliana.it" target="_blank" rel="noopener noreferrer" class="kpi-card">
        <div class="kpi-label">In produzione</div>
        <div class="kpi-value" style="color:var(--s-green)">
          <span v-if="metricsLoading" class="kpi-skeleton" />
          <span v-else>{{ inProduzione }}</span>
        </div>
        <div class="kpi-sub">Firmati · Lavorazione</div>
      </a>
      <a href="https://b2b.inglesinaitaliana.it" target="_blank" rel="noopener noreferrer" class="kpi-card">
        <div class="kpi-label">Pronti</div>
        <div class="kpi-value" style="color:#4A6B8A">
          <span v-if="metricsLoading" class="kpi-skeleton" />
          <span v-else>{{ pronti }}</span>
        </div>
        <div class="kpi-sub">Da spedire</div>
      </a>
      <a href="https://b2b.inglesinaitaliana.it" target="_blank" rel="noopener noreferrer" class="kpi-card">
        <div class="kpi-label">Valore pipeline</div>
        <div class="kpi-value kpi-value--sm" style="color:var(--s-green)">
          <span v-if="metricsLoading" class="kpi-skeleton kpi-skeleton--wide" />
          <span v-else>{{ formatEuro(valorePipeline) }}</span>
        </div>
        <div class="kpi-sub">Ordini attivi</div>
      </a>
    </div>

    <!-- ── Bottom grid ────────────────────────────────────────────── -->
    <div class="hv-grid">

      <!-- Urgenze produzione -->
      <div>
        <p class="s-label">Urgenze produzione</p>
        <div v-if="metricsLoading" class="skeleton-rows">
          <div v-for="i in 3" :key="i" class="row-skel" />
        </div>
        <div v-else-if="!urgenze.length" class="empty-today">Nessuna urgenza al momento.</div>
        <a
          v-for="u in urgenze"
          :key="u.commessa || u.codice"
          href="https://b2b.inglesinaitaliana.it"
          target="_blank"
          rel="noopener noreferrer"
          class="urgenza-card"
          :style="{ borderLeftColor: urgenzaColor(u.giorniRimasti) }"
        >
          <div class="urgenza-info">
            <div class="urgenza-commessa">{{ u.commessa || u.codice }}</div>
            <div class="urgenza-cliente">{{ u.cliente }}</div>
          </div>
          <div class="urgenza-badge" :style="{ color: urgenzaColor(u.giorniRimasti), background: urgenzaColor(u.giorniRimasti) + '14' }">
            {{ urgenzaLabel(u.giorniRimasti) }}
          </div>
        </a>
      </div>

      <!-- Aggiornamenti team -->
      <div>
        <p class="s-label">Aggiornamenti team</p>
        <div v-if="tasksLoading" class="skeleton-rows">
          <div v-for="i in 4" :key="i" class="row-skel row-skel--feed" />
        </div>
        <div v-else-if="!feedEvents.length" class="empty-today">Nessuna attività recente.</div>
        <div v-for="e in feedEvents" :key="e.key" class="feed-item">
          <div
            class="feed-avatar"
            :style="{ background: avatarColor(e.actor) + '18', border: '1.5px solid ' + avatarColor(e.actor) + '40', color: avatarColor(e.actor) }"
          >{{ avatarInitial(e.actor, members) }}</div>
          <div>
            <div class="feed-text">
              <span class="feed-who">{{ displayName(e.actor, members) }}</span>
              {{ e.action }}
              <span class="feed-what">{{ e.what }}</span>
            </div>
            <div class="feed-when">{{ timeAgo(e.when) }}</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.hv {
  height: 100%;
  overflow: auto;
  padding: 40px 52px;
  background: var(--s-bg);
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

/* ── Header ── */
.hv-header { margin-bottom: 36px; }

.hv-greeting {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 5px;
  line-height: 1.2;
}

.hv-subtitle { font-size: 13px; color: var(--s-text-dim); letter-spacing: 0.02em; }

/* ── Section ── */
.hv-section { margin-bottom: 36px; }

.s-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  margin-bottom: 14px;
}

/* ── Skeleton ── */
.skeleton-rows { display: flex; flex-direction: column; gap: 6px; }

.row-skel {
  height: 44px;
  background: var(--s-surface);
  border-radius: 9px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.row-skel--feed { height: 36px; }

@keyframes s-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* ── Empty ── */
.empty-today {
  font-size: 13px;
  color: var(--s-text-dim);
  padding: 12px 0;
}

/* ── Azione row ── */
.azione-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: var(--s-surface);
  border-radius: 9px;
  border: 1px solid var(--s-border);
  border-left: 6px solid transparent;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: var(--md-sys-elevation-level-1);
}

.azione-row:hover { border-color: var(--s-border-mid); box-shadow: var(--s-shadow-hover); }

.checkbox {
  width: 17px; height: 17px;
  border-radius: 5px;
  border: 1.5px solid var(--s-border-mid);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.15s;
}

.checkbox:hover { border-color: var(--module-accent); }
.checkbox.is-checked { background: var(--module-accent); border-color: var(--module-accent); }
.check-icon { width: 10px; height: 10px; color: white; stroke-width: 3; }

.azione-title { flex: 1; font-size: 13.5px; color: var(--s-text); }

.prio-pill {
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 20px;
  letter-spacing: 0.03em; flex-shrink: 0;
}

.az-avatar {
  width: 26px; height: 26px; border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.02em; flex-shrink: 0;
}

/* ── Progetti mini ── */
.proj-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.proj-skel {
  height: 100px;
  background: var(--s-surface);
  border-radius: 10px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.proj-mini {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: var(--s-shadow);
  position: relative;
  overflow: hidden;
}

.proj-mini:hover { box-shadow: var(--s-shadow-hover); border-color: var(--s-border-mid); transform: translateY(-1px); }

.proj-stripe {
  position: absolute; top: 0; left: 0; right: 0;
  height: 3px; border-radius: 10px 10px 0 0;
}

.proj-inner { padding: 14px 14px 12px; padding-top: 16px; }

.proj-mini-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.proj-mini-name { font-size: 12.5px; font-weight: 500; }
.proj-mini-pct  { font-size: 11px; font-weight: 700; }

.prog-track { height: 3px; border-radius: 2px; background: var(--s-border); overflow: hidden; margin-bottom: 8px; }
.prog-fill  { height: 100%; border-radius: 2px; transition: width 0.4s ease; }

.proj-mini-info { font-size: 11px; color: var(--s-text-dim); display: flex; align-items: center; gap: 4px; }

.clock-icon { width: 10px; height: 10px; }

/* ── POPS strip ── */
.pops-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 36px;
}

.kpi-card {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 18px 20px;
  text-decoration: none;
  color: inherit;
  box-shadow: var(--s-shadow);
  transition: all 0.15s;
  display: block;
}

.kpi-card:hover { border-color: var(--s-border-mid); box-shadow: var(--s-shadow-hover); transform: translateY(-1px); }

.kpi-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--s-text-dim); text-transform: uppercase; margin-bottom: 8px; }

.kpi-value { font-size: 32px; font-weight: 300; line-height: 1; margin-bottom: 6px; font-family: 'Outfit', sans-serif; }
.kpi-value--sm { font-size: 22px; }

.kpi-sub { font-size: 11px; color: var(--s-text-dim); }

.kpi-skeleton {
  display: inline-block; width: 40px; height: 32px;
  background: var(--s-border); border-radius: 6px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.kpi-skeleton--wide { width: 90px; height: 22px; }

/* ── Bottom grid ── */
.hv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 36px;
}

/* ── Urgenze ── */
.urgenza-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-left: 6px solid transparent;
  border-radius: 9px;
  margin-bottom: 7px;
  text-decoration: none;
  color: inherit;
  transition: all 0.15s;
  box-shadow: var(--md-sys-elevation-level-1);
}

.urgenza-card:hover { border-color: var(--s-border-mid); box-shadow: var(--s-shadow-hover); }

.urgenza-commessa { font-size: 13px; font-weight: 500; color: var(--s-text); margin-bottom: 2px; }
.urgenza-cliente  { font-size: 11px; color: var(--s-text-dim); }

.urgenza-badge {
  font-size: 11px; font-weight: 700;
  padding: 3px 9px; border-radius: 20px;
  flex-shrink: 0; letter-spacing: 0.02em;
}

/* ── Feed ── */
.feed-item { display: flex; gap: 10px; margin-bottom: 14px; }

.feed-avatar {
  width: 28px; height: 28px; border-radius: var(--md-sys-shape-corner-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; letter-spacing: 0.02em; flex-shrink: 0;
}

.feed-text { font-size: 12px; line-height: 1.6; color: var(--s-text-mid); }
.feed-who  { color: var(--s-text); font-weight: 600; }
.feed-what { color: var(--s-green-text); font-weight: 500; }
.feed-when { font-size: 10px; color: var(--s-text-dim); margin-top: 1px; }
</style>
