<script setup lang="ts">
import { ref } from 'vue'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, type TeamMember } from '../../composables/sidera/useTeamMembers'
import type { TaskVM } from '../../composables/cepheid/useProjectTimeline'

const props = defineProps<{
  task: TaskVM
  members: TeamMember[]
  unlocked: boolean
  windowDays: number
  preview?: { leftPct: number; widthPct: number } | null
}>()

defineEmits<{
  (e: 'toggle-done', id: string): void
  (e: 'toggle-timed', id: string): void
}>()

const left  = () => (props.preview ? props.preview.leftPct : props.task.leftPct)
const width = () => (props.preview ? props.preview.widthPct : props.task.widthPct)
const avOpen = ref(false)   // tap su mobile per aprire le pillole assegnatari
</script>

<template>
  <div class="row" :data-task-id="task.id">
    <div class="rail">
      <div class="spine" :class="{ 'is-done': task.done }" />
      <!-- marker cerchio: 4 stati -->
      <div
        class="mk-circle"
        :class="task.marker"
        :data-t="task.startTs ?? undefined"
        :data-anchor="task.startTs != null ? '' : undefined"
      >
        <MIcon v-if="task.marker === 'done'" name="check" :size="14" />
        <span v-else-if="task.marker === 'late'" class="mk-bang">!</span>
      </div>
    </div>

    <div class="cell">
      <div class="task" :class="{ done: task.done }">
        <div class="trow" @click="$emit('toggle-done', task.id)">
          <span class="tn" :class="{ done: task.done }">{{ task.title }}</span>
          <span class="dt" :class="{ late: task.late }">{{ task.dueText }}</span>
        </div>
        <div class="trow2">
          <div class="avg" :class="{ 'is-open': avOpen }" @click.stop="avOpen = !avOpen">
            <span v-for="email in task.assignees" :key="email" class="av-pill">
              <StarAvatar class="av" v-bind="starAvatarProps(email, members)" :size="22" />
              <span class="av-name">{{ displayName(email, members) }}</span>
            </span>
          </div>
          <template v-if="task.timed">
            <div class="timebar">
              <div
                class="bar"
                :class="{ done: task.done }"
                :data-task-id="task.id"
                :data-window-days="windowDays"
                :style="{ left: left() + '%', width: width() + '%' }"
              >
                <span class="grip gl" />
                <span class="grip gr" />
              </div>
            </div>
            <button class="tbtn" title="rimuovi tempi" @click.stop="$emit('toggle-timed', task.id)">
              <MIcon name="event_busy" :size="16" />
            </button>
          </template>
          <template v-else>
            <div class="spacer" />
            <button class="tbtn" title="assegna tempi" @click.stop="$emit('toggle-timed', task.id)">
              <MIcon name="event_available" :size="16" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row { display: grid; grid-template-columns: 48px 1fr; align-items: stretch; }
.rail { position: relative; display: flex; align-items: center; justify-content: center; }
.spine { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--md-sys-color-outline-variant); }
.spine.is-done { background: var(--md-sys-color-primary); }

.mk-circle {
  position: relative; z-index: 2; width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--md-sys-color-surface); color: var(--md-sys-color-on-primary);
  box-sizing: border-box;
}
.mk-circle.untimed,
.mk-circle.timed { border: 2px solid var(--md-sys-color-outline); }
.mk-circle.done  { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.mk-circle.late  { background: var(--md-sys-color-error); color: #fff; }
.mk-bang { font-size: 13px; font-weight: 900; line-height: 1; }

.cell { padding: 4px 0 4px 12px; min-width: 0; }
.task { border-radius: var(--md-sys-shape-corner-medium); padding: 10px 12px; margin: 2px 0; min-width: 0; overflow: hidden; transition: background .15s; }
.task:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface)); }
.task.done { opacity: .55; }

.trow { display: flex; align-items: center; gap: 8px; min-width: 0; cursor: pointer; user-select: none; }
.tn { font-family: var(--md-sys-typescale-body-large-font); font-size: 15px; flex: 1; color: var(--md-sys-color-on-surface); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt { font-size: 11px; color: var(--md-sys-color-on-surface-variant); white-space: nowrap; flex: 0 0 auto; }
.dt.late { color: var(--md-sys-color-error); font-weight: 500; }

.trow2 { display: flex; align-items: center; gap: 8px; margin-top: 8px; min-width: 0; }
.spacer { flex: 1; }
/* assegnatari: cerchietti sovrapposti che, al hover o al tap, si aprono TUTTI
   in pillole (Nome Cognome) spostando il layout di conseguenza */
.avg { display: flex; align-items: center; flex-wrap: wrap; gap: 0; flex: 0 1 auto; cursor: pointer; }
.avg.is-open, .avg:hover { gap: 6px; }
.av-pill { display: inline-flex; align-items: center; background: #05090F; border-radius: 999px; transition: margin-left .2s ease, padding-right .2s ease; }
.av-pill:not(:first-child) { margin-left: -7px; }
.avg.is-open .av-pill, .avg:hover .av-pill { margin-left: 0; padding-right: 4px; }
.av-pill .av { border: 1.5px solid var(--md-sys-color-surface); border-radius: 50%; flex: 0 0 auto; }
.av-name {
  max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0; padding-left: 0;
  color: #fff; font-size: 11px; font-weight: 500; line-height: 1;
  transition: max-width .22s ease, opacity .15s ease, padding-left .2s ease;
}
.avg.is-open .av-name, .avg:hover .av-name { max-width: 160px; opacity: 1; padding-left: 6px; }

.timebar { position: relative; flex: 1; min-width: 0; height: 14px; border-radius: 5px; background: var(--md-sys-color-surface-container-high); touch-action: none; }
.bar { position: absolute; top: 0; height: 14px; border-radius: 5px; background: var(--md-sys-color-primary); opacity: .9; touch-action: none; cursor: grab; }
.bar.done { opacity: 1; }
.bar:active { cursor: grabbing; }
.grip { position: absolute; top: 3px; width: 2px; height: 8px; background: rgba(255,255,255,.75); border-radius: 1px; }
.gl { left: 4px; } .gr { right: 4px; }

.tbtn { width: 30px; height: 30px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--md-sys-color-on-surface-variant); border-radius: var(--md-sys-shape-corner-full); cursor: pointer; }
.tbtn:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.task.done .tbtn { opacity: .4; pointer-events: none; }
/* task completata: non si può trascinare/ridimensionare il timebar né modificare i tempi */
.task.done .timebar { pointer-events: none; }
.task.done .bar { cursor: default; }
</style>
