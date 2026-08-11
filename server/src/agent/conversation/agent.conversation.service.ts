import { Injectable } from '@nestjs/common';
import {
  AgentConversationState,
  CONVERSATION_TTL_MS,
  createConversationState,
} from './agent.conversation';

function cloneState(state: AgentConversationState): AgentConversationState {
  return {
    ...state,
    entities: { ...state.entities },
    missingFields: [...state.missingFields],
  };
}

@Injectable()
export class AgentConversationService {
  private readonly states = new Map<string, AgentConversationState>();

  getOrCreate(
    conversationId: string,
    now = Date.now(),
  ): AgentConversationState {
    const existing = this.states.get(conversationId);

    if (!existing || existing.expiresAt <= now) {
      const created = createConversationState(conversationId, now);
      this.states.set(conversationId, created);
      return cloneState(created);
    }

    return cloneState(existing);
  }

  save(
    state: AgentConversationState,
    now = Date.now(),
  ): AgentConversationState {
    const saved: AgentConversationState = {
      ...cloneState(state),
      updatedAt: now,
      expiresAt: now + CONVERSATION_TTL_MS,
    };

    this.states.set(saved.conversationId, saved);
    return cloneState(saved);
  }

  clear(conversationId: string): void {
    this.states.delete(conversationId);
  }
}
