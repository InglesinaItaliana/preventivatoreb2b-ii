<script lang="ts">
import { ref as _ref } from 'vue'
// accordion condiviso fra tutte le card obiettivo: id dell'obiettivo espanso (una sola aperta)
const _openGoalCard = _ref<string | null>(null)
</script>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import MIcon from '../shared/MIcon.vue'
import CepheidBarsHeader from './CepheidBarsHeader.vue'
import { formatPeriodLabel } from '../../composables/cepheid/usePeriods'
import type { Obiettivo } from '../../composables/sidera/useObiettivi'
import type { Project } from '../../composables/sidera/useProjects'

const props = defineProps<{
  goal: Obiettivo
  linkedProjects: Project[]
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'link'): void
  (e: 'open-project', id: string): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = computed(() => _openGoalCard.value === props.goal.id)
function toggle() {
  if (expanded.value) { _openGoalCard.value = null }
  else { _openGoalCard.value = props.goal.id; nextTick(scrollIntoView) }
}
function scrollIntoView() {
  const card = rootRef.value
  if (!card) return
  const scroller = card.closest('.gv-content') as HTMLElement | null
  if (!scroller) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
  const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12
  scroller.scrollBy({ top: delta, behavior: 'smooth' })
}

const menuOpen = ref(false)

const rangeLabel = computed(() => formatPeriodLabel(props.goal.startDate, props.goal.endDate, props.goal.periodKind))

// ── barra lavoro: somma azioni dei progetti collegati ───────────────────────
const workBar = computed(() => {
  let total = 0, done = 0
  const marks: { pct: number; reached: boolean; label?: string }[] = []
  for (const p of props.linkedProjects) { total += p.taskCount; done += p.doneCount }
  let cum = 0
  for (const p of props.linkedProjects) {
    cum += p.taskCount
    marks.push({
      pct: total ? (cum / total) * 100 : 0,
      reached: p.taskCount > 0 && p.doneCount >= p.taskCount,
      label: p.name,
    })
  }
  return { value: done, total, pct: total ? Math.round((done / total) * 100) : 0, marks }
})

// ── barra tempo: avanzamento entro il periodo dell'obiettivo ────────────────
const DAY = 86400000
const timeBar = computed(() => {
  const start = props.goal.startDate
  const end = props.goal.endDate
  if (!start || !end) return { value: 0, total: 0, pct: 0, marks: [] }
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY))
  const elapsed = Math.max(0, Math.min(total, Math.round((Date.now() - start.getTime()) / DAY)))
  return { value: elapsed, total, pct: Math.round((elapsed / total) * 100), marks: [] }
})

function pct(p: Project) {
  return p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0
}
</script>

