<script setup lang="ts">
import MIcon from '../shared/MIcon.vue'

defineProps<{
  titolo: string
  colore?: string
  size?: 'sm' | 'md'
  clickable?: boolean
}>()
</script>

<template>
  <span
    class="g-chip"
    :class="{ 'g-chip--sm': size === 'sm', 'g-chip--clickable': clickable }"
    :style="{ background: (colore ?? '#D4A020') + '18', color: colore ?? '#D4A020', borderColor: (colore ?? '#D4A020') + '55' }"
  >
    <MIcon name="flag" :filled="true" :size="size === 'sm' ? 11 : 13" />
    <span class="g-chip-text">{{ titolo }}</span>
  </span>
</template>

<style scoped>
.g-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px 3px 7px;
  border: 1px solid;
  border-radius: 999px;
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  max-width: 100%;
}
.g-chip--sm {
  padding: 2px 7px 2px 5px;
  font-size: 10px;
  gap: 3px;
}
.g-chip--clickable { cursor: pointer; transition: filter 0.15s; }
.g-chip--clickable:hover { filter: brightness(0.95); }
.g-chip-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
