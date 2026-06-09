<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName } from '../../composables/sidera/useTeamMembers'
import { updateBugFields, promoteBugToTask } from '../../composables/sidera/usePromoteBug'
import type { Bug, BugCategory, BugPriority, BugStatus } from '../../types/bugs'
import {
  BUG_STATUS_LABELS, BUG_PRIORITY_LABELS, categoryToUiLabel,
  BUG_STATUS_ORDER,
} from '../../types/bugs'

const route = useRoute()
const router = useRouter()
const { isCoreAdmin, initialized } = useCoreAdmins()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

const bug = ref<Bug | null>(null)
const loading = ref(true)
const saving = ref(false)
const promoting = ref(false)
const errorMsg = ref('')

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),
)

watch(canAccessCore, (ok) => { if (currentUser.value && !ok) router.replace('/sidera') }, { immediate: true })

const form = ref({
  status: 'da_analizzare' as BugStatus,
  priority: 'media' as BugPriority,
  category: 'funzionale' as BugCategory,
  internalNotes: '',
  assigneeUid: '' as string,
})

let unsub: (() => void) | null = null
watch(() => route.params.id, (id) => {
  if (unsub) unsub()
  bug.value = null
  loading.value = true
  if (!id || typeof id !== 'string') return
  unsub = onSnapshot(doc(db, 'bugs', id), (snap) => {
    if (!snap.exists()) {
      bug.value = null
      loading.value = false
      return
    }
    const d = snap.data()
    bug.value = {
      id: snap.id,
      bugNumber: d.bugNumber ?? '',
      title: d.title ?? '',
      description: d.description ?? '',
      status: d.status ?? 'da_analizzare',
      category: d.category ?? 'funzionale',
      priority: d.priority ?? 'media',
      pageUrl: d.pageUrl ?? '',
      affectedArea: d.affectedArea ?? 'other',
      preventivoCodice: d.preventivoCodice ?? null,
      reportedBy: d.reportedBy ?? '',
      reportedByUid: d.reportedByUid ?? '',
      reporterType: d.reporterType ?? 'client',
      reporterCompany: d.reporterCompany ?? null,
      technicalContext: d.technicalContext ?? {},
      internalNotes: d.internalNotes ?? '',
      assigneeUid: d.assigneeUid ?? null,
      linkedTaskId: d.linkedTaskId ?? null,
      linkedTaskProjectId: d.linkedTaskProjectId ?? null,
      duplicateOf: d.duplicateOf ?? null,
      source: d.source ?? 'pops',
      notionPageId: d.notionPageId ?? null,
      createdAt: d.createdAt?.toDate?.() ?? new Date(0),
      updatedAt: d.updatedAt?.toDate?.() ?? new Date(0),
      resolvedAt: d.resolvedAt?.toDate?.() ?? null,
    }
    form.value = {
      status: bug.value.status,
      priority: bug.value.priority,
      category: bug.value.category,
      internalNotes: bug.value.internalNotes,
      assigneeUid: bug.value.assigneeUid ?? '',
    }
    loading.value = false
  })
}, { immediate: true })

const isStale = computed(() => {
  if (!bug.value || bug.value.status !== 'da_analizzare') return false
  return (Date.now() - bug.value.createdAt.getTime()) / 86400000 > 7
})

async function onSave() {
  if (!bug.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    await updateBugFields(bug.value.id, {
      status: form.value.status,
      priority: form.value.priority,
      category: form.value.category,
      internalNotes: form.value.internalNotes,
      assigneeUid: form.value.assigneeUid || null,
    })
  } catch (e: unknown) {
    errorMsg.value = (e as Error)?.message || 'Errore salvataggio'
  } finally {
    saving.value = false
  }
}

async function onPromote() {
  if (!bug.value || bug.value.linkedTaskId) return
  promoting.value = true
  errorMsg.value = ''
  try {
    const { taskId } = await promoteBugToTask(bug.value.id)
    router.push('/cepheid')
    console.info('[CoreBugDetail] task creata', taskId)
  } catch (e: unknown) {
    errorMsg.value = (e as Error)?.message || 'Errore promozione'
  } finally {
    promoting.value = false
  }
}

