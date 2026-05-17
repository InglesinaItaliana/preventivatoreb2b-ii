<script setup lang="ts">
import { ref, computed } from 'vue'
import { TruckIcon, MapPinIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { useNovaSpedizioni, type Spedizione, type SpedizioneStato } from '../../composables/nova/useNovaSpedizioni'

const { spedizioni, loading, saveTracking } = useNovaSpedizioni()

// ── Filter tabs ──────────────────────────────────────────────────────────────
type TabId = 'READY' | 'DELIVERY' | 'DELIVERED'
const tab = ref<TabId>('READY')

const tabs: { id: TabId; label: string; dot: string }[] = [
  { id: 'READY',     label: 'Pronti',     dot: '#8FAB35' },
  { id: 'DELIVERY',  label: 'In Viaggio', dot: '#D4A020' },
  { id: 'DELIVERED', label: 'Consegnati', dot: '#3AAF98' },
]

const filtered = computed(() =>
  spedizioni.value
    .filter(s => s.stato === tab.value)
    .sort((a, b) => a.cliente.localeCompare(b.cliente))
)

const counts = computed(() => ({
  READY:     spedizioni.value.filter(s => s.stato === 'READY').length,
  DELIVERY:  spedizioni.value.filter(s => s.stato === 'DELIVERY').length,
  DELIVERED: spedizioni.value.filter(s => s.stato === 'DELIVERED').length,
}))

// ── Inline tracking edit ─────────────────────────────────────────────────────
const editing   = ref<string | null>(null)
const editCorr  = ref('')
const editTrack = ref('')
const saving    = ref(false)

function startEdit(s: Spedizione) {
  editing.value  = s.id
  editCorr.value  = s.corriere
  editTrack.value = s.trackingNumber
}

function cancelEdit() {
  editing.value = null
}

async function confirmEdit(id: string) {
  if (saving.value) return
  saving.value = true
  try {
    await saveTracking(id, editCorr.value.trim(), editTrack.value.trim())
    editing.value = null
  } finally {
    saving.value = false
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────
function formatDate(d: Date | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}
</script>

<template>
  <div class="nv s-fade-in">

    <!-- Header -->
    <div class="nv-header">
      <div>
        <h1 class="nv-title">Spedizioni</h1>
        <p class="nv-subtitle">
          <template v-if="loading">Caricamento…</template>
          <template v-else>
            {{ counts.READY }} pronti · {{ counts.DELIVERY }} in viaggio · {{ counts.DELIVERED }} consegnati
          </template>
        </p>
      </div>
      <a href="/delivery" class="s-btn-outline" target="_blank" rel="noopener">
        <ArrowTopRightOnSquareIcon style="width:14px;height:14px" />
        Apri POPS Spedizioni
      </a>
    </div>

    <!-- Tabs -->
    <div class="nv-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="nv-tab"
        :class="{ 'is-active': tab === t.id }"
        :style="tab === t.id ? { '--tab-accent': t.dot } : {}"
        @click="tab = t.id"
      >
        <span class="nv-tab-dot" :style="{ background: t.dot }" />
        {{ t.label }}
        <span class="nv-tab-count">{{ counts[t.id] }}</span>
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="loading-rows">
      <div v-for="i in 5" :key="i" class="row-skeleton" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!filtered.length" class="empty-state">
      <div class="empty-icon">
        <TruckIcon style="width:28px;height:28px" />
      </div>
      <p>Nessuna spedizione in questa categoria.</p>
    </div>

    <!-- Rows -->
    <template v-else>
      <div
        v-for="s in filtered"
        :key="s.id"
        class="nv-row"
        :class="{ 'is-editing': editing === s.id }"
      >
        <!-- Status dot -->
        <div class="nv-status-dot" :class="`dot--${s.stato.toLowerCase()}`" />

        <!-- Cliente + commessa -->
        <div class="nv-main">
          <span class="nv-cliente">{{ s.cliente }}</span>
          <span class="nv-commessa">{{ s.commessa }}</span>
        </div>

        <!-- Colli -->
        <div class="nv-colli">
          <span class="colli-val">{{ s.colli }}</span>
          <span class="colli-label">colli</span>
        </div>

        <!-- Luogo -->
        <div class="nv-luogo">
          <MapPinIcon style="width:12px;height:12px;flex-shrink:0;opacity:.5" />
          <span>{{ [s.citta, s.provincia].filter(Boolean).join(' · ') || '—' }}</span>
        </div>

        <!-- Tracking (view) -->
        <template v-if="editing !== s.id">
          <div class="nv-tracking">
            <span v-if="s.corriere" class="tracking-corriere">{{ s.corriere }}</span>
            <span v-if="s.trackingNumber" class="tracking-num">{{ s.trackingNumber }}</span>
            <span v-if="!s.corriere && !s.trackingNumber" class="tracking-empty">—</span>
          </div>
          <button class="nv-edit-btn" title="Modifica tracking" @click="startEdit(s)">
            <PencilIcon style="width:12px;height:12px" />
          </button>
        </template>

        <!-- Tracking (edit) -->
        <template v-else>
          <div class="nv-tracking-edit">
            <input v-model="editCorr"  class="track-input" placeholder="Corriere" />
            <input v-model="editTrack" class="track-input" placeholder="Tracking #" @keydown.enter="confirmEdit(s.id)" @keydown.escape="cancelEdit" />
          </div>
          <div class="nv-edit-actions">
            <button class="edit-action-btn edit-action-btn--confirm" :disabled="saving" @click="confirmEdit(s.id)">
              <CheckIcon style="width:12px;height:12px" />
            </button>
            <button class="edit-action-btn edit-action-btn--cancel" @click="cancelEdit">
              <XMarkIcon style="width:12px;height:12px" />
            </button>
          </div>
        </template>

        <!-- Data consegna (solo tab DELIVERED) -->
        <div v-if="tab === 'DELIVERED'" class="nv-consegna">
          <CheckCircleIcon style="width:12px;height:12px;color:#3AAF98;flex-shrink:0" />
          <span>{{ formatDate(s.dataConsegnaEffettiva) }}</span>
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
.nv {
  height: 100%;
  overflow: auto;
  padding: 40px 52px;
  background: var(--s-bg);
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

/* ── Header ── */
.nv-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32px;
}

.nv-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nv-subtitle {
  font-size: 12px;
  color: var(--s-text-dim);
  margin-top: 4px;
}

.s-btn-outline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  color: var(--s-text-dim);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
  letter-spacing: 0.01em;
}

.s-btn-outline:hover {
  color: var(--module-accent);
  border-color: var(--module-accent);
}

/* ── Tabs ── */
.nv-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  background: var(--s-surface-up);
  padding: 4px;
  border-radius: 9px;
  width: fit-content;
  border: 1px solid var(--s-border);
}

.nv-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--s-text-dim);
  font-family: 'Outfit', sans-serif;
  transition: background 0.12s, color 0.12s;
}

