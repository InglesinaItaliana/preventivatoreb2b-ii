<script setup lang="ts">
import MIcon from '../shared/MIcon.vue'
import { fmt, type MilestoneGroupVM } from '../../composables/cepheid/useProjectTimeline'

defineProps<{ group: MilestoneGroupVM }>()
</script>

<template>
  <div class="row" :class="{ locked: !group.unlocked }">
    <div class="rail">
      <div class="spine" :class="{ 'is-on': group.reached }" :style="group.isLastGroup ? 'bottom:50%' : ''" />
      <div
        class="mk-mile"
        :class="{ reached: group.reached }"
        :data-t="group.mileDueTs ?? undefined"
        :data-anchor="group.mileDueTs != null ? '' : undefined"
      >
        <MIcon v-if="group.reached" name="rocket_launch" :size="13" class="mile-icon" />
      </div>
    </div>
    <div class="cell">
      <div v-if="group.reached" class="mcard">
        <div>
          <div class="mt">{{ group.mileName }}</div>
          <div class="msb">raggiunta<span v-if="group.mileDue"> · {{ fmt(group.mileDue) }}</span></div>
        </div>
      </div>
      <div v-else class="mwrap">
        <div class="mname">{{ group.mileName }}</div>
        <div class="mstat" :class="{ late: group.late }">
          {{ group.late ? 'scaduta' + (group.mileDue ? ' · ' + fmt(group.mileDue) : '')
             : !group.unlocked ? 'bloccata'
             : group.mileDue ? 'obiettivo · ' + fmt(group.mileDue) : 'obiettivo' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row { display: grid; grid-template-columns: 48px 1fr; align-items: stretch; }
.row.locked { opacity: .4; pointer-events: none; }
.rail { position: relative; display: flex; align-items: center; justify-content: center; }
.spine { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--md-sys-color-outline-variant); }
.spine.is-on { background: var(--md-sys-color-primary); }
.cell { padding: 4px 0 4px 12px; min-width: 0; }

.mk-mile {
  position: relative; z-index: 2; width: 24px; height: 24px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; transform: rotate(45deg);
  border: 2px solid var(--md-sys-color-outline); color: var(--md-sys-color-outline);
  background: var(--md-sys-color-surface);
}
.mk-mile.reached { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.mile-icon { transform: rotate(-45deg); }

.mwrap { padding: 8px 0 8px 12px; }
.mname { font-size: 16px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.mstat { font-size: 13px; margin-top: 2px; color: var(--md-sys-color-on-surface-variant); }
.mstat.late { color: var(--md-sys-color-error); font-weight: 500; }
.mcard { position: relative; min-height: 60px; display: flex; align-items: center; gap: 12px; border-radius: var(--md-sys-shape-corner-large); padding: 14px 16px; margin: 5px 0; background: var(--md-sys-color-primary); }
.mcard .mt { font-size: 17px; font-weight: 500; color: var(--md-sys-color-on-primary); }
.mcard .msb { font-size: 13px; color: color-mix(in srgb, var(--md-sys-color-on-primary) 82%, var(--md-sys-color-primary)); margin-top: 4px; }
</style>
