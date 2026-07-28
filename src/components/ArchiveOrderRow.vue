<script setup lang="ts">
import { DocumentTextIcon } from '@heroicons/vue/24/solid';
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
</script>

<template>
  <div
    @click="emit('apri', order.codice)"
    class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-amber-300 cursor-pointer transition-all flex justify-between items-center group"
  >
    <div v-if="!isAdmin">
      <div class="flex items-baseline gap-2 mb-1">
        <span class="font-bold text-gray-800">{{ order.commessa || order.codice }}</span>
        <span class="text-[10px] text-gray-400">{{ formatDataOrdinamento(order) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] px-2 py-0.5 rounded border uppercase font-bold"
              :class="STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.badge">
          {{ STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.label }}
        </span>
      </div>
    </div>

    <div v-else>
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-gray-800">{{ order.commessa || order.codice }}</span>
        <span class="text-[10px] px-2 py-0.5 rounded border uppercase font-bold"
              :class="STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.badge">
          {{ STATUS_DETAILS[order.stato as keyof typeof STATUS_DETAILS]?.label }}
        </span>
      </div>
      <div class="text-xs text-gray-500 flex gap-2">
        <span>{{ order.cliente }}</span>
        <span>•</span>
        <span>{{ formatDataOrdinamento(order) }}</span>
      </div>
    </div>

    <div class="text-right">
      <div class="font-bold text-gray-900">{{ (order.totaleScontato || order.totaleImponibile || 0).toFixed(2) }} €</div>
      <div v-if="isAdmin" class="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">VEDI ></div>
      <div class="flex items-center justify-end gap-2 mt-1">
        <button
          v-if="order.cic_order_id || order.fic_order_id"
          @click.stop="emit('apriOrdine', order)"
          class="flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 px-8 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
          title="Visualizza Ordine"
        >
          <DocumentTextIcon class="w-3 h-3" /> ORDINE
        </button>
        <button
          v-if="order.fic_ddt_url || order.cic_ddt_id"
          @click.stop="emit('apriDdt', order)"
          class="flex items-center gap-1 text-sm font-bold text-amber-950 bg-amber-400 border border-amber-500 px-8 py-0.5 rounded-full hover:bg-amber-300 transition-colors"
          title="Visualizza DDT"
        >
          <DocumentTextIcon class="w-3 h-3" /> DDT
        </button>
      </div>
    </div>
  </div>
</template>
