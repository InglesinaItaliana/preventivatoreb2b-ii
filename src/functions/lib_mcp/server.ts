/**
 * MCP server JSON-RPC dispatcher (F4-C3).
 *
 * Supporta i metodi MCP core: initialize, tools/list, tools/call.
 * Notifiche (no id) ignorate ma OK (es. notifications/initialized).
 *
 * Spec MCP: https://modelcontextprotocol.io/specification/
 */
import { authenticateMcpRequest, McpAuthError } from './auth';
import * as Tools from './tools';

const SERVER_NAME = 'nebula';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

interface JsonRpcReq {
    jsonrpc: '2.0';
    id?: number | string | null;
    method: string;
    params?: any;
}

interface JsonRpcRes {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: any;
    error?: { code: number; message: string; data?: any };
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
        name: 'nebula_appendBlock',
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
        name: 'nebula_replaceSection',
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
];

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

async function dispatch(req: JsonRpcReq, userEmail: string): Promise<JsonRpcRes> {
    const id = req.id ?? null;

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
            const name = req.params?.name;
            const args = req.params?.arguments ?? {};
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
    } catch (e: any) {
        console.error('[mcp dispatch]', req.method, e);
        return {
            jsonrpc: '2.0', id,
            error: { code: -32000, message: e?.message ?? String(e) },
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT (chiamato da Cloud Function HTTP)
// ─────────────────────────────────────────────────────────────────────────────

export interface McpRequestLike {
    headers: Record<string, unknown>;
    method?: string;
    body?: any;
}

export interface McpResponseLike {
    status: number;
    body: string;
    headers?: Record<string, string>;
}

export async function handleMcpRequest(req: McpRequestLike): Promise<McpResponseLike> {
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
    let userEmail: string;
    try {
        const auth = await authenticateMcpRequest(req);
        userEmail = auth.userEmail;
    } catch (e) {
        if (e instanceof McpAuthError) {
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
    let parsedBody: JsonRpcReq | JsonRpcReq[];
    try {
        parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!parsedBody || typeof parsedBody !== 'object') throw new Error('Invalid body');
    } catch {
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
