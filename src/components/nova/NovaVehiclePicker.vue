<script setup lang="ts">
import { useVehicles } from '../../composables/shared/useVehicles'

const model = defineModel<string>({ default: '' })
const { deliveryVehicles, loading } = useVehicles()
</script>

<template>
  <div v-if="loading" class="nvp-hint">Caricamento mezzi…</div>
  <select
    v-else
    v-model="model"
    class="nvp-select"
  >
    <option value="">— Seleziona mezzo —</option>
    <option v-for="v in deliveryVehicles" :key="v.id" :value="v.id">
      {{ v.plate }} — {{ v.brand }} {{ v.model }}
    </option>
  </select>
  <p v-if="!loading && !deliveryVehicles.length" class="nvp-hint">
    Nessun furgone attivo in flotta. Aggiungine uno in NEBULA → Mezzi.
  </p>
</template>

<style scoped>
.nvp-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--md-sys-color-outline-variant, #cec6b4);
  border-radius: 8px;
  font-size: 14px;
  background: #f8f6f2;
}
.nvp-hint { font-size: 12px; color: #7d7667; margin-top: 6px; }
</style>
