<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import CepheidGoalCard from '../../components/cepheid/CepheidGoalCard.vue'
import CepheidPeriodPicker from '../../components/cepheid/CepheidPeriodPicker.vue'
import { useObiettivi, GOAL_COLOR_PRESETS, type Obiettivo } from '../../composables/sidera/useObiettivi'
import { useProjects } from '../../composables/sidera/useProjects'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useCan } from '../../composables/sidera/useCan'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { yearToDates } from '../../composables/cepheid/usePeriods'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const route  = useRoute()
const router = useRouter()
const scopeBase = computed(() => route.path.startsWith('/sidera') ? '/sidera' : '/cepheid')
const { obiettiviAttivi, loading, createObiettivo, updateObiettivo, deleteObiettivo } = useObiettivi()

// Obiettivi riservati a chi può gestirli (solo ADMIN). Accesso diretto degli
// altri ruoli → rimando alla root del modulo. Attende currentUser (async-auth).
const { currentUser } = useCurrentUser()
const { can } = useCan()
const isAdmin = computed(() => can('canManageGoals'))
watch(currentUser, (u) => { if (u && !can('canManageGoals')) router.replace(scopeBase.value) }, { immediate: true })
const { activeProjects, updateProject } = useProjects()

const currentYear = new Date().getFullYear()

function linkedFor(obiettivoId: string) {
  return activeProjects.value.filter(p => p.obiettivoId === obiettivoId)
}
const unlinkedProjects = computed(() => activeProjects.value.filter(p => !p.obiettivoId))

interface PeriodValue { periodKind: 'year' | 'quarters'; startDate: Date; endDate: Date }
function defaultPeriod(): PeriodValue {
  const { startDate, endDate } = yearToDates(currentYear)
  return { periodKind: 'year', startDate, endDate }
}

// ── Crea / Modifica obiettivo (modal unico) ─────────────────────────────────
const showGoalModal = ref(false)
const goalSaving    = ref(false)
const editingGoal   = ref<Obiettivo | null>(null)
const goalForm = ref<{ titolo: string; descrizione: string; colore: string; period: PeriodValue }>({
  titolo:      '',
  descrizione: '',
  colore:      GOAL_COLOR_PRESETS[0],
  period:      defaultPeriod(),
})

function openGoalModal() {
  if (!isAdmin.value) return
  editingGoal.value = null
  goalForm.value = { titolo: '', descrizione: '', colore: GOAL_COLOR_PRESETS[0], period: defaultPeriod() }
  showGoalModal.value = true
}

function openEditModal(g: Obiettivo) {
  if (!isAdmin.value) return
  editingGoal.value = g
  goalForm.value = {
    titolo:      g.titolo,
    descrizione: g.descrizione,
    colore:      g.colore,
    period:      {
      periodKind: g.periodKind,
      startDate:  g.startDate ?? new Date(g.anno, 0, 1),
      endDate:    g.endDate ?? new Date(g.anno, 11, 31),
    },
  }
  showGoalModal.value = true
}

async function submitGoal() {
  if (!goalForm.value.titolo.trim() || goalSaving.value) return
  goalSaving.value = true
  try {
    const f = goalForm.value
    if (editingGoal.value) {
      await updateObiettivo(editingGoal.value.id, {
        titolo:      f.titolo.trim(),
        descrizione: f.descrizione.trim(),
        periodKind:  f.period.periodKind,
        startDate:   f.period.startDate,
        endDate:     f.period.endDate,
        colore:      f.colore,
      })
    } else {
      await createObiettivo({
        titolo:      f.titolo.trim(),
        descrizione: f.descrizione.trim(),
        periodKind:  f.period.periodKind,
        startDate:   f.period.startDate,
        endDate:     f.period.endDate,
        colore:      f.colore,
      })
    }
    showGoalModal.value = false
  } catch (e) {
    console.error('[CEPHEID] obiettivo save error', e)
  } finally {
    goalSaving.value = false
  }
}

async function deleteGoal(g: Obiettivo) {
  if (!isAdmin.value) return
  if (!confirm('Eliminare definitivamente questo obiettivo? I progetti collegati restano, ma non saranno più associati.')) return
  for (const p of linkedFor(g.id)) {
    await updateProject(p.id, { obiettivoId: null })
  }
  await deleteObiettivo(g.id)
}

// ── Collega progetti (modal) ────────────────────────────────────────────────
const showLinkModal = ref(false)
const linkTargetId  = ref<string | null>(null)
function openLinkModal(g: Obiettivo) {
  if (!isAdmin.value) return
  linkTargetId.value = g.id
  showLinkModal.value = true
}
async function linkProject(projectId: string) {
  if (!linkTargetId.value) return
  await updateProject(projectId, { obiettivoId: linkTargetId.value })
}

function openProject(id: string) {
  router.push(scopeBase.value === '/sidera' ? '/sidera/projects/' + id : '/cepheid/project/' + id)
}
function openGoalDetail(id: string) {
  router.push(scopeBase.value + '/goal/' + id)
}

// ── Trigger dal FAB del layout ─────────────────────────────────────────────
const newGoalTick = inject<Ref<number>>('cepheid-new-goal-tick', null as any)
if (newGoalTick) {
  watch(newGoalTick, () => openGoalModal())
}

onMounted(() => {
  if (sessionStorage.getItem('cepheid-pending-new-goal') === '1') {
    sessionStorage.removeItem('cepheid-pending-new-goal')
    nextTick(() => openGoalModal())
  }
})

const totalActive = computed(() => obiettiviAttivi.value.length)
</script>

