<script lang="ts">
import { ref as _ref } from 'vue'
// accordion condiviso fra tutte le card: id del progetto attualmente espanso (una sola card aperta)
const _openCard = _ref<string | null>(null)
</script>

<script setup lang="ts">
import { ref, reactive, toRef, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import MIcon from '../shared/MIcon.vue'
import CepheidTimelinePhase from './CepheidTimelinePhase.vue'
import CepheidTimelineMilestone from './CepheidTimelineMilestone.vue'
import CepheidTimelineTaskRow from './CepheidTimelineTaskRow.vue'
import type { TeamMember } from '../../composables/sidera/useTeamMembers'
import type { ProjectTask } from '../../composables/sidera/useProjectTasks'
import type { Project } from '../../composables/sidera/useProjects'
import { useProjectTimeline, fmt, addD, range, isoOf, type PhaseVM } from '../../composables/cepheid/useProjectTimeline'

const props = defineProps<{
  project: Project | undefined
  tasks: ProjectTask[]
  members: TeamMember[]
  updateTask: (id: string, data: Partial<{ startDate: Date | null; dueDate: Date | null }>) => Promise<void>
  completeTask: (id: string) => Promise<void>
  uncompleteTask: (id: string) => Promise<void>
  updateProject: (id: string, data: Partial<{ startDate: Date | null; dueDate: Date | null }>) => Promise<void>
  approvePhase: (id: string) => Promise<void>
  unapprovePhase: (id: string) => Promise<void>
  title?: string
  collapsible?: boolean
  /** Obiettivo collegato (vista progetti): mostrato sotto al titolo. */
  obiettivo?: { titolo: string; colore: string } | null
}>()

const emit = defineEmits<{ (e: 'new-phase'): void; (e: 'completed', done: boolean): void }>()

// collassabile: accordion (una sola card aperta). standalone (non collassabile) sempre aperto
const cardId = computed(() => props.project?.id ?? '')
const expanded = computed(() => props.collapsible ? _openCard.value === cardId.value : true)
function toggle() {
  if (!props.collapsible) return
  if (expanded.value) { _openCard.value = null }
  else {
    _openCard.value = cardId.value
    nextTick(scrollCardIntoView)
  }
}
function scrollCardIntoView() {
  const card = (rootRef.value?.closest('.pcard') as HTMLElement | null) ?? rootRef.value
  if (!card) return
  const scroller = card.closest('.pv-content') as HTMLElement | null
  if (!scroller) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
  const MARGIN = 12   // poco spazio in alto: si vede il bordo della card sopra
  const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - MARGIN
  scroller.scrollBy({ top: delta, behavior: 'smooth' })
}

const tl = useProjectTimeline(toRef(props, 'tasks'), toRef(props, 'project'), {
  updateTask: props.updateTask,
  completeTask: props.completeTask,
  uncompleteTask: props.uncompleteTask,
  updateProject: props.updateProject,
  approvePhase: props.approvePhase,
  unapprovePhase: props.unapprovePhase,
})

const { groups, phasesFlat, orphanGroup, workBar, timeBar, projectComplete, projectRange, projectStartTs } = tl
const TODAY_TS = tl.TODAY.getTime()

/* ---------------- drag dei timebar ---------------- */
const rootRef = ref<HTMLElement | null>(null)
const tlRef   = ref<HTMLElement | null>(null)
const preview = reactive<Record<string, { leftPct: number; widthPct: number }>>({})
let drag: { taskId: string; zone: 'move' | 'left' | 'right'; startX: number; dayPx: number; D: number; origS: number; origD: number; windowStart: Date } | null = null
const dragLab = reactive({ show: false, text: '', left: 0, top: 0 })

function vmOf(taskId: string) {
  for (const p of phasesFlat.value) { const t = p.tasks.find(x => x.id === taskId); if (t) return t }
  for (const g of groups.value) { const t = g.directTasks.find(x => x.id === taskId); if (t) return t }
  return orphanGroup.value?.tasks.find(x => x.id === taskId) ?? null
}

function onPointerDown(e: PointerEvent) {
  const bar = (e.target as HTMLElement).closest('.bar') as HTMLElement | null
  if (!bar) return
  e.preventDefault()
  const taskId = bar.dataset.taskId!
  const ctx = tl.contextOf(taskId); const vm = vmOf(taskId)
  if (!ctx || !vm) return
  const track = bar.parentElement as HTMLElement
  const W = track.clientWidth, D = ctx.windowDays
  const rect = bar.getBoundingClientRect()
  const rel = e.clientX - rect.left
  const zone: 'move' | 'left' | 'right' = rel < 16 ? 'left' : rel > rect.width - 16 ? 'right' : 'move'
  drag = { taskId, zone, startX: e.clientX, dayPx: W / D, D, origS: vm.s, origD: vm.d, windowStart: ctx.windowStart }
  bar.setPointerCapture(e.pointerId)
  applyDragLabel()
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const dd = Math.round((e.clientX - drag.startX) / drag.dayPx)
  let s = drag.origS, d = drag.origD
  if (drag.zone === 'move') s = clampN(drag.origS + dd, 0, drag.D - drag.origD)
  else if (drag.zone === 'left') { s = clampN(drag.origS + dd, 0, drag.origS + drag.origD - 1); d = (drag.origS + drag.origD) - s }
  else { d = clampN(drag.origS + drag.origD + dd, drag.origS + 1, drag.D) - drag.origS }
  preview[drag.taskId] = { leftPct: s / drag.D * 100, widthPct: d / drag.D * 100 }
  applyDragLabel(s, d)
}

async function onPointerUp() {
  if (!drag) return
  const p = preview[drag.taskId]
  const s = p ? Math.round(p.leftPct / 100 * drag.D) : drag.origS
  const d = p ? Math.max(1, Math.round(p.widthPct / 100 * drag.D)) : drag.origD
  const taskId = drag.taskId
  dragLab.show = false
  drag = null
  await tl.commitDrag(taskId, s, d)
  delete preview[taskId]   // lo snapshot Firestore ridisegna
}

function applyDragLabel(s?: number, d?: number) {
  if (!drag || !rootRef.value) return
  const ss = s ?? drag.origS, dd = d ?? drag.origD
  const a = addD(drag.windowStart, ss), b = addD(drag.windowStart, ss + dd)
  dragLab.text = `${fmt(a)} → ${fmt(b)}  (${dd} gg)`
  const bar = rootRef.value.querySelector(`.bar[data-task-id="${drag.taskId}"]`) as HTMLElement | null
  if (!bar) return
  const cr = rootRef.value.getBoundingClientRect(), br = bar.getBoundingClientRect()
  dragLab.left = br.left + br.width / 2 - cr.left
  dragLab.top = br.top - cr.top - 6
  dragLab.show = true
}

/* ---------------- riga OGGI ---------------- */
const oggiTop = ref<number | null>(null)
let ro: ResizeObserver | null = null
let rafId = 0

function measureToday() {
  const c = tlRef.value; if (!c) { oggiTop.value = null; return }
  const cTop = c.getBoundingClientRect().top
  const anchors = [...c.querySelectorAll('[data-t]')]
    .map(el => { const r = el.getBoundingClientRect(); return { y: r.top - cTop + r.height / 2, t: Number((el as HTMLElement).dataset.t) } })
    .filter(a => !Number.isNaN(a.t))
    .sort((a, b) => a.t - b.t)
  if (!anchors.length) { oggiTop.value = null; return }
  let y: number
  if (TODAY_TS <= anchors[0].t) y = anchors[0].y
  else if (TODAY_TS >= anchors[anchors.length - 1].t) y = anchors[anchors.length - 1].y
  else {
    y = anchors[0].y
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k], b = anchors[k + 1]
      if (TODAY_TS >= a.t && TODAY_TS <= b.t) { const span = (b.t - a.t) || 1; y = a.y + (TODAY_TS - a.t) / span * (b.y - a.y); break }
    }
  }
  oggiTop.value = y
}

