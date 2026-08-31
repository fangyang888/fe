import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { localhostHostValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createElkMcpServer } from './mcp-server.mjs';
import { KibanaSession } from './kibana-session.mjs';

const MAX_BODY_BYTES = 64 * 1024;

export function validateHttpToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    throw new Error('ELK_MCP_TOKEN 必须为 32–256 位随机字母数字或下划线/连字符；请使用随机生成值。');
  }
  return token;
}

function authorized(header, token) {
  if (typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function reply(res, status, code) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: code }));
}

export async function startElkHttpServer({ token, port = 3101, session = new KibanaSession() } = {}) {
  validateHttpToken(token);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('HTTP 端口无效。');
  // HTTP 的协议实例按请求创建，但浏览器会话属于本服务的唯一操作者。
  // 不要在单个协议实例 onclose 时销毁浏览器，否则登录无法跨请求保留。
  const handler = createMcpHandler(() => createElkMcpServer({ session }), {
    responseMode: 'sse',
    maxSubscriptions: 4,
    onerror: () => console.error('[elk-log-mcp] HTTP 协议错误（未记录请求或日志内容）。'),
  });
  const nodeHandler = toNodeHandler(handler, {
    onerror: () => console.error('[elk-log-mcp] HTTP 请求处理失败。'),
  });
  const validateHost = localhostHostValidation();
  // 此入口只供后端/桌面 MCP 客户端连接，不允许网页跨域直接调用。
  const validateOrigin = originValidation([]);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url !== '/mcp') return reply(res, 404, 'NOT_FOUND');
    if (!authorized(req.headers.authorization, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="elk-log-mcp"');
      return reply(res, 401, 'UNAUTHORIZED');
    }
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) return reply(res, 405, 'METHOD_NOT_ALLOWED');
    try {
      let body;
      if (req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return reply(res, 415, 'JSON_REQUIRED');
        }
        if (Number(req.headers['content-length']) > MAX_BODY_BYTES) return reply(res, 413, 'BODY_TOO_LARGE');
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) { reply(res, 413, 'BODY_TOO_LARGE'); return; }
          chunks.push(chunk);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return reply(res, 400, 'INVALID_JSON'); }
      }
      await nodeHandler(req, res, body);
    } catch {
      if (!res.headersSent && !res.destroyed) reply(res, 500, 'HTTP_ERROR');
      else res.end();
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.setTimeout(130_000);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
  } catch (error) {
    await handler.close();
    await session.close();
    throw error;
  }
  let closing;
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    close: () => {
      closing ??= (async () => {
        const stopped = new Promise((resolve) => server.close(resolve));
        await handler.close();
        await session.close();
        server.closeAllConnections();
        await stopped;
      })();
      return closing;
    },
  };
}
