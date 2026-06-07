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
exports.checkRateLimit = checkRateLimit;
exports.clientIpFromHeaders = clientIpFromHeaders;
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
const admin = __importStar(require("firebase-admin"));
async function checkRateLimit(key, maxInWindow, windowSec) {
    const db = admin.firestore();
    const safeKey = key.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 256);
    const ref = db.collection('rateLimits').doc(safeKey);
    const now = Date.now();
    const windowMs = windowSec * 1000;
    try {
        return await db.runTransaction(async (tx) => {
            var _a, _b;
            const snap = await tx.get(ref);
            const d = snap.exists ? snap.data() : null;
            const windowStart = (_a = d === null || d === void 0 ? void 0 : d.windowStart) !== null && _a !== void 0 ? _a : 0;
            const count = (_b = d === null || d === void 0 ? void 0 : d.count) !== null && _b !== void 0 ? _b : 0;
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
    }
    catch (_a) {
        return { allowed: true, retryAfterSec: 0 }; // fail-open
    }
}
/** Estrae un identificatore client (IP) dagli header, con fallback. */
function clientIpFromHeaders(headers, fallback = 'unknown') {
    const xff = headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length)
        return xff.split(',')[0].trim();
    if (Array.isArray(xff) && xff.length)
        return String(xff[0]).trim();
    return fallback;
}
//# sourceMappingURL=rateLimit.js.map