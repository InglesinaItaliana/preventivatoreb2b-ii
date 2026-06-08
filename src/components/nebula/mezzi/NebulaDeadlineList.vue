<script setup lang="ts">
import MIcon from '../../shared/MIcon.vue'
import NebulaVehicleStatusBadge from './NebulaVehicleStatusBadge.vue'
import type { VehicleDeadline } from '../../../types/nebula-fleet'
import { deadlineIsAllDay } from '../../../types/nebula-fleet'
import { deadlineStatus } from '../../../composables/shared/useVehicles'

defineProps<{
  deadlines: VehicleDeadline[]
  canManage?: boolean
}>()

const emit = defineEmits<{
  complete: [string]
  edit: [VehicleDeadline]
}>()

const kindLabels: Record<string, string> = {
  assicurazione: 'Assicurazione',
  bollo: 'Bollo',
  revisione: 'Revisione',
  tagliando: 'Tagliando',
  patente: 'Patente',
  altro: 'Altro',
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(d)
}

function formatSchedule(d: VehicleDeadline) {
  if (deadlineIsAllDay(d)) return formatDate(d.dueDate)
  const date = formatDate(d.dueDate)
  const start = formatTime(d.dueDate)
  const end = d.endAt ? formatTime(d.endAt) : ''
  return end ? `${date} · ${start}–${end}` : `${date} · ${start}`
}
</script>

<template>
  <ul class="ndl">
    <li v-for="d in deadlines" :key="d.id" class="ndl-item md-card-outlined">
      <div class="ndl-main">
        <div class="ndl-title">{{ d.title || kindLabels[d.kind] || d.kind }}</div>
        <div class="ndl-date">{{ formatSchedule(d) }}</div>
      </div>
      <NebulaVehicleStatusBadge :status="deadlineStatus(d.dueDate, d.completedAt)" />
      <div v-if="canManage && !d.completedAt" class="ndl-actions">
        <button type="button" class="md-btn md-btn--text md-btn--sm" @click="emit('complete', d.id)">
          <MIcon name="check_circle" :size="16" />
        </button>
      </div>
    </li>
    <li v-if="!deadlines.length" class="ndl-empty">Nessuna scadenza registrata.</li>
  </ul>
</template>

<style scoped>
.ndl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ndl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.ndl-main { flex: 1; }
.ndl-title { font-weight: 600; font-size: 14px; }
.ndl-date { font-size: 12px; color: var(--md-sys-color-on-surface-variant); }
.ndl-empty { padding: 24px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 14px; }
</style>
