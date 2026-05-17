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
    class="m-icon"
    :class="{ 'is-filled': filled }"
    :style="{
      fontSize: typeof size === 'number' ? size + 'px' : (size as string | undefined),
      ...(weight ? { fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}` } : {})
    }"
    aria-hidden="true"
  >{{ name }}</span>
</template>
