"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildYDoc = buildYDoc;
exports.seedYDocFromJSON = seedYDocFromJSON;
exports.ydocToJSON = ydocToJSON;
exports.applyJSONToYDoc = applyJSONToYDoc;
exports.encodeState = encodeState;
exports.encodeStateVector = encodeStateVector;
exports.seedStateBuffers = seedStateBuffers;
exports.extractText = extractText;
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
const Y = __importStar(require("yjs"));
const y_tiptap_1 = require("@tiptap/y-tiptap");
const pmSchema_1 = require("./pmSchema");
/**
 * Meta richiesto da `updateYFragment` di @tiptap/y-tiptap. La libreria ha un
 * `createEmptyMeta()` interno NON esportato: lo replichiamo (shape stabile
 * `{ mapping, isOMark }`). Verificato contro y-tiptap@3.0.4.
 */
function createEmptyMeta() {
    return { mapping: new Map(), isOMark: new Map() };
}
/**
 * Costruisce un Y.Doc applicando lo snapshot compattato (se presente) e poi
 * tutti gli update delta nell'ordine fornito. Gli update Yjs sono commutativi
 * e idempotenti: l'ordine non incide sulla correttezza.
 */
function buildYDoc(snapshot, deltas) {
    const ydoc = new Y.Doc();
    if (snapshot && snapshot.length)
        Y.applyUpdate(ydoc, snapshot);
    for (const d of deltas) {
        if (d && d.length)
            Y.applyUpdate(ydoc, d);
    }
    return ydoc;
}
/** Crea un Y.Doc iniziale da ProseMirror JSON (migrazione / createDoc). */
function seedYDocFromJSON(json) {
    return (0, y_tiptap_1.prosemirrorJSONToYDoc)(pmSchema_1.nebulaSchema, json, pmSchema_1.NEBULA_YJS_FIELD);
}
/** Proietta il Y.Doc a ProseMirror JSON (per `content` / search / MCP read). */
function ydocToJSON(ydoc) {
    return (0, y_tiptap_1.yDocToProsemirrorJSON)(ydoc, pmSchema_1.NEBULA_YJS_FIELD);
}
/**
 * Applica un nuovo stato ProseMirror JSON completo al Y.Doc esistente come
 * diff incrementale minimale (via `updateYFragment`) e ritorna l'update Yjs
 * incrementale da appendere a `yupdates`. I client connessi lo ricevono live
 * e converge con eventuali edit concorrenti.
 *
 * Usato da scritture MCP (append/replace) e restore da history.
 */
function applyJSONToYDoc(ydoc, newJson) {
    const frag = ydoc.getXmlFragment(pmSchema_1.NEBULA_YJS_FIELD);
    const newNode = pmSchema_1.nebulaSchema.nodeFromJSON(newJson);
    const before = Y.encodeStateVector(ydoc);
    Y.transact(ydoc, () => {
        (0, y_tiptap_1.updateYFragment)(ydoc, frag, newNode, createEmptyMeta());
    });
    return Y.encodeStateAsUpdate(ydoc, before);
}
/** Snapshot completo del Y.Doc come update (per `ydocState`). */
function encodeState(ydoc) {
    return Y.encodeStateAsUpdate(ydoc);
}
/** State vector del Y.Doc (per `ydocStateVector` / diff). */
function encodeStateVector(ydoc) {
    return Y.encodeStateVector(ydoc);
}
/**
 * Helper migrazione/createDoc: da JSON a snapshot + state vector pronti per
 * Firestore (come Buffer, il tipo bytes accettato dall'Admin SDK).
 */
function seedStateBuffers(json) {
    const ydoc = seedYDocFromJSON(json);
    return {
        state: Buffer.from(encodeState(ydoc)),
        stateVector: Buffer.from(encodeStateVector(ydoc)),
    };
}
/** Estrae testo flat dal ProseMirror JSON (per `contentText`, cap a maxLen). */
function extractText(json, maxLen = 10000) {
    const parts = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object')
            return;
        const n = node;
        if (n.type === 'text' && typeof n.text === 'string')
            parts.push(n.text);
        if (Array.isArray(n.content))
            n.content.forEach(walk);
        // separatore di blocco leggero per non incollare parole tra paragrafi
        if (n.type && n.type !== 'text' && Array.isArray(n.content))
            parts.push(' ');
    };
    walk(json);
    return parts.join('').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
//# sourceMappingURL=ydoc.js.map