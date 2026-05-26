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
const safeUserEmail = computed(() => info.value?.userEmail ?? currentUser.value?.email ?? '')
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
          Torna a NEBULA-DOCS
        </button>
      </div>

      <template v-else-if="info">
        <p class="oc-lead">
          <strong>{{ safeClientName }}</strong> vuole connettersi a <strong>NEBULA-DOCS</strong>
          per conto tuo (<code>{{ safeUserEmail }}</code>).
        </p>

        <div class="oc-permissions">
          <h3>Cosa potrà fare</h3>
          <ul>
            <li><MaterialIcon name="search" :size="16" />  Cercare nei tuoi documenti</li>
            <li><MaterialIcon name="description" :size="16" />  Leggere il contenuto</li>
            <li><MaterialIcon name="add" :size="16" />  Creare nuovi documenti</li>
            <li><MaterialIcon name="edit" :size="16" />  Aggiungere blocchi / modificare sezioni</li>
            <li><MaterialIcon name="link" :size="16" />  Collegare task e progetti CEPHEID</li>
          </ul>
          <p class="oc-permissions-note">
            Con i <strong>tuoi stessi permessi</strong>: i doc privati restano tuoi,
            i doc del team team-visibili. Le scritture vengono tracciate nella
            storia del documento con tag "Claude (MCP)".
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
            :disabled="approving"
            @click="deny"
          >
            Annulla
          </button>
          <button
            type="button"
            class="oc-btn oc-btn-primary"
            :disabled="approving"
            @click="authorize"
          >
            <MaterialIcon name="check" :size="16" />
            {{ approving ? 'Autorizzazione…' : 'Autorizza' }}
          </button>
        </div>

        <footer class="oc-footer">
          Puoi revocare l'accesso in qualsiasi momento da
          <strong>NEBULA → Integrazioni</strong>.
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
