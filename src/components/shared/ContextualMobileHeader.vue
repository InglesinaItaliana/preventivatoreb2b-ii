<script setup lang="ts">
/**
 * Mobile-only header: back button (contextual) + wordmark dotted del modulo.
 *
 * Rendering condizionale via CSS dal parent (.s-mobile-layout / display: none
 * altrove). Il back-button appare solo su pagine non-top-level dello scope,
 * usando ScopeConfig.isTopLevelPath().
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../pulsar/MIcon.vue'
import ScopeBrandIcon from './ScopeBrandIcon.vue'
import type { ScopeId, ScopeConfig } from '../../views/sidera/scopeConfig'

const props = defineProps<{
  scope: Exclude<ScopeId, 'sidera'>
  config: ScopeConfig
}>()

const route = useRoute()
const router = useRouter()

const showBackButton = computed(() => !props.config.isTopLevelPath(route.path))

// Spezza il wordmark in singole lettere intervallate da puntini (P·U·L·S·A·R).
const wordmarkLetters = computed(() => props.config.wordmark.split(''))
</script>

<template>
  <header class="cm-header">
    <button
      v-if="showBackButton"
      class="cm-back-btn"
      :aria-label="'Indietro'"
      @click="router.back()"
    >
      <MIcon name="arrow_back" :size="20" />
    </button>
    <div class="cm-brand">
      <ScopeBrandIcon :scope="scope" :size="32" />
      <span class="cm-brand-text">
        <template v-for="(letter, i) in wordmarkLetters" :key="i">
          <span class="cm-ltr">{{ letter }}</span>
          <span v-if="i < wordmarkLetters.length - 1" class="cm-dot">·</span>
        </template>
      </span>
    </div>
  </header>
</template>

<style scoped>
.cm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  flex-shrink: 0;
}

.cm-back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 8px;
  transition: background 0.15s;
}
.cm-back-btn:hover { background: var(--md-sys-color-surface-container); }

.cm-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.cm-brand-text {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--md-sys-color-on-surface);
}

.cm-ltr { display: inline-block; }
.cm-dot {
  font-weight: 400;
  opacity: 0.4;
  display: inline-block;
  margin: 0 0.06em;
  position: relative;
  top: -0.08em;
}
</style>
