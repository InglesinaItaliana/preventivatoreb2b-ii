import { httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { functions } from '../../firebase'
import type { NebulaDocIcon } from './useDoc'

/**
 * useSaveDoc — wrapper tipizzato per la callable `saveDoc`.
 *
 * Tutte le write su `nebulaDocs/{docId}` passano da qui: il client non può
 * scrivere direttamente (rules: `allow write: if false`). Vedi docs/NEBULA-DOCS.md §5.3.
 *
 * Comportamento:
 * - input.docId mancante → CREATE (acl.visibility default 'private', owner = me)
 * - input.docId presente → UPDATE con LWW: baseRevision === current.revision
 *   o errore failed-precondition con payload { currentRevision, currentTitle,
 *   currentContent }
 */

export interface SaveDocInput {
  docId?: string
  title?: string
  icon?: NebulaDocIcon | null
  content?: object               // ProseMirror JSON
  contentText?: string           // testo flat per ricerca (max 10k chars, server tronca)
  parentId?: string | null
  /** Required per UPDATE. La server function rifiuta se baseRevision !== current.revision. */
  baseRevision?: number
  /** Default 'autosave'. 'manual'/'mcp' fanno scattare lo snapshot in history. */
  trigger?: 'autosave' | 'manual' | 'mcp'
}

export interface SaveDocOutput {
  docId: string
  revision: number
}

export interface SaveDocConflictDetails {
  currentRevision: number
  currentTitle: string
  currentContent: object
}

const saveDocCallable = httpsCallable<SaveDocInput, SaveDocOutput>(functions, 'saveDoc')

export async function saveDoc(input: SaveDocInput): Promise<SaveDocOutput> {
  const res: HttpsCallableResult<SaveDocOutput> = await saveDocCallable(input)
  return res.data
}

/**
 * Type guard sull'errore di conflitto LWW. Il caller può prendere `details`
 * dal lancio HttpsError e mostrare il dialog "Marco ha salvato mentre tu...".
 */
export function isSaveDocConflict(err: unknown): err is {
  code: string
  details: SaveDocConflictDetails
} {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 'functions/failed-precondition' &&
    'details' in err &&
    typeof (err as { details?: { currentRevision?: unknown } }).details?.currentRevision === 'number'
  )
}
