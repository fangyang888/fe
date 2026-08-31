import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { validateHttpToken } from './lib/http-server.mjs';

const client = new Client({ name: 'elk-http-check', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
try {
  const token = validateHttpToken(process.env.ELK_MCP_TOKEN);
  const url = new URL(`http://127.0.0.1:${Number(process.env.ELK_MCP_PORT ?? 3101)}/mcp`);
  await client.connect(new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
  }), { timeout: 10_000 });
  const { tools } = await client.listTools();
  const status = await client.callTool({ name: 'get_connection_status', arguments: {} });
  if (status.isError) throw new Error('status failed');
  console.log('HTTP MCP 连接成功：' + tools.map((tool) => tool.name).join(', '));
  console.log('浏览器状态：' + status.structuredContent?.state);
  console.log('自检没有打开浏览器或读取业务日志。');
} catch {
  console.error('HTTP MCP 自检失败：确认服务已启动，端口和令牌与服务配置一致。');
  process.exitCode = 1;
} finally {
  await client.close();
}
