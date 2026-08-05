import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AgentChatDto, AgentChatResponseDto } from './agent.dto';
import { AgentService } from './agent.service';

@Controller('api/agent')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** POST /api/agent/chat — 调用无状态的 LangChain 单 Agent */
  @Post('chat')
  chat(@Body() dto: AgentChatDto): Promise<AgentChatResponseDto> {
    return this.agentService.chat(dto.message);
  }
}
