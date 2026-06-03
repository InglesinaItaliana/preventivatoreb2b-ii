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

/** Risolve nomi/email passati da Claude in EMAIL valide presenti in /team
 *  (uid-keyed, campo `email`, active !== false). Match per email se contiene
 *  '@', altrimenti per nome. Gli input non risolti finiscono in `unmatched`
 *  e NON fanno fallire la creazione. */
async function resolveAssignees(
    db: admin.firestore.Firestore,
    raw: unknown,
): Promise<{ resolved: string[]; unmatched: string[] }> {
    const clean = (Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean);
    if (!clean.length) return { resolved: [], unmatched: [] };

    const snap = await db.collection('team').get();
    const byEmail = new Map<string, string>();   // emailLower → email canonica
    const byName = new Map<string, string>();     // nomeLower  → email
    snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        if (d.active === false) return;
        const email = normEmail(d.email);
        if (!email) return;
        byEmail.set(email, email);
        const names = [
            d.name,
            [d.firstName, d.lastName].filter(Boolean).join(' '),
            d.firstName,
        ];
        for (const n of names) {
            const key = String(n ?? '').toLowerCase().trim();
            if (key) byName.set(key, email);
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
        deliverableTaskIds: [],
        order: null,
        approved: false,
        approvedAt: null,
        deliverableId: null,
        milestoneId: null,
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
