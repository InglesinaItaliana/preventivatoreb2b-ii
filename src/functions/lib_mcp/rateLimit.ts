/**
 * (N4) Rate-limiter server-side per gli endpoint HTTP pubblici (MCP + OAuth).
 *
 * Firestore non offre rate-limiting nativo: usiamo un contatore a finestra
 * fissa, UN documento per chiave (`rateLimits/{key}`), resettato in-place quando
 * la finestra scade → niente proliferazione di bucket. La collezione è chiusa a
 * ogni client dal catch-all delle rules (solo Admin SDK scrive qui).
 *
 * Filosofia: **fail-open**. Un errore del limiter non deve far cadere un
 * endpoint legittimo; in caso di errore si lascia passare la request.
 */
import * as admin from 'firebase-admin';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export async function checkRateLimit(
  key: string,
  maxInWindow: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const db = admin.firestore();
  const safeKey = key.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 256);
  const ref = db.collection('rateLimits').doc(safeKey);
  const now = Date.now();
  const windowMs = windowSec * 1000;
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? (snap.data() as { count?: number; windowStart?: number }) : null;
      const windowStart = d?.windowStart ?? 0;
      const count = d?.count ?? 0;
      // Finestra scaduta (o doc nuovo) → reset.
      if (now - windowStart > windowMs) {
        tx.set(ref, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSec: 0 };
      }
      if (count < maxInWindow) {
        tx.update(ref, { count: count + 1 });
        return { allowed: true, retryAfterSec: 0 };
      }
      const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    });
  } catch {
    return { allowed: true, retryAfterSec: 0 };   // fail-open
  }
}

/** Estrae un identificatore client (IP) dagli header, con fallback. */
export function clientIpFromHeaders(
  headers: Record<string, unknown>,
  fallback = 'unknown',
): string {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).trim();
  return fallback;
}
