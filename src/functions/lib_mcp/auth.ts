/**
 * MCP server — autenticazione via API key (F4-C3).
 *
 * Bearer token nel header Authorization → sha256 → lookup
 * nebulaApiKeys/{hash} → valida (non revoked) → ritorna userEmail.
 * Aggiorna lastUsedAt async (fire-and-forget).
 */
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

export interface AuthResult {
    userEmail: string;
    keyId: string;
}

export class McpAuthError extends Error {
    constructor(public code: number, message: string) {
        super(message);
    }
}

/** Estrae il Bearer token da Authorization header. */
function extractBearer(req: { headers: Record<string, unknown> }): string | null {
    const raw = req.headers['authorization'] ?? req.headers['Authorization'];
    const auth = Array.isArray(raw) ? raw[0] : raw;
    if (typeof auth !== 'string') return null;
    const m = auth.match(/^Bearer\s+(\S+)$/i);
    return m ? m[1] : null;
}

export async function authenticateMcpRequest(req: { headers: Record<string, unknown> }): Promise<AuthResult> {
    const token = extractBearer(req);
    if (!token) {
        throw new McpAuthError(401, 'Missing Bearer token in Authorization header');
    }
    if (!token.startsWith('nbk_')) {
        throw new McpAuthError(401, 'Invalid token format (expected nbk_…)');
    }

    const hash = createHash('sha256').update(token).digest('hex');
    const db = admin.firestore();
    const ref = db.collection('nebulaApiKeys').doc(hash);
    const snap = await ref.get();

    if (!snap.exists) {
        throw new McpAuthError(401, 'Invalid API key');
    }
    const data = snap.data() as { userEmail?: string; revoked?: boolean };
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
