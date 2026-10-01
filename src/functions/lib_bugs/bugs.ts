import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { checkRateLimit } from '../lib_mcp/rateLimit';

const SUPER_ADMIN = 'info@inglesinaitaliana.it';

type BugStatus = 'da_analizzare' | 'in_corso' | 'risolto' | 'non_riproducibile';
type BugCategory = 'ui' | 'funzionale' | 'performance' | 'dati' | 'suggerimento';
type BugPriority = 'alta' | 'media' | 'bassa';

function normEmail(email: string | undefined | null): string {
  return (email ?? '').toLowerCase().trim();
}

export async function isCoreAdminUser(db: FirebaseFirestore.Firestore, email: string): Promise<boolean> {
  const e = normEmail(email);
  if (!e) return false;
  if (e === SUPER_ADMIN) return true;
  const snap = await db.doc('core/admins').get();
  const emails: string[] = (snap.data()?.emails ?? []).map((x: unknown) => normEmail(String(x)));
  return emails.includes(e);
}

function parseAffectedArea(pageUrl: string, path?: string): string {
  const p = path ?? (() => {
    try { return new URL(pageUrl).pathname; } catch { return ''; }
  })();
  if (p.includes('/preventivatore')) return 'preventivatore';
  if (p.includes('/dashboard')) return 'dashboard';
  if (p.includes('/delivery')) return 'delivery';
  if (p.includes('/production')) return 'production';
  if (p.includes('/admin')) return 'admin';
  return 'other';
}

function parsePreventivoCodice(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).searchParams.get('codice');
  } catch {
    return null;
  }
}

function categoryFromUi(label: string): BugCategory {
  const map: Record<string, BugCategory> = {
    'UI/Grafica': 'ui',
    'Errore Funzionale': 'funzionale',
    'Performance': 'performance',
    'Dati Errati': 'dati',
    'Suggerimento': 'suggerimento',
    ui: 'ui',
    funzionale: 'funzionale',
    performance: 'performance',
    dati: 'dati',
    suggerimento: 'suggerimento',
  };
  return map[label] ?? 'funzionale';
}

async function nextBugNumber(db: FirebaseFirestore.Firestore): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = db.doc('counters/bugs');
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const curYear = snap.exists ? (snap.data()?.year as number) : year;
    let n = snap.exists ? (snap.data()?.seq as number) : 0;
    if (curYear !== year) n = 0;
    n += 1;
    tx.set(counterRef, { year, seq: n }, { merge: true });
    return n;
  });
  return `BUG-${year}-${String(seq).padStart(3, '0')}`;
}

async function notifyCoreAdminsNewBug(
  db: FirebaseFirestore.Firestore,
  bugNumber: string,
  title: string,
): Promise<void> {
  try {
    const adminsSnap = await db.doc('core/admins').get();
    const adminEmails: string[] = [SUPER_ADMIN, ...((adminsSnap.data()?.emails ?? []) as string[])].map(normEmail);
    const uniqueEmails = Array.from(new Set(adminEmails.filter(Boolean)));

    const tokens: string[] = [];
    for (const em of uniqueEmails) {
      const teamSnaps = await db.collection('team').where('email', '==', em).get();
      for (const ts of teamSnaps.docs) {
        const tokensMap = ts.data()?.fcmTokens ?? {};
        for (const [tk, val] of Object.entries(tokensMap)) {
          if (isDesktopBugNotifyToken(val)) tokens.push(tk);
        }
      }
    }
    const uniqueTokens = Array.from(new Set(tokens));
    if (!uniqueTokens.length) return;

    await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      data: {
        scope: 'sidera',
        type: 'new_bug',
        bugNumber,
        title: `SIDERA · ${bugNumber}`,
        body: title.length > 140 ? `${title.slice(0, 137)}…` : title,
        url: '/sidera/core/bugs',
        messageId: `bug:${bugNumber}`,
      },
    });
  } catch (e) {
    console.error('[bugs] FCM notify failed', e);
  }
}

