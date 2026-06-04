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
exports.listProjects = listProjects;
exports.listTeam = listTeam;
exports.getProject = getProject;
exports.getTask = getTask;
exports.listObiettivi = listObiettivi;
exports.getObiettivo = getObiettivo;
exports.createProject = createProject;
exports.createTask = createTask;
exports.createPhase = createPhase;
exports.createObiettivo = createObiettivo;
/**
 * MCP tools CEPHEID — creazione/lettura entità Progetti/Task/Milestone/Deliverable.
 *
 * Replica lato server (Admin SDK) la logica dei composable client
 *   src/composables/sidera/useProjects.ts  (createProject, DEFAULT_STATES)
 *   src/composables/sidera/useProjectTasks.ts  (createTask, createPhaseBundle)
 *
 * NOTE IMPORTANTI
 *  - L'Admin SDK BYPASSA le firestore.rules: il gate `isAdmin()` delle rules NON
 *    si applica qui. Ogni tool di SCRITTURA deve chiamare assertCoreAdmin().
 *  - STELLA-GRAFO: identità canonica = Auth UID. `createdBy` usa l'UID del
 *    chiamante (via admin.auth().getUserByEmail); gli `assignees` restano EMAIL
 *    (le rules controllano request.auth.token.email in assignees).
 *  - SOLO import leggeri (firebase-admin). MAI importare da src/composables/**:
 *    dipendono da vue/firebase client → crash al cold-start di TUTTE le function.
 */
const admin = __importStar(require("firebase-admin"));
// Stati di default di un progetto — copiato da useProjects.ts:24-29 (il
// composable client non è importabile lato function).
const DEFAULT_STATES = [
    { id: 'todo', label: 'Da fare', color: '#B4B0AA', order: 0 },
    { id: 'wip', label: 'In lavorazione', color: '#2F6B4A', order: 1 },
    { id: 'review', label: 'In revisione', color: '#C8821A', order: 2 },
    { id: 'done', label: 'Completato', color: '#4A6B8A', order: 3 },
];
const TASK_TYPES = ['task', 'milestone', 'deliverable'];
const PRIORITIES = ['alta', 'media', 'bassa'];
const SUPERADMIN = 'info@inglesinaitaliana.it';
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function normEmail(e) {
    return String(e !== null && e !== void 0 ? e : '').toLowerCase().trim();
}
/** Gate CORE admin — replica index.ts:2657-2659 (allowlist core/admins.emails +
 *  superadmin hardcoded). Throw se il chiamante non è admin. */
async function assertCoreAdmin(db, userEmail) {
    var _a, _b;
    const snap = await db.doc('core/admins').get();
    const emails = ((_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.emails) !== null && _b !== void 0 ? _b : []).map(normEmail);
    if (userEmail !== SUPERADMIN && !emails.includes(userEmail)) {
        throw new Error('PERMISSION_DENIED: solo i CORE admin possono creare entità CEPHEID.');
    }
}
/** UID Auth del chiamante per il campo createdBy. Fallback '' se l'email non ha
 *  un account Auth (identico al client `auth.currentUser?.uid ?? ''`). */
async function resolveCallerUid(userEmail) {
    try {
        return (await admin.auth().getUserByEmail(userEmail)).uid;
    }
    catch (_a) {
        return '';
    }
}
/** Risolve nomi/email passati da Claude in EMAIL valide presenti in /team
 *  (uid-keyed, campo `email`, active !== false). Match per email se contiene
 *  '@', altrimenti per nome. Gli input non risolti finiscono in `unmatched`
 *  e NON fanno fallire la creazione. */
