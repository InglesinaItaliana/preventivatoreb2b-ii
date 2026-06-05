<script setup lang="ts">
/**
 * Pagina admin per task di manutenzione una-tantum.
 * Accessibile solo a info@inglesinaitaliana.it (guardia client-side; la function
 * stessa rivalida l'identità lato server).
 *
 * Aggiungere qui altri task di manutenzione futuri (es. backfill schema, fix indici).
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../firebase'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'

const router = useRouter()
const { isCoreAdmin } = useCoreAdmins()
const userEmail = computed(() => (auth.currentUser?.email ?? '').toLowerCase().trim())
const isAdmin = computed(() => isCoreAdmin(userEmail.value))

interface CleanupResult {
  orphanChatsCount: number
  deletedMessagesCount: number
  totalMessagesScanned: number
  totalChatsScanned: number
}

interface BackfillResult {
  success: boolean
  updated: number
  categoriesTouched: Record<string, number>
}

const running = ref(false)
const result = ref<CleanupResult | null>(null)
const errorMsg = ref<string>('')

const backfillRunning = ref(false)
const backfillResult = ref<BackfillResult | null>(null)
const backfillError = ref<string>('')

// A0 — Audit assignees email→UID (read-only)
interface AssigneeAuditResult {
  teamMembers: number
  taskCount: number
  tasksWithAssignees: number
  assigneeRefs: number
  emailMappable: number
  emailOrphan: number
  alreadyUid: number
  unknownNonEmail: number
  orphanEmails: string[]
  unknownRefs: string[]
  readyForBackfill: boolean
}
const auditRunning = ref(false)
const auditResult = ref<AssigneeAuditResult | null>(null)
const auditError = ref<string>('')

async function runAssigneeAudit() {
  if (auditRunning.value) return
  auditRunning.value = true
  auditResult.value = null
  auditError.value = ''
  try {
    const fn = httpsCallable<Record<string, never>, AssigneeAuditResult>(functions, 'auditAssigneeUids')
    const res = await fn({})
    auditResult.value = res.data
  } catch (e: any) {
    console.error('[auditAssigneeUids]', e)
    auditError.value = e?.message || 'Errore sconosciuto. Vedi console.'
  } finally {
    auditRunning.value = false
  }
}

async function runCleanup() {
  if (running.value) return
  if (!confirm('Eseguire cleanup delle pendenze orfane? L\'operazione può richiedere fino a 9 minuti su workspace grandi.')) return
  running.value = true
  result.value = null
  errorMsg.value = ''
  try {
    const fn = httpsCallable<Record<string, never>, CleanupResult>(functions, 'cleanupOrphanPendingMessages')
    const res = await fn({})
    result.value = res.data
  } catch (e: any) {
    console.error('[cleanupOrphanPendingMessages]', e)
    errorMsg.value = e?.message || 'Errore sconosciuto. Vedi console.'
  } finally {
    running.value = false
  }
}

async function runAvatarBackfill() {
  if (backfillRunning.value) return
  if (!confirm('Ri-assegnare hueIndex per-categoria a tutti i membri team? L\'operazione è idempotente.')) return
  backfillRunning.value = true
  backfillResult.value = null
  backfillError.value = ''
  try {
    const fn = httpsCallable<Record<string, never>, BackfillResult>(functions, 'backfillTeamAvatars')
    const res = await fn({})
    backfillResult.value = res.data
  } catch (e: any) {
    console.error('[backfillTeamAvatars]', e)
    backfillError.value = e?.message || 'Errore sconosciuto. Vedi console.'
  } finally {
    backfillRunning.value = false
  }
}
</script>

<template>
  <div class="m-page">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Manutenzione</h2>
        <p class="m-sub">Task admin una-tantum</p>
      </div>
    </header>

    <div v-if="!isAdmin" class="m-empty">
      <p>Pagina riservata all'amministratore.</p>
    </div>

    <div v-else class="m-task">
      <h3 class="m-task-title">Pulisci pendenze orfane (PULSAR)</h3>
      <p class="m-task-desc">
        Elimina i messaggi rimasti in <code>chats/{id}/messages/</code> dove la chat
        parent è stata cancellata prima del deploy di <code>onChatDeleted</code>.
        Idempotente: rieseguibile senza danni.
      </p>

      <button class="m-btn" :disabled="running" @click="runCleanup">
        {{ running ? 'In esecuzione…' : 'Esegui cleanup' }}
      </button>

      <div v-if="result" class="m-result">
        <h4>Risultato</h4>
        <ul>
          <li><strong>{{ result.orphanChatsCount }}</strong> chat orfane trovate</li>
          <li><strong>{{ result.deletedMessagesCount }}</strong> messaggi cancellati</li>
          <li>{{ result.totalMessagesScanned }} messaggi scansionati su {{ result.totalChatsScanned }} chat totali</li>
        </ul>
      </div>

      <div v-if="errorMsg" class="m-error">
        <strong>Errore:</strong> {{ errorMsg }}
      </div>
    </div>

    <div v-if="isAdmin" class="m-task">
      <h3 class="m-task-title">Backfill avatar stellari</h3>
      <p class="m-task-desc">
        Ri-assegna <code>hueIndex</code> sequenziale per ogni categoria
        (ordinando per email). Allinea i counter <code>counters/teamHue_${'{'}category{'}'}</code>
        per future assunzioni. Idempotente: ri-eseguibile senza danni.
        Da invocare una volta dopo deploy del trigger per-categoria.
      </p>

      <button class="m-btn" :disabled="backfillRunning" @click="runAvatarBackfill">
        {{ backfillRunning ? 'In esecuzione…' : 'Esegui backfill' }}
      </button>

      <div v-if="backfillResult" class="m-result">
        <h4>Risultato</h4>
        <ul>
          <li><strong>{{ backfillResult.updated }}</strong> documenti aggiornati</li>
          <li v-for="(count, cat) in backfillResult.categoriesTouched" :key="cat">
            <code>{{ cat }}</code>: {{ count }} membri (hueIndex 0..{{ count - 1 }})
          </li>
        </ul>
      </div>

      <div v-if="backfillError" class="m-error">
        <strong>Errore:</strong> {{ backfillError }}
      </div>
    </div>

    <div v-if="isAdmin" class="m-task">
      <h3 class="m-task-title">Audit assignees → UID (A0)</h3>
      <p class="m-task-desc">
        <strong>Sola lettura.</strong> Scansiona tutte le task e classifica ogni
        <code>assignee</code>: email migrabile (uid noto), email orfana (esterni/ex-staff),
        già uid, o anomalia. Serve a vedere il quadro <em>prima</em> della migrazione
        Strada B (STELLA-GRAFO). Nessuna scrittura.
      </p>

      <button class="m-btn" :disabled="auditRunning" @click="runAssigneeAudit">
        {{ auditRunning ? 'In esecuzione…' : 'Esegui audit' }}
      </button>

      <div v-if="auditResult" class="m-result">
        <h4>Risultato</h4>
        <ul>
          <li><strong>{{ auditResult.assigneeRefs }}</strong> riferimenti assignee in {{ auditResult.tasksWithAssignees }} task (su {{ auditResult.taskCount }} totali · {{ auditResult.teamMembers }} membri)</li>
          <li><strong>{{ auditResult.emailMappable }}</strong> email migrabili (uid noto)</li>
          <li><strong>{{ auditResult.emailOrphan }}</strong> email orfane (resteranno email) <template v-if="auditResult.orphanEmails.length">→ <code>{{ auditResult.orphanEmails.join(', ') }}</code></template></li>
          <li><strong>{{ auditResult.alreadyUid }}</strong> già uid</li>
          <li><strong>{{ auditResult.unknownNonEmail }}</strong> anomalie (né email né uid noto)<template v-if="auditResult.unknownRefs.length">: <code>{{ auditResult.unknownRefs.join(', ') }}</code></template></li>
          <li>Pronto per il backfill: <strong>{{ auditResult.readyForBackfill ? 'SÌ' : 'NO (risolvi le anomalie)' }}</strong></li>
        </ul>
      </div>

      <div v-if="auditError" class="m-error">
        <strong>Errore:</strong> {{ auditError }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-page {
  font-family: 'Outfit', sans-serif;
  background: var(--md-sys-color-surface, #FFF8F0);
  color: var(--md-sys-color-on-surface, #1A1917);
  min-height: 100vh;
  padding: 24px 32px;
}
.m-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.m-back {
  background: none; border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  width: 36px; height: 36px; border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer; font-size: 18px; color: inherit;
}
.m-back:hover { background: var(--md-sys-color-surface-container, #F5EDDF); }
.m-title { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
.m-sub { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 2px 0 0; }

.m-empty {
  background: var(--md-sys-color-surface-container, #F5EDDF);
  padding: 32px; border-radius: var(--md-sys-shape-corner-medium); text-align: center;
}

.m-task {
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  border-radius: 14px; padding: 24px; max-width: 640px;
}
.m-task-title { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
.m-task-desc { font-size: 14px; line-height: 1.5; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 0 0 16px; }
.m-task-desc code {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12px;
  background: var(--md-sys-color-surface-container-high, #EFE7DA);
  padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small);
}

.m-btn {
  background: var(--md-sys-color-primary, #D4C498);
  color: var(--md-sys-color-on-primary, #FFFFFF);
  border: none; border-radius: 10px;
  padding: 11px 22px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
  font-family: inherit;
}
.m-btn:hover:not(:disabled) { background: var(--md-sys-color-primary-hover, #B0A580); }
.m-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.m-result {
  margin-top: 20px; padding: 16px;
  background: color-mix(in srgb, var(--md-sys-color-primary, #D4C498) 10%, transparent);
  border-radius: 10px;
  border-left: 3px solid var(--md-sys-color-primary, #D4C498);
}
.m-result h4 { font-size: 13px; font-weight: 700; margin: 0 0 8px; letter-spacing: 0.04em; text-transform: uppercase; }
.m-result ul { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; }

.m-error {
  margin-top: 20px; padding: 14px;
  background: var(--md-sys-color-error-container, #FFDAD6);
  color: var(--md-sys-color-on-error-container, #93000A);
  border-radius: 10px; font-size: 14px;
}
</style>
