<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import MIcon from '../../components/shared/MIcon.vue'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import NebulaDeadlineList from '../../components/nebula/mezzi/NebulaDeadlineList.vue'
import NebulaArchivioLinkPicker from '../../components/nebula/archivio/NebulaArchivioLinkPicker.vue'
import NebulaArchivioUploadZone from '../../components/nebula/archivio/NebulaArchivioUploadZone.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useCan } from '../../composables/sidera/useCan'
import { useNebulaTeam } from '../../composables/nebula/useNebulaTeam'
import {
  updateVehicle, createVehicleDeadline, completeVehicleDeadline,
} from '../../composables/shared/useVehicles'
import { useVehicleDeadlines } from '../../composables/shared/useVehicles'
import { useArchivioFilesForVehicle, getArchivioDownloadUrl, uploadArchivioFile } from '../../composables/shared/useNebulaArchivio'
import { linkArchivioToVehicle, unlinkArchivioFromVehicle, uploadAndLinkToVehicle } from '../../composables/nebula/useVehicleArchivioLinks'
import type { Vehicle, DeadlineKind } from '../../types/nebula-fleet'
import { tsToDate, DEADLINE_KIND_LABELS } from '../../types/nebula-fleet'

const route = useRoute()
const router = useRouter()
const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)
const { can } = useCan()
const { members } = useNebulaTeam()
const vehicleId = computed(() => route.params.vehicleId as string)
const vehicle = ref<Vehicle | null>(null)
const tab = ref<'anagrafica' | 'scadenze' | 'documenti'>('scadenze')
const deadlineKindOptions = Object.entries(DEADLINE_KIND_LABELS) as [DeadlineKind, string][]
const { openDeadlines } = useVehicleDeadlines()
const { files: linkedFiles } = useArchivioFilesForVehicle(vehicleId)

const vehicleDeadlines = computed(() =>
  openDeadlines.value.filter(d => d.vehicleId === vehicleId.value))

const tabs = [
  { id: 'anagrafica' as const, label: 'Anagrafica', icon: 'badge' },
  { id: 'scadenze' as const, label: 'Scadenze', icon: 'event' },
  { id: 'documenti' as const, label: 'Documenti', icon: 'folder' },
]

const headerSubtitle = computed(() => {
  if (!vehicle.value) return ''
  const parts = [vehicle.value.brand, vehicle.value.model].filter(Boolean)
  return parts.join(' ') || 'Dettaglio mezzo'
})

const showDeadlineModal = ref(false)
const showLinkPicker = ref(false)
const saving = ref(false)
const dlForm = ref({
  kind: 'assicurazione' as DeadlineKind,
  title: '',
  dueDate: '',
  allDay: true,
  startTime: '09:00',
  endTime: '10:00',
  notes: '',
})

function mapVehicle(id: string, data: Record<string, unknown>): Vehicle {
  return {
    id,
    type: (data.type as Vehicle['type']) ?? 'automobile',
    usage: (data.usage as Vehicle['usage']) ?? 'mobilita',
    plate: String(data.plate ?? ''),
    brand: String(data.brand ?? ''),
    model: String(data.model ?? ''),
    year: data.year != null ? Number(data.year) : undefined,
    vin: data.vin != null ? String(data.vin) : undefined,
    status: (data.status as Vehicle['status']) ?? 'active',
    assigneeUid: data.assigneeUid != null ? String(data.assigneeUid) : undefined,
    km: data.km != null ? Number(data.km) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    archivioFileIds: Array.isArray(data.archivioFileIds) ? data.archivioFileIds.map(String) : [],
    createdAt: tsToDate(data.createdAt as never) ?? new Date(),
    updatedAt: tsToDate(data.updatedAt as never) ?? new Date(),
    createdByUid: String(data.createdByUid ?? ''),
  }
}

let unsubVehicle: (() => void) | null = null
watch(vehicleId, (id) => {
  unsubVehicle?.()
  unsubVehicle = onSnapshot(doc(db, 'vehicles', id), (snap) => {
    if (snap.exists()) vehicle.value = mapVehicle(snap.id, snap.data())
    else vehicle.value = null
  })
}, { immediate: true })

watch(tab, (t) => {
  if (t === 'scadenze') {
    if (!route.query.tab) return
    router.replace({ query: {} })
    return
  }
  if (route.query.tab === t) return
  router.replace({ query: { tab: t } })
})

function syncTabFromRoute() {
  const t = route.query.tab
  if (t === 'anagrafica' || t === 'documenti') tab.value = t
  else tab.value = 'scadenze'
}

function onPlateInput(e: Event) {
  if (!vehicle.value) return
  const el = e.target as HTMLInputElement
  vehicle.value.plate = el.value.toUpperCase()
}

onMounted(syncTabFromRoute)
watch(() => route.query.tab, syncTabFromRoute)

