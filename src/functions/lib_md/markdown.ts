/**
 * Markdown ⇄ ProseMirror JSON converter per NEBULA-DOCS MCP server (F4).
 *
 * Bidirezionale:
 *  - markdownToProseMirror(md) — parsing markdown standard + sintassi custom
 *    NEBULA (@task:id, @project:id, {{embed-tasks ...}}) → JSON doc TipTap
 *  - proseMirrorToMarkdown(doc) — walker che emette markdown leggibile da
 *    Claude. Round-trip approssimato: la struttura semantica viene preservata,
 *    formattazione marginale (es. spaziatura) può variare leggermente.
 *
 * Nodi PM supportati:
 *  Block: doc, paragraph, heading (1-3), bulletList, orderedList, listItem,
 *         blockquote, codeBlock, horizontalRule, taskEmbed
 *  Inline: text, hardBreak, taskMention, projectMention
 *  Marks: bold, italic, code, strike
 *
 * NON supportati v1: tables, images, links inline (link via marks: ignorati).
 * Future Fase 5+: userMention.
 *
 * Vedi docs/NEBULA-DOCS.md §6.4 (format exchange).
 */
import { marked, Tokens } from 'marked';

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN → PROSEMIRROR
// ─────────────────────────────────────────────────────────────────────────────

export interface PMNode {
    type: string;
    attrs?: Record<string, unknown>;
    content?: PMNode[];
    text?: string;
    marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Pattern custom NEBULA processati PRIMA del parser markdown.
 * Sostituiamo con placeholder unico, parsing, poi re-inseriamo come nodi PM.
 */
const TASK_MENTION_RE = /@task:([A-Za-z0-9_-]+)/g;
const PROJECT_MENTION_RE = /@project:([A-Za-z0-9_-]+)/g;
const EMBED_TASK_RE = /\{\{embed-tasks([^}]*)\}\}/g;

interface CustomPlaceholder {
    token: string;       // placeholder unico nel testo
    node: PMNode;        // nodo PM da inserire
}

function generatePlaceholder(idx: number): string {
    return `NEBULA_${idx}_NEBULA`;
}

function preprocessCustomSyntax(md: string): { md: string; placeholders: CustomPlaceholder[] } {
    const placeholders: CustomPlaceholder[] = [];
    let idx = 0;

    // 1. {{embed-tasks ...}} (blocco)
    md = md.replace(EMBED_TASK_RE, (_, rawAttrs: string) => {
        const filter = parseEmbedAttrs(rawAttrs);
        const token = generatePlaceholder(idx++);
        placeholders.push({
            token,
            node: {
                type: 'taskEmbed',
                attrs: { filter, view: 'list' },
            },
        });
        return `\n\n${token}\n\n`;  // forza nuovo blocco
    });

    // 2. @task:id (inline)
    md = md.replace(TASK_MENTION_RE, (_, taskId: string) => {
        const token = generatePlaceholder(idx++);
        placeholders.push({
            token,
            node: {
                type: 'taskMention',
                attrs: { taskId, projectId: null },
            },
        });
        return token;
    });

    // 3. @project:id (inline)
    md = md.replace(PROJECT_MENTION_RE, (_, projectId: string) => {
        const token = generatePlaceholder(idx++);
        placeholders.push({
            token,
            node: {
                type: 'projectMention',
                attrs: { projectId },
            },
        });
        return token;
    });

    return { md, placeholders };
}

function parseEmbedAttrs(raw: string): Record<string, unknown> {
    // raw es: "status=todo project=p_xyz limit=20"
    const filter: Record<string, unknown> = {
        status: 'todo', projectId: null, type: 'task', limit: 20,
    };
    const re = /(\w+)\s*=\s*([^\s]+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        const key = m[1];
        const val = m[2];
        if (key === 'status') filter.status = val;
        else if (key === 'project' || key === 'projectId') filter.projectId = val;
        else if (key === 'type') filter.type = val;
        else if (key === 'limit') filter.limit = parseInt(val, 10) || 20;
    }
    return filter;
}

/**
 * Sostituisce i placeholder in un nodo text con sequenza di nodi inline
 * (text + mention + text). Mantiene marks (bold/italic/etc.) sui frammenti text.
 */
function expandPlaceholdersInText(
    text: string,
    marks: PMNode['marks'],
    placeholders: CustomPlaceholder[],
): PMNode[] {
    if (placeholders.length === 0 || !text.includes('')) {
        return text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : [];
    }
    const result: PMNode[] = [];
    const re = /NEBULA_\d+_NEBULA/g;
    let lastIdx = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) {
            const before = text.slice(lastIdx, m.index);
            if (before) result.push({ type: 'text', text: before, ...(marks ? { marks } : {}) });
        }
        const ph = placeholders.find(p => p.token === m![0]);
        if (ph) result.push(ph.node);
        lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
        const tail = text.slice(lastIdx);
        if (tail) result.push({ type: 'text', text: tail, ...(marks ? { marks } : {}) });
    }
    return result;
}

