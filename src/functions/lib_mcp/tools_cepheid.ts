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
 *    chiamante (via admin.auth().getUserByEmail); anche gli `assignees` sono UID
 *    (resolveAssignees risolve nome/email → uid; migrazione assignees email→uid).
 *  - SOLO import leggeri (firebase-admin). MAI importare da src/composables/**:
 *    dipendono da vue/firebase client → crash al cold-start di TUTTE le function.
 */
import * as admin from 'firebase-admin';
import type { ToolContext } from './tools';

type ToolOut = { text: string };

// Stati di default di un progetto — copiato da useProjects.ts:24-29 (il
// composable client non è importabile lato function).
const DEFAULT_STATES = [
    { id: 'todo',   label: 'Da fare',        color: '#B4B0AA', order: 0 },
    { id: 'wip',    label: 'In lavorazione', color: '#2F6B4A', order: 1 },
    { id: 'review', label: 'In revisione',   color: '#C8821A', order: 2 },
    { id: 'done',   label: 'Completato',     color: '#4A6B8A', order: 3 },
];

const TASK_TYPES = ['task', 'milestone', 'deliverable'] as const;
type TaskType = typeof TASK_TYPES[number];
const PRIORITIES = ['alta', 'media', 'bassa'] as const;
type Priority = typeof PRIORITIES[number];

const SUPERADMIN = 'info@inglesinaitaliana.it';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normEmail(e: unknown): string {
    return String(e ?? '').toLowerCase().trim();
}

/** Gate CORE admin — replica index.ts:2657-2659 (allowlist core/admins.emails +
 *  superadmin hardcoded). Throw se il chiamante non è admin. */
async function assertCoreAdmin(db: admin.firestore.Firestore, userEmail: string): Promise<void> {
    const snap = await db.doc('core/admins').get();
    const emails = ((snap.data()?.emails ?? []) as unknown[]).map(normEmail);
    if (userEmail !== SUPERADMIN && !emails.includes(userEmail)) {
        throw new Error('PERMISSION_DENIED: solo i CORE admin possono creare entità CEPHEID.');
    }
}

/** UID Auth del chiamante per il campo createdBy. Fallback '' se l'email non ha
 *  un account Auth (identico al client `auth.currentUser?.uid ?? ''`). */
async function resolveCallerUid(userEmail: string): Promise<string> {
    try {
        return (await admin.auth().getUserByEmail(userEmail)).uid;
    } catch {
        return '';
    }
}

/** Risolve nomi/email passati da Claude in **UID** validi presenti in /team
 *  (uid-keyed: la chiave del doc È l'uid; campo `email`, active !== false). Match
 *  per email se contiene '@', altrimenti per nome. Gli input non risolti finiscono
 *  in `unmatched` e NON fanno fallire la creazione. (Migrazione assignees email→uid:
 *  le rules accettano email O uid, ma i nuovi write usano uid.) */
async function resolveAssignees(
    db: admin.firestore.Firestore,
    raw: unknown,
): Promise<{ resolved: string[]; unmatched: string[] }> {
    const clean = (Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean);
    if (!clean.length) return { resolved: [], unmatched: [] };

    const snap = await db.collection('team').get();
    const byEmail = new Map<string, string>();   // emailLower → uid
    const byName = new Map<string, string>();     // nomeLower  → uid
    snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        if (d.active === false) return;
        const uid = docSnap.id;                   // /team è uid-keyed → l'id è l'uid
        const email = normEmail(d.email);
        if (email) byEmail.set(email, uid);
        const names = [
            d.name,
            [d.firstName, d.lastName].filter(Boolean).join(' '),
            d.firstName,
        ];
        for (const n of names) {
            const key = String(n ?? '').toLowerCase().trim();
            if (key) byName.set(key, uid);
        }
    });

    const resolved: string[] = [];
    const unmatched: string[] = [];
    for (const item of clean) {
        const low = item.toLowerCase();
        const match = item.includes('@') ? byEmail.get(low) : byName.get(low);
        if (match) {
            if (!resolved.includes(match)) resolved.push(match);
        } else {
            unmatched.push(item);
        }
    }
    return { resolved, unmatched };
}

