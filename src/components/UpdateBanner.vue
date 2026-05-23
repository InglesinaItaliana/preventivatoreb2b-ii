<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSWUpdate } from '../composables/shared/useSWUpdate'
import { detectScope, type ScopeId } from '../views/sidera/scopeConfig'

const { needRefresh, applyUpdate, dismiss } = useSWUpdate()
const route = useRoute()

// Scope-aware: applichiamo .s-scope-{module} al banner così i token M3
// --md-sys-color-primary risolvono al brand del modulo corrente.
// Su /pops (root '/') currentScope = 'sidera' (default), il primary
// e' var(--s-sidera) = oro tenue. Per il banner POPS-themed amber,
// override esplicito quando scope === 'sidera' e siamo nel root '/'.
const currentScope = computed<ScopeId>(() => detectScope(route.path))
const isPops = computed(() => !route.path.startsWith('/sidera') &&
                              !route.path.startsWith('/pulsar') &&
                              !route.path.startsWith('/cepheid') &&
                              !route.path.startsWith('/nebula') &&
                              !route.path.startsWith('/nova') &&
                              !route.path.startsWith('/magnetar') &&
                              !route.path.startsWith('/quasar'))
</script>

<template>
  <Transition
    enter-active-class="ub-enter-active"
    enter-from-class="ub-enter-from"
    enter-to-class="ub-enter-to"
    leave-active-class="ub-leave-active"
    leave-from-class="ub-leave-from"
    leave-to-class="ub-leave-to"
  >
    <div
      v-if="needRefresh"
      :class="['ub-wrapper', `s-scope-${currentScope}`, { 'ub-pops': isPops }]"
      role="status"
      aria-live="polite"
    >
      <div class="ub-card">
        <div class="ub-text">
          <p class="ub-title">Nuova versione disponibile</p>
          <p class="ub-sub">Aggiorna ora per applicarla.</p>
        </div>
        <button type="button" class="ub-btn ub-btn--ghost" @click="dismiss">Più tardi</button>
        <button type="button" class="ub-btn ub-btn--primary" @click="applyUpdate">Aggiorna</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ub-wrapper {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* --bottom-nav-height è definita da SideraLayout su .s-shell.s-mobile-layout (110px,
     allineato a SideraLayout.vue:790). Su desktop / scope senza bottom-nav la var non
     esiste → fallback 0px. */
  bottom: calc(var(--bottom-nav-height, 0px) + max(1rem, env(safe-area-inset-bottom)));
  z-index: 9999;
  width: min(92vw, 420px);
}

.ub-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--md-sys-color-surface) 95%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: var(--md-sys-shape-corner-large);
  box-shadow: var(--md-sys-elevation-level-3);
  /* Ring 1px col primary del scope corrente, opacità 30% */
  outline: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
}

.ub-text { flex: 1; min-width: 0; }

.ub-title {
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size:   var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  margin: 0;
}

.ub-sub {
  font-family: var(--md-sys-typescale-body-small-font);
  font-size:   var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  color: var(--md-sys-color-on-surface-variant);
  margin: 2px 0 0;
}

.ub-btn {
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size:   var(--md-sys-typescale-label-medium-size);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 6px 12px;
  cursor: pointer;
  border: none;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink: 0;
}

.ub-btn--ghost {
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
}
.ub-btn--ghost:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  color: var(--md-sys-color-on-surface);
}

.ub-btn--primary {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  box-shadow: var(--md-sys-elevation-level-1);
}
.ub-btn--primary:hover {
  background: var(--md-sys-color-primary-hover);
}

/* Override POPS: amber-400 invece di SIDERA oro tenue per coerenza storica.
   POPS non ha ancora un --md-sys-color-primary dedicato (lo scope mostra il default
   sidera). Per il banner POPS forziamo amber + testo scuro. */
.ub-wrapper.ub-pops .ub-btn--primary {
  background: #FBBF24; /* amber-400 */
  color: #1A1815;
}
.ub-wrapper.ub-pops .ub-btn--primary:hover {
  background: #F59E0B; /* amber-500 */
}
.ub-wrapper.ub-pops .ub-card {
  outline-color: color-mix(in srgb, #FBBF24 30%, transparent);
}

/* Transition classes (uso CSS scoped, sostituiscono le Tailwind transition utilities) */
.ub-enter-active { transition: opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate),
                                transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate); }
.ub-leave-active { transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-accelerate),
                                transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-accelerate); }
.ub-enter-from, .ub-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }
.ub-enter-to,   .ub-leave-from { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