<template>
  <div class="gv s-scope-cepheid" ref="scrollEl">
    <MdPageHeader
      title="Obiettivi"
      :subtitle="totalActive === 0 ? 'Nessun obiettivo'
        : (totalActive === 1 ? '1 obiettivo attivo' : totalActive + ' obiettivi attivi')"
      sticky
      :hidden="headerHidden"
    >
      <template #cta>
        <button class="md-btn md-btn--filled md-btn--sm md-btn--square" @click="openGoalModal">
          <MIcon name="add" :size="16" /> Nuovo obiettivo
        </button>
      </template>
    </MdPageHeader>

    <div class="gv-content">
      <div v-if="loading" class="loading-rows">
        <div v-for="i in 2" :key="i" class="row-skel" />
      </div>

      <div v-else-if="!obiettiviAttivi.length" class="empty-state">
        <MIcon name="flag" filled :size="40" class="empty-icon" />
        <div>Nessun obiettivo definito.</div>
        <div class="empty-hint">Gli obiettivi sono le "destinazioni" dell'anno. I progetti li servono.</div>
      </div>

      <CepheidGoalCard
        v-for="o in obiettiviAttivi"
        :key="o.id"
        :goal="o"
        :linked-projects="linkedFor(o.id)"
        :is-admin="isAdmin"
        @open="openGoalDetail(o.id)"
        @edit="openEditModal(o)"
        @delete="deleteGoal(o)"
        @link="openLinkModal(o)"
        @open-project="openProject"
      />
    </div>

    <!-- Modal Crea / Modifica obiettivo -->
    <Teleport to="body">
      <div v-if="showGoalModal" class="modal-backdrop md-modal-backdrop" @click.self="showGoalModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">{{ editingGoal ? 'Modifica obiettivo' : 'Nuovo obiettivo' }}</span>
            <button class="modal-close md-modal-close" @click="showGoalModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Titolo *</label>
            <input v-model="goalForm.titolo" class="field-input md-text-field-input" autofocus placeholder="Es. Aumentare il fatturato del 30%" />

            <label class="field-label md-text-field-label" style="margin-top:12px">Descrizione</label>
            <textarea v-model="goalForm.descrizione" class="field-input md-text-field-input" rows="2" />

            <label class="field-label md-text-field-label" style="margin-top:16px">Periodo</label>
            <CepheidPeriodPicker v-model="goalForm.period" />

            <label class="field-label md-text-field-label" style="margin-top:16px">Colore</label>
            <div class="color-picker">
              <button
                v-for="c in GOAL_COLOR_PRESETS"
                :key="c"
                type="button"
                class="color-swatch"
                :class="{ 'is-sel': goalForm.colore === c }"
                :style="{ background: c }"
                @click="goalForm.colore = c"
              />
            </div>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showGoalModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!goalForm.titolo.trim() || goalSaving"
              @click="submitGoal"
            >{{ goalSaving ? 'Salvataggio…' : (editingGoal ? 'Salva' : 'Crea obiettivo') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Collega progetti -->
    <Teleport to="body">
      <div v-if="showLinkModal" class="modal-backdrop md-modal-backdrop" @click.self="showLinkModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">Collega progetto</span>
            <button class="modal-close md-modal-close" @click="showLinkModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <div v-if="!unlinkedProjects.length" class="link-empty">
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
  </div>
</template>

<style scoped>
.gv {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  /* Pattern Cruscotto: scroll sul root → padding-bottom 110px+safe (da SideraLayout)
     lascia spazio alla pillola fluttuante e il bg copre la zona della pillola. */
  height: 100%;
  overflow: auto;
  /* sfondo cream coerente con la pagina Progetti.
     --page-bg letto da MdPageHeader.is-sticky per match-are il bg pagina e
     occludere il content che gli scorre sotto. */
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .gv { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .gv { --page-bg: #0E0C07; } }
/* header allineato al contenuto: gutter mobile 16px (come .gv-content) */
:deep(.md-page-header) { padding: 18px 16px 14px; }

.gv-content { padding: 16px; display: flex; flex-direction: column; gap: 10px; }

/* desktop: contenuto max-width 900 centrato (rif. card Progetti) + header allineato */
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .gv-content { padding: 24px 40px; max-width: 900px; margin: 0 auto; width: 100%; }
}

.loading-rows { display: flex; flex-direction: column; gap: 6px; }
.row-skel { height: 130px; border-radius: 14px; background: #E8E5DF; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; margin-bottom: 4px; }
.empty-hint { font-size: 12px; color: #B4B0AA; max-width: 280px; line-height: 1.5; }

/* Modal "Collega progetto" — righe progetto */
.link-empty { padding: 24px 8px; text-align: center; font-size: 12px; color: #9B9590; }
.link-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 0;
  cursor: pointer; border-bottom: 1px solid #F0EDE8;
}
.link-row:hover { background: #FAF8F4; }
.link-row:last-child { border-bottom: none; }
.link-stripe { width: 4px; height: 30px; border-radius: 2px; flex-shrink: 0; }
.link-info { flex: 1; min-width: 0; }
.link-name { font-size: 13px; font-weight: 600; color: #1A1917; }
.link-stats { font-size: 11px; color: #9B9590; }
.link-add { color: var(--md-sys-color-primary); flex-shrink: 0; }

/* Modal — copia pattern Projects */
.modal-backdrop {
  position: fixed;
  inset: 0;
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
  width: 100%;
  max-width: 540px;
  max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
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

.color-picker { display: flex; gap: 8px; }
.color-swatch {
  width: 28px; height: 28px;
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
