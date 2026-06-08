<script setup lang="ts">
import { ChevronDownIcon } from '@heroicons/vue/24/solid'
import { useVehicles } from '../../composables/shared/useVehicles'

const model = defineModel<string>({ default: '' })
const { deliveryVehicles, loading } = useVehicles()

const selectClass =
  'w-full bg-slate-50 border-transparent focus:border-amber-400 focus:ring-0 rounded-xl px-4 py-3 font-bold text-slate-700 appearance-none transition-colors cursor-pointer'
</script>

<template>
  <div v-if="loading" class="relative">
    <select disabled :class="[selectClass, 'opacity-60']">
      <option>Caricamento mezzi…</option>
    </select>
    <ChevronDownIcon class="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
  </div>
  <template v-else>
    <div class="relative">
      <select v-model="model" :class="selectClass">
        <option value="">Nessun mezzo</option>
        <option v-for="v in deliveryVehicles" :key="v.id" :value="v.id">
          {{ v.plate }} — {{ v.brand }} {{ v.model }}
        </option>
      </select>
      <ChevronDownIcon class="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
    </div>
    <p v-if="!deliveryVehicles.length" class="text-[11px] text-slate-400 mt-1.5 ml-1">
      Nessun furgone attivo in flotta. Aggiungine uno in NEBULA → Mezzi.
    </p>
  </template>
</template>
