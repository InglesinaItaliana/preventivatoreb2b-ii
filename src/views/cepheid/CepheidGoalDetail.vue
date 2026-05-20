<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/pulsar/MIcon.vue'
import GoalProgressBar from '../../components/cepheid/GoalProgressBar.vue'
import { useObiettivi, GOAL_COLOR_PRESETS } from '../../composables/sidera/useObiettivi'
import { useProjects } from '../../composables/sidera/useProjects'

const route   = useRoute()
const router  = useRouter()
const goalId  = computed(() => route.params.id as string)
const scopeBase = computed(() => route.path.startsWith('/sidera') ? '/sidera' : '/cepheid')
const projectPathPrefix = computed(() => route.path.startsWith('/sidera') ? '/sidera/projects/' : '/cepheid/project/')

const { obiettivi, updateObiettivo, archiveObiettivo, deleteObiettivo, loading: loadingGoals } = useObiettivi()
const { activeProjects, updateProject } = useProjects()

const goal = computed(() => obiettivi.value.find(o => o.id === goalId.value))

const linkedProjects = computed(() =>
  activeProjects.value.filter(p => p.obiettivoId === goalId.value)
)

const unlinkedProjects = computed(() =>
  activeProjects.value.filter(p => !p.obiettivoId)
)

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
const showEditModal = ref(false)
const editSaving = ref(false)
const editForm = ref({
  titolo: '', descrizione: '', metrica: '',
  valoreCorrente: '' as string | number,
  valoreTarget: '' as string | number,
  anno: new Date().getFullYear(),
  colore: GOAL_COLOR_PRESETS[0],
})

function openEditModal() {
  if (!goal.value) return
  editForm.value = {
    titolo:         goal.value.titolo,
    descrizione:    goal.value.descrizione,
    metrica:        goal.value.metrica,
    valoreCorrente: goal.value.valoreCorrente ?? '',
    valoreTarget:   goal.value.valoreTarget ?? '',
    anno:           goal.value.anno,
    colore:         goal.value.colore,
  }
  showEditModal.value = true
}