async function resolveAssignees(db, raw) {
    const clean = (Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean);
    if (!clean.length)
        return { resolved: [], unmatched: [] };
    const snap = await db.collection('team').get();
    const byEmail = new Map(); // emailLower → email canonica
    const byName = new Map(); // nomeLower  → email
    snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.active === false)
            return;
        const email = normEmail(d.email);
        if (!email)
            return;
        byEmail.set(email, email);
        const names = [
            d.name,
            [d.firstName, d.lastName].filter(Boolean).join(' '),
            d.firstName,
        ];
        for (const n of names) {
            const key = String(n !== null && n !== void 0 ? n : '').toLowerCase().trim();
            if (key)
                byName.set(key, email);
        }
    });
    const resolved = [];
    const unmatched = [];
    for (const item of clean) {
        const low = item.toLowerCase();
        const match = item.includes('@') ? byEmail.get(low) : byName.get(low);
        if (match) {
            if (!resolved.includes(match))
                resolved.push(match);
        }
        else {
            unmatched.push(item);
        }
    }
    return { resolved, unmatched };
}
/** Parse ISO (YYYY-MM-DD) → Timestamp. `invalid` true se la stringa c'era ma
 *  non è una data valida (così l'handler può segnalarlo senza fallire). */
function parseDate(iso) {
    if (iso === undefined || iso === null || iso === '')
        return { ts: null, invalid: false };
    const d = new Date(String(iso));
    if (isNaN(d.getTime()))
        return { ts: null, invalid: true };
    return { ts: admin.firestore.Timestamp.fromDate(d), invalid: false };
}
function fmtDate(v) {
    try {
        const ts = v;
        const d = typeof (ts === null || ts === void 0 ? void 0 : ts.toDate) === 'function' ? ts.toDate() : new Date(v);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    catch (_a) {
        return '';
    }
}
function pickType(v) {
    return TASK_TYPES.includes(v) ? v : 'task';
}
function pickPriority(v) {
    return PRIORITIES.includes(v) ? v : 'media';
}
// ─────────────────────────────────────────────────────────────────────────────
// READ TOOLS (no gate admin — servono a Claude per ottenere ID/email validi)
// ─────────────────────────────────────────────────────────────────────────────
async function listProjects(args, _ctx) {
    const db = admin.firestore();
    const limit = Math.min(Math.max(Number(args === null || args === void 0 ? void 0 : args.limit) || 50, 1), 200);
    const snap = await db.collection('projects').orderBy('createdAt', 'desc').limit(limit).get();
    const rows = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .filter(({ data }) => ((args === null || args === void 0 ? void 0 : args.includeArchived) ? true : data.archived !== true && data.active !== false))
        .map(({ id, data }) => {
        var _a, _b, _c;
        const due = data.dueDate ? `  scad. ${fmtDate(data.dueDate)}` : '';
        return `- ${id}  «${(_a = data.name) !== null && _a !== void 0 ? _a : ''}»  task ${(_b = data.doneCount) !== null && _b !== void 0 ? _b : 0}/${(_c = data.taskCount) !== null && _c !== void 0 ? _c : 0}${due}`;
    });
    return { text: rows.length ? `Progetti (${rows.length}):\n${rows.join('\n')}` : 'Nessun progetto trovato.' };
}
async function listTeam(_args, _ctx) {
    const db = admin.firestore();
    const snap = await db.collection('team').get();
    const rows = snap.docs
        .map((d) => d.data())
        .filter((d) => d.active !== false && d.email)
        .map((d) => {
        const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(' ');
        const role = d.role ? `  (${d.role})` : '';
        return `- ${normEmail(d.email)}  ${name}${role}`;
    })
        .sort();
    return { text: rows.length ? `Team (${rows.length}):\n${rows.join('\n')}` : 'Nessun membro team.' };
}
/** Riga compatta di un task/milestone/deliverable. */
function fmtEntity(x) {
    var _a;
    const st = x.status ? `[${x.status}]` : '';
    const due = x.dueDate ? ` · scad. ${fmtDate(x.dueDate)}` : '';
    const ass = Array.isArray(x.assignees) && x.assignees.length ? ` · ${x.assignees.join(', ')}` : '';
    const approved = x.approved === true ? ' · ✅ approvato' : '';
    return `${st} «${String((_a = x.title) !== null && _a !== void 0 ? _a : '')}» (${x.id})${due}${ass}${approved}`;
}
/** Legge tutti i figli di projects/{id}/tasks e li raggruppa per type. */
async function loadProjectTasks(db, projectId) {
    const snap = await db.collection(`projects/${projectId}/tasks`).get();
    const all = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const byType = (t) => all.filter((x) => pickType(x.type) === t);
    return { all, tasks: byType('task'), milestones: byType('milestone'), deliverables: byType('deliverable') };
}
/**
 * Progetto completo: meta + gerarchia milestone → deliverable → task.
 * Rende esplicite le relazioni `deliverable.milestoneId` e
 * `deliverable.deliverableTaskIds`. Nessun gate (read-only).
 */
async function getProject(args, _ctx) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const projectId = String((_a = args === null || args === void 0 ? void 0 : args.projectId) !== null && _a !== void 0 ? _a : '').trim();
    if (!projectId)
        throw new Error('Il campo `projectId` è obbligatorio (usa cepheid_listProjects).');
    const projSnap = await db.doc(`projects/${projectId}`).get();
    if (!projSnap.exists)
        throw new Error(`Progetto ${projectId} inesistente.`);
    const p = projSnap.data();
    const { all, tasks, milestones, deliverables } = await loadProjectTasks(db, projectId);
    const findTitle = (id) => {
        var _a;
        const t = all.find((x) => x.id === id);
        return t ? String((_a = t.title) !== null && _a !== void 0 ? _a : '') : '(eliminato)';
    };
    const head = [];
    head.push(`# Progetto ${projectId} «${String((_b = p.name) !== null && _b !== void 0 ? _b : '')}»`);
    if (p.description)
        head.push(String(p.description));
    const meta = [];
    meta.push(`task ${(_c = p.doneCount) !== null && _c !== void 0 ? _c : 0}/${(_d = p.taskCount) !== null && _d !== void 0 ? _d : 0}`);
    if (p.dueDate)
        meta.push(`scad. ${fmtDate(p.dueDate)}`);
    if (p.obiettivoId)
        meta.push(`obiettivo: ${p.obiettivoId}`);
    if (p.archived === true)
        meta.push('ARCHIVIATO');
    head.push(meta.join(' · '));
    const linkedTaskIds = new Set();
    deliverables.forEach((d) => (Array.isArray(d.deliverableTaskIds) ? d.deliverableTaskIds : []).forEach((id) => linkedTaskIds.add(String(id))));
    const renderDeliverable = (d, indent) => {
        const out = [`${indent}- 📦 deliverable ${fmtEntity(d)}`];
        const ids = (Array.isArray(d.deliverableTaskIds) ? d.deliverableTaskIds : []).map(String);
        for (const tid of ids) {
            const t = tasks.find((x) => x.id === tid);
            out.push(`${indent}    - task ${t ? fmtEntity(t) : `«${findTitle(tid)}» (${tid})`}`);
        }
        return out;
    };
    const lines = [];
    // Milestone → deliverable figli → task
    lines.push(`\n## Milestone (${milestones.length})`);
    if (!milestones.length)
        lines.push('_(nessuna)_');
    for (const m of milestones) {
        lines.push(`- 🎯 milestone ${fmtEntity(m)}`);
        const childDelivs = deliverables.filter((d) => { var _a; return String((_a = d.milestoneId) !== null && _a !== void 0 ? _a : '') === m.id; });
        if (!childDelivs.length)
            lines.push('    _(nessun deliverable collegato)_');
        for (const d of childDelivs)
            lines.push(...renderDeliverable(d, '    '));
    }
    // Deliverable senza milestone
    const orphanDelivs = deliverables.filter((d) => !milestones.some((m) => { var _a; return m.id === String((_a = d.milestoneId) !== null && _a !== void 0 ? _a : ''); }));
    if (orphanDelivs.length) {
        lines.push(`\n## Deliverable senza milestone (${orphanDelivs.length})`);
        for (const d of orphanDelivs)
            lines.push(...renderDeliverable(d, ''));
    }
    // Task liberi (non collegati ad alcun deliverable)
    const freeTasks = tasks.filter((t) => !linkedTaskIds.has(t.id));
    lines.push(`\n## Task liberi (${freeTasks.length})`);
    if (!freeTasks.length)
        lines.push('_(nessuno)_');
    for (const t of freeTasks)
        lines.push(`- task ${fmtEntity(t)}`);
    return { text: `${head.join('\n')}\n${lines.join('\n')}` };
}
/**
 * Singola entità task/milestone/deliverable (stesso path projects/{id}/tasks/{id}).
 * Risolve le relazioni in base al type. Nessun gate (read-only).
 */
