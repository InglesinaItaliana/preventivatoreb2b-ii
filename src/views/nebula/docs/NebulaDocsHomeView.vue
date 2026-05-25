<script setup lang="ts">
/**
 * NEBULA-DOCS — Home (Fase 1, scaffolding + test E2E).
 *
 * Chunk 1: stub gate'd CORE admin.
 * Chunk 3 (questo): aggiunge bottone "Crea doc di prova" + lista doc miei
 *   (where('acl.owners', 'array-contains', myEmail)) per validare callable
 *   saveDoc + rules nebulaDocs end-to-end.
 *
 * L'implementazione reale (gerarchia, sidebar, editor) arriva in chunk 4 e fasi
 * successive (vedi docs/NEBULA-DOCS.md §11).
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { collection, query, where, orderBy, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../../firebase'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { useCoreAdmins } from '../../../composables/sidera/useCoreAdmins'
import { saveDoc, isSaveDocConflict } from '../../../composables/nebula/useSaveDoc'

const router = useRouter()
const { currentUser } = useCurrentUser()
const { isCoreAdmin } = useCoreAdmins()

const allowed = computed(() => isCoreAdmin(currentUser.value?.email))
const myEmail = computed(() => (currentUser.value?.email ?? '').toLowerCase().trim())

// ── Lista doc di cui sono owner ─────────────────────────────────────────────
interface DocRow {
  id: string
  title: string
  revision: number
  updatedAt: any
  iconName?: string
}
const docs = ref<DocRow[]>([])
const docsLoading = ref(false)
let unsubscribe: Unsubscribe | null = null

function subscribeDocs() {
  if (!myEmail.value) return
  docsLoading.value = true
  const q = query(
    collection(db, 'nebulaDocs'),
    where('acl.owners', 'array-contains', myEmail.value),
    orderBy('updatedAt', 'desc')
  )
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      docs.value = snap.docs.map(d => {
        const data = d.data() as any
        return {
          id: d.id,
          title: data.title ?? '(senza titolo)',
          revision: data.revision ?? 0,
          updatedAt: data.updatedAt,
          iconName: data.icon?.name,
        }
      })
      docsLoading.value = false
    },
    (err) => {
      console.error('[nebula-docs] subscribe error:', err)
      lastError.value = err.message
      docsLoading.value = false
    }
  )
}

// Watch su [allowed, myEmail]: `currentUser` carica async dopo mount, quindi
// onMounted può vedere allowed=false e non sottoscrivere mai. Watch immediate
// risubentra appena le condizioni diventano valide (e ri-sottoscrive su
// cambio account).
watch(
  [allowed, myEmail],
  ([can, email]) => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    if (!can || !email) {
      docs.value = []
      docsLoading.value = false
      return
    }
    subscribeDocs()
  },
  { immediate: true }
)
onUnmounted(() => { if (unsubscribe) unsubscribe() })

// ── Azioni test ─────────────────────────────────────────────────────────────
const creating = ref(false)
const updatingId = ref<string | null>(null)
const lastResult = ref<string>('')
const lastError = ref<string>('')

async function createTestDoc() {
  creating.value = true
  lastError.value = ''
  try {
    const out = await saveDoc({
      title: `Doc di prova ${new Date().toLocaleTimeString('it-IT')}`,
      trigger: 'manual',
    })
    lastResult.value = `Creato ${out.docId} (rev ${out.revision})`
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    creating.value = false
  }
}

async function updateTitle(d: DocRow) {
  updatingId.value = d.id
  lastError.value = ''
  try {
    const out = await saveDoc({
      docId: d.id,
      title: `${d.title} · agg ${new Date().toLocaleTimeString('it-IT')}`,
      baseRevision: d.revision,
      trigger: 'manual',
    })
    lastResult.value = `Aggiornato ${out.docId} → rev ${out.revision}`
  } catch (e: any) {
    if (isSaveDocConflict(e)) {
      lastError.value = `Conflitto LWW: server è a rev ${e.details.currentRevision}, tu hai inviato ${d.revision}`
    } else {
      lastError.value = e?.message ?? String(e)
    }
  } finally {
    updatingId.value = null
  }
}

function formatTime(ts: any): string {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div class="ndh-root">
    <div v-if="!allowed" class="ndh-denied" role="status">
      <span class="material-symbols-outlined ndh-icon">lock</span>
      <h2>Accesso non autorizzato</h2>
      <p>NEBULA-DOCS è in Fase 1 e visibile solo agli amministratori CORE.</p>
    </div>

    <template v-else>
      <header class="ndh-header">
        <span class="material-symbols-outlined ndh-icon">description</span>
        <div>
          <h2>NEBULA-DOCS</h2>
          <p class="ndh-stage">Fase 1 · Chunk 3 (schema + saveDoc)</p>
        </div>
        <button
          type="button"
          class="ndh-create-btn"
          :disabled="creating"
          @click="createTestDoc"
        >
          <span class="material-symbols-outlined">add</span>
          {{ creating ? 'Creazione…' : 'Crea doc di prova' }}
        </button>
      </header>

      <!-- Risultato / errore ultima azione -->
      <div v-if="lastResult" class="ndh-toast ndh-toast-ok">
        <span class="material-symbols-outlined">check_circle</span>{{ lastResult }}
      </div>
      <div v-if="lastError" class="ndh-toast ndh-toast-err">
        <span class="material-symbols-outlined">error</span>{{ lastError }}
      </div>

      <!-- Lista doc di cui sono owner -->
      <section class="ndh-list-section">
        <h3>I miei documenti
          <span class="ndh-count">{{ docs.length }}</span>
        </h3>
        <div v-if="docsLoading" class="ndh-empty">Caricamento…</div>
        <div v-else-if="docs.length === 0" class="ndh-empty">
          Nessun documento. Crea il primo per testare schema + saveDoc.
        </div>
        <ul v-else class="ndh-list">
          <li v-for="d in docs" :key="d.id" class="ndh-item">
            <span class="material-symbols-outlined ndh-item-icon">{{ d.iconName || 'description' }}</span>
            <div class="ndh-item-meta">
              <div class="ndh-item-title">{{ d.title }}</div>
              <div class="ndh-item-sub">
                rev {{ d.revision }} · {{ formatTime(d.updatedAt) }} ·
                <code>{{ d.id }}</code>
              </div>
            </div>
            <button
              type="button"
              class="ndh-update-btn"
              :disabled="updatingId === d.id"
              @click="updateTitle(d)"
            >
              {{ updatingId === d.id ? 'Salvataggio…' : 'Aggiorna title' }}
            </button>
          </li>
        </ul>
      </section>

      <footer class="ndh-footer-hint">
        Editor TipTap, mention CEPHEID e gerarchia arrivano nei prossimi chunk.
        Vedi <code>docs/NEBULA-DOCS.md</code>.
      </footer>
    </template>
  </div>
</template>

<style scoped>
.ndh-root {
  min-height: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  font-family: 'Outfit', system-ui, sans-serif;
}

/* Denied */
.ndh-denied {
  max-width: 480px;
  margin: 60px auto;
  text-align: center;
  padding: 40px 28px;
  border-radius: 20px;
  background: var(--md-sys-color-surface-container, #fff);
  box-shadow: var(--md-sys-elevation-level-1, 0 1px 3px rgba(0,0,0,0.06));
}
.ndh-denied .ndh-icon { color: #8a8a8a; }
.ndh-denied h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 28px;
  margin: 8px 0 4px;
}

/* Header */
.ndh-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.ndh-icon {
  font-size: 36px;
  color: #C46030;
  font-variation-settings: 'FILL' 0, 'wght' 300;
  display: block;
}
.ndh-header h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 26px;
  margin: 0;
}
.ndh-stage {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #C46030;
  margin: 2px 0 0;
}