function tokensToInline(
    tokens: Tokens.Generic[] | undefined,
    placeholders: CustomPlaceholder[],
    parentMarks: PMNode['marks'] = [],
): PMNode[] {
    if (!tokens) return [];
    const out: PMNode[] = [];
    for (const t of tokens) {
        const tt = t.type;
        if (tt === 'text' || tt === 'escape' || tt === 'html') {
            const text = (t as any).text ?? (t as any).raw ?? '';
            out.push(...expandPlaceholdersInText(text, parentMarks, placeholders));
        } else if (tt === 'strong') {
            const marks = [...(parentMarks ?? []), { type: 'bold' }];
            out.push(...tokensToInline((t as any).tokens, placeholders, marks));
        } else if (tt === 'em') {
            const marks = [...(parentMarks ?? []), { type: 'italic' }];
            out.push(...tokensToInline((t as any).tokens, placeholders, marks));
        } else if (tt === 'del') {
            const marks = [...(parentMarks ?? []), { type: 'strike' }];
            out.push(...tokensToInline((t as any).tokens, placeholders, marks));
        } else if (tt === 'codespan') {
            const marks = [...(parentMarks ?? []), { type: 'code' }];
            out.push(...expandPlaceholdersInText((t as any).text ?? '', marks, placeholders));
        } else if (tt === 'br') {
            out.push({ type: 'hardBreak' });
        } else if (tt === 'link') {
            // v1: ignora href, emette solo testo (link marks NON nel nostro schema)
            out.push(...tokensToInline((t as any).tokens, placeholders, parentMarks));
        } else if ('tokens' in t && Array.isArray((t as any).tokens)) {
            out.push(...tokensToInline((t as any).tokens, placeholders, parentMarks));
        } else if ((t as any).text) {
            out.push(...expandPlaceholdersInText((t as any).text, parentMarks, placeholders));
        }
    }
    return out;
}

