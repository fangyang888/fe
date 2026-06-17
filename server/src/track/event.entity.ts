import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 埋点事件明细。量大，只存必要字段，自定义参数放 params(json)。
 * 后期可按月分表或迁移到 ClickHouse 等。
 */
@Entity('event')
@Index('idx_event_name_ts', ['eventName', 'ts'])
@Index('idx_event_openid_ts', ['openid', 'ts'])
export class Event {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** 事件标识，如 product_click */
  @Column({ name: 'event_name' })
  eventName: string;

  /** pageview / click / action / custom */
  @Column({ name: 'event_type', default: 'custom' })
  eventType: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId?: number;

  @Index()
  @Column({ nullable: true })
  openid?: string;

  /** 一次启动一个会话 id（前端生成） */
  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  /** 当前页面路径 */
  @Column({ nullable: true })
  page?: string;

  /** 事件自定义参数 */
  @Column({ type: 'json', nullable: true })
  params?: Record<string, any>;

  @Column({ default: 'mp-weixin' })
  platform: string;

  @Column({ name: 'app_version', nullable: true })
  appVersion?: string;

  @Column({ nullable: true })
  os?: string;

  /** 事件发生时间戳（前端时间，毫秒） */
  @Column({ type: 'bigint' })
  ts: string;

  @CreateDateColumn()
  created_at: Date;
}
