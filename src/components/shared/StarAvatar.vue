<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
// @ts-expect-error — starAvatar.js è un modulo vanilla senza tipi (fonte di verità, non modificato)
import { mountStarAvatar } from '../../lib/starAvatar.js'

const props = withDefaults(defineProps<{
  seed: string                 // = uid (fallback: email)
  category: string             // chiave di CATEGORIES in starAvatar.js
  hueIndex?: number            // slot colore; se undefined il motore deriva l'hue dal seed
  size?: number
  animated?: boolean
}>(), {
  size: 40,
  animated: true,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
let inst: { update: (n: any) => void; destroy: () => void } | null = null

function opts() {
  return {
    seed: props.seed,
    category: props.category,
    hueIndex: props.hueIndex,
    size: props.size,
    animated: props.animated,
  }
}

onMounted(() => {
  if (canvasRef.value) inst = mountStarAvatar(canvasRef.value, opts())
})

// Un solo watcher: il motore ricostruisce makeStar + ridimensiona il canvas.
watch(
  () => [props.seed, props.category, props.hueIndex, props.size, props.animated],
  () => { inst?.update(opts()) },
)

onUnmounted(() => {
  inst?.destroy()   // rimuove dal Set _instances -> il rAF condiviso si ferma quando vuoto
  inst = null
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="star-avatar"
    role="img"
    :aria-label="`Avatar ${category}`"
  />
</template>

<style scoped>
.star-avatar {
  display: block;
  border-radius: 50%;
  flex-shrink: 0;
  /* bollino con lo stesso fondo scuro della sidebar SIDERA: le stelle (rese con
     composite "lighter") risaltano come nel riferimento */
  background: #05090F;
}
</style>