.ndh-create-btn {
  margin-left: auto;
  background: #C46030;
  color: white;
  border: 0;
  border-radius: 999px;
  padding: 10px 18px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 120ms ease, transform 120ms ease;
}
.ndh-create-btn:hover:not(:disabled) {
  background: #B85425;
  transform: translateY(-1px);
}
.ndh-create-btn:disabled { opacity: 0.6; cursor: wait; }
.ndh-create-btn .material-symbols-outlined { font-size: 18px; }

/* Toast */
.ndh-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 14px;
  font-size: 13.5px;
}
.ndh-toast .material-symbols-outlined { font-size: 18px; }
.ndh-toast-ok { background: rgba(40, 160, 80, 0.10); color: #1e7e3e; }
.ndh-toast-err { background: rgba(200, 50, 50, 0.10); color: #a82020; }

/* Lista */
.ndh-list-section h3 {
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #777;
  margin: 24px 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ndh-count {
  background: rgba(196, 96, 48, 0.12);
  color: #C46030;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.ndh-empty {
  padding: 24px;
  text-align: center;
  color: #999;
  background: var(--md-sys-color-surface, #fafafa);
  border-radius: 12px;
  font-size: 13px;
}

.ndh-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ndh-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--md-sys-color-surface-container, #fff);
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.05);
}
.ndh-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.ndh-item-meta { flex: 1; min-width: 0; }
.ndh-item-title {
  font-weight: 500;
  font-size: 14.5px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ndh-item-sub {
  font-size: 11.5px;
  color: #888;
  margin-top: 2px;
}
.ndh-item-sub code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  background: rgba(0,0,0,0.04);
  padding: 1px 5px;
  border-radius: 4px;
}
.ndh-update-btn {
  background: transparent;
  border: 1px solid rgba(196, 96, 48, 0.40);
  color: #C46030;
  border-radius: 999px;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms ease;
}
.ndh-update-btn:hover:not(:disabled) { background: rgba(196, 96, 48, 0.08); }
.ndh-update-btn:disabled { opacity: 0.6; cursor: wait; }

.ndh-footer-hint {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid rgba(0,0,0,0.06);
  font-size: 12.5px;
  color: #aaa;
  text-align: center;
}
.ndh-footer-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  padding: 1px 5px;
  background: rgba(196, 96, 48, 0.08);
  border-radius: 4px;
}

@media (max-width: 600px) {
  .ndh-header { flex-wrap: wrap; }
  .ndh-create-btn { margin-left: 0; width: 100%; justify-content: center; }
}
</style>
