<script setup lang="ts">
/**
 * QUASAR · Quadranti — matrice di Eisenhower delle Azioni.
 * Porting del prototipo risorseesterneperclaude/cepheid-actions_8.html.
 * Piano e decisioni: docs/QUADRANTI.md.
 *
 * - Vista Task: 4 quadranti Agisci/Pianifica/Delega/Valuta (Urgenza × Importanza).
 * - Vista Risorse: stesso layout ma per carico-persona.
 * - Cursore temporale 0–14 gg: proietta lo stato "fra N giorni" (forecast incendi).
 * - Tutte le scritture passano da useAllTasks (single source of truth).
 */
import { ref, computed } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useAllTasks, type Task } from '../../composables/sidera/useAllTasks'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import { useQuadranti, type QuadId, type QuadTask } from '../../composables/quasar/useQuadranti'
import { useResourceLoad } from '../../composables/quasar/useResourceLoad'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { tasks, loading, completeTask, updateTask } = useAllTasks()
const { members } = useTeamMembers()

// ── Stato UI ────────────────────────────────────────────────────────────────
type ViewId = 'task' | 'resource'
const view = ref<ViewId>('task')
const viewTabs = [
  { id: 'task',     label: 'Azioni',  icon: 'grid_view' },
  { id: 'resource', label: 'Risorse', icon: 'group' },
]
// Titolo della card = nome della tab attiva.
const cardTitle = computed(() => (view.value === 'task' ? 'Azioni' : 'Risorse'))
const cursor = ref(0)               // giorni nel futuro (0..14)
const filterSector = ref('')        // categoria/settore, o '' = tutti

// Pillola FILTRO per settore (estetica/funzionamento = i tab Azioni/Risorse).
const sectorTabs = [
  { id: '',                label: 'Tutti',           icon: 'groups' },
  { id: 'direzione',       label: 'Direzione',       icon: 'workspace_premium' },
  { id: 'amministrazione', label: 'Amministrazione', icon: 'account_balance' },
  { id: 'commerciale',     label: 'Commerciale',     icon: 'handshake' },
  { id: 'produzione',      label: 'Produzione',      icon: 'build' },
  { id: 'logistica',       label: 'Logistica',       icon: 'local_shipping' },
]

// Email dei membri del settore selezionato (null = tutti) — usato dai composable.
const filterEmails = computed<Set<string> | null>(() => {
  if (!filterSector.value) return null
  // Set dual-key (email + uid) per la dual-tolleranza migrazione assignees:
  // i task possono avere assignees per email (legacy) o uid (nuovo). shownMembers
  // filtra i membri per m.email (sempre presente), quindi resta corretto.
  return new Set(
    members.value
      .filter(m => (m.category || 'amministrazione') === filterSector.value)
      .flatMap(m => (m.uid ? [m.email, m.uid] : [m.email])),
  )
})

const { quadrants, counts, q1Overloaded } = useQuadranti(tasks, cursor, filterEmails)
const { quadrants: rQuadrants, counts: rCounts } = useResourceLoad(tasks, members, cursor, filterEmails)

// Pillola CURSORE temporale condensata: oggi / +3gg / +7gg / +14gg (al posto
// della card "Ritorno al futuro" con lo slider). Va a sx delle altre pillole.
const cursorTabs = [
  { id: '0',  label: '',    icon: 'today' },   // solo icona calendario "oggi"
  { id: '3',  label: '+3' },
  { id: '7',  label: '+7' },
  { id: '14', label: '+14' },
]

