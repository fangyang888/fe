import { describe, it, expect } from '@jest/globals';
import {
  calculateMissingFields,
  createEmptyEntities,
  isCancelMessage,
  mergeEntities,
} from './agent.conversation';

describe('agent conversation rules', () => {
  it('库存查询没有商品名时缺少 productName', () => {
    const missingFields = calculateMissingFields(
      'inventory_query',
      createEmptyEntities(),
    );

    expect(missingFields).toEqual(['productName']);
  });

  it('库存查询有商品名时不再缺字段', () => {
    const entities = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };

    expect(calculateMissingFields('inventory_query', entities)).toEqual([]);
  });

  it('第二轮 null 不覆盖第一轮已经收集的值', () => {
    const current = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };
    const incoming = {
      ...createEmptyEntities(),
      budgetMax: 300,
    };

    expect(mergeEntities(current, incoming)).toEqual({
      ...createEmptyEntities(),
      productName: '无线耳机',
      budgetMax: 300,
    });
  });

  it('新的非空值可以纠正旧值', () => {
    const current = {
      ...createEmptyEntities(),
      productName: '蓝牙音箱',
    };
    const incoming = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };

    expect(mergeEntities(current, incoming).productName).toBe('无线耳机');
  });

  it.each(['取消', '算了', '不用了', '停止'])('识别取消消息：%s', (message) => {
    expect(isCancelMessage(message)).toBe(true);
  });
});
