<script setup lang="ts">
/**
 * ObiettivoMentionNode — NodeView Vue per il nodo TipTap `obiettivoMention`.
 *
 * Riceve i node attrs `{ obiettivoId, title }`. Sottoscrive live all'obiettivo
 * via useObiettivoMini per il titolo aggiornato. `title` è uno snapshot di
 * fallback per quando l'obiettivo non è risolvibile (eliminato).
 *
 * Colore = QUASAR (seed #98C0D0) in stile M3 tonale: gli obiettivi sono
 * concettualmente vicini a QUASAR (probabile migrazione futura).
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

// QUASAR: colore vivo #98C0D0 su testo+icona; sfondo/bordo derivati.
const QUASAR_ICON = '#98C0D0'
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
    :title="label"
    contenteditable="false"
    @click="onClick"
  >
    <span v-if="loading" class="ob-icon"><MaterialIcon name="hourglass_top" :size="14" /></span>
    <span v-else-if="notFound" class="ob-icon"><MaterialIcon name="link_off" :size="14" /></span>
    <span v-else class="ob-icon"><MaterialIcon name="track_changes" :size="14" :fill="isDone ? 1 : 0" :color="QUASAR_ICON" /></span>
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
  /* QUASAR (seed #98C0D0) — testo+icona vividi, sfondo/bordo derivati */
  background: color-mix(in srgb, #98C0D0 18%, transparent);
  border: 1px solid color-mix(in srgb, #98C0D0 45%, transparent);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #98C0D0;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: normal;
  max-width: 100%;
}
.ob-chip:hover {
  background: color-mix(in srgb, #98C0D0 30%, transparent);
  border-color: color-mix(in srgb, #98C0D0 65%, transparent);
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
