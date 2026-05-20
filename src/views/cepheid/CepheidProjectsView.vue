<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import GoalChip from '../../components/cepheid/GoalChip.vue'
import { useProjects, type Project } from '../../composables/sidera/useProjects'
import { useObiettivi } from '../../composables/sidera/useObiettivi'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

const router = useRouter()
const { projects, activeProjects, loading, createProject, updateProject, deleteProject, toggleActive } = useProjects()
const { obiettiviAttivi } = useObiettivi()
const { currentUser } = useCurrentUser()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')

const COLOR_PRESETS = ['#D4A020', '#2F6B4A', '#3A8C80', '#C8521A', '#7A8FA6', '#9B5BB5']

// ── Visibility: admin vede anche inactive (port da ProjectsView SIDERA) ────
const adminProjects = computed(() => projects.value.filter(p => !p.archived))
const baseProjects = computed(() => isAdmin.value ? adminProjects.value : activeProjects.value)

// ── Filtro per obiettivo ──────────────────────────────────────────────────
const filterObiettivoId = ref<string>('') // '' = tutti

const visibleProjects = computed(() => {
  if (!filterObiettivoId.value) return baseProjects.value
  if (filterObiettivoId.value === '__none__') {
    return baseProjects.value.filter(p => !p.obiettivoId)
  }
  return baseProjects.value.filter(p => p.obiettivoId === filterObiettivoId.value)
})

// ── Context menu (port ProjectsView SIDERA) ────────────────────────────────
const menuOpen = ref<string | null>(null)
function openMenu(id: string, e: Event) {
  e.stopPropagation()
  menuOpen.value = menuOpen.value === id ? null : id
}
function closeMenu() { menuOpen.value = null }
async function confirmDelete(id: string, e: Event) {
  e.stopPropagation()
  if (!confirm("Eliminare il progetto e tutte le sue azioni? L'operazione è irreversibile.")) return
  menuOpen.value = null
  await deleteProject(id)
}

function obiettivoFor(id: string | null) {
  if (!id) return null
  return obiettiviAttivi.value.find(o => o.id === id) ?? null
}

// ── Modal create + edit (port da ProjectsView SIDERA) ─────────────────────
const showProjModal  = ref(false)
const projSaving     = ref(false)
const projDeleting   = ref(false)
const editingProject = ref<Project | null>(null)
const projForm = ref({
  name:         '',
  description:  '',
  color:        COLOR_PRESETS[0],
  dueDate:      '',
  obiettivoId:  '',
})

function openProjModal() {
  editingProject.value = null
  projForm.value = {
    name:        '',
    description: '',
    color:       COLOR_PRESETS[0],
    dueDate:     '',
    obiettivoId: filterObiettivoId.value && filterObiettivoId.value !== '__none__' ? filterObiettivoId.value : '',
  }
  showProjModal.value = true
}

