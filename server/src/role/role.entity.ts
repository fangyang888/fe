import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Permission } from '../permission/permission.entity';

/**
 * 角色：一组权限的集合。用户通过分配角色间接获得权限。
 */
@Entity('role')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  /** 角色编码，全局唯一，如 'admin' / 'staff' */
  @Column({ unique: true })
  code: string;

  /** 角色名称（中文展示用） */
  @Column()
  name: string;

  @Column({ nullable: true })
  remark?: string;

  /** 内置角色不允许删除（如 admin） */
  @Column({ type: 'tinyint', default: 0 })
  is_system: number;

  /** 角色 ↔ 权限，多对多。eager 让查角色时自动带出权限 */
  @ManyToMany(() => Permission, { eager: true, cascade: false })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
