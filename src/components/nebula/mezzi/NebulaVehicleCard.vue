<script setup lang="ts">
import MIcon from '../../shared/MIcon.vue'
import NebulaVehicleStatusBadge from './NebulaVehicleStatusBadge.vue'
import type { Vehicle } from '../../../types/nebula-fleet'

defineProps<{
  vehicle: Vehicle
  assigneeName?: string
  deadlineStatus: 'ok' | 'warning' | 'overdue' | 'done' | 'none'
}>()

const typeIcon: Record<string, string> = {
  furgone: 'local_shipping',
  automobile: 'directions_car',
}
</script>

<template>
  <button type="button" class="nmv-item">
    <span class="material-symbols-outlined nmv-item-icon">{{ typeIcon[vehicle.type] ?? 'directions_car' }}</span>
    <div class="nmv-item-meta">
      <div class="nmv-item-title-row">
        <span class="nmv-item-title">{{ vehicle.plate }}</span>
        <span v-if="vehicle.status !== 'active'" class="nmv-status-pill">{{ vehicle.status }}</span>
      </div>
      <div class="nmv-item-sub">{{ vehicle.brand }} {{ vehicle.model }}</div>
      <div v-if="assigneeName" class="nmv-item-sub">{{ assigneeName }}</div>
    </div>
    <NebulaVehicleStatusBadge :status="deadlineStatus" />
    <MIcon name="chevron_right" :size="20" class="nmv-chevron" />
  </button>
</template>

<style scoped>
.nmv-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 6px;
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
@media (hover: hover) {
  .nmv-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
  }
  .nmv-item:hover .nmv-item-title { color: #C46030; }
}
.nmv-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.nmv-item-meta { flex: 1; min-width: 0; overflow: hidden; }
.nmv-item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.nmv-item-title {
  font-weight: 500;
  font-size: 14.5px;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.nmv-item-sub {
  font-size: 11.5px;
  color: #888;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nmv-status-pill {
  flex-shrink: 0;
  text-transform: capitalize;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--md-sys-color-surface-container-highest);
}
.nmv-chevron {
  color: var(--md-sys-color-on-surface-variant);
  flex-shrink: 0;
}
</style>
