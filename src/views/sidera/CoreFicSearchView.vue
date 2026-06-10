<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useFicSearch } from '../../composables/sidera/useFicSearch'
import type { FicDocType } from '../../types/ficSearch'

const router = useRouter()
const { isCoreAdmin, initialized } = useCoreAdmins()
const { currentUser } = useCurrentUser()
const { searching, errorMsg, results, progressLabel, search, abort } = useFicSearch()

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),
)

watch(canAccessCore, (ok) => { if (currentUser.value && !ok) router.replace('/sidera') }, { immediate: true })

const query = ref('')
const typeInvoice = ref(true)
const typeExpense = ref(true)
const showAdvanced = ref(false)
const dateFrom = ref('')
const dateTo = ref('')

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function lineLabel(line: { code?: string; name?: string; description?: string }) {
  const parts = [line.code, line.name, line.description].filter(Boolean)
  return parts.join(' · ') || '—'
}

function docTypeLabel(t: string) {
  if (t === 'invoice') return 'Fattura'
  if (t === 'expense') return 'Spesa'
  return t
}

async function onSearch() {
  const q = query.value.trim()
  if (q.length < 2) return

  const types: FicDocType[] = []
  if (typeInvoice.value) types.push('invoice')
  if (typeExpense.value) types.push('expense')
  if (!types.length) return

  await search({
    query: q,
    types,
    dateFrom: dateFrom.value || null,
    dateTo: dateTo.value || null,
  })
}

function onStop() {
  abort()
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Ricerca FiC</h2>
        <p class="m-sub">CORE · Fatture passive e spese per codice/nome prodotto</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty"><p>Pagina riservata agli amministratori CORE.</p></div>

    <template v-else>
      <div class="m-panel">
        <label class="m-lbl" for="fic-q">Testo da cercare</label>
        <div class="m-search-row">
          <input
            id="fic-q"
            v-model="query"
            class="m-input"
            placeholder="Codice o nome prodotto…"
            :disabled="searching"
            @keydown.enter.prevent="onSearch"
          />
          <button v-if="!searching" class="m-btn" :disabled="query.trim().length < 2" @click="onSearch">
            Cerca
          </button>
          <button v-else class="m-btn m-btn--ghost" @click="onStop">Interrompi</button>
        </div>

        <div class="m-types">
          <label class="m-check"><input v-model="typeInvoice" type="checkbox" :disabled="searching" /> Fatture passive</label>
          <label class="m-check"><input v-model="typeExpense" type="checkbox" :disabled="searching" /> Spese</label>
        </div>

        <button type="button" class="m-adv-toggle" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? 'Nascondi filtri data' : 'Filtri data (opzionale)' }}
        </button>

        <div v-if="showAdvanced" class="m-dates">
          <div>
            <label class="m-lbl" for="fic-from">Da</label>
            <input id="fic-from" v-model="dateFrom" type="date" class="m-input" :disabled="searching" />
          </div>
          <div>
            <label class="m-lbl" for="fic-to">A</label>
            <input id="fic-to" v-model="dateTo" type="date" class="m-input" :disabled="searching" />
          </div>
        </div>

        <p v-if="progressLabel" class="m-progress" :class="{ 'm-progress--active': searching }">{{ progressLabel }}</p>
        <p v-if="errorMsg" class="m-error">{{ errorMsg }}</p>
      </div>

      <div v-if="results.length" class="m-results">
        <table class="m-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>N°</th>
              <th>Fornitore</th>
              <th>Riga trovata</th>
              <th>Tipo</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in results" :key="`${row.documentId}-${row.lineIndex}-${i}`">
              <td>{{ fmtDate(row.date) }}</td>
              <td class="m-mono">{{ row.invoiceNumber }}</td>
              <td>{{ row.supplierName }}</td>
              <td>
                <code class="m-hit">{{ row.matchedText }}</code>
                <span class="m-line-sub">{{ lineLabel(row.line) }}</span>
              </td>
              <td><span class="m-tag">{{ docTypeLabel(row.documentType) }}</span></td>
              <td><span class="m-score">{{ row.matchScore }}%</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="!searching && progressLabel && !errorMsg" class="m-empty m-empty--inline">
        Nessun risultato per questa ricerca.
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-page {
  font-family: 'Outfit', sans-serif;
  background: var(--md-sys-color-surface, #FFF8F0);
  color: var(--md-sys-color-on-surface, #1A1917);
  height: 100%; min-height: 0; overflow-y: auto;
  padding: 24px 32px; padding-bottom: calc(24px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.m-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.m-back {
  background: none; border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  width: 36px; height: 36px; border-radius: 999px; cursor: pointer; font-size: 18px; color: inherit;
}
.m-title { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
.m-sub { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 2px 0 0; }
.m-empty { background: var(--md-sys-color-surface-container, #F5EDDF); padding: 32px; border-radius: 14px; text-align: center; }
.m-empty--inline { margin-top: 16px; padding: 24px; }

.m-panel {
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border-radius: 14px; padding: 20px 24px; max-width: 720px;
}
.m-lbl { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6A6560; margin-bottom: 6px; }
.m-search-row { display: flex; gap: 10px; margin-bottom: 14px; }
.m-input {
  flex: 1; padding: 10px 14px; border-radius: 10px;
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  font-family: inherit; font-size: 14px; box-sizing: border-box;
}
.m-btn {
  flex-shrink: 0; background: #7D8794; color: #fff; border: none; border-radius: 10px;
  padding: 10px 18px; font-weight: 600; font-size: 14px; cursor: pointer; font-family: inherit;
}
.m-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.m-btn--ghost { background: transparent; color: inherit; border: 1px solid #CEC6B4; }
.m-types { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
.m-check { font-size: 14px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.m-adv-toggle {
  background: none; border: none; padding: 0; font-size: 13px; color: #7D8794;
  font-weight: 600; cursor: pointer; text-decoration: underline; margin-bottom: 10px;
}
.m-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
.m-progress { font-size: 13px; color: #6A6560; margin: 12px 0 0; }
.m-progress--active { color: #7D8794; font-weight: 600; }
.m-error { margin-top: 12px; padding: 12px; border-radius: 10px; background: #FFDAD6; color: #93000A; font-size: 14px; }

.m-results { margin-top: 20px; overflow-x: auto; }
.m-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
.m-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: #6A6560; padding: 10px 12px; border-bottom: 2px solid #7D879433;
}
.m-table td { padding: 12px; border-bottom: 1px solid #EFE7DA; vertical-align: top; }
.m-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.m-hit {
  display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px;
  background: color-mix(in srgb, #7D8794 12%, transparent); padding: 2px 6px; border-radius: 4px;
}
.m-line-sub { display: block; font-size: 11px; color: #6A6560; margin-top: 4px; }
.m-tag {
  font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
  background: var(--md-sys-color-surface-container-high, #EFE7DA); color: #57534e;
}
.m-score {
  font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px;
  background: color-mix(in srgb, #7D8794 18%, transparent); color: #374151;
}
</style>
