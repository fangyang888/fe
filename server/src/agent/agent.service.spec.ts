import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';

describe('AgentService', () => {
  it('在没有 API Key 时返回明确的服务不可用错误', async () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new AgentService(configService);

    await expect(service.chat('你好')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
