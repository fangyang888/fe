import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('agent_conversation')
export class AgentConversationRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  // 第一遍页面还没有接 JWT，暂时允许为空；上线前必须改成必填并校验归属。
  @Index()
  @Column({ type: 'int', nullable: true, name: 'user_id' })
  userId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'closed' | 'deleted';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