function parseNum(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function submitEdit() {
  if (!editForm.value.titolo.trim() || editSaving.value || !goal.value) return
  editSaving.value = true
  try {
    await updateObiettivo(goal.value.id, {
      titolo:         editForm.value.titolo.trim(),
      descrizione:    editForm.value.descrizione.trim(),
      metrica:        editForm.value.metrica.trim(),
      valoreCorrente: parseNum(editForm.value.valoreCorrente),
      valoreTarget:   parseNum(editForm.value.valoreTarget),
      anno:           Number(editForm.value.anno) || new Date().getFullYear(),
      colore:         editForm.value.colore,
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

function metricaCorrenteVsTarget(): string {
  const g = goal.value
  if (!g || g.valoreTarget == null) return ''
  const curr = g.valoreCorrente ?? 0
  return `${curr.toLocaleString('it-IT')} / ${g.valoreTarget.toLocaleString('it-IT')}`
}
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
      <header class="gd-header">
        <div class="gd-stripe" :style="{ background: goal.colore }" />
        <div class="gd-titles">
          <div class="gd-top-row">
            <h2 class="p-page-title">{{ goal.titolo }}</h2>
            <div class="gd-actions">
              <span class="gd-anno-chip">{{ goal.anno }}</span>
              <button class="gd-menu-btn" @click="showMenu = !showMenu" aria-label="Azioni">
                <MIcon name="more_vert" :size="18" />
              </button>
              <div v-if="showMenu" class="gd-menu" @click.self="showMenu = false">
                <button class="gd-menu-item" @click="showMenu = false; openEditModal()">
                  <MIcon name="edit" :size="14" /> Modifica
                </button>
                <button class="gd-menu-item" @click="showMenu = false; doArchive()">
                  <MIcon name="archive" :size="14" /> Archivia
                </button>
                <button class="gd-menu-item gd-menu-item--danger" @click="showMenu = false; doDelete()">
                  <MIcon name="delete" :size="14" /> Elimina
                </button>
              </div>
            </div>
          </div>

          <div v-if="goal.metrica" class="gd-metrica">
            <MIcon name="trending_up" :size="14" />
            <span>{{ goal.metrica }}</span>
            <span v-if="goal.valoreTarget != null" class="gd-metrica-val">{{ metricaCorrenteVsTarget() }}</span>
          </div>

          <div v-if="goal.descrizione" class="gd-description">
            <p class="gd-description-text" :class="{ 'is-collapsed': !descExpanded && descIsLong }">
              {{ goal.descrizione }}
            </p>
            <button v-if="descIsLong" class="gd-description-toggle" @click="descExpanded = !descExpanded">
              {{ descExpanded ? 'mostra meno' : 'leggi tutto' }}
            </button>
          </div>

          <div class="gd-progress-wrap">
            <GoalProgressBar
              :percentuale="stats.percentuale"
              :colore="goal.colore"
              :show-label="false"
            />
            <div class="gd-stats-row">
              <span class="gd-stat-pct" :style="{ color: goal.colore }">{{ stats.percentuale }}%</span>
              <span class="gd-stat-meta">{{ stats.progetti }} {{ stats.progetti === 1 ? 'progetto' : 'progetti' }} · {{ stats.taskDone }}/{{ stats.taskTotali }} azioni</span>
            </div>
          </div>
        </div>
      </header>

      <div class="gd-content">
        <div class="gd-section-head">
          <span class="gd-section-label">Progetti collegati</span>
          <button class="gd-add-btn" @click="showLinkModal = true">
            <MIcon name="add" :size="14" /> Collega
          </button>
        </div>

        <div v-if="!linkedProjects.length" class="gd-empty">
          Nessun progetto collegato a questo obiettivo.
        </div>

        <div
          v-for="p in linkedProjects"
          :key="p.id"
          class="proj-row"
          @click="router.push(projectPathPrefix + p.id)"
        >
          <div class="proj-stripe" :style="{ background: p.color }" />
          <div class="proj-body">
            <div class="proj-name">{{ p.name }}</div>
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
    </template>

    <!-- Modal Collega progetto -->
    <Teleport to="body">
      <div v-if="showLinkModal" class="modal-backdrop" @click.self="showLinkModal = false">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <span class="modal-title">Collega progetto</span>
            <button class="modal-close" @click="showLinkModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body">
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
          <div class="modal-footer">
            <button class="btn-ghost" @click="showLinkModal = false" style="flex:1">Chiudi</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Edit obiettivo -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal-backdrop" @click.self="showEditModal = false">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <span class="modal-title">Modifica obiettivo</span>
            <button class="modal-close" @click="showEditModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body">
            <label class="field-label">Titolo *</label>
            <input v-model="editForm.titolo" class="field-input" autofocus />

            <label class="field-label" style="margin-top:12px">Metrica</label>
            <input v-model="editForm.metrica" class="field-input" />

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label">Valore corrente</label>
                <input v-model="editForm.valoreCorrente" type="number" class="field-input" />
              </div>
              <div>
                <label class="field-label">Valore target</label>
                <input v-model="editForm.valoreTarget" type="number" class="field-input" />
              </div>
            </div>

            <label class="field-label" style="margin-top:12px">Descrizione</label>
            <textarea v-model="editForm.descrizione" class="field-input" rows="2" />

            <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label">Anno</label>
                <input v-model="editForm.anno" type="number" class="field-input" />
              </div>
              <div>
                <label class="field-label">Colore</label>
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
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" @click="showEditModal = false">Annulla</button>
            <button
              class="btn-primary"
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
  min-height: calc(100vh - 120px);
}

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

.gd-header {
  display: flex;
  align-items: stretch;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
}

.gd-stripe { width: 8px; flex-shrink: 0; }

.gd-titles { padding: 18px 20px 16px; flex: 1; min-width: 0; }

.gd-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #1A1917;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.gd-actions { display: flex; align-items: center; gap: 6px; position: relative; }
.gd-anno-chip {
  font-size: 11px;
  font-weight: 600;
  color: #9B9590;
  background: #F4F2EE;
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
}
.gd-menu-btn {
  background: none; border: none; cursor: pointer;
  color: #9B9590; padding: 4px; border-radius: 6px;
  display: flex; align-items: center;
}
.gd-menu-btn:hover { color: #1A1917; background: #F4F2EE; }
.gd-menu {
  position: absolute;
  top: 100%; right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px;
  z-index: 20;
  min-width: 150px;
}
.gd-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  cursor: pointer;
  text-align: left;
}
.gd-menu-item:hover { background: #F4F2EE; }
.gd-menu-item--danger { color: #C8521A; }

.gd-metrica {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #6A6560;
  margin-top: 6px;
  flex-wrap: wrap;
}
.gd-metrica-val { font-weight: 600; color: #1A1917; margin-left: 4px; }

.gd-description { margin-top: 8px; }
.gd-description-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #6A6560;
  white-space: pre-wrap;
}
.gd-description-text.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gd-description-toggle {
  margin-top: 4px;
  background: none; border: none; padding: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 11px; font-weight: 600;
  color: #9B9590; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.gd-description-toggle:hover { color: #6A6560; }

.gd-progress-wrap { margin-top: 14px; }
.gd-stats-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
}
.gd-stat-pct { font-size: 14px; font-weight: 700; }
.gd-stat-meta { font-size: 11px; color: #9B9590; }

.gd-content { padding: 16px; display: flex; flex-direction: column; gap: 8px; }

.gd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.gd-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6A6560;
}

.gd-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 10px;
  background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
  border-radius: var(--md-sys-shape-corner-full);
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-primary-hover);
  cursor: pointer;
  transition: all 0.15s;
}
.gd-add-btn:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent); }

.gd-empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  color: #B4B0AA;
  font-style: italic;
}

.proj-row {
  display: flex;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.proj-row:hover { border-color: var(--md-sys-color-primary); background: color-mix(in srgb, var(--md-sys-color-primary) 4%, transparent); }
.proj-stripe { width: 6px; flex-shrink: 0; }
.proj-body { padding: 12px 14px; flex: 1; min-width: 0; }
.proj-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.proj-stats { font-size: 11px; color: #9B9590; margin-bottom: 6px; }
.prog-track { height: 4px; background: #F0EDE8; border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
.prog-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); transition: width 0.3s ease; }

.unlink-btn {
  background: none; border: none; cursor: pointer;
  color: #B4B0AA; padding: 0 12px;
  display: flex; align-items: center;
  flex-shrink: 0;
  transition: color 0.15s;
}
.unlink-btn:hover { color: #C8521A; }

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
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: 540px;
  max-height: 86vh;
  display: flex; flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
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
