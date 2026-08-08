import { CustomerIntentSchema } from './agent.intent';
import { describe, it, expect } from '@jest/globals';
describe('CustomerIntentSchema', () => {
  it('接受合法的库存查询结果', () => {
    const result = CustomerIntentSchema.parse({
      intent: 'inventory_query',
      confidence: 0.95,
      entities: {
        productName: '无线蓝牙耳机',
        categoryName: null,
        orderNo: null,
        budgetMax: 300,
        quantity: null,
        reason: null,
      },
      missingFields: [],
      normalizedQuery: '查询无线蓝牙耳机库存，预算不超过300元',
    });

    expect(result.intent).toBe('inventory_query');
    expect(result.entities.productName).toBe('无线蓝牙耳机');
    expect(result.entities.budgetMax).toBe(300);
  });
});

it('拒绝枚举以外的意图', () => {
  const result = CustomerIntentSchema.safeParse({
    intent: '随便查一下',
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
    normalizedQuery: '随便查一下',
  });

  expect(result.success).toBe(false);
});

it('拒绝错误的 confidence', () => {
  const result = CustomerIntentSchema.safeParse({
    intent: 'general_chat',
    confidence: 5,
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
  });

  expect(result.success).toBe(false);
});
