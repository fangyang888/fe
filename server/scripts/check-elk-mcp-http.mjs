import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { startElkHttpServer } from '../../elk-log-mcp/lib/http-server.mjs';

// 跨项目烟测：使用真实 HTTP MCP、编译后的 Nest 服务和 LangChain tool。
// 不加载 AppModule、数据库、.env 或模型，不启动浏览器；令牌只存在本进程内存。
const require = createRequire(import.meta.url);
const { ConfigService } = require('@nestjs/config');
const {
  ElkMcpClientService,
} = require('../dist/src/agent/elk/elk-mcp-client.service.js');
const { createElkTools } = require('../dist/src/agent/elk/elk.tools.js');
const { createAgentTools } = require('../dist/src/agent/agent.tools.js');
const token = randomBytes(32).toString('hex');
const http = await startElkHttpServer({ token, port: 0 });
const client = new ElkMcpClientService(
  new ConfigService({
    ELK_MCP_ENABLED: 'true',
    ELK_MCP_URL: http.url,
    ELK_MCP_TOKEN: token,
    ELK_MCP_ALLOWED_HOSTS: 'elk-mcp-check.invalid',
  }),
);
try {
  const tools = [...createAgentTools(), ...createElkTools(client)];
  const call = async (name, args) =>
    JSON.parse(await tools.find((tool) => tool.name === name).invoke(args));
  assert.deepEqual(await call('elk_connection_status', {}), {
    ok: true,
    data: { state: 'not_open', nextStep: '调用 open_kibana 打开独立浏览器。' },
  });
  const result = await call('elk_search_logs', {
    host: 'elk-mcp-check.invalid',
    limit: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'NOT_OPEN');
  const count = await call('elk_count_path_visits', {
    url_path: '/puzzle/template.html',
    range: 'today',
  });
  assert.equal(count.ok, false);
  assert.equal(count.error.code, 'NOT_OPEN');
  assert.equal(
    (await call('elk_search_logs', { host: 'denied.invalid' })).error.code,
    'HOST_NOT_ALLOWED',
  );
  assert.equal(
    await tools
      .find((tool) => tool.name === 'calculator')
      .invoke({ operation: 'multiply', left: 125, right: 8 }),
    '1000',
  );
  console.log(
    '通过：真实 HTTP MCP → Nest 客户端 → LangChain 工具，日志查询和路径统计工具均可发现。',
  );
  console.log('未打开浏览器，未调用模型或读取业务日志。');
} finally {
  await client.onApplicationShutdown();
  await http.close();
}
