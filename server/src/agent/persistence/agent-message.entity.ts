import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgentConversationRecord } from './agent-conversation.entity';

export type AgentMessageRole = 'user' | 'assistant';
export type AgentMessageStatus = 'pending' | 'completed' | 'failed';

@Entity('agent_message')
@Index(['conversationId', 'clientMessageId', 'role'], { unique: true })
@Index(['conversationId', 'id'])
export class AgentMessageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36, name: 'conversation_id' })
  conversationId: string;

  @Column({ type: 'varchar', length: 36, name: 'client_message_id' })
  clientMessageId: string;

  @Column({ type: 'varchar', length: 36, name: 'turn_id' })
  turnId: string;

  @Column({ type: 'varchar', length: 20 })
  role: AgentMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: AgentMessageStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => AgentConversationRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: AgentConversationRecord;
}