// ── Metadati quadranti ────────────────────────────────────────────────────
const QUADS: { id: QuadId; name: string; sub: string }[] = [
  { id: 'q1', name: 'Agisci',    sub: 'urgente · importante' },
  { id: 'q2', name: 'Pianifica', sub: 'importante · non urgente' },
  { id: 'q3', name: 'Delega',    sub: 'urgente · non importante' },
  { id: 'q4', name: 'Valuta',    sub: 'non urgente · non importante' },
]
const RQUADS: { id: QuadId; name: string; sub: string }[] = [
  { id: 'q1', name: 'Sovraccarico', sub: 'carico alto · urgente' },
  { id: 'q2', name: 'In carico',    sub: 'carico alto · gestibile' },
  { id: 'q3', name: 'Allerta',      sub: 'carico lieve · urgente' },
  { id: 'q4', name: 'Disponibile',  sub: 'carico lieve · calmo' },
]
const EMPTY_T: Record<QuadId, string> = {
  q1: 'Nessuna urgenza importante. Stato raro, custodiscilo.', q2: 'Niente da pianificare', q3: 'Niente da delegare', q4: 'Niente da valutare',
}
const EMPTY_R: Record<QuadId, string> = {
  q1: 'Team in equilibrio', q2: 'Nessuno', q3: 'Nessuno', q4: 'Tutti impegnati',
}

// ── Header subtitle ─────────────────────────────────────────────────────────
const subtitle = computed(() => {
  if (view.value === 'resource') {
    const n = rCounts.value.q1
    return n === 0 ? 'Nessuna risorsa in sovraccarico' : n === 1 ? '1 risorsa in sovraccarico' : `${n} risorse in sovraccarico`
  }
  const n = counts.value.q1
  return n === 0 ? 'Nessuna azione da gestire subito' : n === 1 ? '1 azione da gestire subito' : `${n} azioni da gestire subito`
})

// ── Label giorni / finestra ──────────────────────────────────────────────────
function daysLabel(eff: number | null): string {
  if (eff === null) return 'senza scadenza'
  if (eff < 0) return 'scaduto'
  if (eff === 0) return 'oggi'
  return `fra ${eff === 1 ? '1 gg' : eff + ' gg'}`
}

// ── Azioni (tutte via useAllTasks) ───────────────────────────────────────────
const pendingDone = ref<Set<string>>(new Set())
function projectIdOf(t: Task): string | null { return t.projectId || null }

async function complete(t: Task) {
  if (pendingDone.value.has(t.id)) return
  pendingDone.value = new Set([...pendingDone.value, t.id])
  try { await completeTask(projectIdOf(t), t.id) }
  catch (e) { console.error('[QUASAR] complete error', e) }
}

// q2 "Pianifica": date picker inline → updateTask(dueDate)
const dateInputs = ref<Record<string, HTMLInputElement | null>>({})
function setDateRef(id: string, el: any) { dateInputs.value[id] = el as HTMLInputElement | null }
const todayIso = new Date().toISOString().slice(0, 10)
function openPicker(t: Task) {
  const el = dateInputs.value[t.id]
  if (!el) return
  if (el.showPicker) { try { el.showPicker() } catch { el.click() } } else el.click()
}
async function onPickDate(t: Task, val: string) {
  if (!val) return
  const [y, m, d] = val.split('-').map(Number)
  try { await updateTask(projectIdOf(t), t.id, { dueDate: new Date(y, m - 1, d) }) }
  catch (e) { console.error('[QUASAR] schedule error', e) }
}

// ── Modal compatto (Delega / Valuta / click titolo) — non distruttivo ────────
const showModal = ref(false)
const saving = ref(false)
const editing = ref<Task | null>(null)
const form = ref({
  title: '',
  priority: 'media' as 'alta' | 'media' | 'bassa',
  dueDate: '',
  assignees: [] as string[],
})
const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

function openModal(t: Task) {
  editing.value = t
  form.value = {
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString().split('T')[0]! : '',
    assignees: [...t.assignees],
  }
  showModal.value = true
}
function toggleAssignee(email: string) {
  const i = form.value.assignees.indexOf(email)
  if (i === -1) form.value.assignees.push(email)
  else form.value.assignees.splice(i, 1)
}
async function submit() {
  if (!editing.value || !form.value.title.trim() || saving.value) return
  saving.value = true
  try {
    const [y, m, d] = form.value.dueDate ? form.value.dueDate.split('-').map(Number) : [0, 0, 0]
    await updateTask(projectIdOf(editing.value), editing.value.id, {
      title: form.value.title.trim(),
      priority: form.value.priority,
      dueDate: form.value.dueDate ? new Date(y!, m! - 1, d!) : null,
      assignees: form.value.assignees,
    })
    showModal.value = false
  } catch (e) {
    console.error('[QUASAR] save error', e)
  } finally {
    saving.value = false
  }
}
async function completeFromModal() {
  if (!editing.value) return
  await complete(editing.value)
  showModal.value = false
}
</script>

