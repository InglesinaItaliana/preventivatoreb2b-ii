<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import MaterialIcon from '../../components/MaterialIcon.vue'
import { useProjects, type Project } from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

const router = useRouter()
const { projects, loading, createProject, toggleActive, deleteProject, updateProject } = useProjects()
const { currentUser } = useCurrentUser()
const isAdmin = computed(() => currentUser.value?.role === 'ADMIN' || currentUser.value?.email === 'info@inglesinaitaliana.it')

// ── Project context menu ─────────────────────────────────────────────────────
const menuOpen = ref<string | null>(null)

function openMenu(id: string, e: Event) {
  e.stopPropagation()
  menuOpen.value = menuOpen.value === id ? null : id
}

function closeMenu() { menuOpen.value = null }

async function confirmDelete(id: string, e: Event) {
  e.stopPropagation()
  if (!confirm('Eliminare il progetto e tutte le sue azioni? L\'operazione è irreversibile.')) return
  menuOpen.value = null
  await deleteProject(id)
}

// ── Modal create/edit ────────────────────────────────────────────────────────
const showModal      = ref(false)
const saving         = ref(false)
const editingProject = ref<Project | null>(null)
const form = ref({ name: '', description: '', color: '#2F6B4A', dueDate: '' })

const colorPresets = [
  '#2F6B4A', '#4A6B8A', '#C8821A',
  '#8A4A6B', '#6B4A8A', '#4A7A6B',
]

function openModal() {
  editingProject.value = null
  form.value = { name: '', description: '', color: '#2F6B4A', dueDate: '' }
  showModal.value = true
}

function openEditModal(p: Project, e: Event) {
  e.stopPropagation()
  menuOpen.value = null
  editingProject.value = p
  form.value = {
    name:        p.name,
    description: p.description,
    color:       p.color,
    dueDate:     p.dueDate ? p.dueDate.toISOString().split('T')[0] : '',
  }
  showModal.value = true
}

function closeModal() { showModal.value = false }

async function submit() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  try {
    const dueDate = form.value.dueDate ? parseDateInput(form.value.dueDate) : null
    if (editingProject.value) {
      await updateProject(editingProject.value.id, {
        name:        form.value.name.trim(),
        description: form.value.description.trim(),
        color:       form.value.color,
        dueDate,
      })
    } else {
      await createProject({ name: form.value.name.trim(), description: form.value.description.trim(), color: form.value.color, dueDate })
    }
    closeModal()
  } finally {
    saving.value = false
  }
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── Computed ─────────────────────────────────────────────────────────────────
const activeProjects = computed(() => projects.value.filter(p => !p.archived && p.active !== false))
const adminProjects  = computed(() => projects.value.filter(p => !p.archived))
const visibleProjects = computed(() => isAdmin.value ? adminProjects.value : activeProjects.value)

function pct(p: { taskCount: number; doneCount: number }) {
  if (!p.taskCount) return 0
  return Math.round((p.doneCount / p.taskCount) * 100)
}

function formatDue(d: Date | null) {
  if (!d) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}
</script>

