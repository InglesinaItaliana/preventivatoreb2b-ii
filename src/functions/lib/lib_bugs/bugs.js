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
exports.isCoreAdminUser = isCoreAdminUser;
exports.registerBugFunctions = registerBugFunctions;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const rateLimit_1 = require("../lib_mcp/rateLimit");
const SUPER_ADMIN = 'info@inglesinaitaliana.it';
function normEmail(email) {
    return (email !== null && email !== void 0 ? email : '').toLowerCase().trim();
}
async function isCoreAdminUser(db, email) {
    var _a, _b;
    const e = normEmail(email);
    if (!e)
        return false;
    if (e === SUPER_ADMIN)
        return true;
    const snap = await db.doc('core/admins').get();
    const emails = ((_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.emails) !== null && _b !== void 0 ? _b : []).map((x) => normEmail(String(x)));
    return emails.includes(e);
}
function parseAffectedArea(pageUrl, path) {
    const p = path !== null && path !== void 0 ? path : (() => {
        try {
            return new URL(pageUrl).pathname;
        }
        catch (_a) {
            return '';
        }
    })();
    if (p.includes('/preventivatore'))
        return 'preventivatore';
    if (p.includes('/dashboard'))
        return 'dashboard';
    if (p.includes('/delivery'))
        return 'delivery';
    if (p.includes('/production'))
        return 'production';
    if (p.includes('/admin'))
        return 'admin';
    return 'other';
}
function parsePreventivoCodice(pageUrl) {
    try {
        return new URL(pageUrl).searchParams.get('codice');
    }
    catch (_a) {
        return null;
    }
}
function categoryFromUi(label) {
    var _a;
    const map = {
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
    return (_a = map[label]) !== null && _a !== void 0 ? _a : 'funzionale';
}
async function nextBugNumber(db) {
    const year = new Date().getFullYear();
    const counterRef = db.doc('counters/bugs');
    const seq = await db.runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(counterRef);
        const curYear = snap.exists ? (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.year : year;
        let n = snap.exists ? (_b = snap.data()) === null || _b === void 0 ? void 0 : _b.seq : 0;
        if (curYear !== year)
            n = 0;
        n += 1;
        tx.set(counterRef, { year, seq: n }, { merge: true });
        return n;
    });
    return `BUG-${year}-${String(seq).padStart(3, '0')}`;
}
async function notifyCoreAdminsNewBug(db, bugNumber, title) {
    var _a, _b, _c, _d;
    try {
        const adminsSnap = await db.doc('core/admins').get();
        const adminEmails = [SUPER_ADMIN, ...((_b = (_a = adminsSnap.data()) === null || _a === void 0 ? void 0 : _a.emails) !== null && _b !== void 0 ? _b : [])].map(normEmail);
        const uniqueEmails = Array.from(new Set(adminEmails.filter(Boolean)));
        const tokens = [];
        for (const em of uniqueEmails) {
            const teamSnaps = await db.collection('team').where('email', '==', em).get();
            for (const ts of teamSnaps.docs) {
                const tokensMap = (_d = (_c = ts.data()) === null || _c === void 0 ? void 0 : _c.fcmTokens) !== null && _d !== void 0 ? _d : {};
                for (const [tk, val] of Object.entries(tokensMap)) {
                    if (isDesktopBugNotifyToken(val))
                        tokens.push(tk);
                }
            }
        }
        const uniqueTokens = Array.from(new Set(tokens));
        if (!uniqueTokens.length)
            return;
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
    }
    catch (e) {
        console.error('[bugs] FCM notify failed', e);
    }
}
/** Token FCM idonei alle notifiche bug: solo browser desktop (non PWA QUASAR/mobile). */
function isDesktopBugNotifyToken(val) {
    var _a;
    if (!val || typeof val !== 'object')
        return false;
    const entry = val;
    if (entry.scope !== 'sidera')
        return false;
    if (entry.desktop === true)
        return true;
    if (entry.desktop === false)
        return false;
    // Legacy token senza flag: inferisci da UA se presente, altrimenti escludi.
    const ua = (_a = entry.ua) !== null && _a !== void 0 ? _a : '';
    if (!ua)
        return false;
    return !/iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}
