<script setup lang="ts">
/**
 * DeliverableMentionNode — NodeView Vue per il nodo TipTap `deliverableMention`.
 *
 * Riceve i node attrs `{ deliverableId, projectId }`. Un deliverable è un task
 * con type=deliverable, quindi riusa useTaskMini per la subscription live.
 *
 * Famiglia colore: teal (distinta da task=oro / milestone=indaco).
 * Deep-link: /cepheid/project/{projectId} (nuova tab).
 *
 * Storage in ProseMirror JSON:
 *   { "type": "deliverableMention", "attrs": { "deliverableId": "...", "projectId": "..." } }
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useTaskMini } from '../../../../composables/nebula/useTaskMini'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps<{
  node: {
    attrs: {
      deliverableId: string | null
      projectId: string | null
    }
  }
}>()

const idRef = toRef(() => props.node.attrs.deliverableId)
const projectIdRef = toRef(() => props.node.attrs.projectId)

const { data: deliverable, loading, notFound } = useTaskMini(idRef, projectIdRef)

const isDone = computed(() => deliverable.value?.status === 'done')

function onClick() {
  if (!deliverable.value) return
  const pid = deliverable.value.projectId
  window.open(pid ? `/cepheid/project/${pid}` : '/cepheid', '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="dl-chip"
    :class="{ 'dl-loading': loading, 'dl-deleted': notFound, 'dl-done': isDone }"
    :title="deliverable?.title ?? (notFound ? 'Deliverable eliminato' : 'Caricamento…')"
    contenteditable="false"
    @click="notFound ? null : onClick()"
  >
    <span v-if="loading" class="dl-icon"><MaterialIcon name="hourglass_top" :size="14" /></span>
    <span v-else-if="notFound" class="dl-icon"><MaterialIcon name="link_off" :size="14" /></span>
    <span v-else class="dl-icon"><MaterialIcon name="inventory_2" :size="14" :fill="isDone ? 1 : 0" color="#1f7a7a" /></span>
    <span class="dl-label">
      <template v-if="loading">…</template>
      <template v-else-if="notFound">[Deliverable eliminato]</template>
      <template v-else>{{ deliverable?.title }}</template>
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.dl-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  margin: 0 2px;
  /* Teal — distinto da task (oro) / milestone (indaco) / project (verde) */
  background: rgba(31, 122, 122, 0.12);
  border: 1px solid rgba(31, 122, 122, 0.30);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #18605f;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: normal;
  max-width: 100%;
}
.dl-chip:hover {
  background: rgba(31, 122, 122, 0.20);
  border-color: rgba(31, 122, 122, 0.50);
}
.dl-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.dl-label { overflow-wrap: anywhere; }

.dl-done {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: rgba(24, 96, 95, 0.45);
}
.dl-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}
.dl-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
