import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConversationRecord } from './agent-conversation.entity';
import { AgentMessageRecord } from './agent-message.entity';

@Injectable()
export class AgentHistoryService {
  constructor(
    @InjectRepository(AgentConversationRecord)
    private readonly conversations: Repository<AgentConversationRecord>,
    @InjectRepository(AgentMessageRecord)
    private readonly messages: Repository<AgentMessageRecord>,
  ) {}

  async ensureConversation(conversationId: string) {
    const existing = await this.conversations.findOne({
      where: { id: conversationId },
    });

    if (existing) return existing;

    return this.conversations.save(
      this.conversations.create({
        id: conversationId,
        userId: null,
        title: null,
        status: 'active',
      }),
    );
  }

  listMessages(conversationId: string) {
    return this.messages.find({
      where: { conversationId },
      order: { id: 'ASC' },
      take: 100,
    });
  }
  async startUserTurn(input: {
    conversationId: string;
    clientMessageId: string;
    turnId: string;
    content: string;
  }): Promise<AgentMessageRecord> {
    const existing = await this.messages.findOne({
      where: {
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        role: 'user',
      },
    });

    if (existing) return existing;

    return this.messages.save(
      this.messages.create({
        ...input,
        role: 'user',
        status: 'pending',
        model: null,
        metadata: null,
      }),
    );
  }

  async completeAssistantTurn(input: {
    conversationId: string;
    clientMessageId: string;
    turnId: string;
    reply: string;
    model: string;
    metadata: Record<string, unknown>;
  }): Promise<AgentMessageRecord> {
    await this.messages.update(
      {
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        role: 'user',
      },
      { status: 'completed' },
    );

    const existing = await this.messages.findOne({
      where: {
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        role: 'assistant',
      },
    });
    if (existing) return existing;

    return this.messages.save(
      this.messages.create({
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        turnId: input.turnId,
        role: 'assistant',
        content: input.reply,
        status: 'completed',
        model: input.model,
        metadata: input.metadata,
      }),
    );
  }

  async markUserTurnFailed(
    conversationId: string,
    clientMessageId: string,
  ): Promise<void> {
    await this.messages.update(
      {
        conversationId,
        clientMessageId,
        role: 'user',
      },
      { status: 'failed' },
    );
  }
}
