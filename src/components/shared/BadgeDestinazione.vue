<script setup lang="ts">
/**
 * Segnala che un ordine NON va all'indirizzo abituale del cliente.
 *
 * Colore indaco di proposito: in POPS il rosso è già "errore fatturazione" e
 * l'ambra è lo stato attivo. Una destinazione diversa non è un errore, è
 * un'informazione — ma va vista prima di caricare il camion, non dopo.
 *
 * Non renderizza nulla per la consegna standard: nessun badge = nessun rumore
 * sulle centinaia di ordini normali.
 */
import { computed } from 'vue';
import { hasDestinazione, formatDestinazione, righeDestinazione, type DestinazioneMerce } from '../../lib/destinazione';

const props = withDefaults(defineProps<{
  destinazione?: DestinazioneMerce | null;
  /** `mini` per le liste dense (card ordine), `full` per le schede. */
  size?: 'mini' | 'full';
}>(), { size: 'mini' });

const attiva = computed(() => hasDestinazione(props.destinazione));
const tooltip = computed(() => righeDestinazione(props.destinazione).join('\n'));
const riga = computed(() => formatDestinazione(props.destinazione));
</script>

<template>
  <span
    v-if="attiva"
    :title="tooltip"
    class="inline-flex items-center gap-1 rounded border uppercase font-bold bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap"
    :class="size === 'mini' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1'"
  >
    <span>Altra destinazione</span>
    <span v-if="size === 'full'" class="font-medium normal-case text-indigo-600">· {{ riga }}</span>
  </span>
</template>
