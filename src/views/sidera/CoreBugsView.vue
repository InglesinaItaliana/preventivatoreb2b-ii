<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import BugCard from '../../components/sidera/BugCard.vue'
import { useAllBugs } from '../../composables/sidera/useBugs'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { BUG_STATUS_ORDER, BUG_STATUS_LABELS, type Bug, type BugStatus } from '../../types/bugs'

const router = useRouter()
const { bugs, loading } = useAllBugs()
const { isCoreAdmin, initialized } = useCoreAdmins()
const { currentUser } = useCurrentUser()

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),
)

watch(canAccessCore, (ok) => { if (currentUser.value && !ok) router.replace('/sidera') }, { immediate: true })

const search = ref('')
const areaFilter = ref('')
const categoryFilter = ref('')

const areas = computed(() => Array.from(new Set(bugs.value.map((b) => b.affectedArea))).sort())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return bugs.value.filter((b) => {
    if (areaFilter.value && b.affectedArea !== areaFilter.value) return false
    if (categoryFilter.value && b.category !== categoryFilter.value) return false
    if (!q) return true
    return (
      b.title.toLowerCase().includes(q) ||
      b.bugNumber.toLowerCase().includes(q) ||
      b.reportedBy.toLowerCase().includes(q) ||
      (b.reporterCompany ?? '').toLowerCase().includes(q)
    )
  })
})

function columnBugs(status: BugStatus) {
  return filtered.value.filter((b) => b.status === status)
}

function isStale(bug: Bug) {
  if (bug.status !== 'da_analizzare') return false
  const days = (Date.now() - bug.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  return days > 7
}

function openBug(id: string) {
  router.push(`/sidera/core/bugs/${id}`)
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Bug tracker</h2>
        <p class="m-sub">CORE · Segnalazioni POPS e gestione</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty"><p>Pagina riservata agli amministratori CORE.</p></div>

    <template v-else>
      <div class="m-filters">
        <input v-model="search" class="m-input" placeholder="Cerca titolo, numero, cliente…" />
        <select v-model="areaFilter" class="m-input m-sel">
          <option value="">Tutte le aree</option>
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="categoryFilter" class="m-input m-sel">
          <option value="">Tutte le categorie</option>
          <option value="ui">UI/Grafica</option>
          <option value="funzionale">Errore funzionale</option>
          <option value="performance">Performance</option>
          <option value="dati">Dati errati</option>
          <option value="suggerimento">Suggerimento</option>
        </select>
      </div>

      <div v-if="loading" class="m-loading">Caricamento…</div>

      <div v-else class="m-kanban">
        <div v-for="status in BUG_STATUS_ORDER" :key="status" class="m-col">
          <div class="m-col-head">
            <span>{{ BUG_STATUS_LABELS[status] }}</span>
            <span class="m-col-count">{{ columnBugs(status).length }}</span>
          </div>
          <div class="m-col-body">
            <BugCard
              v-for="bug in columnBugs(status)"
              :key="bug.id"
              :bug="bug"
              :stale="isStale(bug)"
              @click="openBug(bug.id)"
            />
            <p v-if="!columnBugs(status).length" class="m-col-empty">Nessun bug</p>
          </div>
        </div>
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
.m-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; max-width: 900px; }
.m-input {
  flex: 1; min-width: 180px; padding: 10px 14px; border-radius: 10px;
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  background: #fff; font-size: 14px; font-family: inherit;
}
.m-sel { flex: 0 1 160px; }
.m-loading { padding: 24px; color: #6A6560; }
.m-kanban { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .m-kanban { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .m-kanban { grid-template-columns: 1fr; } }
.m-col { min-width: 0; }
.m-col-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: #7D8794; margin-bottom: 10px; padding-bottom: 8px;
  border-bottom: 2px solid #7D879433;
}
.m-col-count {
  background: #7D879422; padding: 2px 8px; border-radius: 999px; font-size: 11px;
}
.m-col-body { display: flex; flex-direction: column; gap: 10px; }
.m-col-empty { font-size: 12px; color: #9ca3af; padding: 12px 4px; margin: 0; }
</style>