function registerBugFunctions() {
    const submitBug = functions
        .region('europe-west1')
        .https.onCall(async (data, context) => {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Devi essere loggato per segnalare un bug.');
        }
        const uid = context.auth.uid;
        const email = normEmail(context.auth.token.email) || 'sconosciuto';
        const rl = await (0, rateLimit_1.checkRateLimit)(`bug_submit:${uid}`, 5, 3600);
        if (!rl.allowed) {
            throw new functions.https.HttpsError('resource-exhausted', 'Troppe segnalazioni. Riprova più tardi.');
        }
        const title = String((_a = data === null || data === void 0 ? void 0 : data.title) !== null && _a !== void 0 ? _a : '').trim().slice(0, 200);
        const description = String((_b = data === null || data === void 0 ? void 0 : data.description) !== null && _b !== void 0 ? _b : '').trim().slice(0, 4000);
        const pageUrl = String((_c = data === null || data === void 0 ? void 0 : data.pageUrl) !== null && _c !== void 0 ? _c : '').slice(0, 2000);
        const category = categoryFromUi(String((_d = data === null || data === void 0 ? void 0 : data.category) !== null && _d !== void 0 ? _d : 'Errore Funzionale'));
        const technicalContext = (_e = data === null || data === void 0 ? void 0 : data.technicalContext) !== null && _e !== void 0 ? _e : {};
        const source = (data === null || data === void 0 ? void 0 : data.source) === 'sidera' ? 'sidera' : 'pops';
        if (!title || !description) {
            throw new functions.https.HttpsError('invalid-argument', 'Titolo e descrizione obbligatori.');
        }
        const db = admin.firestore();
        const teamSnap = await db.collection('team').doc(uid).get();
        const reporterType = teamSnap.exists ? 'team' : 'client';
        let reporterCompany = null;
        const userSnap = await db.collection('users').doc(uid).get();
        if (userSnap.exists) {
            reporterCompany = (_g = (_f = userSnap.data()) === null || _f === void 0 ? void 0 : _f.ragioneSociale) !== null && _g !== void 0 ? _g : null;
        }
        const bugNumber = await nextBugNumber(db);
        const now = admin.firestore.FieldValue.serverTimestamp();
        const path = typeof technicalContext.path === 'string' ? technicalContext.path : '';
        const docRef = await db.collection('bugs').add({
            bugNumber,
            title,
            description,
            status: 'da_analizzare',
            category,
            priority: 'media',
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
        var _a, _b, _c;
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
        }
        const email = normEmail(context.auth.token.email);
        const db = admin.firestore();
        if (!(await isCoreAdminUser(db, email))) {
            throw new functions.https.HttpsError('permission-denied', 'Solo CORE admin');
        }
        const bugId = String((_a = data === null || data === void 0 ? void 0 : data.bugId) !== null && _a !== void 0 ? _a : '');
        if (!bugId)
            throw new functions.https.HttpsError('invalid-argument', 'bugId mancante');
        const ref = db.collection('bugs').doc(bugId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new functions.https.HttpsError('not-found', 'Bug non trovato');
        const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const allowedStatus = ['da_analizzare', 'in_corso', 'risolto', 'non_riproducibile'];
        const allowedPriority = ['alta', 'media', 'bassa'];
        const allowedCategory = ['ui', 'funzionale', 'performance', 'dati', 'suggerimento'];
        if ((data === null || data === void 0 ? void 0 : data.status) && allowedStatus.includes(data.status)) {
            patch.status = data.status;
            if (data.status === 'risolto') {
                patch.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            const hist = (_c = (_b = snap.data()) === null || _b === void 0 ? void 0 : _b.statusHistory) !== null && _c !== void 0 ? _c : [];
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
        if ((data === null || data === void 0 ? void 0 : data.priority) && allowedPriority.includes(data.priority))
            patch.priority = data.priority;
        if ((data === null || data === void 0 ? void 0 : data.category) && allowedCategory.includes(data.category))
            patch.category = data.category;
        if (typeof (data === null || data === void 0 ? void 0 : data.internalNotes) === 'string')
            patch.internalNotes = data.internalNotes.slice(0, 4000);
        if ((data === null || data === void 0 ? void 0 : data.assigneeUid) === null || typeof (data === null || data === void 0 ? void 0 : data.assigneeUid) === 'string') {
            patch.assigneeUid = data.assigneeUid || null;
        }
        await ref.update(patch);
        return { success: true };
    });
    const promoteBugToTask = functions
        .region('europe-west1')
        .https.onCall(async (data, context) => {
        var _a, _b;
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Richiesto login');
        }
        const email = normEmail(context.auth.token.email);
        const db = admin.firestore();
        if (!(await isCoreAdminUser(db, email))) {
            throw new functions.https.HttpsError('permission-denied', 'Solo CORE admin');
        }
        const bugId = String((_a = data === null || data === void 0 ? void 0 : data.bugId) !== null && _a !== void 0 ? _a : '');
        if (!bugId)
            throw new functions.https.HttpsError('invalid-argument', 'bugId mancante');
        const bugRef = db.collection('bugs').doc(bugId);
        const bugSnap = await bugRef.get();
        if (!bugSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Bug non trovato');
        const bug = bugSnap.data();
        if (bug.linkedTaskId) {
            throw new functions.https.HttpsError('already-exists', 'Azione CEPHEID già collegata.');
        }
        const bugNumber = bug.bugNumber;
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
            priority: bug.priority || 'media',
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
        const hist = (_b = bug.statusHistory) !== null && _b !== void 0 ? _b : [];
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
//# sourceMappingURL=bugs.js.map