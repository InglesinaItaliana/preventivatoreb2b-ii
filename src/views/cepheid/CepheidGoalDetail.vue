<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import CepheidPeriodPicker from '../../components/cepheid/CepheidPeriodPicker.vue'
import { useObiettivi, GOAL_COLOR_PRESETS } from '../../composables/sidera/useObiettivi'
import { useProjects, type Project } from '../../composables/sidera/useProjects'
import { formatPeriodLabel } from '../../composables/cepheid/usePeriods'

const route   = useRoute()
const router  = useRouter()
const goalId  = computed(() => route.params.id as string)
const scopeBase = computed(() => route.path.startsWith('/sidera') ? '/sidera' : '/cepheid')
const projectPathPrefix = computed(() => route.path.startsWith('/sidera') ? '/sidera/projects/' : '/cepheid/project/')

const { obiettivi, updateObiettivo, archiveObiettivo, deleteObiettivo, loading: loadingGoals } = useObiettivi()
const { projects, activeProjects, updateProject } = useProjects()

const goal = computed(() => obiettivi.value.find(o => o.id === goalId.value))

// Tutti i progetti collegati (non archiviati), inclusi i completati → tab Tutti/Completati
const linkedProjects = computed(() =>
  projects.value.filter(p => !p.archived && p.obiettivoId === goalId.value)
)

const unlinkedProjects = computed(() =>
  activeProjects.value.filter(p => !p.obiettivoId)
)

// ── Tab Attivi / Tutti / Completati (sui progetti collegati) ────────────────
type ProjTab = 'active' | 'all' | 'completed'
const projTab = ref<ProjTab>('active')
function isActive(p: Project) { return p.active !== false && !p.completed }
const visibleLinked = computed(() => {
  const l = linkedProjects.value
  if (projTab.value === 'active') return l.filter(isActive)
  if (projTab.value === 'completed') return l.filter(p => p.completed)
  return l
})
const projTabDefs = computed(() => [
  { id: 'active',    label: 'Attivi',     icon: 'play_circle',  count: linkedProjects.value.filter(isActive).length || undefined },
  { id: 'all',       label: 'Tutti',      icon: 'list',         count: linkedProjects.value.length || undefined },
  { id: 'completed', label: 'Completati', icon: 'emoji_events', count: linkedProjects.value.filter(p => p.completed).length || undefined },
])

const stats = computed(() => {
  let taskTotali = 0, taskDone = 0
  for (const p of linkedProjects.value) {
    taskTotali += p.taskCount
    taskDone   += p.doneCount
  }
  return {
    progetti:   linkedProjects.value.length,
    taskTotali,
    taskDone,
    percentuale: taskTotali > 0 ? Math.round((taskDone / taskTotali) * 100) : 0,
  }
})

