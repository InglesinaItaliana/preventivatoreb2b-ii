"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownToProseMirror = markdownToProseMirror;
exports.proseMirrorToMarkdown = proseMirrorToMarkdown;
exports.extractText = extractText;
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
 *         taskList, taskItem (GFM `- [ ]` / `- [x]`),
 *         blockquote, codeBlock, horizontalRule, taskEmbed
 *  Inline: text, hardBreak, taskMention, projectMention
 *  Marks: bold, italic, code, strike
 *
 * NON supportati v1: tables, images, links inline (link via marks: ignorati).
 * Future Fase 5+: userMention.
 *
 * Vedi docs/NEBULA-DOCS.md §6.4 (format exchange).
 */
const marked_1 = require("marked");
/**
 * Pattern custom NEBULA processati PRIMA del parser markdown.
 * Sostituiamo con placeholder unico, parsing, poi re-inseriamo come nodi PM.
 */
const TASK_MENTION_RE = /@task:([A-Za-z0-9_-]+)/g;
const PROJECT_MENTION_RE = /@project:([A-Za-z0-9_-]+)/g;
const EMBED_TASK_RE = /\{\{embed-tasks([^}]*)\}\}/g;
function generatePlaceholder(idx) {
    return `NEBULA_${idx}_NEBULA`;
}
function preprocessCustomSyntax(md) {
    const placeholders = [];
    let idx = 0;
    // 1. {{embed-tasks ...}} (blocco)
    md = md.replace(EMBED_TASK_RE, (_, rawAttrs) => {
        const filter = parseEmbedAttrs(rawAttrs);
        const token = generatePlaceholder(idx++);
        placeholders.push({
            token,
            node: {
                type: 'taskEmbed',
                attrs: { filter, view: 'list' },
            },
        });
        return `\n\n${token}\n\n`; // forza nuovo blocco
    });
    // 2. @task:id (inline)
    md = md.replace(TASK_MENTION_RE, (_, taskId) => {
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
    md = md.replace(PROJECT_MENTION_RE, (_, projectId) => {
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
function parseEmbedAttrs(raw) {
    // raw es: "status=todo project=p_xyz limit=20"
    const filter = {
        status: 'todo', projectId: null, type: 'task', limit: 20,
    };
    const re = /(\w+)\s*=\s*([^\s]+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        const key = m[1];
        const val = m[2];
        if (key === 'status')
            filter.status = val;
        else if (key === 'project' || key === 'projectId')
            filter.projectId = val;
        else if (key === 'type')
            filter.type = val;
        else if (key === 'limit')
            filter.limit = parseInt(val, 10) || 20;
    }
    return filter;
}
/**
 * Sostituisce i placeholder in un nodo text con sequenza di nodi inline
 * (text + mention + text). Mantiene marks (bold/italic/etc.) sui frammenti text.
 */
function expandPlaceholdersInText(text, marks, placeholders) {
    if (placeholders.length === 0 || !text.includes('')) {
        return text ? [Object.assign({ type: 'text', text }, (marks ? { marks } : {}))] : [];
    }
    const result = [];
    const re = /NEBULA_\d+_NEBULA/g;
    let lastIdx = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) {
            const before = text.slice(lastIdx, m.index);
            if (before)
                result.push(Object.assign({ type: 'text', text: before }, (marks ? { marks } : {})));
        }
        const ph = placeholders.find(p => p.token === m[0]);
        if (ph)
            result.push(ph.node);
        lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
        const tail = text.slice(lastIdx);
        if (tail)
            result.push(Object.assign({ type: 'text', text: tail }, (marks ? { marks } : {})));
    }
    return result;
}
function tokensToInline(tokens, placeholders, parentMarks = []) {
    var _a, _b, _c;
    if (!tokens)
        return [];
    const out = [];
    for (const t of tokens) {
        const tt = t.type;
        if (tt === 'text' || tt === 'escape' || tt === 'html') {
            const text = (_b = (_a = t.text) !== null && _a !== void 0 ? _a : t.raw) !== null && _b !== void 0 ? _b : '';
            out.push(...expandPlaceholdersInText(text, parentMarks, placeholders));
        }
        else if (tt === 'strong') {
            const marks = [...(parentMarks !== null && parentMarks !== void 0 ? parentMarks : []), { type: 'bold' }];
            out.push(...tokensToInline(t.tokens, placeholders, marks));
        }
        else if (tt === 'em') {
            const marks = [...(parentMarks !== null && parentMarks !== void 0 ? parentMarks : []), { type: 'italic' }];
            out.push(...tokensToInline(t.tokens, placeholders, marks));
        }
        else if (tt === 'del') {
            const marks = [...(parentMarks !== null && parentMarks !== void 0 ? parentMarks : []), { type: 'strike' }];
            out.push(...tokensToInline(t.tokens, placeholders, marks));
        }
        else if (tt === 'codespan') {
            const marks = [...(parentMarks !== null && parentMarks !== void 0 ? parentMarks : []), { type: 'code' }];
            out.push(...expandPlaceholdersInText((_c = t.text) !== null && _c !== void 0 ? _c : '', marks, placeholders));
        }
        else if (tt === 'br') {
            out.push({ type: 'hardBreak' });
        }
        else if (tt === 'link') {
            // v1: ignora href, emette solo testo (link marks NON nel nostro schema)
            out.push(...tokensToInline(t.tokens, placeholders, parentMarks));
        }
        else if ('tokens' in t && Array.isArray(t.tokens)) {
            out.push(...tokensToInline(t.tokens, placeholders, parentMarks));
        }
        else if (t.text) {
            out.push(...expandPlaceholdersInText(t.text, parentMarks, placeholders));
        }
    }
    return out;
}
function tokenToBlock(t, placeholders) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const tt = t.type;
    if (tt === 'space')
        return null;
    // Placeholder solitario in un paragrafo (es. taskEmbed)
    if (tt === 'paragraph') {
        const tokens = t.tokens;
        // Check se il paragrafo è solo un placeholder embed
        if (tokens && tokens.length === 1 && tokens[0].type === 'text') {
            const raw = (_b = (_a = tokens[0].raw) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
            const ph = placeholders.find(p => p.token === raw);
            if (ph && ph.node.type === 'taskEmbed')
                return ph.node;
        }
        const inline = tokensToInline(tokens, placeholders);
        return { type: 'paragraph', content: inline };
    }
    if (tt === 'heading') {
        const h = t;
        const level = Math.min(3, Math.max(1, h.depth));
        return {
            type: 'heading',
            attrs: { level },
            content: tokensToInline(h.tokens, placeholders),
        };
    }
    if (tt === 'blockquote') {
        const bq = t;
        const inner = ((_c = bq.tokens) !== null && _c !== void 0 ? _c : []).map(c => tokenToBlock(c, placeholders)).filter(Boolean);
        return { type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph', content: [] }] };
    }
    if (tt === 'list') {
        const l = t;
        // GFM task list: se almeno un item ha `task: true`, emetti taskList
        // (gli item non-task in mezzo li trattiamo comunque come taskItem unchecked
        // per coerenza visiva — i parser marked di solito non li mescolano).
        const isTaskList = !l.ordered && ((_d = l.items) !== null && _d !== void 0 ? _d : []).some(item => item.task === true);
        if (isTaskList) {
            const items = ((_e = l.items) !== null && _e !== void 0 ? _e : []).map(item => {
                var _a;
                // marked emette un token `checkbox` separato + il contenuto: scartiamo
                // il checkbox (lo stato è già in item.checked).
                const childTokens = ((_a = item.tokens) !== null && _a !== void 0 ? _a : []).filter(c => c.type !== 'checkbox');
                const inner = childTokens.map(c => tokenToBlock(c, placeholders)).filter(Boolean);
                return {
                    type: 'taskItem',
                    attrs: { checked: !!item.checked },
                    content: inner.length ? inner : [{ type: 'paragraph', content: [] }],
                };
            });
            return { type: 'taskList', content: items };
        }
        const items = ((_f = l.items) !== null && _f !== void 0 ? _f : []).map(item => {
            var _a;
            const inner = ((_a = item.tokens) !== null && _a !== void 0 ? _a : []).map(c => tokenToBlock(c, placeholders)).filter(Boolean);
            return { type: 'listItem', content: inner.length ? inner : [{ type: 'paragraph', content: [] }] };
        });
        return {
            type: l.ordered ? 'orderedList' : 'bulletList',
            content: items,
        };
    }
    if (tt === 'code') {
        const c = t;
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
        // Top-level text (es. dentro list_item): se ha sub-tokens inline,
        // delegali a tokensToInline per non perdere bold/italic/code/strike.
        const sub = t.tokens;
        if (Array.isArray(sub) && sub.length) {
            return { type: 'paragraph', content: tokensToInline(sub, placeholders) };
        }
        const txt = (_g = t.text) !== null && _g !== void 0 ? _g : '';
        return { type: 'paragraph', content: expandPlaceholdersInText(txt, [], placeholders) };
    }
    // Tabelle, html, ecc. → wrap in paragrafo con raw text
    const raw = (_h = t.raw) !== null && _h !== void 0 ? _h : '';
    if (raw)
        return { type: 'paragraph', content: [{ type: 'text', text: raw.trim() }] };
    return null;
}
function markdownToProseMirror(md) {
    const { md: processedMd, placeholders } = preprocessCustomSyntax(md);
    const tokens = marked_1.marked.lexer(processedMd);
    const content = [];
    for (const t of tokens) {
        const node = tokenToBlock(t, placeholders);
        if (node)
            content.push(node);
    }
    return {
        type: 'doc',
        content: content.length ? content : [{ type: 'paragraph', content: [] }],
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// PROSEMIRROR → MARKDOWN
// ─────────────────────────────────────────────────────────────────────────────
function escapeMd(s) {
    // Escape minimo: caratteri che potrebbero confondere parser markdown
    return s.replace(/([*_`\\])/g, '\\$1');
}
function inlineToMd(nodes) {
    var _a, _b, _c, _d, _e, _f;
    if (!nodes)
        return '';
    let out = '';
    for (const n of nodes) {
        if (n.type === 'text') {
            let s = (_a = n.text) !== null && _a !== void 0 ? _a : '';
            const marks = (_b = n.marks) !== null && _b !== void 0 ? _b : [];
            const hasMark = (t) => marks.some(m => m.type === t);
            if (hasMark('code'))
                s = '`' + s + '`';
            else {
                s = escapeMd(s);
                if (hasMark('bold'))
                    s = '**' + s + '**';
                if (hasMark('italic'))
                    s = '*' + s + '*';
                if (hasMark('strike'))
                    s = '~~' + s + '~~';
            }
            out += s;
        }
        else if (n.type === 'hardBreak') {
            out += '  \n';
        }
        else if (n.type === 'taskMention') {
            out += `@task:${(_d = (_c = n.attrs) === null || _c === void 0 ? void 0 : _c.taskId) !== null && _d !== void 0 ? _d : ''}`;
        }
        else if (n.type === 'projectMention') {
            out += `@project:${(_f = (_e = n.attrs) === null || _e === void 0 ? void 0 : _e.projectId) !== null && _f !== void 0 ? _f : ''}`;
        }
        else if (n.content) {
            out += inlineToMd(n.content);
        }
    }
    return out;
}
function embedToMd(node) {
    var _a, _b;
    const filter = ((_b = (_a = node.attrs) === null || _a === void 0 ? void 0 : _a.filter) !== null && _b !== void 0 ? _b : {});
    const parts = [];
    if (filter.status)
        parts.push(`status=${filter.status}`);
    if (filter.projectId)
        parts.push(`project=${filter.projectId}`);
    if (filter.type && filter.type !== 'task')
        parts.push(`type=${filter.type}`);
    if (filter.limit && filter.limit !== 20)
        parts.push(`limit=${filter.limit}`);
    return `{{embed-tasks ${parts.join(' ')}}}`;
}
function listItemToMd(node, ordered, idx, depth) {
    const marker = ordered ? `${idx + 1}. ` : '- ';
    const indent = '  '.repeat(depth);
    if (!node.content || node.content.length === 0)
        return `${indent}${marker}`;
    const first = node.content[0];
    const restBlocks = node.content.slice(1);
    let line = '';
    if (first.type === 'paragraph') {
        line = `${indent}${marker}${inlineToMd(first.content)}`;
    }
    else {
        // First child is not paragraph (e.g. nested list directly)
        line = `${indent}${marker}`;
        restBlocks.unshift(first);
    }
    const rest = restBlocks.map(b => blockToMd(b, depth + 1)).join('\n');
    return rest ? `${line}\n${rest}` : line;
}
function taskItemToMd(node, depth) {
    var _a;
    const checked = !!((_a = node.attrs) === null || _a === void 0 ? void 0 : _a.checked);
    const marker = checked ? '- [x] ' : '- [ ] ';
    const indent = '  '.repeat(depth);
    if (!node.content || node.content.length === 0)
        return `${indent}${marker}`;
    const first = node.content[0];
    const restBlocks = node.content.slice(1);
    let line = '';
    if (first.type === 'paragraph') {
        line = `${indent}${marker}${inlineToMd(first.content)}`;
    }
    else {
        line = `${indent}${marker}`;
        restBlocks.unshift(first);
    }
    const rest = restBlocks.map(b => blockToMd(b, depth + 1)).join('\n');
    return rest ? `${line}\n${rest}` : line;
}
function blockToMd(node, depth = 0) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    switch (node.type) {
        case 'paragraph':
            return inlineToMd(node.content);
        case 'heading': {
            const lvl = Math.min(3, Math.max(1, Number((_b = (_a = node.attrs) === null || _a === void 0 ? void 0 : _a.level) !== null && _b !== void 0 ? _b : 1)));
            return '#'.repeat(lvl) + ' ' + inlineToMd(node.content);
        }
        case 'bulletList':
            return ((_c = node.content) !== null && _c !== void 0 ? _c : [])
                .map((li, i) => listItemToMd(li, false, i, depth))
                .join('\n');
        case 'orderedList':
            return ((_d = node.content) !== null && _d !== void 0 ? _d : [])
                .map((li, i) => listItemToMd(li, true, i, depth))
                .join('\n');
        case 'taskList':
            return ((_e = node.content) !== null && _e !== void 0 ? _e : [])
                .map(ti => taskItemToMd(ti, depth))
                .join('\n');
        case 'blockquote':
            return ((_f = node.content) !== null && _f !== void 0 ? _f : [])
                .map(c => blockToMd(c, depth))
                .join('\n\n')
                .split('\n').map(l => '> ' + l).join('\n');
        case 'codeBlock': {
            const lang = (_h = (_g = node.attrs) === null || _g === void 0 ? void 0 : _g.language) !== null && _h !== void 0 ? _h : '';
            const text = ((_j = node.content) !== null && _j !== void 0 ? _j : []).map(c => { var _a; return (_a = c.text) !== null && _a !== void 0 ? _a : ''; }).join('');
            return '```' + lang + '\n' + text + '\n```';
        }
        case 'horizontalRule':
            return '---';
        case 'taskEmbed':
            return embedToMd(node);
        default:
            // Fallback: tratta come paragrafo
            if (node.content)
                return inlineToMd(node.content);
            return '';
    }
}
function proseMirrorToMarkdown(doc) {
    if (doc.type !== 'doc' || !doc.content)
        return '';
    return doc.content
        .map(b => blockToMd(b, 0))
        .filter(s => s !== undefined)
        .join('\n\n')
        .trim() + '\n';
}
// ─────────────────────────────────────────────────────────────────────────────
// HELPER per estrazione plain text (per ricerca/snippet)
// ─────────────────────────────────────────────────────────────────────────────
function extractText(doc) {
    if (!doc)
        return '';
    const out = [];
    function walk(n) {
        var _a, _b, _c;
        if (n.type === 'text')
            out.push((_a = n.text) !== null && _a !== void 0 ? _a : '');
        else if (n.type === 'hardBreak')
            out.push(' ');
        else if (n.type === 'taskMention')
            out.push(`[task ${(_b = n.attrs) === null || _b === void 0 ? void 0 : _b.taskId}]`);
        else if (n.type === 'projectMention')
            out.push(`[project ${(_c = n.attrs) === null || _c === void 0 ? void 0 : _c.projectId}]`);
        if (n.content) {
            const isBlock = ['paragraph', 'heading', 'blockquote', 'listItem', 'taskItem', 'codeBlock'].includes(n.type);
            n.content.forEach(walk);
            if (isBlock)
                out.push('\n');
        }
    }
    walk(doc);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
//# sourceMappingURL=markdown.js.map