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
  /** Modalità sticky con auto-hide su scroll-down (richiede il container
   *  scrollabile gestito da useAutoHideHeader). Il valore controlla solo la
   *  classe applicata; la logica sticky/transition è in CSS. */
  hidden?: boolean
  /** Attiva sticky-top per consentire l'auto-hide. Senza questo il prop
   *  `hidden` non avrebbe effetto visivo (l'header scrollerebbe via). */
  sticky?: boolean
  /** Pallino colorato prima del titolo (es. colore-identità del progetto). */
  accentColor?: string
}>()
</script>

<template>
  <header
    class="md-page-header"
    :class="{ 'is-borderless': borderless, 'is-sticky': sticky, 'is-hidden': sticky && hidden }"
  >
    <div class="md-page-header__text">
      <h2 class="md-page-header__title">
        <span v-if="accentColor" class="md-page-header__accent" :style="{ background: accentColor }" />{{ title }}
      </h2>
      <p v-if="subtitle" class="md-page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.tools" class="md-page-header__tools">
      <slot name="tools" />
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

/* Sticky + auto-hide (vedi composable useAutoHideHeader).
   Background:
   - non-sticky: surface (POPS standard, già dichiarato sopra)
   - sticky: var(--page-bg) impostato dalla view (es. #EFE7D9 CEPHEID/QUASAR)
     così l'header "match-a" il bg colorato della pagina e occlude il content
     che gli scorre sotto. Fallback a surface se la view non dichiara --page-bg.
   z-index 10 per stare sopra eventuali card con stacking context locale (es.
   CepheidProjectCard.pcard-state-overlay z-index:7 nello scope della card). */
.md-page-header.is-sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--page-bg, var(--md-sys-color-surface));
  transition: transform var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(.05,.7,.1,1));
  will-change: transform;
}
.md-page-header.is-sticky.is-hidden {
  transform: translateY(-100%);
}

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

.md-page-header__accent {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
  flex-shrink: 0;
}

.md-page-header__cta { flex-shrink: 0; display: inline-flex; }
/* tools: sempre visibile (anche mobile), a differenza di __cta */
.md-page-header__tools { flex-shrink: 0; display: inline-flex; align-items: center; }

@media (max-width: 768px) {
  .md-page-header__cta { display: none; }
}
</style>
