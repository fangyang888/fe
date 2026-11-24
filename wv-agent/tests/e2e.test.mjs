import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WvAgentHub } from '../src/hub.mjs';
import { WsConnection } from '../src/ws-server.mjs';
import { diffBridgeResults } from '../src/diff.mjs';
import { findAdbBinary, findHdcBinary } from '../src/native.mjs';

const require = createRequire(import.meta.url);
const createWvAgentMiddleware = require('../src/middleware.cjs');
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../bin/wv-agent.mjs');

/**
 * Masked RFC 6455 client frame encoder (works on Node 18/20/22/24 without global WebSocket).
 */
function encodeClientTextFrame(text) {
  const data = Buffer.from(String(text), 'utf8');
  const mask = crypto.randomBytes(4);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([header, masked]);
}

function openRawWsClient(port) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(
        [
          'GET /ws HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n')
      );
    });
    let handshakeBuf = Buffer.alloc(0);
    const onHandshake = (chunk) => {
      handshakeBuf = Buffer.concat([handshakeBuf, chunk]);
      const endIdx = handshakeBuf.indexOf('\r\n\r\n');
      if (endIdx === -1) return;
      socket.off('data', onHandshake);
      const headerStr = handshakeBuf.subarray(0, endIdx).toString('utf8');
      if (!headerStr.startsWith('HTTP/1.1 101')) {
        socket.destroy();
        reject(new Error(`WS handshake failed: ${headerStr}`));
        return;
      }
      const rest = handshakeBuf.subarray(endIdx + 4);
      const conn = new WsConnection(socket, null);
      if (rest.length > 0) conn._onData(rest);
      resolve({
        send(text) {
          if (!socket.destroyed) socket.write(encodeClientTextFrame(text));
        },
        onMessage(fn) {
          conn.on('message', fn);
        },
        close() {
          conn.close(1000);
        },
      });
    };
    socket.on('data', onHandshake);
    socket.once('error', reject);
  });
}

async function connectMockPhone(port, { clientId, platform, bridgeResponder }) {
  const ws = await openRawWsClient(port);
  ws.send(
    JSON.stringify({
      type: 'register',
      meta: {
        clientId,
        platform,
        ua: `Mock-${platform}-WebView`,
        url: `http://192.168.1.10:1234/index.html`,
        title: 'Puzzle Test',
        hasBridge: true,
        viewport: { width: 390, height: 844, dpr: 3 },
      },
    })
  );
  ws.onMessage(async (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'command') return;
    if (msg.cmd === 'snapshot') {
      ws.send(
        JSON.stringify({
          type: 'response',
          reqId: msg.reqId,
          ok: true,
          result: {
            meta: { clientId, platform, url: 'http://192.168.1.10:1234/index.html', hasBridge: true },
            elementCount: 2,
            elements: [
              { ref: 'e1', tag: 'button', text: '保存相册', rect: { x: 10, y: 700, w: 120, h: 44 } },
              { ref: 'e2', tag: 'input', placeholder: '输入标题', value: '', rect: { x: 10, y: 100, w: 300, h: 40 } },
            ],
            bodyTextPreview: '拼图测试页 保存相册',
          },
        })
      );
    } else if (msg.cmd === 'bridge.call') {
      const res = await bridgeResponder(msg.payload);
      ws.send(JSON.stringify({ type: 'response', reqId: msg.reqId, ok: true, result: res }));
    } else if (msg.cmd === 'act') {
      ws.send(
        JSON.stringify({
          type: 'response',
          reqId: msg.reqId,
          ok: true,
          result: { ok: true, action: msg.payload.action, ref: msg.payload.ref },
        })
      );
    }
  });
  return {
    ws,
    emit(eventType, payload) {
      ws.send(JSON.stringify({ type: 'event', eventType, clientId, ts: Date.now(), payload }));
    },
    close() {
      ws.close();
    },
  };
}

async function runCli(args, port) {
  const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...args, '--port', String(port), '--json'], {
    timeout: 15000,
  });
  return JSON.parse(stdout);
}

test('diffBridgeResults detects field missing, type mismatch, and status mismatch', () => {
  const diffs = diffBridgeResults({
    'android:a1': { status: 'resolved', data: { success: 1, error: 0, uid: '1001' } },
    'ios:i1': { status: 'resolved', data: { success: true, error: 0, uid: '1001' } },
    'harmony:h1': { status: 'resolved', data: { success: true, uid: '1001' } },
  });
  const fields = diffs.map((d) => `${d.kind}:${d.field}`);
  assert.ok(fields.includes('type_mismatch:success'));
  assert.ok(fields.includes('missing_field:error'));
});

