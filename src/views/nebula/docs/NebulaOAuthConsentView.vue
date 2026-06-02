<script setup lang="ts">
/**
 * NEBULA-DOCS — OAuth consent view (F6).
 *
 * Route: /nebula/docs/oauth/consent?req=<authRequestId>
 *
 * Flow (browser):
 *  1. Mount → fetchAuthRequest(req) → mostra "<Client> vuole accesso come <tuoEmail>"
 *  2. User clicca "Autorizza" → approveAuthRequest(req) → redirect URI di claude.ai
 *  3. window.location = redirectUri → claude.ai riceve ?code=...&state=... e
 *     completa il token exchange con il nostro /token endpoint
 *  4. User clicca "Annulla" → window.location = redirectUri?error=access_denied
 *     (passato dal server con redirectWithError di oauth.ts NON, qui solo close
 *     della tab o redirect a /nebula/docs)
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../../firebase'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import {
  fetchAuthRequest, approveAuthRequest,
  type OAuthAuthRequestInfo,
} from '../../../composables/nebula/useOAuthConsent'
import MaterialIcon from './components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()

const authRequestId = computed(() => String(route.query.req ?? ''))
const info = ref<OAuthAuthRequestInfo | null>(null)
const loading = ref(true)
const approving = ref(false)
const error = ref('')

// ── Switch account (mini-login inline) ───────────────────────────────────
// User connected with account A but wants to grant OAuth to claude.ai per
// account B → signOut + signIn senza lasciare la consent view, così l'auth
// request mantiene lo stesso `req` ID e claude.ai non perde il contesto.
const switching = ref(false)
const switchEmail = ref('')
const switchPassword = ref('')
const switchBusy = ref(false)
const switchError = ref('')

async function startSwitchAccount() {
  switchError.value = ''
  switchEmail.value = ''
  switchPassword.value = ''
  try {
    await signOut(auth)
  } catch { /* ignore */ }
  switching.value = true
}

function cancelSwitchAccount() {
  switching.value = false
  switchError.value = ''
}

async function confirmSwitchAccount() {
  if (!switchEmail.value.trim() || !switchPassword.value) {
    switchError.value = 'Email e password obbligatorie.'
    return
  }
  switchBusy.value = true
  switchError.value = ''
  try {
    await signInWithEmailAndPassword(auth, switchEmail.value.trim(), switchPassword.value)
    // Refetch dell'info OAuth per aggiornare userEmail (server riflette nuova identità)
    try { info.value = await fetchAuthRequest(authRequestId.value) } catch { /* ignore */ }
    switching.value = false
    switchPassword.value = ''
  } catch (e: any) {
    switchError.value = e?.code === 'auth/invalid-credential'
      ? 'Email o password errate.'
      : (e?.message ?? String(e))
  } finally {
    switchBusy.value = false
  }
}

