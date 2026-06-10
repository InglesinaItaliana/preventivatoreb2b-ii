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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFicSearchFunctions = registerFicSearchFunctions;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const bugs_1 = require("../lib_bugs/bugs");
const rateLimit_1 = require("../lib_mcp/rateLimit");
const BATCH_MAX_DOCS = 40;
const BATCH_MAX_MS = 20000;
const DETAIL_DELAY_MS = 130;
const MIN_SCORE = 50;
function normalize(s) {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}
function levenshteinRatio(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (!maxLen)
        return 1;
    return 1 - levenshtein(a, b) / maxLen;
}
function scoreField(query, raw, field) {
    const nq = normalize(query);
    const nv = normalize(raw);
    if (!nq || !nv)
        return null;
    if (nv.includes(nq)) {
        return { score: nv === nq ? 100 : 95, field, text: raw };
    }
    if (nv.startsWith(nq)) {
        return { score: 90, field, text: raw };
    }
    const tokens = nq.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => nv.includes(t))) {
        return { score: 75, field, text: raw };
    }
    const threshold = field === 'description' ? 0.65 : field === 'code' ? 0.72 : 0.7;
    const maxLen = field === 'code' ? 32 : 80;
    if (nq.length <= maxLen) {
        const ratio = levenshteinRatio(nq, nv);
        if (ratio >= threshold) {
            return { score: Math.round(50 + ratio * 35), field, text: raw };
        }
        // substring fuzzy: best window in nv
        if (nv.length >= nq.length) {
            let best = 0;
            for (let i = 0; i <= nv.length - nq.length; i++) {
                best = Math.max(best, levenshteinRatio(nq, nv.slice(i, i + nq.length)));
            }
            if (best >= threshold) {
                return { score: Math.round(50 + best * 30), field, text: raw };
            }
        }
    }
    return null;
}
function scoreLineItem(query, item) {
    const candidates = [];
    if (typeof item.code === 'string' && item.code.trim())
        candidates.push({ field: 'code', value: item.code });
    if (typeof item.name === 'string' && item.name.trim())
        candidates.push({ field: 'name', value: item.name });
    if (typeof item.description === 'string' && item.description.trim()) {
        candidates.push({ field: 'description', value: item.description });
    }
    let best = null;
    for (const c of candidates) {
        const hit = scoreField(query, c.value, c.field);
        if (hit && hit.score >= MIN_SCORE && (!best || hit.score > best.score)) {
            best = { score: hit.score, matchedField: hit.field, matchedText: hit.text };
        }
    }
    return best;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function buildTypeFilter(types) {
    const unique = Array.from(new Set(types));
    if (!unique.length || unique.length === 2)
        return undefined;
    return `type = '${unique[0]}'`;
}
function buildDateFilter(dateFrom, dateTo) {
    const parts = [];
    if (dateFrom)
        parts.push(`date >= '${dateFrom}'`);
    if (dateTo)
        parts.push(`date <= '${dateTo}'`);
    if (!parts.length)
        return undefined;
    return parts.join(' and ');
}
function combineFilters(...filters) {
    const active = filters.filter(Boolean);
    if (!active.length)
        return undefined;
    if (active.length === 1)
        return active[0];
    return active.map((f) => `(${f})`).join(' and ');
}
function docPassesDate(docDate, dateFrom, dateTo) {
    if (!docDate)
        return true;
    if (dateFrom && docDate < dateFrom)
        return false;
    if (dateTo && docDate > dateTo)
        return false;
    return true;
}
function ficScopeErrorMessage(err) {
    var _a;
    const status = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status;
    if (status === 403) {
        return 'Permesso negato da Fatture in Cloud. Verifica che il token OAuth in config/fic includa lo scope received_documents:r (FiC Developer Portal).';
    }
    return null;
}
function registerFicSearchFunctions(deps) {
    const searchFicReceivedItems = functions
        .region('europe-west1')
        .runWith({ timeoutSeconds: 120, memory: '512MB' })
        .https.onCall(async (data, context) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Devi essere loggato.');
        }
        const db = admin.firestore();
        const email = String((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : '');
        if (!(await (0, bugs_1.isCoreAdminUser)(db, email))) {
            throw new functions.https.HttpsError('permission-denied', 'Solo amministratori CORE.');
        }
        const uid = context.auth.uid;
        const rl = await (0, rateLimit_1.checkRateLimit)(`fic_search:${uid}`, 30, 3600);
        if (!rl.allowed) {
            throw new functions.https.HttpsError('resource-exhausted', 'Troppe ricerche. Riprova tra qualche minuto.');
        }
        const query = String((_b = data === null || data === void 0 ? void 0 : data.query) !== null && _b !== void 0 ? _b : '').trim();
        if (query.length < 2) {
            throw new functions.https.HttpsError('invalid-argument', 'Inserisci almeno 2 caratteri.');
        }
        const types = (((_c = data === null || data === void 0 ? void 0 : data.types) === null || _c === void 0 ? void 0 : _c.length) ? data.types : ['invoice', 'expense']);
        const dateFrom = (data === null || data === void 0 ? void 0 : data.dateFrom) ? String(data.dateFrom).slice(0, 10) : null;
        const dateTo = (data === null || data === void 0 ? void 0 : data.dateTo) ? String(data.dateTo).slice(0, 10) : null;
        const cursor = (_d = data === null || data === void 0 ? void 0 : data.cursor) !== null && _d !== void 0 ? _d : { page: 1, indexInPage: 0 };
        const token = await deps.getValidFicToken();
        const base = `${deps.ficApiUrl}/c/${deps.companyId}/received_documents`;
        const qFilter = combineFilters(buildTypeFilter(types), buildDateFilter(dateFrom, dateTo));
        const matches = [];
        let page = cursor.page;
        let indexInPage = cursor.indexInPage;
        let scannedDocs = 0;
        const started = Date.now();
        let hasMorePages = true;
        let scopeWarning;
        outer: while (scannedDocs < BATCH_MAX_DOCS && Date.now() - started < BATCH_MAX_MS && hasMorePages) {
            let listRes;
            try {
                listRes = await axios_1.default.get(base, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: Object.assign({ page, per_page: 50, sort: '-date' }, (qFilter ? { q: qFilter } : {})),
                });
            }
            catch (e) {
                const scopeMsg = ficScopeErrorMessage(e);
                if (scopeMsg)
                    throw new functions.https.HttpsError('permission-denied', scopeMsg);
                throw new functions.https.HttpsError('internal', 'Errore elenco documenti FiC.');
            }
            const docs = ((_f = (_e = listRes.data) === null || _e === void 0 ? void 0 : _e.data) !== null && _f !== void 0 ? _f : []);
            if (!docs.length) {
                hasMorePages = false;
                break;
            }
            while (indexInPage < docs.length) {
                if (scannedDocs >= BATCH_MAX_DOCS || Date.now() - started >= BATCH_MAX_MS) {
                    break outer;
                }
                const summary = docs[indexInPage];
                indexInPage++;
                const docId = summary.id;
                if (!docId)
                    continue;
                const docType = String((_g = summary.type) !== null && _g !== void 0 ? _g : '');
                if (types.length && !types.includes(docType))
                    continue;
                const summaryDate = String((_h = summary.date) !== null && _h !== void 0 ? _h : '').slice(0, 10);
                if (!docPassesDate(summaryDate, dateFrom, dateTo))
                    continue;
                scannedDocs++;
                let detail;
                try {
                    const detailRes = await axios_1.default.get(`${base}/${docId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    detail = (_k = (_j = detailRes.data) === null || _j === void 0 ? void 0 : _j.data) !== null && _k !== void 0 ? _k : {};
                }
                catch (e) {
                    const scopeMsg = ficScopeErrorMessage(e);
                    if (scopeMsg) {
                        scopeWarning = scopeWarning !== null && scopeWarning !== void 0 ? scopeWarning : scopeMsg;
                        throw new functions.https.HttpsError('permission-denied', scopeMsg);
                    }
                    await sleep(DETAIL_DELAY_MS);
                    continue;
                }
                const entity = ((_m = (_l = detail.entity) !== null && _l !== void 0 ? _l : summary.entity) !== null && _m !== void 0 ? _m : {});
                const items = ((_o = detail.items_list) !== null && _o !== void 0 ? _o : []);
                const docDate = String((_q = (_p = detail.date) !== null && _p !== void 0 ? _p : summaryDate) !== null && _q !== void 0 ? _q : '').slice(0, 10);
                const invoiceNumber = String((_s = (_r = detail.invoice_number) !== null && _r !== void 0 ? _r : summary.invoice_number) !== null && _s !== void 0 ? _s : '—');
                const supplierName = String((_t = entity.name) !== null && _t !== void 0 ? _t : '—');
                items.forEach((item, lineIndex) => {
                    var _a;
                    const hit = scoreLineItem(query, item);
                    if (!hit)
                        return;
                    matches.push({
                        documentId: docId,
                        lineIndex,
                        date: docDate,
                        invoiceNumber,
                        supplierName,
                        documentType: String((_a = detail.type) !== null && _a !== void 0 ? _a : docType),
                        line: {
                            code: typeof item.code === 'string' ? item.code : undefined,
                            name: typeof item.name === 'string' ? item.name : undefined,
                            description: typeof item.description === 'string' ? item.description : undefined,
                            qty: typeof item.qty === 'number' ? item.qty : undefined,
                            netPrice: typeof item.net_price === 'number' ? item.net_price : undefined,
                        },
                        matchScore: hit.score,
                        matchedField: hit.matchedField,
                        matchedText: hit.matchedText,
                    });
                });
                await sleep(DETAIL_DELAY_MS);
            }
            if (indexInPage >= docs.length) {
                if (!((_u = listRes.data) === null || _u === void 0 ? void 0 : _u.next_page_url)) {
                    hasMorePages = false;
                }
                else {
                    page++;
                    indexInPage = 0;
                }
            }
        }
        const done = !hasMorePages && indexInPage >= 0;
        matches.sort((a, b) => b.matchScore - a.matchScore || b.date.localeCompare(a.date));
        return Object.assign({ matches, cursor: done ? null : { page, indexInPage }, scannedDocs,
            done }, (scopeWarning ? { scopeWarning } : {}));
    });
    return { searchFicReceivedItems };
}
//# sourceMappingURL=receivedDocumentsSearch.js.map