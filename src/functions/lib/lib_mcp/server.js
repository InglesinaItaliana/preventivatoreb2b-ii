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
exports.handleMcpRequest = handleMcpRequest;
/**
 * MCP server JSON-RPC dispatcher (F4-C3).
 *
 * Supporta i metodi MCP core: initialize, tools/list, tools/call.
 * Notifiche (no id) ignorate ma OK (es. notifications/initialized).
 *
 * Spec MCP: https://modelcontextprotocol.io/specification/
 */
const auth_1 = require("./auth");
const Tools = __importStar(require("./tools"));
const Cepheid = __importStar(require("./tools_cepheid"));
const oauth_1 = require("./oauth");
const SERVER_NAME = 'sidera';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';
// Host della Cloud Function. Il base URL (discovery, issuer OAuth,
// resource_metadata) deve combaciare con l'URL usato dal client: /mcpSidera
// (canonico) o /mcpNebula (alias legacy).
//
// ATTENZIONE: in GCF 1ª gen la piattaforma STRIPPA il nome della function dal
// path prima di passarlo al codice (es. /mcpNebula/.well-known/X arriva come
// /.well-known/X). Quindi il prefisso nel path NON è affidabile. La fonte
// deterministica è l'identità della function in esecuzione: ogni deploy
// (mcpSidera / mcpNebula) ha il proprio FUNCTION_TARGET/K_SERVICE.
const FN_HOST = 'https://europe-west1-preventivatoreb2b-ii.cloudfunctions.net';
const KNOWN_FNS = ['mcpSidera', 'mcpNebula'];
function resolveBaseUrl(rawPath) {
    // 1) prefisso esplicito nel path (alcuni env/hosting-rewrite lo conservano)
    const m = rawPath.match(/^\/(mcpSidera|mcpNebula)\b/);
    if (m)
        return `${FN_HOST}/${m[1]}`;
    // 2) nome della function in esecuzione (sorgente affidabile in GCF)
    const fn = process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.FUNCTION_NAME || '';
    if (KNOWN_FNS.includes(fn))
        return `${FN_HOST}/${fn}`;
    // 3) fallback canonico
    return `${FN_HOST}/mcpSidera`;
}
/**
 * Header WWW-Authenticate per 401/405. Include resource_metadata URL (derivato
 * dal base URL della request) per indicare ai client (claude.ai) dove trovare
 * la AS discovery (RFC 9728 / MCP Authorization spec).
 */
