import { ref, computed, onUnmounted } from 'vue'
import {
  collection, doc, addDoc, updateDoc, onSnapshot, query, orderBy,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import type {
  Vehicle, VehicleDeadline, VehicleType, VehicleUsage, VehicleStatus, DeadlineKind,
} from '../../types/nebula-fleet'
import { tsToDate } from '../../types/nebula-fleet'

function mapVehicle(id: string, data: Record<string, unknown>): Vehicle {
  return {
    id,
    type: (data.type as VehicleType) ?? 'automobile',
    usage: (data.usage as VehicleUsage) ?? 'mobilita',
    plate: String(data.plate ?? ''),
    brand: String(data.brand ?? ''),
    model: String(data.model ?? ''),
    year: data.year != null ? Number(data.year) : undefined,
    vin: data.vin != null ? String(data.vin) : undefined,
    status: (data.status as VehicleStatus) ?? 'active',
    assigneeUid: data.assigneeUid != null ? String(data.assigneeUid) : undefined,
    km: data.km != null ? Number(data.km) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    archivioFileIds: Array.isArray(data.archivioFileIds) ? data.archivioFileIds.map(String) : [],
    createdAt: tsToDate(data.createdAt as never) ?? new Date(0),
    updatedAt: tsToDate(data.updatedAt as never) ?? new Date(0),
    createdByUid: String(data.createdByUid ?? ''),
  }
}

function mapDeadline(id: string, data: Record<string, unknown>): VehicleDeadline {
  return {
    id,
    vehicleId: String(data.vehicleId ?? ''),
    kind: (data.kind as DeadlineKind) ?? 'altro',
    title: data.title != null ? String(data.title) : undefined,
    dueDate: tsToDate(data.dueDate as never) ?? new Date(0),
    completedAt: tsToDate(data.completedAt as never) ?? undefined,
    reminderDays: Array.isArray(data.reminderDays) ? data.reminderDays.map(Number) : undefined,
    archivioFileIds: Array.isArray(data.archivioFileIds) ? data.archivioFileIds.map(String) : [],
    notes: data.notes != null ? String(data.notes) : undefined,
    createdByUid: String(data.createdByUid ?? ''),
  }
}

export function useVehicles() {
  const vehicles = ref<Vehicle[]>([])
  const loading = ref(true)

  const unsub = onSnapshot(
    query(collection(db, 'vehicles'), orderBy('plate', 'asc')),
    (snap) => {
      vehicles.value = snap.docs.map(d => mapVehicle(d.id, d.data()))
      loading.value = false
    },
    (err) => {
      console.error('[useVehicles]', err)
      loading.value = false
    },
  )
  onUnmounted(() => unsub())

  const activeVehicles = computed(() =>
    vehicles.value.filter(v => v.status === 'active'))

  const deliveryVehicles = computed(() =>
    vehicles.value.filter(v =>
      v.status === 'active' && (v.usage === 'consegne' || v.usage === 'misto')))

  return { vehicles, activeVehicles, deliveryVehicles, loading }
}

export function useVehicleDeadlines() {
  const deadlines = ref<VehicleDeadline[]>([])
  const loading = ref(true)

  const unsub = onSnapshot(
    query(collection(db, 'vehicleDeadlines'), orderBy('dueDate', 'asc')),
    (snap) => {
      deadlines.value = snap.docs.map(d => mapDeadline(d.id, d.data()))
      loading.value = false
    },
    (err) => {
      console.error('[useVehicleDeadlines]', err)
      loading.value = false
    },
  )
  onUnmounted(() => unsub())

  const openDeadlines = computed(() =>
    deadlines.value.filter(d => !d.completedAt))

  return { deadlines, openDeadlines, loading }
}

export async function createVehicle(input: {
  type: VehicleType
  usage: VehicleUsage
  plate: string
  brand: string
  model: string
  year?: number
  vin?: string
  status?: VehicleStatus
  assigneeUid?: string
  km?: number
  notes?: string
}): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non autenticato')
  const ref = await addDoc(collection(db, 'vehicles'), {
    ...input,
    plate: input.plate.trim().toUpperCase(),
    status: input.status ?? 'active',
    archivioFileIds: [],
    createdByUid: uid,
    updatedByUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateVehicle(
  vehicleId: string,
  patch: Partial<Omit<Vehicle, 'id' | 'createdAt' | 'createdByUid'>>,
): Promise<void> {
  const uid = auth.currentUser?.uid
  const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() }
  if (patch.plate) data.plate = patch.plate.trim().toUpperCase()
  if (uid) data.updatedByUid = uid
  await updateDoc(doc(db, 'vehicles', vehicleId), data)
}

export async function createVehicleDeadline(input: {
  vehicleId: string
  kind: DeadlineKind
  title?: string
  dueDate: Date
  reminderDays?: number[]
  notes?: string
}): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non autenticato')
  const ref = await addDoc(collection(db, 'vehicleDeadlines'), {
    vehicleId: input.vehicleId,
    kind: input.kind,
    title: input.title?.trim() || null,
    dueDate: Timestamp.fromDate(input.dueDate),
    completedAt: null,
    reminderDays: input.reminderDays ?? [30, 7],
    archivioFileIds: [],
    notes: input.notes?.trim() || null,
    createdByUid: uid,
  })
  return ref.id
}

export async function updateVehicleDeadline(
  deadlineId: string,
  patch: Partial<Pick<VehicleDeadline, 'kind' | 'title' | 'dueDate' | 'notes' | 'reminderDays'>>,
): Promise<void> {
  const data: Record<string, unknown> = { ...patch }
  if (patch.dueDate) data.dueDate = Timestamp.fromDate(patch.dueDate)
  await updateDoc(doc(db, 'vehicleDeadlines', deadlineId), data)
}

export async function completeVehicleDeadline(deadlineId: string): Promise<void> {
  await updateDoc(doc(db, 'vehicleDeadlines', deadlineId), {
    completedAt: serverTimestamp(),
  })
}

export function deadlineStatus(dueDate: Date, completedAt?: Date): 'ok' | 'warning' | 'overdue' | 'done' {
  if (completedAt) return 'done'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'warning'
  return 'ok'
}

export function vehicleWorstStatus(
  vehicleId: string,
  deadlines: VehicleDeadline[],
): 'ok' | 'warning' | 'overdue' | 'done' | 'none' {
  const mine = deadlines.filter(d => d.vehicleId === vehicleId && !d.completedAt)
  if (!mine.length) return 'none'
  let worst: 'ok' | 'warning' | 'overdue' = 'ok'
  for (const d of mine) {
    const s = deadlineStatus(d.dueDate, d.completedAt)
    if (s === 'overdue') return 'overdue'
    if (s === 'warning') worst = 'warning'
  }
  return worst
}
