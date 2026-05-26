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
exports.whoami = whoami;
exports.search = search;
exports.getDoc = getDoc;
exports.listDocs = listDocs;
exports.createDoc = createDoc;
exports.appendBlock = appendBlock;
exports.replaceSection = replaceSection;
exports.linkTask = linkTask;
exports.linkProject = linkProject;
/**
 * MCP tools NEBULA-DOCS (F4-C3) — 8 tool implementations.
 *
 * Tutti i tool ricevono userEmail come argument (dall'auth middleware) e
 * applicano ACL check appropriato (read = readerOk; write = writers/owners).
 *
 * Writes vanno tramite saveDocCore che mantiene revision check + history
 * snapshot (trigger='mcp' → snapshot creato).
 */
const admin = __importStar(require("firebase-admin"));
const markdown_1 = require("../lib_md/markdown");
// ─────────────────────────────────────────────────────────────────────────────
// ACL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function canRead(acl, userEmail) {
    return acl.visibility === 'public'
        || (acl.visibility === 'team' && !!userEmail)
        || acl.readers.includes(userEmail)
        || acl.writers.includes(userEmail)
        || acl.owners.includes(userEmail);
}
function canWrite(acl, userEmail) {
    return acl.writers.includes(userEmail) || acl.owners.includes(userEmail);
}
async function saveDocCore(input, userEmail) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    // CREATE
    if (!input.docId) {
        const newRef = db.collection('nebulaDocs').doc();
        const title = (_a = input.title) !== null && _a !== void 0 ? _a : 'Nuovo documento';
        const content = (_b = input.content) !== null && _b !== void 0 ? _b : { type: 'doc', content: [] };
        const contentText = (0, markdown_1.extractText)(content).slice(0, 10000);
        const acl = {
            visibility: 'private',
            readers: [],
            writers: [],
            owners: [userEmail],
        };
        await newRef.set({
            title,
            icon: null,
            content,
            contentText,
            parentId: (_c = input.parentId) !== null && _c !== void 0 ? _c : null,
            order: 0,
            depth: 0,
            refs: { tasks: [], projects: [], deliverables: [], docs: [], users: [] },
            archived: false,
            archivedAt: null,
            revision: 1,
            createdAt: now,
            createdBy: userEmail,
            updatedAt: now,
            updatedBy: userEmail,
            acl,
        });
        await newRef.collection('history').add({
            revision: 1, title, content, savedAt: now, savedBy: userEmail, trigger: 'mcp',
        });
        return { docId: newRef.id, revision: 1, title };
    }
    // UPDATE
    const ref = db.collection('nebulaDocs').doc(input.docId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new Error(`Documento ${input.docId} non trovato`);
    const current = snap.data();
    if (!canWrite(current.acl, userEmail)) {
        throw new Error('Permesso di scrittura negato sul documento');
    }
    const baseRev = (_d = input.baseRevision) !== null && _d !== void 0 ? _d : current.revision;
    if (baseRev !== current.revision) {
        throw new Error(`Conflitto revisione (corrente ${current.revision}, ricevuta ${baseRev})`);
    }
    const nextRev = current.revision + 1;
    const update = {
        revision: nextRev,
        updatedAt: now,
        updatedBy: userEmail,
    };
    let nextTitle = current.title;
    let nextContent;
    if (input.title !== undefined) {
        update.title = input.title;
        nextTitle = input.title;
    }
    if (input.content !== undefined) {
        update.content = input.content;
        update.contentText = (0, markdown_1.extractText)(input.content).slice(0, 10000);
        nextContent = input.content;
    }
    if (input.parentId !== undefined)
        update.parentId = input.parentId;
    await ref.update(update);
    // History snapshot SEMPRE per trigger 'mcp' (audit + restore)
    await ref.collection('history').add({
        revision: nextRev,
        title: nextTitle,
        content: nextContent !== null && nextContent !== void 0 ? nextContent : snap.data().content,
        savedAt: now,
        savedBy: userEmail,
        trigger: 'mcp',
    });
    return { docId: input.docId, revision: nextRev, title: nextTitle };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: whoami (diagnostico)
// ─────────────────────────────────────────────────────────────────────────────
async function whoami(_args, ctx) {
    const db = admin.firestore();
    const [owned, written, read, team] = await Promise.all([
        db.collection('nebulaDocs').where('acl.owners', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.writers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.readers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.visibility', '==', 'team').get(),
    ]);
    return {
        text: `Identificato come **${ctx.userEmail}**.\n\nVisibilità doc:\n- owner di **${owned.size}** doc\n- writer su **${written.size}** doc\n- reader su **${read.size}** doc\n- doc con visibility=team: **${team.size}**`,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: search
// ─────────────────────────────────────────────────────────────────────────────
async function search(args, ctx) {
    var _a, _b, _c, _d, _e, _f, _g;
    const query = ((_a = args.query) !== null && _a !== void 0 ? _a : '').trim().toLowerCase();
    if (!query) {
        return { text: 'Specifica un termine di ricerca.' };
    }
    const limit = Math.min(50, Math.max(1, (_b = args.limit) !== null && _b !== void 0 ? _b : 10));
    const db = admin.firestore();
    // Per coverage massimo, fetchiamo da 4 sub paralleli (owners/writers/readers/team),
    // dedup + filter per query lato server.
    const [owned, written, read, team] = await Promise.all([
        db.collection('nebulaDocs').where('acl.owners', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.writers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.readers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.visibility', '==', 'team').get(),
    ]);
    const seen = new Set();
    const candidates = [];
    for (const snap of [owned, written, read, team]) {
        for (const d of snap.docs) {
            if (seen.has(d.id))
                continue;
            seen.add(d.id);
            const data = d.data();
            candidates.push({
                id: d.id,
                title: (_c = data.title) !== null && _c !== void 0 ? _c : '',
                contentText: (_d = data.contentText) !== null && _d !== void 0 ? _d : '',
                updatedAt: (_g = (_f = (_e = data.updatedAt) === null || _e === void 0 ? void 0 : _e.toMillis) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : 0,
            });
        }
    }
    // Filter substring match (title o contentText)
    const matches = candidates
        .filter(c => c.title.toLowerCase().includes(query) || c.contentText.toLowerCase().includes(query))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    if (matches.length === 0) {
        return { text: `Nessun documento trovato per "${args.query}".` };
    }
    const lines = matches.map(m => {
        const snippet = extractSnippet(m.contentText, query, 120);
        return `- **${m.title}** (\`${m.id}\`)\n  ${snippet}`;
    });
    return { text: `Trovati ${matches.length} documenti:\n\n${lines.join('\n\n')}` };
}
function extractSnippet(text, query, len) {
    if (!text)
        return '_(senza contenuto)_';
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx < 0)
        return text.slice(0, len).trim() + (text.length > len ? '…' : '');
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + len - 40);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    return snippet;
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: getDoc
// ─────────────────────────────────────────────────────────────────────────────
async function getDoc(args, ctx) {
    var _a;
    if (!args.docId)
        throw new Error('docId richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists)
        throw new Error(`Documento ${args.docId} non trovato`);
    const data = snap.data();
    if (!canRead(data.acl, ctx.userEmail)) {
        throw new Error('Permesso di lettura negato');
    }
    const format = (_a = args.format) !== null && _a !== void 0 ? _a : 'markdown';
    if (format === 'prosemirror') {
        return { text: '```json\n' + JSON.stringify(data.content, null, 2) + '\n```' };
    }
    const md = (0, markdown_1.proseMirrorToMarkdown)(data.content);
    return { text: `# ${data.title}\n\n${md}\n\n---\n_docId: \`${args.docId}\` · rev ${data.revision}_` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: listDocs
// ─────────────────────────────────────────────────────────────────────────────
async function listDocs(args, ctx) {
    var _a, _b, _c, _d, _e, _f;
    const limit = Math.min(50, Math.max(1, (_a = args.limit) !== null && _a !== void 0 ? _a : 20));
    const db = admin.firestore();
    // Stessa strategia di search: 4 sub paralleli + dedup. Se parentId fornito, filtra.
    const [owned, written, read, team] = await Promise.all([
        db.collection('nebulaDocs').where('acl.owners', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.writers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.readers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.visibility', '==', 'team').get(),
    ]);
    const seen = new Set();
    const docs = [];
    for (const snap of [owned, written, read, team]) {
        for (const d of snap.docs) {
            if (seen.has(d.id))
                continue;
            seen.add(d.id);
            const data = d.data();
            if (args.parentId !== undefined && data.parentId !== args.parentId)
                continue;
            docs.push({
                id: d.id,
                title: (_b = data.title) !== null && _b !== void 0 ? _b : '(senza titolo)',
                updatedAt: (_e = (_d = (_c = data.updatedAt) === null || _c === void 0 ? void 0 : _c.toMillis) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : 0,
                parentId: (_f = data.parentId) !== null && _f !== void 0 ? _f : null,
            });
        }
    }
    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    const list = docs.slice(0, limit);
    if (list.length === 0) {
        return { text: 'Nessun documento accessibile.' };
    }
    const lines = list.map(d => `- **${d.title}** (\`${d.id}\`) — aggiornato ${new Date(d.updatedAt).toLocaleString('it-IT')}`);
    return { text: `${list.length} documenti${docs.length > limit ? ` (di ${docs.length})` : ''}:\n\n${lines.join('\n')}` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: createDoc
// ─────────────────────────────────────────────────────────────────────────────
async function createDoc(args, ctx) {
    var _a;
    if (!args.title || typeof args.title !== 'string')
        throw new Error('title richiesto');
    const pmContent = args.content ? (0, markdown_1.markdownToProseMirror)(args.content) : { type: 'doc', content: [] };
    const out = await saveDocCore({
        title: args.title,
        content: pmContent,
        parentId: (_a = args.parentId) !== null && _a !== void 0 ? _a : null,
    }, ctx.userEmail);
    // Set icon se fornita (post-create per non duplicare saveDocCore)
    if (args.icon) {
        const ref = admin.firestore().collection('nebulaDocs').doc(out.docId);
        await ref.update({ icon: args.icon });
    }
    return {
        text: `Documento creato: **${out.title}** (\`${out.docId}\`, rev ${out.revision}).\nURL: https://preventivatoreb2b-ii.web.app/nebula/docs/${out.docId}`,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: appendBlock
// ─────────────────────────────────────────────────────────────────────────────
async function appendBlock(args, ctx) {
    var _a, _b, _c;
    if (!args.docId)
        throw new Error('docId richiesto');
    if (!args.markdown)
        throw new Error('markdown richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists)
        throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data();
    if (!canWrite(current.acl, ctx.userEmail))
        throw new Error('Permesso di scrittura negato');
    const newBlocks = (0, markdown_1.markdownToProseMirror)(args.markdown);
    const merged = {
        type: 'doc',
        content: [
            ...((_b = (_a = current.content) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : []),
            ...((_c = newBlocks.content) !== null && _c !== void 0 ? _c : []),
        ],
    };
    const out = await saveDocCore({
        docId: args.docId,
        content: merged,
        baseRevision: current.revision,
    }, ctx.userEmail);
    return { text: `Blocchi aggiunti a **${out.title}** (rev ${out.revision}).` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: replaceSection
// ─────────────────────────────────────────────────────────────────────────────
async function replaceSection(args, ctx) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!args.docId)
        throw new Error('docId richiesto');
    if (!args.sectionAnchor)
        throw new Error('sectionAnchor richiesto');
    if (args.markdown === undefined)
        throw new Error('markdown richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists)
        throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data();
    if (!canWrite(current.acl, ctx.userEmail))
        throw new Error('Permesso di scrittura negato');
    const anchor = args.sectionAnchor.toLowerCase().trim();
    const blocks = (_b = (_a = current.content) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : [];
    // Trova heading che match
    let startIdx = -1;
    let level = 0;
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type === 'heading') {
            const headingText = (0, markdown_1.extractText)({ type: 'doc', content: [b] }).toLowerCase().trim();
            if (headingText === anchor || headingText.includes(anchor)) {
                startIdx = i;
                level = Number((_d = (_c = b.attrs) === null || _c === void 0 ? void 0 : _c.level) !== null && _d !== void 0 ? _d : 1);
                break;
            }
        }
    }
    if (startIdx < 0) {
        // Anchor non trovata → append in fondo come nuova sezione
        return appendBlock({
            docId: args.docId,
            markdown: `## ${args.sectionAnchor}\n\n${args.markdown}`,
        }, ctx);
    }
    // Trova fine sezione: next heading di level <= current
    let endIdx = blocks.length;
    for (let i = startIdx + 1; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type === 'heading' && Number((_f = (_e = b.attrs) === null || _e === void 0 ? void 0 : _e.level) !== null && _f !== void 0 ? _f : 1) <= level) {
            endIdx = i;
            break;
        }
    }
    const newSection = (0, markdown_1.markdownToProseMirror)(args.markdown);
    const merged = {
        type: 'doc',
        content: [
            ...blocks.slice(0, startIdx),
            ...((_g = newSection.content) !== null && _g !== void 0 ? _g : []),
            ...blocks.slice(endIdx),
        ],
    };
    const out = await saveDocCore({
        docId: args.docId,
        content: merged,
        baseRevision: current.revision,
    }, ctx.userEmail);
    return { text: `Sezione "${args.sectionAnchor}" sostituita in **${out.title}** (rev ${out.revision}).` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: linkTask
// ─────────────────────────────────────────────────────────────────────────────
async function linkTask(args, ctx) {
    var _a, _b, _c;
    if (!args.docId)
        throw new Error('docId richiesto');
    if (!args.taskId)
        throw new Error('taskId richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists)
        throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data();
    if (!canWrite(current.acl, ctx.userEmail))
        throw new Error('Permesso di scrittura negato');
    const taskParagraph = {
        type: 'paragraph',
        content: [
            { type: 'taskMention', attrs: { taskId: args.taskId, projectId: (_a = args.projectId) !== null && _a !== void 0 ? _a : null } },
            { type: 'text', text: ' ' },
        ],
    };
    const merged = {
        type: 'doc',
        content: [
            ...((_c = (_b = current.content) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : []),
            taskParagraph,
        ],
    };
    const out = await saveDocCore({
        docId: args.docId, content: merged, baseRevision: current.revision,
    }, ctx.userEmail);
    return { text: `Task \`${args.taskId}\` collegato a **${out.title}** (rev ${out.revision}).` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL: linkProject
// ─────────────────────────────────────────────────────────────────────────────
async function linkProject(args, ctx) {
    var _a, _b;
    if (!args.docId)
        throw new Error('docId richiesto');
    if (!args.projectId)
        throw new Error('projectId richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists)
        throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data();
    if (!canWrite(current.acl, ctx.userEmail))
        throw new Error('Permesso di scrittura negato');
    const projectParagraph = {
        type: 'paragraph',
        content: [
            { type: 'projectMention', attrs: { projectId: args.projectId } },
            { type: 'text', text: ' ' },
        ],
    };
    const merged = {
        type: 'doc',
        content: [
            ...((_b = (_a = current.content) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : []),
            projectParagraph,
        ],
    };
    const out = await saveDocCore({
        docId: args.docId, content: merged, baseRevision: current.revision,
    }, ctx.userEmail);
    return { text: `Progetto \`${args.projectId}\` collegato a **${out.title}** (rev ${out.revision}).` };
}
//# sourceMappingURL=tools.js.map