function scheduleMeasure() {
  if (drag) return
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(measureToday)
}

watch([groups, orphanGroup], () => nextTick(scheduleMeasure))
watch(expanded, v => { if (v) nextTick(scheduleMeasure) })

onMounted(() => {
  nextTick(scheduleMeasure)
  if (tlRef.value && 'ResizeObserver' in window) { ro = new ResizeObserver(scheduleMeasure); ro.observe(tlRef.value) }
})
onUnmounted(() => { ro?.disconnect(); cancelAnimationFrame(rafId) })

/* ---------------- dialog date progetto ---------------- */
const showDates = ref(false)
const dlgStart = ref(''), dlgEnd = ref('')
function openDates() {
  dlgStart.value = isoOf(tl.projectStart.value)
  dlgEnd.value = isoOf(tl.projectEnd.value)
  showDates.value = true
}
async function applyDates() { await tl.setProjectDates(dlgStart.value, dlgEnd.value); showDates.value = false }

/* ---------------- handler fasi ---------------- */
const finRef = ref<HTMLElement | null>(null)
const onToggleDone = async (id: string) => {
  try { await tl.toggleDone(id) }
  catch (e) { console.error('[TL] toggleDone error', e) }
  // sposta il focus sull'elemento sottostante alla task completata
  nextTick(() => {
    const row = rootRef.value?.querySelector(`.row[data-task-id="${id}"]`)
    row?.nextElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
// quando il progetto viene completato: mostra il premio, attende 3s, poi marca
// completato (persistenza via emit), collassa l'accordion. Se viene riaperto
// qualcosa, lo stato torna indietro (emit completed=false).
let completeTimer: ReturnType<typeof setTimeout> | null = null
watch(projectComplete, (done) => {
  if (completeTimer) { clearTimeout(completeTimer); completeTimer = null }
  if (done) {
    nextTick(() => finRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    // se già persistito come completato (es. al rimontaggio), non rifare la cerimonia
    if (props.project?.completed) return
    completeTimer = setTimeout(() => {
      completeTimer = null
      if (!projectComplete.value) return
      emit('completed', true)
      if (props.collapsible && _openCard.value === cardId.value) _openCard.value = null
    }, 3000)
  } else if (props.project?.completed) {
    emit('completed', false)
  }
})
onUnmounted(() => { if (completeTimer) clearTimeout(completeTimer) })
const onToggleTimed = (id: string) => tl.toggleTimed(id)
const onSetPhaseDue = (p: { phase: PhaseVM; iso: string }) => tl.setPhaseDue(p.phase, p.iso)
const onApprove = (id: string) => tl.approve(id)
const onUnapprove = (id: string) => tl.unapprove(id)

const hasContent = computed(() => phasesFlat.value.length > 0 || !!orphanGroup.value)

// esposto al parent (card): per nascondere l'overlay di stato quando la card è aperta
defineExpose({ expanded })
</script>

<template>
  <div ref="rootRef" class="cph-timeline s-scope-cepheid" :class="{ 'is-card': collapsible }">
    <div class="cph-sticky">
    <!-- header collassabile (titolo + azioni) -->
    <button v-if="title || collapsible" class="cph-head" :class="{ clickable: collapsible }" type="button" @click="toggle">
      <MIcon v-if="collapsible" :name="expanded ? 'expand_more' : 'chevron_right'" :size="20" class="cph-chev" />
      <span class="cph-title">{{ title }}</span>
      <span class="cph-head-actions" @click.stop><slot name="head-actions" /></span>
    </button>

    <!-- obiettivo collegato: sotto al titolo, icona flag NERA allineata alla
         colonna delle icone meta (calendario/checklist/clessidra) sotto -->
    <div v-if="obiettivo" class="cph-goal">
      <span class="hicon hicon--goal"><MIcon name="flag" :filled="true" :size="18" /></span>
      <span class="cph-goal-name">{{ obiettivo.titolo }}</span>
    </div>

    <!-- top bars (sempre visibili: riepilogo date + lavoro + tempo) -->
    <div class="topbar" :class="{ 'topbar--static': collapsible }">
      <div class="prange">
        <span class="hicon" style="cursor:pointer" @click="openDates"><MIcon name="calendar_month" :size="18" /></span>
        <span class="ddval">{{ projectRange }}</span>
      </div>
      <div class="brow">
        <span class="hicon"><MIcon name="checklist" :size="18" /></span>
        <div class="track">
          <div class="fillw" :style="{ width: workBar.pct + '%' }" />
          <div class="bmarks">
            <span v-for="(m, i) in workBar.marks" :key="i" class="dmark" :class="{ reached: m.reached }" :style="{ left: m.pct.toFixed(1) + '%' }" :title="m.label" />
          </div>
        </div>
        <span class="bval">{{ workBar.done }}/{{ workBar.total }}</span>
      </div>
      <div class="brow">
        <span class="hicon"><MIcon name="hourglass_empty" :size="18" /></span>
        <div class="track">
          <div class="fillt" :style="{ width: timeBar.pct + '%' }" />
          <div class="bmarks">
            <span v-for="(m, i) in timeBar.marks" :key="i" class="dmark" :class="{ reached: m.reached }" :style="{ left: m.pct.toFixed(1) + '%' }" :title="m.label" />
          </div>
        </div>
        <span class="bval">{{ timeBar.elapsed }}/{{ timeBar.total }}</span>
      </div>
    </div>
    </div>

    <!-- timeline (corpo: visibile solo quando espanso) -->
    <div v-if="expanded" ref="tlRef" class="tl"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <div class="tl-top-anchor" :data-t="projectStartTs" data-anchor />

      <!-- gruppo task senza fase -->
      <template v-if="orphanGroup">
        <div class="ph-head"><span class="phchip">Senza fase</span></div>
        <CepheidTimelineTaskRow
          v-for="t in orphanGroup.tasks"
          :key="t.id"
          :task="t"
          :members="members"
          :unlocked="true"
          :window-days="orphanGroup.windowDays"
          :preview="preview[t.id] ?? null"
          @toggle-done="onToggleDone"
          @toggle-timed="onToggleTimed"
        />
        <div class="gap" />
      </template>

      <!-- fasi raggruppate per milestone (rombo condiviso a fine gruppo) -->
      <template v-for="g in groups" :key="g.milestoneId">
        <CepheidTimelinePhase
          v-for="p in g.deliverables"
          :key="p.id"
          :phase="p"
          :members="members"
          :preview="preview"
          @toggle-done="onToggleDone"
          @toggle-timed="onToggleTimed"
          @set-phase-due="onSetPhaseDue"
          @approve="onApprove"
          @unapprove="onUnapprove"
        />
        <!-- task agganciati direttamente alla milestone (senza deliverable) -->
        <CepheidTimelineTaskRow
          v-for="t in g.directTasks"
          :key="t.id"
          :task="t"
          :members="members"
          :unlocked="g.unlocked"
          :window-days="g.directWindowDays"
          :preview="preview[t.id] ?? null"
          @toggle-done="onToggleDone"
          @toggle-timed="onToggleTimed"
        />
        <CepheidTimelineMilestone v-if="g.milestoneId !== '__none__'" :group="g" />
      </template>

      <!-- celebrazione (LYRA §6) — 5 stelle osservate compongono una costellazione (cluster, no spike) -->
      <div v-if="projectComplete" ref="finRef" class="fin">
        <div class="constellation" aria-hidden="true">
          <span class="lyra-star cstar cstar--1" />
          <span class="lyra-star cstar cstar--2" />
          <span class="lyra-star cstar cstar--3" />
          <span class="lyra-star cstar cstar--4" />
          <span class="lyra-star cstar cstar--5" />
        </div>
        <div class="ft">Progetto completato</div>
        <div class="fs">obiettivo raggiunto</div>
      </div>

      <!-- empty -->
      <div v-if="!hasContent" class="tl-empty">
        Nessuna fase. Crea un deliverable per iniziare la timeline.
        <button class="add-phase" @click="emit('new-phase')"><MIcon name="add" :size="16" /> Nuova fase</button>
      </div>

      <!-- riga OGGI -->
      <div v-if="oggiTop != null" class="oggiline" :style="{ top: oggiTop + 'px' }" />
    </div>


    <!-- drag label -->
    <div v-show="dragLab.show" class="draglab" :style="{ left: dragLab.left + 'px', top: dragLab.top + 'px' }">{{ dragLab.text }}</div>

    <!-- dialog date progetto -->
    <Teleport to="body">
      <div v-if="showDates" class="cph-modal" @click.self="showDates = false">
        <div class="cph-dialog s-scope-cepheid">
          <h3>Date del progetto</h3>
          <label>inizio<input type="date" v-model="dlgStart"></label>
          <label>fine<input type="date" v-model="dlgEnd" :min="dlgStart"></label>
          <div class="dlgbtns">
            <button class="dlgcancel" @click="showDates = false">Annulla</button>
            <button class="dlgok" @click="applyDates">OK</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cph-timeline { position: relative; font-family: var(--md-sys-typescale-body-medium-font); color: var(--md-sys-color-on-surface); }

/* modalità card (vista progetti): chrome stile riferimento #FFF8F0 */
.cph-timeline.is-card {
  background: #FFF8F0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  padding: 14px 16px 16px;
}
.s-surface-dark .cph-timeline.is-card { background: #16130B; }
@media (prefers-color-scheme: dark) { .cph-timeline.is-card { background: #16130B; } }

.cph-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: 0; padding: 0 0 8px; margin: 0;
  font-family: inherit; text-align: left; color: var(--md-sys-color-on-surface);
}
/* in non-card il wrapper non deve creare un contesto (così il topbar sticky resta relativo allo scroll della pagina) */
.cph-sticky { display: contents; }
/* in modalità card, nome progetto + date + le due barre restano ancorati in alto durante lo scroll */
.is-card .cph-sticky {
  display: block;
  position: sticky; top: 0; z-index: 6;
  background: #FFF8F0;
  padding-top: 2px; padding-bottom: 6px;
}
.s-surface-dark .is-card .cph-sticky { background: #16130B; }
@media (prefers-color-scheme: dark) { .is-card .cph-sticky { background: #16130B; } }
.cph-head.clickable { cursor: pointer; }
/* chevron in colonna da 48px centrata: allineato alle icone (.hicon) della topbar sotto;
   col gap 8px del .cph-head il titolo parte allineato al testo (.ddval) sottostante */
.cph-chev { color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; width: 48px; display: inline-flex; align-items: center; justify-content: center; }
.cph-title {
  font-family: var(--md-sys-typescale-headline-small-font, 'Cormorant Garamond', serif);
  font-size: 22px; line-height: 1.1; font-weight: 500; color: var(--md-sys-color-on-surface);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cph-head-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }

/* obiettivo collegato sotto al titolo: stessa colonna icone della topbar (48px),
   ma icona NERA (on-surface) per distinguerla dalle meta tenui sotto. */
.cph-goal { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; min-width: 0; }
.cph-goal .hicon--goal { color: var(--md-sys-color-on-surface); }
.cph-goal-name { font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* In modalità card la topbar (date + barre) NON deve avere un fondo opaco proprio:
   trasparente -> eredita lo sfondo della card e si colora insieme ad essa all'hover. */
.topbar.topbar--static { position: static; border-bottom: 0; margin-bottom: 0; background: transparent; }

.topbar { position: sticky; top: 0; z-index: 5; background: var(--md-sys-color-surface); padding: 8px 0 10px; border-bottom: 1px solid var(--md-sys-color-outline-variant); margin-bottom: 8px; }
.prange { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
.ddval { font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.brow { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.hicon { width: 48px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant); }
.track { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--md-sys-color-surface-container-high); overflow: hidden; }
.bmarks { position: absolute; inset: 0; pointer-events: none; }
.dmark { position: absolute; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); border-radius: 1px; background: color-mix(in srgb, var(--md-sys-color-on-surface) 30%, transparent); }
.dmark.reached { background: var(--md-sys-color-on-surface); }
.fillw { height: 100%; width: 0; background: var(--md-sys-color-primary); border-radius: 3px; transition: width .4s cubic-bezier(.2,0,0,1); }
.fillt { height: 100%; width: 0; background: color-mix(in srgb, var(--md-sys-color-primary) 45%, var(--md-sys-color-surface-container-high)); border-radius: 3px; transition: width .4s; }
.bval { font-size: 11px; font-weight: 500; min-width: 54px; text-align: right; color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; }

.tl { position: relative; z-index: 0; margin-top: 14px; }
.tl-top-anchor { height: 0; }
.ph-head { display: flex; align-items: center; gap: 8px; padding: 8px 2px 2px 12px; }
.phchip { font-size: 11px; font-weight: 500; padding: 2px 9px; border-radius: var(--md-sys-shape-corner-full); background: color-mix(in srgb, var(--md-sys-color-primary) 16%, var(--md-sys-color-surface)); color: var(--md-sys-color-primary); }
.gap { height: 6px; position: relative; }
.gap::before { content: ''; position: absolute; left: 24px; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--md-sys-color-outline-variant); }

.oggiline { position: absolute; left: 0; right: 0; height: 0; border-top: 1.5px dashed color-mix(in srgb, var(--md-sys-color-primary) 70%, var(--md-sys-color-surface)); z-index: -1; pointer-events: none; }
.draglab { position: absolute; z-index: 6; transform: translate(-50%, -100%); background: var(--md-sys-color-on-surface); color: var(--md-sys-color-surface); font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none; }

.tl-empty { text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 14px; padding: 40px 16px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.add-phase { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 16px; border-radius: var(--md-sys-shape-corner-full); border: 1px solid var(--md-sys-color-outline-variant); background: transparent; color: var(--md-sys-color-primary); font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; }
.add-phase:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent); }
.add-phase--foot { margin: 12px auto 4px; display: flex; }

.fin { position: relative; overflow: hidden; margin-top: 16px; padding: 24px 18px; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container); text-align: center; }
.fin .ft { font-family: var(--md-sys-typescale-headline-small-font, serif); font-size: 24px; color: var(--md-sys-color-on-surface); }
.fin .fs { font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px; }

/* LYRA §6 — costellazione: cluster di .lyra-star (src/style.css §LYRA) senza
   spike, posizionate a forma di W di Cassiopea. */
.constellation { position: relative; width: 140px; height: 50px; margin: 0 auto 14px; }
.cstar {
  --lyra-star-size: 6px;
  --lyra-star-glow-radius: 8px;
  --lyra-star-glow-color: rgba(212, 160, 32, 0.6);
  position: absolute;
  opacity: 0.85;
}
.cstar--1 { left:   5px; top:  5px; }
.cstar--2 { left:  40px; top: 35px; }
.cstar--3 { left:  67px; top: 10px; }
.cstar--4 { left:  94px; top: 35px; }
.cstar--5 { left: 129px; top:  5px; }
@media (prefers-reduced-motion: no-preference) {
  .cstar { opacity: 0; animation: cstar-converge 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .cstar--1 { --dx: -30px; --dy: -30px; }
  .cstar--2 { --dx: -50px; --dy:  30px; animation-delay:  80ms; }
  .cstar--3 { --dx:   0px; --dy: -50px; animation-delay: 160ms; }
  .cstar--4 { --dx:  50px; --dy:  30px; animation-delay: 240ms; }
  .cstar--5 { --dx:  30px; --dy: -30px; animation-delay: 320ms; }
  @keyframes cstar-converge {
    0%   { transform: translate(var(--dx, 0), var(--dy, 0)) scale(0.5); opacity: 0; }
    60%  { opacity: 1; }
    100% { transform: translate(0, 0) scale(1); opacity: 0.85; }
  }
}

/* dialog */
.cph-modal { position: fixed; inset: 0; background: color-mix(in srgb, var(--md-sys-color-scrim) 55%, transparent); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
.cph-dialog { background: var(--md-sys-color-surface); border-radius: var(--md-sys-shape-corner-large); padding: 20px; width: 100%; max-width: 300px; box-shadow: var(--md-sys-elevation-level-3, 0 8px 30px rgba(0,0,0,.25)); }
.cph-dialog h3 { font-family: var(--md-sys-typescale-title-medium-font); font-size: 20px; font-weight: 500; margin: 0 0 14px; color: var(--md-sys-color-on-surface); }
.cph-dialog label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 12px; }
.cph-dialog input { height: 38px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); border-radius: 8px; padding: 0 10px; font-family: inherit; font-size: 14px; }
.dlgbtns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dlgok { height: 38px; padding: 0 18px; border: 0; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font-weight: 500; cursor: pointer; font-family: inherit; }
.dlgcancel { height: 38px; padding: 0 16px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); background: transparent; color: var(--md-sys-color-on-surface); cursor: pointer; font-family: inherit; }
</style>