.nv-tab:hover { color: var(--s-text); }

.nv-tab.is-active {
  background: var(--s-surface);
  color: var(--tab-accent, var(--module-accent));
  box-shadow: 0 1px 4px rgba(0,0,0,.18);
}

.nv-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nv-tab-count {
  font-size: 10px;
  font-weight: 700;
  background: var(--s-border);
  border-radius: 10px;
  padding: 0 5px;
  line-height: 16px;
}

/* ── Rows ── */
.nv-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 11px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  margin-bottom: 3px;
}

.nv-row:hover { background: var(--s-surface-up); }

.nv-row.is-editing {
  background: var(--s-surface-up);
  border-color: var(--module-accent, var(--s-border));
}

.nv-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot--ready     { background: #8FAB35; }
.dot--delivery  { background: #D4A020; }
.dot--delivered { background: #3AAF98; }

.nv-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.nv-cliente {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nv-commessa {
  font-size: 11px;
  color: var(--s-text-dim);
  margin-top: 1px;
}

.nv-colli {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 40px;
}

.colli-val   { font-size: 14px; font-weight: 600; }
.colli-label { font-size: 9px; color: var(--s-text-dim); text-transform: uppercase; letter-spacing: .06em; }

.nv-luogo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--s-text-dim);
  width: 160px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tracking (read) */
.nv-tracking {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tracking-corriere {
  font-size: 11px;
  font-weight: 600;
  color: var(--module-accent);
  background: var(--module-accent, #8FAB35)18;
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.tracking-num {
  font-size: 11px;
  color: var(--s-text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tracking-empty {
  font-size: 11px;
  color: var(--s-text-dim);
  opacity: .4;
}

.nv-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  padding: 4px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
  flex-shrink: 0;
}

.nv-row:hover .nv-edit-btn { opacity: 1; }
.nv-edit-btn:hover { color: var(--module-accent); }

/* Tracking (edit) */
.nv-tracking-edit {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.track-input {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--s-text);
  font-family: 'Outfit', sans-serif;
  outline: none;
  min-width: 0;
  flex: 1;
  transition: border-color 0.12s;
}

.track-input:focus { border-color: var(--module-accent); }

.nv-edit-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.edit-action-btn {
  background: none;
  border: 1px solid var(--s-border);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  color: var(--s-text-dim);
}

.edit-action-btn:disabled { opacity: .5; cursor: not-allowed; }

.edit-action-btn--confirm:hover:not(:disabled) {
  background: #3AAF9820;
  border-color: #3AAF98;
  color: #3AAF98;
}

.edit-action-btn--cancel:hover {
  background: #C8521A20;
  border-color: #C8521A;
  color: #C8521A;
}

/* Data consegna */
.nv-consegna {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--s-text-dim);
  flex-shrink: 0;
  white-space: nowrap;
}

/* Loading / empty */
.loading-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }

.row-skeleton {
  height: 44px;
  border-radius: 8px;
  background: var(--s-surface-up);
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { opacity: .6; }
  50%  { opacity: .3; }
  100% { opacity: .6; }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 80px;
  color: var(--s-text-dim);
  font-size: 13px;
}

.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--s-surface-up);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: .5;
}
</style>
