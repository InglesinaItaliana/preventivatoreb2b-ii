<script setup lang="ts">
/**
 * CalloutNode — NodeView Vue per `callout` (blocco evidenziato stile Notion).
 *
 * Header non-editabile: bottone icona (apre IconPicker) + 4 pill per il tono.
 * Corpo editabile via NodeViewContent (`block+`). Tono → colore/sfondo.
 * Attrs persistiti via `updateAttributes` (pattern di TaskEmbedNode).
 */
import { ref, computed } from 'vue'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'
import MaterialIcon from './MaterialIcon.vue'
import IconPicker, { type IconValue } from './IconPicker.vue'

type Tone = 'info' | 'warn' | 'success' | 'danger'

const TONES: { key: Tone; label: string; glyph: string }[] = [
  { key: 'info', label: 'Info', glyph: 'info' },
  { key: 'warn', label: 'Attenzione', glyph: 'warning' },
  { key: 'success', label: 'Successo', glyph: 'check_circle' },
  { key: 'danger', label: 'Pericolo', glyph: 'error' },
]

const props = defineProps<{
  node: { attrs: { tone: Tone; icon: IconValue | null } }
  updateAttributes: (attrs: Record<string, unknown>) => void
}>()

const showPicker = ref(false)

const tone = computed<Tone>(() => props.node.attrs.tone ?? 'info')
const toneGlyph = computed(() => TONES.find(t => t.key === tone.value)?.glyph ?? 'info')
const icon = computed<IconValue | null>(() => props.node.attrs.icon ?? null)

function setTone(t: Tone) {
  props.updateAttributes({ tone: t })
}
function onIconChange(value: IconValue | null) {
  props.updateAttributes({ icon: value })
}
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="nd-callout"
    :class="`nd-callout--${tone}`"
    :data-tone="tone"
  >
    <!-- Header non editabile: icona + selettore tono -->
    <div class="nd-callout-aside" contenteditable="false">
      <button
        type="button"
        class="nd-callout-icon-btn"
        :aria-label="icon ? `Cambia icona (${icon.name})` : 'Scegli icona'"
        @click="showPicker = !showPicker"
      >
        <MaterialIcon
          v-if="icon"
          :name="icon.name"
          :size="22"
          :color="icon.color ?? undefined"
          :fill="icon.fill"
        />
        <MaterialIcon v-else :name="toneGlyph" :size="22" />
      </button>

      <div v-if="showPicker" class="nd-callout-picker">
        <IconPicker
          :modelValue="icon"
          @update:modelValue="onIconChange"
          @close="showPicker = false"
        />
      </div>

      <div class="nd-callout-tones">
        <button
          v-for="t in TONES"
          :key="t.key"
          type="button"
          class="nd-callout-tone"
          :class="{ 'is-active': t.key === tone }"
          :data-tone="t.key"
          :title="t.label"
          :aria-label="t.label"
          @click="setTone(t.key)"
        />
      </div>
    </div>

    <!-- Corpo editabile -->
    <NodeViewContent class="nd-callout-body" />
  </NodeViewWrapper>
</template>

<style scoped>
.nd-callout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0.8em 0;
  padding: 12px 14px;
  border-radius: var(--md-sys-shape-corner-medium, 12px);
  border: 1px solid var(--tone-border);
  border-left: 3px solid var(--tone-accent);
  background: var(--tone-bg);
}
/* Tone palette (sfondo tenue + accento) */
.nd-callout--info    { --tone-accent: #2563EB; --tone-bg: color-mix(in srgb, #2563EB 8%, transparent); --tone-border: color-mix(in srgb, #2563EB 22%, transparent); }
.nd-callout--warn    { --tone-accent: #B45309; --tone-bg: color-mix(in srgb, #B45309 9%, transparent); --tone-border: color-mix(in srgb, #B45309 24%, transparent); }
.nd-callout--success { --tone-accent: #15803D; --tone-bg: color-mix(in srgb, #15803D 8%, transparent); --tone-border: color-mix(in srgb, #15803D 22%, transparent); }
.nd-callout--danger  { --tone-accent: #B91C1C; --tone-bg: color-mix(in srgb, #B91C1C 8%, transparent); --tone-border: color-mix(in srgb, #B91C1C 24%, transparent); }

.nd-callout-aside {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  user-select: none;
}
.nd-callout-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--md-sys-shape-corner-small, 8px);
  border: 1px solid transparent;
  background: transparent;
  color: var(--tone-accent);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.nd-callout-icon-btn:hover {
  background: color-mix(in srgb, var(--tone-accent) 12%, transparent);
  border-color: var(--tone-border);
}
.nd-callout-picker {
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 50;
}
.nd-callout-tones {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.nd-callout-tone {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  cursor: pointer;
  padding: 0;
  opacity: 0.5;
  transition: opacity 0.15s, transform 0.15s;
}
.nd-callout-tone:hover { opacity: 0.85; transform: scale(1.15); }
.nd-callout-tone.is-active { opacity: 1; box-shadow: 0 0 0 2px var(--md-sys-color-surface, #fff), 0 0 0 3px currentColor; }
.nd-callout-tone[data-tone="info"]    { background: #2563EB; color: #2563EB; }
.nd-callout-tone[data-tone="warn"]    { background: #B45309; color: #B45309; }
.nd-callout-tone[data-tone="success"] { background: #15803D; color: #15803D; }
.nd-callout-tone[data-tone="danger"]  { background: #B91C1C; color: #B91C1C; }

.nd-callout-body {
  flex: 1 1 auto;
  min-width: 0;
}
.nd-callout-body :deep(> :first-child) { margin-top: 0; }
.nd-callout-body :deep(> :last-child) { margin-bottom: 0; }
</style>
