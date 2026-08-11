import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CustomerEntities, CustomerIntentName } from './agent.intent';
import {
  ConversationStatus,
  MissingField,
} from './conversation/agent.conversation';

export class AgentChatDto {
  // 先 trim，避免只包含空格的消息通过 IsNotEmpty 校验。
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;
  // 后续会直接作为数据库主键和 Checkpointer thread_id，统一使用 UUID v4。
  @IsUUID('4', { message: 'conversationId 必须是 UUID v4' })
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
