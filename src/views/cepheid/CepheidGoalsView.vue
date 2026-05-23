<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import GoalProgressBar from '../../components/cepheid/GoalProgressBar.vue'
import { useObiettivi, GOAL_COLOR_PRESETS } from '../../composables/sidera/useObiettivi'
import { useProjects } from '../../composables/sidera/useProjects'

const route  = useRoute()
const router = useRouter()
const scopeBase = computed(() => route.path.startsWith('/sidera') ? '/sidera' : '/cepheid')
const { obiettiviAttivi, loading, createObiettivo } = useObiettivi()
const { activeProjects } = useProjects()

const currentYear = new Date().getFullYear()

interface GoalStats {
  progetti: number
  progettiCompletati: number
  taskTotali: number
  taskDone: number
  percentuale: number
}

function statsFor(obiettivoId: string): GoalStats {
  const linked = activeProjects.value.filter(p => p.obiettivoId === obiettivoId)
  let taskTotali = 0
  let taskDone   = 0
  let progettiCompletati = 0
  for (const p of linked) {
    taskTotali += p.taskCount
    taskDone   += p.doneCount
    if (p.taskCount > 0 && p.doneCount >= p.taskCount) progettiCompletati++
  }
  const percentuale = taskTotali > 0 ? Math.round((taskDone / taskTotali) * 100) : 0
  return { progetti: linked.length, progettiCompletati, taskTotali, taskDone, percentuale }
}

// ── Nuovo obiettivo (modal) ────────────────────────────────────────────────
const showGoalModal = ref(false)
const goalSaving    = ref(false)
const goalForm = ref({
  titolo:         '',
  descrizione:    '',
  metrica:        '',
  valoreTarget:   '' as string | number,
  valoreCorrente: '' as string | number,
  anno:           currentYear,
  colore:         GOAL_COLOR_PRESETS[0],
})

function openGoalModal() {
  goalForm.value = {
    titolo:         '',
    descrizione:    '',
    metrica:        '',
    valoreTarget:   '',
    valoreCorrente: '',
    anno:           currentYear,
    colore:         GOAL_COLOR_PRESETS[0],
  }
  showGoalModal.value = true
}

