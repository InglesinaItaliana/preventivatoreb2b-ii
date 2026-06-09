"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nebulaSchema = exports.NEBULA_YJS_FIELD = void 0;
/**
 * NEBULA-DOCS — Schema ProseMirror headless condiviso (Fase 6, Yjs/CRDT).
 *
 * Questo è il LINCHPIN della collaborazione real-time: le Cloud Functions
 * (migrazione `initYDoc`, scritture MCP, compaction/proiezione) devono
 * costruire/leggere Y.Doc con ESATTAMENTE lo stesso schema ProseMirror che
 * l'editor TipTap usa sul client. Uno schema divergente corromperebbe il doc.
 *
 * Strategia anti-drift:
 *  - Riusiamo `getSchema()` di TipTap con le ESTENSIONI STOCK IDENTICHE a
 *    quelle in `NebulaDocView.vue` (stesse versioni 3.23.6).
 *  - Degli 8 nodi custom (taskMention/projectMention/taskEmbed/userMention/
 *    docMention/milestoneMention/deliverableMention/obiettivoMention) qui
 *    definiamo dei "gemelli headless" — stessa identità di
 *    schema (name/group/inline/atom/attrs/parse/render) ma SENZA `addNodeView`
 *    (Vue) né `addProseMirrorPlugins` (suggester): node-view e plugin NON
 *    influenzano lo schema ProseMirror né il mapping Yjs.
 *  - Un test round-trip (vitest) confronta questo schema con quello generato
 *    dall'editor reale per intercettare ogni drift di attrs.
 *
 * ⚠️ Il nome dell'XmlFragment DEVE essere `NEBULA_YJS_FIELD` ('default')
 * ovunque: l'estensione Collaboration usa `ydoc.getXmlFragment('default')`,
 * mentre `prosemirrorJSONToYDoc` ha default 'prosemirror'. Mismatch = il
 * client vedrebbe un doc vuoto.
 *
 * Vedi docs/NEBULA-DOCS.md §6 (Fase 6) e il piano di implementazione.
 */
const core_1 = require("@tiptap/core");
const starter_kit_1 = __importDefault(require("@tiptap/starter-kit"));
const extension_task_list_1 = __importDefault(require("@tiptap/extension-task-list"));
const extension_task_item_1 = __importDefault(require("@tiptap/extension-task-item"));
const extension_table_1 = require("@tiptap/extension-table");
const extension_link_1 = require("@tiptap/extension-link");
/**
 * Nome del campo YXmlFragment dentro il Y.Doc. DEVE combaciare con
 * l'opzione `field` dell'estensione Collaboration (default TipTap = 'default').
 * Passare SEMPRE questo a prosemirrorJSONToYDoc / yDocToProsemirrorJSON /
 * updateYFragment.
 */
