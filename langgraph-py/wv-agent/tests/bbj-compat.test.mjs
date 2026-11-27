import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WvAgentHub } from '../src/hub.mjs';

const require = createRequire(import.meta.url);
const createWvAgentKoaMiddleware = require('../src/koa.cjs');
const wvAgentWebpackPlugin = require('../src/webpack.cjs');
const bridgeLoader = require('../src/bridge-loader.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_JS = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');

function createKoaLikeServer(middlewares) {
  return http.createServer(async (req, res) => {
    const responseHeaders = new Map();
    const ctx = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      req,
      res,
      request: {},
      response: {
        get(name) {
          return responseHeaders.get(String(name).toLowerCase()) || '';
        },
        set(name, val) {
          responseHeaders.set(String(name).toLowerCase(), val);
        },
      },
      type: '',
      status: 200,
      body: undefined,
      respond: true,
    };

    let idx = -1;
    async function dispatch(i) {
      if (i <= idx) throw new Error('next() called multiple times');
      idx = i;
      const fn = middlewares[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    }

    try {
      await dispatch(0);
      if (ctx.respond === false || res.writableEnded) return;
      res.statusCode = ctx.status || 200;
      for (const [k, v] of responseHeaders.entries()) {
        res.setHeader(k, v);
      }
      if (ctx.type && !res.getHeader('content-type')) {
        res.setHeader('Content-Type', ctx.type);
      }
      if (ctx.body === undefined || ctx.body === null) {
        res.end();
      } else if (typeof ctx.body === 'string' || Buffer.isBuffer(ctx.body)) {
        res.end(ctx.body);
      } else if (typeof ctx.body.pipe === 'function') {
        ctx.body.pipe(res);
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(ctx.body));
      }
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(err.message);
      }
    }
  });
}

