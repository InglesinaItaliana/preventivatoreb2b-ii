import { ref, onUnmounted, watch, type Ref } from 'vue'
import {
  collection, doc, addDoc, updateDoc, setDoc, onSnapshot, query, where, orderBy,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage, auth } from '../../firebase'
import type { NebulaArchivioFile, NebulaArchivioFolder } from '../../types/nebula-fleet'
import { tsToDate } from '../../types/nebula-fleet'

function mapFile(id: string, data: Record<string, unknown>): NebulaArchivioFile {
  return {
    id,
    name: String(data.name ?? ''),
    mimeType: String(data.mimeType ?? 'application/octet-stream'),
    sizeBytes: Number(data.sizeBytes) || 0,
    storagePath: String(data.storagePath ?? ''),
    folderId: data.folderId != null ? String(data.folderId) : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    linkedVehicleIds: Array.isArray(data.linkedVehicleIds) ? data.linkedVehicleIds.map(String) : [],
    linkedTo: Array.isArray(data.linkedTo) ? data.linkedTo as NebulaArchivioFile['linkedTo'] : [],
    uploadedByUid: String(data.uploadedByUid ?? ''),
    uploadedAt: tsToDate(data.uploadedAt as never) ?? new Date(0),
    archived: !!data.archived,
  }
}

function mapFolder(id: string, data: Record<string, unknown>): NebulaArchivioFolder {
  return {
    id,
    name: String(data.name ?? ''),
    parentId: data.parentId != null ? String(data.parentId) : null,
    createdByUid: String(data.createdByUid ?? ''),
    createdAt: tsToDate(data.createdAt as never) ?? new Date(0),
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 180)
}

export function useNebulaArchivio(folderIdRef?: Ref<string | null>) {
  const files = ref<NebulaArchivioFile[]>([])
  const folders = ref<NebulaArchivioFolder[]>([])
  const loading = ref(true)
  let unsubFiles: Unsubscribe | null = null
  let unsubFolders: Unsubscribe | null = null

  function buildFilesQuery(currentFolderId: string | null) {
    return query(
      collection(db, 'nebulaArchivio'),
      where('archived', '==', false),
      where('folderId', '==', currentFolderId),
      orderBy('uploadedAt', 'desc'),
    )
  }

  function subscribeFiles(currentFolderId: string | null) {
    unsubFiles?.()
    loading.value = true
    unsubFiles = onSnapshot(buildFilesQuery(currentFolderId), (snap) => {
      files.value = snap.docs.map(d => mapFile(d.id, d.data()))
      loading.value = false
    }, (err) => {
      console.error('[useNebulaArchivio] files', err)
      loading.value = false
    })
  }

  subscribeFiles(folderIdRef?.value ?? null)
  if (folderIdRef) {
    watch(folderIdRef, (id) => subscribeFiles(id))
  }

  unsubFolders = onSnapshot(
    collection(db, 'nebulaArchivioFolders'),
    (snap) => {
      folders.value = snap.docs
        .map(d => mapFolder(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    },
    (err) => console.error('[useNebulaArchivio] folders', err),
  )

  onUnmounted(() => {
    unsubFiles?.()
    unsubFolders?.()
  })

  return { files, folders, loading, subscribeFiles }
}

export async function uploadArchivioFile(
  file: File,
  folderId: string | null = null,
): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non autenticato')
  const fileDocRef = doc(collection(db, 'nebulaArchivio'))
  const safeName = sanitizeFileName(file.name)
  const path = `nebula-archivio/${fileDocRef.id}/${safeName}`
  await uploadBytes(storageRef(storage, path), file, {
    contentType: file.type || 'application/octet-stream',
  })
  await setDoc(fileDocRef, {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storagePath: path,
    folderId,
    tags: [],
    linkedVehicleIds: [],
    linkedTo: [],
    uploadedByUid: uid,
    uploadedAt: serverTimestamp(),
    archived: false,
  })
  return fileDocRef.id
}

export async function getArchivioDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(storageRef(storage, storagePath))
}

export async function archiveArchivioFile(fileId: string, storagePath: string): Promise<void> {
  await updateDoc(doc(db, 'nebulaArchivio', fileId), { archived: true })
  try {
    await deleteObject(storageRef(storage, storagePath))
  } catch (e) {
    console.warn('[archivio] delete storage', e)
  }
}

export async function renameArchivioFile(fileId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'nebulaArchivio', fileId), { name: name.trim() })
}

export async function createArchivioFolder(name: string, parentId: string | null = null): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non autenticato')
  const ref = await addDoc(collection(db, 'nebulaArchivioFolders'), {
    name: name.trim(),
    parentId,
    createdByUid: uid,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export function useArchivioFilesForVehicle(vehicleIdRef: Ref<string>) {
  const files = ref<NebulaArchivioFile[]>([])
  const loading = ref(true)
  let unsub: Unsubscribe | null = null

  function subscribe(id: string) {
    unsub?.()
    if (!id) {
      files.value = []
      loading.value = false
      return
    }
    loading.value = true
    unsub = onSnapshot(
      query(
        collection(db, 'nebulaArchivio'),
        where('linkedVehicleIds', 'array-contains', id),
        where('archived', '==', false),
        orderBy('uploadedAt', 'desc'),
      ),
      (snap) => {
        files.value = snap.docs.map(d => mapFile(d.id, d.data()))
        loading.value = false
      },
      (err) => {
        console.error('[useArchivioFilesForVehicle]', err)
        loading.value = false
      },
    )
  }

  watch(vehicleIdRef, (id) => subscribe(id), { immediate: true })
  onUnmounted(() => unsub?.())
  return { files, loading }
}

export function useAllArchivioFiles() {
  const files = ref<NebulaArchivioFile[]>([])
  const loading = ref(true)
  const unsub = onSnapshot(
    query(
      collection(db, 'nebulaArchivio'),
      where('archived', '==', false),
      orderBy('uploadedAt', 'desc'),
    ),
    (snap) => {
      files.value = snap.docs.map(d => mapFile(d.id, d.data()))
      loading.value = false
    },
    (err) => {
      console.error('[useAllArchivioFiles]', err)
      loading.value = false
    },
  )
  onUnmounted(() => unsub())
  return { files, loading }
}