/** Parse ISO (YYYY-MM-DD) → Timestamp. `invalid` true se la stringa c'era ma
 *  non è una data valida (così l'handler può segnalarlo senza fallire). */
function parseDate(iso: unknown): { ts: admin.firestore.Timestamp | null; invalid: boolean } {
    if (iso === undefined || iso === null || iso === '') return { ts: null, invalid: false };
    const d = new Date(String(iso));
    if (isNaN(d.getTime())) return { ts: null, invalid: true };
    return { ts: admin.firestore.Timestamp.fromDate(d), invalid: false };
}

function fmtDate(v: unknown): string {
    try {
        const ts = v as { toDate?: () => Date };
        const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(v as string);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function pickType(v: unknown): TaskType {
    return TASK_TYPES.includes(v as TaskType) ? (v as TaskType) : 'task';
}
function pickPriority(v: unknown): Priority {
    return PRIORITIES.includes(v as Priority) ? (v as Priority) : 'media';
}

// ─────────────────────────────────────────────────────────────────────────────
// READ TOOLS (no gate admin — servono a Claude per ottenere ID/email validi)
// ─────────────────────────────────────────────────────────────────────────────

export async function listProjects(
    args: { includeArchived?: boolean; limit?: number },
    _ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
    const snap = await db.collection('projects').orderBy('createdAt', 'desc').limit(limit).get();
    const rows = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        .filter(({ data }) => (args?.includeArchived ? true : data.archived !== true && data.active !== false))
        .map(({ id, data }) => {
            const due = data.dueDate ? `  scad. ${fmtDate(data.dueDate)}` : '';
            return `- ${id}  «${data.name ?? ''}»  task ${data.doneCount ?? 0}/${data.taskCount ?? 0}${due}`;
        });
    return { text: rows.length ? `Progetti (${rows.length}):\n${rows.join('\n')}` : 'Nessun progetto trovato.' };
}

export async function listTeam(_args: unknown, _ctx: ToolContext): Promise<ToolOut> {
    const db = admin.firestore();
    const snap = await db.collection('team').get();
    const rows = snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .filter((d) => d.active !== false && d.email)
        .map((d) => {
            const name = (d.name as string) || [d.firstName, d.lastName].filter(Boolean).join(' ');
            const role = d.role ? `  (${d.role})` : '';
            return `- ${normEmail(d.email)}  ${name}${role}`;
        })
        .sort();
    return { text: rows.length ? `Team (${rows.length}):\n${rows.join('\n')}` : 'Nessun membro team.' };
}

type TaskRow = { id: string } & Record<string, unknown>;

/** Riga compatta di un task/milestone/deliverable. */
function fmtEntity(x: TaskRow): string {
    const st = x.status ? `[${x.status}]` : '';
    const due = x.dueDate ? ` · scad. ${fmtDate(x.dueDate)}` : '';
    const ass = Array.isArray(x.assignees) && x.assignees.length ? ` · ${(x.assignees as unknown[]).join(', ')}` : '';
    const approved = x.approved === true ? ' · ✅ approvato' : '';
    return `${st} «${String(x.title ?? '')}» (${x.id})${due}${ass}${approved}`;
}

/** Legge tutti i figli di projects/{id}/tasks e li raggruppa per type. */
async function loadProjectTasks(
    db: admin.firestore.Firestore,
    projectId: string,
): Promise<{ all: TaskRow[]; tasks: TaskRow[]; milestones: TaskRow[]; deliverables: TaskRow[] }> {
    const snap = await db.collection(`projects/${projectId}/tasks`).get();
    const all: TaskRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    const byType = (t: TaskType) => all.filter((x) => pickType(x.type) === t);
    return { all, tasks: byType('task'), milestones: byType('milestone'), deliverables: byType('deliverable') };
}

/**
 * Progetto completo: meta + gerarchia milestone → deliverable → task.
 * Rende esplicite le relazioni `deliverable.milestoneId` e
 * `deliverable.deliverableTaskIds`. Nessun gate (read-only).
 */
export async function getProject(args: { projectId?: string }, _ctx: ToolContext): Promise<ToolOut> {
    const db = admin.firestore();
    const projectId = String(args?.projectId ?? '').trim();
    if (!projectId) throw new Error('Il campo `projectId` è obbligatorio (usa cepheid_listProjects).');

    const projSnap = await db.doc(`projects/${projectId}`).get();
    if (!projSnap.exists) throw new Error(`Progetto ${projectId} inesistente.`);
    const p = projSnap.data() as Record<string, unknown>;

    const { all, tasks, milestones, deliverables } = await loadProjectTasks(db, projectId);
    const findTitle = (id: string) => {
        const t = all.find((x) => x.id === id);
        return t ? String(t.title ?? '') : '(eliminato)';
    };

    const head: string[] = [];
    head.push(`# Progetto ${projectId} «${String(p.name ?? '')}»`);
    if (p.description) head.push(String(p.description));
    const meta: string[] = [];
    meta.push(`task ${p.doneCount ?? 0}/${p.taskCount ?? 0}`);
    if (p.dueDate) meta.push(`scad. ${fmtDate(p.dueDate)}`);
    if (p.obiettivoId) meta.push(`obiettivo: ${p.obiettivoId}`);
    if (p.archived === true) meta.push('ARCHIVIATO');
    head.push(meta.join(' · '));

    const linkedTaskIds = new Set<string>();
    deliverables.forEach((d) => (Array.isArray(d.deliverableTaskIds) ? d.deliverableTaskIds : []).forEach((id) => linkedTaskIds.add(String(id))));

    const renderDeliverable = (d: TaskRow, indent: string): string[] => {
        const out = [`${indent}- 📦 deliverable ${fmtEntity(d)}`];
        const ids = (Array.isArray(d.deliverableTaskIds) ? d.deliverableTaskIds : []).map(String);
        for (const tid of ids) {
            const t = tasks.find((x) => x.id === tid);
            out.push(`${indent}    - task ${t ? fmtEntity(t) : `«${findTitle(tid)}» (${tid})`}`);
        }
        return out;
    };

    const lines: string[] = [];
    // Milestone → deliverable figli → task
    lines.push(`\n## Milestone (${milestones.length})`);
    if (!milestones.length) lines.push('_(nessuna)_');
    for (const m of milestones) {
        lines.push(`- 🎯 milestone ${fmtEntity(m)}`);
        const childDelivs = deliverables.filter((d) => String(d.milestoneId ?? '') === m.id);
        if (!childDelivs.length) lines.push('    _(nessun deliverable collegato)_');
        for (const d of childDelivs) lines.push(...renderDeliverable(d, '    '));
    }

    // Deliverable senza milestone
    const orphanDelivs = deliverables.filter((d) => !milestones.some((m) => m.id === String(d.milestoneId ?? '')));
    if (orphanDelivs.length) {
        lines.push(`\n## Deliverable senza milestone (${orphanDelivs.length})`);
        for (const d of orphanDelivs) lines.push(...renderDeliverable(d, ''));
    }

    // Task liberi (non collegati ad alcun deliverable)
    const freeTasks = tasks.filter((t) => !linkedTaskIds.has(t.id));
    lines.push(`\n## Task liberi (${freeTasks.length})`);
    if (!freeTasks.length) lines.push('_(nessuno)_');
    for (const t of freeTasks) lines.push(`- task ${fmtEntity(t)}`);

    // Istruzioni di link: i task/milestone/deliverable vivono in
    // projects/{projectId}/tasks → SERVE projectId, altrimenti il chip risulta
    // "[Task eliminato]". Forniamo le chiamate pronte con projectId già valorizzato.
    const hint = `\n\n— Per citare questi elementi in un doc NEBULA usa (projectId="${projectId}"):\n`
        + `· task → nebula_linkTask(docId, taskId, projectId="${projectId}")\n`
        + `· milestone → nebula_linkMilestone(docId, projectId="${projectId}", milestoneId)\n`
        + `· deliverable → nebula_linkDeliverable(docId, projectId="${projectId}", deliverableId)\n`
        + `· progetto → nebula_linkProject(docId, projectId="${projectId}")\n`
        + `In markdown (createDoc/appendBlock): @task:${projectId}/<id>, @milestone:${projectId}/<id>, @deliverable:${projectId}/<id>, @project:${projectId}. NON usare @task:<id> senza projectId.`;

    return { text: `${head.join('\n')}\n${lines.join('\n')}${hint}` };
}

/**
 * Singola entità task/milestone/deliverable (stesso path projects/{id}/tasks/{id}).
 * Risolve le relazioni in base al type. Nessun gate (read-only).
 */
export async function getTask(args: { projectId?: string; taskId?: string }, _ctx: ToolContext): Promise<ToolOut> {
    const db = admin.firestore();
    const projectId = String(args?.projectId ?? '').trim();
    const taskId = String(args?.taskId ?? '').trim();
    if (!projectId) throw new Error('Il campo `projectId` è obbligatorio.');
    if (!taskId) throw new Error('Il campo `taskId` è obbligatorio.');

    const snap = await db.doc(`projects/${projectId}/tasks/${taskId}`).get();
    if (!snap.exists) throw new Error(`Entità ${taskId} inesistente nel progetto ${projectId}.`);
    const x = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as TaskRow;
    const type = pickType(x.type);

    const out: string[] = [];
    out.push(`# ${type} ${fmtEntity(x)}`);
    out.push(`progetto: ${projectId}`);
    if (x.description) out.push(`\n${String(x.description)}`);

    if (type === 'deliverable') {
        if (x.milestoneId) {
            const mSnap = await db.doc(`projects/${projectId}/tasks/${String(x.milestoneId)}`).get();
            out.push(`\nMilestone: «${String(mSnap.data()?.title ?? '(eliminata)')}» (${String(x.milestoneId)})`);
        } else {
            out.push('\nMilestone: _(nessuna)_');
        }
        const ids = (Array.isArray(x.deliverableTaskIds) ? x.deliverableTaskIds : []).map(String);
        out.push(`\nTask collegati (${ids.length}):`);
        for (const tid of ids) {
            const tSnap = await db.doc(`projects/${projectId}/tasks/${tid}`).get();
            out.push(tSnap.exists
                ? `- ${fmtEntity({ id: tSnap.id, ...(tSnap.data() as Record<string, unknown>) })}`
                : `- (eliminato) (${tid})`);
        }
    } else if (type === 'milestone') {
        const dSnap = await db.collection(`projects/${projectId}/tasks`)
            .where('type', '==', 'deliverable').where('milestoneId', '==', taskId).get();
        out.push(`\nDeliverable collegati (${dSnap.size}):`);
        if (!dSnap.size) out.push('_(nessuno)_');
        dSnap.forEach((d) => out.push(`- ${fmtEntity({ id: d.id, ...(d.data() as Record<string, unknown>) })}`));
    }

    const linkTool = type === 'milestone' ? 'nebula_linkMilestone' : type === 'deliverable' ? 'nebula_linkDeliverable' : 'nebula_linkTask';
    out.push(`\n— Per citarlo in un doc NEBULA: ${linkTool}(docId, projectId="${projectId}", ${type === 'task' ? 'taskId' : type + 'Id'}="${taskId}"). Passa SEMPRE projectId, altrimenti il chip risulta "[Task eliminato]".`);

    return { text: out.join('\n') };
}

/** Lista obiettivi (collection top-level `obiettivi`). Esclude archiviati di default. */
export async function listObiettivi(
    args: { includeArchived?: boolean; limit?: number },
    _ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
    const snap = await db.collection('obiettivi').limit(limit).get();
    const rows = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        .filter(({ data }) => (args?.includeArchived ? true : data.stato !== 'archiviato'))
        .map(({ id, data }) => {
            const periodo = data.periodKind === 'year'
                ? `anno ${data.anno ?? ''}`
                : [fmtDate(data.startDate), fmtDate(data.endDate)].filter(Boolean).join(' → ');
            const st = data.stato ? `[${data.stato}]` : '';
            return `- ${id}  ${st} «${String(data.titolo ?? '')}»${periodo ? `  (${periodo})` : ''}`;
        });
    return { text: rows.length ? `Obiettivi (${rows.length}):\n${rows.join('\n')}` : 'Nessun obiettivo trovato.' };
}

/** Singolo obiettivo + progetti collegati (`projects.obiettivoId == id`). */
export async function getObiettivo(args: { obiettivoId?: string }, _ctx: ToolContext): Promise<ToolOut> {
    const db = admin.firestore();
    const obiettivoId = String(args?.obiettivoId ?? '').trim();
    if (!obiettivoId) throw new Error('Il campo `obiettivoId` è obbligatorio (usa cepheid_listObiettivi).');

    const snap = await db.doc(`obiettivi/${obiettivoId}`).get();
    if (!snap.exists) throw new Error(`Obiettivo ${obiettivoId} inesistente.`);
    const o = snap.data() as Record<string, unknown>;

    const out: string[] = [];
    const st = o.stato ? `[${o.stato}]` : '';
    out.push(`# Obiettivo ${obiettivoId}  ${st} «${String(o.titolo ?? '')}»`);
    if (o.descrizione) out.push(String(o.descrizione));
    const periodo = o.periodKind === 'year'
        ? `anno ${o.anno ?? ''}`
        : [fmtDate(o.startDate), fmtDate(o.endDate)].filter(Boolean).join(' → ');
    if (periodo) out.push(`periodo: ${periodo}`);

    const projSnap = await db.collection('projects').where('obiettivoId', '==', obiettivoId).get();
    out.push(`\nProgetti collegati (${projSnap.size}):`);
    if (!projSnap.size) out.push('_(nessuno)_');
    projSnap.forEach((d) => {
        const p = d.data() as Record<string, unknown>;
        out.push(`- ${d.id} «${String(p.name ?? '')}»  task ${p.doneCount ?? 0}/${p.taskCount ?? 0}`);
    });

    return { text: out.join('\n') };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE TOOLS (assertCoreAdmin obbligatorio)
// ─────────────────────────────────────────────────────────────────────────────

export async function createProject(
    args: { name?: string; description?: string; color?: string; dueDate?: string; obiettivoId?: string | null },
    ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);

    const name = String(args?.name ?? '').trim();
    if (!name) throw new Error('Il campo `name` è obbligatorio.');

    const uid = await resolveCallerUid(userEmail);
    const due = parseDate(args?.dueDate);

    const ref = await db.collection('projects').add({
        name,
        description: String(args?.description ?? ''),
        color: String(args?.color ?? '#2F6B4A'),
        dueDate: due.ts,
        states: DEFAULT_STATES,
        members: [],
        notes: '',
        taskCount: 0,
        doneCount: 0,
        obiettivoId: args?.obiettivoId ?? null,
        archived: false,
        active: true,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const warn = due.invalid ? '\n⚠️ `dueDate` non valida, ignorata.' : '';
    return { text: `Progetto creato: ${ref.id} «${name}».${warn}` };
}

export async function createTask(
    args: {
        projectId?: string; title?: string; status?: string; priority?: string;
        startDate?: string; dueDate?: string; assignees?: string[]; type?: string;
        milestoneId?: string | null; deliverableTaskIds?: string[];
    },
    ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);

    const projectId = String(args?.projectId ?? '').trim();
    const title = String(args?.title ?? '').trim();
    if (!projectId) throw new Error('Il campo `projectId` è obbligatorio (usa cepheid_listProjects).');
    if (!title) throw new Error('Il campo `title` è obbligatorio.');

    const projRef = db.doc(`projects/${projectId}`);
    if (!(await projRef.get()).exists) throw new Error(`Progetto ${projectId} inesistente.`);

    const type = pickType(args?.type);
    const priority = pickPriority(args?.priority);
    const status = String(args?.status ?? 'todo');
    const uid = await resolveCallerUid(userEmail);
    const { resolved, unmatched } = await resolveAssignees(db, args?.assignees);
    const start = parseDate(args?.startDate);
    const due = parseDate(args?.dueDate);
    // Relazioni opzionali: un deliverable può collegare una milestone e dei task.
    const milestoneId = String(args?.milestoneId ?? '').trim() || null;
    const deliverableTaskIds = (Array.isArray(args?.deliverableTaskIds) ? args!.deliverableTaskIds : [])
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
        triaged: type !== 'task',   // task nuovi → inbox (smistamento), milestone/deliverable no
        createdBy: uid,
        createdByEmail: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
        completedBy: null,
    });
    if (type === 'task') {
        await projRef.update({ taskCount: admin.firestore.FieldValue.increment(1) });
    }

    const warns: string[] = [];
    if (unmatched.length) warns.push(`assignee non trovati in /team (ignorati): ${unmatched.join(', ')}`);
    if (start.invalid) warns.push('`startDate` non valida, ignorata');
    if (due.invalid) warns.push('`dueDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    // Suggerisci la mention QUALIFICATA col progetto: i task vivono in
    // projects/{pid}/tasks/{id}, quindi referenziarli in un doc come @task:{id}
    // (senza progetto) li fa risultare "Task eliminato". Forma corretta sotto.
    return { text: `${type} creato: ${ref.id} «${title}» nel progetto ${projectId}.${warn}\nPer citarlo in un doc Nebula usa la mention: @task:${projectId}/${ref.id}` };
}

/** Crea una "fase" atomica = milestone (nuova XOR esistente) + deliverable
 *  (con milestoneId + deliverableTaskIds) + N task collegati. Replica
 *  createPhaseBundle (useProjectTasks.ts:211-258) con writeBatch Admin SDK. */
export async function createPhase(
    args: {
        projectId?: string;
        milestoneExistingId?: string; milestoneTitle?: string; milestoneDueDate?: string;
        deliverableTitle?: string; deliverableDueDate?: string; deliverableAssignees?: string[];
        taskTitles?: string[];
    },
    ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);

    const projectId = String(args?.projectId ?? '').trim();
    const deliverableTitle = String(args?.deliverableTitle ?? '').trim();
    const taskTitles = (Array.isArray(args?.taskTitles) ? args!.taskTitles : [])
        .map((t) => String(t).trim()).filter(Boolean);
    if (!projectId) throw new Error('Il campo `projectId` è obbligatorio.');
    if (!deliverableTitle) throw new Error('Il campo `deliverableTitle` è obbligatorio.');

    const hasExisting = !!String(args?.milestoneExistingId ?? '').trim();
    const hasNew = !!String(args?.milestoneTitle ?? '').trim();
    if (hasExisting === hasNew) {
        throw new Error('Fornire esattamente uno tra `milestoneExistingId` e `milestoneTitle`.');
    }

    const projRef = db.doc(`projects/${projectId}`);
    if (!(await projRef.get()).exists) throw new Error(`Progetto ${projectId} inesistente.`);

    const col = projRef.collection('tasks');
    const uid = await resolveCallerUid(userEmail);
    const { resolved: delivAssignees, unmatched } = await resolveAssignees(db, args?.deliverableAssignees);
    const mDue = parseDate(args?.milestoneDueDate);
    const dDue = parseDate(args?.deliverableDueDate);

    const batch = db.batch();
    const base = {
        startDate: null, description: '', order: null, approved: false, approvedAt: null,
        deliverableId: null, triaged: true, createdBy: uid, createdByEmail: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), completedAt: null, completedBy: null,
    };

    let milestoneId: string;
    if (hasExisting) {
        milestoneId = String(args!.milestoneExistingId).trim();
    } else {
        milestoneId = col.doc().id;
        batch.set(col.doc(milestoneId), {
            ...base, title: String(args!.milestoneTitle).trim(), status: 'todo', priority: 'media',
            dueDate: mDue.ts, assignees: [], type: 'milestone', deliverableTaskIds: [], milestoneId: null,
        });
    }

    const newTaskIds = taskTitles.map(() => col.doc().id);
    taskTitles.forEach((title, i) => {
        batch.set(col.doc(newTaskIds[i]), {
            ...base, title, status: 'todo', priority: 'media', dueDate: null,
            assignees: [], type: 'task', deliverableTaskIds: [], milestoneId: null, triaged: false,
        });
    });

    const delivId = col.doc().id;
    batch.set(col.doc(delivId), {
        ...base, title: deliverableTitle, status: 'todo', priority: 'media',
        dueDate: dDue.ts, assignees: delivAssignees, type: 'deliverable',
        deliverableTaskIds: newTaskIds, milestoneId,
    });

    if (newTaskIds.length) {
        batch.update(projRef, { taskCount: admin.firestore.FieldValue.increment(newTaskIds.length) });
    }
    await batch.commit();

    const warns: string[] = [];
    if (unmatched.length) warns.push(`assignee deliverable non trovati (ignorati): ${unmatched.join(', ')}`);
    if (mDue.invalid) warns.push('`milestoneDueDate` non valida, ignorata');
    if (dDue.invalid) warns.push('`deliverableDueDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    return {
        text: `Fase creata nel progetto ${projectId}: milestone ${milestoneId}${hasNew ? ' (nuova)' : ' (esistente)'}, `
            + `deliverable ${delivId}, ${newTaskIds.length} task.${warn}`,
    };
}

