<script setup lang="ts">
/**
 * Selettore del periodo di un Obiettivo.
 * Due modalità:
 *  - Anno: pulsanti anno (corrente, +1, +2; include eventuali anni passati in edit)
 *  - Trimestri: griglia di trimestri contigui; selezione a intervallo (1° tap = ancora,
 *    2° tap = estende, tap successivo = reset). Può attraversare l'anno.
 *
 * v-model su { periodKind, startDate, endDate }.
 */
import { ref, computed } from 'vue'
import {
  yearToDates,
  quarterRangeToDates,
  quartersFrom,
  currentQuarterIndex,
  dateToQuarterIndex,
  type QuarterCell,
} from '../../composables/cepheid/usePeriods'

interface PeriodValue {
  periodKind: 'year' | 'quarters'
  startDate: Date
  endDate: Date
}

const props = defineProps<{ modelValue: PeriodValue }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: PeriodValue): void }>()

const now = new Date()
const curYear = now.getFullYear()
const curQ = currentQuarterIndex(now)

const mode = ref<'year' | 'quarters'>(props.modelValue.periodKind)

// ── Modalità Anno ───────────────────────────────────────────────────────────
const selYear = ref<number>(props.modelValue.startDate.getFullYear())
const years = computed<number[]>(() => {
  const base = Math.min(curYear, selYear.value)
  const top = Math.max(curYear + 2, selYear.value)
  const out: number[] = []
  for (let y = base; y <= top; y++) out.push(y)
  return out
})

// ── Modalità Trimestri ──────────────────────────────────────────────────────
// estremi della selezione, come index (year*4+q)
const rangeStart = ref<number | null>(null)
const rangeEnd   = ref<number | null>(null)
// 'anchored' = primo tap dato, in attesa del secondo; 'complete' = intervallo chiuso
const phase = ref<'idle' | 'anchored' | 'complete'>('idle')

// inizializza la selezione trimestri dal modello (se è già in modalità quarters)
if (props.modelValue.periodKind === 'quarters') {
  rangeStart.value = dateToQuarterIndex(props.modelValue.startDate)
  rangeEnd.value   = dateToQuarterIndex(props.modelValue.endDate)
  phase.value = 'complete'
}

// griglia: parte dal trimestre corrente (o da quello selezionato se nel passato) e
// copre abbastanza trimestri da includere la selezione + un orizzonte futuro.
const quarterGrid = computed<QuarterCell[]>(() => {
  const selLo = rangeStart.value != null ? Math.min(rangeStart.value, rangeEnd.value ?? rangeStart.value) : curQ
  const selHi = rangeEnd.value != null ? Math.max(rangeStart.value ?? rangeEnd.value, rangeEnd.value) : curQ
  const base = Math.min(curQ, selLo)
  const top = Math.max(curQ + 7, selHi)
  return quartersFrom(base, top - base + 1)
})

function inRange(idx: number): boolean {
  if (rangeStart.value == null || rangeEnd.value == null) return false
  const lo = Math.min(rangeStart.value, rangeEnd.value)
  const hi = Math.max(rangeStart.value, rangeEnd.value)
  return idx >= lo && idx <= hi
}
function isEdge(idx: number): boolean {
  return idx === rangeStart.value || idx === rangeEnd.value
}

function onQuarterClick(cell: QuarterCell) {
  if (phase.value !== 'anchored') {
    rangeStart.value = cell.index
    rangeEnd.value = cell.index
    phase.value = 'anchored'
  } else {
    rangeEnd.value = cell.index
    phase.value = 'complete'
  }
  emitModel()
}

// ── Toggle modalità ─────────────────────────────────────────────────────────
function setMode(m: 'year' | 'quarters') {
  if (mode.value === m) return
  mode.value = m
  if (m === 'quarters' && rangeStart.value == null) {
    // default: trimestre corrente singolo
    rangeStart.value = curQ
    rangeEnd.value = curQ
    phase.value = 'anchored'
  }
  emitModel()
}

// ── Emit ────────────────────────────────────────────────────────────────────
function emitModel() {
  if (mode.value === 'year') {
    const { startDate, endDate } = yearToDates(selYear.value)
    emit('update:modelValue', { periodKind: 'year', startDate, endDate })
  } else {
    const lo = quarterGrid.value.find(c => c.index === Math.min(rangeStart.value!, rangeEnd.value!))
    const hi = quarterGrid.value.find(c => c.index === Math.max(rangeStart.value!, rangeEnd.value!))
    if (!lo || !hi) return
    const { startDate, endDate } = quarterRangeToDates(lo, hi)
    emit('update:modelValue', { periodKind: 'quarters', startDate, endDate })
  }
}

