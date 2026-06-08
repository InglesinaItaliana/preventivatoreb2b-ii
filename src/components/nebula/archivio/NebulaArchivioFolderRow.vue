<script setup lang="ts">
import MIcon from '../../shared/MIcon.vue'
import type { NebulaArchivioFolder } from '../../../types/nebula-fleet'

defineProps<{
  folder: NebulaArchivioFolder
  canManage?: boolean
}>()

const emit = defineEmits<{ open: []; delete: [] }>()
</script>

<template>
  <li class="nah-folder-wrap">
    <button type="button" class="nah-item-main" @click="emit('open')">
      <span class="material-symbols-outlined nah-item-icon">folder</span>
      <div class="nah-item-meta">
        <span class="nah-item-title">{{ folder.name }}</span>
        <div class="nah-item-sub">Cartella</div>
      </div>
      <MIcon name="chevron_right" :size="20" class="nah-folder-chevron" />
    </button>
    <div v-if="canManage" class="nah-item-actions">
      <button
        type="button"
        class="nah-icon-btn nah-danger"
        title="Elimina cartella"
        @click.stop="emit('delete')"
      >
        <MIcon name="delete" :size="18" />
      </button>
    </div>
  </li>
</template>

<style scoped>
.nah-folder-wrap {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.nah-item-main {
  flex: 1;
  min-width: 0;
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
  .nah-item-main:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
  }
  .nah-item-main:hover .nah-item-title { color: #C46030; }
}
.nah-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.nah-item-meta { flex: 1; min-width: 0; overflow: hidden; }
.nah-item-title {
  font-weight: 500;
  font-size: 14.5px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nah-item-sub { font-size: 11.5px; color: #888; margin-top: 2px; }
.nah-folder-chevron { color: var(--md-sys-color-on-surface-variant); flex-shrink: 0; }
.nah-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
.nah-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
}
.nah-icon-btn:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface)); }
.nah-danger:hover { color: #c62828; }
</style>
