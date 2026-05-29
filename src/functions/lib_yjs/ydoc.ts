/**
 * NEBULA-DOCS — Helper Yjs server-side (Fase 6, Yjs/CRDT).
 *
 * Operazioni headless sul Y.Doc condivise da: migrazione (`initYDoc`),
 * scritture MCP (append/replace/restore), compaction + proiezione.
 *
 * Tutto passa per lo schema condiviso (`nebulaSchema`) e il fragment
 * `NEBULA_YJS_FIELD` — vedi pmSchema.ts per il perché del nome 'default'.
 *
 * Encoding Firestore: i Uint8Array Yjs viaggiano come `Bytes` (Blob nativo),
 * non base64. Lato Admin SDK usare `admin.firestore.Bytes.fromUint8Array` /
 * `bytes.toUint8Array()`.
 */
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON, updateYFragment } from '@tiptap/y-tiptap'
import { nebulaSchema, NEBULA_YJS_FIELD } from './pmSchema'

/** ProseMirror JSON doc (forma libera: validato dallo schema all'uso). */
export type PMDoc = { type: 'doc'; content?: unknown[] }

/**
 * Meta richiesto da `updateYFragment` di @tiptap/y-tiptap. La libreria ha un
 * `createEmptyMeta()` interno NON esportato: lo replichiamo (shape stabile
 * `{ mapping, isOMark }`). Verificato contro y-tiptap@3.0.4.
 */
function createEmptyMeta(): { mapping: Map<unknown, unknown>; isOMark: Map<unknown, unknown> } {
  return { mapping: new Map(), isOMark: new Map() }
}

/**
 * Costruisce un Y.Doc applicando lo snapshot compattato (se presente) e poi
 * tutti gli update delta nell'ordine fornito. Gli update Yjs sono commutativi
 * e idempotenti: l'ordine non incide sulla correttezza.
 */
export function buildYDoc(snapshot: Uint8Array | null, deltas: Uint8Array[]): Y.Doc {
  const ydoc = new Y.Doc()
  if (snapshot && snapshot.length) Y.applyUpdate(ydoc, snapshot)
  for (const d of deltas) {
    if (d && d.length) Y.applyUpdate(ydoc, d)
  }
  return ydoc
}

/** Crea un Y.Doc iniziale da ProseMirror JSON (migrazione / createDoc). */
export function seedYDocFromJSON(json: PMDoc): Y.Doc {
  return prosemirrorJSONToYDoc(nebulaSchema, json as object, NEBULA_YJS_FIELD)
}

/** Proietta il Y.Doc a ProseMirror JSON (per `content` / search / MCP read). */
export function ydocToJSON(ydoc: Y.Doc): PMDoc {
  return yDocToProsemirrorJSON(ydoc, NEBULA_YJS_FIELD) as PMDoc
}

/**
 * Applica un nuovo stato ProseMirror JSON completo al Y.Doc esistente come
 * diff incrementale minimale (via `updateYFragment`) e ritorna l'update Yjs
 * incrementale da appendere a `yupdates`. I client connessi lo ricevono live
 * e converge con eventuali edit concorrenti.
 *
 * Usato da scritture MCP (append/replace) e restore da history.
 */
export function applyJSONToYDoc(ydoc: Y.Doc, newJson: PMDoc): Uint8Array {
  const frag = ydoc.getXmlFragment(NEBULA_YJS_FIELD)
  const newNode = nebulaSchema.nodeFromJSON(newJson as object)
  const before = Y.encodeStateVector(ydoc)
  Y.transact(ydoc, () => {
    updateYFragment(ydoc, frag, newNode, createEmptyMeta() as never)
  })
  return Y.encodeStateAsUpdate(ydoc, before)
}

/** Snapshot completo del Y.Doc come update (per `ydocState`). */
export function encodeState(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(ydoc)
}

/** State vector del Y.Doc (per `ydocStateVector` / diff). */
export function encodeStateVector(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(ydoc)
}

/**
 * Helper migrazione/createDoc: da JSON a snapshot + state vector pronti per
 * Firestore (come Buffer, il tipo bytes accettato dall'Admin SDK).
 */
export function seedStateBuffers(json: PMDoc): { state: Buffer; stateVector: Buffer } {
  const ydoc = seedYDocFromJSON(json)
  return {
    state: Buffer.from(encodeState(ydoc)),
    stateVector: Buffer.from(encodeStateVector(ydoc)),
  }
}

/** Estrae testo flat dal ProseMirror JSON (per `contentText`, cap a maxLen). */
export function extractText(json: PMDoc, maxLen = 10_000): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; content?: unknown[] }
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.content)) n.content.forEach(walk)
    // separatore di blocco leggero per non incollare parole tra paragrafi
    if (n.type && n.type !== 'text' && Array.isArray(n.content)) parts.push(' ')
  }
  walk(json)
  return parts.join('').replace(/\s+/g, ' ').trim().slice(0, maxLen)
}
