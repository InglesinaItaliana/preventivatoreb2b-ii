<script setup lang="ts">
import { ref } from 'vue'
import MIcon from '../../shared/MIcon.vue'

defineProps<{
  /** Fascia compatta sotto MdPageHeader (senza bordi arrotondati). */
  compact?: boolean
}>()

const emit = defineEmits<{ files: [FileList] }>()
const dragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files?.length) emit('files', e.dataTransfer.files)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) emit('files', input.files)
  input.value = ''
}

function openPicker() {
  inputRef.value?.click()
}

defineExpose({ openPicker })
</script>

<template>
  <div
    class="na-upload"
    :class="{ 'is-dragging': dragging, 'is-compact': compact }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="openPicker"
  >
    <MIcon :name="compact ? 'upload_file' : 'upload_file'" :size="compact ? 20 : 32" />
    <p class="na-upload-title">Trascina file qui o clicca per caricare</p>
    <p v-if="!compact" class="na-upload-sub">PDF, immagini e documenti</p>
    <input ref="inputRef" type="file" multiple class="sr-only" @change="onPick" />
  </div>
</template>

<style scoped>
.na-upload {
  border: 2px dashed var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.na-upload.is-compact {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  border: none;
  border-top: 1px dashed var(--md-sys-color-outline-variant);
  border-radius: 0;
  padding: 10px 16px;
  text-align: left;
}
.na-upload.is-compact .na-upload-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.na-upload.is-dragging,
.na-upload:hover {
  border-color: var(--md-sys-color-primary);
  background: var(--md-sys-color-primary-state-hover, color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent));
}
.na-upload.is-compact.is-dragging,
.na-upload.is-compact:hover {
  border-top-color: var(--md-sys-color-primary);
}
.na-upload-title { margin: 8px 0 4px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.na-upload-sub { margin: 0; font-size: 12px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); border: 0;
}
</style>