<template>
  <div class="pv s-fade-in" @click="closeMenu">
    <!-- Header -->
    <div class="pv-header">
      <div>
        <h1 class="pv-title">Progetti</h1>
        <p class="pv-subtitle">{{ activeProjects.length }} attivi</p>

      </div>
      <button v-if="isAdmin" class="s-btn" @click="openModal">
        <MaterialIcon name="add" :size="16" />Nuovo progetto
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="pv-grid">
      <div v-for="i in 4" :key="i" class="proj-skeleton" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!visibleProjects.length" class="empty-state">
      <div class="empty-icon">◧</div>
      <p>Nessun progetto ancora.<br>Creane uno con il pulsante in alto.</p>
    </div>

    <!-- Grid -->
    <div v-else class="pv-grid">
      <div
        v-for="p in visibleProjects"
        :key="p.id"
        class="proj-card"
        :class="{ 'proj-card--inactive': !p.active }"
        @click="router.push('/sidera/projects/' + p.id)"
      >
        <div class="proj-stripe" :style="{ background: p.color }" />

        <div class="proj-inner">
          <div class="proj-top">
            <div class="proj-name">{{ p.name }}</div>
            <div class="proj-top-actions">
              <span v-if="!p.active" class="badge-inactive">Inattivo</span>
              <button
                v-if="isAdmin"
                class="proj-toggle-btn"
                :title="p.active ? 'Disattiva progetto' : 'Attiva progetto'"
                @click.stop="toggleActive(p.id, !p.active)"
              >{{ p.active ? '⏸' : '▶' }}</button>
              <div class="proj-menu-wrap" @click.stop>
                <MaterialIcon name="more_horiz" :size="18" class="proj-more" @click="openMenu(p.id, $event)" />
                <div v-if="menuOpen === p.id" class="proj-dropdown">
                  <button class="proj-dropdown-item" @click="openEditModal(p, $event)">
                    <MaterialIcon name="edit" :size="14" />Modifica progetto
                  </button>
                  <button class="proj-dropdown-item proj-dropdown-item--danger" @click="confirmDelete(p.id, $event)">
                    <MaterialIcon name="delete" :size="14" />Elimina progetto
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p class="proj-desc">{{ p.description || '—' }}</p>

          <div class="proj-progress">
            <div class="prog-row">
              <span class="prog-label">{{ p.doneCount }}/{{ p.taskCount }} azioni</span>
              <span class="prog-pct" :style="{ color: p.color }">{{ pct(p) }}%</span>
            </div>
            <div class="prog-track">
              <div class="prog-fill" :style="{ width: pct(p) + '%', background: p.color }" />
            </div>
          </div>

          <div class="proj-footer">
            <div class="proj-color-dot" :style="{ background: p.color + '28', border: '1.5px solid ' + p.color + '60', color: p.color }">
              {{ p.name[0]?.toUpperCase() }}
            </div>
            <div v-if="p.dueDate" class="proj-due">
              <MaterialIcon name="schedule" :size="13" class="clock-icon" />{{ formatDue(p.dueDate) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">{{ editingProject ? 'Modifica progetto' : 'Nuovo progetto' }}</span>
            <button class="modal-close" @click="closeModal"><MaterialIcon name="close" :size="18" /></button>
          </div>

          <div class="modal-body">
            <label class="field-label">Nome *</label>
            <input
              v-model="form.name"
              class="field-input"
              placeholder="Es. Catalogo 2027"
              autofocus
              @keydown.enter="submit"
            />

            <label class="field-label" style="margin-top:16px">Descrizione</label>
            <textarea
              v-model="form.description"
              class="field-input field-textarea"
              placeholder="Breve descrizione del progetto"
            />

            <label class="field-label" style="margin-top:16px">Colore</label>
            <div class="color-row">
              <button
                v-for="c in colorPresets"
                :key="c"
                class="color-swatch"
                :style="{ background: c, outline: form.color === c ? '2px solid ' + c : 'none', outlineOffset: '2px' }"
                @click="form.color = c"
              />
            </div>

            <label class="field-label" style="margin-top:16px">Scadenza (opzionale)</label>
            <input v-model="form.dueDate" type="date" class="field-input field-date" />
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click="closeModal">Annulla</button>
            <button class="s-btn" :disabled="!form.name.trim() || saving" @click="submit">
              {{ saving ? 'Salvataggio…' : editingProject ? 'Salva' : 'Crea progetto' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pv {
  height: 100%;
  overflow: auto;
  padding: 40px 52px;
  background: var(--s-bg);
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

.pv-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 36px;
}

.pv-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.pv-subtitle { font-size: 12px; color: var(--s-text-dim); margin-top: 4px; }

.s-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--module-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: filter 0.15s;
  letter-spacing: 0.01em;
}

.s-btn:hover:not(:disabled) { filter: brightness(1.18); }
.s-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-icon { width: 14px; height: 14px; }

/* Grid */
.pv-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

/* Skeleton */
.proj-skeleton {
  height: 180px;
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 12px;
  animation: s-pulse 1.4s ease-in-out infinite;
}

@keyframes s-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 80px;
  color: var(--s-text-dim);
  font-size: 13px;
  text-align: center;
  line-height: 1.7;
}

.empty-icon { font-size: 36px; opacity: 0.35; }

/* Project card */
.proj-card {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  box-shadow: var(--s-shadow);
}

.proj-card:hover {
  border-color: var(--s-border-mid);
  box-shadow: var(--s-shadow-hover);
  transform: translateY(-2px);
}

.proj-stripe {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}

.proj-inner { padding: 20px; padding-top: 22px; }

.proj-card--inactive { opacity: 0.55; }

.proj-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  margin-top: 6px;
}

.proj-name { font-size: 15px; font-weight: 500; flex: 1; }

.proj-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge-inactive {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--s-border);
  color: var(--s-text-dim);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.proj-toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--s-text-dim);
  transition: background 0.15s, color 0.15s;
}

.proj-toggle-btn:hover { background: var(--s-border); color: var(--s-text); }

.proj-more { width: 14px; height: 14px; color: var(--s-text-dim); cursor: pointer; }

.proj-menu-wrap { position: relative; }

.proj-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
  z-index: 50;
  min-width: 160px;
  padding: 4px;
}

.proj-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  border-radius: 6px;
  text-align: left;
  transition: background 0.12s;
}

.proj-dropdown-item--danger { color: #C8521A; }
.proj-dropdown-item--danger:hover { background: rgba(200, 82, 26, 0.08); }

.proj-desc { font-size: 12px; color: var(--s-text-mid); margin-bottom: 18px; line-height: 1.6; }

.proj-progress { margin-bottom: 16px; }

.prog-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
.prog-label { color: var(--s-text-dim); }
.prog-pct   { font-weight: 700; }

.prog-track { height: 3px; border-radius: 2px; background: var(--s-border); overflow: hidden; }
.prog-fill  { height: 100%; border-radius: 2px; transition: width 0.4s ease; }

.proj-footer { display: flex; justify-content: space-between; align-items: center; }

.proj-color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
}

.proj-due { font-size: 11px; color: var(--s-text-dim); display: flex; align-items: center; gap: 4px; }
.clock-icon { width: 10px; height: 10px; }

/* ── Modal ─────────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 14px;
  width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  font-family: 'Outfit', sans-serif;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.modal-title { font-size: 15px; font-weight: 600; color: var(--s-text); }

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s;
}

.modal-close:hover { color: var(--s-text); }

.modal-body { padding: 20px 24px; }

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  margin-bottom: 6px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--s-surface-up);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--module-accent); }
.field-input::placeholder { color: var(--s-text-dim); }

.field-textarea { resize: vertical; min-height: 72px; }

.field-date { cursor: pointer; color-scheme: light; }

.color-row { display: flex; gap: 10px; }

.color-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: transform 0.15s;
}

.color-swatch:hover { transform: scale(1.15); }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 24px 20px;
  border-top: 1px solid var(--s-border);
  padding-top: 16px;
}

.btn-ghost {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--s-border);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--s-text-mid);
  font-family: 'Outfit', sans-serif;
  transition: all 0.15s;
}

.btn-ghost:hover { border-color: var(--s-border-mid); color: var(--s-text); }
</style>
