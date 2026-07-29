<script setup lang="ts">
/**
 * Annuncio one-time allo STAFF ADMIN. Non è la versione "aziendale" di quello
 * cliente: al cliente si racconta una possibilità in più, qui si comunica un
 * VINCOLO NUOVO sul lavoro quotidiano — un DDT non può più mescolare ordini
 * diretti in posti diversi, quindi la selezione automatica degli ordini pronti
 * non prende più tutto. Se non lo si dice, il giorno che un ordine non entra nel
 * DDT sembra un bug.
 *
 * Registro tecnico-neutro (POPS non usa la voce LYRA). Niente emoji.
 */
import { ExclamationTriangleIcon, CurrencyEuroIcon, TruckIcon } from '@heroicons/vue/24/solid';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

      <div class="bg-amber-400 p-5 text-amber-950 shrink-0 rounded-t-xl">
        <span class="inline-block bg-amber-950 text-amber-50 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mb-2">
          Novità
        </span>
        <h2 class="font-bold text-2xl font-heading leading-tight">
          Gli ordini possono avere<br />un luogo di consegna diverso
        </h2>
      </div>

      <div class="p-5 space-y-4 overflow-auto">

        <p class="text-sm text-gray-600 leading-relaxed">
          Il cliente può indicare dove mandare la merce quando ordina, e puoi farlo
          anche tu per suo conto — l'indirizzo arriva tanto dal portale quanto per
          telefono. Questi ordini si riconoscono dal badge sulla card.
        </p>

        <!-- Come si riconoscono: i due stati reali del badge -->
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-gray-50 px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200">
            Sulla card dell'ordine
          </div>
          <div class="px-4 py-3 space-y-2.5">
            <div class="flex items-center gap-2">
              <span class="text-[9px] px-2 py-0.5 rounded border uppercase font-bold bg-indigo-50 text-indigo-700 border-indigo-200">Altra destinazione</span>
              <span class="text-[11px] text-gray-500">va altrove — passaci sopra per l'indirizzo</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[9px] px-2 py-0.5 rounded border uppercase font-bold bg-gray-50 text-gray-400 border-gray-200">Destinazione</span>
              <span class="text-[11px] text-gray-500">consegna normale — cliccalo per cambiarla</span>
            </div>
          </div>
        </div>

        <!-- Il vincolo: è la parte che cambia davvero il lavoro -->
        <div class="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div class="flex gap-3">
            <ExclamationTriangleIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p class="text-sm font-bold text-amber-900 leading-snug mb-1">
                Un DDT ha un solo luogo di consegna
              </p>
              <p class="text-sm text-amber-800 leading-snug">
                Selezionando un ordine pronto, ora entrano <strong>solo quelli diretti
                nello stesso posto</strong>: prima venivano presi tutti gli ordini pronti
                del cliente. Se un ordine resta fuori dalla selezione,
                <strong>non è un errore</strong> — vuole un DDT a parte.
              </p>
            </div>
          </div>
        </div>

        <ul class="space-y-3">
          <li class="flex gap-3">
            <CurrencyEuroIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-sm text-gray-600 leading-snug">
              Una destinazione diversa può cambiare la tariffa:
              <strong class="text-gray-900">verifica il trasporto</strong> prima di portare
              l'ordine in firma. Il cliente vede la cifra aggiornata quando firma.
            </p>
          </li>
          <li class="flex gap-3">
            <TruckIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-sm text-gray-600 leading-snug">
              L'indirizzo finisce sul <strong class="text-gray-900">DDT</strong> — e quindi
              sulla fattura che ne nasce — e guida il
              <strong class="text-gray-900">navigatore dell'autista</strong>.
            </p>
          </li>
        </ul>
      </div>

      <div class="p-4 border-t border-gray-100 shrink-0">
        <button
          @click="emit('close')"
          class="w-full py-2.5 rounded-lg bg-amber-400 text-amber-950 font-bold hover:bg-amber-300 shadow-md transition-colors"
        >
          Ho capito
        </button>
      </div>
    </div>
  </div>
</template>
