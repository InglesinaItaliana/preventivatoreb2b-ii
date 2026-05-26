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
exports.McpAuthError = void 0;
exports.authenticateMcpRequest = authenticateMcpRequest;
/**
 * MCP server — autenticazione via API key (F4-C3).
 *
 * Bearer token nel header Authorization → sha256 → lookup
 * nebulaApiKeys/{hash} → valida (non revoked) → ritorna userEmail.
 * Aggiorna lastUsedAt async (fire-and-forget).
 */
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
class McpAuthError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.McpAuthError = McpAuthError;
/** Estrae il Bearer token da Authorization header. */
function extractBearer(req) {
    var _a;
    const raw = (_a = req.headers['authorization']) !== null && _a !== void 0 ? _a : req.headers['Authorization'];
    const auth = Array.isArray(raw) ? raw[0] : raw;
    if (typeof auth !== 'string')
        return null;
    const m = auth.match(/^Bearer\s+(\S+)$/i);
    return m ? m[1] : null;
}
async function authenticateMcpRequest(req) {
    const token = extractBearer(req);
    if (!token) {
        throw new McpAuthError(401, 'Missing Bearer token in Authorization header');
    }
    if (!token.startsWith('nbk_')) {
        throw new McpAuthError(401, 'Invalid token format (expected nbk_…)');
    }
    const hash = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    const db = admin.firestore();
    const ref = db.collection('nebulaApiKeys').doc(hash);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new McpAuthError(401, 'Invalid API key');
    }
    const data = snap.data();
    if (data.revoked) {
        throw new McpAuthError(401, 'API key revoked');
    }
    if (!data.userEmail) {
        throw new McpAuthError(500, 'API key has no associated user');
    }
    // Fire-and-forget: aggiorna lastUsedAt (non bloccare la richiesta MCP)
    void ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch(err => console.warn('[mcpAuth] lastUsedAt update failed:', err));
    return { userEmail: data.userEmail, keyId: hash };
}
//# sourceMappingURL=auth.js.map