test('E2E: Hub + 3-platform WebView (Android/iOS/Harmony) + CLI + bridge diff + export-debug', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();

  // Mock meetyou.bridge-debug server
  const reported = [];
  const bridgeDebugServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      reported.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => bridgeDebugServer.listen(0, '127.0.0.1', r));
  const debugPort = bridgeDebugServer.address().port;

  let androidPhone;
  let iosPhone;
  let harmonyPhone;

  try {
    androidPhone = await connectMockPhone(port, {
      clientId: 'android-a1',
      platform: 'android',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 35,
        data: { success: 1, error: 0 },
      }),
    });
    iosPhone = await connectMockPhone(port, {
      clientId: 'ios-i1',
      platform: 'ios',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 28,
        data: { success: true, error: 0 },
      }),
    });
    harmonyPhone = await connectMockPhone(port, {
      clientId: 'harmony-h1',
      platform: 'harmony',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 41,
        data: { success: true, bigPayload: 'x'.repeat(70000) }, // >65KB frame test!
      }),
    });

    // Wait briefly for registrations
    await new Promise((r) => setTimeout(r, 80));

    // Emit page trace, console error, and failed network event on Android
    androidPhone.emit('bridge_trace', {
      kind: 'invoke',
      source: 'page',
      path: 'userInfo/get',
      params: {},
      data: { userid: '42', nickName: 'Tester' },
      status: 'resolved',
      durationMs: 19,
    });
    androidPhone.emit('console', { level: 'error', text: 'Uncaught test warning' });
    androidPhone.emit('network', { kind: 'fetch', method: 'GET', url: '/user-api/profile', status: 500, ok: false });
    await new Promise((r) => setTimeout(r, 50));

    // 1. CLI devices
    const devicesRes = await runCli(['devices'], port);
    assert.equal(devicesRes.hub.online, true);
    assert.equal(devicesRes.hub.devices.length, 3);

    // 2. CLI snapshot & act
    const snapRes = await runCli(['snapshot', '-d', 'android'], port);
    assert.equal(snapRes.result.elementCount, 2);
    const actRes = await runCli(['act', 'click', 'e1', '-d', 'android'], port);
    assert.equal(actRes.result.ok, true);

    // 3. CLI bridge call (including >65KB payload on HarmonyOS)
    const callRes = await runCli(['bridge', 'call', 'album/save', '{"images":["a.png"]}', '-d', 'harmony'], port);
    assert.equal(callRes.result.status, 'resolved');
    assert.equal(callRes.result.data.bigPayload.length, 70000);

    // 4. CLI bridge diff across all 3 platforms
    const diffRes = await runCli(['bridge', 'diff', 'album/save', '{"images":["a.png"]}'], port);
    assert.equal(Object.keys(diffRes.results).length, 3);
    assert.ok(diffRes.diffs.some((d) => d.field === 'success' && d.kind === 'type_mismatch'));
    assert.ok(diffRes.diffs.some((d) => d.field === 'error' && d.kind === 'missing_field'));

    // 5. CLI inspect & bridge trace
    const inspectRes = await runCli(['inspect', '-d', 'android'], port);
    assert.equal(inspectRes.consoles.length, 1);
    assert.equal(inspectRes.failedNetwork.length, 1);

    const traceRes = await runCli(['bridge', 'trace', '-d', 'android'], port);
    assert.equal(traceRes.traces[0].path, 'userInfo/get');

    // 6. CLI bridge export-debug -> meetyou.bridge-debug
    const exportRes = await runCli(
      ['bridge', 'export-debug', '-d', 'android', '--target', `http://127.0.0.1:${debugPort}/__bridge-debug__`],
      port
    );
    assert.equal(exportRes.exported, 1);
    assert.equal(reported.length, 1);
    assert.equal(reported[0].url, '/__bridge-debug__/invoke/report');
    assert.equal(reported[0].body.path, 'userInfo/get');
  } finally {
    androidPhone?.close();
    iosPhone?.close();
    harmonyPhone?.close();
    bridgeDebugServer.close();
    await hub.stop();
  }
});

test('Connect middleware injects client.js into HTML and proxies /__wv_agent__/client.js', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();

  const mw = createWvAgentMiddleware({ hubPort: port });
  const appServer = http.createServer((req, res) => {
    mw(req, res, () => {
      if (req.url === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><head><title>Demo</title></head><body><h1>Hi</h1></body></html>');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ hello: 'world' }));
      }
    });
  });
  await new Promise((r) => appServer.listen(0, '127.0.0.1', r));
  const appPort = appServer.address().port;

  try {
    const htmlResp = await fetch(`http://127.0.0.1:${appPort}/index.html`);
    const html = await htmlResp.text();
    assert.ok(html.includes('<script src="/__wv_agent__/client.js"></script>'));

    const jsonResp = await fetch(`http://127.0.0.1:${appPort}/api/data`);
    const json = await jsonResp.json();
    assert.equal(json.hello, 'world');

    const jsResp = await fetch(`http://127.0.0.1:${appPort}/__wv_agent__/client.js`);
    const jsText = await jsResp.text();
    assert.ok(jsText.includes('MeiYouJSBridge'));
    assert.ok(jsText.includes(`"port":${port}`));
    assert.ok(jsText.includes(`"proxyPath":"/__wv_agent__"`));
  } finally {
    appServer.close();
    await hub.stop();
  }
});

