<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import MIcon from '../../components/shared/MIcon.vue'
import { getArchivioDownloadUrl } from '../../composables/shared/useNebulaArchivio'
import type { NebulaArchivioFile } from '../../types/nebula-fleet'
import { tsToDate } from '../../types/nebula-fleet'

const route = useRoute()
const router = useRouter()
const file = ref<NebulaArchivioFile | null>(null)
const previewUrl = ref<string | null>(null)
const loading = ref(true)

const isPdf = computed(() => file.value?.mimeType.includes('pdf'))

onMounted(async () => {
  const id = route.params.fileId as string
  const snap = await getDoc(doc(db, 'nebulaArchivio', id))
  if (!snap.exists()) {
    loading.value = false
    return
  }
  const d = snap.data()
  file.value = {
    id: snap.id,
    name: String(d.name ?? ''),
    mimeType: String(d.mimeType ?? ''),
    sizeBytes: Number(d.sizeBytes) || 0,
    storagePath: String(d.storagePath ?? ''),
    folderId: d.folderId ?? null,
    tags: d.tags ?? [],
    linkedVehicleIds: d.linkedVehicleIds ?? [],
    linkedTo: d.linkedTo ?? [],
    uploadedByUid: String(d.uploadedByUid ?? ''),
    uploadedAt: tsToDate(d.uploadedAt) ?? new Date(),
    archived: !!d.archived,
  }
  if (file.value.storagePath) {
    previewUrl.value = await getArchivioDownloadUrl(file.value.storagePath)
  }
  loading.value = false
})

async function download() {
  if (!file.value || !previewUrl.value) return
  const a = document.createElement('a')
  a.href = previewUrl.value
  a.download = file.value.name
  a.target = '_blank'
  a.click()
}
</script>

<template>
  <div class="naf s-scope-nebula">
    <MdPageHeader
      :title="file?.name ?? 'File'"
      subtitle="Anteprima archivio"
    >
      <template #cta>
        <button type="button" class="md-btn md-btn--outlined md-btn--sm" @click="router.push('/nebula/archivio')">
          Indietro
        </button>
        <button v-if="previewUrl" type="button" class="md-btn md-btn--filled md-btn--sm" @click="download">
          <MIcon name="download" :size="16" /> Scarica
        </button>
      </template>
    </MdPageHeader>

    <div class="naf-body">
      <div v-if="loading" class="naf-loading">Caricamento…</div>
      <div v-else-if="!file" class="naf-loading">File non trovato.</div>
      <iframe v-else-if="isPdf && previewUrl" :src="previewUrl" class="naf-iframe" title="Anteprima PDF" />
      <div v-else class="naf-fallback">
        <MIcon name="insert_drive_file" :size="48" />
        <p>Anteprima non disponibile per questo tipo di file.</p>
        <button v-if="previewUrl" type="button" class="md-btn md-btn--filled" @click="download">Scarica file</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.naf-body { padding: 16px; max-width: 900px; margin: 0 auto 80px; }
.naf-iframe {
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 400px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
}
.naf-fallback, .naf-loading {
  text-align: center;
  padding: 48px 16px;
  color: var(--md-sys-color-on-surface-variant);
}
</style>
