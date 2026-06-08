<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import MIcon from '../../components/shared/MIcon.vue'
import NebulaArchivioFileRow from '../../components/nebula/archivio/NebulaArchivioFileRow.vue'
import NebulaArchivioFolderRow from '../../components/nebula/archivio/NebulaArchivioFolderRow.vue'
import NebulaArchivioUploadZone from '../../components/nebula/archivio/NebulaArchivioUploadZone.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useCan } from '../../composables/sidera/useCan'
import {
  useNebulaArchivio, uploadArchivioFile, getArchivioDownloadUrl, archiveArchivioFile,
  createArchivioFolder, deleteArchivioFolder,
} from '../../composables/shared/useNebulaArchivio'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)
const router = useRouter()
const { can } = useCan()
const canManage = () => can('canManageArchivio')

const currentFolderId = ref<string | null>(null)
const { files, folders, loading } = useNebulaArchivio(currentFolderId)
const uploading = ref(false)
const uploadZoneRef = ref<InstanceType<typeof NebulaArchivioUploadZone> | null>(null)

const folderById = computed(() => new Map(folders.value.map(f => [f.id, f])))

const breadcrumbs = computed(() => {
  const root = [{ id: null as string | null, name: 'Archivio' }]
  const trail: { id: string; name: string }[] = []
  let id = currentFolderId.value
  while (id) {
    const f = folderById.value.get(id)
    if (!f) break
    trail.unshift({ id: f.id, name: f.name })
    id = f.parentId
  }
  return [...root, ...trail]
})

const visibleFolders = computed(() =>
  folders.value.filter(f =>
    currentFolderId.value ? f.parentId === currentFolderId.value : f.parentId == null,
  ),
)

const itemCount = computed(() => visibleFolders.value.length + files.value.length)

const headerSubtitle = computed(() => {
  if (loading.value) return 'Caricamento…'
  if (itemCount.value === 0) return 'Nessun elemento'
  const parts: string[] = []
  if (visibleFolders.value.length) {
    parts.push(`${visibleFolders.value.length} ${visibleFolders.value.length === 1 ? 'cartella' : 'cartelle'}`)
  }
  if (files.value.length) {
    parts.push(`${files.value.length} ${files.value.length === 1 ? 'file' : 'file'}`)
  }
  return parts.join(' · ')
})

function goToFolder(id: string | null) {
  currentFolderId.value = id
}

async function handleFiles(fileList: FileList) {
  if (!canManage()) return
  uploading.value = true
  try {
    for (const file of Array.from(fileList)) {
      await uploadArchivioFile(file, currentFolderId.value)
    }
  } catch (e) {
    console.error('[NebulaArchivio] upload', e)
  } finally {
    uploading.value = false
  }
}

async function downloadFile(storagePath: string, name: string) {
  const url = await getArchivioDownloadUrl(storagePath)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.target = '_blank'
  a.click()
}

async function removeFile(fileId: string, storagePath: string) {
  if (!canManage() || !confirm('Eliminare questo file dall\'archivio?')) return
  await archiveArchivioFile(fileId, storagePath)
}

async function removeFolder(folderId: string, name: string) {
  if (!canManage() || !confirm(`Eliminare la cartella «${name}»?`)) return
  try {
    await deleteArchivioFolder(folderId, folders.value)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Impossibile eliminare la cartella.'
    alert(msg)
  }
}

// ── Nuova cartella ──────────────────────────────────────────────────────────
const showFolderModal = ref(false)
const folderName = ref('')
const savingFolder = ref(false)

function openCreateFolder() {
  folderName.value = ''
  showFolderModal.value = true
}

async function submitCreateFolder() {
  const name = folderName.value.trim()
  if (!name || savingFolder.value) return
  savingFolder.value = true
  try {
    await createArchivioFolder(name, currentFolderId.value)
    showFolderModal.value = false
  } catch (e) {
    console.error('[NebulaArchivio] create folder', e)
  } finally {
    savingFolder.value = false
  }
}

const uploadTick = inject<Ref<number>>('nebula-new-archivio-tick', null as any)
if (uploadTick) {
  watch(uploadTick, () => {
    if (canManage()) uploadZoneRef.value?.openPicker()
  })
}

onMounted(() => {
  if (sessionStorage.getItem('nebula-pending-archivio-upload') === '1' && canManage()) {
    sessionStorage.removeItem('nebula-pending-archivio-upload')
    nextTick(() => uploadZoneRef.value?.openPicker())
  }
  if (sessionStorage.getItem('nebula-pending-new-folder') === '1' && canManage()) {
    sessionStorage.removeItem('nebula-pending-new-folder')
    nextTick(() => openCreateFolder())
  }
})
</script>

