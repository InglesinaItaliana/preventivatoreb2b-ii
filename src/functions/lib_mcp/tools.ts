/**
 * MCP tools NEBULA-DOCS (F4-C3) — 8 tool implementations.
 *
 * Tutti i tool ricevono userEmail come argument (dall'auth middleware) e
 * applicano ACL check appropriato (read = readerOk; write = writers/owners).
 *
 * Writes vanno tramite saveDocCore che mantiene revision check + history
 * snapshot (trigger='mcp' → snapshot creato).
 */
import * as admin from 'firebase-admin';
import { markdownToProseMirror, proseMirrorToMarkdown, extractText, type PMNode } from '../lib_md/markdown';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface NebulaDocAcl {
    visibility: 'private' | 'team' | 'public';
    readers: string[];
    writers: string[];
    owners: string[];
}

export interface ToolContext {
    userEmail: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function canRead(acl: NebulaDocAcl, userEmail: string): boolean {
    return acl.visibility === 'public'
        || (acl.visibility === 'team' && !!userEmail)
        || acl.readers.includes(userEmail)
        || acl.writers.includes(userEmail)
        || acl.owners.includes(userEmail);
}

function canWrite(acl: NebulaDocAcl, userEmail: string): boolean {
    return acl.writers.includes(userEmail) || acl.owners.includes(userEmail);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE CORE (riusato da createDoc, appendBlock, replaceSection, linkTask, linkProject)
// Riproduce la logica di saveDoc callable ma diretta lato server (no Bearer auth,
// userEmail viene da MCP context). Mantiene LWW + history snapshot trigger='mcp'.
// ─────────────────────────────────────────────────────────────────────────────

interface SaveCoreInput {
    docId?: string;
    title?: string;
    content?: PMNode;
    baseRevision?: number;
    parentId?: string | null;
}

interface SaveCoreOutput {
    docId: string;
    revision: number;
    title: string;
}

async function saveDocCore(input: SaveCoreInput, userEmail: string): Promise<SaveCoreOutput> {
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // CREATE
    if (!input.docId) {
        const newRef = db.collection('nebulaDocs').doc();
        const title = input.title ?? 'Nuovo documento';
        const content = input.content ?? { type: 'doc', content: [] };
        const contentText = extractText(content).slice(0, 10_000);
        const acl: NebulaDocAcl = {
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
            parentId: input.parentId ?? null,
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
    if (!snap.exists) throw new Error(`Documento ${input.docId} non trovato`);
    const current = snap.data() as { acl: NebulaDocAcl; revision: number; title: string };

    if (!canWrite(current.acl, userEmail)) {
        throw new Error('Permesso di scrittura negato sul documento');
    }
    const baseRev = input.baseRevision ?? current.revision;
    if (baseRev !== current.revision) {
        throw new Error(`Conflitto revisione (corrente ${current.revision}, ricevuta ${baseRev})`);
    }

    const nextRev = current.revision + 1;
    const update: Record<string, unknown> = {
        revision: nextRev,
        updatedAt: now,
        updatedBy: userEmail,
    };
    let nextTitle = current.title;
    let nextContent: PMNode | undefined;
    if (input.title !== undefined) { update.title = input.title; nextTitle = input.title; }
    if (input.content !== undefined) {
        update.content = input.content;
        update.contentText = extractText(input.content).slice(0, 10_000);
        nextContent = input.content;
    }
    if (input.parentId !== undefined) update.parentId = input.parentId;

    await ref.update(update);

    // History snapshot SEMPRE per trigger 'mcp' (audit + restore)
    await ref.collection('history').add({
        revision: nextRev,
        title: nextTitle,
        content: nextContent ?? (snap.data() as { content?: PMNode }).content,
        savedAt: now,
        savedBy: userEmail,
        trigger: 'mcp',
    });

    return { docId: input.docId, revision: nextRev, title: nextTitle };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: search
// ─────────────────────────────────────────────────────────────────────────────

export async function search(args: { query?: string; limit?: number }, ctx: ToolContext) {
    const query = (args.query ?? '').trim().toLowerCase();
    if (!query) {
        return { text: 'Specifica un termine di ricerca.' };
    }
    const limit = Math.min(50, Math.max(1, args.limit ?? 10));
    const db = admin.firestore();

    // Per coverage massimo, fetchiamo da 4 sub paralleli (owners/writers/readers/team),
    // dedup + filter per query lato server.
    const [owned, written, read, team] = await Promise.all([
        db.collection('nebulaDocs').where('acl.owners', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.writers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.readers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.visibility', '==', 'team').get(),
    ]);

    const seen = new Set<string>();
    const candidates: Array<{ id: string; title: string; contentText: string; updatedAt: number }> = [];
    for (const snap of [owned, written, read, team]) {
        for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            const data = d.data() as { title?: string; contentText?: string; updatedAt?: admin.firestore.Timestamp };
            candidates.push({
                id: d.id,
                title: data.title ?? '',
                contentText: data.contentText ?? '',
                updatedAt: data.updatedAt?.toMillis?.() ?? 0,
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

function extractSnippet(text: string, query: string, len: number): string {
    if (!text) return '_(senza contenuto)_';
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx < 0) return text.slice(0, len).trim() + (text.length > len ? '…' : '');
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + len - 40);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    return snippet;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: getDoc
// ─────────────────────────────────────────────────────────────────────────────

export async function getDoc(args: { docId: string; format?: 'markdown' | 'prosemirror' }, ctx: ToolContext) {
    if (!args.docId) throw new Error('docId richiesto');
    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists) throw new Error(`Documento ${args.docId} non trovato`);
    const data = snap.data() as { title: string; content: PMNode; acl: NebulaDocAcl; revision: number };

    if (!canRead(data.acl, ctx.userEmail)) {
        throw new Error('Permesso di lettura negato');
    }

    const format = args.format ?? 'markdown';
    if (format === 'prosemirror') {
        return { text: '```json\n' + JSON.stringify(data.content, null, 2) + '\n```' };
    }
    const md = proseMirrorToMarkdown(data.content);
    return { text: `# ${data.title}\n\n${md}\n\n---\n_docId: \`${args.docId}\` · rev ${data.revision}_` };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: listDocs
// ─────────────────────────────────────────────────────────────────────────────

export async function listDocs(args: { parentId?: string | null; limit?: number }, ctx: ToolContext) {
    const limit = Math.min(50, Math.max(1, args.limit ?? 20));
    const db = admin.firestore();

    // Stessa strategia di search: 4 sub paralleli + dedup. Se parentId fornito, filtra.
    const [owned, written, read, team] = await Promise.all([
        db.collection('nebulaDocs').where('acl.owners', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.writers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.readers', 'array-contains', ctx.userEmail).get(),
        db.collection('nebulaDocs').where('acl.visibility', '==', 'team').get(),
    ]);

    const seen = new Set<string>();
    const docs: Array<{ id: string; title: string; updatedAt: number; parentId: string | null }> = [];
    for (const snap of [owned, written, read, team]) {
        for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            const data = d.data() as { title?: string; updatedAt?: admin.firestore.Timestamp; parentId?: string | null };
            if (args.parentId !== undefined && data.parentId !== args.parentId) continue;
            docs.push({
                id: d.id,
                title: data.title ?? '(senza titolo)',
                updatedAt: data.updatedAt?.toMillis?.() ?? 0,
                parentId: data.parentId ?? null,
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

export async function createDoc(
    args: { title: string; parentId?: string | null; content?: string; icon?: { set: string; name: string; color?: string; fill?: number } },
    ctx: ToolContext,
) {
    if (!args.title || typeof args.title !== 'string') throw new Error('title richiesto');
    const pmContent = args.content ? markdownToProseMirror(args.content) : { type: 'doc', content: [] };

    const out = await saveDocCore({
        title: args.title,
        content: pmContent,
        parentId: args.parentId ?? null,
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

export async function appendBlock(args: { docId: string; markdown: string }, ctx: ToolContext) {
    if (!args.docId) throw new Error('docId richiesto');
    if (!args.markdown) throw new Error('markdown richiesto');

    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists) throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data() as { content: PMNode; revision: number; title: string; acl: NebulaDocAcl };

    if (!canWrite(current.acl, ctx.userEmail)) throw new Error('Permesso di scrittura negato');

    const newBlocks = markdownToProseMirror(args.markdown);
    const merged: PMNode = {
        type: 'doc',
        content: [
            ...(current.content?.content ?? []),
            ...(newBlocks.content ?? []),
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

export async function replaceSection(
    args: { docId: string; sectionAnchor: string; markdown: string },
    ctx: ToolContext,
) {
    if (!args.docId) throw new Error('docId richiesto');
    if (!args.sectionAnchor) throw new Error('sectionAnchor richiesto');
    if (args.markdown === undefined) throw new Error('markdown richiesto');

    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists) throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data() as { content: PMNode; revision: number; title: string; acl: NebulaDocAcl };

    if (!canWrite(current.acl, ctx.userEmail)) throw new Error('Permesso di scrittura negato');

    const anchor = args.sectionAnchor.toLowerCase().trim();
    const blocks = current.content?.content ?? [];

    // Trova heading che match
    let startIdx = -1;
    let level = 0;
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type === 'heading') {
            const headingText = extractText({ type: 'doc', content: [b] }).toLowerCase().trim();
            if (headingText === anchor || headingText.includes(anchor)) {
                startIdx = i;
                level = Number(b.attrs?.level ?? 1);
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
        if (b.type === 'heading' && Number(b.attrs?.level ?? 1) <= level) {
            endIdx = i;
            break;
        }
    }

    const newSection = markdownToProseMirror(args.markdown);
    const merged: PMNode = {
        type: 'doc',
        content: [
            ...blocks.slice(0, startIdx),
            ...(newSection.content ?? []),
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

export async function linkTask(
    args: { docId: string; taskId: string; projectId?: string | null },
    ctx: ToolContext,
) {
    if (!args.docId) throw new Error('docId richiesto');
    if (!args.taskId) throw new Error('taskId richiesto');

    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists) throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data() as { content: PMNode; revision: number; title: string; acl: NebulaDocAcl };

    if (!canWrite(current.acl, ctx.userEmail)) throw new Error('Permesso di scrittura negato');

    const taskParagraph: PMNode = {
        type: 'paragraph',
        content: [
            { type: 'taskMention', attrs: { taskId: args.taskId, projectId: args.projectId ?? null } },
            { type: 'text', text: ' ' },
        ],
    };

    const merged: PMNode = {
        type: 'doc',
        content: [
            ...(current.content?.content ?? []),
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

export async function linkProject(
    args: { docId: string; projectId: string },
    ctx: ToolContext,
) {
    if (!args.docId) throw new Error('docId richiesto');
    if (!args.projectId) throw new Error('projectId richiesto');

    const db = admin.firestore();
    const snap = await db.collection('nebulaDocs').doc(args.docId).get();
    if (!snap.exists) throw new Error(`Documento ${args.docId} non trovato`);
    const current = snap.data() as { content: PMNode; revision: number; title: string; acl: NebulaDocAcl };

    if (!canWrite(current.acl, ctx.userEmail)) throw new Error('Permesso di scrittura negato');

    const projectParagraph: PMNode = {
        type: 'paragraph',
        content: [
            { type: 'projectMention', attrs: { projectId: args.projectId } },
            { type: 'text', text: ' ' },
        ],
    };

    const merged: PMNode = {
        type: 'doc',
        content: [
            ...(current.content?.content ?? []),
            projectParagraph,
        ],
    };

    const out = await saveDocCore({
        docId: args.docId, content: merged, baseRevision: current.revision,
    }, ctx.userEmail);

    return { text: `Progetto \`${args.projectId}\` collegato a **${out.title}** (rev ${out.revision}).` };
}
