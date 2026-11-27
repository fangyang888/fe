import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { attachWebSocketServer } from './ws-server.mjs';
import { diffBridgeResults, summarizeBridgeDiff, formatDiffMarkdown } from './diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_SCRIPT_PATH = path.join(__dirname, 'client.js');
const OBSERVE_ASSETS = new Map([
  ['/observe', ['observe.html', 'text/html']],
  ['/observe/app.js', ['observe.js', 'application/javascript']],
  ['/observe/style.css', ['observe.css', 'text/css']],
]);

export const DEFAULT_HUB_PORT = Number(process.env.WV_AGENT_PORT || 19527);
const MAX_BUFFER = 300;
const HTTP_SESSION_TTL_MS = 25000;
const LONG_POLL_TIMEOUT_MS = 12000;

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const entries of Object.values(nets)) {
    for (const info of entries || []) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data, null, 2));
}

export class WvAgentHub {
  constructor({ port = DEFAULT_HUB_PORT, host = '0.0.0.0' } = {}) {
    this.port = port;
    this.host = host;
    this.sessions = new Map(); // clientId -> Session
    this.pendingRpc = new Map(); // reqId -> { resolve, reject, timer }
    this.observers = new Map(); // SSE response -> exact clientId
    this.rpcSeq = 1;
    this.server = null;
    this.pingTimer = null;
  }

  _getOrCreateSession(clientId) {
    let s = this.sessions.get(clientId);
    if (!s) {
      s = {
        clientId,
        instanceId: '',
        transport: 'ws', // 'ws' | 'http'
        conn: null,
        connected: false,
        meta: { clientId, platform: 'unknown', model: '', url: '', title: '', hasBridge: false },
        connectedAt: null,
        lastSeenAt: Date.now(),
        traces: [],
        consoles: [],
        errors: [],
        network: [],
        observations: [],
        httpCommandQueue: [],
        httpPollWaiter: null, // { res, timer }
      };
      this.sessions.set(clientId, s);
    }
    return s;
  }

  _allocateClientId(meta = {}) {
    const rawBase = String(meta.baseName || meta.clientId || 'device').trim();
    const instanceId = meta.instanceId ? String(meta.instanceId) : '';
    const escapedBase = rawBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sameFamilyRe = new RegExp(`^${escapedBase}(?:-(\\d+))?$`);

    // 1. Same browser/WebView tab reconnecting -> keep its previously assigned name
    if (instanceId) {
      for (const s of this.sessions.values()) {
        if (s.instanceId === instanceId && sameFamilyRe.test(s.clientId)) {
          return { clientId: s.clientId, reclaimed: false };
        }
      }
    }

    // 2. If neither baseName nor instanceId is provided, preserve legacy exact-clientId replacement behavior
    if (!meta.baseName && !instanceId) {
      return { clientId: rawBase, reclaimed: false };
    }

    // 3. Allocate baseName, then baseName-1, baseName-2, ... skipping currently online sessions owned by other instances
    for (let idx = 0; idx < 1000; idx++) {
      const candidate = idx === 0 ? rawBase : `${rawBase}-${idx}`;
      const existing = this.sessions.get(candidate);
      if (!existing) {
        return { clientId: candidate, reclaimed: false };
      }
      if (instanceId && existing.instanceId === instanceId) {
        return { clientId: candidate, reclaimed: false };
      }
      if (!this._isSessionOnline(existing)) {
        return { clientId: candidate, reclaimed: true };
      }
    }
    return { clientId: `${rawBase}-${Date.now().toString(36)}`, reclaimed: false };
  }

  _reclaimOfflineSession(session) {
    if (session.conn) {
      try { session.conn.close(1000, 'reclaimed'); } catch {}
      session.conn = null;
    }
    if (session.httpPollWaiter) {
      clearTimeout(session.httpPollWaiter.timer);
      try { sendJson(session.httpPollWaiter.res, 200, { ok: true, commands: [] }); } catch {}
      session.httpPollWaiter = null;
    }
    session.httpCommandQueue = [];
    this._clearObservations(session);
    session.connectedAt = Date.now();
  }

  _isSessionOnline(session) {
    if (session.transport === 'ws') {
      return Boolean(session.connected && session.conn);
    }
    if (session.transport === 'http') {
      return Boolean(session.httpPollWaiter || Date.now() - session.lastSeenAt < HTTP_SESSION_TTL_MS);
    }
    return false;
  }

  _pushBounded(arr, item) {
    arr.push(item);
    if (arr.length > MAX_BUFFER) arr.shift();
  }

