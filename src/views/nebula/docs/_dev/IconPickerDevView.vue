<script setup lang="ts">
/**
 * Dev page per testare IconPicker — `/nebula/docs/_dev/icons`.
 *
 * Solo per validare visivamente picker + catalogo + ricerca + palette.
 * Non parte di flusso utente. Resta nel branch finché abbiamo bisogno di
 * vedere il picker isolato; può essere rimossa o tenuta dietro flag dev.
 */
import { ref, computed } from 'vue'
import IconPicker, { type IconValue } from '../components/IconPicker.vue'
import MaterialIcon from '../components/MaterialIcon.vue'
import { ICON_COUNT, ICON_CATEGORIES } from '../iconCatalog'

const value = ref<IconValue | null>(null)

const jsonOut = computed(() => JSON.stringify(value.value, null, 2))
</script>

<template>
  <div class="ipd-root">
    <header class="ipd-header">
      <MaterialIcon name="palette" :size="28" color="#C46030" />
      <div>
        <h1>IconPicker · Dev</h1>
        <p>
          {{ ICON_COUNT }} icone Material Symbols ·
          {{ ICON_CATEGORIES.length }} categorie · ricerca fuzzy
        </p>
      </div>
    </header>

    <div class="ipd-grid">
      <section class="ipd-picker-col">
        <h2>Picker</h2>
        <IconPicker v-model="value" />
      </section>

      <section class="ipd-out-col">
        <h2>Selezione corrente</h2>
        <div class="ipd-preview-box">
          <MaterialIcon
            v-if="value"
            :name="value.name"
            :size="64"
            :color="value.color"
            :fill="value.fill"
          />
          <span v-else class="ipd-empty">Nessuna</span>
        </div>
        <h3>JSON v-model</h3>
        <pre class="ipd-json">{{ jsonOut }}</pre>

        <h3>Render multi-size</h3>
        <div class="ipd-sizes">
          <template v-if="value">
            <span v-for="s in [16, 20, 24, 32, 48]" :key="s" class="ipd-size">
              <MaterialIcon :name="value.name" :size="s" :color="value.color" :fill="value.fill" />
              <em>{{ s }}px</em>
            </span>
          </template>
          <span v-else class="ipd-empty">—</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ipd-root {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.ipd-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.ipd-header h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 26px;
  margin: 0;
}
.ipd-header p {
  margin: 2px 0 0;
  font-size: 13px;
  color: #777;
}
.ipd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}
@media (max-width: 860px) {
  .ipd-grid { grid-template-columns: 1fr; }
}
section h2 {
  font-size: 15px;
  font-weight: 500;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
}
section h3 {
  font-size: 13px;
  font-weight: 500;
  margin: 18px 0 8px;
  color: #777;
}
.ipd-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  background: #fafafa;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
}
.ipd-empty {
  color: #bbb;
  font-style: italic;
  font-size: 13px;
}
.ipd-json {
  background: #1f1f1f;
  color: #e2e2e2;
  padding: 12px 14px;
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  margin: 0;
}
.ipd-sizes {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px;
  background: #fafafa;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.06);
}
.ipd-size {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ipd-size em {
  font-style: normal;
  font-size: 10.5px;
  color: #999;
}
</style>
