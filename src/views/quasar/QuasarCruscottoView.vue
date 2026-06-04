<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import { usePopsMetrics }  from '../../composables/sidera/usePopsMetrics'
import { useAllTasks }     from '../../composables/sidera/useAllTasks'
import { useProjects }     from '../../composables/sidera/useProjects'
import { useCurrentUser }  from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import { useActivityLog, type ActivityEvent } from '../../composables/quasar/useActivityLog'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { ref, onMounted } from 'vue'

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

// Solo il nome (no cognome): firstName del membro, fallback al primo token del displayName.
const userName = computed(() => {
  const email = currentUser.value?.email
  if (!email) return '…'
  const m = members.value.find(x => x.email === email)
  if (m?.firstName) return m.firstName
  return displayName(email, members.value).split(' ')[0] ?? ''
})

// ── Intro animata (solo prima apertura di sessione) ──────────────────────
// Flusso: overlay con "Buongiorno, {nome}" centrato e ingrandito → dopo 2s
// fade-out + cascata d'entrata asimmetrica dei widget figli (.hv-section,
// .pops-strip, .hv-grid). Il flag in sessionStorage evita che si replichi
// al refresh nella stessa sessione del browser.
const SESSION_KEY = 'quasar-greeting-played'
const introActive = ref(false)        // overlay visibile?
const introCollapsed = ref(false)     // overlay in fase di dissolvenza/scala?
const cascadeReady = ref(false)       // children entrano in cascata?

onMounted(() => {
  // Skip animazione se già giocata in questa sessione (refresh, nav back).
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1') {
    cascadeReady.value = true
    return
  }
  introActive.value = true
  // 2000ms full center, poi collapse → fade-out + i children iniziano.
  setTimeout(() => {
    introCollapsed.value = true
    cascadeReady.value = true
  }, 2000)
  // 2700ms: overlay completamente fuori → marca played.
  setTimeout(() => {
    introActive.value = false
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
  }, 2700)
})

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
// Tutti i progetti attivi (niente cap): la griglia va a capo e si vedono tutti
// scrollando la pagina.
const activeProjects = computed(() =>
  projects.value.filter(p => !p.archived && p.active !== false)
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

// ── Feed Attività ─────────────────────────────────────────────────────────
// Mostriamo gli ultimi eventi dal registro `activityLog` (scritto dalle Cloud
// Functions, single-source-of-truth condivisa con QuasarAttivitaView). In
// passato qui era un feed locale derivato da tasks (create/complete): è stato
// rimpiazzato per allinearsi al registro completo.
const { events: activityEvents, loading: feedLoading } = useActivityLog(8)

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)     return 'adesso'
  if (diff < 3_600_000)  return Math.floor(diff / 60_000) + 'm fa'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h fa'
  return Math.floor(diff / 86_400_000) + 'g fa'
}

