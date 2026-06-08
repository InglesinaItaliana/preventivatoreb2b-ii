<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import MIcon from '../../components/shared/MIcon.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import NebulaVehicleCard from '../../components/nebula/mezzi/NebulaVehicleCard.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useCan } from '../../composables/sidera/useCan'
import { useNebulaTeam } from '../../composables/nebula/useNebulaTeam'
import {
  useVehicles, useVehicleDeadlines, createVehicle, vehicleWorstStatus,
} from '../../composables/shared/useVehicles'
import type { VehicleType, VehicleUsage } from '../../types/nebula-fleet'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)
const router = useRouter()
const { can } = useCan()
const { members } = useNebulaTeam()
const { vehicles, loading } = useVehicles()
const { openDeadlines } = useVehicleDeadlines()

const filterType = ref<'all' | VehicleType>('all')
const showModal = ref(false)
const saving = ref(false)
const form = ref({
  type: 'automobile' as VehicleType,
  usage: 'mobilita' as VehicleUsage,
  plate: '',
  brand: '',
  model: '',
  year: '',
  assigneeUid: '',
})

const filtered = computed(() =>
  vehicles.value.filter(v => filterType.value === 'all' || v.type === filterType.value))

const vehicleTabs = computed(() => [
  {
    id: 'all',
    label: 'Tutti',
    icon: 'apps',
    count: vehicles.value.length || undefined,
  },
  {
    id: 'furgone',
    label: 'Furgoni',
    icon: 'local_shipping',
    count: vehicles.value.filter(v => v.type === 'furgone').length || undefined,
  },
  {
    id: 'automobile',
    label: 'Auto',
    icon: 'directions_car',
    count: vehicles.value.filter(v => v.type === 'automobile').length || undefined,
  },
])

const headerSubtitle = computed(() => {
  if (loading.value) return 'Caricamento…'
  const n = filtered.value.length
  if (n === 0) return 'Nessun mezzo'
  return `${n} ${n === 1 ? 'mezzo' : 'mezzi'}`
})

function memberName(uid?: string) {
  if (!uid) return ''
  const m = members.value.find(x => x.uid === uid)
  return m ? `${m.firstName} ${m.lastName}`.trim() : ''
}

function openCreate() {
  form.value = {
    type: 'automobile',
    usage: 'mobilita',
    plate: '',
    brand: '',
    model: '',
    year: '',
    assigneeUid: '',
  }
  showModal.value = true
}

async function submitCreate() {
  if (!form.value.plate.trim() || !form.value.brand.trim() || saving.value) return
  saving.value = true
  try {
    const id = await createVehicle({
      type: form.value.type,
      usage: form.value.usage,
      plate: form.value.plate,
      brand: form.value.brand,
      model: form.value.model,
      year: form.value.year ? Number(form.value.year) : undefined,
      assigneeUid: form.value.assigneeUid || undefined,
    })
    showModal.value = false
    router.push(`/nebula/mezzi/${id}`)
  } catch (e) {
    console.error('[NebulaMezzi] create', e)
  } finally {
    saving.value = false
  }
}

const newVehicleTick = inject<Ref<number>>('nebula-new-vehicle-tick', null as any)
if (newVehicleTick) watch(newVehicleTick, () => { if (can('canManageFleet')) openCreate() })

onMounted(() => {
  if (sessionStorage.getItem('nebula-pending-new-vehicle') === '1' && can('canManageFleet')) {
    sessionStorage.removeItem('nebula-pending-new-vehicle')
    nextTick(() => openCreate())
  }
})
</script>

