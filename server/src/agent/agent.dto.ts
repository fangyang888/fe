import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CustomerEntities, CustomerIntentName } from './agent.intent';
import { ConversationStatus, MissingField } from './agent.conversation';

export class AgentChatDto {
  // 先 trim，避免只包含空格的消息通过 IsNotEmpty 校验。
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;
  @IsString({ message: 'conversationId 必须是字符串' })
  @IsNotEmpty({ message: 'conversationId 不能为空' })
  conversationId: string;
}

export interface AgentChatResponseDto {
  conversationId: string;
  reply: string;
  model: string;
  source: 'intent_router' | 'agent';
  intent: CustomerIntentName;
  entities: CustomerEntities;
  status: ConversationStatus;
  missingFields: MissingField[];
}