async function getTask(args, _ctx) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const projectId = String((_a = args === null || args === void 0 ? void 0 : args.projectId) !== null && _a !== void 0 ? _a : '').trim();
    const taskId = String((_b = args === null || args === void 0 ? void 0 : args.taskId) !== null && _b !== void 0 ? _b : '').trim();
    if (!projectId)
        throw new Error('Il campo `projectId` è obbligatorio.');
    if (!taskId)
        throw new Error('Il campo `taskId` è obbligatorio.');
    const snap = await db.doc(`projects/${projectId}/tasks/${taskId}`).get();
    if (!snap.exists)
        throw new Error(`Entità ${taskId} inesistente nel progetto ${projectId}.`);
    const x = Object.assign({ id: snap.id }, snap.data());
    const type = pickType(x.type);
    const out = [];
    out.push(`# ${type} ${fmtEntity(x)}`);
    out.push(`progetto: ${projectId}`);
    if (x.description)
        out.push(`\n${String(x.description)}`);
    if (type === 'deliverable') {
        if (x.milestoneId) {
            const mSnap = await db.doc(`projects/${projectId}/tasks/${String(x.milestoneId)}`).get();
            out.push(`\nMilestone: «${String((_d = (_c = mSnap.data()) === null || _c === void 0 ? void 0 : _c.title) !== null && _d !== void 0 ? _d : '(eliminata)')}» (${String(x.milestoneId)})`);
        }
        else {
            out.push('\nMilestone: _(nessuna)_');
        }
        const ids = (Array.isArray(x.deliverableTaskIds) ? x.deliverableTaskIds : []).map(String);
        out.push(`\nTask collegati (${ids.length}):`);
        for (const tid of ids) {
            const tSnap = await db.doc(`projects/${projectId}/tasks/${tid}`).get();
            out.push(tSnap.exists
                ? `- ${fmtEntity(Object.assign({ id: tSnap.id }, tSnap.data()))}`
                : `- (eliminato) (${tid})`);
        }
    }
    else if (type === 'milestone') {
        const dSnap = await db.collection(`projects/${projectId}/tasks`)
            .where('type', '==', 'deliverable').where('milestoneId', '==', taskId).get();
        out.push(`\nDeliverable collegati (${dSnap.size}):`);
        if (!dSnap.size)
            out.push('_(nessuno)_');
        dSnap.forEach((d) => out.push(`- ${fmtEntity(Object.assign({ id: d.id }, d.data()))}`));
    }
    return { text: out.join('\n') };
}
/** Lista obiettivi (collection top-level `obiettivi`). Esclude archiviati di default. */
async function listObiettivi(args, _ctx) {
    const db = admin.firestore();
    const limit = Math.min(Math.max(Number(args === null || args === void 0 ? void 0 : args.limit) || 50, 1), 200);
    const snap = await db.collection('obiettivi').limit(limit).get();
    const rows = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .filter(({ data }) => ((args === null || args === void 0 ? void 0 : args.includeArchived) ? true : data.stato !== 'archiviato'))
        .map(({ id, data }) => {
        var _a, _b;
        const periodo = data.periodKind === 'year'
            ? `anno ${(_a = data.anno) !== null && _a !== void 0 ? _a : ''}`
            : [fmtDate(data.startDate), fmtDate(data.endDate)].filter(Boolean).join(' → ');
        const st = data.stato ? `[${data.stato}]` : '';
        return `- ${id}  ${st} «${String((_b = data.titolo) !== null && _b !== void 0 ? _b : '')}»${periodo ? `  (${periodo})` : ''}`;
    });
    return { text: rows.length ? `Obiettivi (${rows.length}):\n${rows.join('\n')}` : 'Nessun obiettivo trovato.' };
}
/** Singolo obiettivo + progetti collegati (`projects.obiettivoId == id`). */
async function getObiettivo(args, _ctx) {
    var _a, _b, _c;
    const db = admin.firestore();
    const obiettivoId = String((_a = args === null || args === void 0 ? void 0 : args.obiettivoId) !== null && _a !== void 0 ? _a : '').trim();
    if (!obiettivoId)
        throw new Error('Il campo `obiettivoId` è obbligatorio (usa cepheid_listObiettivi).');
    const snap = await db.doc(`obiettivi/${obiettivoId}`).get();
    if (!snap.exists)
        throw new Error(`Obiettivo ${obiettivoId} inesistente.`);
    const o = snap.data();
    const out = [];
    const st = o.stato ? `[${o.stato}]` : '';
    out.push(`# Obiettivo ${obiettivoId}  ${st} «${String((_b = o.titolo) !== null && _b !== void 0 ? _b : '')}»`);
    if (o.descrizione)
        out.push(String(o.descrizione));
    const periodo = o.periodKind === 'year'
        ? `anno ${(_c = o.anno) !== null && _c !== void 0 ? _c : ''}`
        : [fmtDate(o.startDate), fmtDate(o.endDate)].filter(Boolean).join(' → ');
    if (periodo)
        out.push(`periodo: ${periodo}`);
    const projSnap = await db.collection('projects').where('obiettivoId', '==', obiettivoId).get();
    out.push(`\nProgetti collegati (${projSnap.size}):`);
    if (!projSnap.size)
        out.push('_(nessuno)_');
    projSnap.forEach((d) => {
        var _a, _b, _c;
        const p = d.data();
        out.push(`- ${d.id} «${String((_a = p.name) !== null && _a !== void 0 ? _a : '')}»  task ${(_b = p.doneCount) !== null && _b !== void 0 ? _b : 0}/${(_c = p.taskCount) !== null && _c !== void 0 ? _c : 0}`);
    });
    return { text: out.join('\n') };
}
// ─────────────────────────────────────────────────────────────────────────────
// WRITE TOOLS (assertCoreAdmin obbligatorio)
// ─────────────────────────────────────────────────────────────────────────────
async function createProject(args, ctx) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);
    const name = String((_a = args === null || args === void 0 ? void 0 : args.name) !== null && _a !== void 0 ? _a : '').trim();
    if (!name)
        throw new Error('Il campo `name` è obbligatorio.');
    const uid = await resolveCallerUid(userEmail);
    const due = parseDate(args === null || args === void 0 ? void 0 : args.dueDate);
    const ref = await db.collection('projects').add({
        name,
        description: String((_b = args === null || args === void 0 ? void 0 : args.description) !== null && _b !== void 0 ? _b : ''),
        color: String((_c = args === null || args === void 0 ? void 0 : args.color) !== null && _c !== void 0 ? _c : '#2F6B4A'),
        dueDate: due.ts,
        states: DEFAULT_STATES,
        members: [],
        notes: '',
        taskCount: 0,
        doneCount: 0,
        obiettivoId: (_d = args === null || args === void 0 ? void 0 : args.obiettivoId) !== null && _d !== void 0 ? _d : null,
        archived: false,
        active: true,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const warn = due.invalid ? '\n⚠️ `dueDate` non valida, ignorata.' : '';
    return { text: `Progetto creato: ${ref.id} «${name}».${warn}` };
}
async function createTask(args, ctx) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);
    const projectId = String((_a = args === null || args === void 0 ? void 0 : args.projectId) !== null && _a !== void 0 ? _a : '').trim();
    const title = String((_b = args === null || args === void 0 ? void 0 : args.title) !== null && _b !== void 0 ? _b : '').trim();
    if (!projectId)
        throw new Error('Il campo `projectId` è obbligatorio (usa cepheid_listProjects).');
    if (!title)
        throw new Error('Il campo `title` è obbligatorio.');
    const projRef = db.doc(`projects/${projectId}`);
    if (!(await projRef.get()).exists)
        throw new Error(`Progetto ${projectId} inesistente.`);
    const type = pickType(args === null || args === void 0 ? void 0 : args.type);
    const priority = pickPriority(args === null || args === void 0 ? void 0 : args.priority);
    const status = String((_c = args === null || args === void 0 ? void 0 : args.status) !== null && _c !== void 0 ? _c : 'todo');
    const uid = await resolveCallerUid(userEmail);
    const { resolved, unmatched } = await resolveAssignees(db, args === null || args === void 0 ? void 0 : args.assignees);
    const start = parseDate(args === null || args === void 0 ? void 0 : args.startDate);
    const due = parseDate(args === null || args === void 0 ? void 0 : args.dueDate);
    // Relazioni opzionali: un deliverable può collegare una milestone e dei task.
    const milestoneId = String((_d = args === null || args === void 0 ? void 0 : args.milestoneId) !== null && _d !== void 0 ? _d : '').trim() || null;
    const deliverableTaskIds = (Array.isArray(args === null || args === void 0 ? void 0 : args.deliverableTaskIds) ? args.deliverableTaskIds : [])
        .map((s) => String(s).trim()).filter(Boolean);
    const ref = await projRef.collection('tasks').add({
        title,
        status,
        priority,
        startDate: start.ts,
        dueDate: due.ts,
        description: '',
        assignees: resolved,
        projectId,
        type,
        deliverableTaskIds,
        order: null,
        approved: false,
        approvedAt: null,
        deliverableId: null,
        milestoneId,
        triaged: type !== 'task', // task nuovi → inbox (smistamento), milestone/deliverable no
        createdBy: uid,
        createdByEmail: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
        completedBy: null,
    });
    if (type === 'task') {
        await projRef.update({ taskCount: admin.firestore.FieldValue.increment(1) });
    }
    const warns = [];
    if (unmatched.length)
        warns.push(`assignee non trovati in /team (ignorati): ${unmatched.join(', ')}`);
    if (start.invalid)
        warns.push('`startDate` non valida, ignorata');
    if (due.invalid)
        warns.push('`dueDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    // Suggerisci la mention QUALIFICATA col progetto: i task vivono in
    // projects/{pid}/tasks/{id}, quindi referenziarli in un doc come @task:{id}
    // (senza progetto) li fa risultare "Task eliminato". Forma corretta sotto.
    return { text: `${type} creato: ${ref.id} «${title}» nel progetto ${projectId}.${warn}\nPer citarlo in un doc Nebula usa la mention: @task:${projectId}/${ref.id}` };
}
/** Crea una "fase" atomica = milestone (nuova XOR esistente) + deliverable
 *  (con milestoneId + deliverableTaskIds) + N task collegati. Replica
 *  createPhaseBundle (useProjectTasks.ts:211-258) con writeBatch Admin SDK. */