function selectYear(y: number) {
  selYear.value = y
  emitModel()
}

// Nota: i modali che usano questo picker sono v-if → il componente viene rimontato
// a ogni apertura, quindi lo stato iniziale è già letto fresco da props.modelValue.
// Nessun watch di risincronizzazione: eviterebbe la corretta sequenza ancora→estendi
// (il round-trip dell'emit forzerebbe phase='complete' dopo il primo tap).
</script>

<template>
  <div class="pp">
    <!-- toggle modalità (stile pillola segmentata vsw) -->
    <div class="pp-toggle">
      <button type="button" class="pp-toggle-btn" :class="{ active: mode === 'quarters' }" @click="setMode('quarters')">Trimestri</button>
      <button type="button" class="pp-toggle-btn" :class="{ active: mode === 'year' }" @click="setMode('year')">Anno</button>
    </div>

    <!-- ANNO -->
    <div v-if="mode === 'year'" class="pp-years">
      <button
        v-for="y in years"
        :key="y"
        type="button"
        class="pp-chip"
        :class="{ sel: selYear === y }"
        @click="selectYear(y)"
      >{{ y }}</button>
    </div>

    <!-- TRIMESTRI -->
    <div v-else class="pp-quarters">
      <button
        v-for="c in quarterGrid"
        :key="c.index"
        type="button"
        class="pp-qcell"
        :class="{ 'in-range': inRange(c.index), edge: isEdge(c.index) }"
        @click="onQuarterClick(c)"
      >
        <span class="pp-qlabel">{{ c.label }}</span>
        <span class="pp-qyear">{{ c.year }}</span>
      </button>
    </div>
    <p v-if="mode === 'quarters'" class="pp-hint">
      Tocca un trimestre per iniziare, poi un altro per estendere l'intervallo.
    </p>
  </div>
</template>

<style scoped>
.pp { font-family: 'Outfit', sans-serif; }

/* toggle */
.pp-toggle {
  display: inline-flex; gap: 2px; padding: 3px;
  border-radius: 12px; background: #EBE2CF; margin-bottom: 12px;
}
.s-surface-dark .pp-toggle { background: #231E13; }
@media (prefers-color-scheme: dark) { .pp-toggle { background: #231E13; } }
.pp-toggle-btn {
  height: 30px; padding: 0 16px; border: 0; background: none; border-radius: 9px;
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
  color: var(--md-sys-color-on-surface-variant); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pp-toggle-btn.active {
  background: #FFF8F0; color: var(--md-sys-color-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.s-surface-dark .pp-toggle-btn.active { background: #16130B; }
@media (prefers-color-scheme: dark) { .pp-toggle-btn.active { background: #16130B; } }

/* anni */
.pp-years { display: flex; flex-wrap: wrap; gap: 8px; }
.pp-chip {
  height: 38px; min-width: 64px; padding: 0 16px;
  border: 1px solid #E8E5DF; background: #F4F2EE; border-radius: 10px;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  color: #6A6560; cursor: pointer; transition: all 0.15s;
}
.pp-chip:hover { border-color: var(--md-sys-color-primary); }
.pp-chip.sel {
  background: color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
  border-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-primary-hover, var(--md-sys-color-primary));
}

/* trimestri */
.pp-quarters {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.pp-qcell {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 8px 4px; border: 1px solid #E8E5DF; background: #F4F2EE;
  border-radius: 10px; cursor: pointer; transition: all 0.12s;
  font-family: 'Outfit', sans-serif;
}
.pp-qcell:hover { border-color: var(--md-sys-color-primary); }
.pp-qlabel { font-size: 12px; font-weight: 700; color: #1A1917; letter-spacing: 0.02em; }
.pp-qyear { font-size: 10px; font-weight: 600; color: #9B9590; }
.pp-qcell.in-range {
  background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--md-sys-color-primary) 40%, transparent);
}
.pp-qcell.in-range .pp-qlabel { color: var(--md-sys-color-primary-hover, var(--md-sys-color-primary)); }
.pp-qcell.in-range .pp-qyear { color: var(--md-sys-color-primary); }
.pp-qcell.edge {
  background: var(--md-sys-color-primary);
  border-color: var(--md-sys-color-primary);
}
.pp-qcell.edge .pp-qlabel,
.pp-qcell.edge .pp-qyear { color: #fff; }

.pp-hint { margin: 10px 0 0; font-size: 11px; color: #B4B0AA; }
</style>
