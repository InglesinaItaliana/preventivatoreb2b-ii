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
exports.handleAsMetadata = handleAsMetadata;
exports.handleResourceMetadata = handleResourceMetadata;
exports.handleRegister = handleRegister;
exports.handleAuthorize = handleAuthorize;
exports.issueAuthCodeForConsent = issueAuthCodeForConsent;
exports.handleToken = handleToken;
exports.validateOAuthToken = validateOAuthToken;
exports.cleanupOAuthStale = cleanupOAuthStale;
/**
 * NEBULA-DOCS MCP — OAuth 2.0 + PKCE + Dynamic Client Registration (F6).
 *
 * Spec: MCP Authorization (draft 2025) + RFC 8414 (AS Metadata) + RFC 7591
 * (Dynamic Client Registration) + RFC 7636 (PKCE).
 *
 * Endpoint:
 *  - GET  /.well-known/oauth-authorization-server  → metadata
 *  - GET  /.well-known/oauth-protected-resource    → resource hint
 *  - POST /register                                → DCR (claude.ai self-register)
 *  - GET  /authorize                               → redirect to consent UI
 *  - POST /token                                   → code → access_token (PKCE verify)
 *
 * Storage Firestore:
 *  - nebulaOauthClients/{client_id}      registered clients (DCR)
 *  - nebulaOauthAuthRequests/{id}        pending /authorize (TTL 10min, GC)
 *  - nebulaOauthCodes/{code}             auth codes (TTL 5min, one-time use)
 *  - nebulaOauthTokens/{hash}            access tokens (hashed, expiresAt 90gg)
 *
 * Access token prefix `nbo_` (vs Bearer API key `nbk_`) per dispatcher dual-mode.
 */
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const MCP_BASE_URL = 'https://europe-west1-preventivatoreb2b-ii.cloudfunctions.net/mcpNebula';
const CONSENT_UI_URL = 'https://preventivatoreb2b-ii.web.app/nebula/docs/oauth/consent';
const TOKEN_EXPIRES_MS = 90 * 24 * 60 * 60 * 1000; // 90gg
// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(status, body, extraHeaders = {}) {
    return {
        status,
        body: JSON.stringify(body),
        headers: Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, extraHeaders),
    };
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function sha256Base64Url(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}
function randomToken(prefix, byteLen = 32) {
    const random = (0, crypto_1.randomBytes)(byteLen).toString('hex');
    const plain = `${prefix}${random}`;
    const hash = sha256Hex(plain);
    return { plain, hash };
}
function parseFormBody(raw) {
    if (typeof raw === 'object' && raw !== null)
        return raw;
    if (typeof raw !== 'string')
        return {};
    const out = {};
    for (const pair of raw.split('&')) {
        const [k, v] = pair.split('=');
        if (k)
            out[decodeURIComponent(k)] = decodeURIComponent((v !== null && v !== void 0 ? v : '').replace(/\+/g, ' '));
    }
    return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────
function handleAsMetadata() {
    return jsonResponse(200, {
        issuer: MCP_BASE_URL,
        authorization_endpoint: `${MCP_BASE_URL}/authorize`,
        token_endpoint: `${MCP_BASE_URL}/token`,
        registration_endpoint: `${MCP_BASE_URL}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none'], // public client (PKCE)
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['mcp'],
    });
}
function handleResourceMetadata() {
    return jsonResponse(200, {
        resource: MCP_BASE_URL,
        authorization_servers: [MCP_BASE_URL],
        bearer_methods_supported: ['header'],
        scopes_supported: ['mcp'],
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC CLIENT REGISTRATION (RFC 7591)
// ─────────────────────────────────────────────────────────────────────────────
async function handleRegister(rawBody) {
    const body = (typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody);
    const redirectUris = body === null || body === void 0 ? void 0 : body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
        return jsonResponse(400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris required (array)' });
    }
    const validUris = redirectUris.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
    if (validUris.length === 0) {
        return jsonResponse(400, { error: 'invalid_redirect_uri', error_description: 'no valid https redirect_uri' });
    }
    const clientId = `nbc_${(0, crypto_1.randomBytes)(16).toString('hex')}`;
    const name = (typeof (body === null || body === void 0 ? void 0 : body.client_name) === 'string' && body.client_name) || 'Unnamed MCP Client';
    const now = admin.firestore.FieldValue.serverTimestamp();
    await admin.firestore().collection('nebulaOauthClients').doc(clientId).set({
        client_id: clientId,
        client_name: name,
        redirect_uris: validUris,
        createdAt: now,
    });
    return jsonResponse(201, {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: name,
        redirect_uris: validUris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZE (GET) — valida, persiste request, redirect a consent UI
// ─────────────────────────────────────────────────────────────────────────────
async function handleAuthorize(query) {
    var _a, _b, _c;
    const clientId = query.client_id;
    const redirectUri = query.redirect_uri;
    const responseType = query.response_type;
    const codeChallenge = query.code_challenge;
    const codeChallengeMethod = query.code_challenge_method;
    const state = (_a = query.state) !== null && _a !== void 0 ? _a : '';
    const scope = (_b = query.scope) !== null && _b !== void 0 ? _b : 'mcp';
    // Early validation (no redirect possible se mancano client_id o redirect_uri)
    if (!clientId || !redirectUri) {
        return jsonResponse(400, { error: 'invalid_request', error_description: 'client_id e redirect_uri richiesti' });
    }
    const clientSnap = await admin.firestore().collection('nebulaOauthClients').doc(clientId).get();
    if (!clientSnap.exists) {
        return jsonResponse(400, { error: 'invalid_client', error_description: 'client_id sconosciuto' });
    }
    const client = clientSnap.data();
    if (!client.redirect_uris.includes(redirectUri)) {
        return jsonResponse(400, { error: 'invalid_redirect_uri', error_description: 'redirect_uri non registrata per questo client' });
    }
    // Da qui in poi gli errori vengono inviati come redirect con error= a redirect_uri
    if (responseType !== 'code') {
        return redirectWithError(redirectUri, state, 'unsupported_response_type');
    }
    if (!codeChallenge || codeChallengeMethod !== 'S256') {
        return redirectWithError(redirectUri, state, 'invalid_request', 'PKCE S256 required');
    }
    // Crea auth request pending (TTL gestito da oauthCleanup)
    const authRequestId = (0, crypto_1.randomBytes)(16).toString('hex');
    await admin.firestore().collection('nebulaOauthAuthRequests').doc(authRequestId).set({
        client_id: clientId,
        client_name: (_c = clientSnap.data().client_name) !== null && _c !== void 0 ? _c : clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        state,
        scope,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const consentUrl = `${CONSENT_UI_URL}?req=${authRequestId}`;
    return {
        status: 302,
        body: '',
        headers: {
            Location: consentUrl,
            'Cache-Control': 'no-store',
        },
    };
}
function redirectWithError(redirectUri, state, error, description) {
    const params = new URLSearchParams({ error });
    if (description)
        params.set('error_description', description);
    if (state)
        params.set('state', state);
    return {
        status: 302,
        body: '',
        headers: { Location: `${redirectUri}?${params.toString()}`, 'Cache-Control': 'no-store' },
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// CONSENT INTERNAL (chiamata dalla callable lato server quando user clicca Autorizza)
// Ritorna alla UI il redirectUri completo da usare per window.location.
// ─────────────────────────────────────────────────────────────────────────────
async function issueAuthCodeForConsent(authRequestId, userEmail) {
    const db = admin.firestore();
    const reqRef = db.collection('nebulaOauthAuthRequests').doc(authRequestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists)
        throw new Error('Authorization request scaduta o non trovata');
    const r = reqSnap.data();
    // Genera code (one-time use, TTL 5min via oauthCleanup)
    const code = `nbac_${(0, crypto_1.randomBytes)(24).toString('hex')}`;
    await db.collection('nebulaOauthCodes').doc(code).set({
        client_id: r.client_id,
        userEmail,
        redirect_uri: r.redirect_uri,
        code_challenge: r.code_challenge,
        code_challenge_method: r.code_challenge_method,
        scope: r.scope,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        used: false,
    });
    // Pulisci la auth request (one-shot)
    await reqRef.delete().catch(() => { });
    const params = new URLSearchParams({ code });
    if (r.state)
        params.set('state', r.state);
    return { redirectUri: `${r.redirect_uri}?${params.toString()}` };
}
// ─────────────────────────────────────────────────────────────────────────────
// TOKEN EXCHANGE (POST /token)
// ─────────────────────────────────────────────────────────────────────────────
async function handleToken(rawBody, contentType) {
    // Spec OAuth: token endpoint usa application/x-www-form-urlencoded. Supporto anche JSON.
    const isJson = (contentType !== null && contentType !== void 0 ? contentType : '').toLowerCase().includes('application/json');
    const body = isJson
        ? (typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody)
        : parseFormBody(rawBody);
    const grantType = body.grant_type;
    const code = body.code;
    const codeVerifier = body.code_verifier;
    const clientId = body.client_id;
    const redirectUri = body.redirect_uri;
    if (grantType !== 'authorization_code') {
        return jsonResponse(400, { error: 'unsupported_grant_type' });
    }
    if (!code || !codeVerifier || !clientId) {
        return jsonResponse(400, { error: 'invalid_request', error_description: 'code, code_verifier, client_id richiesti' });
    }
    const db = admin.firestore();
    const codeRef = db.collection('nebulaOauthCodes').doc(code);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists)
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'code non valido o scaduto' });
    const c = codeSnap.data();
    if (c.used)
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'code già usato' });
    if (c.client_id !== clientId)
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'client_id mismatch' });
    if (redirectUri && c.redirect_uri !== redirectUri) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }
    // PKCE verify: SHA256(code_verifier) base64url == code_challenge
    const computedChallenge = sha256Base64Url(codeVerifier);
    if (computedChallenge !== c.code_challenge) {
        return jsonResponse(400, { error: 'invalid_grant', error_description: 'PKCE verifier non valido' });
    }
    // Mark code used + delete (one-shot)
    await codeRef.delete().catch(() => { });
    // Issue access token
    const { plain: accessToken, hash: accessHash } = randomToken('nbo_', 32);
    const now = Date.now();
    const expiresAt = now + TOKEN_EXPIRES_MS;
    await db.collection('nebulaOauthTokens').doc(accessHash).set({
        userEmail: c.userEmail,
        client_id: c.client_id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
        lastUsedAt: null,
        revoked: false,
    });
    return jsonResponse(200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(TOKEN_EXPIRES_MS / 1000),
        scope: 'mcp',
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE OAUTH ACCESS TOKEN (chiamato da auth.ts per dual-mode)
// ─────────────────────────────────────────────────────────────────────────────
async function validateOAuthToken(token) {
    if (!token.startsWith('nbo_'))
        return null;
    const hash = sha256Hex(token);
    const ref = admin.firestore().collection('nebulaOauthTokens').doc(hash);
    const snap = await ref.get();
    if (!snap.exists)
        return null;
    const t = snap.data();
    if (t.revoked)
        return null;
    if (t.expiresAt && t.expiresAt.toMillis() < Date.now())
        return null;
    if (!t.userEmail)
        return null;
    // Fire-and-forget lastUsedAt update
    void ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => { });
    return t.userEmail;
}
// ─────────────────────────────────────────────────────────────────────────────
// GC (chiamato da scheduled oauthCleanup in index.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function cleanupOAuthStale() {
    const db = admin.firestore();
    const now = Date.now();
    const reqCutoff = admin.firestore.Timestamp.fromMillis(now - 15 * 60 * 1000); // 15 min
    const codeCutoff = admin.firestore.Timestamp.fromMillis(now - 10 * 60 * 1000); // 10 min
    const tokenCutoff = admin.firestore.Timestamp.fromMillis(now); // ora (expiresAt < now)
    const [reqStale, codeStale, tokenStale] = await Promise.all([
        db.collection('nebulaOauthAuthRequests').where('createdAt', '<', reqCutoff).get(),
        db.collection('nebulaOauthCodes').where('createdAt', '<', codeCutoff).get(),
        db.collection('nebulaOauthTokens').where('expiresAt', '<', tokenCutoff).get(),
    ]);
    async function batchDelete(snaps) {
        if (snaps.length === 0)
            return;
        for (let i = 0; i < snaps.length; i += 450) {
            const batch = db.batch();
            snaps.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }
    await Promise.all([batchDelete(reqStale.docs), batchDelete(codeStale.docs), batchDelete(tokenStale.docs)]);
    return { requests: reqStale.size, codes: codeStale.size, tokens: tokenStale.size };
}
//# sourceMappingURL=oauth.js.map