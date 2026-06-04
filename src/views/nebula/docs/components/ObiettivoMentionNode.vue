<script setup lang="ts">
/**
 * ObiettivoMentionNode — NodeView Vue per il nodo TipTap `obiettivoMention`.
 *
 * Riceve i node attrs `{ obiettivoId, title }`. Sottoscrive live all'obiettivo
 * via useObiettivoMini → il chip prende il colore dell'obiettivo (come
 * ProjectMention col campo color) e il titolo aggiornato. `title` è uno
 * snapshot di fallback per quando l'obiettivo non è risolvibile (eliminato).
 *
 * Deep-link: /cepheid/goal/{obiettivoId} (nuova tab).
 *
 * Storage in ProseMirror JSON:
 *   { "type": "obiettivoMention", "attrs": { "obiettivoId": "...", "title": "..." } }
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useObiettivoMini } from '../../../../composables/nebula/useObiettivoMini'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps<{
  node: {
    attrs: {
      obiettivoId: string | null
      title: string | null
    }
  }
}>()

const idRef = toRef(() => props.node.attrs.obiettivoId)
const { data: obiettivo, loading, notFound } = useObiettivoMini(idRef)

const color = computed(() => obiettivo.value?.colore || '#D4A020')
const isDone = computed(() => obiettivo.value?.stato === 'raggiunto')
const isArchived = computed(() => obiettivo.value?.stato === 'archiviato')
const label = computed(() => {
  if (obiettivo.value) return obiettivo.value.titolo
  if (notFound.value) return props.node.attrs.title || '[Obiettivo eliminato]'
  return props.node.attrs.title || '…'
})

function onClick() {
  const oid = props.node.attrs.obiettivoId
  if (!oid || notFound.value) return
  window.open(`/cepheid/goal/${oid}`, '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="ob-chip"
    :class="{ 'ob-loading': loading, 'ob-deleted': notFound, 'ob-done': isDone, 'ob-archived': isArchived }"
    :style="{ '--ob-color': color }"
    :title="label"
    contenteditable="false"
    @click="onClick"
  >
    <span v-if="loading" class="ob-icon"><MaterialIcon name="hourglass_top" :size="14" /></span>
    <span v-else-if="notFound" class="ob-icon"><MaterialIcon name="link_off" :size="14" /></span>
    <span v-else class="ob-icon"><MaterialIcon name="track_changes" :size="14" :fill="isDone ? 1 : 0" :color="color" /></span>
    <span class="ob-label">{{ label }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.ob-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  margin: 0 2px;
  /* Colore dinamico dall'obiettivo (come ProjectMention col campo color) */
  background: color-mix(in srgb, var(--ob-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ob-color) 32%, transparent);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: color-mix(in srgb, var(--ob-color) 75%, #1a1a1a);
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: normal;
  max-width: 100%;
}
.ob-chip:hover {
  background: color-mix(in srgb, var(--ob-color) 22%, transparent);
  border-color: color-mix(in srgb, var(--ob-color) 52%, transparent);
}
.ob-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.ob-label { overflow-wrap: anywhere; }

.ob-done {
  opacity: 0.7;
  text-decoration: line-through;
}
.ob-archived {
  opacity: 0.45;
  filter: grayscale(0.4);
}
.ob-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}
.ob-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