/** Token FCM idonei alle notifiche bug: solo browser desktop (non PWA QUASAR/mobile). */
function isDesktopBugNotifyToken(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  const entry = val as { scope?: string; desktop?: boolean; ua?: string };
  if (entry.scope !== 'sidera') return false;
  if (entry.desktop === true) return true;
  if (entry.desktop === false) return false;
  // Legacy token senza flag: inferisci da UA se presente, altrimenti escludi.
  const ua = entry.ua ?? '';
  if (!ua) return false;
  return !/iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function registerBugFunctions() {
  const submitBug = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere loggato per segnalare un bug.');
      }

      const uid = context.auth.uid;
      const email = normEmail(context.auth.token.email) || 'sconosciuto';
      const rl = await checkRateLimit(`bug_submit:${uid}`, 5, 3600);
      if (!rl.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', 'Troppe segnalazioni. Riprova più tardi.');
      }

      const title = String(data?.title ?? '').trim().slice(0, 200);
      const description = String(data?.description ?? '').trim().slice(0, 4000);
      const pageUrl = String(data?.pageUrl ?? '').slice(0, 2000);
      const category = categoryFromUi(String(data?.category ?? 'Errore Funzionale'));
      const technicalContext = data?.technicalContext ?? {};
      const source = data?.source === 'sidera' ? 'sidera' : 'pops';

      if (!title || !description) {
        throw new functions.https.HttpsError('invalid-argument', 'Titolo e descrizione obbligatori.');
      }

      const db = admin.firestore();
      const teamSnap = await db.collection('team').doc(uid).get();
      const reporterType = teamSnap.exists ? 'team' : 'client';

      let reporterCompany: string | null = null;
      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) {
        reporterCompany = (userSnap.data()?.ragioneSociale as string) ?? null;
      }

      const bugNumber = await nextBugNumber(db);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const path = typeof technicalContext.path === 'string' ? technicalContext.path : '';

      const docRef = await db.collection('bugs').add({
        bugNumber,
        title,
        description,
        status: 'da_analizzare' as BugStatus,
        category,
        priority: 'media' as BugPriority,
        pageUrl,
        affectedArea: parseAffectedArea(pageUrl, path),
        preventivoCodice: parsePreventivoCodice(pageUrl),
        reportedBy: email,
        reportedByUid: uid,
        reporterType,
        reporterCompany,
        technicalContext,
        internalNotes: '',
        assigneeUid: null,
        linkedTaskId: null,
        linkedTaskProjectId: null,
        duplicateOf: null,
        source,
        notionPageId: null,
        statusHistory: [{
          status: 'da_analizzare',
          by: uid,
          byEmail: email,
          at: admin.firestore.Timestamp.now(),
        }],
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });

      await notifyCoreAdminsNewBug(db, bugNumber, title);
      return { success: true, bugId: docRef.id, bugNumber };
    });

  const updateBug = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
      }
      const email = normEmail(context.auth.token.email);
      const db = admin.firestore();
      if (!(await isCoreAdminUser(db, email))) {
        throw new functions.https.HttpsError('permission-denied', 'Solo CORE admin');
      }

      const bugId = String(data?.bugId ?? '');
      if (!bugId) throw new functions.https.HttpsError('invalid-argument', 'bugId mancante');

      const ref = db.collection('bugs').doc(bugId);
      const snap = await ref.get();
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Bug non trovato');

      const patch: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      const allowedStatus: BugStatus[] = ['da_analizzare', 'in_corso', 'risolto', 'non_riproducibile'];
      const allowedPriority: BugPriority[] = ['alta', 'media', 'bassa'];
      const allowedCategory: BugCategory[] = ['ui', 'funzionale', 'performance', 'dati', 'suggerimento'];

      if (data?.status && allowedStatus.includes(data.status)) {
        patch.status = data.status;
        if (data.status === 'risolto') {
          patch.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        const hist = snap.data()?.statusHistory ?? [];
        patch.statusHistory = [
          ...hist,
          {
            status: data.status,
            by: context.auth.uid,
            byEmail: email,
            at: admin.firestore.Timestamp.now(),
          },
        ];
      }
      if (data?.priority && allowedPriority.includes(data.priority)) patch.priority = data.priority;
      if (data?.category && allowedCategory.includes(data.category)) patch.category = data.category;
      if (typeof data?.internalNotes === 'string') patch.internalNotes = data.internalNotes.slice(0, 4000);
      if (data?.assigneeUid === null || typeof data?.assigneeUid === 'string') {
        patch.assigneeUid = data.assigneeUid || null;
      }

      await ref.update(patch);
      return { success: true };
    });

  const promoteBugToTask = functions
    .region('europe-west1')
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
      }
      const email = normEmail(context.auth.token.email);
      const db = admin.firestore();
      if (!(await isCoreAdminUser(db, email))) {
        throw new functions.https.HttpsError('permission-denied', 'Solo CORE admin');
      }

      const bugId = String(data?.bugId ?? '');
      if (!bugId) throw new functions.https.HttpsError('invalid-argument', 'bugId mancante');

      const bugRef = db.collection('bugs').doc(bugId);
      const bugSnap = await bugRef.get();
      if (!bugSnap.exists) throw new functions.https.HttpsError('not-found', 'Bug non trovato');

      const bug = bugSnap.data()!;
      if (bug.linkedTaskId) {
        throw new functions.https.HttpsError('already-exists', 'Azione CEPHEID già collegata.');
      }

      const bugNumber = bug.bugNumber as string;
      const taskTitle = `[${bugNumber}] ${bug.title}`;
      const descParts = [
        bug.description,
        '',
        `URL: ${bug.pageUrl || '—'}`,
        `Segnalato da: ${bug.reporterCompany || bug.reportedBy}`,
        `Bug: /sidera/core/bugs/${bugId}`,
      ];

      const taskRef = await db.collection('tasks').add({
        title: taskTitle,
        status: 'todo',
        priority: (bug.priority as BugPriority) || 'media',
        startDate: null,
        dueDate: null,
        description: descParts.join('\n'),
        assignees: bug.assigneeUid ? [bug.assigneeUid] : [],
        projectId: null,
        type: 'task',
        deliverableTaskIds: [],
        order: null,
        approved: false,
        approvedAt: null,
        deliverableId: null,
        milestoneId: null,
        triaged: true,
        createdBy: context.auth.uid,
        createdByEmail: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
        completedBy: null,
        sourceChatId: null,
        sourceMessageId: null,
        sourceBugId: bugId,
        sourceBugNumber: bugNumber,
      });

      const now = admin.firestore.Timestamp.now();
      const hist = bug.statusHistory ?? [];
      await bugRef.update({
        linkedTaskId: taskRef.id,
        linkedTaskProjectId: '',
        status: 'in_corso',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: [
          ...hist,
          { status: 'in_corso', by: context.auth.uid, byEmail: email, at: now },
        ],
      });

      return { success: true, taskId: taskRef.id };
    });

  return { submitBug, updateBug, promoteBugToTask };
}
