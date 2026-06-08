<script setup lang="ts">
defineProps<{
  status: 'ok' | 'warning' | 'overdue' | 'done' | 'none'
}>()

const labels: Record<string, string> = {
  ok: 'OK',
  warning: 'In scadenza',
  overdue: 'Scaduto',
  done: 'Completato',
  none: '—',
}
</script>

<template>
  <span class="nv-badge" :class="`nv-badge--${status}`">{{ labels[status] ?? status }}</span>
</template>

<style scoped>
.nv-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
}
.nv-badge--ok { background: #e8f5e9; color: #2e7d32; }
.nv-badge--warning { background: #fff8e1; color: #f57f17; }
.nv-badge--overdue { background: #ffebee; color: #c62828; }
.nv-badge--done { background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface-variant); }
.nv-badge--none { display: none; }
</style>
