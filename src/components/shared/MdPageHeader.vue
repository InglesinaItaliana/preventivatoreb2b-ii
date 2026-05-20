<script setup lang="ts">
/**
 * In-content page header (POPS standard, 2026-05-20).
 *
 * Sostituisce i pattern locali .av-header / .pv-header / .dv-header / .hv-header
 * che duplicavano lo stesso markup in ogni view CEPHEID/PULSAR/SIDERA.
 *
 * NON è il top app bar mobile — quello è <ContextualMobileHeader>, montato dal
 * layout (SideraLayout / PulsarLayout / CepheidLayout). Questo componente è
 * pensato per stare DENTRO al contenuto della view, sopra le sue card.
 *
 * Tutti i colori arrivano dai token M3 dello scope corrente. Per branding
 * scope-aware avvolgere la view in `.s-scope-<modulo>` come da ATLAS sez. 14.
 */
defineProps<{
  title: string
  subtitle?: string
  /** Nasconde il bordo inferiore — utile se la sezione successiva ha già
   *  separazione visiva propria. */
  borderless?: boolean
}>()
</script>

<template>
  <header class="md-page-header" :class="{ 'is-borderless': borderless }">
    <div class="md-page-header__text">
      <h2 class="md-page-header__title">{{ title }}</h2>
      <p v-if="subtitle" class="md-page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.cta" class="md-page-header__cta">
      <slot name="cta" />
    </div>
  </header>
</template>

<style scoped>
.md-page-header {
  padding: 18px 20px 14px;
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.md-page-header.is-borderless { border-bottom: none; }

.md-page-header__text { flex: 1; min-width: 0; }

.md-page-header__title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface);
  margin: 0 0 4px 0;
}

.md-page-header__subtitle {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin: 0;
}

.md-page-header__cta { flex-shrink: 0; display: inline-flex; }

@media (max-width: 768px) {
  .md-page-header__cta { display: none; }
}
</style>
