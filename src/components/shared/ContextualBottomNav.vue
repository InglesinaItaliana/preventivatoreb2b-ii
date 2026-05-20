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
import MIcon from '../pulsar/MIcon.vue'
import type { ScopeConfig } from '../../views/sidera/scopeConfig'

const props = defineProps<{
  config: ScopeConfig
}>()

const route = useRoute()
const router = useRouter()

function isActive(item: { path: string; exact: boolean }) {
  return item.exact ? route.path === item.path : route.path.startsWith(item.path)
}

const items = computed(() => props.config.mobileNav)
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
  border-radius: 999px;
  padding: 9px 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.cm-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 52px;
  border-radius: 999px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-primary);
  transition: background 0.18s ease, color 0.18s ease;
  padding: 0;
}
.cm-pill-btn:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
}
.cm-pill-btn.is-active {
  background: color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent);
}

.cm-pill-icon { font-size: 36px; }
</style>