<template>
  <div ref="rootRef" class="gcard s-scope-cepheid">
    <div class="gcard-sticky">
      <!-- head: chevron + titolo + azioni -->
      <div class="gcard-head">
        <button class="gcard-toggle" type="button" @click="toggle" :aria-label="expanded ? 'Comprimi' : 'Espandi'">
          <MIcon :name="expanded ? 'expand_more' : 'chevron_right'" :size="20" />
        </button>
        <span class="gcard-title" @click="toggle">{{ goal.titolo }}</span>
        <span class="gcard-actions">
          <span class="gcard-period">{{ rangeLabel }}</span>
          <button v-if="isAdmin" class="gcard-icon" title="Modifica obiettivo" @click.stop="emit('edit')">
            <MIcon name="edit" :size="16" />
          </button>
          <button v-if="isAdmin" class="gcard-icon" title="Collega progetti" @click.stop="emit('link')">
            <MIcon name="add_link" :size="16" />
          </button>
          <button class="gcard-icon" title="Apri dettaglio" @click.stop="emit('open')">
            <MIcon name="open_in_full" :size="16" />
          </button>
          <div v-if="isAdmin" class="gcard-menu-wrap">
            <button class="gcard-icon" aria-label="Menu obiettivo" @click.stop="menuOpen = !menuOpen">
              <MIcon name="more_horiz" :size="18" />
            </button>
            <div v-if="menuOpen" class="gcard-dropdown" @click="menuOpen = false">
              <button class="gcard-dropdown-item gcard-dropdown-item--danger" @click.stop="menuOpen = false; emit('delete')">
                <MIcon name="delete" :size="14" /> Elimina obiettivo
              </button>
            </div>
          </div>
        </span>
      </div>

      <CepheidBarsHeader
        :range="rangeLabel || '—'"
        :work="workBar"
        :time="timeBar"
        :accent="goal.colore"
        :range-clickable="isAdmin"
        @range-click="emit('edit')"
      />
    </div>

    <!-- corpo espanso: progetti collegati -->
    <div v-if="expanded" class="gcard-body">
      <div v-if="!linkedProjects.length" class="gcard-empty">
        Nessun progetto collegato.
        <button v-if="isAdmin" class="gcard-link-cta" @click="emit('link')">
          <MIcon name="add_link" :size="14" /> Collega progetti
        </button>
      </div>
      <div
        v-for="p in linkedProjects"
        :key="p.id"
        class="proj-row"
        @click="emit('open-project', p.id)"
      >
        <div class="proj-stripe" :style="{ background: p.color }" />
        <div class="proj-body">
          <div class="proj-name">{{ p.name }}</div>
          <div class="proj-stats">{{ p.doneCount }}/{{ p.taskCount }} azioni · {{ pct(p) }}%</div>
          <div class="prog-track">
            <div class="prog-fill" :style="{ width: pct(p) + '%', background: p.color }" />
          </div>
        </div>
        <MIcon name="chevron_right" :size="18" class="proj-chev" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gcard {
  position: relative;
  isolation: isolate;
  background: #FFF8F0;
  border-radius: 16px;
  padding: 12px 14px;
  flex-shrink: 0;
  font-family: 'Outfit', sans-serif;
}
.s-surface-dark .gcard { background: #16130B; }
@media (prefers-color-scheme: dark) { .gcard { background: #16130B; } }

.gcard-sticky { position: sticky; top: 0; z-index: 6; background: #FFF8F0; padding-bottom: 6px; }
.s-surface-dark .gcard-sticky { background: #16130B; }
@media (prefers-color-scheme: dark) { .gcard-sticky { background: #16130B; } }

.gcard-head { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; }
/* chevron in colonna 48px centrata: allineato alle icone (.hicon, 48px) delle barre
   sottostanti, esattamente come .cph-chev nella card Progetto. */
.gcard-toggle {
  flex: 0 0 auto; width: 48px; height: 28px; border: 0; background: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--md-sys-color-on-surface-variant); border-radius: var(--md-sys-shape-corner-full);
}
.gcard-toggle:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.gcard-title {
  font-family: var(--md-sys-typescale-headline-small-font, 'Cormorant Garamond', serif);
  font-size: 22px; line-height: 1.1; font-weight: 500; color: var(--md-sys-color-on-surface);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.gcard-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.gcard-period {
  font-size: 11px; font-weight: 600; color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container); padding: 3px 9px;
  border-radius: var(--md-sys-shape-corner-full); margin-right: 4px; white-space: nowrap;
}
.gcard-icon {
  background: none; border: none; padding: 4px; border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer; color: var(--md-sys-color-on-surface-variant); display: inline-flex; align-items: center;
}
.gcard-icon:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); color: var(--md-sys-color-primary); }
.gcard-menu-wrap { position: relative; }
.gcard-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium); box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px; min-width: 180px; z-index: 50;
}
.gcard-dropdown-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px;
  background: none; border: none; font-family: 'Outfit', sans-serif;
  font-size: 13px; color: var(--md-sys-color-on-surface); text-align: left; cursor: pointer;
  border-radius: var(--md-sys-shape-corner-small);
}
.gcard-dropdown-item:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.gcard-dropdown-item--danger { color: var(--md-sys-color-error); }

/* corpo: progetti collegati */
.gcard-body { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.gcard-empty {
  padding: 18px 8px; text-align: center; font-size: 12px; color: #B4B0AA;
  display: flex; flex-direction: column; align-items: center; gap: 10px; font-style: italic;
}
.gcard-link-cta {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px;
  background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
  border-radius: var(--md-sys-shape-corner-full); font-family: 'Outfit', sans-serif;
  font-size: 12px; font-weight: 600; color: var(--md-sys-color-primary); cursor: pointer; font-style: normal;
}
.gcard-link-cta:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent); }

.proj-row {
  display: flex; align-items: stretch; background: var(--md-sys-color-surface-container-low);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden; cursor: pointer; transition: background 0.15s;
}
.proj-row:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface-container-low)); }
.proj-stripe { width: 6px; flex-shrink: 0; }
.proj-body { padding: 10px 12px; flex: 1; min-width: 0; }
.proj-name { font-size: 14px; font-weight: 600; margin-bottom: 3px; color: var(--md-sys-color-on-surface); }
.proj-stats { font-size: 11px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; }
.prog-track { height: 4px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
.prog-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); transition: width 0.3s ease; }
.proj-chev { align-self: center; color: var(--md-sys-color-on-surface-variant); flex-shrink: 0; margin-right: 6px; }
</style>
