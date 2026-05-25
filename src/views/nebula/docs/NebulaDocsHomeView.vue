<script setup lang="ts">
/**
 * NEBULA-DOCS — Home (stub Fase 1, scaffolding).
 *
 * Placeholder che conferma routing + gate CORE admin. L'implementazione reale
 * (lista doc, gerarchia, CTA "Nuovo doc") arriva in Fase 1 chunk 2-4 e
 * successivi (vedi docs/NEBULA-DOCS.md §11).
 */
import { computed } from 'vue'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { useCoreAdmins } from '../../../composables/sidera/useCoreAdmins'

const { currentUser } = useCurrentUser()
const { isCoreAdmin } = useCoreAdmins()

const allowed = computed(() => isCoreAdmin(currentUser.value?.email))
</script>

<template>
  <div class="ndh-root">
    <div v-if="!allowed" class="ndh-denied" role="status">
      <span class="material-symbols-outlined ndh-icon">lock</span>
      <h2>Accesso non autorizzato</h2>
      <p>NEBULA-DOCS è in Fase 1 e visibile solo agli amministratori CORE.</p>
    </div>

    <div v-else class="ndh-placeholder">
      <span class="material-symbols-outlined ndh-icon">description</span>
      <h2>NEBULA-DOCS</h2>
      <p class="ndh-stage">Fase 1 · Scaffolding</p>
      <p class="ndh-hint">
        Lista doc, gerarchia e editor TipTap arrivano nei prossimi chunk.
        Vedi <code>docs/NEBULA-DOCS.md</code>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.ndh-root {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: var(--md-sys-color-surface, #fafafa);
}

.ndh-placeholder,
.ndh-denied {
  max-width: 480px;
  text-align: center;
  padding: 40px 28px;
  border-radius: 20px;
  background: var(--md-sys-color-surface-container, #fff);
  box-shadow: var(--md-sys-elevation-level-1, 0 1px 3px rgba(0,0,0,0.06));
}

.ndh-icon {
  font-size: 56px;
  color: #C46030;
  font-variation-settings: 'FILL' 0, 'wght' 300;
  margin-bottom: 8px;
  display: block;
}

.ndh-denied .ndh-icon { color: #8a8a8a; }

h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 28px;
  margin: 8px 0 4px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}

.ndh-stage {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #C46030;
  margin: 4px 0 16px;
}

.ndh-hint {
  font-size: 14px;
  line-height: 1.55;
  color: var(--md-sys-color-on-surface-variant, #555);
  margin: 0;
}

.ndh-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  padding: 1px 5px;
  background: rgba(196, 96, 48, 0.10);
  border-radius: 4px;
}
</style>
