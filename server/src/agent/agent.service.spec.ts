import { ServiceUnavailableException } from '@nestjs/common';
import { AgentIntentService } from './agent.intent.service';
import { AgentModelFactory } from './agent-model.factory';
import { AgentService } from './agent.service';
import { CustomerIntent } from './agent.intent';
import { ProductCustomerService } from './product-customer.service';

const generalChatIntent: CustomerIntent = {
  intent: 'general_chat',
  confidence: 0.9,
  entities: {
    productName: null,
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  },
  missingFields: [],
  normalizedQuery: '你好',
};

describe('AgentService', () => {
  it('非商品请求在没有 API Key 时返回服务不可用错误', async () => {
    const modelFactory = {
      getModelName: jest.fn().mockReturnValue('test-model'),
      getModel: jest.fn(() => {
        throw new ServiceUnavailableException('缺少 API Key');
      }),
    } as unknown as AgentModelFactory;
    const intentService = {
      analyze: jest.fn().mockResolvedValue(generalChatIntent),
    } as unknown as AgentIntentService;
    const productCustomerService = {
      canHandle: jest.fn().mockReturnValue(false),
    } as unknown as ProductCustomerService;

    const service = new AgentService(
      modelFactory,
      intentService,
      productCustomerService,
    );

    await expect(service.chat('你好')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('商品意图交给 ProductCustomerService，不进入自由 Agent', async () => {
    const inventoryIntent: CustomerIntent = {
      ...generalChatIntent,
      intent: 'inventory_query',
      entities: {
        ...generalChatIntent.entities,
        productName: '无线耳机',
      },
      normalizedQuery: '查询无线耳机库存',
    };
    const modelFactory = {
      getModelName: jest.fn().mockReturnValue('test-model'),
      getModel: jest.fn(),
    } as unknown as AgentModelFactory;
    const intentService = {
      analyze: jest.fn().mockResolvedValue(inventoryIntent),
    } as unknown as AgentIntentService;
    const productCustomerService = {
      canHandle: jest.fn().mockReturnValue(true),
      reply: jest.fn().mockResolvedValue('无线耳机当前库存 10 件，可以购买。'),
    } as unknown as ProductCustomerService;

    const service = new AgentService(
      modelFactory,
      intentService,
      productCustomerService,
    );
    const result = await service.chat('无线耳机还有多少库存？');

    expect(result.source).toBe('intent_router');
    expect(result.intent).toBe('inventory_query');
    expect(modelFactory.getModel).not.toHaveBeenCalled();
  });
});
