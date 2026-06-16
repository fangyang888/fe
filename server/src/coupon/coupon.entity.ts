import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/** 优惠券模板（可被用户领取） */
export type CouponType = 'amount' | 'discount'; // 满减 | 折扣

@Entity('coupon')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'amount' })
  type: CouponType;

  /** amount 类型=减免金额(元)；discount 类型=折扣(如 88 表示 8.8 折) */
  @Column({ type: 'int' })
  value: number;

  /** 满多少元可用，0 表示无门槛 */
  @Column({ type: 'int', default: 0 })
  minSpend: number;

  /** 过期时间 */
  @Column({ type: 'datetime', nullable: true })
  expireAt?: Date;

  /** 1有效 0停发 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  created_at: Date;
}
