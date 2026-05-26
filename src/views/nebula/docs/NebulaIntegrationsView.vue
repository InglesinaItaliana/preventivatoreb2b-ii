<script setup lang="ts">
/**
 * NEBULA-DOCS — Integrazioni (F4-C2).
 *
 * UI per gestire le API key del MCP server NEBULA-DOCS:
 *  - Lista chiavi attive (label + prefix + lastUsedAt + revoca)
 *  - Genera nuova chiave (one-time display + copia + warning)
 *  - Setup snippet per Claude Desktop
 *
 * Route: /nebula/docs/settings/integrations
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  generateApiKey, revokeApiKey, listApiKeys,
  type ApiKeyInfo, type GenerateOutput,
} from '../../../composables/nebula/useApiKeys'
import MaterialIcon from './components/MaterialIcon.vue'

const router = useRouter()

const keys = ref<ApiKeyInfo[]>([])
const loading = ref(false)
const generating = ref(false)
const revokingId = ref<string | null>(null)
const lastError = ref('')

const showGenerateModal = ref(false)
const newLabel = ref('')
const newKey = ref<GenerateOutput | null>(null)
const copied = ref(false)

// URL del MCP server — derivato da Firebase project + region
const MCP_URL = computed(() =>
  'https://europe-west1-preventivatoreb2b-ii.cloudfunctions.net/mcpNebula'
)

// Config Claude Desktop via bridge `mcp-remote` (Claude Desktop attualmente
// supporta meglio MCP stdio; il bridge mcp-remote proxa stdio → HTTP remoto).
const claudeDesktopConfig = computed(() => {
  return JSON.stringify({
    mcpServers: {
      nebula: {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote',
          MCP_URL.value,
          '--header',
          'Authorization:Bearer <INCOLLA_QUI_LA_TUA_CHIAVE>',
        ],
      },
    },
  }, null, 2)
})

async function refresh() {
  loading.value = true
  lastError.value = ''
  try {
    keys.value = await listApiKeys()
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

function openGenerateModal() {
  newLabel.value = ''
  newKey.value = null
  copied.value = false
  showGenerateModal.value = true
}

async function doGenerate() {
  generating.value = true
  lastError.value = ''
  try {
    newKey.value = await generateApiKey(newLabel.value.trim() || 'Chiave senza nome')
    await refresh()
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    generating.value = false
  }
}

async function copyPlainKey() {
  if (!newKey.value) return
  try {
    await navigator.clipboard.writeText(newKey.value.plainKey)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    lastError.value = 'Impossibile copiare in clipboard — copia manualmente'
  }
}

function closeGenerateModal() {
  showGenerateModal.value = false
  newKey.value = null
  newLabel.value = ''
}

async function doRevoke(k: ApiKeyInfo) {
  if (!confirm(`Revocare la chiave "${k.label}"? Le applicazioni che la usano smetteranno di funzionare immediatamente.`)) return
  revokingId.value = k.id
  lastError.value = ''
  try {
    await revokeApiKey(k.id)
    await refresh()
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    revokingId.value = null
  }
}

function formatTime(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeSince(ms: number | null): string {
  if (!ms) return 'mai usata'
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'pochi secondi fa'
  if (min < 60) return `${min} min fa`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h fa`
  const d = Math.floor(h / 24)
  return `${d} giorni fa`
}

const activeKeys = computed(() => keys.value.filter(k => !k.revoked))
const revokedKeys = computed(() => keys.value.filter(k => k.revoked))
</script>

<template>
  <div class="ni-root">
    <header class="ni-header">
      <button
        type="button"
        class="ni-back"
        aria-label="Torna a NEBULA-DOCS"
        @click="router.push('/nebula/docs')"
      >
        <MaterialIcon name="arrow_back" :size="20" />
      </button>
      <div class="ni-title-block">
        <span class="ni-eyebrow">Integrazioni</span>
        <h2>Connetti Claude (MCP)</h2>
      </div>
    </header>

    <section class="ni-section">
      <h3>Come funziona</h3>
      <p>
        Genera una <strong>chiave API</strong> da incollare nella configurazione di
        <strong>Claude Desktop</strong> (vedi setup sotto). Claude potrà cercare,
        creare e modificare i tuoi documenti NEBULA via protocollo MCP — con i
        tuoi stessi permessi (doc privati restano tuoi, doc team team-visibili).
      </p>
      <div class="ni-callout">
        <MaterialIcon name="info" :size="16" />
        <span>
          <strong>Importante:</strong> ogni chiave è legata all'utente che la
          genera (l'account con cui sei loggato adesso). Se vuoi che Claude
          veda i tuoi doc personali, genera la chiave loggato col tuo account.
          Per usare Claude su doc di altri, fatti aggiungere come writer
          oppure chiedi a un owner di renderli "visibili al team".
        </span>
      </div>
    </section>

    <section v-if="lastError" class="ni-toast ni-toast-err">
      <MaterialIcon name="error" :size="16" /> {{ lastError }}
    </section>

    <section class="ni-section ni-section-keys">
      <div class="ni-section-header">
        <h3>Le tue chiavi <span v-if="!loading && activeKeys.length" class="ni-count">{{ activeKeys.length }}</span></h3>
        <button type="button" class="ni-btn-primary" @click="openGenerateModal">
          <MaterialIcon name="add" :size="16" /> Genera nuova chiave
        </button>
      </div>

      <div v-if="loading" class="ni-loading">
        <MaterialIcon name="hourglass_top" :size="24" color="#C46030" />
        <p>Caricamento chiavi…</p>
      </div>

      <div v-else-if="activeKeys.length === 0 && revokedKeys.length === 0" class="ni-empty">
        <MaterialIcon name="key_off" :size="28" color="#bbb" />
        <p>Nessuna chiave generata.</p>
        <small>Clicca "Genera nuova chiave" per iniziare.</small>
      </div>

      <ul v-else class="ni-keys-list">
        <li v-for="k in activeKeys" :key="k.id" class="ni-key">
          <div class="ni-key-meta">
            <span class="ni-key-label">{{ k.label }}</span>
            <code class="ni-key-prefix">{{ k.prefix }}…</code>
          </div>
          <div class="ni-key-info">
            <span class="ni-key-info-row">
              <MaterialIcon name="schedule" :size="12" />
              Creata: {{ formatTime(k.createdAt) }}
            </span>
            <span class="ni-key-info-row">
              <MaterialIcon name="history" :size="12" />
              Ultimo uso: {{ timeSince(k.lastUsedAt) }}
            </span>
          </div>
          <button
            type="button"
            class="ni-btn-revoke"
            :disabled="revokingId === k.id"
            @click="doRevoke(k)"
          >
            {{ revokingId === k.id ? 'Revoca…' : 'Revoca' }}
          </button>
        </li>
      </ul>

      <details v-if="revokedKeys.length > 0" class="ni-revoked-list">
        <summary>{{ revokedKeys.length }} chiavi revocate</summary>
        <ul>
          <li v-for="k in revokedKeys" :key="k.id" class="ni-key ni-key-revoked">
            <div class="ni-key-meta">
              <span class="ni-key-label">{{ k.label }}</span>
              <code class="ni-key-prefix">{{ k.prefix }}…</code>
            </div>
            <span class="ni-key-info-row">Revocata: {{ formatTime(k.revokedAt) }}</span>
          </li>
        </ul>
      </details>
    </section>

    <section class="ni-section">
      <h3>Opzione A · claude.ai web (Recommended, zero install)</h3>
      <p>
        Setup più rapido — funziona dal browser anche da mobile. Nessuna
        chiave da copiare manualmente: autorizza il connettore con un click,
        come "Connetti con Google".
      </p>
      <ol class="ni-steps">
        <li>Vai su <a href="https://claude.ai" target="_blank" rel="noopener noreferrer"><code>claude.ai</code></a> → Settings → Connectors</li>
        <li>Click <strong>Add custom connector</strong></li>
        <li>Incolla questo URL:</li>
      </ol>
      <pre class="ni-code">{{ MCP_URL }}</pre>
      <ol class="ni-steps" start="4">
        <li>Click <strong>Connect</strong></li>
        <li>Si aprirà una pagina di NEBULA-DOCS con "Autorizza" → conferma</li>
        <li>Torni su claude.ai con il connettore attivo. Pronto.</li>
      </ol>
      <p class="ni-note">
        Niente API key da gestire — l'autorizzazione è legata al tuo login
        Firebase su NEBULA. Per revocare, da claude.ai disconnetti il
        connettore (oppure scadenza automatica dopo 90 giorni).
      </p>
    </section>

    <section class="ni-section">
      <h3>Opzione B · Claude Desktop (via mcp-remote bridge)</h3>
      <ol class="ni-steps">
        <li>Genera una chiave qui sopra e copiala (visibile UNA SOLA volta!).</li>
        <li>Apri o crea il file <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) — o <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).</li>
        <li>Incolla il contenuto di <code>mcpServers</code> dentro il JSON esistente, sostituendo <code>&lt;INCOLLA_QUI_LA_TUA_CHIAVE&gt;</code>:</li>
      </ol>
      <pre class="ni-code">{{ claudeDesktopConfig }}</pre>
      <p class="ni-note">
        <strong>Riavvia completamente Claude Desktop</strong> (Cmd+Q, non solo finestra)
        per applicare la config. Al primo avvio <code>npx</code> scaricherà
        <code>mcp-remote</code> (~5 sec una tantum).
      </p>
      <p class="ni-note">
        URL MCP server: <code>{{ MCP_URL }}</code>
      </p>
    </section>

    <section class="ni-section">
      <h3>Cosa può fare Claude</h3>
      <p>Una volta connesso, Claude può:</p>
      <ul class="ni-tools-list">
        <li><strong>Cercare</strong> nei tuoi doc per parola chiave</li>
        <li><strong>Leggere</strong> contenuto di un doc (in markdown o JSON)</li>
        <li><strong>Listare</strong> doc accessibili (con filtro parent)</li>
        <li><strong>Creare</strong> nuovi doc con contenuto markdown</li>
        <li><strong>Aggiungere</strong> blocchi in fondo a un doc</li>
        <li><strong>Sostituire</strong> una sezione (identificata dal titolo heading)</li>
        <li><strong>Collegare</strong> task / progetti CEPHEID come chip live</li>
      </ul>
      <p class="ni-note">
        Ogni write da Claude crea uno snapshot in storia con badge
        <strong>"Claude (MCP)"</strong> — puoi sempre ripristinare versioni
        precedenti dalla vista history.
      </p>
    </section>

    <!-- Modal genera chiave -->
    <div v-if="showGenerateModal" class="ni-modal-backdrop" @click.self="closeGenerateModal">
      <div class="ni-modal">
        <header class="ni-modal-header">
          <MaterialIcon name="vpn_key" :size="22" color="#C46030" />
          <h3>{{ newKey ? 'Chiave creata' : 'Nuova chiave API' }}</h3>
        </header>

        <!-- Step 1: input label -->
        <div v-if="!newKey" class="ni-modal-body">
          <label class="ni-field-label">Etichetta (per ricordarti dove è in uso)</label>
          <input
            v-model="newLabel"
            type="text"
            class="ni-field-input"
            placeholder="es. Claude Desktop · MacBook"
            autofocus
          />
          <p class="ni-note">La chiave sarà associata al tuo account e avrà i tuoi stessi permessi sui documenti.</p>
        </div>

        <!-- Step 2: display key one-time -->
        <div v-else class="ni-modal-body">
          <div class="ni-warning">
            <MaterialIcon name="warning" :size="18" color="#C46030" />
            <span>Questa è l'unica volta che vedrai la chiave intera. <strong>Copiala adesso</strong>.</span>
          </div>
          <label class="ni-field-label">Chiave API</label>
          <div class="ni-key-display">
            <code>{{ newKey.plainKey }}</code>
            <button type="button" class="ni-btn-copy" @click="copyPlainKey">
              <MaterialIcon :name="copied ? 'check' : 'content_copy'" :size="16" />
              {{ copied ? 'Copiato!' : 'Copia' }}
            </button>
          </div>
          <p class="ni-note">Etichetta: <strong>{{ newKey.label }}</strong></p>
        </div>

        <footer class="ni-modal-footer">
          <button v-if="!newKey" type="button" class="ni-btn-secondary" @click="closeGenerateModal">
            Annulla
          </button>
          <button v-if="!newKey" type="button" class="ni-btn-primary" :disabled="generating" @click="doGenerate">
            {{ generating ? 'Generazione…' : 'Genera' }}
          </button>
          <button v-else type="button" class="ni-btn-primary" @click="closeGenerateModal">
            Ho copiato la chiave
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ni-root {
  height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  box-sizing: border-box;
}
.ni-root, .ni-root *, .ni-root *::before, .ni-root *::after { box-sizing: border-box; }

.ni-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.ni-back {
  background: transparent; border: 0; padding: 6px; border-radius: 8px;
  cursor: pointer; color: #555; display: flex;
}
.ni-back:hover { background: rgba(0,0,0,0.04); }
.ni-eyebrow {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: #C46030; font-weight: 500;
}
.ni-title-block h2 {
  font-family: 'Cormorant Garamond', serif; font-weight: 600;
  font-size: 26px; margin: 2px 0 0;
}

.ni-section {
  margin-bottom: 28px;
}
.ni-section h3 {
  font-size: 13px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.06em; color: #777;
  margin: 0 0 10px;
  display: flex; align-items: center; gap: 8px;
}
.ni-section p {
  font-size: 14px; line-height: 1.55; color: #444; margin: 0 0 8px;
}
.ni-count {
  background: rgba(196, 96, 48, 0.12); color: #C46030;
  padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
}

.ni-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; gap: 8px;
}

.ni-btn-primary {
  background: #C46030; color: white; border: 0; border-radius: 999px;
  padding: 8px 16px; font: inherit; font-size: 13px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.ni-btn-primary:hover:not(:disabled) { background: #B85425; }
.ni-btn-primary:disabled { opacity: 0.6; cursor: wait; }
.ni-btn-secondary {
  background: rgba(0,0,0,0.06); color: #444; border: 0; border-radius: 999px;
  padding: 8px 16px; font: inherit; font-size: 13px; cursor: pointer;
}
.ni-btn-secondary:hover { background: rgba(0,0,0,0.10); }
.ni-btn-revoke {
  background: transparent; border: 1px solid rgba(168, 32, 32, 0.30);
  color: #a82020; border-radius: 999px; padding: 4px 12px;
  font: inherit; font-size: 11.5px; cursor: pointer; flex-shrink: 0;
}
.ni-btn-revoke:hover:not(:disabled) { background: rgba(168, 32, 32, 0.08); }
.ni-btn-revoke:disabled { opacity: 0.5; cursor: wait; }

.ni-loading, .ni-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 40px 20px; text-align: center; color: #888;
}
.ni-empty small { color: #aaa; font-size: 12px; }

.ni-keys-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.ni-key {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  background: var(--md-sys-color-surface-container, #fff);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 10px;
}
.ni-key-meta {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1; min-width: 0;
}
.ni-key-label {
  font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface, #1a1a1a);
}
.ni-key-prefix {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; color: #888;
  background: rgba(0,0,0,0.04); padding: 1px 5px; border-radius: 4px;
  width: fit-content;
}
.ni-key-info {
  display: flex; flex-direction: column; gap: 2px;
  flex-shrink: 0;
}
.ni-key-info-row {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: #888;
}

.ni-key-revoked { opacity: 0.55; }
.ni-revoked-list {
  margin-top: 14px; font-size: 12.5px;
}
.ni-revoked-list summary { cursor: pointer; color: #888; padding: 4px 0; }
.ni-revoked-list ul { list-style: none; padding: 0; margin: 8px 0 0; }

.ni-toast {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;
  font-size: 13px;
}
.ni-toast-err { background: rgba(200, 50, 50, 0.10); color: #a82020; }

.ni-steps {
  padding-left: 20px;
  list-style: decimal;
  font-size: 14px;
  line-height: 1.55;
  color: #444;
}
.ni-steps li { margin: 4px 0; }
.ni-steps code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 4px;
}

.ni-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: #1f1f1f; color: #e2e2e2;
  padding: 14px 16px; border-radius: 10px;
  overflow-x: auto;
  margin: 8px 0;
  line-height: 1.5;
}
.ni-note {
  font-size: 12px; color: #777; margin: 6px 0;
}
.ni-note code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 4px;
  word-break: break-all;
}

.ni-callout {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(196, 96, 48, 0.08);
  border-left: 3px solid #C46030;
  border-radius: 6px;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #444;
}
.ni-callout strong { color: #8E4621; }

.ni-tools-list {
  list-style: disc;
  padding-left: 22px;
  font-size: 14px;
  line-height: 1.55;
  color: #444;
  margin: 4px 0;
}
.ni-tools-list li { display: list-item; margin: 4px 0; }
.ni-tools-list strong { color: var(--md-sys-color-on-surface, #1a1a1a); }

/* Modal */
.ni-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 20px;
}
.ni-modal {
  background: white; border-radius: 16px;
  max-width: 560px; width: 100%;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  animation: ni-modal-in 200ms ease-out;
}
@keyframes ni-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.ni-modal-header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 22px; border-bottom: 1px solid rgba(0,0,0,0.06);
}
.ni-modal-header h3 {
  font-family: 'Cormorant Garamond', serif; font-weight: 600;
  font-size: 22px; margin: 0; color: #1a1a1a; letter-spacing: 0; text-transform: none;
}
.ni-modal-body { padding: 18px 22px; }
.ni-modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 14px 22px; border-top: 1px solid rgba(0,0,0,0.06);
  background: #fafafa;
}

