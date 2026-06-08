import type { Timestamp } from 'firebase/firestore'

/** Collegamento denormalizzato file Archivio → entità. */
export type ArchivioLinkKind = 'vehicle' | 'deadline' | 'team'

export interface ArchivioLink {
  kind: ArchivioLinkKind
  id: string
}

export interface NebulaArchivioFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  folderId: string | null
  tags: string[]
  linkedVehicleIds: string[]
  linkedTo: ArchivioLink[]
  uploadedByUid: string
  uploadedAt: Date
  /** Soft-delete file (non confondere con POPS archivio ordini). */
  archived: boolean
}

export interface NebulaArchivioFolder {
  id: string
  name: string
  parentId: string | null
  createdByUid: string
  createdAt: Date
}

export type VehicleType = 'furgone' | 'automobile'
export type VehicleUsage = 'consegne' | 'mobilita' | 'misto'
export type VehicleStatus = 'active' | 'maintenance' | 'retired'

export type DeadlineKind =
  | 'assicurazione'
  | 'bollo'
  | 'revisione'
  | 'tagliando'
  | 'patente'
  | 'altro'

export interface Vehicle {
  id: string
  type: VehicleType
  usage: VehicleUsage
  plate: string
  brand: string
  model: string
  year?: number
  vin?: string
  status: VehicleStatus
  assigneeUid?: string
  km?: number
  notes?: string
  archivioFileIds: string[]
  createdAt: Date
  updatedAt: Date
  createdByUid: string
}

export interface VehicleDeadline {
  id: string
  vehicleId: string
  kind: DeadlineKind
  title?: string
  /** Inizio (data + ora se non all-day). */
  dueDate: Date
  /** Fine opzionale (stesso giorno o range). */
  endAt?: Date
  /** Default true per record legacy senza orario. */
  allDay?: boolean
  completedAt?: Date
  reminderDays?: number[]
  archivioFileIds: string[]
  notes?: string
  createdByUid: string
}

/** True se la scadenza va mostrata come fascia all-day in calendario. */
export function deadlineIsAllDay(d: Pick<VehicleDeadline, 'dueDate' | 'endAt' | 'allDay'>): boolean {
  if (d.allDay === false) return false
  if (d.endAt) return false
  return d.dueDate.getHours() === 0 && d.dueDate.getMinutes() === 0
}

export function tsToDate(v: Timestamp | Date | null | undefined): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  return v.toDate()
}
