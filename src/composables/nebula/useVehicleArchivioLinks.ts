import { doc, getDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '../../firebase'
import type { ArchivioLink } from '../../types/nebula-fleet'

/**
 * Collega un file Archivio a un mezzo (e opzionalmente a una scadenza).
 * Aggiorna in batch linkedVehicleIds, linkedTo, vehicle.archivioFileIds.
 */
export async function linkArchivioToVehicle(
  fileId: string,
  vehicleId: string,
  deadlineId?: string,
): Promise<void> {
  const batch = writeBatch(db)
  const fileRef = doc(db, 'nebulaArchivio', fileId)
  const vehicleRef = doc(db, 'vehicles', vehicleId)

  const link: ArchivioLink = { kind: 'vehicle', id: vehicleId }
  const filePatch: Record<string, unknown> = {
    linkedVehicleIds: arrayUnion(vehicleId),
    linkedTo: deadlineId
      ? arrayUnion(link, { kind: 'deadline', id: deadlineId } as ArchivioLink)
      : arrayUnion(link),
  }
  batch.update(fileRef, filePatch)
  batch.update(vehicleRef, { archivioFileIds: arrayUnion(fileId) })

  if (deadlineId) {
    batch.update(doc(db, 'vehicleDeadlines', deadlineId), {
      archivioFileIds: arrayUnion(fileId),
    })
  }

  await batch.commit()
}

export async function unlinkArchivioFromVehicle(
  fileId: string,
  vehicleId: string,
): Promise<void> {
  const fileSnap = await getDoc(doc(db, 'nebulaArchivio', fileId))
  if (!fileSnap.exists()) return
  const data = fileSnap.data()
  const linkedTo = (Array.isArray(data.linkedTo) ? data.linkedTo : []) as ArchivioLink[]
  const remainingLinks = linkedTo.filter(
    l => !(l.kind === 'vehicle' && l.id === vehicleId),
  )

  const batch = writeBatch(db)
  batch.update(doc(db, 'nebulaArchivio', fileId), {
    linkedVehicleIds: arrayRemove(vehicleId),
    linkedTo: remainingLinks,
  })
  batch.update(doc(db, 'vehicles', vehicleId), {
    archivioFileIds: arrayRemove(fileId),
  })
  await batch.commit()
}

/** Upload + link in un passo (admin dalla scheda mezzo). */
export async function uploadAndLinkToVehicle(
  file: File,
  vehicleId: string,
  uploadFn: (f: File, folderId: string | null) => Promise<string>,
): Promise<string> {
  const fileId = await uploadFn(file, null)
  await linkArchivioToVehicle(fileId, vehicleId)
  return fileId
}
