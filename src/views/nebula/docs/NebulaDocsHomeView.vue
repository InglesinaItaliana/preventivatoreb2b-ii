<script setup lang="ts">
/**
 * NEBULA-DOCS — Home (post F5b: archive + mentioned section).
 *
 * 5 sub paralleli:
 *  - owners/writers/readers/team → sezione "I miei documenti" (merged dedup)
 *  - mentioned (refs.users array-contains me) → sezione separata "Sei menzionato in N doc"
 *    Sub viene mostrata sotto la principale; doc già in I miei non duplicati.
 *
 * Filter `!archived` su tutti i risultati: i soft-deleted non appaiono.
 *
 * Archive (F5b):
 *  - Desktop: icona X su hover dell'item → confirm dialog → callable archiveNebulaDoc
 *  - Mobile: swipe-left rivela bottone rosso "Elimina" → tap → archive
 *  - Solo owner può archiviare (server-side check; UI mostra X per tutti
 *    ma il callable risponde permission-denied per non-owner)
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { collection, query, where, orderBy, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../../firebase'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { saveDoc } from '../../../composables/nebula/useSaveDoc'
import { archiveDoc } from '../../../composables/nebula/useArchiveDoc'

const router = useRouter()
const { currentUser } = useCurrentUser()

const myEmail = computed(() => (currentUser.value?.email ?? '').toLowerCase().trim())
const allowed = computed(() => Boolean(myEmail.value))

// ── Source maps ─────────────────────────────────────────────────────────────
interface DocRow {
  id: string
  title: string
  updatedAt: any
  iconName?: string
  archived?: boolean
  /** Set di chi è owner (lowercase email). Permette UI archive solo per owner. */
  ownersSet: Set<string>
  source: 'owner' | 'writer' | 'reader' | 'team' | 'mentioned'
}

const bySource: Record<string, Map<string, DocRow>> = {
  owner:     new Map(),
  writer:    new Map(),
  reader:    new Map(),
  team:      new Map(),
  mentioned: new Map(),
}
const tick = ref(0)
const docsLoading = ref(false)
let unsubscribers: Unsubscribe[] = []

function mapSnapDoc(d: any, source: DocRow['source']): DocRow {
  const data = d.data() as any
  return {
    id: d.id,
    title: data.title ?? '(senza titolo)',
    updatedAt: data.updatedAt,
    iconName: data.icon?.name,
    archived: !!data.archived,
    ownersSet: new Set((data.acl?.owners ?? []).map((e: string) => e.toLowerCase().trim())),
    source,
  }
}

function subscribeAll() {
  unsubscribeAll()
  if (!myEmail.value) return
  docsLoading.value = true

  const subs: Array<[string, ReturnType<typeof query>, DocRow['source']]> = [
    ['owner',     query(collection(db, 'nebulaDocs'), where('acl.owners',  'array-contains', myEmail.value), orderBy('updatedAt', 'desc')), 'owner'],
    ['writer',    query(collection(db, 'nebulaDocs'), where('acl.writers', 'array-contains', myEmail.value), orderBy('updatedAt', 'desc')), 'writer'],
    ['reader',    query(collection(db, 'nebulaDocs'), where('acl.readers', 'array-contains', myEmail.value), orderBy('updatedAt', 'desc')), 'reader'],
    ['team',      query(collection(db, 'nebulaDocs'), where('acl.visibility', '==', 'team'),               orderBy('updatedAt', 'desc')), 'team'],
    ['mentioned', query(collection(db, 'nebulaDocs'), where('refs.users',  'array-contains', myEmail.value), orderBy('updatedAt', 'desc')), 'mentioned'],
  ]

  let firstFire = 0
  unsubscribers = subs.map(([key, q, source]) => onSnapshot(
    q,
    (snap) => {
      const m = bySource[key]
      m.clear()
      snap.docs.forEach(d => m.set(d.id, mapSnapDoc(d, source)))
      tick.value++
      firstFire++
      if (firstFire >= subs.length) docsLoading.value = false
    },
    (err) => {
      if (err?.code !== 'permission-denied') {
        console.warn('[nebula-docs] sub', key, 'error:', err?.code, err?.message)
      }
      firstFire++
      if (firstFire >= subs.length) docsLoading.value = false
    }
  ))
}

