<script setup lang="ts">
/**
 * DocMentionNode — NodeView per il nodo TipTap `docMention`.
 *
 * Riceve `node.attrs.docId` + `node.attrs.title` (snapshot al momento
 * dell'insert). Click apre il doc in nuova tab. Niente fetch live: il
 * titolo snapshot è sufficiente come label; se l'utente vuole il titolo
 * aggiornato basta ri-mention.
 *
 * Storage in ProseMirror JSON:
 *   { "type": "docMention", "attrs": { "docId": "...", "title": "..." } }
 */
import { computed } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps<{
  node: {
    attrs: {
      docId: string | null
      title: string | null
    }
  }
}>()

const label = computed(() => props.node.attrs.title || '(documento)')
const targetHref = computed(() => props.node.attrs.docId ? `/nebula/docs/${props.node.attrs.docId}` : null)

function onClick() {
  if (targetHref.value) window.open(targetHref.value, '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="dm-chip"
    :class="{ 'dm-deleted': !node.attrs.docId }"
    :title="label"
    contenteditable="false"
    @click="onClick"
  >
    <span class="dm-icon">
      <MaterialIcon name="description" :size="14" color="#7A5430" />
    </span>
    <span class="dm-label">{{ label }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.dm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 4px;
  margin: 0 2px;
  /* Tono terracotta tenue, neutro rispetto a user (blu) / task (oro) / project (verde) */
  background: rgba(196, 96, 48, 0.10);
  border: 1px solid rgba(196, 96, 48, 0.30);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #7A3D14;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.dm-chip:hover {
  background: rgba(196, 96, 48, 0.20);
  border-color: rgba(196, 96, 48, 0.50);
}

.dm-icon { display: inline-flex; align-items: center; flex-shrink: 0; }

.dm-label {
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  max-width: 220px;
}

.dm-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