// Risoluzione attore: stessa priorità di QuasarAttivitaView per coerenza
// (team member email/uid → actorName → email → "Inglesina Italiana").
function resolveMember(e: ActivityEvent) {
  if (e.actorEmail) return members.value.find(m => m.email === e.actorEmail) ?? null
  if (e.actorUid)   return members.value.find(m => m.uid === e.actorUid) ?? null
  return null
}
function actorLabel(e: ActivityEvent): string {
  const m = resolveMember(e)
  if (m) return displayName(m.email, members.value)
  if (e.actorName) return e.actorName
  if (e.actorEmail) return displayName(e.actorEmail, members.value)
  return 'Inglesina Italiana'
}
// Tone/icon helpers replicati dalla view Attività: stesso vocabolario visivo.
function iconFor(e: ActivityEvent): string {
  if (e.eventType === 'completed') return 'check'
  if (e.eventType === 'confirmed') return 'shopping_cart'
  return e.icon
}
function toneFor(e: ActivityEvent): string {
  return e.eventType === 'in_produzione' ? 'gold' : e.tone
}

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
  <div class="hv s-fade-in" :class="{ 'hv-cascade': cascadeReady }">

    <!-- Intro overlay (solo prima apertura di sessione): grande centrato, 2s, poi
         dissolvenza/scale. Mentre è visibile, l'header normale è opacità 0 e
         viene rivelato dalla cascata, evitando il doppio greeting. -->
    <div
      v-if="introActive"
      class="hv-intro-overlay"
      :class="{ 'hv-intro-collapse': introCollapsed }"
    >
      <h1 class="hv-intro-greeting">{{ greeting }}, {{ userName }}.</h1>
    </div>

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="hv-header" data-stagger="0">
      <h1 class="hv-greeting">{{ greeting }}, {{ userName }}.</h1>
      <p class="hv-subtitle">
        {{ todayLabel }}
        <template v-if="!tasksLoading">
          · {{ azioniOggi.length }} azioni per oggi
        </template>
      </p>
    </div>

    <!-- ── Le mie azioni — oggi ────────────────────────────────────── -->
    <section class="hv-section" data-stagger="1">
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
        <StarAvatar v-for="email in t.assignees.slice(0,3)" :key="email" v-bind="starAvatarProps(email, members)" :size="24" />
      </div>
    </section>

    <!-- ── Progetti attivi ─────────────────────────────────────────── -->
    <section class="hv-section" data-stagger="2">
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
    <div class="pops-strip" data-stagger="3">
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
    <div class="hv-grid" data-stagger="4">

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

      <!-- Attività — feed in tempo reale (stessa sorgente di /quasar/attivita) -->
      <div>
        <p class="s-label">Attività</p>
        <div v-if="feedLoading" class="skeleton-rows">
          <div v-for="i in 4" :key="i" class="row-skel row-skel--feed" />
        </div>
        <div v-else-if="!activityEvents.length" class="empty-today">Nessuna attività recente.</div>
        <div v-for="e in activityEvents" :key="e.id" class="feed-item">
          <!-- Team member → StarAvatar, altrimenti pallino tonato con icona evento -->
          <StarAvatar
            v-if="resolveMember(e)"
            v-bind="starAvatarProps(resolveMember(e)!.email, members)"
            :size="32"
          />
          <div v-else class="feed-node" :class="`feed-node--${toneFor(e)}`">
            <MIcon :name="iconFor(e)" :size="16" />
          </div>
          <div class="feed-body">
            <div class="feed-text">
              <span class="feed-who">{{ actorLabel(e) }}</span>
              {{ e.verb }}
              <span class="feed-what">«{{ e.objectLabel }}»</span>
            </div>
            <div class="feed-meta">
              <span
                class="feed-sys"
                :class="e.system === 'SIDERA' ? 'feed-sys--sidera' : 'feed-sys--pops'"
              >{{ e.system }}</span>
              · {{ timeAgo(e.ts) }}
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* QUASAR palette: bg #EFE7D9 crema · panel #FFF8F0 off-white · accent #98C0D0.
   Match QuasarQuadrantiView / QuasarAttivitaView. */
.hv {
  height: 100%;
  overflow: auto;
  background: #EFE7D9;
  padding: 24px 40px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
}

@media (max-width: 768px) {
  .hv { padding: 16px; }
}

/* ── Intro animata (prima apertura sessione) ───────────────────────────── */
/* Overlay full-page centrato per il greeting iniziale. */
.hv-intro-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #EFE7D9;
  z-index: 50;
  opacity: 1;
  transition: opacity 600ms cubic-bezier(.4, 0, .2, 1);
  pointer-events: none;
}
.hv-intro-greeting {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: clamp(40px, 7vw, 72px);
  letter-spacing: -0.01em;
  color: var(--md-sys-color-on-surface);
  margin: 0;
  text-align: center;
  padding: 0 24px;
  /* Fade-in iniziale */
  animation: hvIntroFadeIn 500ms cubic-bezier(.2, .8, .2, 1) both;
  transform-origin: center center;
  transition: transform 700ms cubic-bezier(.2, .8, .2, 1);
}
/* Fase collapse: la scritta si rimpicciolisce verso la posizione naturale e
   l'overlay svanisce. Niente FLIP perché basta il sense of motion: la scritta
   "vola via" mentre i widget compaiono. */
