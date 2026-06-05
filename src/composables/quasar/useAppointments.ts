/**
 * useAppointments — CRUD degli appuntamenti del calendario EPHEMERIS (B3).
 *
 * Un appuntamento È una task `type:'appointment'` standalone in `tasks/` (nessun
 * progetto), con orario (startAt/endAt) e luogo/note. Escluso da Smistamento/Azioni
 * (filtrano `type==='task'`). assignees = partecipanti (UID). Le rules `tasks`:
 * create richiede createdBy==uid; update/delete = own-or-admin (assegnatario uid o
 * creatore). Vedi docs/STELLA-GRAFO + project memory calendario.
 */
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../firebase'
import type { AppointmentLink } from '../sidera/useAllTasks'

export interface AppointmentInput {
  title: string
  startAt: Date
  endAt: Date | null
  assignees: string[]   // uid
  location?: string
  notes?: string
  links?: AppointmentLink[]
}

export async function createAppointment(data: AppointmentInput): Promise<string> {
  const ref = await addDoc(collection(db, 'tasks'), {
    title:           data.title,
    type:            'appointment',
    status:          'todo',
    priority:        'media',
    startAt:         data.startAt,
    endAt:           data.endAt ?? null,
    dueDate:         null,
    assignees:       data.assignees,
    location:        data.location ?? '',
    notes:           data.notes ?? '',
    links:           data.links ?? [],
    projectId:       null,
    deliverableTaskIds: [],
    milestoneId:     null,
    triaged:         true,   // non passa dallo smistamento
    createdBy:       auth.currentUser?.uid ?? '',
    createdByEmail:  auth.currentUser?.email ?? '',
    createdAt:       serverTimestamp(),
    completedAt:     null,
    completedBy:     null,
  })
  return ref.id
}

export async function updateAppointment(id: string, data: Partial<AppointmentInput>): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (data.title !== undefined)     payload.title = data.title
  if (data.startAt !== undefined)   payload.startAt = data.startAt
  if (data.endAt !== undefined)     payload.endAt = data.endAt
  if (data.assignees !== undefined) payload.assignees = data.assignees
  if (data.location !== undefined)  payload.location = data.location
  if (data.notes !== undefined)     payload.notes = data.notes
  if (data.links !== undefined)     payload.links = data.links
  await updateDoc(doc(db, 'tasks', id), payload)
}

export async function deleteAppointment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'tasks', id))
}
