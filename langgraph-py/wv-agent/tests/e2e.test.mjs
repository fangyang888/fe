import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WvAgentHub } from '../src/hub.mjs';
import {
  diffBridgeResults,
  validateBridgeContract,
  summarizeBridgeDiff,
  formatDiffMarkdown,
} from '../src/diff.mjs';
import { findAdbBinary, findHdcBinary } from '../src/native.mjs';

const require = createRequire(import.meta.url);
const createWvAgentMiddleware = require('../src/middleware.cjs');
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../bin/wv-agent.mjs');

function connectMockPhone(port, { clientId, platform, bridgeResponder }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.addEventListener('open', () => {
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
      resolve({
        ws,
        emit(eventType, payload) {
          ws.send(JSON.stringify({ type: 'event', eventType, clientId, ts: Date.now(), payload }));
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener('error', (err) => reject(err));
    ws.addEventListener('message', async (ev) => {
      const msg = JSON.parse(String(ev.data));
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
  });
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

test('diffBridgeResults detects empty_mismatch, format_mismatch, ignoreFields, and checkValues without false positives', () => {
  const results = {
    'android:a1': {
      status: 'resolved',
      data: {
        nickName: '小红',
        birthday: '2026-11-24',
        updatedAt: 1732436000,
        avatar: 'https://cdn.example.com/a.png',
        tags: ['vip'],
        flagStr: 'true',
        env: 'prod',
        traceId: 'trace-android-1',
        freeText: '测试账号A',
      },
    },
    'harmony:h1': {
      status: 'resolved',
      data: {
        nickName: '',
        birthday: '2026/11/24',
        updatedAt: 1732436000000,
        avatar: '//cdn.example.com/a.png',
        tags: [],
        flagStr: '1',
        env: 'gray',
        traceId: 'trace-harmony-2',
        freeText: '测试账号B',
      },
    },
  };

  const diffs = diffBridgeResults(results, { ignoreFields: ['traceId'] });
  const keys = diffs.map((d) => `${d.kind}:${d.field}`);

  assert.ok(keys.includes('empty_mismatch:nickName'));
  assert.ok(keys.includes('empty_mismatch:tags'));
  assert.ok(keys.includes('format_mismatch:birthday'));
  assert.ok(keys.includes('format_mismatch:updatedAt'));
  assert.ok(keys.includes('format_mismatch:avatar'));
  assert.ok(keys.includes('format_mismatch:flagStr'));
  // Free text differences should NOT trigger format_mismatch or value_mismatch by default
  assert.ok(!diffs.some((d) => d.field === 'freeText'));
  assert.ok(!diffs.some((d) => d.field === 'env'));
  assert.ok(!diffs.some((d) => d.field === 'traceId'));

  // With checkValues: true, env and freeText should report value_mismatch, traceId still ignored
  const strictDiffs = diffBridgeResults(results, { ignoreFields: ['traceId'], checkValues: true });
  assert.ok(strictDiffs.some((d) => d.kind === 'value_mismatch' && d.field === 'env'));
  assert.ok(strictDiffs.some((d) => d.kind === 'value_mismatch' && d.field === 'freeText'));
  assert.ok(!strictDiffs.some((d) => d.field === 'traceId'));
});

test('validateBridgeContract works on a single device with shorthand and JSON Schema formats', () => {
  const singleResult = {
    'harmony:h1': {
      status: 'resolved',
      data: {
        nickName: '',
        avatar: 'http://cdn.example.com/a.png',
        gender: 9,
        age: '28',
      },
    },
  };

  // Shorthand contract
  const violations = validateBridgeContract(singleResult, {
    nickName: { type: 'string', nonEmpty: true },
    avatar: { type: 'string', format: 'url:https' },
    gender: { type: 'number', enum: [0, 1, 2] },
    age: 'number',
    uid: { type: 'string', required: true },
  });
  const kinds = violations.map((v) => `${v.kind}:${v.field}`);
  assert.ok(kinds.includes('contract_empty:nickName'));
  assert.ok(kinds.includes('contract_format_mismatch:avatar'));
  assert.ok(kinds.includes('contract_enum_mismatch:gender'));
  assert.ok(kinds.includes('contract_type_mismatch:age'));
  assert.ok(kinds.includes('contract_missing:uid'));

  // Standard JSON Schema format
  const jsonSchemaViolations = diffBridgeResults(singleResult, {
    contract: {
      type: 'object',
      required: ['uid', 'nickName'],
      properties: {
        uid: { type: 'string' },
        nickName: { type: 'string', minLength: 1 },
      },
    },
  });
  assert.ok(jsonSchemaViolations.some((v) => v.kind === 'contract_missing' && v.field === 'uid'));
  assert.ok(jsonSchemaViolations.some((v) => v.kind === 'contract_empty' && v.field === 'nickName'));

  const summary = summarizeBridgeDiff(singleResult, violations);
  assert.equal(summary.passed, false);
  assert.equal(summary.errorCount, 5);
  const md = formatDiffMarkdown({ path: 'userInfo/get', params: {}, results: singleResult, diffs: violations, summary });
  assert.ok(md.includes('userInfo/get'));
  assert.ok(md.includes('contract_empty'));
});

test('E2E CLI bridge diff supports --schema, --ignore, --check-values, and --md', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();
  let androidPhone;
  let harmonyPhone;

  try {
    androidPhone = await connectMockPhone(port, {
      clientId: 'android-d1',
      platform: 'android',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 22,
        data: { nickName: '小美', birthday: '2026-11-24', reqId: 'r-1', role: 'vip' },
      }),
    });
    harmonyPhone = await connectMockPhone(port, {
      clientId: 'harmony-d1',
      platform: 'harmony',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        params,
        durationMs: 31,
        data: { nickName: '', birthday: '2026/11/24', reqId: 'r-2', role: 'normal' },
      }),
    });
    await new Promise((r) => setTimeout(r, 60));

    // JSON output with --ignore, --check-values, --schema
    const diffRes = await runCli(
      [
        'bridge',
        'diff',
        'userInfo/get',
        '{}',
        '--ignore',
        'reqId',
        '--check-values',
        '--schema',
        '{"nickName":{"type":"string","nonEmpty":true}}',
      ],
      port
    );
    assert.equal(diffRes.ok, true);
    assert.equal(diffRes.summary.passed, false);
    assert.ok(diffRes.diffs.some((d) => d.kind === 'empty_mismatch' && d.field === 'nickName'));
    assert.ok(diffRes.diffs.some((d) => d.kind === 'format_mismatch' && d.field === 'birthday'));
    assert.ok(diffRes.diffs.some((d) => d.kind === 'value_mismatch' && d.field === 'role'));
    assert.ok(diffRes.diffs.some((d) => d.kind === 'contract_empty' && d.field === 'nickName'));
    assert.ok(!diffRes.diffs.some((d) => d.field === 'reqId'));

    // Raw Markdown output with --md (without --json)
    const { stdout: mdOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'bridge', 'diff', 'userInfo/get', '{}', '--md', '--port', String(port)],
      { timeout: 15000 }
    );
    assert.ok(mdOut.includes('### JSBridge 协议对账单：`userInfo/get`'));
    assert.ok(mdOut.includes('empty_mismatch'));
    assert.ok(mdOut.includes('format_mismatch'));
  } finally {
    androidPhone?.close();
    harmonyPhone?.close();
    await hub.stop();
  }
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

test('Vite toolbox instrumentation captures immediate and deferred calls on a read-only Bridge', async () => {
  const sdkPath = path.join(os.tmpdir(), 'wv-agent-sdk-fixture-' + process.pid + '.js');
  const sdk = `
    var pending = [];
    window.addEventListener('MeiYouJSBridgeReady', function () {
      pending.forEach(function (calls) {
        var _a;
        (_a = window.MeiYouJSBridge).invoke.apply(_a, calls);
      });
    });
    window.sdkCall = function (path, params, callback) {
      if (window.MeiYouJSBridge && window.MeiYouJSBridge.invoke) {
        return window.MeiYouJSBridge.invoke(path, params, callback);
      }
      pending.push([path, params, callback]);
    };
  `;
  fs.writeFileSync(sdkPath, sdk);
  let transformed;
  try {
    const plugin = createWvAgentMiddleware.wvAgentVitePlugin().config().optimizeDeps.esbuildOptions.plugins[0];
    let load;
    plugin.setup({ onLoad: (_options, handler) => { load = handler; } });
    transformed = await load({ path: sdkPath });
  } finally {
    fs.unlinkSync(sdkPath);
  }

  const probe = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
  for (const writable of [false, true]) {
    const listeners = [];
    const messages = [];
    let socket;
    const sandbox = {
      __WV_AGENT_CONFIG__: { wsUrl: 'ws://127.0.0.1:19527/ws' },
      WebSocket: class {
        constructor() { socket = this; }
        send(body) { messages.push(JSON.parse(body)); }
      },
      console: { log() {}, warn() {}, error() {} },
      navigator: { userAgent: 'OpenHarmony ArkWeb' },
      location: { href: 'http://phone.test/family.html', search: '', protocol: 'http:' },
      document: { addEventListener() {} },
      addEventListener(name, handler) {
        if (name === 'MeiYouJSBridgeReady') listeners.push(handler);
      },
      setInterval: () => 0,
      clearInterval() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(probe, sandbox);
    socket.readyState = 1;
    socket.onopen();
    vm.runInNewContext(transformed.contents, sandbox);

    const results = [];
    const onReply = (replyPath, data) => results.push({ path: replyPath, data });
    sandbox.sdkCall('startup/deferred', { test: 1 }, onReply);
    const bridge = {};
    const nativeInvoke = function (bridgePath, params, callback) {
      assert.equal(this, bridge);
      callback(bridgePath, params.test);
    };
    Object.defineProperty(bridge, 'invoke', { value: nativeInvoke, writable });
    Object.defineProperty(sandbox, 'MeiYouJSBridge', { value: bridge });
    for (const ready of listeners) ready();
    sandbox.sdkCall('startup/immediate', { test: 2 }, onReply);

    assert.equal(bridge.invoke === nativeInvoke, !writable);
    assert.equal(sandbox.__WV_AGENT_API__.getMeta().bridgeCapture, writable ? 'native' : 'sdk');
    assert.deepEqual(results, [{ path: 'startup/deferred', data: 1 }, { path: 'startup/immediate', data: 2 }]);
    const traces = messages.filter(({ eventType }) => ['bridge_start', 'bridge_trace'].includes(eventType));
    assert.deepEqual(traces.map(({ eventType, payload }) => [eventType, payload.path]), [
      ['bridge_start', 'startup/deferred'],
      ['bridge_trace', 'startup/deferred'],
      ['bridge_start', 'startup/immediate'],
      ['bridge_trace', 'startup/immediate'],
    ]);
    assert.equal(traces[0].payload.documentId, traces[1].payload.documentId);
    assert.equal(traces[0].payload.id, traces[1].payload.id);
  }
});

test('Observer streams H5 activity for the selected phone and keeps existing Bridge traces intact', { timeout: 8000 }, async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();
  const origin = `http://127.0.0.1:${port}`;
  const middleware = createWvAgentMiddleware({ hubPort: port });
  const appServer = http.createServer((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const appOrigin = `http://127.0.0.1:${appServer.address().port}`;
  const controller = new AbortController();
  let android;

  async function post(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  }

  function readEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    return async () => {
      while (!buffered.includes('\n\n')) {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        buffered += decoder.decode(value, { stream: true });
      }
      const boundary = buffered.indexOf('\n\n');
      const [eventLine, dataLine] = buffered.slice(0, boundary).split('\n');
      buffered = buffered.slice(boundary + 2);
      return [eventLine.slice('event: '.length), JSON.parse(dataLine.slice('data: '.length))];
    };
  }

  try {
    const page = await fetch(`${origin}/observe`);
    assert.match(await page.text(), /手机实时观察/);
    assert.equal((await fetch(`${origin}/observe/app.js`)).status, 200);
    assert.equal((await fetch(`${appOrigin}/__wv_agent__/observe`)).status, 403);
    assert.equal((await fetch(`${origin}/observe`, { headers: { Origin: appOrigin } })).status, 403);

    const phoneUrl = `${appOrigin}/__wv_agent__/poll`;
    const { clientId } = await post(`${phoneUrl}/register`, {
      meta: { clientId: 'harmony-observe', platform: 'harmony', hasBridge: true },
    });
    const push = (events) => post(`${phoneUrl}/push`, { clientId, events });
    const click = { action: 'click', label: '保存相册' };
    await push([{ eventType: 'interaction', payload: click }]);

    const response = await fetch(`${origin}/observe/events?device=${clientId}`, { signal: controller.signal });
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const nextEvent = readEvents(response);
    const [snapshotType, snapshot] = await nextEvent();
    assert.equal(snapshotType, 'snapshot');
    assert.equal(snapshot[0].item.label, click.label);

    android = await connectMockPhone(port, { clientId: 'android-observe', platform: 'android' });
    const registered = new Promise((resolve) => android.ws.addEventListener('message', resolve, { once: true }));
    await registered;
    const otherStream = await fetch(`${origin}/observe/events?device=android-observe`, { signal: controller.signal });
    const nextAndroidEvent = readEvents(otherStream);
    assert.deepEqual(await nextAndroidEvent(), ['snapshot', []]);
    android.emit('interaction', { action: 'click', label: '另一台设备' });
    assert.equal((await nextAndroidEvent())[1].item.label, '另一台设备');

    const call = { id: 1, documentId: 'doc-one', path: 'album/save', params: { images: ['fixture.png'] } };
    await push([
      { eventType: 'bridge_start', payload: call },
      { eventType: 'network', payload: { status: 200, ok: true } },
      { eventType: 'network', payload: { status: 503, ok: false } },
      { eventType: 'page_error', payload: { message: 'fixture error' } },
    ]);
    const [eventName, start] = await nextEvent();
    assert.equal(eventName, 'activity');
    assert.equal(start.type, 'bridge_start');
    assert.equal(start.item.documentId, call.documentId);
    assert.deepEqual(start.item.params, call.params);
    assert.equal((await nextEvent())[1].item.status, 503);
    assert.equal((await nextEvent())[1].type, 'page_error');
    assert.deepEqual((await (await fetch(`${origin}/api/traces?device=${clientId}`)).json()).traces, []);

    const trace = { ...call, source: 'page', status: 'resolved', data: { saved: true }, durationMs: 12 };
    await push([{ eventType: 'bridge_trace', payload: trace }]);
    const [, completed] = await nextEvent();
    assert.equal(completed.type, 'bridge_trace');
    assert.equal(completed.item.documentId, call.documentId);
    assert.deepEqual(completed.item.data, trace.data);
    assert.equal((await (await fetch(`${origin}/api/traces?device=${clientId}`)).json()).traces.length, 1);

    await push([
      { eventType: 'bridge_start', payload: { ...call, id: 2, source: 'agent' } },
      { eventType: 'bridge_trace', payload: { ...call, id: 2, source: 'agent', status: 'timeout' } },
    ]);
    assert.equal((await nextEvent())[1].item.source, 'agent');
    assert.equal((await nextEvent())[1].item.status, 'timeout');

    await fetch(`${origin}/api/state?device=${clientId}`, { method: 'DELETE' });
    assert.deepEqual(await nextEvent(), ['snapshot', []]);
  } finally {
    controller.abort();
    android?.close();
    appServer.close();
    appServer.closeAllConnections();
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
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('PC browser live proxy (?bridgeDebug=live & ?bridgeProxy=1) forwards MeiYouJSBridge.invoke to online Android device in real time', async () => {
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
  const appOrigin = `http://127.0.0.1:${appPort}`;

  let androidPhone;
  let testClosed = false;
  const timers = [];
  const abortController = new AbortController();

  function runBrowserClient(search) {
    return new Promise(async (resolve, reject) => {
      try {
        const jsResp = await fetch(`${appOrigin}/__wv_agent__/client.js`);
        const jsText = await jsResp.text();

        const sandbox = {
          console: { log() {}, warn() {}, error() {} },
          Event: class Event {
            constructor(type) { this.type = type; }
          },
          setTimeout: (fn, ms) => {
            if (testClosed) return 0;
            const t = setTimeout(() => { if (!testClosed) fn(); }, ms);
            t.unref?.();
            timers.push(t);
            return t;
          },
          clearTimeout,
          setInterval: () => 0,
          clearInterval: () => {},
          navigator: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
          },
          location: {
            protocol: 'http:',
            hostname: '127.0.0.1',
            href: `${appOrigin}/family.html${search}`,
            search,
          },
          document: {
            title: '家庭会员',
            hidden: false,
            addEventListener() {},
          },
          fetch: (url, init) => {
            if (testClosed) return Promise.reject(new Error('closed'));
            const fullUrl = String(url).startsWith('http') ? url : `${appOrigin}${url}`;
            return fetch(fullUrl, { ...(init || {}), signal: abortController.signal });
          },
          addEventListener() {},
          dispatchEvent() {},
          innerWidth: 1280,
          innerHeight: 800,
          devicePixelRatio: 2,
        };
        sandbox.window = sandbox;
        vm.runInNewContext(jsText, sandbox);
        resolve(sandbox);
      } catch (err) {
        reject(err);
      }
    });
  }

  try {
    androidPhone = await connectMockPhone(port, {
      clientId: 'android-live1',
      platform: 'android',
      bridgeResponder: async ({ path: p, params }) => ({
        status: 'resolved',
        path: p,
        cbPath: p,
        params,
        durationMs: 18,
        data: { nickName: '安卓真机用户', fromParams: params },
      }),
    });
    await new Promise((r) => setTimeout(r, 60));

    // 1. Explicit device (?bridgeDebug=live&bridgeDevice=android-live1)
    const pcWin1 = await runBrowserClient('?bridgeDebug=live&bridgeDevice=android-live1&bridgeDebugLog=0');
    assert.ok(pcWin1.MeiYouJSBridge && typeof pcWin1.MeiYouJSBridge.invoke === 'function');
    assert.equal(pcWin1.__WV_AGENT_API__.getMeta().hasBridge, false);

    const res1 = await new Promise((resolve) => {
      pcWin1.MeiYouJSBridge.invoke('userInfo/get', { scene: 'family' }, (cbPath, data) => {
        resolve({ cbPath, data });
      });
    });
    assert.equal(res1.cbPath, 'userInfo/get');
    assert.equal(res1.data.nickName, '安卓真机用户');
    assert.deepEqual(res1.data.fromParams, { scene: 'family' });

    // 2. Auto-pick shorthand (?bridgeProxy=1)
    const pcWin2 = await runBrowserClient('?bridgeProxy=1&bridgeDebugLog=0');
    const res2 = await new Promise((resolve) => {
      pcWin2.MeiYouJSBridge.invoke('appInfo/get', {}, (cbPath, data) => {
        resolve({ cbPath, data });
      });
    });
    assert.equal(res2.cbPath, 'appInfo/get');
    assert.equal(res2.data.nickName, '安卓真机用户');
  } finally {
    testClosed = true;
    abortController.abort();
    for (const t of timers) clearTimeout(t);
    androidPhone?.close();
    appServer.closeAllConnections?.();
    appServer.close();
    await hub.stop();
  }
});

test('Devices are named by model (e.g. Android-PCAM10) and deduplicated as -1, -2 when same model connects concurrently', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify client.js derives model-based names from UA (Android-PCAM10, Harmony-Phone, custom Android-ps)
    const jsResp = await fetch(`${base}/client.js?port=${port}&proxyPath=%2F__wv_agent__`);
    const jsText = await jsResp.text();

    async function bootClient(ua, search = '', storageMap = new Map()) {
      const registered = [];
      let resolveReg;
      const regDone = new Promise((r) => { resolveReg = r; });

      const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        Event: class Event { constructor(t) { this.type = t; } },
        sessionStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => { storageMap.set(k, String(v)); },
        },
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        navigator: { userAgent: ua },
        location: { protocol: 'http:', hostname: '127.0.0.1', href: `http://127.0.0.1:1234/family.html${search}`, search },
        document: { title: '家庭会员', hidden: false, addEventListener() {} },
        fetch: async (url, init) => {
          const pathOnly = String(url).replace(/^\/__wv_agent__/, '');
          if (pathOnly.startsWith('/poll/register')) {
            const resp = await fetch(`${base}${pathOnly}`, init);
            const clone = resp.clone();
            const json = await clone.json();
            registered.push(json);
            resolveReg(json);
            return resp;
          }
          // Ignore poll/next in unit test to keep event loop clean
          return new Response(JSON.stringify({ ok: true, commands: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
        addEventListener() {},
        dispatchEvent() {},
        innerWidth: 360,
        innerHeight: 780,
        devicePixelRatio: 3,
      };
      sandbox.window = sandbox;
      vm.runInNewContext(jsText, sandbox);
      await regDone;
      return { sandbox, reg: registered[0], storageMap };
    }

    const androidUa = 'Mozilla/5.0 (Linux; Android 11; PCAM10 Build/RP1A.200720.011; wv) AppleWebKit/537.36 Chrome/83.0 Mobile Safari/537.36';
    const harmonyUa = 'Mozilla/5.0 (Phone; OpenHarmony 7.0) AppleWebKit/537.36 ArkWeb/7.0.0.111 Mobile';

    // Three concurrent Android PCAM10 devices -> Android-PCAM10, Android-PCAM10-1, Android-PCAM10-2
    const a1 = await bootClient(androidUa);
    const a2 = await bootClient(androidUa);
    const a3 = await bootClient(androidUa);
    assert.equal(a1.reg.clientId, 'Android-PCAM10');
    assert.equal(a1.sandbox.__WV_AGENT_API__.getClientId(), 'Android-PCAM10');
    assert.equal(a2.reg.clientId, 'Android-PCAM10-1');
    assert.equal(a2.sandbox.__WV_AGENT_API__.getClientId(), 'Android-PCAM10-1');
    assert.equal(a3.reg.clientId, 'Android-PCAM10-2');

    // Same tab reloads (same sessionStorage / instanceId) -> keeps Android-PCAM10-1 instead of creating -3
    const a2Reload = await bootClient(androidUa, '', a2.storageMap);
    assert.equal(a2Reload.reg.clientId, 'Android-PCAM10-1');

    // Harmony phone -> Harmony-Phone, second one -> Harmony-Phone-1
    const h1 = await bootClient(harmonyUa);
    const h2 = await bootClient(harmonyUa);
    assert.equal(h1.reg.clientId, 'Harmony-Phone');
    assert.equal(h2.reg.clientId, 'Harmony-Phone-1');

    // Custom ?wvDeviceName=Android-ps -> Android-ps, Android-ps-1
    const ps1 = await bootClient(androidUa, '?wvDeviceName=Android-ps');
    const ps2 = await bootClient(androidUa, '?wvDeviceName=Android-ps');
    assert.equal(ps1.reg.clientId, 'Android-ps');
    assert.equal(ps2.reg.clientId, 'Android-ps-1');

    // Case-insensitive lookup works on hub
    const resolved = hub.resolveDevice('android-pcam10-1');
    assert.equal(resolved.clientId, 'Android-PCAM10-1');
  } finally {
    await hub.stop();
  }
});