.hv-intro-collapse {
  opacity: 0;
}
.hv-intro-collapse .hv-intro-greeting {
  transform: scale(0.42) translateY(-10vh);
}
@keyframes hvIntroFadeIn {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}

/* ── Cascata d'entrata dei widget figli ─────────────────────────────────── */
/* Stato di partenza: tutti i diretti figli con data-stagger nascosti. */
.hv [data-stagger] {
  opacity: 0;
  transform: translateY(14px);
}
/* Quando la classe .hv-cascade è attiva, i figli entrano con delay asimmetrico
   ispirato alla sequenza golden-ratio (~1.618), non a multipli regolari. */
.hv-cascade [data-stagger] {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 540ms cubic-bezier(.25, .9, .35, 1),
    transform 540ms cubic-bezier(.25, .9, .35, 1);
}
.hv-cascade [data-stagger="0"] { transition-delay: 0ms; }
.hv-cascade [data-stagger="1"] { transition-delay: 180ms; }
.hv-cascade [data-stagger="2"] { transition-delay: 320ms; }
.hv-cascade [data-stagger="3"] { transition-delay: 510ms; }
.hv-cascade [data-stagger="4"] { transition-delay: 680ms; }

/* Accessibilità: utenti con reduce-motion vedono tutto subito senza animazioni. */
@media (prefers-reduced-motion: reduce) {
  .hv [data-stagger] { opacity: 1 !important; transform: none !important; transition: none !important; }
  .hv-intro-overlay { display: none; }
}

/* ── Header ── */
.hv-header { margin-bottom: 24px; }

.hv-greeting {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 5px;
  line-height: 1.2;
  color: var(--md-sys-color-on-surface);
  opacity: 0.92;
}

.hv-subtitle {
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
  letter-spacing: 0.02em;
}

/* ── Section ── Card panel attorno a ogni gruppo di contenuto */
.hv-section {
  background: #FFF8F0;
  border-radius: 16px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.s-label {
  font-family: 'Cormorant Garamond', serif;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--md-sys-color-on-surface);
  opacity: 0.85;
  margin: 0 0 14px;
  text-transform: none;
}

/* ── Skeleton ── */
.skeleton-rows { display: flex; flex-direction: column; gap: 6px; }

.row-skel {
  height: 44px;
  background: rgba(0, 0, 0, 0.04);
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
  color: var(--md-sys-color-on-surface-variant);
  padding: 12px 0;
}

