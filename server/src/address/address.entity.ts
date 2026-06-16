import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 收货地址 */
@Entity('address')
export class Address {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  /** 收货人 */
  @Column()
  name: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  province?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  district?: string;

  /** 详细地址 */
  @Column()
  detail: string;

  /** 1默认 0非默认 */
  @Column({ type: 'tinyint', default: 0 })
  isDefault: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
