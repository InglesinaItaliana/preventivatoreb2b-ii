import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'

/**
 * Wrappers per le callable OAuth consent (F6).
 *
 * Flow consent UI:
 *  1. fetchAuthRequest(id) → mostra "Claude vuole accesso come …"
 *  2. user clicca Autorizza → approveAuthRequest(id) → redirectUri
 *  3. UI fa window.location = redirectUri (torna a claude.ai con ?code=…)
 */

export interface OAuthAuthRequestInfo {
  authRequestId: string
  clientName: string
  redirectUri: string        // dominio esterno (es. https://claude.ai/...)
  scope: string
  userEmail: string          // l'utente Firebase loggato che sta autorizzando
}

const _get = httpsCallable<{ authRequestId: string }, OAuthAuthRequestInfo>(functions, 'getOAuthAuthRequest')
const _approve = httpsCallable<{ authRequestId: string }, { redirectUri: string }>(functions, 'consentOAuthRequest')

export async function fetchAuthRequest(authRequestId: string): Promise<OAuthAuthRequestInfo> {
  const r = await _get({ authRequestId })
  return r.data
}

export async function approveAuthRequest(authRequestId: string): Promise<string> {
  const r = await _approve({ authRequestId })
  return r.data.redirectUri
}
