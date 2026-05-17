<script setup lang="ts">
defineProps<{
  name: string
  filled?: boolean
  size?: number | string
  weight?: number
}>()
</script>

<template>
  <span
    class="m-icon material-symbols-outlined"
    :class="{ 'is-filled': filled }"
    :style="{
      fontSize: typeof size === 'number' ? size + 'px' : size,
      fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight ?? 400}, 'GRAD' 0, 'opsz' 24`,
    }"
    aria-hidden="true"
  >{{ name }}</span>
</template>

<style scoped>
.m-icon {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  user-select: none;
  flex-shrink: 0;
  transition: font-variation-settings 0.25s ease, color 0.15s;
}
</style>
