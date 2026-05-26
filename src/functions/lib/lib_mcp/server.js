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
const SERVER_NAME = 'nebula';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';
// ─────────────────────────────────────────────────────────────────────────────
// TOOL REGISTRY — schemas + handlers
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: 'nebula.search',
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
        name: 'nebula.getDoc',
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
        name: 'nebula.listDocs',
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
        name: 'nebula.createDoc',
        description: 'Crea un nuovo documento NEBULA. Default visibility=private, owner=chiamante.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Titolo del documento' },
                parentId: { type: ['string', 'null'], description: 'Parent doc id opzionale' },
                content: { type: 'string', description: 'Contenuto markdown iniziale (con @task:id, @project:id, {{embed-tasks}})' },
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
        name: 'nebula.appendBlock',
        description: 'Aggiunge blocchi markdown in fondo a un documento esistente. Supporta sintassi NEBULA (@task:id, @project:id, {{embed-tasks ...}}).',
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
        name: 'nebula.replaceSection',
        description: 'Sostituisce una sezione del documento identificata da heading text. Se non trova l\'anchor, aggiunge come nuova sezione H2.',
        inputSchema: {
            type: 'object',
            properties: {
                docId: { type: 'string', description: 'ID del documento' },
                sectionAnchor: { type: 'string', description: 'Testo del heading da matchare (case-insensitive, partial OK)' },
                markdown: { type: 'string', description: 'Nuovo contenuto markdown della sezione (deve includere heading se vuoi mantenerlo)' },
            },
            required: ['docId', 'sectionAnchor', 'markdown'],
        },
        handler: Tools.replaceSection,
    },
    {
        name: 'nebula.linkTask',
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
        name: 'nebula.linkProject',
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
    // CORS preflight (Claude Desktop non lo manda, ma claude.ai web sì)
    if (req.method === 'OPTIONS') {
        return {
            status: 204,
            body: '',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        };
    }
    if (req.method && req.method !== 'POST') {
        return {
            status: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
            headers: { 'Access-Control-Allow-Origin': '*' },
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
                    'WWW-Authenticate': 'Bearer realm="nebula-mcp"',
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
    catch (_a) {
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