.ni-field-label {
  display: block; font-size: 11px; font-weight: 500;
  color: #777; text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 6px;
}
.ni-field-input {
  width: 100%; padding: 8px 12px;
  border: 1px solid rgba(0,0,0,0.10); border-radius: 8px;
  font: inherit; font-size: 14px;
}
.ni-field-input:focus { border-color: #C46030; outline: 0; }

.ni-warning {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  background: rgba(196, 96, 48, 0.10);
  color: #8E4621;
  border-radius: 8px;
  font-size: 13px; line-height: 1.45;
  margin-bottom: 14px;
}

.ni-key-display {
  display: flex; align-items: center; gap: 8px;
  background: #1f1f1f; color: #e2e2e2;
  padding: 12px 14px; border-radius: 8px;
}
.ni-key-display code {
  flex: 1; min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 1.4;
  word-break: break-all;
}
.ni-btn-copy {
  background: #C46030; color: white; border: 0; border-radius: 6px;
  padding: 6px 10px; font: inherit; font-size: 12px;
  cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  flex-shrink: 0;
}
.ni-btn-copy:hover { background: #B85425; }

@media (max-width: 600px) {
  .ni-root { padding: 16px 12px 80px; }
  .ni-key { flex-wrap: wrap; }
  .ni-section-header { flex-wrap: wrap; }
  .ni-modal { margin: 0; }
}
</style>
