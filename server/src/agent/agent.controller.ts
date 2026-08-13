import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AgentChatDto, AgentChatResponseDto } from './agent.dto';
import { AgentService } from './agent.service';
import { AgentIntentService } from './agent.intent.service';
import { AgentChatApplicationService } from './persistence/agent-chat-application.service';
@Controller('api/agent')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AgentController {
  constructor(
    private readonly chatApplication: AgentChatApplicationService,
    private readonly agentIntentService: AgentIntentService,
  ) {}

  /** POST /api/agent/chat — 调用无状态的 LangChain 单 Agent */
  @Post('chat')
  chat(@Body() dto: AgentChatDto) {
    return this.chatApplication.chat(dto);
  }

  /** POST /api/agent/intent — 学习阶段：识别意图和关键字段 */
  @Post('intent')
  analyzeIntent(@Body() dto: AgentChatDto) {
    return this.agentIntentService.analyze(dto.message);
  }
}
