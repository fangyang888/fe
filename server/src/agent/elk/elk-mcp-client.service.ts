import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

export type ElkToolName =
  | 'get_connection_status'
  | 'open_kibana'
  | 'search_logs'
  | 'count_path_visits';
export type ElkToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };
const EXPECTED_TOOLS: ElkToolName[] = [
  'get_connection_status',
  'open_kibana',
  'search_logs',
  'count_path_visits',
];

@Injectable()
export class ElkMcpClientService implements OnApplicationShutdown {
  private connection?: Promise<Client>;
  private stopped = false;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('ELK_MCP_ENABLED') === 'true';
  }

  assertConfigured(): { url: URL; token: string } {
    if (!this.isEnabled())
      throw new ServiceUnavailableException('ELK MCP 尚未启用。');
    const token = this.config.get<string>('ELK_MCP_TOKEN') ?? '';
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
      throw new ServiceUnavailableException('ELK MCP 服务令牌未配置。');
    }
    let url: URL;
    try {
      url = new URL(this.config.get<string>('ELK_MCP_URL') ?? '');
    } catch {
      throw new ServiceUnavailableException('ELK MCP URL 未配置。');
    }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ServiceUnavailableException(
        'ELK MCP URL 只允许 HTTPS 或本机 HTTP，不能携带凭据、查询参数或片段。',
      );
    }
    return { url, token };
  }

  private getClient(): Promise<Client> {
    if (this.stopped)
      throw new ServiceUnavailableException('ELK MCP 客户端已关闭。');
    if (!this.connection) {
      const pending = this.connect();
      this.connection = pending;
      void pending.catch(() => {
        if (this.connection === pending) this.connection = undefined;
      });
    }
    return this.connection;
  }

  private async connect(): Promise<Client> {
    const { url, token } = this.assertConfigured();
    const client = new Client(
      { name: 'fe-nest-elk-agent', version: '0.1.0' },
      {
        versionNegotiation: { mode: 'auto' },
      },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: { Authorization: `Bearer ${token}` },
            redirect: 'error',
          },
        }),
        { timeout: 10_000 },
      );
      const { tools } = await client.listTools({}, { timeout: 10_000 });
      if (
        !EXPECTED_TOOLS.every((name) =>
          tools.some((tool) => tool.name === name),
        )
      ) {
        throw new Error('ELK tool contract mismatch');
      }
      if (this.stopped) throw new Error('Client stopped during connect');
      return client;
    } catch {
      await client.close().catch(() => undefined);
      throw new ServiceUnavailableException(
        '无法连接 ELK MCP，请检查服务、URL 和令牌。',
      );
    }
  }

  async call(
    name: ElkToolName,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ElkToolResult> {
    if (!EXPECTED_TOOLS.includes(name))
      return this.failure('TOOL_NOT_ALLOWED', '未开放该 MCP 工具。');
    if (name === 'search_logs' || name === 'count_path_visits') {
      const allowed = (this.config.get<string>('ELK_MCP_ALLOWED_HOSTS') ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const configuredHost = this.config.get<string>('ELK_MCP_DEFAULT_HOST') ?? '';
      const host =
        typeof args.host === 'string' && args.host.trim()
          ? args.host.trim().toLowerCase()
          : configuredHost.trim().toLowerCase() ||
            (name === 'count_path_visits' && allowed.length === 1 ? allowed[0] : '');
      if (!host && name === 'search_logs') {
        return this.failure(
          'HOST_REQUIRED',
          '请提供业务域名，或在后端配置 ELK_MCP_DEFAULT_HOST。',
        );
      }
      if (name === 'search_logs') {
        if (!allowed.includes(host))
          return this.failure(
            'HOST_NOT_ALLOWED',
            '该业务域名未列入后端 ELK 查询白名单。',
          );
        args.host = host;
      } else if (host) {
        if (allowed.length > 0 && !allowed.includes(host))
          return this.failure(
            'HOST_NOT_ALLOWED',
            '该业务域名未列入后端 ELK 查询白名单。',
          );
        args.host = host;
      } else if (allowed.length > 0) {
        // 路径统计不要求用户提供 host；有白名单时由后端注入查询范围。
        args.hosts = allowed;
      }
    }
    signal?.throwIfAborted();
    let client: Client | undefined;
    try {
      client = await this.getClient();
      signal?.throwIfAborted();
      const result = await client.callTool(
        { name, arguments: args },
        { signal, timeout: 120_000 },
      );
      if (result.isError) {
        // 已知服务只返回安全提示；不向模型或日志透传 SDK 异常、URL 或令牌。
        const value = result.structuredContent;
        const content =
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
        return this.failure(
          typeof content?.code === 'string'
            ? content.code.slice(0, 80)
            : 'MCP_TOOL_ERROR',
          typeof content?.message === 'string'
            ? content.message.slice(0, 500)
            : 'MCP 工具执行失败，不能视为零条日志。',
        );
      }
      if (
        !result.structuredContent ||
        JSON.stringify(result.structuredContent).length > 65_536
      ) {
        return this.failure(
          'INVALID_RESULT',
          'MCP 返回格式不符合约定或内容超限。',
        );
      }
      return { ok: true, data: result.structuredContent };
    } catch {
      if (signal?.aborted) throw signal.reason;
      // 只清理失败的连接；不自动重放 open/search，避免重复操作浏览器。
      if (client) {
        this.connection = undefined;
        await client.close().catch(() => undefined);
      }
      return this.failure(
        'MCP_UNAVAILABLE',
        'ELK MCP 调用失败或超时，请检查连接后重试；这不表示没有错误日志。',
      );
    }
  }

  private failure(code: string, message: string): ElkToolResult {
    return { ok: false, error: { code, message } };
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    const pending = this.connection;
    this.connection = undefined;
    const client = await pending?.catch(() => undefined);
    await client?.close();
    // HTTP MCP 是独立进程；关闭客户端不会关闭 MCP 的浏览器，服务退出时才清理。
  }
}