function pct(p: { taskCount: number; doneCount: number }) {
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

// ── Collega progetto modal ────────────────────────────────────────────────
const showLinkModal = ref(false)

async function linkProject(projectId: string) {
  await updateProject(projectId, { obiettivoId: goalId.value })
  showLinkModal.value = false
}

async function unlinkProject(projectId: string) {
  await updateProject(projectId, { obiettivoId: null })
}

// ── Edit obiettivo modal ──────────────────────────────────────────────────
interface PeriodValue { periodKind: 'year' | 'quarters'; startDate: Date; endDate: Date }
const showEditModal = ref(false)
const editSaving = ref(false)
const editForm = ref<{ titolo: string; descrizione: string; colore: string; period: PeriodValue }>({
  titolo: '', descrizione: '', colore: GOAL_COLOR_PRESETS[0],
  period: { periodKind: 'year', startDate: new Date(new Date().getFullYear(), 0, 1), endDate: new Date(new Date().getFullYear(), 11, 31) },
})

function openEditModal() {
  if (!goal.value) return
  const g = goal.value
  editForm.value = {
    titolo:      g.titolo,
    descrizione: g.descrizione,
    colore:      g.colore,
    period: {
      periodKind: g.periodKind,
      startDate:  g.startDate ?? new Date(g.anno, 0, 1),
      endDate:    g.endDate ?? new Date(g.anno, 11, 31),
    },
  }
  showEditModal.value = true
}

async function submitEdit() {
  if (!editForm.value.titolo.trim() || editSaving.value || !goal.value) return
  editSaving.value = true
  try {
    const f = editForm.value
    await updateObiettivo(goal.value.id, {
      titolo:      f.titolo.trim(),
      descrizione: f.descrizione.trim(),
      periodKind:  f.period.periodKind,
      startDate:   f.period.startDate,
      endDate:     f.period.endDate,
      colore:      f.colore,
    })
    showEditModal.value = false
  } catch (e) {
    console.error('[CEPHEID] obiettivo update error', e)
  } finally {
    editSaving.value = false
  }
}

// ── Archive / Delete ──────────────────────────────────────────────────────
const showMenu = ref(false)
async function doArchive() {
  if (!goal.value) return
  if (!confirm('Archiviare questo obiettivo? I progetti collegati restano.')) return
  await archiveObiettivo(goal.value.id)
  router.push(scopeBase.value + '/goals')
}

async function doDelete() {
  if (!goal.value) return
  if (!confirm('Eliminare definitivamente questo obiettivo? I progetti collegati restano, ma non saranno più associati.')) return
  // Disassocia tutti i progetti collegati prima di eliminare
  for (const p of linkedProjects.value) {
    await updateProject(p.id, { obiettivoId: null })
  }
  await deleteObiettivo(goal.value.id)
  router.push(scopeBase.value + '/goals')
}

const descExpanded = ref(false)
const descIsLong   = computed(() => (goal.value?.descrizione?.length ?? 0) > 120)

const periodLabel = computed(() =>
  goal.value ? formatPeriodLabel(goal.value.startDate, goal.value.endDate, goal.value.periodKind) : ''
)
</script>

<template>
  <div class="gd s-scope-cepheid">
    <template v-if="loadingGoals">
      <div class="loading-rows">
        <div class="row-skel" />
        <div class="row-skel row-skel--sm" />
      </div>
    </template>

    <template v-else-if="!goal">
      <div class="empty-state">
        <MIcon name="error_outline" :size="32" />
        <div>Obiettivo non trovato.</div>
        <button class="btn-ghost btn-ghost--inline" @click="router.push(scopeBase + '/goals')">Torna agli obiettivi</button>
      </div>
    </template>

    <template v-else>
      <!-- Header coerente con il dettaglio progetto (MdPageHeader + accento colore obiettivo) -->
      <MdPageHeader
        :title="goal.titolo"
        :subtitle="`${stats.percentuale}% · ${stats.progetti} ${stats.progetti === 1 ? 'progetto' : 'progetti'} · ${stats.taskDone}/${stats.taskTotali} azioni`"
        :accent-color="goal.colore"
      >
        <template #tools>
          <div class="gd-tools">
            <button class="gd-icon-btn" title="Collega progetto" @click="showLinkModal = true">
              <MIcon name="add_link" :size="18" />
            </button>
            <div class="gd-menu-wrap">
              <button class="gd-icon-btn" aria-label="Azioni" @click="showMenu = !showMenu">
                <MIcon name="more_vert" :size="18" />
              </button>
              <div v-if="showMenu" class="gd-menu" @click="showMenu = false">
                <button class="gd-menu-item" @click="openEditModal()"><MIcon name="edit" :size="14" /> Modifica</button>
                <button class="gd-menu-item" @click="doArchive()"><MIcon name="archive" :size="14" /> Archivia</button>
                <button class="gd-menu-item gd-menu-item--danger" @click="doDelete()"><MIcon name="delete" :size="14" /> Elimina</button>
              </div>
            </div>
          </div>
        </template>
      </MdPageHeader>

      <!-- Sotto-header: chip periodo + descrizione -->
      <div class="gd-subhead">
        <span class="gd-period-chip">{{ periodLabel }}</span>
        <div v-if="goal.descrizione" class="gd-description">
          <p class="gd-description-text" :class="{ 'is-collapsed': !descExpanded && descIsLong }">{{ goal.descrizione }}</p>
          <button v-if="descIsLong" class="gd-description-toggle" @click="descExpanded = !descExpanded">
            {{ descExpanded ? 'mostra meno' : 'leggi tutto' }}
          </button>
        </div>
      </div>

      <div class="gd-content">
        <div class="gd-content-inner">
          <div class="gd-section-head">
            <span class="gd-section-label">Progetti collegati</span>
            <CepheidViewSwitcher
              :model-value="projTab"
              :tabs="projTabDefs"
              @update:model-value="(v) => (projTab = v as ProjTab)"
            />
          </div>

          <div v-if="!visibleLinked.length" class="gd-empty">
            {{ projTab === 'completed' ? 'Nessun progetto completato.' : projTab === 'active' ? 'Nessun progetto attivo collegato.' : 'Nessun progetto collegato a questo obiettivo.' }}
          </div>

          <div
            v-for="p in visibleLinked"
            :key="p.id"
            class="proj-row"
            @click="router.push(projectPathPrefix + p.id)"
          >
            <div class="proj-body">
              <div class="proj-name">
                <span class="proj-dot" :style="{ background: p.color }" />{{ p.name }}
              </div>
              <div class="proj-stats">{{ p.doneCount }}/{{ p.taskCount }} azioni · {{ pct(p) }}%</div>
              <div class="prog-track">
                <div class="prog-fill" :style="{ width: pct(p) + '%', background: p.color }" />
              </div>
            </div>
            <button class="unlink-btn" title="Scollega" @click.stop="unlinkProject(p.id)">
              <MIcon name="link_off" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Collega progetto -->
    <Teleport to="body">
      <div v-if="showLinkModal" class="modal-backdrop md-modal-backdrop" @click.self="showLinkModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">Collega progetto</span>
            <button class="modal-close md-modal-close" @click="showLinkModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <div v-if="!unlinkedProjects.length" class="modal-empty">
              Tutti i progetti attivi sono già collegati a un obiettivo.
            </div>
            <div
              v-for="p in unlinkedProjects"
              :key="p.id"
              class="link-row"
              @click="linkProject(p.id)"
            >
              <span class="link-stripe" :style="{ background: p.color }" />
              <div class="link-info">
                <div class="link-name">{{ p.name }}</div>
                <div class="link-stats">{{ p.doneCount }}/{{ p.taskCount }} azioni</div>
              </div>
              <MIcon name="add" :size="16" class="link-add" />
            </div>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showLinkModal = false" style="flex:1">Chiudi</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Edit obiettivo -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal-backdrop md-modal-backdrop" @click.self="showEditModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">Modifica obiettivo</span>
            <button class="modal-close md-modal-close" @click="showEditModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Titolo *</label>
            <input v-model="editForm.titolo" class="field-input md-text-field-input" autofocus />

            <label class="field-label md-text-field-label" style="margin-top:12px">Descrizione</label>
            <textarea v-model="editForm.descrizione" class="field-input md-text-field-input" rows="2" />

            <label class="field-label md-text-field-label" style="margin-top:16px">Periodo</label>
            <CepheidPeriodPicker v-model="editForm.period" />

            <label class="field-label md-text-field-label" style="margin-top:16px">Colore</label>
            <div class="color-picker">
              <button
                v-for="c in GOAL_COLOR_PRESETS"
                :key="c"
                type="button"
                class="color-swatch"
                :class="{ 'is-sel': editForm.colore === c }"
                :style="{ background: c }"
                @click="editForm.colore = c"
              />
            </div>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showEditModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!editForm.titolo.trim() || editSaving"
              @click="submitEdit"
            >{{ editSaving ? 'Salvataggio…' : 'Salva' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gd {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background: #EFE7D9;
}
.s-surface-dark .gd { background: #0E0C07; color: #F5EFE3; }
.gd > :deep(.md-page-header) { flex-shrink: 0; padding: 18px 16px 14px; }

.loading-rows { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.row-skel { height: 120px; border-radius: 14px; background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
.row-skel--sm { height: 70px; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.btn-ghost--inline { display: inline-block; padding: 8px 16px; }

/* ── Header tools (collega + menu) ──────────────────────────────────────── */
.gd-tools { display: flex; align-items: center; gap: 4px; }
.gd-icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-on-surface-variant); padding: 4px;
  border-radius: var(--md-sys-shape-corner-full);
  display: inline-flex; align-items: center;
}
.gd-icon-btn:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); color: var(--md-sys-color-primary); }
.gd-menu-wrap { position: relative; }
.gd-menu {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 10px; box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px; z-index: 30; min-width: 150px;
}
.gd-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  background: none; border: none; border-radius: 6px;
  font-size: 12px; font-family: 'Outfit', sans-serif; color: var(--md-sys-color-on-surface);
  cursor: pointer; text-align: left;
}
.gd-menu-item:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.gd-menu-item--danger { color: var(--md-sys-color-error); }

/* ── Sotto-header ──────────────────────────────────────────────────────── */
.gd-subhead { flex-shrink: 0; background: var(--md-sys-color-surface); padding: 0 16px 12px; }
.gd-period-chip {
  display: inline-block; font-size: 11px; font-weight: 600;
  color: var(--md-sys-color-on-surface-variant); background: var(--md-sys-color-surface-container);
  padding: 3px 9px; border-radius: var(--md-sys-shape-corner-full);
}
.gd-description { margin-top: 8px; }
.gd-description-text { margin: 0; font-size: 13px; line-height: 1.5; color: var(--md-sys-color-on-surface-variant); white-space: pre-wrap; }
.gd-description-text.is-collapsed { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gd-description-toggle {
  margin-top: 4px; background: none; border: none; padding: 0;
  font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--md-sys-color-on-surface-variant); cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.06em;
}

/* ── Contenuto (scroll + colonna 900 centrata) ─────────────────────────── */
.gd-content { flex: 1; min-height: 0; overflow-y: auto; background: #EFE7D9; }
.s-surface-dark .gd-content { background: #0E0C07; }
.gd-content-inner { padding: 16px; display: flex; flex-direction: column; gap: 8px; }

.gd-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
.gd-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }

.gd-empty { padding: 24px 8px; text-align: center; font-size: 12px; color: #B4B0AA; font-style: italic; }

/* ── Righe progetto collegato (flat + hover) ───────────────────────────── */
.proj-row {
  display: flex; align-items: stretch; background: #FFF8F0;
  border-radius: 12px; overflow: hidden; cursor: pointer;
  transition: background 0.15s;
}
.s-surface-dark .proj-row { background: #16130B; }
.proj-row:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 5%, #FFF8F0); }
.s-surface-dark .proj-row:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 10%, #16130B); }
.proj-body { padding: 12px 14px; flex: 1; min-width: 0; }
.proj-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; color: var(--md-sys-color-on-surface); }
.proj-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; flex-shrink: 0; }
.proj-stats { font-size: 11px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; }
.prog-track { height: 4px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
.prog-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); transition: width 0.3s ease; }

.unlink-btn {
  background: none; border: none; cursor: pointer;
  color: #B4B0AA; padding: 0 12px;
  display: flex; align-items: center; flex-shrink: 0;
  transition: color 0.15s;
}
.unlink-btn:hover { color: #C8521A; }

@media (min-width: 1024px) {
  .gd > :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .gd-subhead { padding: 0 max(40px, calc(50% - 410px)) 14px; }
  .gd-content-inner { padding: 24px 40px; max-width: 900px; margin: 0 auto; width: 100%; box-sizing: border-box; }
}

/* Link modal rows */
.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
  border-bottom: 1px solid #F0EDE8;
}
.link-row:hover { background: #FAF8F4; }
.link-row:last-child { border-bottom: none; }
.link-stripe { width: 4px; height: 30px; border-radius: 2px; }
.link-info { flex: 1; }
.link-name { font-size: 13px; font-weight: 600; color: #1A1917; }
.link-stats { font-size: 11px; color: #9B9590; }
.link-add { color: var(--md-sys-color-primary); }

.modal-empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  color: #9B9590;
}

/* Modal shared */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 100;
}

.modal {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: 540px;
  max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex; flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }
.modal-close { background: none; border: none; cursor: pointer; color: #9B9590; padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small); }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }

.field-label {
  display: block; font-size: 10px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #9B9590; margin-bottom: 8px;
}
.field-input {
  width: 100%; box-sizing: border-box;
  background: #F4F2EE; border: 1px solid #E8E5DF;
  border-radius: 10px; padding: 10px 14px;
  font-size: 14px; font-family: 'Outfit', sans-serif;
  color: #1A1917; outline: none;
  transition: border-color 0.15s; resize: vertical;
}
.field-input:focus { border-color: var(--md-sys-color-primary); }

.color-picker { display: flex; gap: 8px; }
.color-swatch {
  width: 28px; height: 28px;
  border-radius: var(--md-sys-shape-corner-full); border: 2px solid transparent;
  cursor: pointer; transition: transform 0.15s, border-color 0.15s;
}
.color-swatch.is-sel { border-color: #1A1917; transform: scale(1.1); }

.modal-footer {
  display: flex; gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid #E8E5DF;
}
.btn-ghost {
  flex: 1; padding: 12px;
  background: none; border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px; font-weight: 500;
  cursor: pointer; color: #6A6560;
  font-family: 'Outfit', sans-serif;
}
.btn-primary {
  flex: 2; padding: 12px;
  background: var(--md-sys-color-primary); border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px; font-weight: 600;
  cursor: pointer; color: #fff;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #B8870E; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
