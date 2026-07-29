<script setup lang="ts">
/**
 * Annuncio one-time al CLIENTE: si può far consegnare a un indirizzo diverso
 * dalla propria sede. Mostrato nel builder, che è dove la novità si incontra
 * (bottone ORDINA), non in dashboard dove si leggerebbe lontano dal punto d'uso.
 *
 * Registro tecnico-neutro: POPS non usa la voce LYRA (v. docs/LYRA.md, scope
 * limitato alla suite SIDERA). Niente emoji: icone vere.
 */
import { MapPinIcon, BookmarkIcon, BanknotesIcon } from '@heroicons/vue/24/solid';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

      <div class="bg-amber-400 p-5 text-amber-950 shrink-0 rounded-t-xl">
        <span class="inline-block bg-amber-950 text-amber-50 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mb-2">
          Novità
        </span>
        <h2 class="font-bold text-2xl font-heading leading-tight">
          Puoi far consegnare<br />a un altro indirizzo
        </h2>
      </div>

      <div class="p-5 space-y-4 overflow-auto">

        <p class="text-sm text-gray-600 leading-relaxed">
          Quando confermi un ordine, sotto la data di consegna trovi la riga
          <strong class="text-gray-900">Consegna</strong>. Se la merce non deve arrivare
          alla tua sede, premi <strong class="text-gray-900">Cambia</strong> e indica dove
          mandarla: un cantiere, un altro magazzino, il tuo cliente finale.
        </p>

        <!-- Dov'è: riga finta della modale d'ordine, col bottone evidenziato -->
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-gray-50 px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200">
            Consegna
          </div>
          <div class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-gray-900 text-xs truncate">Indirizzo abituale</div>
              <div class="text-[10px] text-gray-400 truncate">La tua sede</div>
            </div>
            <span class="relative shrink-0">
              <span class="absolute -inset-1 rounded-lg bg-indigo-200/60 animate-ping"></span>
              <span class="relative inline-flex px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 text-[11px] font-bold bg-white">
                Cambia
              </span>
            </span>
          </div>
        </div>

        <ul class="space-y-3 pt-1">
          <li class="flex gap-3">
            <BookmarkIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-sm text-gray-600 leading-snug">
              Puoi <strong class="text-gray-900">salvare l'indirizzo</strong> e ritrovarlo
              già pronto nei prossimi ordini.
            </p>
          </li>
          <li class="flex gap-3">
            <BanknotesIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-sm text-gray-600 leading-snug">
              Una destinazione diversa può cambiare il
              <strong class="text-gray-900">costo del trasporto</strong>: lo trovi nel
              totale, insieme al dettaglio, <strong class="text-gray-900">prima di firmare</strong>.
            </p>
          </li>
          <li class="flex gap-3">
            <MapPinIcon class="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-sm text-gray-600 leading-snug">
              L'indirizzo finisce sul <strong class="text-gray-900">documento di trasporto</strong>,
              così la merce arriva dove serve.
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
