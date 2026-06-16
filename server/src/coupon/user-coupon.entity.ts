import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

/** 用户领取的优惠券 */
export type UserCouponStatus = 'unused' | 'used' | 'expired';

@Entity('user_coupon')
@Unique('uq_user_coupon', ['userId', 'couponId'])
export class UserCoupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  couponId: number;

  @Column({ type: 'varchar', default: 'unused' })
  status: UserCouponStatus;

  @Column({ type: 'datetime', nullable: true })
  usedAt?: Date;

  @CreateDateColumn()
  created_at: Date;
}
