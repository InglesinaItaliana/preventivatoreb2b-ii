<script setup lang="ts">
import { ref } from 'vue'
import MIcon from '../shared/MIcon.vue'
import CepheidTimelineTaskRow from './CepheidTimelineTaskRow.vue'
import type { TeamMember } from '../../composables/sidera/useTeamMembers'
import { fmt, type PhaseVM } from '../../composables/cepheid/useProjectTimeline'

const props = defineProps<{
  phase: PhaseVM
  members: TeamMember[]
  preview: Record<string, { leftPct: number; widthPct: number }>
}>()

const emit = defineEmits<{
  (e: 'toggle-done', id: string): void
  (e: 'toggle-timed', id: string): void
  (e: 'set-phase-due', payload: { phase: PhaseVM; iso: string }): void
  (e: 'approve', id: string): void
  (e: 'unapprove', id: string): void
}>()

const dueInput = ref<HTMLInputElement | null>(null)
function openDuePicker() {
  const el = dueInput.value; if (!el) return
  if (el.showPicker) { try { el.showPicker() } catch { el.click() } } else el.click()
}
</script>

<template>
  <!-- task rows della fase -->
  <CepheidTimelineTaskRow
    v-for="t in phase.tasks"
    :key="t.id"
    :task="t"
    :members="members"
    :unlocked="phase.unlocked"
    :locked="phase.approved"
    :window-days="phase.windowDays"
    :preview="preview[t.id] ?? null"
    @toggle-done="emit('toggle-done', $event)"
    @toggle-timed="emit('toggle-timed', $event)"
  />

  <!-- deliverable -->
  <div class="row" :class="{ locked: !phase.unlocked, appr: phase.approved }">
    <div class="rail">
      <div class="spine" :class="{ 'is-on': phase.ready }" />
      <div class="mk-deliv" :class="{ ready: phase.ready }">
        <MIcon v-if="phase.ready" name="inventory_2" :size="13" />
      </div>
    </div>
    <div class="cell">
      <div class="dcard" :class="{ appr: phase.approved }">
        <div class="dhead">
          <div class="cn">{{ phase.delivName }}</div>
          <div class="ddwrap">
            <span class="ddlab">scadenza</span>
            <span class="ddval">{{ fmt(phase.windowEnd) }}</span>
            <button
              class="tbtn"
              title="modifica scadenza"
              :disabled="phase.approved"
              :style="phase.approved ? 'opacity:.4;pointer-events:none' : ''"
              @click="openDuePicker"
            ><MIcon name="calendar_month" :size="15" /></button>
            <input
              ref="dueInput"
              type="date"
              class="due-hidden"
              :value="phase.dueIso"
              :min="phase.minDueIso"
              :max="phase.maxDueIso"
              @change="emit('set-phase-due', { phase, iso: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
        <div v-if="phase.approved" class="cs cs-approved">
          approvato
          <button class="undo-appr" title="Annulla approvazione (test)" @click="emit('unapprove', phase.id)">
            <MIcon name="undo" :size="14" />
          </button>
        </div>
        <div v-else-if="phase.delivLate" class="cs late">approvazione in ritardo</div>
        <div v-else-if="phase.ready" class="cs ready">pronto — approva per attivare la milestone</div>
        <div v-else class="cs">in attesa dei task</div>
        <button v-if="phase.canApprove" class="approve" @click="emit('approve', phase.id)">
          <MIcon name="check" :size="16" /> Approva {{ phase.delivName }}
        </button>
      </div>
    </div>
  </div>

  <div class="gap" />
</template>

<style scoped>
.row { display: grid; grid-template-columns: 48px 1fr; align-items: stretch; }
/* gating: fase non ancora attiva → non interattiva ma SENZA dimming (no opacity) */
.row.locked { pointer-events: none; }
.rail { position: relative; display: flex; align-items: center; justify-content: center; }
.spine { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--md-sys-color-outline-variant); }
.spine.is-on { background: var(--md-sys-color-primary); }
/* deliverable approvato: la linea colorata si ferma al marker e non prosegue
   verso la milestone, lasciando uno stacco visivo netto */
.row.appr .spine.is-on { bottom: calc(50% + 12px); border-radius: 1px; }
.cell { padding: 4px 0 4px 12px; min-width: 0; }

/* marker quadrato (deliverable) */
.mk-deliv {
  position: relative; z-index: 2; width: 24px; height: 24px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--md-sys-color-outline); color: var(--md-sys-color-outline);
  background: var(--md-sys-color-surface);
}
.mk-deliv.ready { background: var(--md-sys-color-primary); border-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }

.due-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; margin: 0; }

.dcard { position: relative; min-height: 60px; display: flex; flex-direction: column; justify-content: center; gap: 4px; background: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-large); padding: 12px 15px; margin: 5px 0; transition: background .2s, border-color .2s; }
.dcard.appr { border-color: transparent; background: var(--md-sys-color-primary-container); opacity: .6; }
.dhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cn { font-size: 16px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.dcard.appr .cn { color: var(--md-sys-color-on-primary-container); }
.cs { font-size: 13px; color: var(--md-sys-color-on-surface-variant); }
.cs.ready { color: var(--md-sys-color-primary); font-weight: 500; }
.cs.late { color: var(--md-sys-color-error); font-weight: 500; }
.cs-approved { display: flex; align-items: center; gap: 6px; }
.undo-appr {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: 0; border-radius: var(--md-sys-shape-corner-full);
  background: color-mix(in srgb, var(--md-sys-color-on-primary-container) 12%, transparent);
  color: var(--md-sys-color-on-primary-container); cursor: pointer;
}
.undo-appr:hover { background: color-mix(in srgb, var(--md-sys-color-on-primary-container) 22%, transparent); }
.ddwrap { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.ddlab { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }
.ddval { font-size: 11px; font-weight: 500; color: var(--md-sys-color-on-surface); }
.dcard.appr .ddlab, .dcard.appr .ddval { color: var(--md-sys-color-on-primary-container); }

.tbtn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--md-sys-color-on-surface-variant); border-radius: var(--md-sys-shape-corner-full); cursor: pointer; }
.tbtn:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }

.approve { display: inline-flex; align-items: center; gap: 6px; margin-top: 11px; height: 40px; padding: 0 18px; border-radius: var(--md-sys-shape-corner-full); border: 0; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; align-self: flex-start; }
.approve:active { transform: scale(.97); }

.gap { height: 6px; position: relative; }
.gap::before { content: ''; position: absolute; left: 24px; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--md-sys-color-outline-variant); }
</style>
