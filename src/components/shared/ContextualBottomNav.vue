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
import { useCan } from '../../composables/sidera/useCan'

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
const { can } = useCan()

// Voci marcate requiresCoreAdmin (es. "Doc" sotto NEBULA in Fase 1 di
// NEBULA-DOCS) sono nascoste a chi non è CORE admin. Filtro coerente con
// quello in SideraLayout.vue (sidebar desktop).
const items = computed(() =>
  props.config.mobileNav.filter(it =>
    (!it.requiresCoreAdmin || isCoreAdmin(currentUser.value?.email)) &&
    (!it.requiresCapability || can(it.requiresCapability)),
  )
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
          v-if="item.path === '/cepheid/smistamento'"
          class="lyra-star cm-triage-indicator"
          :class="(triageCount ?? 0) > 0 ? 'lyra-star--busy' : 'lyra-star--quiet'"
          :aria-label="(triageCount ?? 0) > 0 ? 'Task da smistare' : 'Tutto smistato'"
        />
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

/* Indicatore Smistamento — posizionamento del glifo unificato .lyra-star
   (definito in src/style.css §LYRA). Il modificatore --busy/--quiet
   gestisce il visual e l'animazione. */
.cm-triage-indicator {
  position: absolute;
  top: 10px;
  right: 12px;
}
</style>