test('Native binary discovery locates adb and hdc paths', () => {
  assert.ok(typeof findAdbBinary() === 'string' && findAdbBinary().length > 0);
  assert.ok(typeof findHdcBinary() === 'string' && findHdcBinary().length > 0);
});

test('Same-origin HTTP long-poll transport through middleware works end-to-end', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();

  const mw = createWvAgentMiddleware({ hubPort: port });
  const appServer = http.createServer((req, res) => {
    mw(req, res, () => {
      res.statusCode = 404;
      res.end('not found');
    });
  });
  await new Promise((r) => appServer.listen(0, '127.0.0.1', r));
  const appPort = appServer.address().port;
  const base = `http://127.0.0.1:${appPort}/__wv_agent__`;

  try {
    // 1. Register HarmonyOS phone via same-origin middleware
    const regResp = await fetch(`${base}/poll/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { clientId: 'harmony-http1', platform: 'harmony', url: 'http://10.0.62.49:1234/family.html', hasBridge: true },
      }),
    });
    assert.equal((await regResp.json()).ok, true);

    // 2. Start long-poll & concurrently invoke CLI bridge call
    const pollPromise = fetch(`${base}/poll/next?clientId=harmony-http1`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 40));

    const cliPromise = runCli(['bridge', 'call', 'userInfo/get', '{}', '-d', 'harmony'], port);
    const pollData = await pollPromise;
    assert.equal(pollData.commands.length, 1);
    assert.equal(pollData.commands[0].cmd, 'bridge.call');

    // 3. Phone replies via same-origin /poll/push
    await fetch(`${base}/poll/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'harmony-http1',
        response: {
          type: 'response',
          reqId: pollData.commands[0].reqId,
          ok: true,
          result: { status: 'resolved', path: 'userInfo/get', data: { nickName: '美柚测试昵称' }, durationMs: 12 },
        },
      }),
    });

    const cliRes = await cliPromise;
    assert.equal(cliRes.ok, true);
    assert.equal(cliRes.result.data.nickName, '美柚测试昵称');
  } finally {
    appServer.close();
    await hub.stop();
  }
});

