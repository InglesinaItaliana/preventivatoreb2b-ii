<script setup lang="ts">
import MIcon from '../../shared/MIcon.vue'
import type { NebulaArchivioFile } from '../../../types/nebula-fleet'

defineProps<{
  file: NebulaArchivioFile
  canManage?: boolean
}>()

const emit = defineEmits<{
  open: []
  download: []
  archive: []
}>()

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
</script>

<template>
  <div class="nah-item">
    <button type="button" class="nah-item-main" @click="emit('open')" :aria-label="`Apri ${file.name}`">
      <span class="material-symbols-outlined nah-item-icon">
        {{ file.mimeType.includes('pdf') ? 'picture_as_pdf' : 'insert_drive_file' }}
      </span>
      <div class="nah-item-meta">
        <div class="nah-item-title-row">
          <span class="nah-item-title">{{ file.name }}</span>
          <span v-if="file.linkedVehicleIds.length" class="nah-link-badge">
            {{ file.linkedVehicleIds.length }} mezzo/i
          </span>
        </div>
        <div class="nah-item-sub">{{ formatSize(file.sizeBytes) }} · {{ formatDate(file.uploadedAt) }}</div>
      </div>
    </button>
    <div class="nah-item-actions">
      <button type="button" class="nah-icon-btn" title="Scarica" @click.stop="emit('download')">
        <MIcon name="download" :size="18" />
      </button>
      <button
        v-if="canManage"
        type="button"
        class="nah-icon-btn nah-danger"
        title="Elimina"
        @click.stop="emit('archive')"
      >
        <MIcon name="delete" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.nah-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px 8px 6px;
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
@media (hover: hover) {
  .nah-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
  }
  .nah-item:hover .nah-item-title { color: #C46030; }
}
.nah-item-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 0;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  border-radius: 8px;
  font: inherit;
  color: inherit;
  min-width: 0;
}
.nah-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.nah-item-meta { flex: 1; min-width: 0; overflow: hidden; }
.nah-item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.nah-item-title {
  font-weight: 500;
  font-size: 14.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.nah-item-sub {
  font-size: 11.5px;
  color: #888;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nah-link-badge {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(196, 96, 48, 0.12);
  color: #C46030;
}
.nah-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
.nah-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
}
.nah-icon-btn:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.nah-danger { color: var(--md-sys-color-error); }
</style>
