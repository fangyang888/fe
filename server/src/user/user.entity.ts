import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Role } from '../role/role.entity';

/**
 * 用户：以微信 openid 作为唯一身份。昵称/头像需前端通过
 * chooseAvatar + 昵称输入框获取后回传（getUserProfile 已废弃）。
 */
@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  /** 微信小程序唯一标识，核心字段 */
  @Column({ unique: true })
  openid: string;

  /** 微信开放平台 unionid（同主体多应用打通时用），可空 */
  @Column({ nullable: true })
  unionid?: string;

  @Column({ nullable: true })
  nickname?: string;

  @Column({ nullable: true })
  avatar?: string;

  /** 0未知 1男 2女 */
  @Column({ type: 'tinyint', nullable: true })
  gender?: number;

  @Column({ nullable: true })
  phone?: string;

  /** 1正常 0禁用 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  /** 用户 ↔ 角色，多对多。eager 让登录取用户时直接带出角色(及其权限) */
  @ManyToMany(() => Role, { eager: true, cascade: false })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
