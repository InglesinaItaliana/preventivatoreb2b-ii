<script setup lang="ts">
import { DocumentTextIcon, EyeIcon } from '@heroicons/vue/24/solid';
import { STATUS_DETAILS } from '../types';

/**
 * Una riga dell'archivio. Estratta da ArchiveModal perché la stessa riga viene
 * ora resa in tre contesti (recenti, storico cliente per mese, ricerca
 * commessa): tenerla nel template della modale avrebbe significato triplicarla.
 */
defineProps<{
  order: any;
  isAdmin?: boolean;
}>();

const emit = defineEmits(['apri', 'apriDdt', 'apriOrdine']);

const formatDate = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString() : '-';

// La data mostrata deve essere quella su cui la lista è ordinata, altrimenti
// l'ordine sembra casuale: DDT per i consegnati, creazione per gli annullati.
const formatDataOrdinamento = (o: any) => {
  if (o?.stato === 'DELIVERED') {
    const d = o?.dataConsegnaPrevista;
    return d ? new Date(d).toLocaleDateString() : '-';
  }
  return formatDate(o?.dataCreazione?.seconds);
};

// Stessa forma per i tre pulsanti d'azione: l'occhio è un'azione come le altre,
// non un suggerimento che appare al passaggio del mouse.
const CLASSI_PULSANTE =
  'flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 py-0.5 rounded-full hover:bg-amber-300 transition-colors';
</script>

<template>
  <div
    @click="emit('apri', order.codice)"
    class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer transition-all flex justify-between items-center gap-3 group"
  >
    <div class="min-w-0">
      <!-- Lo stato è la prima cosa che si legge: in alto a sinistra. -->
      <span
        class="inline-block mb-1 text-[10px] px-2 py-0.5 rounded border uppercase font-bold"
        :class="STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.badge"
      >
        {{ STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.label }}
      </span>

      <!-- Per l'admin il cliente è il dato che identifica la riga; la commessa
           lo qualifica. Per il cliente, che vede solo i propri ordini, il primo
           posto tocca alla commessa. -->
      <template v-if="isAdmin">
        <div class="font-bold text-gray-800 truncate">{{ order.cliente }}</div>
        <div class="text-xs text-gray-500 flex gap-2">
          <span class="truncate">{{ order.commessa || order.codice }}</span>
          <span class="shrink-0">•</span>
          <span class="shrink-0">{{ formatDataOrdinamento(order) }}</span>
        </div>
      </template>

      <template v-else>
        <div class="font-bold text-gray-800 truncate">{{ order.commessa || order.codice }}</div>
        <div class="text-[10px] text-gray-400">{{ formatDataOrdinamento(order) }}</div>
      </template>
    </div>

    <div class="text-right shrink-0">
      <div class="font-bold text-gray-900">{{ (order.totaleScontato || order.totaleImponibile || 0).toFixed(2) }} €</div>
      <!-- flex-wrap: tre pillole della stessa larghezza non stanno su una riga
           di telefono, e senza wrap uscirebbero dalla card. -->
      <div class="flex items-center justify-end gap-2 mt-1 flex-wrap">
        <button
          v-if="isAdmin"
          @click.stop="emit('apri', order.codice)"
          :class="CLASSI_PULSANTE"
          class="px-8"
          title="Apri l'ordine"
        >
          <EyeIcon class="w-3 h-3" />
        </button>
        <button
          v-if="order.cic_order_id || order.fic_order_id"
          @click.stop="emit('apriOrdine', order)"
          :class="CLASSI_PULSANTE"
          class="px-8"
          title="Visualizza Ordine"
        >
          <DocumentTextIcon class="w-3 h-3" /> ORDINE
        </button>
        <button
          v-if="order.fic_ddt_url || order.cic_ddt_id"
          @click.stop="emit('apriDdt', order)"
          :class="CLASSI_PULSANTE"
          class="px-8"
          title="Visualizza DDT"
        >
          <DocumentTextIcon class="w-3 h-3" /> DDT
        </button>
      </div>
    </div>
  </div>
</template>
