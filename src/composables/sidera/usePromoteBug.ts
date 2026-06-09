import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'

export async function promoteBugToTask(bugId: string): Promise<{ taskId: string }> {
  const fn = httpsCallable<{ bugId: string }, { success: boolean; taskId: string }>(functions, 'promoteBugToTask')
  const res = await fn({ bugId })
  return { taskId: res.data.taskId }
}

export async function updateBugFields(
  bugId: string,
  fields: {
    status?: string
    priority?: string
    category?: string
    internalNotes?: string
    assigneeUid?: string | null
  },
): Promise<void> {
  const fn = httpsCallable(functions, 'updateBug')
  await fn({ bugId, ...fields })
}
