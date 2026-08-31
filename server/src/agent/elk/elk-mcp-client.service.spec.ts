import { ConfigService } from '@nestjs/config';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { ElkMcpClientService } from './elk-mcp-client.service';

jest.mock('@modelcontextprotocol/client', () => ({
  Client: jest.fn(),
  StreamableHTTPClientTransport: jest.fn(),
}));

const settings = {
  ELK_MCP_ENABLED: 'true',
  ELK_MCP_URL: 'http://127.0.0.1:3101/mcp',
  ELK_MCP_TOKEN: 'synthetic-test-only-token-do-not-use-in-production',
  ELK_MCP_ALLOWED_HOSTS: 'elk-mcp-check.invalid',
};

describe('ElkMcpClientService', () => {
  let sdk: {
    connect: jest.Mock;
    listTools: jest.Mock;
    callTool: jest.Mock;
    close: jest.Mock;
  };
  let client: ElkMcpClientService;
  beforeEach(() => {
    jest.clearAllMocks();
    sdk = {
      connect: jest.fn().mockResolvedValue(undefined),
      listTools: jest
        .fn()
        .mockResolvedValue({
          tools: ['get_connection_status', 'open_kibana', 'search_logs', 'count_path_visits'].map(
            (name) => ({ name }),
          ),
        }),
      callTool: jest
        .fn()
        .mockResolvedValue({ structuredContent: { state: 'not_open' } }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (Client as jest.Mock).mockImplementation(() => sdk);
    client = new ElkMcpClientService(new ConfigService(settings));
  });
  afterEach(() => client.onApplicationShutdown());

  it('按需连接，复用连接，携带服务令牌并禁用重定向', async () => {
    expect(Client).not.toHaveBeenCalled();
    await Promise.all([
      client.call('get_connection_status', {}),
      client.call('get_connection_status', {}),
    ]);
    expect(Client).toHaveBeenCalledTimes(1);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL(settings.ELK_MCP_URL),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${settings.ELK_MCP_TOKEN}` },
          redirect: 'error',
        },
      },
    );
    expect(sdk.listTools).toHaveBeenCalledTimes(1);
  });

  it('域名未授权时不连接、不调用服务；允许精确白名单域名', async () => {
    const denied = await client.call('search_logs', { host: 'other.invalid' });
    expect(denied).toMatchObject({
      ok: false,
      error: { code: 'HOST_NOT_ALLOWED' },
    });
    expect(Client).not.toHaveBeenCalled();
    await client.call('search_logs', {
      host: 'elk-mcp-check.invalid',
      limit: 1,
    });
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
  });

  it('路径统计可在白名单只有一个域名时省略 host', async () => {
    client = new ElkMcpClientService(
      new ConfigService({
        ...settings,
      }),
    );
    const result = await client.call('count_path_visits', {
      url_path: '/puzzle/template.html',
      range: 'today',
    });
    expect(result).toEqual({ ok: true, data: { state: 'not_open' } });
    expect(sdk.callTool).toHaveBeenCalledWith(
      {
        name: 'count_path_visits',
        arguments: {
          host: 'elk-mcp-check.invalid',
          url_path: '/puzzle/template.html',
          range: 'today',
        },
      },
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('路径统计省略 host 时把多个白名单域名注入 MCP 查询范围', async () => {
    client = new ElkMcpClientService(
      new ConfigService({
        ...settings,
        ELK_MCP_ALLOWED_HOSTS: 'api.example.com,www.example.com',
      }),
    );
    const result = await client.call('count_path_visits', {
      url_path: '/puzzle/template.html',
      range: 'today',
    });
    expect(result).toEqual({ ok: true, data: { state: 'not_open' } });
    expect(sdk.callTool).toHaveBeenCalledWith(
      {
        name: 'count_path_visits',
        arguments: {
          hosts: ['api.example.com', 'www.example.com'],
          url_path: '/puzzle/template.html',
          range: 'today',
        },
      },
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('路径统计没有白名单时也只按 url_path 查询，交给 Kibana 权限控制', async () => {
    client = new ElkMcpClientService(
      new ConfigService({
        ...settings,
        ELK_MCP_ALLOWED_HOSTS: '',
      }),
    );
    const result = await client.call('count_path_visits', {
      url_path: '/puzzle/template.html',
      range: 'today',
    });
    expect(result).toEqual({ ok: true, data: { state: 'not_open' } });
    expect(sdk.callTool).toHaveBeenCalledWith(
      {
        name: 'count_path_visits',
        arguments: {
          url_path: '/puzzle/template.html',
          range: 'today',
        },
      },
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('MCP 工具错误保留失败语义，不当作零结果，也不重试', async () => {
    sdk.callTool.mockResolvedValue({
      isError: true,
      structuredContent: { code: 'NOT_OPEN', message: '请先登录' },
    });
    expect(
      await client.call('search_logs', { host: 'elk-mcp-check.invalid' }),
    ).toEqual({ ok: false, error: { code: 'NOT_OPEN', message: '请先登录' } });
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
  });

  it('网络错误不泄露令牌或原始页面，下次请求可重新连接但不自动重放', async () => {
    sdk.callTool.mockRejectedValueOnce(
      new Error('Authorization=secret private page content'),
    );
    const failed = await client.call('open_kibana', {});
    expect(failed).toMatchObject({
      ok: false,
      error: { code: 'MCP_UNAVAILABLE' },
    });
    expect(JSON.stringify(failed)).not.toMatch(/secret|private page/);
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
    await client.call('get_connection_status', {});
    expect(Client).toHaveBeenCalledTimes(2);
  });

  it('客户端取消信号和超时传入 MCP SDK', async () => {
    const abort = new AbortController();
    await client.call('get_connection_status', {}, abort.signal);
    expect(sdk.callTool).toHaveBeenCalledWith(
      { name: 'get_connection_status', arguments: {} },
      { signal: abort.signal, timeout: 120_000 },
    );
    abort.abort();
    await expect(
      client.call('get_connection_status', {}, abort.signal),
    ).rejects.toBeDefined();
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
  });

  it('拒绝远程明文 HTTP、URL 凭据、查询参数，默认关闭', () => {
    for (const url of [
      'http://example.com/mcp',
      'https://user:pass@example.com/mcp',
      'https://example.com/mcp?token=secret',
      'file:///etc/passwd',
    ]) {
      const bad = new ElkMcpClientService(
        new ConfigService({ ...settings, ELK_MCP_URL: url }),
      );
      expect(() => bad.assertConfigured()).toThrow();
    }
    expect(() =>
      new ElkMcpClientService(new ConfigService({})).assertConfigured(),
    ).toThrow();
  });

  it('关闭客户端后不能重新连接', async () => {
    await client.call('get_connection_status', {});
    await client.onApplicationShutdown();
    expect(sdk.close).toHaveBeenCalledTimes(1);
    expect(await client.call('get_connection_status', {})).toMatchObject({
      ok: false,
    });
    expect(Client).toHaveBeenCalledTimes(1);
  });
});