  _publishObservation(session, type, data) {
    for (const [res, clientId] of this.observers) {
      if (clientId !== session.clientId) continue;
      if (res.writableLength > 1024 * 1024) {
        res.destroy();
      } else {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    }
  }

  _clearObservations(session) {
    session.observations = [];
    this._publishObservation(session, 'snapshot', session.observations);
  }

  _recordEvent(session, eventType, payload, ts) {
    session.lastSeenAt = Date.now();
    const item = { ts: ts || Date.now(), ...(payload || {}) };
    if (eventType === 'meta') {
      session.meta = { ...session.meta, ...(payload || {}) };
    } else if (eventType === 'bridge_trace') {
      this._pushBounded(session.traces, item);
    } else if (eventType === 'console') {
      this._pushBounded(session.consoles, item);
    } else if (eventType === 'page_error') {
      this._pushBounded(session.errors, item);
    } else if (eventType === 'network') {
      this._pushBounded(session.network, item);
    }

    if (eventType === 'interaction' || eventType === 'bridge_start' || eventType === 'bridge_trace' ||
        eventType === 'page_error' || eventType === 'console' ||
        (eventType === 'network' && (!item.ok || item.status >= 400))) {
      const event = { type: eventType, receivedAt: session.lastSeenAt, item };
      this._pushBounded(session.observations, event);
      this._publishObservation(session, 'activity', event);
    }
  }

  _flushHttpCommands(session) {
    if (!session.httpPollWaiter || session.httpCommandQueue.length === 0) return;
    const { res, timer } = session.httpPollWaiter;
    session.httpPollWaiter = null;
    clearTimeout(timer);
    const commands = session.httpCommandQueue.splice(0, session.httpCommandQueue.length);
    sendJson(res, 200, { ok: true, commands });
  }

  resolveDevice(deviceFilter, { allowOffline = false } = {}) {
    const all = [...this.sessions.values()];
    const online = all.filter((s) => this._isSessionOnline(s));
    const pool = allowOffline && online.length === 0 ? all : online;

    function pickFrom(list) {
      if (!deviceFilter) {
        if (list.length === 1) return list[0];
        return null;
      }
      const filterLower = deviceFilter.toLowerCase();
      const exact = list.find((s) => s.clientId === deviceFilter) || list.find((s) => s.clientId.toLowerCase() === filterLower);
      if (exact) return exact;
      const byPlatform = list.filter((s) => s.meta.platform === filterLower);
      if (byPlatform.length > 0) {
        return byPlatform.sort((a, b) => (b.traces.length - a.traces.length) || (b.lastSeenAt - a.lastSeenAt))[0];
      }
      const prefix = list.find((s) => s.clientId.startsWith(deviceFilter)) || list.find((s) => s.clientId.toLowerCase().startsWith(filterLower));
      if (prefix) return prefix;
      return null;
    }

    const hitOnline = pickFrom(online);
    if (hitOnline) return hitOnline;
    if (allowOffline) {
      const hitOffline = pickFrom(all);
      if (hitOffline) return hitOffline;
    }

    if (!deviceFilter) {
      if (pool.length === 0) throw new Error('No online WebView devices. Scan QR code on phone to open the local page first.');
      throw new Error(
        `Multiple devices online (${online.map((s) => `${s.clientId}[${s.meta.platform}]`).join(', ')}). Specify --device <id|android|ios|harmony>.`
      );
    }

    throw new Error(`Online device not found for "${deviceFilter}". Online: ${online.map((s) => s.clientId).join(', ') || 'none'}`);
  }

  sendRpc(session, cmd, payload = {}, timeoutMs = 15000) {
    if (!this._isSessionOnline(session)) {
      return Promise.reject(new Error(`Device ${session.clientId} is offline`));
    }
    const reqId = `rpc-${this.rpcSeq++}`;
    const commandMsg = { type: 'command', reqId, cmd, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpc.delete(reqId);
        reject(new Error(`RPC "${cmd}" to ${session.clientId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRpc.set(reqId, { resolve, reject, timer });

      if (session.transport === 'ws' && session.conn) {
        const sent = session.conn.sendJson(commandMsg);
        if (!sent) {
          clearTimeout(timer);
          this.pendingRpc.delete(reqId);
          reject(new Error(`Failed to send RPC "${cmd}" to ${session.clientId}`));
        }
      } else if (session.transport === 'http') {
        session.httpCommandQueue.push(commandMsg);
        this._flushHttpCommands(session);
      } else {
        clearTimeout(timer);
        this.pendingRpc.delete(reqId);
        reject(new Error(`Unknown transport for ${session.clientId}`));
      }
    });
  }

  _handleRpcResponse(msg) {
    const pending = this.pendingRpc.get(msg.reqId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingRpc.delete(msg.reqId);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || 'Remote command failed'));
  }

  _onWsConnection(conn) {
    let boundClientId = null;

    conn.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === 'register' && msg.meta && (msg.meta.clientId || msg.meta.baseName)) {
        const { clientId: assignedId, reclaimed } = this._allocateClientId(msg.meta);
        boundClientId = assignedId;
        const session = this._getOrCreateSession(boundClientId);
        if (reclaimed) {
          this._reclaimOfflineSession(session);
        } else if (session.conn && session.conn !== conn) {
          try { session.conn.close(1000, 'replaced'); } catch {}
        }
        session.instanceId = msg.meta.instanceId ? String(msg.meta.instanceId) : session.instanceId;
        session.transport = 'ws';
        session.conn = conn;
        session.connected = true;
        session.connectedAt = Date.now();
        session.lastSeenAt = Date.now();
        session.meta = { ...session.meta, ...msg.meta, clientId: boundClientId };
        conn.sendJson({ type: 'registered', clientId: boundClientId });
        console.error(`[wv-agent hub] [ws] device connected: ${boundClientId} (${session.meta.platform}) hasBridge=${session.meta.hasBridge} url=${session.meta.url}`);
        return;
      }

      if (msg.type === 'event') {
        const session = this.sessions.get(boundClientId);
        if (!session || session.conn !== conn) return;
        this._recordEvent(session, msg.eventType, msg.payload, msg.ts);
        return;
      }

      if (msg.type === 'response' && msg.reqId) {
        this._handleRpcResponse(msg);
      }
    });

    conn.on('close', () => {
      if (boundClientId) {
        const session = this.sessions.get(boundClientId);
        if (session && session.conn === conn) {
          session.connected = false;
          session.conn = null;
        }
      }
    });
  }

  async _serveObserver(req, res, url) {
    const host = req.headers.host || '';
    const localSocket = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
    const origin = req.headers.origin;
    if (!localSocket || !localHost || (origin && origin !== `http://${host}`)) {
      res.writeHead(403).end('Open the observer on the computer running wv-agent.');
      return;
    }

    const headers = {
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    const asset = OBSERVE_ASSETS.get(url.pathname);
    if (req.method === 'GET' && asset) {
      const [filename, contentType] = asset;
      const content = await fs.readFile(path.join(__dirname, filename));
      res.writeHead(200, {
        ...headers,
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Security-Policy': "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      }).end(content);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/observe/events') {
      const session = this.sessions.get(url.searchParams.get('device'));
      if (!session) {
        res.writeHead(404, headers).end('WebView session not found.');
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8' });
      res.on('close', () => this.observers.delete(res));
      this.observers.set(res, session.clientId);
      res.write(`event: snapshot\ndata: ${JSON.stringify(session.observations)}\n\n`);
      return;
    }

    res.writeHead(404, headers).end();
  }

  async _handleHttp(req, res) {
    const urlObj = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathname = urlObj.pathname;
    if (pathname === '/observe' || pathname.startsWith('/observe/')) {
      try {
        await this._serveObserver(req, res, urlObj);
      } catch {
        res.writeHead(500).end('Unable to load the observer.');
      }
      return;
    }

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    try {
      // Serve browser probe script
      if (req.method === 'GET' && pathname === '/client.js') {
        const script = await fs.readFile(CLIENT_SCRIPT_PATH, 'utf8');
        const configuredPort = Number(urlObj.searchParams.get('port') || this.port);
        const proxyPath = urlObj.searchParams.get('proxyPath') || '';
        const injectedCfg = { port: configuredPort };
        if (proxyPath) injectedCfg.proxyPath = proxyPath;
        const banner = `window.__WV_AGENT_CONFIG__ = Object.assign(${JSON.stringify(injectedCfg)}, window.__WV_AGENT_CONFIG__ || {});\n`;
        console.error(`[wv-agent hub] served /client.js (proxyPath=${proxyPath || 'none'})`);
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(banner + script);
        return;
      }

      // ===== Same-Origin HTTP Long-Poll Transport (works over dev server port 1234, zero extra port!) =====
      if (req.method === 'POST' && pathname === '/poll/register') {
        const body = await readJsonBody(req);
        const meta = body.meta || {};
        if (!meta.clientId && !meta.baseName) {
          sendJson(res, 400, { ok: false, error: 'meta.clientId or meta.baseName is required' });
          return;
        }
        const { clientId: assignedId, reclaimed } = this._allocateClientId(meta);
        const session = this._getOrCreateSession(assignedId);
        if (reclaimed) {
          this._reclaimOfflineSession(session);
        }
        session.instanceId = meta.instanceId ? String(meta.instanceId) : session.instanceId;
        session.transport = 'http';
        session.connected = true;
        session.connectedAt = session.connectedAt || Date.now();
        session.lastSeenAt = Date.now();
        session.meta = { ...session.meta, ...meta, clientId: assignedId };
        console.error(`[wv-agent hub] [http] device connected: ${assignedId} (${session.meta.platform}) hasBridge=${session.meta.hasBridge} url=${session.meta.url}`);
        sendJson(res, 200, { ok: true, clientId: assignedId });
        return;
      }

      if (req.method === 'GET' && pathname === '/poll/next') {
        const clientId = urlObj.searchParams.get('clientId');
        if (!clientId) {
          sendJson(res, 400, { ok: false, error: 'clientId is required' });
          return;
        }
        const session = this._getOrCreateSession(clientId);
        session.transport = 'http';
        session.connected = true;
        session.lastSeenAt = Date.now();

        if (session.httpCommandQueue.length > 0) {
          const commands = session.httpCommandQueue.splice(0, session.httpCommandQueue.length);
          sendJson(res, 200, { ok: true, commands });
          return;
        }

        // Replace any previous stale poll waiter
        if (session.httpPollWaiter) {
          clearTimeout(session.httpPollWaiter.timer);
          try {
            sendJson(session.httpPollWaiter.res, 200, { ok: true, commands: [] });
          } catch {}
          session.httpPollWaiter = null;
        }

        const timer = setTimeout(() => {
          if (session.httpPollWaiter && session.httpPollWaiter.res === res) {
            session.httpPollWaiter = null;
            session.lastSeenAt = Date.now();
            sendJson(res, 200, { ok: true, commands: [] });
          }
        }, LONG_POLL_TIMEOUT_MS);

        session.httpPollWaiter = { res, timer };
        req.on('close', () => {
          if (session.httpPollWaiter && session.httpPollWaiter.res === res) {
            clearTimeout(timer);
            session.httpPollWaiter = null;
          }
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/poll/push') {
        const body = await readJsonBody(req);
        const clientId = body.clientId;
        const session = clientId ? this._getOrCreateSession(clientId) : null;
        if (session) session.lastSeenAt = Date.now();

        if (Array.isArray(body.events) && session) {
          for (const ev of body.events) {
            this._recordEvent(session, ev.eventType, ev.payload, ev.ts);
          }
        }
        if (body.response && body.response.reqId) {
          this._handleRpcResponse(body.response);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          port: this.port,
          lanIps: getLanIps(),
          onlineCount: [...this.sessions.values()].filter((s) => this._isSessionOnline(s)).length,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/devices') {
        const devices = [...this.sessions.values()].map((s) => ({
          clientId: s.clientId,
          transport: s.transport,
          connected: this._isSessionOnline(s),
          platform: s.meta.platform,
          model: s.meta.model || '',
          url: s.meta.url,
          title: s.meta.title,
          hasBridge: s.meta.hasBridge,
          bridgeCapture: s.meta.bridgeCapture,
          viewport: s.meta.viewport,
          ua: s.meta.ua,
          connectedAt: s.connectedAt,
          lastSeenAt: s.lastSeenAt,
          counts: {
            traces: s.traces.length,
            errors: s.errors.length,
            consoles: s.consoles.length,
            network: s.network.length,
          },
        }));
        sendJson(res, 200, { ok: true, devices });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/rpc') {
        const body = await readJsonBody(req);
        const session = this.resolveDevice(body.device);
        const result = await this.sendRpc(session, body.cmd, body.payload || {}, body.timeoutMs || 15000);
        sendJson(res, 200, { ok: true, clientId: session.clientId, platform: session.meta.platform, result });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/bridge/diff') {
        const body = await readJsonBody(req);
        const bridgePath = body.path;
        const params = body.params || {};
        const timeoutMs = Number(body.timeoutMs || 8000);
        if (!bridgePath) {
          sendJson(res, 400, { ok: false, error: 'path is required' });
          return;
        }

        const requested = Array.isArray(body.devices) && body.devices.length > 0 ? body.devices : null;
        const targets = requested
          ? requested.map((d) => this.resolveDevice(d))
          : [...this.sessions.values()].filter((s) => this._isSessionOnline(s));

        if (targets.length === 0) {
          sendJson(res, 400, { ok: false, error: 'No online devices to run bridge diff' });
          return;
        }

        const settled = await Promise.all(
          targets.map(async (session) => {
            try {
              const result = await this.sendRpc(
                session,
                'bridge.call',
                { path: bridgePath, params, timeoutMs },
                timeoutMs + 3000
              );
              return { key: `${session.meta.platform}:${session.clientId}`, platform: session.meta.platform, clientId: session.clientId, result };
            } catch (err) {
              return {
                key: `${session.meta.platform}:${session.clientId}`,
                platform: session.meta.platform,
                clientId: session.clientId,
                result: { status: 'error', error: err.message },
              };
            }
          })
        );

        const resultsMap = {};
        for (const entry of settled) {
          resultsMap[entry.key] = entry.result;
        }
        const diffOptions = {
          contract: body.contract || body.schema || null,
          ignoreFields: Array.isArray(body.ignoreFields) ? body.ignoreFields : [],
          checkValues: body.checkValues === true,
        };
        const diffs = diffBridgeResults(resultsMap, diffOptions);
        const summary = summarizeBridgeDiff(resultsMap, diffs);
        const responsePayload = {
          ok: true,
          path: bridgePath,
          params,
          summary,
          results: resultsMap,
          diffs,
        };
        if (body.markdown === true) {
          responsePayload.markdown = formatDiffMarkdown(responsePayload);
        }
        sendJson(res, 200, responsePayload);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/traces') {
        const device = urlObj.searchParams.get('device');
        const limit = Number(urlObj.searchParams.get('limit') || 50);
        const session = this.resolveDevice(device || undefined, { allowOffline: true });
        sendJson(res, 200, {
          ok: true,
          clientId: session.clientId,
          platform: session.meta.platform,
          connected: this._isSessionOnline(session),
          traces: session.traces.slice(-limit),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/inspect') {
        const device = urlObj.searchParams.get('device');
        const limit = Number(urlObj.searchParams.get('limit') || 50);
        const session = this.resolveDevice(device || undefined, { allowOffline: true });
        const failedNetwork = session.network.filter((n) => !n.ok || n.status >= 400);
        sendJson(res, 200, {
          ok: true,
          clientId: session.clientId,
          platform: session.meta.platform,
          connected: this._isSessionOnline(session),
          meta: session.meta,
          errors: session.errors.slice(-limit),
          consoles: session.consoles.slice(-limit),
          failedNetwork: failedNetwork.slice(-limit),
          recentNetwork: session.network.slice(-limit),
        });
        return;
      }

      if (req.method === 'DELETE' && pathname === '/api/state') {
        const device = urlObj.searchParams.get('device');
        const sessions = device ? [this.resolveDevice(device)] : this.sessions.values();
        for (const session of sessions) {
          session.traces = [];
          session.consoles = [];
          session.errors = [];
          session.network = [];
          this._clearObservations(session);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: `Not found: ${pathname}` });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleHttp(req, res));
      attachWebSocketServer(this.server, {
        path: '/ws',
        onConnection: (conn) => this._onWsConnection(conn),
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.pingTimer = setInterval(() => {
          for (const s of this.sessions.values()) {
            if (s.transport === 'ws' && s.connected && s.conn) s.conn.ping('hb');
          }
          for (const res of this.observers.keys()) {
            if (res.writableLength > 1024 * 1024) res.destroy();
            else res.write(': heartbeat\n\n');
          }
        }, 20000);
        this.pingTimer.unref();
        resolve({ port: this.port, host: this.host, lanIps: getLanIps() });
      });
    });
  }

  stop() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const { reject, timer } of this.pendingRpc.values()) {
      clearTimeout(timer);
      reject(new Error('Hub stopped'));
    }
    this.pendingRpc.clear();
    for (const res of this.observers.keys()) res.end();
    this.observers.clear();
    for (const s of this.sessions.values()) {
      if (s.conn) s.conn.close(1001, 'Hub shutting down');
      if (s.httpPollWaiter) {
        clearTimeout(s.httpPollWaiter.timer);
        try { sendJson(s.httpPollWaiter.res, 200, { ok: true, commands: [] }); } catch {}
        s.httpPollWaiter = null;
      }
    }
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}
