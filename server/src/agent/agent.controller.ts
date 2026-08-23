import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentChatDto, AgentChatResponseDto } from './agent.dto';
import { AgentService } from './agent.service';
import { AgentIntentService } from './agent.intent.service';
import { AgentChatApplicationService } from './persistence/agent-chat-application.service';
import { AgentStreamApplicationService } from './stream/agent.stream-application.service';
import { writeSse } from './stream/agent.stream-sse';
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
    private readonly streamApplication: AgentStreamApplicationService,
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
  @Post('chat/stream')
  async streamChat(
    @Body() dto: AgentChatDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const abortController = new AbortController();

    const close = () => {
      if (!response.writableEnded) {
        abortController.abort('client_disconnected');
      }
    };

    request.once('aborted', close);
    response.once('close', close);

    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(': ping\n\n');
      }
    }, 20_000);

    try {
      await this.streamApplication.stream({
        dto,
        signal: abortController.signal,
        emit: (event) => writeSse(response, event),
      });
    } finally {
      clearInterval(heartbeat);
      request.off('aborted', close);
      response.off('close', close);

      if (!response.writableEnded) response.end();
    }
  }
}
