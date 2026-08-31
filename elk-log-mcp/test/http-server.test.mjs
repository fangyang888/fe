import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startElkHttpServer } from '../lib/http-server.mjs';
import { buildLogQuery, buildLogResult } from '../lib/log-query.mjs';

const token = 'synthetic-test-token-never-use-in-production-123456';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function connect(t, url, modern = true) {
  const client = new Client({ name: 'http-test', version: '1' }, modern ? { versionNegotiation: { mode: 'auto' } } : {});
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers, redirect: 'error' } }));
  return client;
}

test('HTTP 启动前必须配置合法服务令牌', async () => {
  for (const bad of [undefined, '', 'short', 'x'.repeat(31) + '\n']) {
    await assert.rejects(startElkHttpServer({ token: bad, port: 0 }), /ELK_MCP_TOKEN/);
  }
});

test('HTTP 认证、Host/Origin、路径、方法和请求体边界', { timeout: 10_000 }, async (t) => {
  const server = await startElkHttpServer({ token, port: 0 });
  t.after(() => server.close());
  const call = (options = {}) => fetch(server.url, { method: 'POST', headers, body: '{}', ...options });
  assert.equal((await call({ headers: { 'Content-Type': 'application/json' } })).status, 401);
  assert.equal((await call({ headers: { ...headers, Authorization: 'Bearer wrong' } })).status, 401);
  // Node fetch 会自行管理 Host；用原始 HTTP 请求验证 DNS rebinding 防护。
  const badHost = await new Promise((resolve, reject) => {
    const req = request(server.url, { method: 'POST', headers: { ...headers, Host: 'attacker.invalid' } }, (res) => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(badHost, 403);
  assert.equal((await call({ headers: { ...headers, Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await fetch(server.url + '?token=wrong', { method: 'POST', headers, body: '{}' })).status, 404);
  assert.equal((await call({ method: 'PUT' })).status, 405);
  assert.equal((await call({ headers: { ...headers, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call({ body: 'invalid json' })).status, 400);
  assert.equal((await call({ body: ' '.repeat(65_537) })).status, 413);
});

for (const modern of [false, true]) test(`HTTP ${modern ? '现代' : '旧版'}协议能发现工具并读取真实初始状态（不启动浏览器）`, { timeout: 10_000 }, async (t) => {
  const server = await startElkHttpServer({ token, port: 0 });
  t.after(() => server.close());
  const client = await connect(t, server.url, modern);
  assert.equal((await client.listTools()).tools.length, 4);
  const result = await client.callTool({ name: 'get_connection_status', arguments: {} });
  assert.equal(result.structuredContent.state, 'not_open');
  const query = await client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } });
  assert.equal(query.isError, true);
  assert.equal(query.structuredContent.code, 'NOT_OPEN');
});

test('浏览器业务会话跨 HTTP 请求和客户端连接保留，仅服务退出时清理（替身）', { timeout: 10_000 }, async (t) => {
  let opened = false;
  let closed = 0;
  const server = await startElkHttpServer({ token, port: 0, session: {
    open: async () => { opened = true; return { state: 'needs_login_or_setup' }; },
    status: async () => ({ state: opened ? 'discover_available' : 'not_open' }),
    search: async (args) => buildLogResult({ state: 'empty' }, buildLogQuery(args)),
    close: async () => { closed++; },
  } });
  t.after(() => server.close());
  const first = await connect(t, server.url);
  await first.callTool({ name: 'open_kibana', arguments: {} });
  await first.close();
  assert.equal(closed, 0);
  const second = await connect(t, server.url);
  assert.equal((await second.callTool({ name: 'get_connection_status', arguments: {} })).structuredContent.state, 'discover_available');
  assert.equal((await second.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } })).structuredContent.totalMatches, 0);
  await second.close();
  await server.close();
  assert.equal(closed, 1);
});

test('HTTP 现代协议取消请求会传到浏览器会话（替身）', { timeout: 10_000 }, async (t) => {
  const entered = deferred();
  const cancelled = deferred();
  const server = await startElkHttpServer({ token, port: 0, session: {
    search: async (_args, signal) => {
      entered.resolve();
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      cancelled.resolve();
      throw new Error('aborted');
    },
    close: async () => {},
  } });
  t.after(() => server.close());
  const client = await connect(t, server.url);
  const controller = new AbortController();
  const call = client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } }, { signal: controller.signal });
  const rejected = assert.rejects(call);
  await entered.promise;
  controller.abort();
  await rejected;
  await cancelled.promise;
});

test('真实 HTTP 入口、自检 CLI 和 SIGTERM 退出', { timeout: 10_000 }, async (t) => {
  const env = { ...process.env, ELK_MCP_TOKEN: token, ELK_MCP_PORT: '0' };
  const child = spawn(process.execPath, [fileURLToPath(new URL('../http-server.mjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exited = once(child, 'exit');
  const port = await new Promise((resolve, reject) => {
    let stderr = '';
    child.once('error', reject);
    child.once('exit', () => reject(new Error('HTTP server exited before readiness')));
    child.stderr.on('data', (data) => {
      stderr += data;
      const match = stderr.match(/http:\/\/127\.0\.0\.1:(\d+)\/mcp/);
      if (match) resolve(match[1]);
    });
  });
  const check = spawn(process.execPath, [fileURLToPath(new URL('../check-http.mjs', import.meta.url))], {
    env: { ...env, ELK_MCP_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (check.exitCode === null) check.kill('SIGKILL'); });
  let output = '';
  check.stdout.on('data', (data) => { output += data; });
  const [code] = await once(check, 'exit');
  assert.equal(code, 0);
  assert.match(output, /HTTP MCP 连接成功/);
  assert.match(output, /not_open/);
  assert.equal(output.includes(token), false);
  child.kill('SIGTERM');
  assert.deepEqual(await exited, [0, null]);
});