/** Crea un Obiettivo (collection top-level `obiettivi`). Solo CORE admin.
 *  Replica useObiettivi.createObiettivo (useObiettivi.ts:72-93). */
export async function createObiettivo(
    args: {
        titolo?: string; descrizione?: string; periodKind?: string;
        startDate?: string; endDate?: string; colore?: string;
    },
    ctx: ToolContext,
): Promise<ToolOut> {
    const db = admin.firestore();
    const userEmail = normEmail(ctx.userEmail);
    await assertCoreAdmin(db, userEmail);

    const titolo = String(args?.titolo ?? '').trim();
    if (!titolo) throw new Error('Il campo `titolo` è obbligatorio.');

    const periodKind = args?.periodKind === 'quarters' ? 'quarters' : 'year';
    const start = parseDate(args?.startDate);
    const end = parseDate(args?.endDate);
    const uid = await resolveCallerUid(userEmail);
    const anno = start.ts ? start.ts.toDate().getFullYear() : new Date().getFullYear();

    const ref = await db.collection('obiettivi').add({
        titolo,
        descrizione: String(args?.descrizione ?? ''),
        periodKind,
        startDate: start.ts,
        endDate: end.ts,
        anno,
        stato: 'attivo',
        colore: String(args?.colore ?? '#D4A020'),
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const warns: string[] = [];
    if (start.invalid) warns.push('`startDate` non valida, ignorata');
    if (end.invalid) warns.push('`endDate` non valida, ignorata');
    const warn = warns.length ? `\n⚠️ ${warns.join('; ')}` : '';
    return { text: `Obiettivo creato: ${ref.id} «${titolo}».${warn}` };
}
