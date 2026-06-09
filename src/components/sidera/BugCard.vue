<script setup lang="ts">
import type { Bug } from '../../types/bugs'
import { BUG_STATUS_LABELS, BUG_PRIORITY_LABELS, categoryToUiLabel } from '../../types/bugs'

defineProps<{
  bug: Bug
  stale?: boolean
}>()

defineEmits<{ click: [] }>()

function fmtDate(d: Date) {
  if (!d.getTime()) return '—'
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <button type="button" class="bc-card" :class="{ 'bc-stale': stale }" @click="$emit('click')">
    <div class="bc-top">
      <span class="bc-num">{{ bug.bugNumber }}</span>
      <span class="bc-pri" :data-pri="bug.priority">{{ BUG_PRIORITY_LABELS[bug.priority] }}</span>
    </div>
    <div class="bc-title">{{ bug.title }}</div>
    <div class="bc-meta">
      <span>{{ bug.reporterCompany || bug.reportedBy }}</span>
      <span>{{ fmtDate(bug.createdAt) }}</span>
    </div>
    <div class="bc-tags">
      <span class="bc-tag">{{ categoryToUiLabel(bug.category) }}</span>
      <span v-if="bug.affectedArea !== 'other'" class="bc-tag">{{ bug.affectedArea }}</span>
      <span v-if="bug.linkedTaskId" class="bc-tag bc-tag--link">CEPHEID</span>
    </div>
    <div v-if="stale" class="bc-stale-label">In attesa da oltre 7 giorni</div>
  </button>
</template>

<style scoped>
.bc-card {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: box-shadow 0.15s, background 0.15s;
  font-family: 'Outfit', sans-serif;
}
.bc-card:hover {
  background: var(--md-sys-color-surface-container, #F5EDDF);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.bc-stale { background: color-mix(in srgb, #C8521A 8%, var(--md-sys-color-surface-container-lowest, #fff)); }
.bc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.bc-num { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; color: #7D8794; text-transform: uppercase; }
.bc-pri { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: #f3f4f6; }
.bc-pri[data-pri="alta"] { background: #fee2e2; color: #b91c1c; }
.bc-pri[data-pri="media"] { background: #fef3c7; color: #b45309; }
.bc-title { font-size: 14px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; color: var(--md-sys-color-on-surface, #1A1917); }
.bc-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--md-sys-color-on-surface-variant, #6A6560); margin-bottom: 8px; gap: 8px; }
.bc-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.bc-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f5f5f4; color: #57534e; }
.bc-tag--link { background: #fef3c7; color: #92400e; }
.bc-stale-label { margin-top: 8px; font-size: 10px; font-weight: 600; color: #C8521A; }
</style>