function wwwAuthHeader(baseUrl) {
    return `Bearer realm="sidera-mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`;
}
// ─────────────────────────────────────────────────────────────────────────────
// TOOL REGISTRY — schemas + handlers
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: 'nebula_whoami',
        description: 'Diagnostico: ritorna l\'email dell\'utente associato all\'API key in uso + conteggio doc visibili per categoria (owner/writer/reader/team). Utile per verificare l\'identità.',
        inputSchema: { type: 'object', properties: {} },
        handler: Tools.whoami,
    },
    {
        name: 'nebula_search',
        description: 'Cerca documenti NEBULA per substring nel titolo o contenuto. Ritorna lista di doc accessibili all\'utente con snippet.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Termine di ricerca (case-insensitive)' },
                limit: { type: 'number', description: 'Max risultati (default 10, max 50)' },
            },
            required: ['query'],
        },
        handler: Tools.search,
    },
    {
        name: 'nebula_getDoc',
        description: 'Recupera il contenuto di un documento NEBULA per docId. Default format markdown (incluso sintassi @task:id / @project:id / {{embed-tasks}}).',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string', description: 'ID del documento' },
                format: { type: 'string', enum: ['markdown', 'prosemirror'], description: 'Formato output (default markdown)' },
            },
            required: ['docId'],
        },
        handler: Tools.getDoc,
    },
    {
        name: 'nebula_listDocs',
        description: 'Lista documenti accessibili. Filtra opzionalmente per parentId (gerarchia).',
        inputSchema: {
            type: 'object',
            properties: {
                parentId: { type: ['string', 'null'], description: 'Parent doc id (null per root)' },
                limit: { type: 'number', description: 'Max risultati (default 20, max 50)' },
            },
        },
        handler: Tools.listDocs,
    },
    {
        name: 'nebula_createDoc',
        description: 'Crea un nuovo documento NEBULA. Default visibility=private, owner=chiamante.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Titolo del documento' },
                parentId: { type: ['string', 'null'], description: 'Parent doc id opzionale' },
                content: { type: 'string', description: 'Contenuto markdown iniziale. Supporta: heading (#/##/###), **bold**, *italic*, `code`, ~~strike~~, [testo](href), bullet/ordered list, blockquote (>), code block fenced, hr (---), tabelle GFM (`| a | b |`), **checkbox** (`- [ ]` / `- [x]`), @task:id, @project:id, {{embed-tasks ...}}' },
                icon: {
                    type: 'object',
                    description: 'Icona Material Symbols (es. { set: "material", name: "rocket_launch" })',
                    properties: {
                        set: { type: 'string' },
                        name: { type: 'string' },
                        color: { type: 'string' },
                        fill: { type: 'number' },
                    },
                },
            },
            required: ['title'],
        },
        handler: Tools.createDoc,
    },
    {
        name: 'nebula_appendBlock',
        description: 'Aggiunge blocchi markdown in fondo a un documento esistente. Supporta: heading, bold, italic, code, strike, [testo](href), liste, blockquote, code block, hr, tabelle GFM (`| a | b |`), **checkbox** (`- [ ]` / `- [x]`), @task:id, @project:id, {{embed-tasks ...}}.',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string', description: 'ID del documento' },
                markdown: { type: 'string', description: 'Blocchi markdown da aggiungere' },
            },
            required: ['docId', 'markdown'],
        },
        handler: Tools.appendBlock,
    },
    {
        name: 'nebula_replaceSection',
        description: 'Sostituisce una sezione del documento identificata da heading text. Se non trova l\'anchor, aggiunge come nuova sezione H2.',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string', description: 'ID del documento' },
                sectionAnchor: { type: 'string', description: 'Testo del heading da matchare (case-insensitive, partial OK)' },
                markdown: { type: 'string', description: 'Nuovo contenuto markdown della sezione (deve includere heading se vuoi mantenerlo). Supporta [testo](href), tabelle GFM (`| a | b |`), checkbox `- [ ]` / `- [x]`, @task:id, @project:id, {{embed-tasks ...}}.' },
            },
            required: ['docId', 'sectionAnchor', 'markdown'],
        },
        handler: Tools.replaceSection,
    },
    {
        name: 'nebula_linkTask',
        description: 'Aggiunge un chip task-mention CEPHEID in fondo al documento.',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string' },
                taskId: { type: 'string', description: 'ID del task CEPHEID' },
                projectId: { type: ['string', 'null'], description: 'Project parent se applicabile' },
            },
            required: ['docId', 'taskId'],
        },
        handler: Tools.linkTask,
    },
    {
        name: 'nebula_linkProject',
        description: 'Aggiunge un chip project-mention CEPHEID in fondo al documento.',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string' },
                projectId: { type: 'string', description: 'ID del progetto CEPHEID' },
            },
            required: ['docId', 'projectId'],
        },
        handler: Tools.linkProject,
    },
    {
        name: 'nebula_linkDeliverable',
        description: 'Aggiunge un chip deliverable-mention CEPHEID in fondo al documento. Richiede projectId e deliverableId (un deliverable è un task con type=deliverable dentro projects/{projectId}/tasks).',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string' },
                projectId: { type: 'string', description: 'ID del progetto che contiene il deliverable' },
                deliverableId: { type: 'string', description: 'ID del deliverable (da cepheid_getProject)' },
            },
            required: ['docId', 'projectId', 'deliverableId'],
        },
        handler: Tools.linkDeliverable,
    },
    {
        name: 'nebula_linkMilestone',
        description: 'Aggiunge un chip milestone-mention CEPHEID in fondo al documento. Richiede projectId e milestoneId (una milestone è un task con type=milestone dentro projects/{projectId}/tasks).',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string' },
                projectId: { type: 'string', description: 'ID del progetto che contiene la milestone' },
                milestoneId: { type: 'string', description: 'ID della milestone (da cepheid_getProject)' },
            },
            required: ['docId', 'projectId', 'milestoneId'],
        },
        handler: Tools.linkMilestone,
    },
    {
        name: 'nebula_linkObiettivo',
        description: 'Aggiunge un chip obiettivo-mention CEPHEID in fondo al documento. Richiede obiettivoId (collection top-level obiettivi).',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string' },
                obiettivoId: { type: 'string', description: 'ID dell\'obiettivo (da cepheid_listObiettivi)' },
                title: { type: 'string', description: 'Titolo snapshot di fallback (opzionale)' },
            },
            required: ['docId', 'obiettivoId'],
        },
        handler: Tools.linkObiettivo,
    },
    // ── CEPHEID — creazione/lettura Progetti/Task/Milestone/Deliverable ──────
    {
        name: 'cepheid_listProjects',
        description: 'Lista progetti CEPHEID (id, nome, avanzamento task, scadenza). Usalo per ottenere un projectId valido prima di creare task/fasi. Default esclude archiviati/inattivi.',
        inputSchema: {
            type: 'object',
            properties: {
                includeArchived: { type: 'boolean', description: 'Includi progetti archiviati/inattivi (default false)' },
                limit: { type: 'number', description: 'Max risultati (default 50, max 200)' },
            },
        },
        handler: Cepheid.listProjects,
    },
    {
        name: 'cepheid_listTeam',
        description: 'Lista membri del team (email, nome, ruolo). Usalo per ottenere le email valide da passare come assignees ai task.',
        inputSchema: { type: 'object', properties: {} },
        handler: Cepheid.listTeam,
    },
    {
        name: 'cepheid_getProject',
        description: 'Dettaglio completo di un progetto: meta (avanzamento, scadenza, obiettivo) + gerarchia milestone → deliverable → task. Mostra le relazioni: ogni deliverable elenca i task collegati (deliverableTaskIds) ed è raggruppato sotto la sua milestone (milestoneId). Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'ID progetto (da cepheid_listProjects)' },
            },
            required: ['projectId'],
        },
        handler: Cepheid.getProject,
    },
    {
        name: 'cepheid_getTask',
        description: 'Dettaglio di una singola entità task/milestone/deliverable (vivono tutte in projects/{projectId}/tasks/{taskId}). Risolve le relazioni: un deliverable mostra la milestone e i task collegati; una milestone mostra i deliverable collegati. Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'ID progetto' },
                taskId: { type: 'string', description: 'ID dell\'entità (task/milestone/deliverable)' },
            },
            required: ['projectId', 'taskId'],
        },
        handler: Cepheid.getTask,
    },
    {
        name: 'cepheid_listObiettivi',
        description: 'Lista obiettivi CEPHEID (collection top-level). Default esclude gli archiviati. Usalo per ottenere un obiettivoId valido.',
        inputSchema: {
            type: 'object',
            properties: {
                includeArchived: { type: 'boolean', description: 'Includi obiettivi archiviati (default false)' },
                limit: { type: 'number', description: 'Max risultati (default 50, max 200)' },
            },
        },
        handler: Cepheid.listObiettivi,
    },
    {
        name: 'cepheid_getObiettivo',
        description: 'Dettaglio di un obiettivo + elenco dei progetti collegati (projects.obiettivoId). Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                obiettivoId: { type: 'string', description: 'ID obiettivo (da cepheid_listObiettivi)' },
            },
            required: ['obiettivoId'],
        },
        handler: Cepheid.getObiettivo,
    },
    {
        name: 'cepheid_createProject',
        description: 'Crea un nuovo progetto CEPHEID. Solo CORE admin. Stati di default (todo/wip/review/done) impostati automaticamente.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nome del progetto' },
                description: { type: 'string', description: 'Descrizione (opzionale)' },
                color: { type: 'string', description: 'Colore esadecimale (default #2F6B4A)' },
                dueDate: { type: 'string', description: 'Scadenza ISO YYYY-MM-DD (opzionale)' },
                obiettivoId: { type: ['string', 'null'], description: 'ID obiettivo collegato (opzionale)' },
            },
            required: ['name'],
        },
        handler: Cepheid.createProject,
    },
    {
        name: 'cepheid_createTask',
        description: 'Crea un task (o milestone/deliverable singolo) in un progetto. Solo CORE admin. Gli assignees vanno indicati per email o nome (risolti via /team). I task nuovi entrano nell\'inbox di smistamento (triaged=false).',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'ID progetto (da cepheid_listProjects)' },
                title: { type: 'string', description: 'Titolo del task' },
                status: { type: 'string', description: 'Stato (default todo). Stati tipici: todo/wip/review/done' },
                priority: { type: 'string', enum: ['alta', 'media', 'bassa'], description: 'Priorità (default media)' },
                startDate: { type: 'string', description: 'Inizio ISO YYYY-MM-DD (opzionale)' },
                dueDate: { type: 'string', description: 'Scadenza ISO YYYY-MM-DD (opzionale)' },
                assignees: { type: 'array', items: { type: 'string' }, description: 'Email o nomi (risolti via /team)' },
                type: { type: 'string', enum: ['task', 'milestone', 'deliverable'], description: 'Tipo (default task)' },
                milestoneId: { type: ['string', 'null'], description: 'Solo per deliverable: ID della milestone a cui collegarlo' },
                deliverableTaskIds: { type: 'array', items: { type: 'string' }, description: 'Solo per deliverable: ID dei task collegati' },
            },
            required: ['projectId', 'title'],
        },
        handler: Cepheid.createTask,
    },
    {
        name: 'cepheid_createObiettivo',
        description: 'Crea un nuovo obiettivo CEPHEID (collection top-level). Solo CORE admin. Il periodo può essere annuale (periodKind=year) o a trimestri (periodKind=quarters con startDate/endDate).',
        inputSchema: {
            type: 'object',
            properties: {
                titolo: { type: 'string', description: 'Titolo dell\'obiettivo' },
                descrizione: { type: 'string', description: 'Descrizione (opzionale)' },
                periodKind: { type: 'string', enum: ['year', 'quarters'], description: 'Tipo periodo (default year)' },
                startDate: { type: 'string', description: 'Inizio periodo ISO YYYY-MM-DD (opzionale)' },
                endDate: { type: 'string', description: 'Fine periodo ISO YYYY-MM-DD (opzionale)' },
                colore: { type: 'string', description: 'Colore esadecimale (default #D4A020)' },
            },
            required: ['titolo'],
        },
        handler: Cepheid.createObiettivo,
    },
    {
        name: 'cepheid_createPhase',
        description: 'Crea una "fase" atomica in un progetto: milestone (nuova o esistente) + deliverable + N task collegati al deliverable. Solo CORE admin. Fornire esattamente uno tra milestoneExistingId e milestoneTitle.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'ID progetto' },
                milestoneExistingId: { type: 'string', description: 'ID di una milestone esistente (alternativa a milestoneTitle)' },
                milestoneTitle: { type: 'string', description: 'Titolo nuova milestone (alternativa a milestoneExistingId)' },
                milestoneDueDate: { type: 'string', description: 'Scadenza milestone ISO YYYY-MM-DD (solo se nuova)' },
                deliverableTitle: { type: 'string', description: 'Titolo del deliverable' },
                deliverableDueDate: { type: 'string', description: 'Scadenza deliverable ISO YYYY-MM-DD (opzionale)' },
                deliverableAssignees: { type: 'array', items: { type: 'string' }, description: 'Email/nomi assegnatari del deliverable' },
                taskTitles: { type: 'array', items: { type: 'string' }, description: 'Titoli dei task da creare e collegare al deliverable' },
            },
            required: ['projectId', 'deliverableTitle', 'taskTitles'],
        },
        handler: Cepheid.createPhase,
    },
];
// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────
async function dispatch(req, userEmail) {
    var _a, _b, _c, _d, _e;
    const id = (_a = req.id) !== null && _a !== void 0 ? _a : null;
    try {
        if (req.method === 'initialize') {
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                },
            };
        }
        if (req.method === 'tools/list') {
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: TOOLS.map(t => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema,
                    })),
                },
            };
        }
        if (req.method === 'tools/call') {
            const name = (_b = req.params) === null || _b === void 0 ? void 0 : _b.name;
            const args = (_d = (_c = req.params) === null || _c === void 0 ? void 0 : _c.arguments) !== null && _d !== void 0 ? _d : {};
            const tool = TOOLS.find(t => t.name === name);
            if (!tool) {
                return {
                    jsonrpc: '2.0', id,
                    error: { code: -32601, message: `Tool not found: ${name}` },
                };
            }
            const out = await tool.handler(args, { userEmail });
            return {
                jsonrpc: '2.0', id,
                result: {
                    content: [{ type: 'text', text: out.text }],
                },
            };
        }
        // Notifications (no id) → no response richiesta
        if (req.method.startsWith('notifications/')) {
            return { jsonrpc: '2.0', id, result: {} };
        }
        return {
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
    catch (e) {
        console.error('[mcp dispatch]', req.method, e);
        return {
            jsonrpc: '2.0', id,
            error: { code: -32000, message: (_e = e === null || e === void 0 ? void 0 : e.message) !== null && _e !== void 0 ? _e : String(e) },
        };
    }
}
async function handleMcpRequest(req) {
    var _a, _b, _c, _d, _e, _f;
    // DEBUG: log ogni request per vedere cosa claude.ai sta facendo
    const ua = ((_a = req.headers['user-agent']) !== null && _a !== void 0 ? _a : req.headers['User-Agent']);
    console.log(`[mcp] ${req.method} ${(_b = req.path) !== null && _b !== void 0 ? _b : '/'} ua=${(_c = ua === null || ua === void 0 ? void 0 : ua.slice(0, 80)) !== null && _c !== void 0 ? _c : '?'}`);
    // CORS preflight (Claude Desktop non lo manda, ma claude.ai web sì)
    if (req.method === 'OPTIONS') {
        return {
            status: 204,
            body: '',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                // Permissive: claude.ai può mandare headers custom MCP-Protocol-Version,
                // mcp-session-id, ecc. Reflection-style (* ammesso da CORS-spec).
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
        };
    }
    // ─── F6 OAuth sub-paths (no Bearer auth richiesto su questi) ──────────
    // Cloud Function HTTP path arriva con prefix `/mcpSidera/...`,
    // `/mcpNebula/...` (alias legacy) o solo `...` a seconda dell'env.
    // Normalizziamo accettando entrambi i prefissi.
    const rawPath = (_d = req.path) !== null && _d !== void 0 ? _d : '';
    const baseUrl = resolveBaseUrl(rawPath);
    const path = rawPath.replace(/^\/(mcpSidera|mcpNebula)\/?/, '/').replace(/^\/+/, '/');
    if (req.method === 'GET' && (path === '/.well-known/oauth-authorization-server' ||
        path === '/.well-known/openid-configuration')) {
        // claude.ai web (osservato 2026-05-26) probe `openid-configuration`
        // come OIDC Discovery anziché RFC 8414. Ritorniamo lo stesso JSON di
        // metadata OAuth 2.0 — claude.ai estrae solo authorization_endpoint /
        // token_endpoint / registration_endpoint, non valida campi OIDC.
        return (0, oauth_1.handleAsMetadata)(baseUrl);
    }
    if (req.method === 'GET' && path === '/.well-known/oauth-protected-resource') {
        return (0, oauth_1.handleResourceMetadata)(baseUrl);
    }
    if (req.method === 'POST' && (path === '/register' || path === '/oauth/register')) {
        return (0, oauth_1.handleRegister)(req.body);
    }
    if (req.method === 'GET' && (path === '/authorize' || path === '/oauth/authorize')) {
        return (0, oauth_1.handleAuthorize)((_e = req.query) !== null && _e !== void 0 ? _e : {});
    }
    if (req.method === 'POST' && (path === '/token' || path === '/oauth/token')) {
        const contentType = ((_f = req.headers['content-type']) !== null && _f !== void 0 ? _f : req.headers['Content-Type']);
        return (0, oauth_1.handleToken)(req.body, contentType);
    }
    // ─── MCP JSON-RPC (POST root) ─────────────────────────────────────────
    // Spec Streamable HTTP (MCP 2025-06-18): GET sul MCP endpoint = client
    // apre SSE stream per messaggi server→client. Server DEVE ritornare
    // Content-Type: text/event-stream OPPURE HTTP 405 Method Not Allowed.
    // Noi non supportiamo SSE (request/response sufficiente per i nostri tool)
    // → 405. WWW-Authenticate aggiunto come hint per OAuth (claude.ai farà
    // POST dopo che ha visto 405).
    if (req.method === 'GET' || req.method === 'HEAD') {
        return {
            status: 405,
            body: req.method === 'HEAD' ? '' : JSON.stringify({
                jsonrpc: '2.0', id: null,
                error: { code: -32000, message: 'SSE stream not supported on this MCP endpoint. Use POST.' },
            }),
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'WWW-Authenticate',
                'WWW-Authenticate': wwwAuthHeader(baseUrl),
                'Allow': 'POST, OPTIONS',
                'Content-Type': 'application/json',
            },
        };
    }
    if (req.method === 'DELETE') {
        // Streamable HTTP session DELETE (Mcp-Session-Id): noi non gestiamo
        // sessioni stateful, rispondiamo 405 come da spec.
        return {
            status: 405,
            body: JSON.stringify({ error: 'session_terminate_not_supported' }),
            headers: { 'Access-Control-Allow-Origin': '*', 'Allow': 'POST, OPTIONS' },
        };
    }
    if (req.method && req.method !== 'POST') {
        return {
            status: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
            headers: { 'Access-Control-Allow-Origin': '*', 'Allow': 'POST, OPTIONS' },
        };
    }
    // Auth
    let userEmail;
    try {
        const auth = await (0, auth_1.authenticateMcpRequest)(req);
        userEmail = auth.userEmail;
    }
    catch (e) {
        if (e instanceof auth_1.McpAuthError) {
            return {
                status: e.code,
                body: JSON.stringify({
                    jsonrpc: '2.0', id: null,
                    error: { code: -32001, message: e.message },
                }),
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Expose-Headers': 'WWW-Authenticate',
                    'WWW-Authenticate': wwwAuthHeader(baseUrl),
                },
            };
        }
        return {
            status: 500,
            body: JSON.stringify({ error: 'Internal auth error' }),
        };
    }
    // Parse body
    let parsedBody;
    try {
        parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!parsedBody || typeof parsedBody !== 'object')
            throw new Error('Invalid body');
    }
    catch (_g) {
        return {
            status: 400,
            body: JSON.stringify({
                jsonrpc: '2.0', id: null,
                error: { code: -32700, message: 'Parse error' },
            }),
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    }
    // Batch support (array of requests)
    if (Array.isArray(parsedBody)) {
        const responses = await Promise.all(parsedBody.map(r => dispatch(r, userEmail)));
        // Filtra notifiche (id null) dalla response array per JSON-RPC spec
        const filtered = responses.filter(r => r.id !== null || r.error);
        return {
            status: 200,
            body: JSON.stringify(filtered.length === 0 ? '' : filtered),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        };
    }
    const response = await dispatch(parsedBody, userEmail);
    return {
        status: 200,
        body: JSON.stringify(response),
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    };
}
//# sourceMappingURL=server.js.map