async function createPhase(args, ctx) {
    var _a, _b, _c, _d;
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);
    const projectId = String((_a = args === null || args === void 0 ? void 0 : args.projectId) !== null && _a !== void 0 ? _a : '').trim();
    const deliverableTitle = String((_b = args === null || args === void 0 ? void 0 : args.deliverableTitle) !== null && _b !== void 0 ? _b : '').trim();
    const taskTitles = (Array.isArray(args === null || args === void 0 ? void 0 : args.taskTitles) ? args.taskTitles : [])
        .map((t) => String(t).trim()).filter(Boolean);
    if (!projectId)
        throw new Error('Il campo `projectId` è obbligatorio.');
    if (!deliverableTitle)
        throw new Error('Il campo `deliverableTitle` è obbligatorio.');
    const hasExisting = !!String((_c = args === null || args === void 0 ? void 0 : args.milestoneExistingId) !== null && _c !== void 0 ? _c : '').trim();
    const hasNew = !!String((_d = args === null || args === void 0 ? void 0 : args.milestoneTitle) !== null && _d !== void 0 ? _d : '').trim();
    if (hasExisting === hasNew) {
        throw new Error('Fornire esattamente uno tra `milestoneExistingId` e `milestoneTitle`.');
    }
    const projRef = db.doc(`projects/${projectId}`);
    if (!(await projRef.get()).exists)
        throw new Error(`Progetto ${projectId} inesistente.`);
    const col = projRef.collection('tasks');
    const uid = await resolveCallerUid(userEmail);
    const { resolved: delivAssignees, unmatched } = await resolveAssignees(db, args === null || args === void 0 ? void 0 : args.deliverableAssignees);
    const mDue = parseDate(args === null || args === void 0 ? void 0 : args.milestoneDueDate);
    const dDue = parseDate(args === null || args === void 0 ? void 0 : args.deliverableDueDate);
    const batch = db.batch();
    const base = {
        startDate: null, description: '', order: null, approved: false, approvedAt: null,
        deliverableId: null, triaged: true, createdBy: uid, createdByEmail: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), completedAt: null, completedBy: null,
    };
    let milestoneId;
    if (hasExisting) {
        milestoneId = String(args.milestoneExistingId).trim();
    }
    else {
        milestoneId = col.doc().id;
        batch.set(col.doc(milestoneId), Object.assign(Object.assign({}, base), { title: String(args.milestoneTitle).trim(), status: 'todo', priority: 'media', dueDate: mDue.ts, assignees: [], type: 'milestone', deliverableTaskIds: [], milestoneId: null }));
    }
    const newTaskIds = taskTitles.map(() => col.doc().id);
    taskTitles.forEach((title, i) => {
        batch.set(col.doc(newTaskIds[i]), Object.assign(Object.assign({}, base), { title, status: 'todo', priority: 'media', dueDate: null, assignees: [], type: 'task', deliverableTaskIds: [], milestoneId: null, triaged: false }));
    });
    const delivId = col.doc().id;
    batch.set(col.doc(delivId), Object.assign(Object.assign({}, base), { title: deliverableTitle, status: 'todo', priority: 'media', dueDate: dDue.ts, assignees: delivAssignees, type: 'deliverable', deliverableTaskIds: newTaskIds, milestoneId }));
    if (newTaskIds.length) {
        batch.update(projRef, { taskCount: admin.firestore.FieldValue.increment(newTaskIds.length) });
    }
    await batch.commit();
    const warns = [];
    if (unmatched.length)
        warns.push(`assignee deliverable non trovati (ignorati): ${unmatched.join(', ')}`);
    if (mDue.invalid)
        warns.push('`milestoneDueDate` non valida, ignorata');
    if (dDue.invalid)
        warns.push('`deliverableDueDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    return {
        text: `Fase creata nel progetto ${projectId}: milestone ${milestoneId}${hasNew ? ' (nuova)' : ' (esistente)'}, `
            + `deliverable ${delivId}, ${newTaskIds.length} task.${warn}`,
    };
}
/** Crea un Obiettivo (collection top-level `obiettivi`). Solo CORE admin.
 *  Replica useObiettivi.createObiettivo (useObiettivi.ts:72-93). */
