<script setup lang="ts">
import MIcon from '../../shared/MIcon.vue'
import type { NebulaArchivioFolder } from '../../../types/nebula-fleet'

defineProps<{
  folder: NebulaArchivioFolder
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <li class="nah-folder-wrap">
    <button type="button" class="nah-item" @click="emit('open')">
      <span class="material-symbols-outlined nah-item-icon">folder</span>
      <div class="nah-item-meta">
        <span class="nah-item-title">{{ folder.name }}</span>
        <div class="nah-item-sub">Cartella</div>
      </div>
      <MIcon name="chevron_right" :size="20" class="nah-folder-chevron" />
    </button>
  </li>
</template>

<style scoped>
.nah-folder-wrap { list-style: none; }
.nah-item {
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
  .nah-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
  }
  .nah-item:hover .nah-item-title { color: #C46030; }
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
</style>