exports.NEBULA_YJS_FIELD = 'default';
// ── Gemelli headless dei 5 nodi custom ──────────────────────────────────────
// Specifiche allineate 1:1 a src/views/nebula/docs/extensions/*.ts.
// Solo identità di schema: niente Vue, niente suggester. Le funzioni
// parseHTML/renderHTML non incidono sul mapping Yjs ma le replichiamo per
// coerenza con l'editor reale (clipboard / serializzazione HTML).
const TaskMentionTwin = core_1.Node.create({
    name: 'taskMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            taskId: { default: null },
            projectId: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="task-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'task-mention' }, HTMLAttributes)];
    },
});
const ProjectMentionTwin = core_1.Node.create({
    name: 'projectMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return { projectId: { default: null } };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="project-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'project-mention' }, HTMLAttributes)];
    },
});
const TaskEmbedTwin = core_1.Node.create({
    name: 'taskEmbed',
    group: 'block',
    inline: false,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            filter: { default: { status: 'todo', projectId: null, type: 'task', limit: 20 } },
            view: { default: 'list' },
        };
    },
    parseHTML() {
        return [{ tag: 'div[data-type="task-embed"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', (0, core_1.mergeAttributes)({ 'data-type': 'task-embed' }, HTMLAttributes)];
    },
});
const UserMentionTwin = core_1.Node.create({
    name: 'userMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return { email: { default: null } };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="user-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'user-mention' }, HTMLAttributes)];
    },
});
const DocMentionTwin = core_1.Node.create({
    name: 'docMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            docId: { default: null },
            title: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="doc-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'doc-mention' }, HTMLAttributes)];
    },
});
const MilestoneMentionTwin = core_1.Node.create({
    name: 'milestoneMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            milestoneId: { default: null },
            projectId: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="milestone-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'milestone-mention' }, HTMLAttributes)];
    },
});
const DeliverableMentionTwin = core_1.Node.create({
    name: 'deliverableMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            deliverableId: { default: null },
            projectId: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="deliverable-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'deliverable-mention' }, HTMLAttributes)];
    },
});
const ObiettivoMentionTwin = core_1.Node.create({
    name: 'obiettivoMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            obiettivoId: { default: null },
            title: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'span[data-type="obiettivo-mention"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', (0, core_1.mergeAttributes)({ 'data-type': 'obiettivo-mention' }, HTMLAttributes)];
    },
});
// ── Gemelli headless dei blocchi con contenuto editabile annidato ───────────
// A differenza delle mention (atom/inline), callout e toggle hanno `content`.
// Le spec DEVONO essere identiche 1:1 a extensions/Callout.ts e Toggle.ts
// (name/group/content/attrs/default/defining/isolating), o il Y.Doc diverge.
const CalloutTwin = core_1.Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,
    isolating: true,
    addAttributes() {
        return {
            tone: { default: 'info' },
            icon: { default: null },
        };
    },
    parseHTML() {
        return [{ tag: 'div[data-type="callout"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', (0, core_1.mergeAttributes)({ 'data-type': 'callout' }, HTMLAttributes), 0];
    },
});
const ToggleTwin = core_1.Node.create({
    name: 'toggle',
    group: 'block',
    content: 'toggleSummary block+',
    defining: true,
    isolating: true,
    addAttributes() {
        return {
            open: { default: true },
        };
    },
    parseHTML() {
        return [{ tag: 'div[data-type="toggle"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', (0, core_1.mergeAttributes)({ 'data-type': 'toggle' }, HTMLAttributes), 0];
    },
});
const ToggleSummaryTwin = core_1.Node.create({
    name: 'toggleSummary',
    content: 'inline*',
    defining: true,
    selectable: false,
    parseHTML() {
        return [{ tag: 'div[data-type="toggle-summary"]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', (0, core_1.mergeAttributes)({ 'data-type': 'toggle-summary' }, HTMLAttributes), 0];
    },
});
/**
 * Lista estensioni che genera lo schema. Rispecchia ESATTAMENTE l'ordine e
 * la config schema-rilevante di NebulaDocView.vue. Estensioni non-schema
 * (Placeholder, SlashCommand, UniversalMention) sono omesse: sono decorazioni
 * / plugin di suggestion e non aggiungono nodi o mark.
 */
const SCHEMA_EXTENSIONS = [
    starter_kit_1.default.configure({ heading: { levels: [1, 2, 3] } }),
    extension_task_list_1.default,
    extension_task_item_1.default.configure({ nested: true }),
    extension_table_1.Table.configure({ resizable: true }),
    extension_table_1.TableRow,
    extension_table_1.TableHeader,
    extension_table_1.TableCell,
    extension_link_1.Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    TaskMentionTwin,
    ProjectMentionTwin,
    TaskEmbedTwin,
    UserMentionTwin,
    DocMentionTwin,
    MilestoneMentionTwin,
    DeliverableMentionTwin,
    ObiettivoMentionTwin,
    CalloutTwin,
    ToggleTwin,
    ToggleSummaryTwin,
];
/**
 * Schema ProseMirror NEBULA-DOCS, costruito una sola volta. Usare per
 * prosemirrorJSONToYDoc(nebulaSchema, json, NEBULA_YJS_FIELD) e affini.
 */
exports.nebulaSchema = (0, core_1.getSchema)(SCHEMA_EXTENSIONS);
//# sourceMappingURL=pmSchema.js.map