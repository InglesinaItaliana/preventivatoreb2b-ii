import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'

/**
 * Wrapper tipizzato per archiveNebulaDoc / unarchiveNebulaDoc (F5b-C1).
 *
 * Soft delete: il doc resta in Firestore con archived=true + archivedAt
 * server timestamp. trashPurge function (futura) farà hard delete dopo
 * 90gg (decisione §12 #5 spec).
 *
 * Solo owner può chiamare (server-side check).
 */

const _archive = httpsCallable<{ docId: string }, { docId: string; archived: true }>(functions, 'archiveNebulaDoc')
const _unarchive = httpsCallable<{ docId: string }, { docId: string; archived: false }>(functions, 'unarchiveNebulaDoc')

export async function archiveDoc(docId: string): Promise<void> {
  await _archive({ docId })
}

export async function unarchiveDoc(docId: string): Promise<void> {
  await _unarchive({ docId })
}