test('Koa 2 middleware injects client.js into string/Buffer/Stream HTML and proxies /__wv_agent__ even after bodyParser', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();

  // Simulate Koa app where bodyParser runs BEFORE wv-agent middleware on /poll/register
  const bodyParserSim = async (ctx, next) => {
    if (ctx.method === 'POST') {
      const chunks = [];
      for await (const chunk of ctx.req) chunks.push(chunk);
      ctx.request.rawBody = Buffer.concat(chunks).toString('utf8');
      ctx.request.body = JSON.parse(ctx.request.rawBody || '{}');
    }
    await next();
  };

  const koaMw = createWvAgentKoaMiddleware({ hubPort: port });
  const routes = async (ctx) => {
    if (ctx.url === '/curve/index') {
      ctx.response.set('Content-Type', 'text/html; charset=utf-8');
      ctx.body = '<!doctype html><html><head><title>BBJ Curve</title></head><body><div id="app"></div></body></html>';
    } else if (ctx.url === '/buffer.html') {
      ctx.response.set('Content-Type', 'text/html; charset=utf-8');
      ctx.body = Buffer.from('<html><head></head><body>Buffer</body></html>', 'utf8');
    } else if (ctx.url === '/stream.html') {
      ctx.response.set('Content-Type', 'text/html; charset=utf-8');
      ctx.body = Readable.from(['<html><head></head>', '<body>Stream</body></html>']);
    } else if (ctx.url === '/api/ping') {
      ctx.response.set('Content-Type', 'application/json');
      ctx.body = { pong: true };
    } else {
      ctx.status = 404;
      ctx.body = 'not found';
    }
  };

  const server = createKoaLikeServer([bodyParserSim, koaMw, routes]);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const appOrigin = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Koa route without .html extension (like bbj /curve/index) gets script injected
    const html1 = await (await fetch(`${appOrigin}/curve/index`)).text();
    assert.ok(html1.includes('<script src="/__wv_agent__/client.js"></script>'));

    // 2. Buffer HTML and Readable Stream HTML both get script injected
    const html2 = await (await fetch(`${appOrigin}/buffer.html`)).text();
    assert.ok(html2.includes('<script src="/__wv_agent__/client.js"></script>'));

    const html3 = await (await fetch(`${appOrigin}/stream.html`)).text();
    assert.ok(html3.includes('<script src="/__wv_agent__/client.js"></script>'));

    // 3. JSON API response is untouched
    const json = await (await fetch(`${appOrigin}/api/ping`)).json();
    assert.deepEqual(json, { pong: true });

    // 4. Observer route blocked through proxy
    assert.equal((await fetch(`${appOrigin}/__wv_agent__/observe`)).status, 403);

    // 5. Client script proxied cleanly
    const js = await (await fetch(`${appOrigin}/__wv_agent__/client.js`)).text();
    assert.ok(js.includes(`"port":${port}`));
    assert.ok(js.includes(`"proxyPath":"/__wv_agent__"`));

    // 6. POST /poll/register works EVEN when Koa bodyParser already consumed ctx.req
    const regResp = await fetch(`${appOrigin}/__wv_agent__/poll/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { clientId: 'harmony-bbj', platform: 'harmony', url: `${appOrigin}/curve/index`, hasBridge: true },
      }),
    });
    const regData = await regResp.json();
    assert.equal(regData.ok, true);
    assert.equal(regData.clientId, 'harmony-bbj');
  } finally {
    server.closeAllConnections?.();
    server.close();
    await hub.stop();
  }
});

test('wvAgentWebpackPlugin registers pre-loader in development and no-ops in production', () => {
  const devCompiler = { options: { mode: 'development', module: { rules: [] } } };
  wvAgentWebpackPlugin().apply(devCompiler);
  assert.equal(devCompiler.options.module.rules.length, 1);
  const rule = devCompiler.options.module.rules[0];
  assert.equal(rule.enforce, 'pre');
  assert.ok(rule.test.test('/proj/node_modules/@meetyou/toolbox/lib/jssdk/index.js'));
  assert.ok(rule.test.test('/proj/node_modules/meetyou.jssdk/lib/sdk.js'));
  assert.ok(rule.test.test('/proj/node_modules/meetyou.bridge/lib/index.js'));
  assert.ok(!rule.test.test('/proj/client/curve/javascripts/App.vue'));

  const prodCompiler = { options: { mode: 'production', module: { rules: [] } } };
  wvAgentWebpackPlugin().apply(prodCompiler);
  assert.equal(prodCompiler.options.module.rules.length, 0);

  const envCompiler = { options: { mode: 'development', module: { rules: [] } } };
  const prevEnv = process.env.WV_AGENT;
  delete process.env.WV_AGENT;
  try {
    wvAgentWebpackPlugin({ onlyWhenEnv: true }).apply(envCompiler);
    assert.equal(envCompiler.options.module.rules.length, 0);
  } finally {
    if (prevEnv !== undefined) process.env.WV_AGENT = prevEnv;
  }
});

test('Webpack bridge-loader instruments meetyou.jssdk for read-only HarmonyOS Bridge without double tracing', () => {
  const jssdkFixture = `
    var _invokes = [];
    var MeiYouJSBridge = window.MeiYouJSBridge;
    if (MeiYouJSBridge) { ready(); } else { window.addEventListener('MeiYouJSBridgeReady', ready, false); }
    function ready() {
      MeiYouJSBridge = window.MeiYouJSBridge;
      _invokes.forEach(function(args) {
        MeiYouJSBridge.invoke.apply(MeiYouJSBridge, args);
      });
    }
    function callNative(path, params, callback) {
      if (typeof MeiYouJSBridge !== 'undefined' && typeof MeiYouJSBridge.invoke === 'function') {
        MeiYouJSBridge.invoke(path, params, callback);
      } else {
        _invokes.push([path, params, callback]);
      }
    }
    window.testJssdkCall = callNative;
  `;

  const transformed = bridgeLoader.call(
    { resourcePath: '/proj/node_modules/meetyou.jssdk/lib/sdk.js' },
    jssdkFixture
  );
  assert.ok(transformed.includes('wvAgentBridgeInvoker(MeiYouJSBridge)'));

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
      location: { href: 'http://phone.test/curve/index', search: '', protocol: 'http:' },
      document: { addEventListener() {} },
      addEventListener(name, fn) { if (name === 'MeiYouJSBridgeReady') listeners.push(fn); },
      setInterval: () => 0,
      clearInterval() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(CLIENT_JS, sandbox);
    socket.readyState = 1;
    socket.onopen();
    vm.runInNewContext(transformed, sandbox);

    const replies = [];
    sandbox.testJssdkCall('curve/deferred', { n: 1 }, (p, d) => replies.push({ p, d }));
    const bridge = {};
    const nativeInvoke = function (p, params, cb) {
      assert.equal(this, bridge);
      cb(p, params.n);
    };
    Object.defineProperty(bridge, 'invoke', { value: nativeInvoke, writable });
    Object.defineProperty(sandbox, 'MeiYouJSBridge', { value: bridge });
    for (const fn of listeners) fn();
    sandbox.testJssdkCall('curve/immediate', { n: 2 }, (p, d) => replies.push({ p, d }));

    assert.deepEqual(replies, [{ p: 'curve/deferred', d: 1 }, { p: 'curve/immediate', d: 2 }]);
    const traces = messages.filter((m) => m.eventType === 'bridge_trace');
    assert.deepEqual(traces.map((t) => t.payload.path), ['curve/deferred', 'curve/immediate']);
  }
});

test('meetyou.bridge instrumentation captures invoke & wait on iOS WKWebView and read-only HarmonyOS', () => {
  const meetBridgeIndexFixture = `
    var bridgeApi = {
      invoke: function(p, params, cb) { cb && cb(p, { from: 'bridgeApi', params: params }); },
      wait: function(p, params, cb) { cb && cb(p, { from: 'bridgeApi-wait', params: params }); },
      on: function() {},
      listen: function() {},
    };
    var legacyApi = bridgeApi;
    var root = window;
    var MeiYouJSBridge = root.MeiYouJSBridge || {};
    var bridge = MeiYouJSBridge;
    var bridgeApiList = Object.keys(bridgeApi);
    try {
      bridgeApiList.forEach(function(api) {
        Object.defineProperty(bridge, api, {
          value: bridgeApi[api]
        });
      });
    } catch (e) {}
    try {
      Object.defineProperty(window, 'MeiYouJSBridge', {
        value: bridge,
        writable: false,
        configurable: false,
        enumerable: false
      });
    } catch (e) {}
    module.exports = MeiYouJSBridge;
  `;

  const transformed = bridgeLoader.call(
    { resourcePath: '/proj/node_modules/meetyou.bridge/lib/index.js' },
    meetBridgeIndexFixture
  );
  assert.ok(transformed.includes('wvAgentBridgeDescriptor'));
  assert.ok(transformed.includes('wvAgentWrapBridgeExport'));

  // Case A: iOS WKWebView (meetyou.bridge creates window.MeiYouJSBridge)
  {
    const messages = [];
    let socket;
    const mod = { exports: {} };
    const sandbox = {
      module: mod,
      __WV_AGENT_CONFIG__: { wsUrl: 'ws://127.0.0.1:19527/ws' },
      WebSocket: class {
        constructor() { socket = this; }
        send(body) { messages.push(JSON.parse(body)); }
      },
      console: { log() {}, warn() {}, error() {} },
      navigator: { userAgent: 'iPhone MeetYouClient/2.0 (1)' },
      location: { href: 'http://phone.test/curve/index', search: '', protocol: 'http:' },
      document: { addEventListener() {} },
      addEventListener() {},
      setInterval: () => 0,
      clearInterval() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(CLIENT_JS, sandbox);
    socket.readyState = 1;
    socket.onopen();
    vm.runInNewContext(transformed, sandbox);

    const results = [];
    mod.exports.invoke('userInfo/get', { a: 1 }, (p, d) => results.push({ p, d }));
    mod.exports.wait('appInfo/get', { b: 2 }, (p, d) => results.push({ p, d }));
    assert.equal(results.length, 2);
    const traces = messages.filter((m) => m.eventType === 'bridge_trace');
    assert.deepEqual(traces.map((t) => t.payload.path), ['userInfo/get', 'appInfo/get']);
  }

  // Case B: HarmonyOS read-only native bridge injected BEFORE meetyou.bridge runs
  {
    const messages = [];
    let socket;
    const mod = { exports: {} };
    const nativeBridge = {};
    const nativeInvoke = function (p, params, cb) {
      assert.equal(this, nativeBridge);
      cb(p, { from: 'harmony-native', params });
    };
    Object.defineProperty(nativeBridge, 'invoke', { value: nativeInvoke, writable: false, configurable: false });
    Object.defineProperty(nativeBridge, 'wait', { value: nativeInvoke, writable: false, configurable: false });

    const sandbox = {
      module: mod,
      __WV_AGENT_CONFIG__: { wsUrl: 'ws://127.0.0.1:19527/ws' },
      WebSocket: class {
        constructor() { socket = this; }
        send(body) { messages.push(JSON.parse(body)); }
      },
      console: { log() {}, warn() {}, error() {} },
      navigator: { userAgent: 'OpenHarmony ArkWeb' },
      location: { href: 'http://phone.test/curve/index', search: '', protocol: 'http:' },
      document: { addEventListener() {} },
      addEventListener() {},
      setInterval: () => 0,
      clearInterval() {},
    };
    Object.defineProperty(sandbox, 'MeiYouJSBridge', { value: nativeBridge, writable: false, configurable: false });
    sandbox.window = sandbox;
    vm.runInNewContext(CLIENT_JS, sandbox);
    socket.readyState = 1;
    socket.onopen();
    vm.runInNewContext(transformed, sandbox);

    const results = [];
    mod.exports.invoke('tools/heightWeight/getBabyInfo', { id: 1 }, (p, d) => results.push({ p, d }));
    mod.exports.wait('userInfo/get', {}, (p, d) => results.push({ p, d }));
    assert.equal(results.length, 2);
    assert.equal(results[0].d.from, 'harmony-native');
    const traces = messages.filter((m) => m.eventType === 'bridge_trace');
    assert.deepEqual(traces.map((t) => t.payload.path), ['tools/heightWeight/getBabyInfo', 'userInfo/get']);
  }
});

test('PC browser live proxy shim resists overwrite by uninstrumented meetyou.bridge and supports jsbridge.wait/listen', async () => {
  const hub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await hub.start();
  const base = `http://127.0.0.1:${port}`;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  await new Promise((resolve) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'register',
        meta: { clientId: 'android-bbj', platform: 'android', url: 'http://localhost:7600/curve/index', hasBridge: true },
      }));
      resolve();
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === 'command' && msg.cmd === 'bridge.call') {
        ws.send(JSON.stringify({
          type: 'response',
          reqId: msg.reqId,
          ok: true,
          result: { status: 'resolved', path: msg.payload.path, cbPath: msg.payload.path, data: { bbid: '999', ok: true }, durationMs: 9 },
        }));
      }
    });
  });
  await new Promise((r) => setTimeout(r, 60));

  let closed = false;
  const timers = [];
  try {
    const sandbox = {
      __WV_AGENT_CONFIG__: { port, proxyPath: '' },
      WebSocket: class {
        close() {}
      },
      console: { log() {}, warn() {}, error() {} },
      Event: class Event { constructor(t) { this.type = t; } },
      setTimeout: (fn, ms) => {
        if (closed) return 0;
        const t = setTimeout(() => { if (!closed) fn(); }, ms);
        t.unref?.();
        timers.push(t);
        return t;
      },
      clearTimeout,
      setInterval: () => 0,
      clearInterval() {},
      navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0' },
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        href: `http://127.0.0.1:7600/curve/index?bridgeDebug=live&bridgeDevice=android-bbj&bridgeDebugLog=0&bridgeHub=${encodeURIComponent(base)}`,
        search: `?bridgeDebug=live&bridgeDevice=android-bbj&bridgeDebugLog=0&bridgeHub=${encodeURIComponent(base)}`,
      },
      document: { title: 'BBJ', hidden: false, addEventListener() {} },
      fetch,
      addEventListener() {},
      dispatchEvent() {},
      module: { exports: {} },
    };
    sandbox.window = sandbox;
    vm.runInNewContext(CLIENT_JS, sandbox);

    // Run UNINSTRUMENTED meetyou.bridge/lib/index.js behavior after client.js
    vm.runInNewContext(`
      var MeiYouJSBridge = window.MeiYouJSBridge || {};
      var bridge = MeiYouJSBridge;
      bridge.set = function() {};
      bridge.get = function() { return {}; };
      ['invoke', 'wait', 'on', 'listen', 'off', 'unlisten'].forEach(function(api) {
        try {
          Object.defineProperty(bridge, api, {
            value: function() { throw new Error('Should NOT overwrite locked wv-agent shim: ' + api); }
          });
        } catch (e) {}
      });
      module.exports = MeiYouJSBridge;
    `, sandbox);

    const jsbridge = sandbox.module.exports;
    assert.equal(jsbridge.__wvAgentShim__, 'live');
    assert.equal(typeof jsbridge.set, 'function');
    assert.equal(typeof jsbridge.listen, 'function');
    assert.equal(typeof jsbridge.unlisten, 'function');

    const res = await new Promise((resolve) => {
      jsbridge.wait('userInfo/get', { Concurrent: true }, (cbPath, data) => resolve({ cbPath, data }));
    });
    assert.equal(res.cbPath, 'userInfo/get');
    assert.equal(res.data.bbid, '999');
  } finally {
    closed = true;
    for (const t of timers) clearTimeout(t);
    ws.close();
    await hub.stop();
  }
});

