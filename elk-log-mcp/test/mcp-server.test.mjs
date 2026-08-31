import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createElkMcpServer } from '../lib/mcp-server.mjs';
import { KibanaSession } from '../lib/kibana-session.mjs';
import {
  buildLogQuery,
  buildLogResult,
  buildPathVisitQuery,
  buildPathVisitResult,
} from '../lib/log-query.mjs';

const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function connectMemory(t, session) {
  const server = createElkMcpServer({ session });
  const client = new Client({ name: 'elk-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(b);
  await client.connect(a);
  return client;
}

for (const mode of ['legacy', 'auto']) test(`stdio ${mode} 子进程握手、工具发现、状态和未登录错误，不启动浏览器`, { timeout: 15_000 }, async (t) => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' },
    mode === 'auto' ? { versionNegotiation: { mode: 'auto' } } : {});
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], stderr: 'pipe' });
  t.after(() => client.close());
  let stderr = '';
  transport.stderr?.on('data', (data) => { stderr += data; });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['count_path_visits', 'get_connection_status', 'open_kibana', 'search_logs']);
  const schema = tools.find((tool) => tool.name === 'search_logs').inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.limit.maximum, 50);
  const status = await client.callTool({ name: 'get_connection_status', arguments: {} });
  assert.equal(status.structuredContent.state, 'not_open');
  const query = await client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } });
  assert.equal(query.isError, true);
  assert.equal(query.structuredContent.code, 'NOT_OPEN');
  assert.equal(stderr, '');
});

test('真实 MCP 调用校验参数、拒绝额外 KQL，成功结果通过协议返回（会话替身）', async (t) => {
  const calls = [];
  const session = {
    search: async (args) => {
      calls.push(args);
      return buildLogResult({ state: 'empty' }, buildLogQuery(args));
    },
    open: async () => ({ state: 'needs_login_or_setup' }),
    status: async () => ({ state: 'discover_available' }),
  };
  const client = await connectMemory(t, session);
  for (const args of [{}, { host: '*.example.com' }, { host: 'https://api.example.com' },
    { host: 'api.example.com', limit: 51 }, { host: 'api.example.com', limit: '10' },
    { host: 'api.example.com', kql: '*' }]) {
    const result = await client.callTool({ name: 'search_logs', arguments: args });
    assert.equal(result.isError, true);
  }
  assert.equal(calls.length, 0);
  const result = await client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.totalMatches, 0);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(calls, [{ host: 'elk-mcp-check.invalid', limit: 10, range: 'last_15m' }]);
  assert.equal((await client.callTool({ name: 'open_kibana', arguments: {} })).structuredContent.state, 'needs_login_or_setup');
});

test('路径访问量工具只接受受限参数，并保留 exact 统计语义（会话替身）', async (t) => {
  const calls = [];
  const session = {
    countPathVisits: async (args) => {
      calls.push(args);
      return buildPathVisitResult(
        { state: 'results', records: [{ url_path: args.url_path }], renderedRows: 1, totalHits: 7 },
        buildPathVisitQuery(args),
      );
    },
  };
  const client = await connectMemory(t, session);
  for (const args of [
    { host: 'api.example.com', url_path: 'relative/path' },
    { host: 'api.example.com', url_path: '/bad path' },
    { host: 'api.example.com', url_path: '/ok', range: 'tomorrow' },
    { host: '*.example.com', url_path: '/ok' },
  ]) {
    const result = await client.callTool({ name: 'count_path_visits', arguments: args });
    assert.equal(result.isError, true);
  }
  const result = await client.callTool({ name: 'count_path_visits', arguments: {
    host: 'api.example.com', url_path: '/puzzle/template.html', range: 'today',
  } });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.count, 7);
  assert.equal(result.structuredContent.exact, true);
  assert.deepEqual(calls, [{ host: 'api.example.com', url_path: '/puzzle/template.html', range: 'today' }]);
});

test('路径访问量工具支持后端注入的多域名白名单', async (t) => {
  const calls = [];
  const client = await connectMemory(t, {
    countPathVisits: async (args) => {
      calls.push(args);
      return buildPathVisitResult(
        { state: 'empty' },
        buildPathVisitQuery(args),
      );
    },
  });
  const result = await client.callTool({ name: 'count_path_visits', arguments: {
    hosts: ['api.example.com', 'www.example.com'],
    url_path: '/puzzle/template.html',
  } });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.count, 0);
  assert.deepEqual(calls, [{
    hosts: ['api.example.com', 'www.example.com'],
    url_path: '/puzzle/template.html',
    range: 'today',
  }]);
});

test('路径访问量工具允许仅按路径查询', async (t) => {
  const calls = [];
  const client = await connectMemory(t, {
    countPathVisits: async (args) => {
      calls.push(args);
      return buildPathVisitResult({ state: 'empty' }, buildPathVisitQuery(args));
    },
  });
  const result = await client.callTool({ name: 'count_path_visits', arguments: {
    url_path: '/puzzle/template.html',
  } });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.query.host, null);
  assert.deepEqual(calls, [{ url_path: '/puzzle/template.html', range: 'today' }]);
});

test('MCP 不透传浏览器异常中的页面内容、认证信息或调用栈', async (t) => {
  const client = await connectMemory(t, { search: async () => { throw new Error('Cookie=secret <html>private</html>'); } });
  const result = await client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, 'BROWSER_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /secret|private|<html>|stack/);
});

