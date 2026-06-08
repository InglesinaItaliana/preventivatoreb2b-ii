<script setup lang="ts">
import { ref, computed } from 'vue'
import MIcon from '../../shared/MIcon.vue'
import { useAllArchivioFiles } from '../../../composables/shared/useNebulaArchivio'
import type { NebulaArchivioFile } from '../../../types/nebula-fleet'

const props = defineProps<{
  open: boolean
  excludeIds?: string[]
}>()

const emit = defineEmits<{
  close: []
  select: [NebulaArchivioFile]
}>()

const { files, loading } = useAllArchivioFiles()
const search = ref('')

const filtered = computed(() => {
  const ex = new Set(props.excludeIds ?? [])
  const q = search.value.trim().toLowerCase()
  return files.value.filter(f => {
    if (ex.has(f.id)) return false
    if (!q) return true
    return f.name.toLowerCase().includes(q)
  })
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="md-modal-backdrop" @click.self="emit('close')">
      <div class="md-modal-dialog na-picker">
        <div class="md-modal-header">
          <span class="md-modal-title">Collega da Archivio</span>
          <button type="button" class="md-modal-close" @click="emit('close')">
            <MIcon name="close" :size="18" />
          </button>
        </div>
        <div class="md-modal-body">
          <input
            v-model="search"
            class="md-text-field-input na-search"
            type="search"
            placeholder="Cerca file…"
          />
          <div v-if="loading" class="na-picker-loading">Caricamento…</div>
          <div v-else-if="!filtered.length" class="na-picker-empty">Nessun file disponibile.</div>
          <ul v-else class="na-picker-list">
            <li
              v-for="f in filtered"
              :key="f.id"
              class="na-picker-item"
              @click="emit('select', f); emit('close')"
            >
              <MIcon name="insert_drive_file" :size="18" />
              <span>{{ f.name }}</span>
            </li>
          </ul>
        </div>
        <div class="md-modal-footer">
          <button type="button" class="md-btn md-btn--outlined" @click="emit('close')">Annulla</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.na-picker { max-width: 480px; width: 100%; }
.na-search {
  width: 100%;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-small);
}
.na-picker-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
.na-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
}
.na-picker-item:hover { background: var(--md-sys-color-surface-container-high); }
.na-picker-empty, .na-picker-loading {
  padding: 24px;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
}
</style>
