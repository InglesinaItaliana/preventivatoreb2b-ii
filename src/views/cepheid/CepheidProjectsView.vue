<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidProjectCard from '../../components/cepheid/CepheidProjectCard.vue'
import { useProjects, type Project } from '../../composables/sidera/useProjects'
import { useObiettivi } from '../../composables/sidera/useObiettivi'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers } from '../../composables/sidera/useTeamMembers'
import { useAllTasks } from '../../composables/sidera/useAllTasks'

const { projects, activeProjects, loading, createProject, updateProject, deleteProject, toggleActive } = useProjects()
const { obiettiviAttivi } = useObiettivi()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { tasks: allTasks } = useAllTasks()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')

// ── Visibility: admin vede anche inactive (port da ProjectsView SIDERA) ────
const adminProjects = computed(() => projects.value.filter(p => !p.archived))
const baseProjects = computed(() => isAdmin.value ? adminProjects.value : activeProjects.value)

// ── Filtro per obiettivo ──────────────────────────────────────────────────
const filterObiettivoId = ref<string>('') // '' = tutti

// Data di fine DERIVATA per progetto = scadenza del deliverable più tardivo
// (uguale a quella mostrata in timeline quando il progetto non ha dueDate proprio).
const derivedEnd = computed(() => {
  const m: Record<string, number> = {}
  for (const t of allTasks.value) {
    if (t.type === 'deliverable' && t.dueDate) {
      const ts = t.dueDate.getTime()
      if (!(t.projectId in m) || ts > m[t.projectId]) m[t.projectId] = ts
    }
  }
  return m
})

// Sort: attivi prima → data di fine effettiva (campo dueDate, altrimenti derivata) crescente → creazione desc.
function projSort(a: Project, b: Project): number {
  const aa = a.active !== false ? 0 : 1
  const ba = b.active !== false ? 0 : 1
  if (aa !== ba) return aa - ba
  const ae = a.dueDate ? a.dueDate.getTime() : (derivedEnd.value[a.id] ?? Infinity)
  const be = b.dueDate ? b.dueDate.getTime() : (derivedEnd.value[b.id] ?? Infinity)
  if (ae !== be) return ae - be
  return b.createdAt.getTime() - a.createdAt.getTime()
}

const visibleProjects = computed(() => {
  let list = baseProjects.value
  if (filterObiettivoId.value === '__none__') list = list.filter(p => !p.obiettivoId)
  else if (filterObiettivoId.value) list = list.filter(p => p.obiettivoId === filterObiettivoId.value)
  return [...list].sort(projSort)
})

// ── Context menu (port ProjectsView SIDERA) ────────────────────────────────
const menuOpen = ref<string | null>(null)
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
  dueDate:      '',
  obiettivoId:  '',
})

function openProjModal() {
  editingProject.value = null
  projForm.value = {
    name:        '',
    description: '',
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
        dueDate,
        obiettivoId: projForm.value.obiettivoId || null,
      })
    } else {
      await createProject({
        name:        projForm.value.name.trim(),
        description: projForm.value.description.trim(),
        color:       '#C4941C',
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
    <MdPageHeader
      title="Progetti"
      :subtitle="activeProjects.length === 0
        ? 'Nessun progetto attivo'
        : (activeProjects.length === 1 ? '1 progetto attivo' : activeProjects.length + ' progetti attivi')"
    >
      <template #cta>
        <button class="md-btn md-btn--filled md-btn--sm md-btn--square" @click="openProjModal">
          <MIcon name="add" :size="16" /> Nuovo progetto
        </button>
      </template>
    </MdPageHeader>

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

      <CepheidProjectCard
        v-for="p in visibleProjects"
        :key="p.id"
        :project="p"
        :members="members"
        :is-admin="isAdmin"
        :obiettivo="obiettivoFor(p.obiettivoId)"
        :update-project="updateProject"
        @edit="openEditProjModal"
        @delete="confirmDelete"
        @toggle-active="toggleActive"
      />
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
  color: var(--md-sys-color-on-surface);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* sfondo pagina come il riferimento cepheid-timeline.html */
  background: #EFE7D9;
}
.s-surface-dark .pv { background: #0E0C07; }
@media (prefers-color-scheme: dark) { .pv { background: #0E0C07; } }
.pv :deep(.md-page-header) { flex-shrink: 0; }

.pv-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* Desktop: lista a colonna singola centrata (le card-timeline si espandono
   in larghezza, quindi niente griglia multi-colonna). */
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px 40px 18px; }
  .pv-content { padding: 24px 40px; max-width: 900px; margin: 0 auto; width: 100%; }
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
  color: var(--md-sys-color-on-surface-variant);
}
.pv-filter-select {
  flex: 1;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
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
.row-skel { height: 90px; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-outline-variant); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
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
  background:   var(--md-sys-color-primary-state-hover);
  box-shadow:   var(--md-sys-elevation-level-2);
  transform:    translateY(-1px);
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
.proj-desc { font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj-stats { font-size: 11px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; }

.prog-track { height: 4px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-full); overflow: hidden; }
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
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }

.modal-close {
  background: none; border: none; cursor: pointer;
  color: var(--md-sys-color-on-surface-variant); padding: 2px; border-radius: var(--md-sys-shape-corner-extra-small);
}

.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
}
.field-input:focus { border-color: var(--md-sys-color-primary); }
.field-date { color-scheme: light; }


.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.btn-ghost {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: var(--md-sys-color-on-surface-variant);
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
  color: var(--md-sys-color-on-primary);
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
