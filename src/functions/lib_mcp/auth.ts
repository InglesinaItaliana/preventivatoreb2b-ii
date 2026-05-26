/**
 * MCP server — autenticazione dual-mode (F4-C3 + F6 OAuth).
 *
 * Supporta:
 *  - Bearer API key `nbk_…`  → lookup nebulaApiKeys/{hash}, F4-C3 path (Claude Desktop)
 *  - OAuth access token `nbo_…` → lookup nebulaOauthTokens/{hash}, F6 path (claude.ai web)
 *
 * Il prefix discrimina senza ambiguità. lastUsedAt aggiornato fire-and-forget
 * in entrambi i path.
 */
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { validateOAuthToken } from './oauth';

export interface AuthResult {
    userEmail: string;
    keyId: string;        // hash della credenziale (per audit/log)
    authMode: 'bearer' | 'oauth';
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

    // OAuth path (F6) — access token rilasciato da /token
    if (token.startsWith('nbo_')) {
        const userEmail = await validateOAuthToken(token);
        if (!userEmail) throw new McpAuthError(401, 'OAuth access token invalid or expired');
        const hash = createHash('sha256').update(token).digest('hex');
        return { userEmail, keyId: hash, authMode: 'oauth' };
    }

    // Bearer API key path (F4-C3) — Claude Desktop via mcp-remote
    if (token.startsWith('nbk_')) {
        const hash = createHash('sha256').update(token).digest('hex');
        const db = admin.firestore();
        const ref = db.collection('nebulaApiKeys').doc(hash);
        const snap = await ref.get();
        if (!snap.exists) throw new McpAuthError(401, 'Invalid API key');
        const data = snap.data() as { userEmail?: string; revoked?: boolean };
        if (data.revoked) throw new McpAuthError(401, 'API key revoked');
        if (!data.userEmail) throw new McpAuthError(500, 'API key has no associated user');

        void ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() })
            .catch(err => console.warn('[mcpAuth] lastUsedAt update failed:', err));

        return { userEmail: data.userEmail, keyId: hash, authMode: 'bearer' };
    }

    throw new McpAuthError(401, 'Invalid token format (expected nbk_… o nbo_…)');
}