async function saveAnagrafica() {
  if (!vehicle.value || !can('canManageFleet')) return
  saving.value = true
  try {
    await updateVehicle(vehicle.value.id, {
      plate: vehicle.value.plate,
      brand: vehicle.value.brand,
      model: vehicle.value.model,
      type: vehicle.value.type,
      usage: vehicle.value.usage,
      status: vehicle.value.status,
      assigneeUid: vehicle.value.assigneeUid,
      km: vehicle.value.km,
      notes: vehicle.value.notes,
      year: vehicle.value.year,
      vin: vehicle.value.vin,
    })
  } finally {
    saving.value = false
  }
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

function openDeadlineModal() {
  dlForm.value = {
    kind: 'assicurazione',
    title: '',
    dueDate: '',
    allDay: true,
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
  }
  showDeadlineModal.value = true
}

async function submitDeadline() {
  if (!dlForm.value.dueDate || saving.value) return
  saving.value = true
  try {
    const allDay = dlForm.value.allDay
    const dueDate = allDay
      ? parseDate(dlForm.value.dueDate)
      : combineDateTime(dlForm.value.dueDate, dlForm.value.startTime)
    const endAt = allDay
      ? undefined
      : combineDateTime(dlForm.value.dueDate, dlForm.value.endTime)
    await createVehicleDeadline({
      vehicleId: vehicleId.value,
      kind: dlForm.value.kind,
      title: dlForm.value.title || undefined,
      dueDate,
      endAt,
      allDay,
      notes: dlForm.value.notes || undefined,
    })
    showDeadlineModal.value = false
  } finally {
    saving.value = false
  }
}

async function onLinkFile(file: { id: string }) {
  await linkArchivioToVehicle(file.id, vehicleId.value)
}

async function onUploadFiles(fileList: FileList) {
  if (!can('canManageArchivio')) return
  for (const file of Array.from(fileList)) {
    await uploadAndLinkToVehicle(file, vehicleId.value, uploadArchivioFile)
  }
}

async function downloadLinked(storagePath: string, name: string) {
  const url = await getArchivioDownloadUrl(storagePath)
  window.open(url, '_blank')
}

async function unlinkFile(fileId: string) {
  if (!confirm('Scollegare questo file dal mezzo?')) return
  await unlinkArchivioFromVehicle(fileId, vehicleId.value)
}
</script>

<template>
  <div v-if="vehicle" ref="scrollEl" class="nvd-root s-scope-nebula">
    <MdPageHeader
      :title="vehicle.plate"
      :subtitle="headerSubtitle"
      sticky
      borderless
      :hidden="headerHidden"
    >
      <template #tools>
        <CepheidViewSwitcher v-model="tab" :tabs="tabs" />
      </template>
      <template #cta>
        <button
          v-if="tab === 'scadenze' && can('canManageFleet')"
          type="button"
          class="md-btn md-btn--filled md-btn--sm md-btn--square nvd-create-btn"
          @click="openDeadlineModal"
        >
          <MIcon name="add" :size="16" />
          Nuova scadenza
        </button>
      </template>
    </MdPageHeader>

    <div class="nvd-content">
      <div v-if="tab === 'anagrafica'" class="nvd-panel">
        <template v-if="can('canManageFleet')">
          <label class="md-text-field">
            <span class="md-text-field-label">Targa</span>
            <input
              :value="vehicle.plate"
              class="md-text-field-input nvd-plate"
              @input="onPlateInput"
            />
          </label>
          <label class="md-text-field">
            <span class="md-text-field-label">Marca / Modello</span>
            <div class="nvd-row">
              <input v-model="vehicle.brand" class="md-text-field-input" placeholder="Marca" />
              <input v-model="vehicle.model" class="md-text-field-input" placeholder="Modello" />
            </div>
          </label>
          <label class="md-text-field">
            <span class="md-text-field-label">Assegnatario</span>
            <select v-model="vehicle.assigneeUid" class="md-text-field-input">
              <option :value="undefined">— Nessuno —</option>
              <option v-for="m in members.filter(x => x.uid)" :key="m.uid" :value="m.uid">
                {{ m.firstName }} {{ m.lastName }}
              </option>
            </select>
          </label>
          <label class="md-text-field">
            <span class="md-text-field-label">Note</span>
            <textarea v-model="vehicle.notes" class="md-text-field-input nvd-notes" rows="3" />
          </label>
          <button type="button" class="md-btn md-btn--filled" :disabled="saving" @click="saveAnagrafica">Salva</button>
        </template>
        <div v-else class="nvd-readonly">
          <p><strong>Targa:</strong> {{ vehicle.plate }}</p>
          <p><strong>Veicolo:</strong> {{ vehicle.brand }} {{ vehicle.model }}</p>
          <p><strong>Uso:</strong> {{ vehicle.usage }}</p>
        </div>
      </div>

      <div v-else-if="tab === 'scadenze'" class="nvd-panel">
        <NebulaDeadlineList
          :deadlines="vehicleDeadlines"
          :can-manage="can('canManageFleet')"
          @complete="completeVehicleDeadline"
        />
      </div>

      <div v-else class="nvd-panel">
        <div v-if="can('canManageArchivio')" class="nvd-doc-actions">
          <button type="button" class="md-btn md-btn--outlined md-btn--sm" @click="showLinkPicker = true">
            Collega da Archivio
          </button>
        </div>
        <NebulaArchivioUploadZone v-if="can('canManageArchivio')" @files="onUploadFiles" />
        <ul class="nvd-files">
          <li v-for="f in linkedFiles" :key="f.id" class="nvd-file md-card-outlined">
            <span>{{ f.name }}</span>
            <div class="nvd-file-btns">
              <button type="button" class="md-btn md-btn--text md-btn--sm" @click="downloadLinked(f.storagePath, f.name)">
                <MIcon name="download" :size="16" />
              </button>
              <button
                v-if="can('canManageFleet')"
                type="button"
                class="md-btn md-btn--text md-btn--sm"
                @click="unlinkFile(f.id)"
              >
                <MIcon name="link_off" :size="16" />
              </button>
            </div>
          </li>
          <li v-if="!linkedFiles.length" class="nvd-files-empty">Nessun documento collegato.</li>
        </ul>
      </div>
    </div>

    <NebulaArchivioLinkPicker
      :open="showLinkPicker"
      :exclude-ids="vehicle.archivioFileIds"
      @close="showLinkPicker = false"
      @select="onLinkFile"
    />

    <Teleport to="body">
      <div v-if="showDeadlineModal" class="md-modal-backdrop" @click.self="showDeadlineModal = false">
        <div class="md-modal-dialog">
          <div class="md-modal-header">
            <span class="md-modal-title">Nuova scadenza</span>
            <button type="button" class="md-modal-close" @click="showDeadlineModal = false">
              <MIcon name="close" :size="18" />
            </button>
          </div>
          <div class="md-modal-body nvd-form">
            <label class="md-text-field">
              <span class="md-text-field-label">Tipo</span>
              <select v-model="dlForm.kind" class="md-text-field-input">
                <option v-for="[kind, label] in deadlineKindOptions" :key="kind" :value="kind">
                  {{ label }}
                </option>
              </select>
            </label>
            <label class="md-text-field">
              <span class="md-text-field-label">Titolo (opzionale)</span>
              <input v-model="dlForm.title" class="md-text-field-input" />
            </label>
            <label class="md-text-field">
              <span class="md-text-field-label">Data</span>
              <input v-model="dlForm.dueDate" type="date" class="md-text-field-input" />
            </label>
            <label class="nvd-check">
              <input v-model="dlForm.allDay" type="checkbox" />
              <span>Tutto il giorno</span>
            </label>
            <div v-if="!dlForm.allDay" class="nvd-row">
              <label class="md-text-field">
                <span class="md-text-field-label">Ora inizio</span>
                <input v-model="dlForm.startTime" type="time" class="md-text-field-input" />
              </label>
              <label class="md-text-field">
                <span class="md-text-field-label">Ora fine</span>
                <input v-model="dlForm.endTime" type="time" class="md-text-field-input" />
              </label>
            </div>
            <label class="md-text-field">
              <span class="md-text-field-label">Note (opzionale)</span>
              <textarea v-model="dlForm.notes" class="md-text-field-input nvd-notes" rows="2" />
            </label>
          </div>
          <div class="md-modal-footer">
            <button type="button" class="md-btn md-btn--outlined" @click="showDeadlineModal = false">Annulla</button>
            <button type="button" class="md-btn md-btn--filled" @click="submitDeadline">Aggiungi</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
  <div v-else class="nvd-loading">Caricamento…</div>
</template>

<style scoped>
.nvd-root {
  height: 100%;
  width: 100%;
  overflow: auto;
  font-family: 'Outfit', system-ui, sans-serif;
  box-sizing: border-box;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .nvd-root { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .nvd-root { --page-bg: #0E0C07; }
}

.nvd-root,
.nvd-root *,
.nvd-root *::before,
.nvd-root *::after {
  box-sizing: border-box;
}

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
}

.nvd-content {
  max-width: 920px;
  margin: 0 auto;
  padding: 16px 16px 60px;
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .nvd-content { padding: 24px 40px; max-width: 900px; }
}

.nvd-panel { display: flex; flex-direction: column; gap: 12px; }
.nvd-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.nvd-notes { resize: vertical; min-height: 72px; }
.nvd-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.nvd-plate { text-transform: uppercase; }
.nvd-create-btn { gap: 6px; }
.nvd-doc-actions { margin-bottom: 12px; }
.nvd-files { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.nvd-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 14px;
}
.nvd-file-btns { display: flex; gap: 4px; }
.nvd-files-empty, .nvd-loading, .nvd-readonly {
  padding: 24px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
}
.nvd-form { display: flex; flex-direction: column; gap: 12px; }
</style>
