import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * 权限点：最小授权单位，用 code 表示，如 'user:delete'、'order:refund'。
 * 接口上用 @RequirePermissions('user:delete') 声明，守卫据此校验。
 */
@Entity('permission')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  /** 权限编码，全局唯一，格式建议 "资源:动作" */
  @Column({ unique: true })
  code: string;

  /** 权限名称（中文展示用） */
  @Column()
  name: string;

  /** 所属资源分组，便于后台按模块展示，如 'user' / 'order' */
  @Column({ nullable: true })
  group?: string;

  @CreateDateColumn()
  created_at: Date;
}