<template>
  <div class="nmv-root s-scope-nebula" ref="scrollEl">
    <MdPageHeader
      title="Mezzi"
      :subtitle="headerSubtitle"
      sticky
      borderless
      :hidden="headerHidden"
    >
      <template #tools>
        <CepheidViewSwitcher
          :model-value="filterType"
          :tabs="vehicleTabs"
          @update:model-value="(v) => (filterType = v as typeof filterType)"
        />
      </template>
      <template #cta>
        <button
          v-if="can('canManageFleet')"
          type="button"
          class="md-btn md-btn--filled md-btn--sm md-btn--square nmv-create-btn"
          @click="openCreate"
        >
          <MIcon name="add" :size="16" />
          {{ saving ? 'Creazione…' : 'Nuovo mezzo' }}
        </button>
      </template>
    </MdPageHeader>

    <div class="nmv-content">
      <section class="nmv-list-section">
        <div v-if="loading" class="nmv-empty">Caricamento…</div>
        <div v-else-if="!filtered.length" class="nmv-empty">
          <MIcon name="directions_car" filled :size="40" />
          <p>Nessun mezzo in questa categoria.</p>
          <p v-if="can('canManageFleet')" class="nmv-empty-hint">
            Aggiungi il primo mezzo con «Nuovo mezzo».
          </p>
        </div>
        <ul v-else class="nmv-list">
          <li v-for="v in filtered" :key="v.id">
            <NebulaVehicleCard
              :vehicle="v"
              :assignee-name="memberName(v.assigneeUid)"
              :deadline-status="vehicleWorstStatus(v.id, openDeadlines)"
              @click="router.push(`/nebula/mezzi/${v.id}`)"
            />
          </li>
        </ul>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="md-modal-backdrop" @click.self="showModal = false">
        <div class="md-modal-dialog">
          <div class="md-modal-header">
            <span class="md-modal-title">Nuovo mezzo</span>
            <button type="button" class="md-modal-close" @click="showModal = false">
              <MIcon name="close" :size="18" />
            </button>
          </div>
          <div class="md-modal-body nmv-form">
            <label class="md-text-field">
              <span class="md-text-field-label">Targa</span>
              <input v-model="form.plate" class="md-text-field-input" placeholder="AB123CD" />
            </label>
            <label class="md-text-field">
              <span class="md-text-field-label">Marca</span>
              <input v-model="form.brand" class="md-text-field-input" />
            </label>
            <label class="md-text-field">
              <span class="md-text-field-label">Modello</span>
              <input v-model="form.model" class="md-text-field-input" />
            </label>
            <div class="nmv-form-row">
              <label class="md-text-field">
                <span class="md-text-field-label">Tipo</span>
                <select v-model="form.type" class="md-text-field-input">
                  <option value="automobile">Automobile</option>
                  <option value="furgone">Furgone</option>
                </select>
              </label>
              <label class="md-text-field">
                <span class="md-text-field-label">Uso</span>
                <select v-model="form.usage" class="md-text-field-input">
                  <option value="mobilita">Mobilità</option>
                  <option value="consegne">Consegne</option>
                  <option value="misto">Misto</option>
                </select>
              </label>
            </div>
            <label class="md-text-field">
              <span class="md-text-field-label">Assegnatario</span>
              <select v-model="form.assigneeUid" class="md-text-field-input">
                <option value="">— Nessuno —</option>
                <option v-for="m in members.filter(x => x.active !== false && x.uid)" :key="m.uid" :value="m.uid">
                  {{ m.firstName }} {{ m.lastName }}
                </option>
              </select>
            </label>
          </div>
          <div class="md-modal-footer">
            <button type="button" class="md-btn md-btn--outlined" @click="showModal = false">Annulla</button>
            <button type="button" class="md-btn md-btn--filled" :disabled="saving" @click="submitCreate">Crea</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nmv-root {
  height: 100%;
  width: 100%;
  overflow: auto;
  font-family: 'Outfit', system-ui, sans-serif;
  box-sizing: border-box;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .nmv-root { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .nmv-root { --page-bg: #0E0C07; }
}

.nmv-root,
.nmv-root *,
.nmv-root *::before,
.nmv-root *::after {
  box-sizing: border-box;
}

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
}

.nmv-content {
  max-width: 920px;
  margin: 0 auto;
  padding: 16px 16px 60px;
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .nmv-content { padding: 24px 40px; max-width: 900px; }
}

.nmv-list-section { margin-bottom: 28px; }
.nmv-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nmv-list li { list-style: none; }

.nmv-empty {
  padding: 24px;
  text-align: center;
  color: #999;
  background: var(--md-sys-color-surface, #fafafa);
  border-radius: 12px;
  font-size: 13px;
}
.nmv-empty-hint { font-size: 12px; margin-top: 8px; }

.nmv-create-btn { gap: 6px; }

.nmv-form { display: flex; flex-direction: column; gap: 12px; }
.nmv-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