test('Vue 2 / Vant BEM classes and Vue $listeners.click are detected by snapshot', () => {
  function makeEl({ tag, className = '', text = '', vueListeners = null }) {
    return {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      className,
      innerText: text,
      textContent: text,
      disabled: false,
      __vue__: vueListeners ? { $listeners: vueListeners } : undefined,
      getAttribute: () => null,
      hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }),
    };
  }

  const els = [
    makeEl({ tag: 'div', className: 'van-picker__confirm', text: '确定' }),
    makeEl({ tag: 'div', className: 'van-cell van-cell--clickable', text: '身高记录' }),
    makeEl({ tag: 'span', className: 'van-popup__close-icon', text: '关闭' }),
    makeEl({ tag: 'div', className: 'record-card', text: '新增宝宝', vueListeners: { click: () => {} } }),
    makeEl({ tag: 'div', className: 'plain-text-box', text: '普通文本' }),
  ];

  const sandbox = {
    __WV_AGENT_CONFIG__: { wsUrl: 'ws://127.0.0.1:19527/ws' },
    WebSocket: class {},
    console: { log() {}, warn() {}, error() {} },
    navigator: { userAgent: 'Mozilla/5.0 Android 14' },
    location: { href: 'http://phone.test/curve/index', search: '', protocol: 'http:' },
    document: {
      title: 'BBJ Curve',
      body: { innerText: '身高记录' },
      documentElement: { scrollHeight: 800 },
      addEventListener() {},
      querySelectorAll: () => els,
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', cursor: 'default' }),
    addEventListener() {},
    setInterval: () => 0,
    clearInterval() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(CLIENT_JS, sandbox);

  const snap = sandbox.__WV_AGENT_API__.snapshot();
  assert.deepEqual(
    Array.from(snap.elements, (e) => e.text),
    ['确定', '身高记录', '关闭', '新增宝宝']
  );
});
