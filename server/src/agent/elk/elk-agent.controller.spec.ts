import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TokenService } from '../../auth/token.service';
import { ElkAgentController } from './elk-agent.controller';
import { ElkOperatorGuard } from './elk-operator.guard';
import { ElkAgentService } from './elk-agent.service';

jest.mock('langchain', () => ({ createAgent: jest.fn(), tool: jest.fn() }));
jest.mock('@modelcontextprotocol/client', () => ({
  Client: jest.fn(),
  StreamableHTTPClientTransport: jest.fn(),
}));

describe('受保护的 ELK Agent HTTP 入口', () => {
  let app: INestApplication;
  let token: TokenService;
  const chat = jest
    .fn()
    .mockResolvedValue({ reply: 'fixture response', source: 'elk_agent' });
  const values = {
    ELK_MCP_ENABLED: 'true',
    ELK_MCP_OPERATOR_USER_ID: '42',
    JWT_SECRET: 'synthetic-jwt-test-key-do-not-use-in-production',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ElkAgentController],
      providers: [
        JwtAuthGuard,
        ElkOperatorGuard,
        TokenService,
        { provide: ConfigService, useValue: new ConfigService(values) },
        { provide: ElkAgentService, useValue: { chat } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    token = module.get(TokenService);
  });
  afterAll(() => app?.close());
  beforeEach(() => chat.mockClear());

  it('无 JWT、错误 JWT、其他用户均不能调用模型/工具', async () => {
    await request(app.getHttpServer())
      .post('/api/agent/elk/chat')
      .send({ message: '查日志' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/agent/elk/chat')
      .set('Authorization', 'Bearer invalid')
      .send({ message: '查日志' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/agent/elk/chat')
      .set('Authorization', `Bearer ${token.sign({ userId: 99 })}`)
      .send({ message: '查日志' })
      .expect(403);
    expect(chat).not.toHaveBeenCalled();
  });

  it('唯一操作者可以调用，响应不缓存，拒绝注入工具/用户参数', async () => {
    const auth = `Bearer ${token.sign({ userId: 42 })}`;
    await request(app.getHttpServer())
      .post('/api/agent/elk/chat')
      .set('Authorization', auth)
      .send({ message: '查看连接' })
      .expect('Cache-Control', 'no-store')
      .expect(201)
      .expect(({ body }) => expect(body.reply).toBe('fixture response'));
    await request(app.getHttpServer())
      .post('/api/agent/elk/chat')
      .set('Authorization', auth)
      .send({
        message: '查看连接',
        userId: 42,
        mcpUrl: 'https://attacker.invalid',
      })
      .expect(400);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('缺少操作者或安全 JWT 密钥时拒绝启用', () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 42 } }) }),
    };
    for (const changed of [
      { ELK_MCP_ENABLED: 'false' },
      { ELK_MCP_OPERATOR_USER_ID: '' },
      { JWT_SECRET: 'dev-secret-change-me' },
    ]) {
      const guard = new ElkOperatorGuard(
        new ConfigService({ ...values, ...changed }),
      );
      expect(() => guard.canActivate(context as never)).toThrow();
    }
  });
});