function openEditProjModal(p: Project, e: Event) {
  e.stopPropagation()
  menuOpen.value = null
  editingProject.value = p
  projForm.value = {
    name:        p.name,
    description: p.description,
    color:       p.color,
    dueDate:     p.dueDate ? p.dueDate.toISOString().split('T')[0] : '',
    obiettivoId: p.obiettivoId ?? '',
  }
  showProjModal.value = true
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function submitProject() {
  if (!projForm.value.name.trim() || projSaving.value) return
  projSaving.value = true
  try {
    const dueDate = projForm.value.dueDate ? parseDateInput(projForm.value.dueDate) : null
    if (editingProject.value) {
      await updateProject(editingProject.value.id, {
        name:        projForm.value.name.trim(),
        description: projForm.value.description.trim(),
        color:       projForm.value.color,
        dueDate,
        obiettivoId: projForm.value.obiettivoId || null,
      })
    } else {
      await createProject({
        name:        projForm.value.name.trim(),
        description: projForm.value.description.trim(),
        color:       projForm.value.color,
        dueDate,
        obiettivoId: projForm.value.obiettivoId || null,
      })
    }
    showProjModal.value = false
  } catch (e) {
    console.error('[CEPHEID] project save error', e)
  } finally {
    projSaving.value = false
  }
}

async function doDeleteFromModal() {
  if (!editingProject.value || projDeleting.value) return
  if (!confirm("Eliminare il progetto e tutte le sue azioni? L'operazione è irreversibile.")) return
  projDeleting.value = true
  try {
    await deleteProject(editingProject.value.id)
    showProjModal.value = false
  } finally {
    projDeleting.value = false
  }
}

function pct(p: { taskCount: number; doneCount: number }) {
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

// ── Trigger dal FAB del layout ─────────────────────────────────────────────
const newProjectTick = inject<Ref<number>>('cepheid-new-project-tick', null as any)
if (newProjectTick) {
  watch(newProjectTick, () => openProjModal())
}

onMounted(() => {
  if (sessionStorage.getItem('cepheid-pending-new-project') === '1') {
    sessionStorage.removeItem('cepheid-pending-new-project')
    nextTick(() => openProjModal())
  }
})
</script>

<template>
  <div class="pv s-scope-cepheid" @click="closeMenu">
    <header class="pv-header">
      <div class="pv-header-text">
        <h2 class="p-page-title">Progetti</h2>
        <p class="p-page-sub">
          {{ activeProjects.length === 0
            ? 'Nessun progetto attivo'
            : (activeProjects.length === 1 ? '1 progetto attivo' : activeProjects.length + ' progetti attivi') }}
        </p>
      </div>
      <button class="header-cta" @click="openProjModal">
        <MIcon name="add" :size="16" /> Nuovo progetto
      </button>
    </header>

    <div class="pv-content">
      <div v-if="obiettiviAttivi.length" class="pv-filter">
        <label class="pv-filter-label">Obiettivo</label>
        <select v-model="filterObiettivoId" class="pv-filter-select">
          <option value="">Tutti</option>
          <option value="__none__">— Senza obiettivo —</option>
          <option v-for="o in obiettiviAttivi" :key="o.id" :value="o.id">{{ o.titolo }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading-rows">
        <div v-for="i in 3" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!visibleProjects.length" class="empty-state">
        <MIcon name="folder_open" filled :size="40" class="empty-icon" />
        {{ filterObiettivoId ? 'Nessun progetto per questo filtro.' : 'Nessun progetto.' }}
      </div>

      <div
        v-for="p in visibleProjects"
        :key="p.id"
        class="proj-row"
        :class="{ 'proj-row--inactive': p.active === false }"
        @click="router.push('/cepheid/project/' + p.id)"
      >
        <div class="proj-stripe" :style="{ background: p.color }" />
        <div class="proj-body">
          <div class="proj-top">
            <div class="proj-name">{{ p.name }}</div>
            <div class="proj-top-actions">
              <GoalChip
                v-if="obiettivoFor(p.obiettivoId)"
                :titolo="obiettivoFor(p.obiettivoId)!.titolo"
                :colore="obiettivoFor(p.obiettivoId)!.colore"
                size="sm"
              />
              <span v-if="p.active === false" class="badge-inactive">Inattivo</span>
              <button
                v-if="isAdmin"
                class="proj-toggle-btn"
                :title="p.active !== false ? 'Disattiva progetto' : 'Attiva progetto'"
                @click.stop="toggleActive(p.id, p.active === false)"
              >
                <MIcon :name="p.active !== false ? 'pause' : 'play_arrow'" :size="16" />
              </button>
              <div v-if="isAdmin" class="proj-menu-wrap" @click.stop>
                <button class="proj-more" @click="openMenu(p.id, $event)" aria-label="Menu progetto">
                  <MIcon name="more_horiz" :size="18" />
                </button>
                <div v-if="menuOpen === p.id" class="proj-dropdown">
                  <button class="proj-dropdown-item" @click="openEditProjModal(p, $event)">
                    <MIcon name="edit" :size="14" /> Modifica progetto
                  </button>
                  <button class="proj-dropdown-item proj-dropdown-item--danger" @click="confirmDelete(p.id, $event)">
                    <MIcon name="delete" :size="14" /> Elimina progetto
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="p.description" class="proj-desc">{{ p.description }}</div>
          <div class="proj-stats">{{ p.doneCount }}/{{ p.taskCount }} azioni · {{ pct(p) }}%</div>
          <div class="prog-track">
            <div class="prog-fill" :style="{ width: pct(p) + '%', background: p.color }" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Nuovo progetto -->
    <Teleport to="body">
      <div v-if="showProjModal" class="modal-backdrop md-modal-backdrop" @click.self="showProjModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title md-modal-title">{{ editingProject ? 'Modifica progetto' : 'Nuovo progetto' }}</span>
            <button class="modal-close md-modal-close" @click="showProjModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Nome *</label>
            <input v-model="projForm.name" class="field-input md-text-field-input" autofocus />

            <label class="field-label md-text-field-label" style="margin-top:12px">Descrizione</label>
            <textarea v-model="projForm.description" class="field-input md-text-field-input" rows="2" />

            <label v-if="obiettiviAttivi.length" class="field-label md-text-field-label" style="margin-top:12px">Obiettivo</label>
            <select v-if="obiettiviAttivi.length" v-model="projForm.obiettivoId" class="field-input md-text-field-input">
              <option value="">— Nessun obiettivo —</option>
              <option v-for="o in obiettiviAttivi" :key="o.id" :value="o.id">{{ o.titolo }}</option>
            </select>

            <label class="field-label md-text-field-label" style="margin-top:12px">Colore</label>
            <div class="color-picker">
              <button
                v-for="c in COLOR_PRESETS"
                :key="c"
                type="button"
                class="color-swatch"
                :class="{ 'is-sel': projForm.color === c }"
                :style="{ background: c }"
                @click="projForm.color = c"
              />
            </div>

            <label class="field-label md-text-field-label" style="margin-top:12px">Scadenza</label>
            <input v-model="projForm.dueDate" type="date" class="field-input field-date" />
          </div>
          <div class="modal-footer md-modal-footer">
            <button
              v-if="editingProject"
              class="btn-danger md-btn md-btn--danger md-btn--rounded"
              :disabled="projDeleting"
              style="margin-right: auto"
              @click="doDeleteFromModal"
            >{{ projDeleting ? 'Eliminazione…' : 'Elimina' }}</button>
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showProjModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!projForm.name.trim() || projSaving"
              @click="submitProject"
            >{{ projSaving ? 'Salvataggio…' : (editingProject ? 'Salva' : 'Crea progetto') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pv {
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  min-height: calc(100vh - 120px);
}

.pv-header {
  padding: 18px 20px 14px;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pv-header-text { flex: 1; min-width: 0; }
.header-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 14px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}
.header-cta:hover { background: #B8870E; }
@media (max-width: 768px) { .header-cta { display: none; } }

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.p-page-sub { font-size: 12px; color: #9B9590; margin: 0; }

.pv-content { padding: 16px; display: flex; flex-direction: column; gap: 8px; }

/* Desktop wide: grid 2 colonne di project card, container centrato.
   Su mobile/tablet resta lista verticale singola. */
@media (min-width: 1024px) {
  .pv-header   { padding: 24px 40px 18px; }
  .pv-content  {
    padding: 24px 40px;
    max-width: 1280px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .pv-filter,
  .loading-rows,
  .empty-state {
    grid-column: 1 / -1; /* questi span full-width nella grid */
  }
}
@media (min-width: 1440px) {
  .pv-content { grid-template-columns: repeat(3, 1fr); padding: 32px 56px; }
}

.pv-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pv-filter-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9B9590;
}
.pv-filter-select {
  flex: 1;
  background: #F4F2EE;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small);
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  outline: none;
  cursor: pointer;
}
.pv-filter-select:focus { border-color: var(--md-sys-color-primary); }

.proj-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
.proj-top .proj-name { margin-bottom: 0; }

.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 90px; border-radius: var(--md-sys-shape-corner-medium); background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; }

.proj-row {
  display: flex;
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--md-sys-elevation-level-1);
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              box-shadow   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              transform    var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.proj-row:hover {
  border-color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 4%, var(--md-sys-color-surface));
  box-shadow: var(--md-sys-elevation-level-2);
  transform: translateY(-1px);
}

.proj-stripe { width: 6px; flex-shrink: 0; }

.proj-row--inactive { opacity: 0.55; }

.proj-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
.proj-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.badge-inactive {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container);
  padding: 2px 7px;
  border-radius: var(--md-sys-shape-corner-full);
}
.proj-toggle-btn {
  background: none;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.proj-toggle-btn:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  color: var(--md-sys-color-primary);
}

.proj-menu-wrap { position: relative; }
.proj-more {
  background: none;
  border: none;
  padding: 4px;
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
  display: inline-flex;
  align-items: center;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.proj-more:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}
.proj-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--md-sys-color-surface-container-low);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  box-shadow: var(--md-sys-elevation-level-3);
  padding: 4px;
  min-width: 180px;
  z-index: 50;
}
.proj-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size:   var(--md-sys-typescale-body-medium-size);
  color: var(--md-sys-color-on-surface);
  text-align: left;
  cursor: pointer;
  border-radius: var(--md-sys-shape-corner-small);
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.proj-dropdown-item:hover {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}
.proj-dropdown-item--danger { color: var(--md-sys-color-error); }
.proj-dropdown-item--danger:hover {
  background: color-mix(in srgb, var(--md-sys-color-error) 10%, transparent);
}

.proj-body { padding: 12px 14px; flex: 1; min-width: 0; }

.proj-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.proj-desc { font-size: 12px; color: #6A6560; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj-stats { font-size: 11px; color: #9B9590; margin-bottom: 6px; }

.prog-track { height: 4px; background: #F0EDE8; border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
.prog-fill { height: 100%; border-radius: var(--md-sys-shape-corner-full); transition: width 0.3s ease; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }

.modal-close {
  background: none; border: none; cursor: pointer;
  color: #9B9590; padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
}

.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9B9590;
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: #F4F2EE;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
}
.field-input:focus { border-color: var(--md-sys-color-primary); }
.field-date { color-scheme: light; }

.color-picker { display: flex; gap: 8px; }

.color-swatch {
  width: 32px; height: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.color-swatch.is-sel { border-color: #1A1917; transform: scale(1.1); }

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid #E8E5DF;
}

.btn-ghost {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #6A6560;
  font-family: 'Outfit', sans-serif;
}

.btn-primary {
  flex: 2;
  padding: 12px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: #B8870E; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