function parseNum(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function submitGoal() {
  if (!goalForm.value.titolo.trim() || goalSaving.value) return
  goalSaving.value = true
  try {
    await createObiettivo({
      titolo:         goalForm.value.titolo.trim(),
      descrizione:    goalForm.value.descrizione.trim(),
      metrica:        goalForm.value.metrica.trim(),
      valoreTarget:   parseNum(goalForm.value.valoreTarget),
      valoreCorrente: parseNum(goalForm.value.valoreCorrente),
      anno:           Number(goalForm.value.anno) || currentYear,
      colore:         goalForm.value.colore,
    })
    showGoalModal.value = false
  } catch (e) {
    console.error('[CEPHEID] obiettivo creation error', e)
  } finally {
    goalSaving.value = false
  }
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
  <div class="gv s-scope-cepheid">
    <MdPageHeader
      title="Obiettivi"
      :subtitle="totalActive === 0 ? 'Nessun obiettivo'
        : (totalActive === 1 ? '1 obiettivo attivo' : totalActive + ' obiettivi attivi')"
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

      <div
        v-for="o in obiettiviAttivi"
        :key="o.id"
        class="goal-card"
        @click="router.push(scopeBase + '/goal/' + o.id)"
      >
        <div class="goal-stripe" :style="{ background: o.colore }" />
        <div class="goal-body">
          <div class="goal-top">
            <div class="goal-titolo">{{ o.titolo }}</div>
            <span class="goal-anno">{{ o.anno }}</span>
          </div>
          <div v-if="o.metrica" class="goal-metrica">
            <MIcon name="trending_up" :size="13" />
            <span>{{ o.metrica }}</span>
          </div>
          <div v-if="o.descrizione" class="goal-desc">{{ o.descrizione }}</div>

          <template v-if="statsFor(o.id).progetti > 0">
            <GoalProgressBar
              :percentuale="statsFor(o.id).percentuale"
              :colore="o.colore"
              :show-label="false"
            />
            <div class="goal-stats">
              <span class="goal-stat-pct" :style="{ color: o.colore }">{{ statsFor(o.id).percentuale }}%</span>
              <span class="goal-stat-meta">{{ statsFor(o.id).progetti }} {{ statsFor(o.id).progetti === 1 ? 'progetto' : 'progetti' }} · {{ statsFor(o.id).taskDone }}/{{ statsFor(o.id).taskTotali }} azioni</span>
            </div>
          </template>
          <div v-else class="goal-stats goal-stats--empty">
            Nessun progetto collegato
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Nuovo obiettivo -->
    <Teleport to="body">
      <div v-if="showGoalModal" class="modal-backdrop md-modal-backdrop" @click.self="showGoalModal = false">
        <div class="modal md-modal-dialog" @click.stop>
          <div class="modal-header md-modal-header">
            <span class="modal-title">Nuovo obiettivo</span>
            <button class="modal-close md-modal-close" @click="showGoalModal = false"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <label class="field-label md-text-field-label">Titolo *</label>
            <input v-model="goalForm.titolo" class="field-input md-text-field-input" autofocus placeholder="Es. Aumentare il fatturato del 30%" />

            <label class="field-label md-text-field-label" style="margin-top:12px">Metrica</label>
            <input v-model="goalForm.metrica" class="field-input md-text-field-input" placeholder="Es. Fatturato annuo (€)" />

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label md-text-field-label">Valore corrente</label>
                <input v-model="goalForm.valoreCorrente" type="number" class="field-input md-text-field-input" placeholder="0" />
              </div>
              <div>
                <label class="field-label md-text-field-label">Valore target</label>
                <input v-model="goalForm.valoreTarget" type="number" class="field-input md-text-field-input" placeholder="0" />
              </div>
            </div>

            <label class="field-label md-text-field-label" style="margin-top:12px">Descrizione</label>
            <textarea v-model="goalForm.descrizione" class="field-input md-text-field-input" rows="2" />

            <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;margin-top:12px">
              <div>
                <label class="field-label md-text-field-label">Anno</label>
                <input v-model="goalForm.anno" type="number" class="field-input md-text-field-input" />
              </div>
              <div>
                <label class="field-label md-text-field-label">Colore</label>
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
            </div>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showGoalModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="!goalForm.titolo.trim() || goalSaving"
              @click="submitGoal"
            >{{ goalSaving ? 'Creazione…' : 'Crea obiettivo' }}</button>
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
  min-height: calc(100vh - 120px);
  /* sfondo cream coerente con la pagina Progetti */
  background: #EFE7D9;
}
.s-surface-dark .gv { background: #0E0C07; }
@media (prefers-color-scheme: dark) { .gv { background: #0E0C07; } }
.gv :deep(.md-page-header) { flex-shrink: 0; }
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

.goal-card {
  display: flex;
  background: #FFF8F0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.s-surface-dark .goal-card { background: #16130B; }
@media (prefers-color-scheme: dark) { .goal-card { background: #16130B; } }

.goal-card:hover {
  border-color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 4%, transparent);
  box-shadow: var(--md-sys-elevation-level-2);
}

.goal-stripe { width: 8px; flex-shrink: 0; }

.goal-body { padding: 14px 16px; flex: 1; min-width: 0; }

.goal-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.goal-titolo {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--md-sys-color-on-surface);
  flex: 1;
  min-width: 0;
}

.goal-anno {
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container);
  padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full);
  flex-shrink: 0;
}

.goal-metrica {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 4px;
}

.goal-desc {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.goal-stats {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 8px;
  gap: 8px;
}

.goal-stat-pct { font-size: 13px; font-weight: 700; }
.goal-stat-meta { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }
.goal-stats--empty {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  font-style: italic;
  margin-top: 4px;
}

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
