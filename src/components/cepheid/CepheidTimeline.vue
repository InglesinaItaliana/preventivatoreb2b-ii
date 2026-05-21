<script setup lang="ts">
import { ref, reactive, toRef, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import MIcon from '../shared/MIcon.vue'
import CepheidTimelinePhase from './CepheidTimelinePhase.vue'
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
}>()

const emit = defineEmits<{ (e: 'new-phase'): void }>()

const tl = useProjectTimeline(toRef(props, 'tasks'), toRef(props, 'project'), {
  updateTask: props.updateTask,
  completeTask: props.completeTask,
  uncompleteTask: props.uncompleteTask,
  updateProject: props.updateProject,
  approvePhase: props.approvePhase,
  unapprovePhase: props.unapprovePhase,
})

const { phases, orphanGroup, workBar, timeBar, allApproved, projectRange, projectStartTs } = tl
const TODAY_TS = tl.TODAY.getTime()
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ---------------- drag dei timebar ---------------- */
const rootRef = ref<HTMLElement | null>(null)
const tlRef   = ref<HTMLElement | null>(null)
const preview = reactive<Record<string, { leftPct: number; widthPct: number }>>({})
let drag: { taskId: string; zone: 'move' | 'left' | 'right'; startX: number; dayPx: number; D: number; origS: number; origD: number; windowStart: Date } | null = null
const dragLab = reactive({ show: false, text: '', left: 0, top: 0 })

function vmOf(taskId: string) {
  for (const p of phases.value) { const t = p.tasks.find(x => x.id === taskId); if (t) return t }
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

watch([phases, orphanGroup], () => nextTick(scheduleMeasure))

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
const onToggleDone = (id: string) => tl.toggleDone(id)
const onToggleTimed = (id: string) => tl.toggleTimed(id)
const onSetPhaseDue = (p: { phase: PhaseVM; iso: string }) => tl.setPhaseDue(p.phase, p.iso)
const onApprove = (id: string) => tl.approve(id)

const confetti = computed(() => Array.from({ length: 14 }, (_, k) => ({
  left: Math.round(6 + k * 88 / 14), color: ['#D4A020', '#C4941C', '#3AAF98', '#C46030', '#98C0D0', '#B06842'][k % 6], delay: ((k % 5) * 90) / 1000,
})))

const hasContent = computed(() => phases.value.length > 0 || !!orphanGroup.value)
</script>

<template>
  <div ref="rootRef" class="cph-timeline s-scope-cepheid">
    <!-- top bars -->
    <div class="topbar">
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

    <!-- timeline -->
    <div ref="tlRef" class="tl"
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

      <!-- fasi -->
      <CepheidTimelinePhase
        v-for="p in phases"
        :key="p.id"
        :phase="p"
        :members="members"
        :preview="preview"
        @toggle-done="onToggleDone"
        @toggle-timed="onToggleTimed"
        @set-phase-due="onSetPhaseDue"
        @approve="onApprove"
      />

      <!-- celebrazione -->
      <div v-if="allApproved" class="fin">
        <template v-if="!reduceMotion">
          <span v-for="(c, i) in confetti" :key="i" class="pc" :style="{ left: c.left + '%', background: c.color, animationDelay: c.delay + 's' }" />
        </template>
        <div class="rk"><MIcon name="emoji_events" :size="28" /></div>
        <div class="ft">Progetto completato</div>
        <div class="fs">tutte le milestone approvate</div>
      </div>

      <!-- empty -->
      <div v-if="!hasContent" class="tl-empty">
        Nessuna fase. Crea un deliverable per iniziare la timeline.
        <button class="add-phase" @click="emit('new-phase')"><MIcon name="add" :size="16" /> Nuova fase</button>
      </div>

      <!-- riga OGGI -->
      <div v-if="oggiTop != null" class="oggiline" :style="{ top: oggiTop + 'px' }" />
    </div>

    <!-- + Fase -->
    <button v-if="hasContent" class="add-phase add-phase--foot" @click="emit('new-phase')">
      <MIcon name="add" :size="16" /> Nuova fase
    </button>

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
.fin .rk { display: inline-flex; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 50%; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); margin-bottom: 10px; }
.fin .ft { font-family: var(--md-sys-typescale-headline-small-font, serif); font-size: 24px; color: var(--md-sys-color-on-surface); }
.fin .fs { font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px; }
.pc { position: absolute; top: 8px; width: 8px; height: 8px; border-radius: 2px; opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  @keyframes cphconf { 0% { transform: translateY(0) rotate(0); opacity: 0 } 12% { opacity: 1 } 100% { transform: translateY(160px) rotate(400deg); opacity: 0 } }
  .pc { animation: cphconf 1.6s cubic-bezier(.3,.1,.5,1) forwards; }
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