<template>
  <div class="nah-root s-scope-nebula" ref="scrollEl">
    <div class="nah-header-block" :class="{ 'is-hidden': headerHidden }">
      <MdPageHeader
        title="Archivio"
        :subtitle="headerSubtitle"
        borderless
      >
        <template #tools>
          <button
            v-if="canManage()"
            type="button"
            class="nah-mobile-folder-btn"
            aria-label="Nuova cartella"
            @click="openCreateFolder"
          >
            <MIcon name="create_new_folder" :size="18" />
          </button>
          <nav class="nah-breadcrumb" aria-label="Percorso cartelle">
            <template v-for="(crumb, i) in breadcrumbs" :key="crumb.id ?? 'root'">
              <span v-if="i > 0" class="nah-bc-sep">/</span>
              <button
                type="button"
                class="nah-bc-btn"
                :class="{ 'is-current': i === breadcrumbs.length - 1 }"
                :disabled="i === breadcrumbs.length - 1"
                @click="goToFolder(crumb.id)"
              >{{ crumb.name }}</button>
            </template>
          </nav>
        </template>
        <template #cta>
          <button
            v-if="canManage()"
            type="button"
            class="md-btn md-btn--filled md-btn--sm md-btn--square nah-create-btn"
            @click="openCreateFolder"
          >
            <MIcon name="create_new_folder" :size="16" />
            Nuova cartella
          </button>
        </template>
      </MdPageHeader>

      <NebulaArchivioUploadZone
        v-if="canManage()"
        ref="uploadZoneRef"
        compact
        @files="handleFiles"
      />
      <p v-if="uploading" class="nah-uploading">Caricamento in corso…</p>
    </div>

    <div class="nah-content">
      <div v-if="loading" class="nah-empty">Caricamento…</div>

      <template v-else-if="itemCount === 0">
        <div class="nah-empty">
          <MIcon name="folder_open" filled :size="40" />
          <p>Questa cartella è vuota.</p>
          <p v-if="canManage()" class="nah-empty-hint">
            Crea una cartella o carica file dall'area in alto.
          </p>
        </div>
      </template>

      <section v-else class="nah-list-section">
        <ul class="nah-list">
          <NebulaArchivioFolderRow
            v-for="f in visibleFolders"
            :key="f.id"
            :folder="f"
            :can-manage="canManage()"
            @open="goToFolder(f.id)"
            @delete="removeFolder(f.id, f.name)"
          />
          <li v-for="file in files" :key="file.id" class="nah-file-wrap">
            <NebulaArchivioFileRow
              :file="file"
              :can-manage="canManage()"
              @open="router.push(`/nebula/archivio/${file.id}`)"
              @download="downloadFile(file.storagePath, file.name)"
              @archive="removeFile(file.id, file.storagePath)"
            />
          </li>
        </ul>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="showFolderModal" class="md-modal-backdrop" @click.self="showFolderModal = false">
        <div class="md-modal-dialog">
          <div class="md-modal-header">
            <span class="md-modal-title">Nuova cartella</span>
            <button type="button" class="md-modal-close" @click="showFolderModal = false">
              <MIcon name="close" :size="18" />
            </button>
          </div>
          <div class="md-modal-body">
            <label class="md-text-field">
              <span class="md-text-field-label">Nome cartella</span>
              <input
                v-model="folderName"
                class="md-text-field-input"
                placeholder="Es. Assicurazioni 2026"
                @keydown.enter="submitCreateFolder"
              />
            </label>
          </div>
          <div class="md-modal-footer">
            <button type="button" class="md-btn md-btn--outlined" @click="showFolderModal = false">Annulla</button>
            <button
              type="button"
              class="md-btn md-btn--filled"
              :disabled="savingFolder || !folderName.trim()"
              @click="submitCreateFolder"
            >Crea</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nah-root {
  height: 100%;
  width: 100%;
  overflow: auto;
  font-family: 'Outfit', system-ui, sans-serif;
  box-sizing: border-box;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .nah-root { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .nah-root { --page-bg: #0E0C07; }
}

.nah-root,
.nah-root *,
.nah-root *::before,
.nah-root *::after {
  box-sizing: border-box;
}

.nah-header-block {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--md-sys-color-surface);
  transition: transform var(--md-sys-motion-duration-short4, 200ms)
    var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(.05,.7,.1,1));
  will-change: transform;
}
.nah-header-block.is-hidden {
  transform: translateY(-100%);
}

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) { background: var(--md-sys-color-surface); }

.nah-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  max-width: min(420px, 50vw);
  font-size: 12px;
}
.nah-bc-sep { color: #999; padding: 0 2px; user-select: none; }
.nah-bc-btn {
  border: 0;
  background: none;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  color: var(--md-sys-color-primary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nah-bc-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent);
}
.nah-bc-btn.is-current,
.nah-bc-btn:disabled {
  color: var(--md-sys-color-on-surface-variant);
  cursor: default;
  font-weight: 600;
}

.nah-uploading {
  margin: 0;
  padding: 6px 16px 10px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface);
}

.nah-content {
  max-width: 920px;
  margin: 0 auto;
  padding: 16px 16px 60px;
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
  .nah-content { padding: 24px 40px; max-width: 900px; }
  .nah-header-block :deep(.na-upload.is-compact) {
    padding-left: max(40px, calc(50% - 410px));
    padding-right: max(40px, calc(50% - 410px));
  }
  .nah-uploading {
    padding-left: max(40px, calc(50% - 410px));
    padding-right: max(40px, calc(50% - 410px));
  }
}

.nah-list-section { margin-bottom: 28px; }
.nah-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nah-file-wrap { list-style: none; }

.nah-empty {
  padding: 24px;
  text-align: center;
  color: #999;
  background: var(--md-sys-color-surface, #fafafa);
  border-radius: 12px;
  font-size: 13px;
}
.nah-empty-hint { font-size: 12px; margin-top: 8px; }

.nah-create-btn { gap: 6px; }

.nah-mobile-folder-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
  color: var(--md-sys-color-primary);
  cursor: pointer;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .nah-breadcrumb { max-width: 100%; }
  .nah-mobile-folder-btn { display: inline-flex; }
  :deep(.md-page-header__tools) { gap: 8px; }
}
</style>
