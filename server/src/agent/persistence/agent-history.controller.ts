import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AgentHistoryService } from './agent-history.service';

@Controller('api/agent/conversations')
export class AgentHistoryController {
  constructor(private readonly history: AgentHistoryService) {}

  @Post(':conversationId')
  create(@Param('conversationId', new ParseUUIDPipe()) conversationId: string) {
    return this.history.ensureConversation(conversationId);
  }

  @Get(':conversationId/messages')
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.history.listMessages(conversationId);
  }
}