/* ── Azione row ── */
.azione-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #FFF8F0;
  border-radius: 9px;
  border-left: 5px solid transparent;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.azione-row:hover {
  background: color-mix(in srgb, #98C0D0 8%, #FFF8F0);
}

.checkbox {
  width: 17px; height: 17px;
  border-radius: 4px;
  border: 1.5px solid var(--md-sys-color-outline);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.15s;
}

.checkbox:hover { border-color: #98C0D0; }
.checkbox.is-checked { background: #98C0D0; border-color: #98C0D0; }
.check-icon { width: 10px; height: 10px; color: white; stroke-width: 3; }

.azione-title {
  flex: 1;
  font-size: 13.5px;
  color: var(--md-sys-color-on-surface);
}

.prio-pill {
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px;
  letter-spacing: 0.03em; flex-shrink: 0;
}

/* ── Progetti mini ── */
.proj-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

@media (max-width: 1024px) {
  .proj-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .proj-grid { grid-template-columns: 1fr; }
}

.proj-skel {
  height: 100px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 9px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.proj-mini {
  background: #FFF8F0;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
  overflow: hidden;
}

.proj-mini:hover {
  background: color-mix(in srgb, #98C0D0 8%, #FFF8F0);
}

.proj-stripe {
  position: absolute; top: 0; left: 0; right: 0;
  height: 3px;
  border-top-left-radius: 9px;
  border-top-right-radius: 9px;
}

.proj-inner { padding: 14px 14px 12px; padding-top: 16px; }

.proj-mini-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.proj-mini-name { font-size: 12.5px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.proj-mini-pct  { font-size: 11px; font-weight: 700; }

.prog-track { height: 3px; border-radius: 2px; background: var(--md-sys-color-outline-variant); overflow: hidden; margin-bottom: 8px; }
.prog-fill  { height: 100%; border-radius: 2px; transition: width 0.4s ease; }

.proj-mini-info { font-size: 11px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 4px; }

.clock-icon { width: 10px; height: 10px; }

/* ── POPS KPI strip ── */
.pops-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

@media (max-width: 1024px) {
  .pops-strip { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .pops-strip { grid-template-columns: 1fr; }
}

.kpi-card {
  background: #FFF8F0;
  border-radius: 16px;
  padding: 18px 20px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
  display: block;
}

.kpi-card:hover {
  background: color-mix(in srgb, #98C0D0 8%, #FFF8F0);
}

.kpi-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--md-sys-color-on-surface-variant);
  text-transform: uppercase; margin-bottom: 8px;
}

.kpi-value { font-size: 32px; font-weight: 300; line-height: 1; margin-bottom: 6px; font-family: 'Outfit', sans-serif; }
.kpi-value--sm { font-size: 22px; }

.kpi-sub { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }

.kpi-skeleton {
  display: inline-block; width: 40px; height: 32px;
  background: rgba(0, 0, 0, 0.06); border-radius: 4px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

.kpi-skeleton--wide { width: 90px; height: 22px; }

/* ── Bottom grid ── */
.hv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 1024px) {
  .hv-grid { grid-template-columns: 1fr; }
}

.hv-grid > div {
  background: #FFF8F0;
  border-radius: 16px;
  padding: 18px 20px;
}

/* ── Urgenze ── */
.urgenza-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  background: #FFF8F0;
  border-left: 5px solid transparent;
  border-radius: 9px;
  margin-bottom: 7px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
}

.urgenza-card:hover {
  background: color-mix(in srgb, #98C0D0 8%, #FFF8F0);
}

.urgenza-commessa { font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface); margin-bottom: 2px; }
.urgenza-cliente  { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }

.urgenza-badge {
  font-size: 11px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px;
  flex-shrink: 0; letter-spacing: 0.02em;
}

/* ── Feed Attività ── */
.feed-item { display: flex; gap: 10px; margin-bottom: 14px; align-items: center; }
.feed-body { min-width: 0; flex: 1; }

.feed-text { font-size: 12px; line-height: 1.6; color: var(--md-sys-color-on-surface); }
.feed-who  { color: var(--md-sys-color-on-surface); font-weight: 600; }
.feed-what { color: #98C0D0; font-weight: 500; }

/* Meta-line: badge sistema (SIDERA/POPS) + tempo relativo. Stessi colori-firma
   della view Attività per coerenza visiva tra widget compatto e feed esteso. */
.feed-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; color: var(--md-sys-color-on-surface-variant);
  margin-top: 1px;
}
.feed-sys {
  font-size: 9px; font-weight: 600; letter-spacing: .7px;
  text-transform: uppercase; padding: 2px 6px; border-radius: 999px;
  line-height: 1;
}
.feed-sys--sidera { background: color-mix(in srgb, #D4C498 28%, transparent); color: #8a7633; }
.feed-sys--pops   { background: color-mix(in srgb, #FBBF24 26%, transparent); color: #9a6b0c; }

/* Pallino tonato per eventi senza un team-member (sistema / cliente POPS).
   Replica condensata dei .node di QuasarAttivitaView, dimensione 32 per
   allinearsi all'avatar. */
.feed-node {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
  background: var(--md-sys-color-surface);
}
.feed-node--gold    { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.feed-node--neutral { background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant); border: 1px solid var(--md-sys-color-outline-variant); }
.feed-node--red     { background: #E5534B; color: #fff; }
</style>
