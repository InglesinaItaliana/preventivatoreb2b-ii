<script setup lang="ts">
/**
 * NEBULA-DOCS — wrapper rotta `/nebula/docs/:docId`.
 *
 * Fase 6 (real-time Yjs/CRDT): monta NebulaDocPage KEYED-by-docId così ogni
 * documento ottiene un Y.Doc/provider/editor freschi e il teardown è pulito
 * alla navigazione tra doc (il RouterView NON ha key globale). Risolve anche
 * il latente non-resubscribe di useDoc al cambio param.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import NebulaDocPage from './NebulaDocPage.vue'

const route = useRoute()
const docId = computed(() => String(route.params.docId))
</script>

<template>
  <NebulaDocPage :key="docId" :doc-id="docId" />
</template>