onMounted(async () => {
  if (!authRequestId.value) {
    error.value = 'Parametro "req" mancante nell\'URL.'
    loading.value = false
    return
  }
  try {
    info.value = await fetchAuthRequest(authRequestId.value)
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
})

async function authorize() {
  if (!info.value) return
  approving.value = true
  error.value = ''
  try {
    const redirectUri = await approveAuthRequest(info.value.authRequestId)
    // Redirect immediato a claude.ai con auth code
    window.location.href = redirectUri
  } catch (e: any) {
    error.value = e?.message ?? String(e)
    approving.value = false
  }
}

function deny() {
  // Per semplicità, torno alla home NEBULA. (Una implementazione più rigida
  // farebbe POST/redirect a redirectUri?error=access_denied — claude.ai gestirà
  // il timeout della authorization request comunque)
  router.push('/nebula/docs')
}

const safeClientName = computed(() => info.value?.clientName ?? 'Applicazione esterna')
// Preferiamo currentUser (reattivo: si aggiorna subito dopo switch account)
// e usiamo info.userEmail come fallback se currentUser non è ancora pronto.
const safeUserEmail = computed(() => currentUser.value?.email ?? info.value?.userEmail ?? '')
// Estrai origine del redirect_uri per mostrarla all'utente (es. "claude.ai")
const redirectHost = computed(() => {
  if (!info.value?.redirectUri) return ''
  try { return new URL(info.value.redirectUri).host } catch { return info.value.redirectUri }
})
</script>

<template>
  <div class="oc-root">
    <div class="oc-card">
      <header class="oc-header">
        <span class="material-symbols-outlined oc-logo">link</span>
        <h1>Connessione applicazione esterna</h1>
      </header>

      <div v-if="loading" class="oc-state">
        <MaterialIcon name="hourglass_top" :size="28" color="#C46030" />
        <p>Verifico la richiesta…</p>
      </div>

      <div v-else-if="error" class="oc-state oc-error">
        <MaterialIcon name="error" :size="28" color="#a82020" />
        <p>{{ error }}</p>
        <button type="button" class="oc-btn oc-btn-secondary" @click="router.push('/nebula/docs')">
          Torna a SIDERA
        </button>
      </div>

      <template v-else-if="info">
        <p class="oc-lead">
          <strong>{{ safeClientName }}</strong> vuole connettersi a <strong>SIDERA</strong>
          per conto tuo (<code>{{ safeUserEmail || '…' }}</code>).
        </p>

        <!-- Switch account: link discreto sotto al lead. -->
        <div v-if="!switching" class="oc-switch-row">
          <button
            type="button"
            class="oc-switch-link"
            :disabled="approving"
            @click="startSwitchAccount"
          >
            <MaterialIcon name="switch_account" :size="14" />
            Non sei tu? Cambia account
          </button>
        </div>

        <div v-else class="oc-switch-form">
          <h3>Accedi con un altro account</h3>
          <label class="oc-field">
            <span>Email</span>
            <input
              v-model="switchEmail"
              type="email"
              autocomplete="username"
              :disabled="switchBusy"
              @keydown.enter.prevent="confirmSwitchAccount"
            />
          </label>
          <label class="oc-field">
            <span>Password</span>
            <input
              v-model="switchPassword"
              type="password"
              autocomplete="current-password"
              :disabled="switchBusy"
              @keydown.enter.prevent="confirmSwitchAccount"
            />
          </label>
          <p v-if="switchError" class="oc-switch-error">{{ switchError }}</p>
          <div class="oc-switch-actions">
            <button
              type="button"
              class="oc-btn oc-btn-secondary"
              :disabled="switchBusy"
              @click="cancelSwitchAccount"
            >Annulla</button>
            <button
              type="button"
              class="oc-btn oc-btn-primary"
              :disabled="switchBusy"
              @click="confirmSwitchAccount"
            >{{ switchBusy ? 'Accesso…' : 'Accedi' }}</button>
          </div>
        </div>

        <div class="oc-permissions">
          <h3>Cosa potrà fare</h3>
          <ul>
            <li><MaterialIcon name="search" :size="16" />  Cercare e leggere i tuoi documenti <strong>NEBULA</strong></li>
            <li><MaterialIcon name="edit" :size="16" />  Creare e modificare documenti (blocchi, sezioni)</li>
            <li><MaterialIcon name="rocket_launch" :size="16" />  Creare progetti, task, milestone e deliverable in <strong>CEPHEID</strong></li>
            <li><MaterialIcon name="link" :size="16" />  Collegare task e progetti ai documenti</li>
          </ul>
          <p class="oc-permissions-note">
            Con i <strong>tuoi stessi permessi</strong>: i doc privati restano tuoi,
            i doc del team team-visibili; la creazione in CEPHEID richiede privilegi
            admin. Le scritture vengono tracciate nella storia con tag "Claude (MCP)".
          </p>
        </div>

        <div class="oc-redirect-info">
          <MaterialIcon name="open_in_new" :size="14" color="#888" />
          Al click su <strong>Autorizza</strong> verrai rimandato a
          <code>{{ redirectHost }}</code>
        </div>

        <div class="oc-actions">
          <button
            type="button"
            class="oc-btn oc-btn-secondary"
            :disabled="approving || switching"
            @click="deny"
          >
            Annulla
          </button>
          <button
            type="button"
            class="oc-btn oc-btn-primary"
            :disabled="approving || switching || !safeUserEmail"
            @click="authorize"
          >
            <MaterialIcon name="check" :size="16" />
            {{ approving ? 'Autorizzazione…' : 'Autorizza' }}
          </button>
        </div>

        <footer class="oc-footer">
          Puoi revocare l'accesso in qualsiasi momento da
          <strong>CORE → Integrazioni</strong>.
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.oc-root {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--md-sys-color-surface, #fafafa);
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  box-sizing: border-box;
}
.oc-card {
  max-width: 540px;
  width: 100%;
  background: white;
  border-radius: 20px;
  padding: 32px 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05);
  box-sizing: border-box;
}

