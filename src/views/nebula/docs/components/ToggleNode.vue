<script setup lang="ts">
/**
 * ToggleNode — NodeView Vue per `toggle` (sezione collassabile stile Notion).
 *
 * Un SOLO NodeViewContent (ProseMirror ammette un solo contentDOM): contiene il
 * `toggleSummary` (primo figlio, editabile via renderHTML — niente NodeView
 * dedicato) e i blocchi del corpo. Il triangolo di disclosure commuta l'attr
 * `open`; il collasso del corpo è puramente CSS su `data-open`.
 */
import { computed } from 'vue'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps<{
  node: { attrs: { open: boolean } }
  updateAttributes: (attrs: Record<string, unknown>) => void
}>()

const open = computed(() => props.node.attrs.open !== false)

function toggle() {
  props.updateAttributes({ open: !open.value })
}
</script>

<template>
  <NodeViewWrapper as="div" class="nd-toggle" :data-open="open ? 'true' : 'false'">
    <button
      type="button"
      class="nd-toggle-tri"
      contenteditable="false"
      :aria-expanded="open"
      aria-label="Espandi o comprimi la sezione"
      @click="toggle"
    >
      <span class="nd-toggle-tri-glyph" />
    </button>
    <NodeViewContent class="nd-toggle-content" />
  </NodeViewWrapper>
</template>

<style scoped>
.nd-toggle {
  position: relative;
  margin: 0.5em 0;
  padding-left: 1.6em;
}
.nd-toggle-tri {
  position: absolute;
  left: 0;
  top: 0.15em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2em;
  height: 1.4em;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant, #6A6560);
}
.nd-toggle-tri:hover { color: var(--md-sys-color-on-surface, #1A1917); }
.nd-toggle-tri-glyph {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 6px solid currentColor;
  transition: transform 0.15s ease;
}
.nd-toggle[data-open="true"] .nd-toggle-tri-glyph { transform: rotate(90deg); }

/* Il summary (primo figlio) è il titolo: sempre visibile, peso leggero. */
.nd-toggle-content :deep(> [data-type="toggle-summary"]) {
  font-weight: 600;
  cursor: text;
}
.nd-toggle-content :deep(> [data-type="toggle-summary"]:empty)::before {
  content: 'Titolo della sezione…';
  color: var(--md-sys-color-on-surface-variant, #9a948c);
  font-weight: 400;
}
/* Corpo collassabile: nascondi tutto tranne il summary quando chiuso. */
.nd-toggle[data-open="false"] .nd-toggle-content :deep(> *:not([data-type="toggle-summary"])) {
  display: none;
}
.nd-toggle-content :deep(> :nth-child(2)) { margin-top: 0.25em; }
.nd-toggle-content :deep(> :last-child) { margin-bottom: 0; }
</style>
