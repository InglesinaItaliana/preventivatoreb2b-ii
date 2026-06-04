<script setup lang="ts">
/**
 * MilestoneMentionNode — NodeView Vue per il nodo TipTap `milestoneMention`.
 *
 * Riceve i node attrs `{ milestoneId, projectId }`. Una milestone è un task con
 * type=milestone, quindi riusa useTaskMini per la subscription live (titolo +
 * status sincronizzati con CEPHEID).
 *
 * Famiglia colore: indaco (distinta da task=oro / deliverable=teal).
 * Deep-link: /cepheid/project/{projectId} (nuova tab).
 *
 * Storage in ProseMirror JSON:
 *   { "type": "milestoneMention", "attrs": { "milestoneId": "...", "projectId": "..." } }
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useTaskMini } from '../../../../composables/nebula/useTaskMini'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps<{
  node: {
    attrs: {
      milestoneId: string | null
      projectId: string | null
    }
  }
}>()

const idRef = toRef(() => props.node.attrs.milestoneId)
const projectIdRef = toRef(() => props.node.attrs.projectId)

const { data: milestone, loading, notFound } = useTaskMini(idRef, projectIdRef)

const isDone = computed(() => milestone.value?.status === 'done')

function onClick() {
  if (!milestone.value) return
  const pid = milestone.value.projectId
  window.open(pid ? `/cepheid/project/${pid}` : '/cepheid', '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="ms-chip"
    :class="{ 'ms-loading': loading, 'ms-deleted': notFound, 'ms-done': isDone }"
    :title="milestone?.title ?? (notFound ? 'Milestone eliminata' : 'Caricamento…')"
    contenteditable="false"
    @click="notFound ? null : onClick()"
  >
    <span v-if="loading" class="ms-icon"><MaterialIcon name="hourglass_top" :size="14" /></span>
    <span v-else-if="notFound" class="ms-icon"><MaterialIcon name="link_off" :size="14" /></span>
    <span v-else class="ms-icon"><MaterialIcon name="flag" :size="14" :fill="isDone ? 1 : 0" color="#4F46B8" /></span>
    <span class="ms-label">
      <template v-if="loading">…</template>
      <template v-else-if="notFound">[Milestone eliminata]</template>
      <template v-else>{{ milestone?.title }}</template>
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.ms-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  margin: 0 2px;
  /* Indaco — distinto da task (oro) / deliverable (teal) / project (verde) */
  background: rgba(79, 70, 184, 0.12);
  border: 1px solid rgba(79, 70, 184, 0.30);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #423a99;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: normal;
  max-width: 100%;
}
.ms-chip:hover {
  background: rgba(79, 70, 184, 0.20);
  border-color: rgba(79, 70, 184, 0.50);
}
.ms-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.ms-label { overflow-wrap: anywhere; }

.ms-done {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: rgba(66, 58, 153, 0.45);
}
.ms-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}
.ms-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
