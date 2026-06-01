<script setup lang="ts">
/**
 * CORE · Impostazioni — gestione allowlist email admin (doc Firestore core/admins).
 * Accesso: membri della allowlist (+ super-admin info@); in bootstrap anche ruolo ADMIN.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'
import MIcon from '../../components/shared/MIcon.vue'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'

const router = useRouter()
const { emails, initialized, isCoreAdmin, addAdmin, removeAdmin, SUPER_ADMIN } = useCoreAdmins()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),
)

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin', PRODUZIONE: 'Produzione', LOGISTICA: 'Logistica', COMMERCIALE: 'Commerciale',
}

// elenco mostrato: super-admin sempre in cima, poi le email della lista (deduplicate)
const adminList = computed(() => {
  const out = [SUPER_ADMIN, ...emails.value.filter(e => e !== SUPER_ADMIN)]
  return out.map(email => {
    const member = members.value.find(m => m.email === email)
    return { email, member, isSuper: email === SUPER_ADMIN }
  })
})

const newEmail = ref('')
const saving = ref(false)
const errorMsg = ref('')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function onAdd() {
  const e = newEmail.value.trim().toLowerCase()
  errorMsg.value = ''
  if (!e) return
  if (!EMAIL_RE.test(e)) { errorMsg.value = 'Email non valida.'; return }
  if (e === SUPER_ADMIN || emails.value.includes(e)) { newEmail.value = ''; return }
  saving.value = true
  try {
    await addAdmin(e)
    newEmail.value = ''
  } catch (err: any) {
    console.error('[CoreSettings] addAdmin', err)
    errorMsg.value = err?.message || 'Errore nel salvataggio. Verifica i permessi.'
  } finally {
    saving.value = false
  }
}

async function onRemove(email: string) {
  if (email === SUPER_ADMIN) return
  if (!confirm(`Rimuovere ${email} dagli admin CORE?`)) return
  errorMsg.value = ''
  try {
    await removeAdmin(email)
  } catch (err: any) {
    console.error('[CoreSettings] removeAdmin', err)
    errorMsg.value = err?.message || 'Errore nella rimozione.'
  }
}

// --- AUDIT pre re-key /team su UID (Fase 0, docs/STELLA-GRAFO.md) ---
// Invoca la callable READ-ONLY auditTeamUids e mostra il report. Niente scritture.
interface AuditResult {
  total: number
  ok: number
  alreadyUidKeyed: number
  problemCount: number
  readyForBackfill: boolean
  problems: Array<{ docId: string; issue: string; field?: string; auth?: string }>
  canonical: {
    docPresente: boolean; docId: string | null; uidField: string | null
    uidAtteso: string; uidOk: boolean; role: string | null
  }
}
const auditing = ref(false)
const auditError = ref('')
const auditResult = ref<AuditResult | null>(null)

async function runAudit() {
  auditing.value = true
  auditError.value = ''
  auditResult.value = null
  try {
    const fn = httpsCallable<unknown, AuditResult>(functions, 'auditTeamUids')
    const res = await fn({})
    auditResult.value = res.data
  } catch (err: any) {
    console.error('[CoreSettings] auditTeamUids', err)
    auditError.value = err?.message || 'Errore durante l\'audit. Verifica i permessi.'
  } finally {
    auditing.value = false
  }
}

// --- FASE 2: backfill /team su UID (non distruttivo) ---
interface BackfillResult {
  teamRekeyFlag: boolean
  total: number
  created: number
  skippedAlreadyUid: number
  errorCount: number
  createdDocs: string[]
  errors: Array<{ docId: string; error: string }>
}
const backfilling = ref(false)
const backfillError = ref('')
const backfillResult = ref<BackfillResult | null>(null)

async function runBackfill() {
  if (!confirm(
    'Backfill /team su UID.\n\n'
    + 'Crea i documenti uid-keyed come COPIA di quelli email-keyed (gli originali NON '
    + 'vengono cancellati) e attiva il kill-switch core/migration.teamRekey.\n\n'
    + 'Operazione reversibile e idempotente. Procedere?'
  )) return
  backfilling.value = true
  backfillError.value = ''
  backfillResult.value = null
  try {
    const fn = httpsCallable<unknown, BackfillResult>(functions, 'backfillTeamToUid')
    const res = await fn({})
    backfillResult.value = res.data
  } catch (err: any) {
    console.error('[CoreSettings] backfillTeamToUid', err)
    backfillError.value = err?.message || 'Errore durante il backfill. Verifica i permessi.'
  } finally {
    backfilling.value = false
  }
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Impostazioni</h2>
        <p class="m-sub">CORE · Amministratori</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty">
      <p>Pagina riservata agli amministratori CORE.</p>
    </div>

    <div v-else class="m-task">
      <h3 class="m-task-title">Email amministratori</h3>
      <p class="m-task-desc">
        Le email qui elencate hanno accesso alla sezione <strong>CORE</strong> (Manutenzione e Impostazioni).
        <code>{{ SUPER_ADMIN }}</code> è il super-admin e non è rimovibile.
      </p>

      <form class="m-add" @submit.prevent="onAdd">
        <input
          v-model="newEmail"
          type="email"
          class="m-input"
          placeholder="nome@dominio.it"
          autocomplete="off"
        />
        <button class="m-btn" type="submit" :disabled="saving || !newEmail.trim()">
          <MIcon name="add" :size="16" /> Aggiungi
        </button>
      </form>

      <div v-if="errorMsg" class="m-error">{{ errorMsg }}</div>

      <ul class="m-list">
        <li v-for="row in adminList" :key="row.email" class="m-row">
          <StarAvatar v-bind="starAvatarProps(row.email, members)" :size="32" class="m-avatar" />
          <div class="m-row-text">
            <div class="m-row-name">{{ row.member ? displayName(row.email, members) : row.email }}</div>
            <div class="m-row-email">{{ row.email }}</div>
          </div>
          <span v-if="row.isSuper" class="m-badge m-badge--super">super-admin</span>
          <span v-else-if="row.member" class="m-badge m-badge--active">
            {{ roleLabel[row.member.role] ?? 'attivo' }}
          </span>
          <span v-else class="m-badge m-badge--ext">non in team</span>
          <button
            v-if="!row.isSuper"
            class="m-remove"
            title="Rimuovi"
            aria-label="Rimuovi"
            @click="onRemove(row.email)"
          ><MIcon name="close" :size="16" /></button>
          <span v-else class="m-remove-spacer" />
        </li>
      </ul>
    </div>

    <!-- AUDIT pre re-key /team su UID (Fase 0) -->
    <div v-if="canAccessCore" class="m-task m-task--audit">
      <h3 class="m-task-title">Manutenzione · Audit identità team</h3>
      <p class="m-task-desc">
        Verifica <strong>read-only</strong> che ogni documento <code>/team</code> abbia un
        <code>uid</code> presente e allineato all'account Auth. È il controllo preliminare
        (Fase 0) al re-key della collezione su UID. Non scrive nulla.
      </p>

      <button class="m-btn" type="button" :disabled="auditing" @click="runAudit">
        <MIcon name="search" :size="16" /> {{ auditing ? 'Verifica in corso…' : 'Esegui audit' }}
      </button>

      <div v-if="auditError" class="m-error" style="margin-top: 12px;">{{ auditError }}</div>

      <div v-if="auditResult" class="m-audit">
        <div
          class="m-audit-banner"
          :class="auditResult.readyForBackfill ? 'm-audit-banner--ok' : 'm-audit-banner--warn'"
        >
          <MIcon :name="auditResult.readyForBackfill ? 'check_circle' : 'warning'" :size="18" />
          <span>
            {{ auditResult.readyForBackfill
              ? 'Pronto per il backfill — nessun problema rilevato.'
              : `${auditResult.problemCount} problema/i da risolvere prima del backfill.` }}
          </span>
        </div>

        <ul class="m-audit-stats">
          <li><strong>{{ auditResult.total }}</strong> doc totali</li>
          <li><strong>{{ auditResult.ok }}</strong> ok (uid allineato)</li>
          <li><strong>{{ auditResult.alreadyUidKeyed }}</strong> già uid-keyed</li>
          <li><strong>{{ auditResult.problemCount }}</strong> problemi</li>
        </ul>

        <div class="m-audit-canonical" :class="{ 'is-bad': !auditResult.canonical.uidOk }">
          Identità canonica <code>gionata.pastorin@proton.me</code>:
          <template v-if="auditResult.canonical.docPresente">
            doc <code>{{ auditResult.canonical.docId }}</code>,
            uid <code>{{ auditResult.canonical.uidField }}</code>
            — {{ auditResult.canonical.uidOk ? '✓ corretto' : '✗ NON corrisponde a ' + auditResult.canonical.uidAtteso }}
            (ruolo {{ auditResult.canonical.role ?? '—' }})
          </template>
          <template v-else>✗ documento /team non trovato.</template>
        </div>

        <ul v-if="auditResult.problems.length" class="m-audit-problems">
          <li v-for="p in auditResult.problems" :key="p.docId">
            <code>{{ p.docId }}</code> → <strong>{{ p.issue }}</strong>
            <span v-if="p.field"> (campo: {{ p.field }})</span>
            <span v-if="p.auth"> (auth: {{ p.auth }})</span>
          </li>
        </ul>

        <!-- FASE 2: backfill (solo quando l'audit è verde) -->
        <div v-if="auditResult.readyForBackfill" class="m-audit-backfill">
          <p class="m-task-desc" style="margin: 0 0 10px;">
            <strong>Fase 2 · Backfill su UID</strong> — crea i doc <code>team/{uid}</code> come copia
            (non distruttiva) di quelli email-keyed e attiva il kill-switch. Reversibile, idempotente.
          </p>
          <button class="m-btn m-btn--danger" type="button" :disabled="backfilling" @click="runBackfill">
            <MIcon name="key" :size="16" /> {{ backfilling ? 'Backfill in corso…' : 'Esegui backfill su UID' }}
          </button>

          <div v-if="backfillError" class="m-error" style="margin-top: 12px;">{{ backfillError }}</div>

          <div v-if="backfillResult" class="m-audit" style="margin-top: 12px;">
            <div class="m-audit-banner" :class="backfillResult.errorCount === 0 ? 'm-audit-banner--ok' : 'm-audit-banner--warn'">
              <MIcon :name="backfillResult.errorCount === 0 ? 'check_circle' : 'warning'" :size="18" />
              <span>
                {{ backfillResult.errorCount === 0
                  ? `Backfill completato — ${backfillResult.created} doc uid-keyed creati. Kill-switch attivo.`
                  : `${backfillResult.errorCount} errore/i durante il backfill.` }}
              </span>
            </div>
            <ul class="m-audit-stats">
              <li><strong>{{ backfillResult.created }}</strong> creati</li>
              <li><strong>{{ backfillResult.skippedAlreadyUid }}</strong> già uid-keyed</li>
              <li><strong>{{ backfillResult.errorCount }}</strong> errori</li>
              <li>kill-switch: <strong>{{ backfillResult.teamRekeyFlag ? 'ON' : 'off' }}</strong></li>
            </ul>
            <ul v-if="backfillResult.createdDocs.length" class="m-audit-problems">
              <li v-for="line in backfillResult.createdDocs" :key="line"><code>{{ line }}</code></li>
            </ul>
            <ul v-if="backfillResult.errors.length" class="m-audit-problems">
              <li v-for="e in backfillResult.errors" :key="e.docId">
                <code>{{ e.docId }}</code> → <strong>{{ e.error }}</strong>
              </li>
            </ul>
          </div>
        </div>
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
  font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 12px;
  background: var(--md-sys-color-surface-container-high, #EFE7DA);
  padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small);
}

.m-add { display: flex; gap: 8px; margin-bottom: 12px; }
.m-input {
  flex: 1; min-width: 0;
  background: var(--md-sys-color-surface-container, #F5EDDF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  border-radius: 10px; padding: 10px 14px; font-size: 14px; font-family: inherit;
  color: var(--md-sys-color-on-surface, #1A1917); outline: none;
}
.m-input:focus { border-color: var(--md-sys-color-primary, #C4941C); }

.m-btn {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  background: var(--md-sys-color-primary, #C4941C); color: var(--md-sys-color-on-primary, #FFFFFF);
  border: none; border-radius: 10px; padding: 0 18px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s; font-family: inherit;
}
.m-btn:hover:not(:disabled) { background: var(--md-sys-color-primary-hover, #B0A580); }
.m-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.m-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.m-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 10px; border-radius: 12px;
  background: var(--md-sys-color-surface-container, #F5EDDF);
}
.m-avatar { flex: 0 0 auto; border-radius: 50%; }
.m-row-text { flex: 1; min-width: 0; }
.m-row-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-row-email { font-size: 11px; color: var(--md-sys-color-on-surface-variant, #6A6560); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.m-badge {
  flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 3px 8px; border-radius: var(--md-sys-shape-corner-full);
}
.m-badge--super { background: color-mix(in srgb, var(--md-sys-color-primary, #C4941C) 18%, transparent); color: var(--md-sys-color-primary, #C4941C); }
.m-badge--active { background: color-mix(in srgb, #2F6B4A 16%, transparent); color: #2F6B4A; }
.m-badge--ext { background: var(--md-sys-color-surface-container-high, #EFE7DA); color: var(--md-sys-color-on-surface-variant, #6A6560); }

.m-remove {
  flex: 0 0 auto; background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-on-surface-variant, #6A6560); padding: 4px; border-radius: var(--md-sys-shape-corner-full);
  display: inline-flex; align-items: center;
}
.m-remove:hover { background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A); }
.m-remove-spacer { width: 24px; flex: 0 0 auto; }

.m-error {
  margin-bottom: 12px; padding: 10px 14px;
  background: var(--md-sys-color-error-container, #FFDAD6);
  color: var(--md-sys-color-on-error-container, #93000A);
  border-radius: 10px; font-size: 13px;
}

/* --- Audit pre re-key --- */
.m-task--audit { margin-top: 16px; }
.m-audit { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.m-audit-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
}
.m-audit-banner--ok { background: color-mix(in srgb, #2F6B4A 14%, transparent); color: #2F6B4A; }
.m-audit-banner--warn {
  background: var(--md-sys-color-error-container, #FFDAD6);
  color: var(--md-sys-color-on-error-container, #93000A);
}
.m-audit-stats {
  list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;
}
.m-audit-stats li {
  background: var(--md-sys-color-surface-container, #F5EDDF);
  padding: 6px 12px; border-radius: var(--md-sys-shape-corner-full); font-size: 13px;
  color: var(--md-sys-color-on-surface-variant, #6A6560);
}
.m-audit-stats strong { color: var(--md-sys-color-on-surface, #1A1917); }
.m-audit-canonical {
  font-size: 13px; line-height: 1.5; padding: 10px 14px; border-radius: 10px;
  background: var(--md-sys-color-surface-container, #F5EDDF);
  color: var(--md-sys-color-on-surface-variant, #6A6560);
}
.m-audit-canonical.is-bad {
  background: var(--md-sys-color-error-container, #FFDAD6);
  color: var(--md-sys-color-on-error-container, #93000A);
}
.m-audit-canonical code, .m-audit-problems code {
  font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 12px;
  background: var(--md-sys-color-surface-container-high, #EFE7DA);
  padding: 1px 6px; border-radius: var(--md-sys-shape-corner-extra-small);
}
.m-audit-problems {
  list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px;
}
.m-audit-problems li {
  font-size: 13px; padding: 8px 12px; border-radius: 8px;
  background: var(--md-sys-color-surface-container, #F5EDDF);
}

.m-audit-backfill {
  margin-top: 8px; padding-top: 16px;
  border-top: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
}
.m-btn--danger { background: #B3261E; }
.m-btn--danger:hover:not(:disabled) { background: #8C1D18; }
</style>
