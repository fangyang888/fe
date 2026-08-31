import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

// 这是客户端自检，不是服务入口。它自己的 stdout 可以输出可读信息。
const client = new Client({ name: 'elk-log-self-check', version: '0.1.0' });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['count_path_visits', 'get_connection_status', 'open_kibana', 'search_logs']);
  const status = await client.callTool({ name: 'get_connection_status', arguments: {} });
  assert.equal(status.structuredContent.state, 'not_open');
  console.log('MCP 握手成功。工具：' + tools.map((tool) => tool.name).join(', '));
  console.log('浏览器状态：not_open（符合预期；自检不会打开浏览器或读取日志）。');
} catch {
  console.error('MCP 自检失败。请确认 Node.js >= 20、依赖完整，再运行 pnpm test 查看回归测试。');
  process.exitCode = 1;
} finally {
  await client.close();
}