function unsubscribeAll() {
  unsubscribers.forEach(u => u())
  unsubscribers = []
  Object.values(bySource).forEach(m => m.clear())
}

// "I miei documenti": owner > writer > reader > team. Filter !archived.
const myDocs = computed<DocRow[]>(() => {
  void tick.value
  const merged = new Map<string, DocRow>()
  const priority: DocRow['source'][] = ['owner', 'writer', 'reader', 'team']
  for (const src of priority) {
    for (const [id, row] of bySource[src]!) {
      if (row.archived) continue
      if (!merged.has(id)) merged.set(id, row)
    }
  }
  return Array.from(merged.values()).sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() ?? 0
    const tb = b.updatedAt?.toMillis?.() ?? 0
    return tb - ta
  })
})

// "Sei menzionato in N doc": TUTTI i doc dove sono in refs.users.
// NIENTE dedup con myDocs: anche se sono owner/writer/reader, se qualcuno
// mi @menziona devo vedere quel doc anche qui (il valore della sezione è
// "ti stanno chiamando" — non "ti hanno condiviso"). Auto-mention esclusa:
// se mi sono menzionato io stesso, skip.
const mentionedDocs = computed<DocRow[]>(() => {
  void tick.value
  const out: DocRow[] = []
  for (const [, row] of bySource.mentioned!) {
    if (row.archived) continue
    // Auto-mention: il mio email è in refs.users perché mi sono auto-menzionato.
    // Lo so se sono anche owner (di solito creo io il doc) E sono solo io
    // ad averlo creato. Heuristic semplice: se sono l'unico owner E ho 0
    // writer/reader esterni, considero auto-mention → skip. Altrimenti mostro.
    // Per ora: mostro sempre, l'utente decide. Edge case raro.
    out.push(row)
  }
  return out.sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() ?? 0
    const tb = b.updatedAt?.toMillis?.() ?? 0
    return tb - ta
  })
})

watch(
  [allowed, myEmail],
  ([can, email]) => {
    unsubscribeAll()
    if (!can || !email) {
      docsLoading.value = false
      return
    }
    subscribeAll()
  },
  { immediate: true }
)
onUnmounted(() => unsubscribeAll())

// ── Crea doc + Archive ──────────────────────────────────────────────────────
const creating = ref(false)
const archivingId = ref<string | null>(null)
const lastError = ref<string>('')

async function createDoc() {
  creating.value = true
  lastError.value = ''
  try {
    const out = await saveDoc({
      title: 'Nuovo documento',
      trigger: 'manual',
    })
    // Atterra direttamente nell'editor del doc appena creato
    router.push(`/nebula/docs/${out.docId}`)
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    creating.value = false
  }
}

function canArchive(d: DocRow): boolean {
  return myEmail.value !== '' && d.ownersSet.has(myEmail.value)
}

async function doArchive(d: DocRow) {
  if (!canArchive(d)) {
    lastError.value = 'Solo gli owner possono eliminare il documento.'
    return
  }
  if (!confirm(`Eliminare "${d.title}"?\n\nIl documento andrà nel cestino (recuperabile per 90 giorni).`)) {
    closeSwipe()
    return
  }
  archivingId.value = d.id
  lastError.value = ''
  try {
    await archiveDoc(d.id)
    closeSwipe()
    // La sub onSnapshot rimuoverà il doc dalla lista automaticamente (archived=true)
  } catch (e: any) {
    lastError.value = e?.message ?? String(e)
  } finally {
    archivingId.value = null
  }
}

