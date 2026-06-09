<script setup lang="ts">
/**
 * CalloutNode — NodeView Vue per `callout` (blocco evidenziato stile Notion).
 *
 * Sfondo tenue per tono (info/warn/success/danger), niente bordo né barra
 * accent. Icona dal picker (solo il glyph: il COLORE è fisso sul tono). Il
 * selettore di tono compare solo all'hover. Corpo editabile via NodeViewContent.
 */
import { ref, computed } from 'vue'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'
import MaterialIcon from './MaterialIcon.vue'
import IconPicker, { type IconValue } from './IconPicker.vue'

type Tone = 'info' | 'warn' | 'success' | 'danger'

const TONES: { key: Tone; label: string; glyph: string; color: string }[] = [
  { key: 'info', label: 'Info', glyph: 'info', color: '#2563EB' },
  { key: 'warn', label: 'Attenzione', glyph: 'warning', color: '#B45309' },
  { key: 'success', label: 'Successo', glyph: 'check_circle', color: '#15803D' },
  { key: 'danger', label: 'Pericolo', glyph: 'error', color: '#B91C1C' },
]

const props = defineProps<{
  node: { attrs: { tone: Tone; icon: IconValue | null } }
  updateAttributes: (attrs: Record<string, unknown>) => void
}>()

const showPicker = ref(false)

const tone = computed<Tone>(() => props.node.attrs.tone ?? 'info')
const toneDef = computed(() => TONES.find(t => t.key === tone.value) ?? TONES[0])
const icon = computed<IconValue | null>(() => props.node.attrs.icon ?? null)

function setTone(t: Tone) {
  props.updateAttributes({ tone: t })
}
function onIconChange(value: IconValue | null) {
  // Conserviamo solo il glyph/fill; il colore in render è SEMPRE quello del tono.
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
    <!-- Icona (colore fisso = tono) -->
    <div class="nd-callout-aside" contenteditable="false">
      <button
        type="button"
        class="nd-callout-icon-btn"
        :aria-label="icon ? `Cambia icona (${icon.name})` : 'Scegli icona'"
        @click="showPicker = !showPicker"
      >
        <MaterialIcon
          :name="icon?.name ?? toneDef.glyph"
          :size="22"
          :color="toneDef.color"
          :fill="icon?.fill ?? 0"
        />
      </button>

      <div v-if="showPicker" class="nd-callout-picker">
        <IconPicker
          :modelValue="icon"
          :hideColor="true"
          @update:modelValue="onIconChange"
          @close="showPicker = false"
        />
      </div>
    </div>

    <!-- Corpo editabile -->
    <NodeViewContent class="nd-callout-body" />

    <!-- Selettore tono: solo all'hover, in alto a destra -->
    <div class="nd-callout-tones" contenteditable="false">
      <button
        v-for="t in TONES"
        :key="t.key"
        type="button"
        class="nd-callout-tone"
        :class="{ 'is-active': t.key === tone }"
        :style="{ '--dot': t.color }"
        :title="t.label"
        :aria-label="t.label"
        @click="setTone(t.key)"
      />
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.nd-callout {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0.8em 0;
  padding: 12px 14px;
  border-radius: var(--md-sys-shape-corner-medium, 12px);
  background: var(--tone-bg);
}
/* Solo sfondo tenue per tono — niente bordo né barra accent. */
.nd-callout--info    { --tone-accent: #2563EB; --tone-bg: color-mix(in srgb, #2563EB 9%, transparent); }
.nd-callout--warn    { --tone-accent: #B45309; --tone-bg: color-mix(in srgb, #B45309 10%, transparent); }
.nd-callout--success { --tone-accent: #15803D; --tone-bg: color-mix(in srgb, #15803D 9%, transparent); }
.nd-callout--danger  { --tone-accent: #B91C1C; --tone-bg: color-mix(in srgb, #B91C1C 9%, transparent); }

.nd-callout-aside {
  position: relative;
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
  cursor: pointer;
  transition: background 0.15s;
}
.nd-callout-icon-btn:hover {
  background: color-mix(in srgb, var(--tone-accent) 14%, transparent);
}
.nd-callout-picker {
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 50;
}

.nd-callout-body {
  flex: 1 1 auto;
  min-width: 0;
}
.nd-callout-body :deep(> :first-child) { margin-top: 0; }
.nd-callout-body :deep(> :last-child) { margin-bottom: 0; }

/* Selettore tono nascosto: compare solo all'hover sul callout. */
.nd-callout-tones {
  position: absolute;
  top: 8px;
  right: 10px;
  display: flex;
  gap: 5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.nd-callout:hover .nd-callout-tones {
  opacity: 1;
  pointer-events: auto;
}
.nd-callout-tone {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: var(--dot);
  color: var(--dot);
  cursor: pointer;
  padding: 0;
  opacity: 0.55;
  transition: opacity 0.15s, transform 0.15s;
}
.nd-callout-tone:hover { opacity: 0.9; transform: scale(1.15); }
.nd-callout-tone.is-active {
  opacity: 1;
  box-shadow: 0 0 0 2px var(--page-bg, #FFF8F0), 0 0 0 3px currentColor;
}
</style>
