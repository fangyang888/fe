import { describe, it, expect } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { AgentIntentService } from './agent.intent.service';
import { AgentModelFactory } from './agent-model.factory';
import { AgentService } from './agent.service';
import { CustomerIntent } from './agent.intent';
import { ProductCustomerService } from './product-customer.service';
import { AgentConversationService } from './conversation/agent.conversation.service';
import { createEmptyEntities } from './conversation/agent.conversation';
import { CustomerIntentName } from './agent.intent';

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
  const conversationId = '11111111-1111-4111-8111-111111111111';

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
      new AgentConversationService(),
    );

    await expect(service.chat('你好', conversationId)).rejects.toBeInstanceOf(
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
      new AgentConversationService(),
    );
    const result = await service.chat('无线耳机还有多少库存？', conversationId);

    expect(result.source).toBe('intent_router');
    expect(result.intent).toBe('inventory_query');
    expect(modelFactory.getModel).not.toHaveBeenCalled();
  });
});

it('两轮补齐商品名后继续执行库存查询', async () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const conversationService = new AgentConversationService();

  const intentService = {
    analyze: jest
      .fn()
      .mockResolvedValueOnce({
        intent: 'inventory_query',
        confidence: 0.95,
        entities: createEmptyEntities(),
        missingFields: ['productName'],
        normalizedQuery: '查询库存',
      })
      .mockResolvedValueOnce({
        intent: 'product_search',
        confidence: 0.9,
        entities: {
          ...createEmptyEntities(),
          productName: '无线耳机',
        },
        missingFields: [],
        normalizedQuery: '无线耳机',
      }),
  } as unknown as AgentIntentService;

  const productCustomerService = {
    canHandle: jest.fn((intent: CustomerIntentName) =>
      ['inventory_query', 'price_query', 'product_search'].includes(intent),
    ),
    reply: jest.fn().mockResolvedValue('无线耳机 当前库存 10 件，可以购买。'),
  } as unknown as ProductCustomerService;

  const modelFactory = {
    getModelName: jest.fn().mockReturnValue('test-model'),
  } as unknown as AgentModelFactory;

  const service = new AgentService(
    modelFactory,
    intentService,
    productCustomerService,
    conversationService,
  );

  const first = await service.chat('帮我查库存', conversationId);
  expect(first.status).toBe('collecting_fields');
  expect(first.missingFields).toEqual(['productName']);
  expect(productCustomerService.reply).not.toHaveBeenCalled();

  const second = await service.chat('无线耳机', conversationId);
  expect(second.status).toBe('completed');
  expect(second.intent).toBe('inventory_query');
  expect(second.entities.productName).toBe('无线耳机');
  expect(productCustomerService.reply).toHaveBeenCalledTimes(1);
});