<template>
  <div class="qd s-scope-quasar" ref="scrollEl">
    <!-- Header stile NEBULA Documenti: barra sticky a tutta larghezza (fondo card).
         Nello slot tools, a sx la pillola FILTRO settore, a dx la pillola TAB vista. -->
    <MdPageHeader title="Quadranti" :subtitle="subtitle" sticky borderless :hidden="headerHidden">
      <template #tools>
        <div class="qd-switchers">
          <CepheidViewSwitcher labels class="cursor-switcher" :model-value="String(cursor)" :tabs="cursorTabs" @update:model-value="(v) => (cursor = Number(v))" />
          <CepheidViewSwitcher :model-value="filterSector" :tabs="sectorTabs" @update:model-value="(v) => (filterSector = v)" />
          <CepheidViewSwitcher :model-value="view" :tabs="viewTabs" @update:model-value="(v) => (view = v as ViewId)" />
        </div>
      </template>
    </MdPageHeader>

    <div class="qd-content">
     <div class="panel">
      <h2 class="panel-title">{{ cardTitle }}</h2>

      <div v-if="loading" class="qd-loading">
        <div v-for="i in 4" :key="i" class="quad-skel" />
      </div>

      <!-- ── Vista Task ── -->
      <div v-else-if="view === 'task'" class="matrix">
        <div
          v-for="q in QUADS"
          :key="q.id"
          class="quad"
          :class="[q.id, { overloaded: q.id === 'q1' && q1Overloaded }]"
        >
          <div class="qhd">
            <div>
              <div class="qname">{{ q.name }}</div>
              <div class="qsub">{{ q.sub }}</div>
            </div>
            <span class="qcount">{{ counts[q.id] }}</span>
          </div>
          <div class="qlist">
            <div v-if="!quadrants[q.id].length" class="qempty">{{ EMPTY_T[q.id] }}</div>
            <div v-for="item in quadrants[q.id]" :key="item.task.id" class="acard">
              <span class="dot" :class="{ on: item.task.status === 'done' }" />
              <span class="acname" :title="item.task.title" @click="openModal(item.task)">{{ item.task.title }}</span>

              <span
                class="days"
                :class="{
                  urgent: (q.id === 'q1' || q.id === 'q3') && !item.forecast,
                  forecast: item.forecast,
                  muted: q.id === 'q4',
                }"
              >
                <MIcon v-if="item.forecast" name="schedule" :size="11" />{{ daysLabel(item.eff) }}
              </span>

              <!-- Azione per quadrante -->
              <button v-if="q.id === 'q1'" class="qaction q1-action" @click="complete(item.task)">
                <MIcon name="check" :size="13" /> Completa
              </button>
              <template v-else-if="q.id === 'q2'">
                <button class="qaction q2-action" @click="openPicker(item.task)">
                  <MIcon name="calendar_month" :size="13" /> Pianifica
                </button>
                <input
                  :ref="(el) => setDateRef(item.task.id, el)"
                  type="date"
                  class="sched-in"
                  :min="todayIso"
                  @change="onPickDate(item.task, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <button v-else-if="q.id === 'q3'" class="qaction q3-action" @click="openModal(item.task)">
                <MIcon name="arrow_forward" :size="13" /> Delega
              </button>
              <button v-else class="qaction q4-action" aria-label="Valuta" @click="openModal(item.task)">
                <MIcon name="more_horiz" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Vista Risorse ── -->
      <div v-else class="matrix">
        <div v-for="q in RQUADS" :key="q.id" class="quad" :class="q.id">
          <div class="qhd">
            <div>
              <div class="qname">{{ q.name }}</div>
              <div class="qsub">{{ q.sub }}</div>
            </div>
            <span class="qcount">{{ rCounts[q.id] }}</span>
          </div>
          <div class="qlist">
            <div v-if="!rQuadrants[q.id].length" class="qempty">{{ EMPTY_R[q.id] }}</div>
            <div v-for="r in rQuadrants[q.id]" :key="r.member.email" class="rcard" :class="{ forecast: r.forecast }">
              <div class="ravatar"><StarAvatar v-bind="starAvatarProps(r.member.email, members)" :size="38" /></div>
              <div class="rinfo">
                <div class="rname">{{ displayName(r.member.email, members) }}</div>
                <div class="rstats">{{ r.total }} task · {{ r.urg === 0 ? 'nessun urgente' : r.urg + (r.urg === 1 ? ' urgente' : ' urgenti') }}</div>
                <div class="rbar"><div class="rbar-fill" :style="{ width: r.barPct + '%' }" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
     </div>
    </div>

    <!-- Modal compatto (Delega / Valuta / modifica) — non elimina -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <span class="modal-title">Azione</span>
            <button class="modal-close" @click="showModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body">
            <label class="field-label">Titolo *</label>
            <input v-model="form.title" class="field-input" />

            <label class="field-label" style="margin-top:12px">Assegna a</label>
            <div class="assignees-chips">
              <div
                v-for="m in members"
                :key="m.email"
                class="assignee-chip"
                :class="{ 'is-selected': form.assignees.includes(m.email) }"
                :style="form.assignees.includes(m.email) ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' } : {}"
                @click="toggleAssignee(m.email)"
              >
                <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
                {{ displayName(m.email, members) }}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label">Priorità</label>
                <div class="prio-picker">
                  <button
                    v-for="p in prioOptions"
                    :key="p.id"
                    class="prio-opt"
                    :class="{ 'is-sel': form.priority === p.id }"
                    :style="form.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                    type="button"
                    @click="form.priority = p.id"
                  >
                    <span class="prio-dot" :style="{ background: p.color }" />{{ p.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="field-label">Scadenza</label>
                <input v-model="form.dueDate" type="date" class="field-input field-date" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" style="margin-right:auto" @click="completeFromModal">
              <MIcon name="check" :size="15" /> Completa
            </button>
            <button class="btn-ghost" @click="showModal = false">Annulla</button>
            <button class="btn-primary" :disabled="!form.title.trim() || saving" @click="submit">
              {{ saving ? 'Salvataggio…' : 'Salva' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.qd {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
  /* Pattern Cruscotto: scroll sul root, niente flex column + child scroll separati.
     Garantisce che il padding-bottom (110px+safe da SideraLayout) e il bg si
     applichino al container scrollabile, così l'ultimo item non finisce dietro la
     pillola fluttuante e il bg copre la zona della pillola. */
  height: 100%;
  overflow: auto;
}
.s-surface-dark .qd { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .qd { --page-bg: #0E0C07; } }
/* area contenuto della pagina */
.qd-content { padding: 16px; }
@media (min-width: 1024px) { .qd-content { padding: 24px 40px; } }

/* container card unico (rif. prototipo #ax): surface chiara su fondo crema */
.panel {
  max-width: 1000px;
  margin: 0 auto;
  background: #FFF8F0;
  border-radius: 16px;
  padding: 14px 16px 18px;
}
.s-surface-dark .panel { background: #16130B; }
@media (prefers-color-scheme: dark) { .panel { background: #16130B; } }
/* Header stile NEBULA Documenti: MdPageHeader sticky a tutta larghezza, fondo card
   #FFF8F0; su desktop il contenuto è allineato (gutter) alla larghezza del pannello. */
:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) { background: #FFF8F0; }
.s-surface-dark :deep(.md-page-header.is-sticky) { background: #16130B; }
@media (prefers-color-scheme: dark) { :deep(.md-page-header.is-sticky) { background: #16130B; } }
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 500px)) 18px; }
}
/* slot tools: pillola filtro settore (sx) + pillola tab vista (dx) */
.qd-switchers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
/* pillola giorni (labels): bottoni compatti come i "quadratini" icona delle
   pillole a fianco (padding come la variante non-labels). */
.cursor-switcher :deep(.vbtn) { padding: 0 5px; }

/* titolo della card = nome della tab attiva (Azioni / Risorse) */
.panel-title {
  font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; line-height: 1;
  color: var(--md-sys-color-on-surface); opacity: .9; margin: 2px 2px 14px;
}


/* ── Matrice ── */
/* dimensioni fisse (concept): q1 AGISCI top-left è più LARGO (col 1.15fr) e più
   ALTO (riga 1.35fr) degli altri. Overflow gestito dallo scroll interno di .qlist. */
.qd-loading, .matrix {
  display: grid; grid-template-columns: 1.15fr 1fr; grid-template-rows: 1.35fr 1fr; gap: 10px; height: 540px;
}
.quad-skel { border-radius: 12px; background: var(--md-sys-color-surface-variant); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
/* mobile: stack verticale, niente altezza fissa */
@media (max-width: 720px) {
  .qd-loading, .matrix { grid-template-columns: 1fr; grid-template-rows: none; height: auto; }
  .quad { min-height: 180px; }
}

/* fondo quadrante = colore del proprio titolo (q1 Agisci, q2 Pianifica, …) */
.quad { border-radius: 12px; padding: 12px 11px; display: flex; flex-direction: column; overflow: hidden; }
.quad.q1 { background: color-mix(in srgb, #C46030 16%, #F1E8D8); }
.quad.q2 { background: color-mix(in srgb, var(--md-sys-color-primary) 16%, #F1E8D8); }
.quad.q3 { background: color-mix(in srgb, #9A8070 16%, #F1E8D8); }
.quad.q4 { background: color-mix(in srgb, #7B8C9A 9%, #F1E8D8); }
.s-surface-dark .quad.q1 { background: color-mix(in srgb, #C46030 22%, #231E13); }
.s-surface-dark .quad.q2 { background: color-mix(in srgb, var(--md-sys-color-primary) 22%, #231E13); }
.s-surface-dark .quad.q3 { background: color-mix(in srgb, #9A8070 22%, #231E13); }
.s-surface-dark .quad.q4 { background: color-mix(in srgb, #7B8C9A 14%, #231E13); }

.qhd { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 9px; }
/* testo uniforme: stesso colore in tutti i quadranti, gerarchia solo per trasparenza */
.qname { font-family: 'Cormorant Garamond', serif; font-size: 20px; line-height: 1; color: var(--md-sys-color-on-surface); opacity: .9; }
.qsub { font-size: 8.5px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: var(--md-sys-color-on-surface); opacity: .55; margin-top: 3px; }
.qcount {
  font-size: 11px; font-weight: 500; color: var(--md-sys-color-on-surface-variant);
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 7%, transparent);
  border-radius: 999px; min-width: 20px; height: 19px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
}
/* riempie il quadrante a dimensione fissa; scrolla internamente se trabocca */
.qlist { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; margin: 0 -3px; padding: 0 3px; }
/* Empty state quadranti: tono grigio neutro uniforme su tutti e 4 i quadranti
   sia su vista Task che Risorse. L'override su Q1 azzurro è stato rimosso
   per coerenza visiva — le 8 stringhe empty hanno lo stesso peso. */
.qempty { font-size: 11px; color: var(--md-sys-color-on-surface-variant); opacity: .6; padding: 6px 2px; }

/* fuoco pulsante su q1 sovraccarico */
@keyframes firepulse { 0%, 100% { opacity: 1 } 50% { opacity: .4 } }
.quad.q1.overloaded .qname { animation: firepulse 1.3s ease infinite; }
.quad.q1.overloaded .qcount { background: color-mix(in srgb, #C8521A 18%, transparent); color: #C8521A; }

/* ── Card azione ── */
.acard {
  position: relative;
  background: #FFF8F0; border-radius: 9px;
  padding: 7px 9px; display: flex; align-items: center; gap: 8px;
}
.s-surface-dark .acard { background: #16130B; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--md-sys-color-outline); flex: 0 0 auto; }
.dot.on { background: var(--md-sys-color-primary); }
.acname { flex: 1; min-width: 0; font-size: 12px; color: var(--md-sys-color-on-surface); opacity: .9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.acname:hover { opacity: 1; color: var(--md-sys-color-primary); }
.days {
  font-size: 10px; font-weight: 500; flex: 0 0 auto; padding: 2px 7px; border-radius: 999px;
  background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);
  display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;
}
.days.urgent { background: color-mix(in srgb, #C8521A 14%, #FFF8F0); color: #C8521A; }
.days.forecast { background: transparent; color: #C8521A; border: 1px dashed #C8521A; }
.days.muted { opacity: .6; }
.s-surface-dark .days.urgent { background: color-mix(in srgb, #C8521A 22%, #16130B); }

.qaction {
  border: 0; border-radius: 999px; padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; flex: 0 0 auto; transition: all .15s;
}
.q1-action { background: color-mix(in srgb, #C46030 13%, #FFF8F0); color: #C46030; }
.q1-action:hover { background: #C46030; color: #fff; }
.q2-action { background: color-mix(in srgb, var(--md-sys-color-primary) 13%, #FFF8F0); color: var(--md-sys-color-primary); }
.q2-action:hover { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.q3-action { background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface); }
.q3-action:hover { background: var(--md-sys-color-outline-variant); }
.q4-action { background: transparent; border: 1px solid var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); width: 24px; height: 24px; border-radius: 50%; padding: 0; justify-content: center; }
.q4-action:hover { background: var(--md-sys-color-surface-variant); }
.sched-in { position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; }

/* ── Card risorsa ── */
.rcard { background: #FFF8F0; border-radius: 9px; padding: 9px 11px; display: flex; align-items: center; gap: 10px; }
.s-surface-dark .rcard { background: #16130B; }
.ravatar { flex: 0 0 auto; border-radius: 50%; }
.rcard.forecast .ravatar { animation: firepulse 2s ease infinite; }
.rinfo { flex: 1; min-width: 0; }
.rname { font-size: 12.5px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.rstats { font-size: 10.5px; color: var(--md-sys-color-on-surface-variant); margin-top: 2px; }
.rbar { height: 3px; background: var(--md-sys-color-surface-variant); border-radius: 999px; margin-top: 6px; overflow: hidden; }
.rbar-fill { height: 100%; border-radius: 999px; transition: width .35s ease; }
.quad.q1 .rbar-fill { background: #C46030; }
.quad.q2 .rbar-fill { background: var(--md-sys-color-primary); }
.quad.q3 .rbar-fill { background: #9A8070; }
.quad.q4 .rbar-fill { background: var(--md-sys-color-outline); }

/* ── Modal (allineato a CepheidActionsView) ── */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 100; }
.modal { position: absolute; bottom: 0; left: 0; right: 0; margin-left: auto; margin-right: auto; background: var(--md-sys-color-surface); border-radius: 20px 20px 0 0; width: 100%; max-width: 540px; max-height: 92dvh; padding-bottom: env(safe-area-inset-bottom); display: flex; flex-direction: column; font-family: 'Outfit', sans-serif; overflow: hidden; animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.modal-close { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 2px; }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.field-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); margin-bottom: 8px; }
.field-input { width: 100%; box-sizing: border-box; background: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; padding: 10px 14px; font-size: 14px; font-family: 'Outfit', sans-serif; color: var(--md-sys-color-on-surface); outline: none; transition: border-color .15s; }
.field-input:focus { border-color: var(--md-sys-color-primary); }
.field-date { color-scheme: light; }
.assignees-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.assignee-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 999px; font-size: 12px; font-weight: 500; color: var(--md-sys-color-on-surface-variant); cursor: pointer; background: var(--md-sys-color-surface); transition: all .15s; }
.prio-picker { display: flex; gap: 4px; }
.prio-opt { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; border: 1.5px solid var(--md-sys-color-outline-variant); border-radius: 8px; font-size: 12px; font-weight: 500; font-family: 'Outfit', sans-serif; cursor: pointer; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface-variant); }
.prio-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
.modal-footer { display: flex; gap: 8px; padding: 14px 20px 20px; border-top: 1px solid var(--md-sys-color-outline-variant); align-items: center; }
.btn-ghost { padding: 12px; background: none; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; font-size: 14px; font-weight: 500; cursor: pointer; color: var(--md-sys-color-on-surface-variant); font-family: 'Outfit', sans-serif; display: inline-flex; align-items: center; gap: 5px; }
.btn-primary { flex: 1; padding: 12px; background: var(--md-sys-color-primary); border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--md-sys-color-on-primary); font-family: 'Outfit', sans-serif; transition: background .15s; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
