import { CustomerIntentSchema } from './agent.intent';

const emptyEntities = {
  productName: null,
  categoryName: null,
  orderNo: null,
  budgetMax: null,
  quantity: null,
  reason: null,
};

describe('CustomerIntentSchema', () => {
  it('接受合法的库存查询结果', () => {
    const result = CustomerIntentSchema.parse({
      intent: 'inventory_query',
      confidence: 0.95,
      entities: {
        ...emptyEntities,
        productName: '无线蓝牙耳机',
        budgetMax: 300,
      },
      missingFields: [],
      normalizedQuery: '查询无线蓝牙耳机库存，预算不超过300元',
    });

    expect(result.intent).toBe('inventory_query');
    expect(result.entities.productName).toBe('无线蓝牙耳机');
    expect(result.entities.budgetMax).toBe(300);
  });

  it('拒绝枚举以外的意图', () => {
    const result = CustomerIntentSchema.safeParse({
      intent: '随便查一下',
      confidence: 0.9,
      entities: emptyEntities,
      missingFields: [],
      normalizedQuery: '随便查一下',
    });

    expect(result.success).toBe(false);
  });

  it('拒绝超出 0～1 范围的 confidence', () => {
    const result = CustomerIntentSchema.safeParse({
      intent: 'general_chat',
      confidence: 5,
      entities: emptyEntities,
      missingFields: [],
      normalizedQuery: '你好',
    });

    expect(result.success).toBe(false);
  });
});
