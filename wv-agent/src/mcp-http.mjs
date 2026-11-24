import crypto from 'node:crypto';
import { diffBridgeResults } from './diff.mjs';

const MCP_TOOLS = [
  {
    name: 'wv_devices',
    description:
      'List all WebView devices (Android / iOS / HarmonyOS / Web) connected to wv-agent hub, including clientId, platform, url, title, viewport, and hasBridge status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wv_snapshot',
    description:
      'Capture a lightweight interactive DOM snapshot (with element refs e1, e2, ... and visible body text preview) from an online phone WebView.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          description: 'Device clientId or platform (android | ios | harmony | web). Optional when only one device is online.',
        },
        maxElements: {
          type: 'number',
          description: 'Maximum number of interactive elements to return (default 120).',
        },
      },
    },
  },
  {
    name: 'wv_act',
    description:
      'Execute a UI action inside an online phone WebView: click, fill, scroll, reload, or back.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        device: { type: 'string', description: 'Device clientId or platform (android | ios | harmony).' },
        action: { type: 'string', enum: ['click', 'fill', 'scroll', 'reload', 'back'] },
        ref: { type: 'string', description: 'Element ref from wv_snapshot (e.g. e5).' },
        selector: { type: 'string', description: 'CSS selector fallback if ref is omitted.' },
        text: { type: 'string', description: 'Visible text match fallback if ref/selector is omitted.' },
        value: { type: 'string', description: 'Text value for fill action.' },
        dx: { type: 'number', description: 'Horizontal scroll delta in px.' },
        dy: { type: 'number', description: 'Vertical scroll delta in px (default 400).' },
      },
    },
  },
  {
    name: 'wv_eval',
    description:
      'Evaluate a JavaScript expression inside an online phone WebView and return the JSON-serializable result.',
    inputSchema: {
      type: 'object',
      required: ['expression'],
      properties: {
        device: { type: 'string', description: 'Device clientId or platform (android | ios | harmony).' },
        expression: { type: 'string', description: 'JavaScript expression or async body to evaluate.' },
      },
    },
  },
  {
    name: 'wv_bridge_call',
    description:
      'Invoke window.MeiYouJSBridge.invoke(path, params, cb) on a real phone WebView and return the structured response, durationMs, or timeout status.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        device: { type: 'string', description: 'Device clientId or platform (android | ios | harmony).' },
        path: { type: 'string', description: 'JSBridge protocol path, e.g. userInfo/get, appInfo/get, album/save.' },
        params: { type: 'object', description: 'JSON parameters object (default {}).' },
        timeoutMs: { type: 'number', description: 'Callback timeout in ms (default 8000).' },
      },
    },
  },
  {
    name: 'wv_bridge_diff',
    description:
      'Invoke the same MeiYouJSBridge protocol concurrently across multiple online phones (e.g. Android + HarmonyOS + iOS) and automatically diff missing fields and type mismatches.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'JSBridge protocol path, e.g. userInfo/get.' },
        params: { type: 'object', description: 'JSON parameters object (default {}).' },
        devices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of device IDs or platforms (e.g. ["android", "harmony"]). Defaults to all online devices.',
        },
        timeoutMs: { type: 'number', description: 'Callback timeout in ms (default 8000).' },
      },
    },
  },
  {
    name: 'wv_bridge_trace',
    description:
      'Retrieve recorded MeiYouJSBridge.invoke / on traces captured during page interactions (supports offline devices with cached traces).',
    inputSchema: {
      type: 'object',
      properties: {
        device: { type: 'string', description: 'Device clientId or platform (android | ios | harmony).' },
        limit: { type: 'number', description: 'Max trace entries to return (default 50).' },
      },
    },
  },
  {
    name: 'wv_inspect',
    description:
      'Inspect captured page runtime errors, unhandled promise rejections, console warnings/errors, and failed XHR/fetch network requests.',
    inputSchema: {
      type: 'object',
      properties: {
        device: { type: 'string', description: 'Device clientId or platform (android | ios | harmony).' },
        limit: { type: 'number', description: 'Max entries per category (default 50).' },
      },
    },
  },
  {
    name: 'wv_clear',
    description:
      'Clear buffered traces, console logs, page errors, and network records for one device or all devices.',
    inputSchema: {
      type: 'object',
      properties: {
        device: { type: 'string', description: 'Optional device clientId or platform. Omit to clear all devices.' },
      },
    },
  },
];

