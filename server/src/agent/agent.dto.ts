import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CustomerEntities, CustomerIntentName } from './agent.intent';

export class AgentChatDto {
  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;
}

export interface AgentChatResponseDto {
  reply: string;
  model: string;
  source?: 'intent_router' | 'agent';
  intent?: CustomerIntentName;
  entities?: CustomerEntities;
}
