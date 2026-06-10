import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { isCoreAdminUser } from '../lib_bugs/bugs';
import { checkRateLimit } from '../lib_mcp/rateLimit';

export type FicDocType = 'invoice' | 'expense';

export interface FicSearchCursor {
  page: number;
  indexInPage: number;
}

export interface FicLineMatch {
  documentId: number;
  lineIndex: number;
  date: string;
  invoiceNumber: string;
  supplierName: string;
  documentType: string;
  line: {
    code?: string;
    name?: string;
    description?: string;
    qty?: number;
    netPrice?: number;
  };
  matchScore: number;
  matchedField: 'code' | 'name' | 'description';
  matchedText: string;
}

export interface FicSearchPayload {
  query: string;
  types?: FicDocType[];
  dateFrom?: string | null;
  dateTo?: string | null;
  cursor?: FicSearchCursor | null;
}

export interface FicSearchResult {
  matches: FicLineMatch[];
  cursor: FicSearchCursor | null;
  scannedDocs: number;
  done: boolean;
  scopeWarning?: string;
}

interface FicSearchDeps {
  getValidFicToken: () => Promise<string>;
  ficApiUrl: string;
  companyId: string;
}

const BATCH_MAX_DOCS = 40;
const BATCH_MAX_MS = 20_000;
const DETAIL_DELAY_MS = 130;
const MIN_SCORE = 50;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
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

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function scoreField(query: string, raw: string, field: 'code' | 'name' | 'description'): {
  score: number;
  field: 'code' | 'name' | 'description';
  text: string;
} | null {
  const nq = normalize(query);
  const nv = normalize(raw);
  if (!nq || !nv) return null;

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

function scoreLineItem(query: string, item: Record<string, unknown>): {
  score: number;
  matchedField: 'code' | 'name' | 'description';
  matchedText: string;
} | null {
  const candidates: Array<{ field: 'code' | 'name' | 'description'; value: string }> = [];
  if (typeof item.code === 'string' && item.code.trim()) candidates.push({ field: 'code', value: item.code });
  if (typeof item.name === 'string' && item.name.trim()) candidates.push({ field: 'name', value: item.name });
  if (typeof item.description === 'string' && item.description.trim()) {
    candidates.push({ field: 'description', value: item.description });
  }

  let best: { score: number; matchedField: 'code' | 'name' | 'description'; matchedText: string } | null = null;
  for (const c of candidates) {
    const hit = scoreField(query, c.value, c.field);
    if (hit && hit.score >= MIN_SCORE && (!best || hit.score > best.score)) {
      best = { score: hit.score, matchedField: hit.field, matchedText: hit.text };
    }
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildTypeFilter(types: FicDocType[]): string | undefined {
  const unique = Array.from(new Set(types));
  if (!unique.length || unique.length === 2) return undefined;
  return `type = '${unique[0]}'`;
}

function buildDateFilter(dateFrom?: string | null, dateTo?: string | null): string | undefined {
  const parts: string[] = [];
  if (dateFrom) parts.push(`date >= '${dateFrom}'`);
  if (dateTo) parts.push(`date <= '${dateTo}'`);
  if (!parts.length) return undefined;
  return parts.join(' and ');
}

function combineFilters(...filters: Array<string | undefined>): string | undefined {
  const active = filters.filter(Boolean) as string[];
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  return active.map((f) => `(${f})`).join(' and ');
}

function docPassesDate(docDate: string | undefined, dateFrom?: string | null, dateTo?: string | null): boolean {
  if (!docDate) return true;
  if (dateFrom && docDate < dateFrom) return false;
  if (dateTo && docDate > dateTo) return false;
  return true;
}

function ficScopeErrorMessage(err: unknown): string | null {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Permesso negato da Fatture in Cloud. Verifica che il token OAuth in config/fic includa lo scope received_documents:r (FiC Developer Portal).';
  }
  return null;
}

export function registerFicSearchFunctions(deps: FicSearchDeps) {
  const searchFicReceivedItems = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 120, memory: '512MB' })
    .https.onCall(async (data: FicSearchPayload, context): Promise<FicSearchResult> => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere loggato.');
      }

      const db = admin.firestore();
      const email = String(context.auth.token.email ?? '');
      if (!(await isCoreAdminUser(db, email))) {
        throw new functions.https.HttpsError('permission-denied', 'Solo amministratori CORE.');
      }

      const uid = context.auth.uid;
      const rl = await checkRateLimit(`fic_search:${uid}`, 30, 3600);
      if (!rl.allowed) {
        throw new functions.https.HttpsError('resource-exhausted', 'Troppe ricerche. Riprova tra qualche minuto.');
      }

      const query = String(data?.query ?? '').trim();
      if (query.length < 2) {
        throw new functions.https.HttpsError('invalid-argument', 'Inserisci almeno 2 caratteri.');
      }

      const types: FicDocType[] = (data?.types?.length ? data.types : ['invoice', 'expense']) as FicDocType[];
      const dateFrom = data?.dateFrom ? String(data.dateFrom).slice(0, 10) : null;
      const dateTo = data?.dateTo ? String(data.dateTo).slice(0, 10) : null;
      const cursor: FicSearchCursor = data?.cursor ?? { page: 1, indexInPage: 0 };

      const token = await deps.getValidFicToken();
      const base = `${deps.ficApiUrl}/c/${deps.companyId}/received_documents`;
      const qFilter = combineFilters(buildTypeFilter(types), buildDateFilter(dateFrom, dateTo));

      const matches: FicLineMatch[] = [];
      let page = cursor.page;
      let indexInPage = cursor.indexInPage;
      let scannedDocs = 0;
      const started = Date.now();
      let hasMorePages = true;
      let scopeWarning: string | undefined;

      outer: while (scannedDocs < BATCH_MAX_DOCS && Date.now() - started < BATCH_MAX_MS && hasMorePages) {
        let listRes: { data?: { data?: unknown[]; next_page_url?: string | null } };
        try {
          listRes = await axios.get(base, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              page,
              per_page: 50,
              sort: '-date',
              ...(qFilter ? { q: qFilter } : {}),
            },
          });
        } catch (e) {
          const scopeMsg = ficScopeErrorMessage(e);
          if (scopeMsg) throw new functions.https.HttpsError('permission-denied', scopeMsg);
          throw new functions.https.HttpsError('internal', 'Errore elenco documenti FiC.');
        }

        const docs = (listRes.data?.data ?? []) as Array<Record<string, unknown>>;
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
          const docId = summary.id as number | undefined;
          if (!docId) continue;

          const docType = String(summary.type ?? '');
          if (types.length && !types.includes(docType as FicDocType)) continue;

          const summaryDate = String(summary.date ?? '').slice(0, 10);
          if (!docPassesDate(summaryDate, dateFrom, dateTo)) continue;

          scannedDocs++;

          let detail: Record<string, unknown>;
          try {
            const detailRes: { data?: { data?: Record<string, unknown> } } = await axios.get(`${base}/${docId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            detail = detailRes.data?.data ?? {};
          } catch (e) {
            const scopeMsg = ficScopeErrorMessage(e);
            if (scopeMsg) {
              scopeWarning = scopeWarning ?? scopeMsg;
              throw new functions.https.HttpsError('permission-denied', scopeMsg);
            }
            await sleep(DETAIL_DELAY_MS);
            continue;
          }

          const entity = (detail.entity ?? summary.entity ?? {}) as Record<string, unknown>;
          const items = (detail.items_list ?? []) as Array<Record<string, unknown>>;
          const docDate = String(detail.date ?? summaryDate ?? '').slice(0, 10);
          const invoiceNumber = String(detail.invoice_number ?? summary.invoice_number ?? '—');
          const supplierName = String(entity.name ?? '—');

          items.forEach((item, lineIndex) => {
            const hit = scoreLineItem(query, item);
            if (!hit) return;
            matches.push({
              documentId: docId,
              lineIndex,
              date: docDate,
              invoiceNumber,
              supplierName,
              documentType: String(detail.type ?? docType),
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
          if (!listRes.data?.next_page_url) {
            hasMorePages = false;
          } else {
            page++;
            indexInPage = 0;
          }
        }
      }

      const done = !hasMorePages && indexInPage >= 0;

      matches.sort((a, b) => b.matchScore - a.matchScore || b.date.localeCompare(a.date));

      return {
        matches,
        cursor: done ? null : { page, indexInPage },
        scannedDocs,
        done,
        ...(scopeWarning ? { scopeWarning } : {}),
      };
    });

  return { searchFicReceivedItems };
}