async function executeMcpTool(hub, name, args = {}) {
  if (name === 'wv_devices') {
    return { ok: true, devices: hub.listDevices() };
  }

  if (name === 'wv_snapshot') {
    const session = hub.resolveDevice(args.device);
    const result = await hub.sendRpc(session, 'snapshot', {
      maxElements: Number(args.maxElements || 120),
    });
    return { ok: true, clientId: session.clientId, platform: session.meta.platform, result };
  }

  if (name === 'wv_act') {
    const session = hub.resolveDevice(args.device);
    const result = await hub.sendRpc(session, 'act', {
      action: args.action,
      ref: args.ref,
      selector: args.selector,
      text: args.text,
      value: args.value,
      dx: args.dx,
      dy: args.dy,
    });
    return { ok: true, clientId: session.clientId, platform: session.meta.platform, result };
  }

  if (name === 'wv_eval') {
    const session = hub.resolveDevice(args.device);
    const result = await hub.sendRpc(session, 'eval', {
      expression: args.expression,
    });
    return { ok: true, clientId: session.clientId, platform: session.meta.platform, result };
  }

  if (name === 'wv_bridge_call') {
    const session = hub.resolveDevice(args.device);
    const timeoutMs = Number(args.timeoutMs || 8000);
    const result = await hub.sendRpc(
      session,
      'bridge.call',
      { path: args.path, params: args.params || {}, timeoutMs },
      timeoutMs + 3000
    );
    return { ok: true, clientId: session.clientId, platform: session.meta.platform, result };
  }

  if (name === 'wv_bridge_diff') {
    const bridgePath = args.path;
    const params = args.params || {};
    const timeoutMs = Number(args.timeoutMs || 8000);
    const targets =
      Array.isArray(args.devices) && args.devices.length > 0
        ? args.devices.map((d) => hub.resolveDevice(d))
        : [...hub.sessions.values()].filter((s) => hub._isSessionOnline(s));

    if (targets.length === 0) {
      throw new Error('No online devices to run wv_bridge_diff');
    }

    const settled = await Promise.all(
      targets.map(async (session) => {
        try {
          const result = await hub.sendRpc(
            session,
            'bridge.call',
            { path: bridgePath, params, timeoutMs },
            timeoutMs + 3000
          );
          return { key: `${session.meta.platform}:${session.clientId}`, result };
        } catch (err) {
          return {
            key: `${session.meta.platform}:${session.clientId}`,
            result: { status: 'error', error: err.message },
          };
        }
      })
    );

    const resultsMap = {};
    for (const entry of settled) resultsMap[entry.key] = entry.result;
    return {
      ok: true,
      path: bridgePath,
      params,
      results: resultsMap,
      diffs: diffBridgeResults(resultsMap),
    };
  }

  if (name === 'wv_bridge_trace') {
    const session = hub.resolveDevice(args.device, { allowOffline: true });
    const limit = Number(args.limit || 50);
    return {
      ok: true,
      clientId: session.clientId,
      platform: session.meta.platform,
      connected: hub._isSessionOnline(session),
      traces: session.traces.slice(-limit),
    };
  }

  if (name === 'wv_inspect') {
    const session = hub.resolveDevice(args.device, { allowOffline: true });
    const limit = Number(args.limit || 50);
    const failedNetwork = session.network.filter((n) => !n.ok || n.status >= 400);
    return {
      ok: true,
      clientId: session.clientId,
      platform: session.meta.platform,
      connected: hub._isSessionOnline(session),
      meta: session.meta,
      errors: session.errors.slice(-limit),
      consoles: session.consoles.slice(-limit),
      failedNetwork: failedNetwork.slice(-limit),
      recentNetwork: session.network.slice(-limit),
    };
  }

  if (name === 'wv_clear') {
    hub.clearState(args.device);
    return { ok: true, cleared: args.device || 'all' };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id: id !== undefined ? id : null,
    error: { code, message },
  };
}

function sendMcpJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, x-api-key',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload === null ? '' : JSON.stringify(payload));
}

function checkOptionalApiKey(req, urlObj) {
  const requiredKey = String(process.env.WV_AGENT_API_KEY || '').trim();
  if (!requiredKey) return true;

  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const headerKey = String(req.headers['x-api-key'] || '').trim();
  const queryKey = String(urlObj.searchParams.get('key') || '').trim();
  return bearer === requiredKey || headerKey === requiredKey || queryKey === requiredKey;
}

/**
 * Handle standard MCP Streamable HTTP requests at /mcp.
 */
export async function handleMcpHttpRequest(hub, req, res, urlObj, readJsonBody) {
  if (req.method === 'OPTIONS') {
    sendMcpJson(res, 204, null);
    return;
  }

  if (!checkOptionalApiKey(req, urlObj)) {
    sendMcpJson(res, 401, jsonRpcError(null, -32001, 'Unauthorized: invalid or missing API key'));
    return;
  }

  if (req.method === 'DELETE') {
    sendMcpJson(res, 204, null);
    return;
  }

  if (req.method === 'GET') {
    sendMcpJson(res, 405, jsonRpcError(null, -32601, 'GET SSE stream is not enabled; use POST /mcp'));
    return;
  }

  if (req.method !== 'POST') {
    sendMcpJson(res, 405, jsonRpcError(null, -32601, `Method not allowed: ${req.method}`));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendMcpJson(res, 400, jsonRpcError(null, -32700, err.message));
    return;
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  let sessionHeader = req.headers['mcp-session-id'] || '';

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      responses.push(jsonRpcError(null, -32600, 'Invalid JSON-RPC request'));
      continue;
    }

    const { id, method, params } = msg;
    const isNotification = id === undefined || id === null;

    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      continue;
    }

    if (method === 'initialize') {
      if (!sessionHeader) sessionHeader = crypto.randomUUID();
      const requestedVersion = params && typeof params.protocolVersion === 'string'
        ? params.protocolVersion
        : '2025-03-26';
      responses.push({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: requestedVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'wv-agent-mcp',
            version: '0.2.0',
          },
        },
      });
      continue;
    }

    if (method === 'ping') {
      if (!isNotification) {
        responses.push({ jsonrpc: '2.0', id, result: {} });
      }
      continue;
    }

    if (method === 'tools/list') {
      responses.push({
        jsonrpc: '2.0',
        id,
        result: { tools: MCP_TOOLS },
      });
      continue;
    }

    if (method === 'tools/call') {
      const toolName = params && params.name;
      const toolArgs = (params && params.arguments) || {};
      try {
        const result = await executeMcpTool(hub, toolName, toolArgs);
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        });
      } catch (err) {
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) }],
            isError: true,
          },
        });
      }
      continue;
    }

    if (!isNotification) {
      responses.push(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  }

  if (responses.length === 0) {
    sendMcpJson(res, 202, null, sessionHeader ? { 'Mcp-Session-Id': sessionHeader } : {});
    return;
  }

  const out = Array.isArray(body) ? responses : responses[0];
  sendMcpJson(res, 200, out, sessionHeader ? { 'Mcp-Session-Id': sessionHeader } : {});
}
