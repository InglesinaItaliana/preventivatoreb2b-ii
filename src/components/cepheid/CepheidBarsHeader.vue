<script setup lang="ts">
/**
 * Header presentazionale a due barre (lavoro + tempo) con riga date.
 * Replica l'estetica della topbar di CepheidTimeline (card Progetto) per essere
 * riusata dalla card Obiettivo, senza trascinarsi dietro la macchina della timeline.
 */
import MIcon from '../shared/MIcon.vue'

interface Bar {
  /** valore "fatto" mostrato a destra (es. task done o giorni trascorsi) */
  value: number
  /** valore totale mostrato a destra */
  total: number
  /** percentuale 0..100 di riempimento */
  pct: number
  marks?: { pct: number; reached: boolean; label?: string }[]
}

defineProps<{
  range: string
  work: Bar
  time: Bar
  /** rende cliccabile la riga date (icona calendario) */
  rangeClickable?: boolean
  /** colore accent per le barre (default = primary del tema) */
  accent?: string
}>()

const emit = defineEmits<{ (e: 'range-click'): void }>()
</script>

<template>
  <div class="bh" :style="accent ? { '--bar-accent': accent } : undefined">
    <div class="prange">
      <span
        class="hicon"
        :style="rangeClickable ? 'cursor:pointer' : ''"
        @click="rangeClickable && emit('range-click')"
      ><MIcon name="calendar_month" :size="18" /></span>
      <span class="ddval">{{ range }}</span>
    </div>

    <div class="brow">
      <span class="hicon"><MIcon name="checklist" :size="18" /></span>
      <div class="track">
        <div class="fillw" :style="{ width: work.pct + '%' }" />
        <div class="bmarks">
          <span v-for="(m, i) in (work.marks ?? [])" :key="i" class="dmark" :class="{ reached: m.reached }" :style="{ left: m.pct.toFixed(1) + '%' }" :title="m.label" />
        </div>
      </div>
      <span class="bval">{{ work.value }}/{{ work.total }}</span>
    </div>

    <div class="brow">
      <span class="hicon"><MIcon name="hourglass_empty" :size="18" /></span>
      <div class="track">
        <div class="fillt" :style="{ width: time.pct + '%' }" />
        <div class="bmarks">
          <span v-for="(m, i) in (time.marks ?? [])" :key="i" class="dmark" :class="{ reached: m.reached }" :style="{ left: m.pct.toFixed(1) + '%' }" :title="m.label" />
        </div>
      </div>
      <span class="bval">{{ time.value }}/{{ time.total }}</span>
    </div>
  </div>
</template>

<style scoped>
.bh { font-family: var(--md-sys-typescale-body-medium-font, 'Outfit', sans-serif); }
.prange { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
.ddval { font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.brow { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.brow:last-child { margin-bottom: 0; }
.hicon { width: 48px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant); }
.track { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--md-sys-color-surface-container-high); overflow: hidden; }
.bmarks { position: absolute; inset: 0; pointer-events: none; }
.dmark { position: absolute; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); border-radius: 1px; background: color-mix(in srgb, var(--md-sys-color-on-surface) 30%, transparent); }
.dmark.reached { background: var(--md-sys-color-on-surface); }
.fillw { height: 100%; width: 0; background: var(--bar-accent, var(--md-sys-color-primary)); border-radius: 3px; transition: width .4s cubic-bezier(.2,0,0,1); }
.fillt { height: 100%; width: 0; background: color-mix(in srgb, var(--bar-accent, var(--md-sys-color-primary)) 45%, var(--md-sys-color-surface-container-high)); border-radius: 3px; transition: width .4s; }
.bval { font-size: 11px; font-weight: 500; min-width: 54px; text-align: right; color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; }
</style>
