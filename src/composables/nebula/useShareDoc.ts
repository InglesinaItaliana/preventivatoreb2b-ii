import { httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { functions } from '../../firebase'
import type { NebulaDocAcl } from './useDoc'

/**
 * useShareDoc — wrapper tipizzato per la callable `shareDoc` (F3-C2.5).
 *
 * Solo gli owner del doc possono modificare ACL. La callable verifica
 * server-side. Permission-denied per non-owner.
 */

export interface ShareDocInput {
  docId: string
  visibility?: 'private' | 'team' | 'public'
  writers?: string[]            // lista email (lowercase, server normalizza)
}

export interface ShareDocOutput {
  docId: string
  acl: NebulaDocAcl
}

const callable = httpsCallable<ShareDocInput, ShareDocOutput>(functions, 'shareDoc')

export async function shareDoc(input: ShareDocInput): Promise<ShareDocOutput> {
  const res: HttpsCallableResult<ShareDocOutput> = await callable(input)
  return res.data
}
