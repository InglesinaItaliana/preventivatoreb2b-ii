<script setup lang="ts">
/**
 * Mobile-only bottom navigation: pillola con N voci + FAB (slot a destra).
 *
 * Le voci vengono da ScopeConfig.mobileNav. Il FAB viene renderizzato da
 * <ContextualFab> sibling, ma è ergonomico raggrupparli visivamente: il
 * parent monta entrambi adiacenti.
 *
 * Rendering condizionale via CSS dal parent (display:none su desktop).
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from './MIcon.vue'
import type { ScopeConfig } from '../../views/sidera/scopeConfig'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'

const props = defineProps<{
  config: ScopeConfig
  /** Numero task da smistare (CEPHEID): mostra la stella pulsante su Smistamento. */
  triageCount?: number
}>()

const route = useRoute()
const router = useRouter()

// Normalizza il trailing slash: la start_url PWA è `/scope/` e all'apertura
// dell'app installata route.path può arrivare con lo slash finale, facendo
// fallire l'isActive (e analogamente isTopLevelPath nell'header) per la 1a tab.
function normalize(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  return stripped || '/'
}

function isActive(item: { path: string; exact: boolean }) {
  const current = normalize(route.path)
  const itemPath = normalize(item.path)
  if (item.exact) return current === itemPath
  // Match esatto OR startsWith con separatore: evita che /quasar matchi /quasarsomething.
  return current === itemPath || current.startsWith(itemPath + '/')
}

const { currentUser } = useCurrentUser()
const { isCoreAdmin } = useCoreAdmins()

// Voci marcate requiresCoreAdmin (es. "Doc" sotto NEBULA in Fase 1 di
// NEBULA-DOCS) sono nascoste a chi non è CORE admin. Filtro coerente con
// quello in SideraLayout.vue (sidebar desktop).
const items = computed(() =>
  props.config.mobileNav.filter(it => !it.requiresCoreAdmin || isCoreAdmin(currentUser.value?.email))
)
</script>

<template>
  <nav v-if="items.length" class="cm-bottom-nav" aria-label="Bottom navigation">
    <div class="cm-nav-pill">
      <button
        v-for="item in items"
        :key="item.path"
        class="cm-pill-btn"
        :class="{ 'is-active': isActive(item) }"
        :aria-label="item.label"
        @click="router.push(item.path)"
      >
        <MIcon
          :name="item.icon"
          :filled="isActive(item)"
          class="cm-pill-icon"
        />
        <span
          v-if="item.path === '/cepheid/smistamento' && (triageCount ?? 0) > 0"
          class="cm-triage-star"
          aria-label="Task da smistare"
        >★</span>
      </button>
    </div>
    <slot name="fab" />
  </nav>
</template>

<style scoped>
.cm-bottom-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px calc(30px + env(safe-area-inset-bottom));
  background: transparent;
  flex-shrink: 0;
  pointer-events: none;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
}
.cm-bottom-nav > * { pointer-events: auto; }

.cm-nav-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-full);
  padding: 9px 12px;
  box-shadow: var(--md-sys-elevation-level-1);
}

.cm-pill-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 52px;
  border-radius: var(--md-sys-shape-corner-full);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-primary);
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  padding: 0;
}
.cm-pill-btn:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
}
.cm-pill-btn.is-active {
  background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent);
}

.cm-pill-icon { font-size: 36px; }

/* indicatore "c'è lavoro": stella oro CEPHEID che pulsa quando ci sono task da smistare */
.cm-triage-star {
  position: absolute;
  top: 6px;
  right: 10px;
  color: #D4A020;
  font-size: 14px;
  line-height: 1;
  text-shadow: 0 0 6px rgba(212, 160, 32, 0.6);
  pointer-events: none;
  animation: cph-star-pulse 1.6s ease-in-out infinite;
}
@keyframes cph-star-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%      { transform: scale(1.3);  opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cm-triage-star { animation: none; }
}
</style>
