<script setup lang="ts">
/**
 * LinkedDocsPanel — "Doc collegati" inverse lookup per CEPHEID (e altre PWA).
 *
 * Query inversa su nebulaDocs.refs.{tasks|projects} popolato dalla Cloud
 * Function indexDocRefs (vedi docs/NEBULA-DOCS.md §10).
 *
 * Rendering:
 *   - Niente refs (loading o empty post-load): nulla
 *   - 1+ refs: sezione collassabile "📄 Citato in N doc" con lista
 *
 * Visibilità: gestita da Firestore rules sul lato server (visibility
 * private/team/public + ACL). Se l'utente non ha read access, la query
 * filtra in trasparenza e il pannello resta vuoto.
 *
 * Vedi decisione spec §12 #2: collassabile in fondo a Dettagli, hidden
 * se refs.length === 0. NO tab nuova.
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { collection, query, where, orderBy, limit, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../../firebase'
import MIcon from './MIcon.vue'

const props = defineProps<{
  /** 'task' → query refs.tasks, 'project' → query refs.projects */
  kind: 'task' | 'project'
  /** taskId o projectId del documento corrente */
  id: string | null | undefined
  /** Max risultati visibili (default 10, sufficiente per i casi tipici) */
  maxResults?: number
}>()

interface LinkedDoc {
  id: string
  title: string
  iconName?: string
  iconColor?: string
  updatedAt: any
}

const docs = ref<LinkedDoc[]>([])
const loading = ref(false)
const expanded = ref(true)   // espanso di default — se la sezione esiste, ha valore mostrarla
let unsubscribe: Unsubscribe | null = null

function subscribe() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
  docs.value = []

  if (!props.id) {
    loading.value = false
    return
  }

  loading.value = true
  const field = props.kind === 'task' ? 'refs.tasks' : 'refs.projects'
  const q = query(
    collection(db, 'nebulaDocs'),
    where(field, 'array-contains', props.id),
    orderBy('updatedAt', 'desc'),
    limit(props.maxResults ?? 10),
  )

  unsubscribe = onSnapshot(
    q,
    (snap) => {
      docs.value = snap.docs.map(d => {
        const data = d.data() as any
        return {
          id: d.id,
          title: data.title ?? '(senza titolo)',
          iconName: data.icon?.name,
          iconColor: data.icon?.color,
          updatedAt: data.updatedAt,
        }
      })
      loading.value = false
    },
    (err) => {
      // Permission denied = nessuna read access ai doc → 0 risultati silenziosi.
      // Altri errori (es. index missing) loggiamo come warn per debug.
      if (err?.code !== 'permission-denied') {
        console.warn('[LinkedDocsPanel] query error:', err?.code, err?.message)
      }
      docs.value = []
      loading.value = false
    }
  )
}

watch(() => [props.kind, props.id], () => subscribe(), { immediate: true })
onUnmounted(() => { if (unsubscribe) unsubscribe() })

const visible = computed(() => docs.value.length > 0)

function formatTime(ts: any): string {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function openDoc(d: LinkedDoc) {
  // Apre in tab nuova: l'utente sta lavorando in CEPHEID, non vogliamo
  // rubargli il contesto.
  window.open(`/nebula/docs/${d.id}`, '_blank')
}
</script>

<template>
  <div v-if="visible" class="ldp-root">
    <button
      type="button"
      class="ldp-header"
      :class="{ 'ldp-expanded': expanded }"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="ldp-icon">
        <MIcon name="description" :size="16" />
      </span>
      <span class="ldp-title">
        Citato in {{ docs.length }} doc<span v-if="docs.length === maxResults">+</span>
      </span>
    </button>

    <ul v-if="expanded" class="ldp-list">
      <li
        v-for="d in docs"
        :key="d.id"
        class="ldp-item"
        @click="openDoc(d)"
      >
        <span class="ldp-item-icon">
          <MIcon
            :name="d.iconName || 'description'"
            :size="14"
          />
        </span>
        <span class="ldp-item-title">{{ d.title }}</span>
        <span class="ldp-item-date">{{ formatTime(d.updatedAt) }}</span>
        <MIcon name="open_in_new" :size="12" class="ldp-item-ext" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ldp-root {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(0,0,0,0.08);
}

.ldp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 100ms ease;
}
.ldp-header:hover { color: #C46030; }
.ldp-expanded { color: #C46030; }

.ldp-icon {
  display: inline-flex;
  align-items: center;
  color: #C46030;
}

.ldp-title { flex: 1; }

.ldp-list {
  list-style: none;
  padding: 6px 0 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ldp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
  transition: background 80ms ease;
}
.ldp-item:hover {
  background: rgba(196, 96, 48, 0.08);
}
.ldp-item-icon {
  display: inline-flex;
  align-items: center;
  color: #C46030;
  flex-shrink: 0;
}
.ldp-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ldp-item-date {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}
.ldp-item-ext {
  color: #ccc;
  flex-shrink: 0;
}
.ldp-item:hover .ldp-item-ext { color: #C46030; }
</style>
