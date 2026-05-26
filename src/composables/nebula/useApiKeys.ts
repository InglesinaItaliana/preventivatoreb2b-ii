import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'

/**
 * Wrapper tipizzato per i callable F4-C2 di gestione API keys NEBULA-DOCS.
 *
 * Il `plainKey` ritornato da generate è la chiave intera in chiaro —
 * va mostrata UNA SOLA VOLTA all'utente perché il server non la memorizza
 * (solo hash). Dopo aver chiuso il dialog, la chiave non è più recuperabile.
 */

export interface ApiKeyInfo {
  id: string
  prefix: string
  label: string
  createdAt: number | null      // millis
  lastUsedAt: number | null
  revoked: boolean
  revokedAt: number | null
}

export interface GenerateOutput {
  id: string
  prefix: string
  plainKey: string              // visibile una sola volta
  label: string
}

const _generate = httpsCallable<{ label?: string }, GenerateOutput>(functions, 'generateNebulaApiKey')
const _revoke = httpsCallable<{ id: string }, { id: string; revoked: true }>(functions, 'revokeNebulaApiKey')
const _list = httpsCallable<unknown, { keys: ApiKeyInfo[] }>(functions, 'listNebulaApiKeys')

export async function generateApiKey(label?: string): Promise<GenerateOutput> {
  const r = await _generate({ label: label ?? '' })
  return r.data
}

export async function revokeApiKey(id: string): Promise<void> {
  await _revoke({ id })
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const r = await _list({})
  return r.data.keys
}
