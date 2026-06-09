import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'
import type { BugTechnicalContext } from '../../types/bugs'

export interface SubmitBugPayload {
  title: string
  description: string
  category: string
  pageUrl: string
  technicalContext: BugTechnicalContext
  source?: 'pops' | 'sidera'
}

export interface SubmitBugResult {
  success: boolean
  bugId: string
  bugNumber: string
}

export function buildTechnicalContext(path: string, userUid: string, appScope = 'pops'): BugTechnicalContext {
  return {
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    timestamp: new Date().toISOString(),
    path,
    userUid,
    platform: navigator.platform,
    appScope,
  }
}

export async function submitBugReport(payload: SubmitBugPayload): Promise<SubmitBugResult> {
  const fn = httpsCallable<SubmitBugPayload, SubmitBugResult>(functions, 'submitBug')
  const res = await fn(payload)
  return res.data
}