.oc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.oc-logo { font-size: 28px; color: #C46030; }
.oc-header h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 24px;
  margin: 0;
}

.oc-lead {
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 18px;
}
.oc-lead code,
.oc-redirect-info code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: rgba(196, 96, 48, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  word-break: break-all;
}

.oc-permissions {
  background: var(--md-sys-color-surface, #fafafa);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.oc-permissions h3 {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #777;
  margin: 0 0 10px;
}
.oc-permissions ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.oc-permissions li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 14px;
  color: #333;
}
.oc-permissions li .material-symbols-outlined { color: #C46030; }
.oc-permissions-note {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: #666;
  line-height: 1.5;
}

.oc-redirect-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(0,0,0,0.03);
  border-radius: 8px;
  font-size: 12.5px;
  color: #666;
  margin-bottom: 18px;
}

.oc-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.oc-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  padding: 10px 20px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
.oc-btn:disabled { opacity: 0.6; cursor: wait; }
.oc-btn-primary {
  background: #C46030;
  color: white;
}
.oc-btn-primary:hover:not(:disabled) { background: #B85425; }
.oc-btn-secondary {
  background: rgba(0,0,0,0.06);
  color: #444;
}
.oc-btn-secondary:hover:not(:disabled) { background: rgba(0,0,0,0.10); }

.oc-footer {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(0,0,0,0.06);
  font-size: 12px;
  color: #888;
  text-align: center;
}

/* Switch account */
.oc-switch-row {
  margin: -10px 0 16px;
}
.oc-switch-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  padding: 4px 6px;
  margin-left: -6px;
  border-radius: 6px;
  color: #C46030;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 120ms ease;
}
.oc-switch-link:hover:not(:disabled) {
  background: rgba(196, 96, 48, 0.08);
}
.oc-switch-link:disabled { opacity: 0.5; cursor: not-allowed; }

.oc-switch-form {
  background: rgba(196, 96, 48, 0.05);
  border: 1px solid rgba(196, 96, 48, 0.15);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.oc-switch-form h3 {
  font-size: 13px;
  font-weight: 600;
  color: #C46030;
  margin: 0 0 10px;
}
.oc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.oc-field span {
  font-size: 11.5px;
  color: #777;
}
.oc-field input {
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  background: white;
}
.oc-field input:focus {
  outline: none;
  border-color: #C46030;
  box-shadow: 0 0 0 3px rgba(196,96,48,0.15);
}
.oc-switch-error {
  margin: 4px 0 10px;
  font-size: 12.5px;
  color: #a82020;
}
.oc-switch-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* States */
.oc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px 10px;
  text-align: center;
  color: #777;
}
.oc-error { color: #a82020; }

@media (max-width: 600px) {
  .oc-card { padding: 24px 18px; }
  .oc-actions { flex-direction: column-reverse; }
  .oc-actions .oc-btn { width: 100%; justify-content: center; }
}
</style>