function formatTime(ts: any): string {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Swipe-to-delete (mobile) ────────────────────────────────────────────────
const swipeOpenId = ref<string | null>(null)
const swipeDeltaPx = ref(0)
// activeSwipeId: reattivo, settato SOLO quando user sta swipando orizzontalmente.
// Touch verticali → resta null (la card non muove, no red bg). Determinato dopo
// che la direzione del gesture è chiara (primo move > 6px).
const activeSwipeId = ref<string | null>(null)

const SWIPE_OPEN_PX = 80
const SWIPE_THRESHOLD = 35

let touchStartX = 0
let touchStartY = 0
let touchTrackedId: string | null = null              // row che ha ricevuto touchstart
let touchDirection: 'horizontal' | 'vertical' | null = null

function onTouchStart(d: DocRow, e: TouchEvent) {
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchTrackedId = d.id
  touchDirection = null
  // activeSwipeId resta null finché direction non è confermata orizzontale.
  // Altra row aperta? Chiudila (a meno che sia questa).
  if (swipeOpenId.value && swipeOpenId.value !== d.id) {
    closeSwipe()
  }
}

function onTouchMove(d: DocRow, e: TouchEvent) {
  if (touchTrackedId !== d.id) return
  const t = e.touches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY

  // Determina direzione al primo movimento significativo
  if (touchDirection === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    touchDirection = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    if (touchDirection === 'horizontal') {
      activeSwipeId.value = d.id   // ora la card può muoversi (e bg rosso visibile)
    }
  }

  // Verticale: lascia scroll della pagina, NIENTE transform sulla card.
  if (touchDirection !== 'horizontal') return

  // Swipe orizzontale: solo verso sinistra (dx ≤ 0)
  let visualDx: number
  if (swipeOpenId.value === d.id) {
    // Parti da posizione aperta -SWIPE_OPEN_PX, segui il dito
    visualDx = Math.max(-SWIPE_OPEN_PX, Math.min(0, -SWIPE_OPEN_PX + dx))
  } else {
    visualDx = Math.max(-SWIPE_OPEN_PX, Math.min(0, dx))
  }
  swipeDeltaPx.value = visualDx
}

function onTouchEnd(d: DocRow) {
  if (touchTrackedId !== d.id) return
  const wasSwiping = touchDirection === 'horizontal'
  touchTrackedId = null
  touchDirection = null
  activeSwipeId.value = null

  if (!wasSwiping) {
    // Tap puro o scroll verticale: ripristina lo stato visivo
    swipeDeltaPx.value = swipeOpenId.value === d.id ? -SWIPE_OPEN_PX : 0
    return
  }
  // Snap decision
  if (swipeDeltaPx.value <= -SWIPE_THRESHOLD) {
    swipeOpenId.value = d.id
    swipeDeltaPx.value = -SWIPE_OPEN_PX
  } else {
    closeSwipe()
  }
}

function closeSwipe() {
  swipeOpenId.value = null
  swipeDeltaPx.value = 0
  activeSwipeId.value = null
}

function itemTransform(d: DocRow): string {
  if (activeSwipeId.value === d.id) {
    return `translateX(${swipeDeltaPx.value}px)`
  }
  if (swipeOpenId.value === d.id) {
    return `translateX(-${SWIPE_OPEN_PX}px)`
  }
  return 'translateX(0)'
}

/** Reattivo: true SOLO se l'utente sta effettivamente swipando orizz. su d. */
function isSwipingHorizontal(d: DocRow): boolean {
  return activeSwipeId.value === d.id || swipeOpenId.value === d.id
}

/** True quando il dito è ATTUALMENTE sulla row + swipa orizzontalmente.
    Usato per disabilitare la transition CSS durante drag (follow dito 1:1). */
function isActiveTouch(d: DocRow): boolean {
  return activeSwipeId.value === d.id
}
</script>

<template>
  <div class="ndh-root" @click="closeSwipe()">
    <div v-if="!allowed" class="ndh-denied" role="status">
      <span class="material-symbols-outlined ndh-icon">hourglass_top</span>
      <p>Caricamento sessione…</p>
    </div>

    <template v-else>
      <header class="ndh-header">
        <span class="material-symbols-outlined ndh-icon">description</span>
        <div class="ndh-title-block">
          <h2>NEBULA-DOCS</h2>
          <p class="ndh-stage">I tuoi documenti</p>
        </div>
        <button
          type="button"
          class="ndh-integrations-btn"
          title="Integrazioni · Connetti Claude (MCP)"
          aria-label="Integrazioni"
          @click="router.push('/nebula/docs/settings/integrations')"
        >
          <span class="material-symbols-outlined">vpn_key</span>
        </button>
        <button
          type="button"
          class="ndh-create-btn"
          :disabled="creating"
          @click="createDoc"
        >
          <span class="material-symbols-outlined">add</span>
          {{ creating ? 'Creazione…' : 'Nuovo documento' }}
        </button>
      </header>

      <div v-if="lastError" class="ndh-toast ndh-toast-err">
        <span class="material-symbols-outlined">error</span>{{ lastError }}
      </div>

      <!-- Sezione 1: I miei documenti -->
      <section class="ndh-list-section">
        <h3>
          <span class="material-symbols-outlined ndh-sec-icon">folder</span>
          I miei documenti
          <span v-if="!docsLoading" class="ndh-count">{{ myDocs.length }}</span>
        </h3>
        <div v-if="docsLoading" class="ndh-empty">Caricamento…</div>
        <div v-else-if="myDocs.length === 0" class="ndh-empty">
          Nessun documento. Crea il primo o aspetta che qualcuno te ne condivida uno.
        </div>
        <ul v-else class="ndh-list">
          <li
            v-for="d in myDocs"
            :key="d.id"
            class="ndh-item-wrap"
            @touchstart="onTouchStart(d, $event)"
            @touchmove="onTouchMove(d, $event)"
            @touchend="onTouchEnd(d)"
            @touchcancel="onTouchEnd(d)"
          >
            <!-- Track flex: card a sinistra (full width) + delete a destra (80px).
                 Wrapper overflow:hidden nasconde la delete a destra normalmente.
                 Swipe-left trasla il track → delete entra in vista. -->
            <div
              class="ndh-item-track"
              :class="{ 'ndh-item-track-animating': !isActiveTouch(d) }"
              :style="{ transform: itemTransform(d) }"
            >
              <div class="ndh-item">
                <button
                  type="button"
                  class="ndh-item-main"
                  @click.stop="router.push(`/nebula/docs/${d.id}`)"
                  :aria-label="`Apri ${d.title}`"
                >
                  <span class="material-symbols-outlined ndh-item-icon">{{ d.iconName || 'description' }}</span>
                  <div class="ndh-item-meta">
                    <div class="ndh-item-title">{{ d.title }}</div>
                    <div class="ndh-item-sub">{{ formatTime(d.updatedAt) }}</div>
                  </div>
                </button>
                <!-- Desktop: X icona su hover (canArchive only) -->
                <button
                  v-if="canArchive(d)"
                  type="button"
                  class="ndh-x-btn"
                  :aria-label="`Elimina ${d.title}`"
                  :title="'Elimina documento'"
                  :disabled="archivingId === d.id"
                  @click.stop="doArchive(d)"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <!-- Delete button mobile: sempre presente nel track, off-screen
                   normalmente (a dx fuori dal wrapper). Visibile durante swipe. -->
              <button
                v-if="canArchive(d)"
                type="button"
                class="ndh-swipe-delete"
                :aria-label="`Elimina ${d.title}`"
                @click.stop="doArchive(d)"
                :disabled="archivingId === d.id"
              >
                <span class="material-symbols-outlined">delete</span>
                <span class="ndh-swipe-delete-label">{{ archivingId === d.id ? '…' : 'Elimina' }}</span>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Sezione 2: Sei menzionato (hidden se zero) -->
      <section v-if="mentionedDocs.length > 0" class="ndh-list-section">
        <h3>
          <span class="material-symbols-outlined ndh-sec-icon">alternate_email</span>
          Sei menzionato in {{ mentionedDocs.length }} {{ mentionedDocs.length === 1 ? 'documento' : 'documenti' }}
        </h3>
        <ul class="ndh-list">
          <li
            v-for="d in mentionedDocs"
            :key="`m-${d.id}`"
            class="ndh-item-wrap"
          >
            <div class="ndh-item">
              <button
                type="button"
                class="ndh-item-main"
                @click.stop="router.push(`/nebula/docs/${d.id}`)"
                :aria-label="`Apri ${d.title}`"
              >
                <span class="material-symbols-outlined ndh-item-icon ndh-item-icon-mention">{{ d.iconName || 'description' }}</span>
                <div class="ndh-item-meta">
                  <div class="ndh-item-title">{{ d.title }}</div>
                  <div class="ndh-item-sub">{{ formatTime(d.updatedAt) }}</div>
                </div>
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ndh-root {
  height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 920px;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 0 auto;
  padding: 24px 20px 60px;
  font-family: 'Outfit', system-ui, sans-serif;
  box-sizing: border-box;
}

.ndh-root,
.ndh-root *,
.ndh-root *::before,
.ndh-root *::after {
  box-sizing: border-box;
}

@media (max-width: 600px) {
  .ndh-root { padding: 16px 12px 60px; }
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
.ndh-title-block { flex: 1; min-width: 0; }
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

.ndh-integrations-btn {
  background: transparent;
  border: 1px solid rgba(196, 96, 48, 0.35);
  color: #C46030;
  border-radius: 999px;
  padding: 8px;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: background 120ms ease;
}
.ndh-integrations-btn:hover { background: rgba(196, 96, 48, 0.08); }
.ndh-integrations-btn .material-symbols-outlined { font-size: 18px; }

.ndh-create-btn {
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
  word-break: break-word;
}
.ndh-toast .material-symbols-outlined { font-size: 18px; }
.ndh-toast-err { background: rgba(200, 50, 50, 0.10); color: #a82020; }

/* Section */
.ndh-list-section { margin-bottom: 28px; }
.ndh-list-section h3 {
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #777;
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ndh-sec-icon { font-size: 16px; color: #C46030; }
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

/* List + swipe wrapper */
.ndh-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ndh-item-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  -webkit-tap-highlight-color: transparent;
  /* NIENTE background: il track gestisce tutto. Niente leak rosso possibile. */
}

/* Track flex: card (100% width wrapper) + delete (80px off-screen).
   Trasla translateX(-80px) → la delete entra in vista da destra. */
.ndh-item-track {
  display: flex;
  width: calc(100% + 80px);
  align-items: stretch;
  transform: translateX(0);
}
.ndh-item-track-animating {
  transition: transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

/* Riga (prima cella del track, width = wrapper) */
.ndh-item {
  flex: 0 0 100%;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 14px 4px 4px;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.05);
  transition: background 120ms ease, border-color 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.ndh-item:hover {
  background: rgba(196, 96, 48, 0.04);
  border-color: rgba(196, 96, 48, 0.18);
}

/* Delete button (seconda cella del track, 80px). Off-screen normalmente
   perché il wrapper overflow:hidden lo nasconde a destra. Visibile solo
   durante swipe-left. */
.ndh-swipe-delete {
  flex: 0 0 80px;
  width: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #C83232;
  color: white;
  border: 0;
  border-radius: 10px;
  margin-left: 0;
  font: inherit;
  cursor: pointer;
}
.ndh-swipe-delete:hover { background: #B82828; }
.ndh-swipe-delete:disabled { opacity: 0.7; cursor: wait; }
.ndh-swipe-delete .material-symbols-outlined { font-size: 22px; }
.ndh-swipe-delete-label { font-size: 11px; font-weight: 500; }
.ndh-item:hover {
  background: rgba(196, 96, 48, 0.04);
  border-color: rgba(196, 96, 48, 0.18);
}
.ndh-item-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 0;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  border-radius: 8px;
  font: inherit;
  color: inherit;
  min-width: 0;
}
.ndh-item-main:hover .ndh-item-title { color: #C46030; }
.ndh-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.ndh-item-icon-mention { color: #4A6B8A; }  /* blu admin per coerenza userMention */
.ndh-item-meta { flex: 1; min-width: 0; overflow: hidden; }
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Desktop X button: visible on hover, hidden on mobile (swipe replace) */
.ndh-x-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: transparent;
  border: 0;
  color: #999;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
  flex-shrink: 0;
  margin-left: 4px;
}
.ndh-item:hover .ndh-x-btn,
.ndh-x-btn:focus-visible { opacity: 1; }
.ndh-x-btn:hover { background: rgba(200, 50, 50, 0.12); color: #C83232; }
.ndh-x-btn:disabled { opacity: 0.5; cursor: wait; }
.ndh-x-btn .material-symbols-outlined { font-size: 18px; }

/* Mobile: nasconde X desktop (swipe è la primary interaction) */
@media (max-width: 768px) {
  .ndh-x-btn { display: none; }
}
/* Desktop: nasconde swipe area (X è la primary) — niente da fare, lo swipe
   con mouse non esiste, ma per chiarezza si nasconde visivamente il bg rosso. */
@media (min-width: 769px) {
  .ndh-item-wrap { background: transparent; }
  .ndh-swipe-delete { display: none; }
}
</style>
