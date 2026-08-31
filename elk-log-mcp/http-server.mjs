import { startElkHttpServer } from './lib/http-server.mjs';

try {
  const server = await startElkHttpServer({
    token: process.env.ELK_MCP_TOKEN,
    port: Number(process.env.ELK_MCP_PORT ?? 3101),
  });
  console.error(`[elk-log-mcp] HTTP MCP: ${server.url}（仅本机，需要 Bearer Token）`);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const watchdog = setTimeout(() => process.exit(1), 5_000);
    watchdog.unref();
    try { await server.close(); }
    catch { console.error('[elk-log-mcp] HTTP 服务清理失败。'); process.exitCode = 1; }
    finally { clearTimeout(watchdog); }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
} catch (error) {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[elk-log-mcp] 端口 ${process.env.ELK_MCP_PORT ?? 3101} 已被占用，请更换 ELK_MCP_PORT 或停止占用进程。`);
  } else if (error instanceof Error && error.message.includes('ELK_MCP_TOKEN')) {
    console.error(`[elk-log-mcp] ${error.message}`);
  } else {
    console.error('[elk-log-mcp] HTTP 启动失败。请检查 Node.js >= 20、ELK_MCP_PORT 和 MCP 依赖。');
  }
  process.exitCode = 1;
}