async function createObiettivo(args, ctx) {
    var _a, _b, _c;
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);
    const titolo = String((_a = args === null || args === void 0 ? void 0 : args.titolo) !== null && _a !== void 0 ? _a : '').trim();
    if (!titolo)
        throw new Error('Il campo `titolo` è obbligatorio.');
    const periodKind = (args === null || args === void 0 ? void 0 : args.periodKind) === 'quarters' ? 'quarters' : 'year';
    const start = parseDate(args === null || args === void 0 ? void 0 : args.startDate);
    const end = parseDate(args === null || args === void 0 ? void 0 : args.endDate);
    const uid = await resolveCallerUid(userEmail);
    const anno = start.ts ? start.ts.toDate().getFullYear() : new Date().getFullYear();
    const ref = await db.collection('obiettivi').add({
        titolo,
        descrizione: String((_b = args === null || args === void 0 ? void 0 : args.descrizione) !== null && _b !== void 0 ? _b : ''),
        periodKind,
        startDate: start.ts,
        endDate: end.ts,
        anno,
        stato: 'attivo',
        colore: String((_c = args === null || args === void 0 ? void 0 : args.colore) !== null && _c !== void 0 ? _c : '#D4A020'),
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const warns = [];
    if (start.invalid)
        warns.push('`startDate` non valida, ignorata');
    if (end.invalid)
        warns.push('`endDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    return { text: `Obiettivo creato: ${ref.id} «${titolo}».${warn}` };
}
//# sourceMappingURL=tools_cepheid.js.map