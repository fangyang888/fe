import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ElkOperatorGuard } from './elk-operator.guard';
import { ElkAgentService } from './elk-agent.service';

export class ElkChatDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message: string;
}

@Controller('api/agent/elk')
@UseGuards(JwtAuthGuard, ElkOperatorGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ElkAgentController {
  constructor(private readonly agent: ElkAgentService) {}

  @Post('chat')
  async chat(
    @Body() dto: ElkChatDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      return await this.agent.chat(dto.message, controller.signal);
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  }
}