test('MCP 协议取消信号传入会话并终止正在运行的查询', async (t) => {
  const entered = deferred();
  const cancelled = deferred();
  const client = await connectMemory(t, { search: async (_args, signal) => {
    entered.resolve();
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    cancelled.resolve();
    throw new Error('cancelled');
  } });
  const controller = new AbortController();
  const pending = client.callTool({ name: 'search_logs', arguments: { host: 'elk-mcp-check.invalid' } }, { signal: controller.signal });
  const rejection = assert.rejects(pending);
  await entered.promise;
  controller.abort();
  await rejection;
  await cancelled.promise;
});

// 会话生命周期测试用浏览器替身；不访问网络、不读取本机登录态。
function browserFixture() {
  const closed = deferred();
  let connected = true;
  let pageClosed = false;
  let url = 'about:blank';
  let navigations = 0;
  const page = {
    url: () => url,
    isClosed: () => pageClosed,
    setDefaultTimeout: () => {},
    goto: async (next) => { url = next; navigations++; },
    locator: () => ({ isVisible: async () => true }),
  };
  const browser = {
    isConnected: () => connected,
    newPage: async () => page,
    close: async () => { connected = false; pageClosed = true; closed.resolve(); },
  };
  return { browser, closed, page, get navigations() { return navigations; },
    enterDiscover: () => { url = 'https://elklog-ops.meiyou.com/app/discover'; },
    closePage: () => { pageClosed = true; } };
}

test('浏览器按需启动、重复打开不重置，关闭标签后可重开，退出释放浏览器', async () => {
  const fixtures = [];
  const session = new KibanaSession({ launchBrowser: async () => {
    const fixture = browserFixture(); fixtures.push(fixture); return fixture.browser;
  } });
  assert.equal((await session.status()).state, 'not_open');
  assert.equal(fixtures.length, 0);
  await assert.rejects(session.search({ host: 'elk-mcp-check.invalid' }), { code: 'NOT_OPEN' });
  assert.equal((await session.open()).state, 'needs_login_or_setup');
  fixtures[0].enterDiscover();
  assert.equal((await session.open()).state, 'discover_available');
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].navigations, 1);
  fixtures[0].closePage();
  await session.open();
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].browser.isConnected(), false);
  await session.close();
  assert.equal(fixtures[1].browser.isConnected(), false);
  await assert.rejects(session.open(), { code: 'SESSION_CLOSED' });
});

test('MCP 并发调用返回 BUSY，会话保留本次填写的查询用于下一次调用', async (t) => {
  const fixture = browserFixture();
  const entered = deferred();
  const finished = deferred();
  const previous = [];
  const session = new KibanaSession({ launchBrowser: async () => fixture.browser,
    queryLogs: async (_page, query, owner) => {
      previous.push(owner.previousQuery);
      owner.onQueryChanged(query.kql);
      entered.resolve();
      await finished.promise;
      return buildLogResult({ state: 'empty' }, query);
    } });
  t.after(() => session.close());
  await session.open();
  const client = await connectMemory(t, session);
  const running = client.callTool({ name: 'search_logs', arguments: { host: 'first.invalid' } });
  await entered.promise;
  assert.equal((await client.callTool({ name: 'get_connection_status', arguments: {} })).structuredContent.state, 'busy');
  const busy = await client.callTool({ name: 'search_logs', arguments: { host: 'second.invalid' } });
  assert.equal(busy.structuredContent.code, 'BUSY');
  finished.resolve();
  await running;
  await client.callTool({ name: 'search_logs', arguments: { host: 'second.invalid' } });
  assert.deepEqual(previous, ['', buildLogQuery({ host: 'first.invalid' }).kql]);
});

test('取消和操作超时关闭自有浏览器，不把失败返回为零', async () => {
  for (const cancel of [true, false]) {
    const fixture = browserFixture();
    const entered = deferred();
    const controller = new AbortController();
    const session = new KibanaSession({ launchBrowser: async () => fixture.browser,
      operationTimeoutMs: cancel ? 1000 : 30,
      queryLogs: async () => { entered.resolve(); await fixture.closed.promise; throw new Error('page closed'); } });
    await session.open();
    const query = session.search({ host: 'elk-mcp-check.invalid' }, controller.signal);
    const rejection = assert.rejects(query, { code: cancel ? 'CANCELLED' : 'OPERATION_TIMEOUT' });
    await entered.promise;
    if (cancel) controller.abort();
    await rejection;
    assert.equal(fixture.browser.isConnected(), false);
    assert.equal((await session.status()).state, 'not_open');
    await session.close();
  }
});

test('启动过程中取消也会关闭迟到的浏览器', async () => {
  const fixture = browserFixture();
  const launch = deferred();
  const started = deferred();
  const controller = new AbortController();
  const session = new KibanaSession({ launchBrowser: async () => { started.resolve(); return launch.promise; } });
  const opening = session.open(controller.signal);
  const rejection = assert.rejects(opening, { code: 'CANCELLED' });
  await started.promise;
  controller.abort();
  launch.resolve(fixture.browser);
  await rejection;
  assert.equal(fixture.browser.isConnected(), false);
  await session.close();
});

test('stdio 在 stdin EOF 和 SIGTERM 后正常退出', { timeout: 15_000 }, async (t) => {
  for (const mode of ['eof', 'signal']) {
    const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    const exited = once(child, 'exit');
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += data; });
    if (mode === 'eof') child.stdin.end();
    else {
      // 等到协议回应，确保已安装信号处理器，不依赖固定 sleep。
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'exit-test', version: '1' } } }) + '\n');
      await once(child.stdout, 'data');
      child.kill('SIGTERM');
    }
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    for (const line of stdout.trim().split('\n').filter(Boolean)) assert.equal(JSON.parse(line).jsonrpc, '2.0');
  }
});