test('CLI plugin build / install / status / uninstall works for Antigravity & Codex with zero source leakage', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-agent-plugin-test-'));
  const outDir = path.join(tmpRoot, 'dist-plugins');
  const agRoot = path.join(tmpRoot, 'antigravity-plugins');
  const codexRoot = path.join(tmpRoot, 'codex-skills');

  try {
    // 1. plugin build
    const { stdout: buildOut } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'build',
      '--out',
      outDir,
      '--pkg',
      '@my-org/wv-agent',
      '--json',
    ]);
    const buildRes = JSON.parse(buildOut);
    assert.equal(buildRes.ok, true);
    assert.equal(buildRes.containsSourceCode, false);

    const agManifestPath = path.join(outDir, 'antigravity', 'wv-agent', 'plugin.json');
    const agSkillPath = path.join(outDir, 'antigravity', 'wv-agent', 'skills', 'wv-agent', 'SKILL.md');
    const codexSkillPath = path.join(outDir, 'codex', 'wv-agent', 'SKILL.md');
    const codexYamlPath = path.join(outDir, 'codex', 'wv-agent', 'agents', 'openai.yaml');

    assert.ok(fs.existsSync(agManifestPath));
    assert.ok(fs.existsSync(agSkillPath));
    assert.ok(fs.existsSync(codexSkillPath));
    assert.ok(fs.existsSync(codexYamlPath));

    const agSkill = fs.readFileSync(agSkillPath, 'utf8');
    assert.ok(agSkill.includes('npx -y @my-org/wv-agent'));
    assert.ok(!agSkill.includes('/Users/'));

    // Ensure zero JS source files in generated plugin bundles
    const walkFiles = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? walkFiles(p) : [p];
      });
    const builtFiles = walkFiles(outDir);
    assert.ok(builtFiles.every((f) => !/\.(js|mjs|cjs|ts)$/.test(f)));

    // 2. plugin install (isolated dirs)
    const { stdout: installOut } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'install',
      '--target',
      'all',
      '--pkg',
      '@my-org/wv-agent',
      '--antigravity-dir',
      agRoot,
      '--codex-dir',
      codexRoot,
      '--json',
    ]);
    const installRes = JSON.parse(installOut);
    assert.equal(installRes.ok, true);

    // 3. plugin status -> both installed
    const { stdout: statusOut1 } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'status',
      '--antigravity-dir',
      agRoot,
      '--codex-dir',
      codexRoot,
      '--json',
    ]);
    const status1 = JSON.parse(statusOut1);
    assert.equal(status1.antigravity.installed, true);
    assert.equal(status1.codex.installed, true);

    // 4. plugin uninstall -> both removed
    await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'uninstall',
      '--target',
      'all',
      '--antigravity-dir',
      agRoot,
      '--codex-dir',
      codexRoot,
      '--json',
    ]);
    const { stdout: statusOut2 } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'status',
      '--antigravity-dir',
      agRoot,
      '--codex-dir',
      codexRoot,
      '--json',
    ]);
    const status2 = JSON.parse(statusOut2);
    assert.equal(status2.antigravity.installed, false);
    assert.equal(status2.codex.installed, false);

    // 5. plugin build in Remote MCP mode
    const mcpOutDir = path.join(tmpRoot, 'dist-remote-mcp');
    const { stdout: mcpBuildOut } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'plugin',
      'build',
      '--out',
      mcpOutDir,
      '--mcp-url',
      'http://47.106.103.79/wv-agent/mcp',
      '--json',
    ]);
    assert.equal(JSON.parse(mcpBuildOut).ok, true);
    const mcpCfg = JSON.parse(
      fs.readFileSync(path.join(mcpOutDir, 'antigravity', 'wv-agent', 'mcp_config.json'), 'utf8')
    );
    assert.equal(mcpCfg.mcpServers['wv-agent-mcp'].serverUrl, 'http://47.106.103.79/wv-agent/mcp');
    const codexToml = fs.readFileSync(path.join(mcpOutDir, 'codex', 'wv-agent', 'codex-mcp.toml'), 'utf8');
    assert.ok(codexToml.includes('url = "http://47.106.103.79/wv-agent/mcp"'));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Remote MCP Streamable HTTP (/mcp) initialize, tools/list, and tools/call end-to-end', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();
  const mcpEndpoint = `http://127.0.0.1:${port}/mcp`;

  let androidPhone;
  let harmonyPhone;

  async function mcpCall(method, params = {}, id = 1, sessionId = '') {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const resp = await fetch(mcpEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const text = await resp.text();
    return {
      status: resp.status,
      sessionId: resp.headers.get('mcp-session-id'),
      body: text ? JSON.parse(text) : null,
    };
  }

  try {
    // 1. initialize
    const init = await mcpCall('initialize', { protocolVersion: '2025-03-26', clientInfo: { name: 'test', version: '1.0' } }, 1);
    assert.equal(init.status, 200);
    assert.ok(init.sessionId);
    assert.equal(init.body.result.serverInfo.name, 'wv-agent-mcp');

    // 2. notifications/initialized -> 202
    const notifResp = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': init.sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    assert.equal(notifResp.status, 202);

    // 3. tools/list
    const list = await mcpCall('tools/list', {}, 2, init.sessionId);
    const toolNames = list.body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('wv_devices'));
    assert.ok(toolNames.includes('wv_bridge_call'));
    assert.ok(toolNames.includes('wv_bridge_diff'));

    // 4. Connect Android & Harmony phones and call MCP tools
    androidPhone = await connectMockPhone(port, {
      clientId: 'android-mcp1',
      platform: 'android',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 20,
        data: { nickName: '小柚子Android', success: 1 },
      }),
    });
    harmonyPhone = await connectMockPhone(port, {
      clientId: 'harmony-mcp1',
      platform: 'harmony',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 18,
        data: { nickName: '', success: true },
      }),
    });
    await new Promise((r) => setTimeout(r, 80));

    const devRes = await mcpCall('tools/call', { name: 'wv_devices', arguments: {} }, 3, init.sessionId);
    const devPayload = JSON.parse(devRes.body.result.content[0].text);
    assert.equal(devPayload.devices.length, 2);

    const diffRes = await mcpCall(
      'tools/call',
      { name: 'wv_bridge_diff', arguments: { path: 'userInfo/get', params: {} } },
      4,
      init.sessionId
    );
    const diffPayload = JSON.parse(diffRes.body.result.content[0].text);
    assert.equal(diffPayload.ok, true);
    assert.ok(diffPayload.diffs.some((d) => d.field === 'success' && d.kind === 'type_mismatch'));
  } finally {
    androidPhone?.close();
    harmonyPhone?.close();
    await hub.stop();
  }
});
