import { createAgent } from 'langchain';
import { AgentModelFactory } from '../agent-model.factory';
import { ElkAgentService } from './elk-agent.service';
import { ElkMcpClientService } from './elk-mcp-client.service';

jest.mock('langchain', () => ({
  createAgent: jest.fn(),
  tool: jest.fn((func, fields) => ({ ...fields, func })),
}));
jest.mock('@modelcontextprotocol/client', () => ({
  Client: jest.fn(),
  StreamableHTTPClientTransport: jest.fn(),
}));

describe('ElkAgentService', () => {
  it('本地工具与 ELK 工具一起注册，使用独立无持久化的 Agent', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ messages: [{ content: '测试回答' }] });
    (createAgent as jest.Mock).mockReturnValue({ invoke });
    const models = {
      getModel: jest.fn().mockReturnValue({}),
      getModelName: () => 'test-model',
    } as unknown as AgentModelFactory;
    const mcp = {
      assertConfigured: jest.fn(),
      call: jest
        .fn()
        .mockResolvedValue({ ok: true, data: { state: 'not_open' } }),
    } as unknown as ElkMcpClientService;
    const service = new ElkAgentService(models, mcp);
    const abort = new AbortController();
    expect(await service.chat('查看连接', abort.signal)).toMatchObject({
      reply: '测试回答',
      source: 'elk_agent',
    });
    const options = (createAgent as jest.Mock).mock.calls.at(-1)[0];
    expect(options.tools.map((item: { name: string }) => item.name)).toEqual([
      'calculator',
      'get_current_time',
      'transform_text',
      'elk_connection_status',
      'elk_open_kibana',
      'elk_search_logs',
      'elk_count_path_visits',
    ]);
    expect(options.checkpointer).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(
      { messages: [{ role: 'user', content: '查看连接' }] },
      { signal: abort.signal, recursionLimit: 12 },
    );
    const search = options.tools.find(
      (item: { name: string }) => item.name === 'elk_search_logs',
    );
    expect(() => search.schema.parse({ host: '*.invalid' })).toThrow();
    expect(() =>
      search.schema.parse({ host: 'test.invalid', kql: '*' }),
    ).toThrow();
    await search.func(
      { host: 'test.invalid', limit: 1 },
      { signal: abort.signal },
    );
    expect(mcp.call).toHaveBeenCalledWith(
      'search_logs',
      { host: 'test.invalid', limit: 1 },
      abort.signal,
    );
  });
});
