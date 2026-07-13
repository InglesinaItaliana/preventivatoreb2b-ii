<script setup lang="ts">
import { MagnifyingGlassIcon, CheckCircleIcon } from '@heroicons/vue/24/solid';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
  >
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

      <!-- Testata -->
      <div class="bg-amber-400 p-5 text-amber-950 shrink-0 rounded-t-xl">
        <span class="inline-block bg-amber-950 text-amber-50 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mb-2">
          Novità
        </span>
        <h2 class="font-bold text-2xl font-heading leading-tight">
          Ora puoi vedere<br />come nasce ogni prezzo
        </h2>
      </div>

      <div class="p-5 space-y-4 overflow-auto">

        <p class="text-sm text-gray-600 leading-relaxed">
          Accanto al totale di ogni riga del preventivo trovi una lente.
          Cliccala: si apre il dettaglio di come quel prezzo è stato calcolato.
        </p>

        <!-- Dov'è la lente: riga finta, con la lente evidenziata -->
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-gray-50 px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 flex justify-between border-b border-gray-200">
            <span>Articolo</span>
            <span class="flex items-center gap-6"><span>Totale</span><span class="w-4"></span></span>
          </div>
          <div class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-gray-900 text-xs truncate">INGLESINA VARSAVIA 26 - BIANCO</div>
              <div class="text-[10px] text-gray-400 uppercase">Canalino: alluminio 16</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-bold font-heading text-gray-900 text-sm tabular-nums">207,90 €</span>
              <span class="relative flex h-7 w-7 items-center justify-center">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60"></span>
                <span class="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-600 ring-2 ring-amber-400">
                  <MagnifyingGlassIcon class="h-4 w-4" />
                </span>
              </span>
            </div>
          </div>
        </div>

        <!-- Cosa ci trovi -->
        <ul class="space-y-2">
          <li class="flex gap-2.5 text-sm text-gray-700">
            <CheckCircleIcon class="h-5 w-5 text-amber-500 shrink-0" />
            <span>I <b>metri lineari</b> della riga e le misure con cui è stata calcolata.</span>
          </li>
          <li class="flex gap-2.5 text-sm text-gray-700">
            <CheckCircleIcon class="h-5 w-5 text-amber-500 shrink-0" />
            <span>La <b>tariffa al metro</b> applicata e la regola di lavorazione che ne deriva.</span>
          </li>
          <li class="flex gap-2.5 text-sm text-gray-700">
            <CheckCircleIcon class="h-5 w-5 text-amber-500 shrink-0" />
            <span>La <b>verifica finale</b>: totale ÷ metri = prezzo al metro. Lo stesso numero che eri abituato a leggere sui preventivi di una volta.</span>
          </li>
        </ul>

        <!-- Il messaggio che conta -->
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p class="text-sm text-blue-900 leading-snug">
            <b>I prezzi non sono cambiati.</b> Cambia solo quello che puoi vedere:
            la stessa cifra di prima, con la sua spiegazione accanto.
          </p>
        </div>
      </div>

      <div class="p-5 pt-0 shrink-0">
        <button
          @click="emit('close')"
          class="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 py-3 rounded-lg font-bold shadow-md transition-colors"
        >
          Ho capito
        </button>
      </div>
    </div>
  </div>
</template>