function fmtDate(d: Date) {
  if (!d.getTime()) return '—'
  return d.toLocaleString('it-IT')
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera/core/bugs')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">{{ bug?.bugNumber || 'Bug' }}</h2>
        <p class="m-sub">CORE · Dettaglio segnalazione</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty"><p>Pagina riservata agli amministratori CORE.</p></div>
    <div v-else-if="loading" class="m-loading">Caricamento…</div>
    <div v-else-if="!bug" class="m-empty"><p>Bug non trovato.</p></div>

    <div v-else class="m-layout">
      <div class="m-main">
        <div v-if="isStale" class="m-alert">In attesa da oltre 7 giorni</div>
        <h3 class="m-bug-title">{{ bug.title }}</h3>
        <p class="m-desc">{{ bug.description }}</p>

        <div class="m-section">
          <h4>Segnalazione</h4>
          <dl class="m-dl">
            <dt>Cliente</dt><dd>{{ bug.reporterCompany || bug.reportedBy }}</dd>
            <dt>Email</dt><dd>{{ bug.reportedBy }}</dd>
            <dt>Data</dt><dd>{{ fmtDate(bug.createdAt) }}</dd>
            <dt>Area</dt><dd>{{ bug.affectedArea }}</dd>
            <dt>Categoria</dt><dd>{{ categoryToUiLabel(bug.category) }}</dd>
            <dt v-if="bug.preventivoCodice">Codice</dt>
            <dd v-if="bug.preventivoCodice">{{ bug.preventivoCodice }}</dd>
          </dl>
          <a v-if="bug.pageUrl" :href="bug.pageUrl" target="_blank" rel="noopener" class="m-link">Apri pagina segnalata ↗</a>
        </div>

        <div class="m-section">
          <h4>Contesto tecnico</h4>
          <pre class="m-pre">{{ JSON.stringify(bug.technicalContext, null, 2) }}</pre>
        </div>
      </div>

      <aside class="m-aside">
        <h4>Gestione</h4>
        <label class="m-lbl">Status</label>
        <select v-model="form.status" class="m-input">
          <option v-for="s in BUG_STATUS_ORDER" :key="s" :value="s">{{ BUG_STATUS_LABELS[s] }}</option>
        </select>

        <label class="m-lbl">Priorità</label>
        <select v-model="form.priority" class="m-input">
          <option value="alta">{{ BUG_PRIORITY_LABELS.alta }}</option>
          <option value="media">{{ BUG_PRIORITY_LABELS.media }}</option>
          <option value="bassa">{{ BUG_PRIORITY_LABELS.bassa }}</option>
        </select>

        <label class="m-lbl">Categoria</label>
        <select v-model="form.category" class="m-input">
          <option value="ui">UI/Grafica</option>
          <option value="funzionale">Errore funzionale</option>
          <option value="performance">Performance</option>
          <option value="dati">Dati errati</option>
          <option value="suggerimento">Suggerimento</option>
        </select>

        <label class="m-lbl">Assegnatario</label>
        <select v-model="form.assigneeUid" class="m-input">
          <option value="">— Nessuno —</option>
          <option v-for="m in members" :key="m.uid || m.email" :value="m.uid || ''">{{ displayName(m.email, members) }}</option>
        </select>

        <label class="m-lbl">Note interne</label>
        <textarea v-model="form.internalNotes" class="m-input m-ta" rows="4" />

        <div v-if="errorMsg" class="m-error">{{ errorMsg }}</div>

        <button class="m-btn" :disabled="saving" @click="onSave">{{ saving ? 'Salvo…' : 'Salva' }}</button>

        <template v-if="bug.linkedTaskId">
          <p class="m-linked">Azione CEPHEID collegata.</p>
          <RouterLink to="/cepheid" class="m-btn m-btn--ghost">Vai alle Azioni →</RouterLink>
        </template>
        <button v-else class="m-btn m-btn--cepheid" :disabled="promoting" @click="onPromote">
          {{ promoting ? 'Creo azione…' : 'Crea azione CEPHEID' }}
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.m-page {
  font-family: 'Outfit', sans-serif;
  background: var(--md-sys-color-surface, #FFF8F0);
  color: var(--md-sys-color-on-surface, #1A1917);
  height: 100%; min-height: 0; overflow-y: auto;
  padding: 24px 32px; box-sizing: border-box;
}
.m-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.m-back { background: none; border: 1px solid #CEC6B4; width: 36px; height: 36px; border-radius: 999px; cursor: pointer; font-size: 18px; }
.m-title { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
.m-sub { font-size: 13px; color: #6A6560; margin: 2px 0 0; }
.m-empty, .m-loading { padding: 32px; text-align: center; color: #6A6560; }
.m-layout {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24px;
  min-width: 0;
}
.m-main {
  flex: 1 1 0;
  min-width: 0;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border-radius: 14px;
  padding: 24px;
}
.m-alert { background: #fef3c7; color: #92400e; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
.m-bug-title { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
.m-desc { white-space: pre-wrap; line-height: 1.55; margin: 0 0 24px; color: #374151; }
.m-section { margin-bottom: 24px; }
.m-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #7D8794; margin: 0 0 10px; }
.m-dl { display: grid; grid-template-columns: 100px 1fr; gap: 6px 12px; font-size: 14px; margin: 0 0 12px; }
.m-dl dt { color: #6A6560; }
.m-link { font-size: 14px; color: #7D8794; font-weight: 600; }
.m-pre { background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 11px; overflow-x: auto; margin: 0; }
.m-aside {
  flex: 0 0 280px;
  width: 280px;
  max-width: 34%;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.m-aside h4 { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
.m-lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #6A6560; margin-top: 4px; }
.m-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #CEC6B4; font-family: inherit; font-size: 14px; box-sizing: border-box; }
.m-ta { resize: vertical; min-height: 80px; }
.m-btn {
  margin-top: 8px; padding: 12px; border-radius: 10px; border: none; background: #7D8794; color: #fff;
  font-weight: 700; cursor: pointer; text-align: center; text-decoration: none; font-size: 14px;
}
.m-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.m-btn--ghost { background: transparent; border: 1px solid #CEC6B4; color: inherit; }
.m-btn--cepheid { background: #D4A020; color: #1a1917; }
.m-error { color: #b91c1c; font-size: 13px; }
.m-linked { font-size: 13px; color: #6A6560; margin: 8px 0 0; }
</style>
