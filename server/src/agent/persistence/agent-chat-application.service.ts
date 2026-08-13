import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentChatDto, AgentChatResponseDto } from '../agent.dto';
import { AgentService } from '../agent.service';
import { AgentHistoryService } from './agent-history.service';

@Injectable()
export class AgentChatApplicationService {
  constructor(
    private readonly agentService: AgentService,
    private readonly history: AgentHistoryService,
  ) {}

  async chat(dto: AgentChatDto): Promise<AgentChatResponseDto> {
    await this.history.ensureConversation(dto.conversationId);

    const turnId = randomUUID();
    await this.history.startUserTurn({
      conversationId: dto.conversationId,
      clientMessageId: dto.clientMessageId,
      turnId,
      content: dto.message,
    });

    try {
      // 模型调用期间不保持数据库事务。
      const result = await this.agentService.chat(
        dto.message,
        dto.conversationId,
      );

      await this.history.completeAssistantTurn({
        conversationId: dto.conversationId,
        clientMessageId: dto.clientMessageId,
        turnId,
        reply: result.reply,
        model: result.model,
        metadata: {
          source: result.source,
          intent: result.intent,
          entities: result.entities,
          status: result.status,
          missingFields: result.missingFields,
        },
      });

      return result;
    } catch (error) {
      await this.history.markUserTurnFailed(
        dto.conversationId,
        dto.clientMessageId,
      );
      throw error;
    }
  }
}
