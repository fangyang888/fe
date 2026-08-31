import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createElkMcpServer } from './lib/mcp-server.mjs';
import { KibanaSession } from './lib/kibana-session.mjs';

const session = new KibanaSession();
const handle = serveStdio(() => {
  const server = createElkMcpServer({ session });
  server.server.onclose = () => { void shutdown(); };
  return server;
}, { onerror: () => console.error('[elk-log-mcp] MCP 协议错误；未输出原始请求或页面内容。') });

let closing;
function shutdown() {
  closing ??= Promise.resolve().then(async () => {
    // 即使浏览器驱动异常，也不让退出无限挂起。
    const watchdog = setTimeout(() => process.exit(1), 5_000);
    watchdog.unref();
    try {
      await session.close();
      await handle.close();
    } catch {
      console.error('[elk-log-mcp] 关闭失败，请确认独立浏览器窗口已关闭。');
      process.exitCode = 1;
    } finally {
      clearTimeout(watchdog);
      process.stdin.pause();
    }
  });
  return closing;
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
process.stdin.once('end', () => { void shutdown(); });
process.stdin.once('error', () => { void shutdown(); });
// stdout 只允许 SDK 写入 JSON-RPC，不在此处使用 console.log 或 readline。
