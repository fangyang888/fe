import { describe, it, expect } from '@jest/globals';

import { CONVERSATION_TTL_MS } from './agent.conversation';
import { AgentConversationService } from './agent.conversation.service';

describe('AgentConversationService', () => {
  it('同一个 conversationId 能读取已保存状态', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...state,
        status: 'collecting_fields',
        pendingIntent: 'inventory_query',
        entities: {
          ...state.entities,
          productName: '无线耳机',
        },
      },
      2_000,
    );

    const loaded = service.getOrCreate('conversation-a', 3_000);
    expect(loaded.pendingIntent).toBe('inventory_query');
    expect(loaded.entities.productName).toBe('无线耳机');
  });

  it('不同 conversationId 不会串数据', () => {
    const service = new AgentConversationService();
    const stateA = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...stateA,
        entities: { ...stateA.entities, productName: '无线耳机' },
      },
      2_000,
    );

    const stateB = service.getOrCreate('conversation-b', 3_000);
    expect(stateB.entities.productName).toBeNull();
  });

  it('过期状态不会继续旧任务', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...state,
        status: 'collecting_fields',
        pendingIntent: 'inventory_query',
      },
      2_000,
    );

    const expiredAt = 2_000 + CONVERSATION_TTL_MS + 1;
    const fresh = service.getOrCreate('conversation-a', expiredAt);

    expect(fresh.status).toBe('idle');
    expect(fresh.pendingIntent).toBeNull();
  });

  it('clear 后重新创建空状态', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a');
    service.save({ ...state, pendingIntent: 'price_query' });

    service.clear('conversation-a');

    expect(service.getOrCreate('conversation-a').pendingIntent).toBeNull();
  });
});