function tokenToBlock(
    t: Tokens.Generic,
    placeholders: CustomPlaceholder[],
): PMNode | null {
    const tt = t.type;
    if (tt === 'space') return null;

    // Placeholder solitario in un paragrafo (es. taskEmbed)
    if (tt === 'paragraph') {
        const tokens = (t as Tokens.Paragraph).tokens;
        // Check se il paragrafo è solo un placeholder embed
        if (tokens && tokens.length === 1 && tokens[0].type === 'text') {
            const raw = (tokens[0] as any).raw?.trim() ?? '';
            const ph = placeholders.find(p => p.token === raw);
            if (ph && ph.node.type === 'taskEmbed') return ph.node;
        }
        const inline = tokensToInline(tokens, placeholders);
        return { type: 'paragraph', content: inline };
    }
    if (tt === 'heading') {
        const h = t as Tokens.Heading;
        const level = Math.min(3, Math.max(1, h.depth));
        return {
            type: 'heading',
            attrs: { level },
            content: tokensToInline(h.tokens, placeholders),
        };
    }
    if (tt === 'blockquote') {
        const bq = t as Tokens.Blockquote;
        const inner = (bq.tokens ?? []).map(c => tokenToBlock(c, placeholders)).filter(Boolean) as PMNode[];
        return { type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph', content: [] }] };
    }
    if (tt === 'list') {
        const l = t as Tokens.List;
        const items = (l.items ?? []).map(item => {
            const inner = (item.tokens ?? []).map(c => tokenToBlock(c, placeholders)).filter(Boolean) as PMNode[];
            return { type: 'listItem', content: inner.length ? inner : [{ type: 'paragraph', content: [] }] };
        });
        return {
            type: l.ordered ? 'orderedList' : 'bulletList',
            content: items,
        };
    }
    if (tt === 'code') {
        const c = t as Tokens.Code;
        return {
            type: 'codeBlock',
            attrs: c.lang ? { language: c.lang } : undefined,
            content: c.text ? [{ type: 'text', text: c.text }] : [],
        };
    }
    if (tt === 'hr') {
        return { type: 'horizontalRule' };
    }
    if (tt === 'text') {
        // Top-level text (raro): wrap in paragrafo
        const txt = (t as any).text ?? '';
        return { type: 'paragraph', content: expandPlaceholdersInText(txt, [], placeholders) };
    }
    // Tabelle, html, ecc. → wrap in paragrafo con raw text
    const raw = (t as any).raw ?? '';
    if (raw) return { type: 'paragraph', content: [{ type: 'text', text: raw.trim() }] };
    return null;
}

export function markdownToProseMirror(md: string): PMNode {
    const { md: processedMd, placeholders } = preprocessCustomSyntax(md);
    const tokens = marked.lexer(processedMd);
    const content: PMNode[] = [];
    for (const t of tokens) {
        const node = tokenToBlock(t, placeholders);
        if (node) content.push(node);
    }
    return {
        type: 'doc',
        content: content.length ? content : [{ type: 'paragraph', content: [] }],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROSEMIRROR → MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────

function escapeMd(s: string): string {
    // Escape minimo: caratteri che potrebbero confondere parser markdown
    return s.replace(/([*_`\\])/g, '\\$1');
}

function inlineToMd(nodes: PMNode[] | undefined): string {
    if (!nodes) return '';
    let out = '';
    for (const n of nodes) {
        if (n.type === 'text') {
            let s = n.text ?? '';
            const marks = n.marks ?? [];
            const hasMark = (t: string) => marks.some(m => m.type === t);
            if (hasMark('code')) s = '`' + s + '`';
            else {
                s = escapeMd(s);
                if (hasMark('bold')) s = '**' + s + '**';
                if (hasMark('italic')) s = '*' + s + '*';
                if (hasMark('strike')) s = '~~' + s + '~~';
            }
            out += s;
        } else if (n.type === 'hardBreak') {
            out += '  \n';
        } else if (n.type === 'taskMention') {
            out += `@task:${n.attrs?.taskId ?? ''}`;
        } else if (n.type === 'projectMention') {
            out += `@project:${n.attrs?.projectId ?? ''}`;
        } else if (n.content) {
            out += inlineToMd(n.content);
        }
    }
    return out;
}

function embedToMd(node: PMNode): string {
    const filter = (node.attrs?.filter ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (filter.status)     parts.push(`status=${filter.status}`);
    if (filter.projectId)  parts.push(`project=${filter.projectId}`);
    if (filter.type && filter.type !== 'task') parts.push(`type=${filter.type}`);
    if (filter.limit && filter.limit !== 20)   parts.push(`limit=${filter.limit}`);
    return `{{embed-tasks ${parts.join(' ')}}}`;
}

function listItemToMd(node: PMNode, ordered: boolean, idx: number, depth: number): string {
    const marker = ordered ? `${idx + 1}. ` : '- ';
    const indent = '  '.repeat(depth);
    if (!node.content || node.content.length === 0) return `${indent}${marker}`;

    const first = node.content[0];
    const restBlocks = node.content.slice(1);
    let line = '';
    if (first.type === 'paragraph') {
        line = `${indent}${marker}${inlineToMd(first.content)}`;
    } else {
        // First child is not paragraph (e.g. nested list directly)
        line = `${indent}${marker}`;
        restBlocks.unshift(first);
    }
    const rest = restBlocks.map(b => blockToMd(b, depth + 1)).join('\n');
    return rest ? `${line}\n${rest}` : line;
}

function blockToMd(node: PMNode, depth = 0): string {
    switch (node.type) {
        case 'paragraph':
            return inlineToMd(node.content);
        case 'heading': {
            const lvl = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
            return '#'.repeat(lvl) + ' ' + inlineToMd(node.content);
        }
        case 'bulletList':
            return (node.content ?? [])
                .map((li, i) => listItemToMd(li, false, i, depth))
                .join('\n');
        case 'orderedList':
            return (node.content ?? [])
                .map((li, i) => listItemToMd(li, true, i, depth))
                .join('\n');
        case 'blockquote':
            return (node.content ?? [])
                .map(c => blockToMd(c, depth))
                .join('\n\n')
                .split('\n').map(l => '> ' + l).join('\n');
        case 'codeBlock': {
            const lang = (node.attrs?.language as string) ?? '';
            const text = (node.content ?? []).map(c => c.text ?? '').join('');
            return '```' + lang + '\n' + text + '\n```';
        }
        case 'horizontalRule':
            return '---';
        case 'taskEmbed':
            return embedToMd(node);
        default:
            // Fallback: tratta come paragrafo
            if (node.content) return inlineToMd(node.content);
            return '';
    }
}

export function proseMirrorToMarkdown(doc: PMNode): string {
    if (doc.type !== 'doc' || !doc.content) return '';
    return doc.content
        .map(b => blockToMd(b, 0))
        .filter(s => s !== undefined)
        .join('\n\n')
        .trim() + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER per estrazione plain text (per ricerca/snippet)
// ─────────────────────────────────────────────────────────────────────────────

export function extractText(doc: PMNode): string {
    if (!doc) return '';
    const out: string[] = [];
    function walk(n: PMNode) {
        if (n.type === 'text') out.push(n.text ?? '');
        else if (n.type === 'hardBreak') out.push(' ');
        else if (n.type === 'taskMention') out.push(`[task ${n.attrs?.taskId}]`);
        else if (n.type === 'projectMention') out.push(`[project ${n.attrs?.projectId}]`);
        if (n.content) {
            const isBlock = ['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock'].includes(n.type);
            n.content.forEach(walk);
            if (isBlock) out.push('\n');
        }
    }
    walk(doc);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
