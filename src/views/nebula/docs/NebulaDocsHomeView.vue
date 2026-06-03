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
import { ref, computed, watch, onUnmounted, onMounted, nextTick, inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { collection, query, where, orderBy, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../../firebase'
import { useCurrentUser } from '../../../composables/sidera/useCurrentUser'
import { saveDoc } from '../../../composables/nebula/useSaveDoc'
import { archiveDoc } from '../../../composables/nebula/useArchiveDoc'
import { useAutoHideHeader } from '../../../composables/shared/useAutoHideHeader'
import MdPageHeader from '../../../components/shared/MdPageHeader.vue'
import MIcon from '../../../components/shared/MIcon.vue'
import CepheidViewSwitcher from '../../../components/cepheid/CepheidViewSwitcher.vue'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

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
  /** Visibilità ACL: 'private' | 'team' | 'public'. Default 'team' se assente. */
  visibility: 'private' | 'team' | 'public'
  /** Writer non-owner: indica se l'ACL è "estesa" oltre agli owner. */
  extraWriters: number
  /** Reader non-owner / non-writer. */
  extraReaders: number
  source: 'owner' | 'writer' | 'reader' | 'team' | 'mentioned'
}

type PrivacyBadge = { label: string; tone: 'public' | 'team' | 'partial' | 'private' }

function computeBadge(d: DocRow): PrivacyBadge {
  if (d.visibility === 'public') return { label: 'Pubblico', tone: 'public' }
  if (d.visibility === 'team') return { label: 'Squadra', tone: 'team' }
  if (d.extraWriters > 0 || d.extraReaders > 0) return { label: 'Parziale', tone: 'partial' }
  return { label: 'Privato', tone: 'private' }
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
  const ownersArr: string[] = (data.acl?.owners ?? []).map((e: string) => e.toLowerCase().trim())
  const writersArr: string[] = (data.acl?.writers ?? []).map((e: string) => e.toLowerCase().trim())
  const readersArr: string[] = (data.acl?.readers ?? []).map((e: string) => e.toLowerCase().trim())
  const ownersSet = new Set(ownersArr)
  const writersSet = new Set(writersArr.filter(e => !ownersSet.has(e)))
  const readersSet = new Set(readersArr.filter(e => !ownersSet.has(e) && !writersSet.has(e)))
  const visibility = (data.acl?.visibility as DocRow['visibility']) ?? 'team'
  return {
    id: d.id,
    title: data.title ?? '(senza titolo)',
    updatedAt: data.updatedAt,
    iconName: data.icon?.name,
    archived: !!data.archived,
    ownersSet,
    visibility,
    extraWriters: writersSet.size,
    extraReaders: readersSet.size,
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

function byUpdatedDesc(a: DocRow, b: DocRow) {
  return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
}

// "Miei": doc di cui sono owner (non archiviati).
const ownedDocs = computed<DocRow[]>(() => {
  void tick.value
  return Array.from(bySource.owner!.values()).filter(r => !r.archived).sort(byUpdatedDesc)
})

// "Condivisi": writer/reader/team accessibili ma NON di mia proprietà.
const sharedDocs = computed<DocRow[]>(() => {
  void tick.value
  const ownerIds = new Set(bySource.owner!.keys())
  const merged = new Map<string, DocRow>()
  for (const src of ['writer', 'reader', 'team'] as const) {
    for (const [id, row] of bySource[src]!) {
      if (row.archived || ownerIds.has(id)) continue
      if (!merged.has(id)) merged.set(id, row)
    }
  }
  return Array.from(merged.values()).sort(byUpdatedDesc)
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

// Trigger dal FAB mobile del layout (vedi SideraLayout.onFabTrigger 'new-doc').
const newDocTick = inject<Ref<number>>('nebula-new-doc-tick', null as any)
if (newDocTick) watch(newDocTick, () => createDoc())
onMounted(() => {
  if (sessionStorage.getItem('nebula-pending-new-doc') === '1') {
    sessionStorage.removeItem('nebula-pending-new-doc')
    nextTick(() => createDoc())
  }
})

// ── Tab header: Miei / Condivisi / Menzionato ───────────────────────────────
type DocTab = 'mine' | 'shared' | 'mentioned'
const activeTab = ref<DocTab>('mine')
const visibleDocs = computed<DocRow[]>(() =>
  activeTab.value === 'mine'
    ? ownedDocs.value
    : activeTab.value === 'shared'
      ? sharedDocs.value
      : mentionedDocs.value,
)
const docTabs = computed(() => [
  { id: 'mine', label: 'Miei', icon: 'person', count: ownedDocs.value.length || undefined },
  { id: 'shared', label: 'Condivisi', icon: 'group', count: sharedDocs.value.length || undefined },
  { id: 'mentioned', label: 'Menzionato', icon: 'alternate_email', count: mentionedDocs.value.length || undefined },
])

// Sottotitolo MdPageHeader: conteggio del tab attivo.
const headerSubtitle = computed(() => {
  if (docsLoading.value) return 'Caricamento…'
  const n = visibleDocs.value.length
  if (n === 0) return 'Nessun documento'
  return `${n} ${n === 1 ? 'documento' : 'documenti'}`
})

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
  <div class="ndh-root" ref="scrollEl" @click="closeSwipe()">
    <div v-if="!allowed" class="ndh-denied" role="status">
      <span class="material-symbols-outlined ndh-icon">hourglass_top</span>
      <p>Caricamento sessione…</p>
    </div>

    <template v-else>
      <MdPageHeader
        title="Documenti"
        :subtitle="headerSubtitle"
        sticky
        :hidden="headerHidden"
      >
        <template #tools>
          <CepheidViewSwitcher
            labels
            :model-value="activeTab"
            :tabs="docTabs"
            @update:model-value="(v) => (activeTab = v as DocTab)"
          />
        </template>
        <template #cta>
          <button
            type="button"
            class="md-btn md-btn--filled md-btn--sm md-btn--square ndh-create-btn"
            :disabled="creating"
            @click="createDoc"
          >
            <MIcon name="add" :size="16" />
            {{ creating ? 'Creazione…' : 'Nuovo documento' }}
          </button>
        </template>
      </MdPageHeader>

      <div class="ndh-content">

      <div v-if="lastError" class="ndh-toast ndh-toast-err">
        <span class="material-symbols-outlined">error</span>{{ lastError }}
      </div>

      <!-- Lista unica guidata dal tab attivo (Miei / Condivisi / Menzionato) -->
      <section class="ndh-list-section">
        <div v-if="docsLoading" class="ndh-empty">Caricamento…</div>
        <div v-else-if="visibleDocs.length === 0" class="ndh-empty">
          <template v-if="activeTab === 'mine'">Nessun documento tuo. Crea il primo con "Nuovo documento".</template>
          <template v-else-if="activeTab === 'shared'">Nessun documento condiviso con te.</template>
          <template v-else>Non sei menzionato in nessun documento.</template>
        </div>
        <ul v-else class="ndh-list">
          <li
            v-for="d in visibleDocs"
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
                  <span
                    class="material-symbols-outlined ndh-item-icon"
                    :class="{ 'ndh-item-icon-mention': activeTab === 'mentioned' }"
                  >{{ d.iconName || 'description' }}</span>
                  <div class="ndh-item-meta">
                    <div class="ndh-item-title-row">
                      <span class="ndh-item-title">{{ d.title }}</span>
                      <span
                        class="ndh-badge-privacy"
                        :class="`ndh-badge-${computeBadge(d).tone}`"
                      >{{ computeBadge(d).label }}</span>
                    </div>
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

      </div>
    </template>
  </div>
</template>

<style scoped>
.ndh-root {
  /* Allineato al pattern Cruscotto / CepheidProjectsView: scroll sul root,
     bg = --page-bg che fa anche da fondo dello sticky MdPageHeader. */
  height: 100%;
  width: 100%;
  overflow: auto;
  font-family: 'Outfit', system-ui, sans-serif;
  box-sizing: border-box;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .ndh-root { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .ndh-root { --page-bg: #0E0C07; }
}

.ndh-root,
.ndh-root *,
.ndh-root *::before,
.ndh-root *::after {
  box-sizing: border-box;
}

/* header allineato al contenuto: gutter mobile 16px (come .ndh-content).
   Override bg sticky: invece di match-are il --page-bg (pattern CEPHEID),
   l'header NEBULA usa il colore surface delle card per distinguersi visivamente
   dallo sfondo beige. */
:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
}

.ndh-content {
  max-width: 920px;
  margin: 0 auto;
  padding: 16px 16px 60px;
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .ndh-content { padding: 24px 40px; max-width: 900px; }
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
.ndh-denied .ndh-icon {
  font-size: 36px;
  color: #8a8a8a;
  font-variation-settings: 'FILL' 0, 'wght' 300;
  display: block;
}

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
  gap: 10px;
}
.ndh-item-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  -webkit-tap-highlight-color: transparent;
  /* container queries: i child possono usare 100cqw = inline size del wrapper */
  container-type: inline-size;
}

/* Track flex: card (100cqw = wrapper width) + delete (80px off-screen).
   Trasla translateX(-80px) → la delete entra in vista da destra. */
.ndh-item-track {
  display: flex;
  width: max-content;          /* sized dai children, non da %s */
  align-items: stretch;
  transform: translateX(0);
}
.ndh-item-track-animating {
  transition: transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

/* Riga (prima cella del track, larga esattamente quanto il wrapper) */
.ndh-item {
  flex: 0 0 auto;
  width: 100%;                 /* fallback iOS < 16 / browser senza container queries */
  width: 100cqw;               /* wrapper inline size — preciso senza %s ambigue */
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 6px;
  /* flat: surface, niente bordo/ombra; solo cambio colore in hover */
  background: var(--md-sys-color-surface);
  border-radius: 16px;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}
/* Hover SOLO su dispositivi con vero hover (desktop). Su iOS :hover si
   attiva al tap → flash della card durante scroll/click. */
@media (hover: hover) {
  .ndh-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--md-sys-color-surface));
  }
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
  border-radius: 16px;
  margin-left: 0;
  font: inherit;
  cursor: pointer;
}
.ndh-swipe-delete:hover { background: #B82828; }
.ndh-swipe-delete:disabled { opacity: 0.7; cursor: wait; }
.ndh-swipe-delete .material-symbols-outlined { font-size: 22px; }
.ndh-swipe-delete-label { font-size: 11px; font-weight: 500; }
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
@media (hover: hover) {
  .ndh-item-main:hover .ndh-item-title { color: #C46030; }
}
.ndh-item-icon { font-size: 22px; color: #C46030; flex-shrink: 0; }
.ndh-item-icon-mention { color: #4A6B8A; }  /* blu admin per coerenza userMention */
.ndh-item-meta { flex: 1; min-width: 0; overflow: hidden; }
.ndh-item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ndh-item-title {
  font-weight: 500;
  font-size: 14.5px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.ndh-badge-privacy {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  line-height: 1.5;
}
.ndh-badge-public  { background: rgba(46, 125, 50, 0.10);  color: #2E7D32; border-color: rgba(46, 125, 50, 0.25); }
.ndh-badge-team    { background: rgba(0, 0, 0, 0.05);      color: #555;    border-color: rgba(0, 0, 0, 0.10); }
.ndh-badge-partial { background: rgba(217, 119, 6, 0.12);  color: #B45309; border-color: rgba(217, 119, 6, 0.30); }
.ndh-badge-private { background: rgba(176, 0, 32, 0.10);   color: #B0001F; border-color: rgba(176, 0, 32, 0.25); }
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
