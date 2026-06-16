import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Coupon } from './coupon.entity';
import { UserCoupon, UserCouponStatus } from './user-coupon.entity';

export interface UserCouponView {
  id: number;
  couponId: number;
  name: string;
  type: string;
  value: number;
  minSpend: number;
  expireAt?: Date;
  status: UserCouponStatus;
}

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(UserCoupon)
    private readonly ucRepo: Repository<UserCoupon>,
  ) {}

  /** 可领取的优惠券模板 */
  listAvailable() {
    return this.couponRepo.find({
      where: { status: 1 },
      order: { id: 'DESC' },
    });
  }

  /** 我的优惠券（可按状态过滤），关联模板信息 */
  async listMine(
    userId: number,
    status?: UserCouponStatus,
  ): Promise<UserCouponView[]> {
    const where: any = { userId };
    if (status) where.status = status;
    const rows = await this.ucRepo.find({
      where,
      order: { created_at: 'DESC' },
    });
    if (rows.length === 0) return [];

    const coupons = await this.couponRepo.find({
      where: { id: In(rows.map((r) => r.couponId)) },
    });
    const map = new Map(coupons.map((c) => [c.id, c]));

    return rows
      .filter((r) => map.has(r.couponId))
      .map((r) => {
        const c = map.get(r.couponId)!;
        return {
          id: r.id,
          couponId: c.id,
          name: c.name,
          type: c.type,
          value: c.value,
          minSpend: c.minSpend,
          expireAt: c.expireAt,
          status: r.status,
        };
      });
  }

  /** 领取优惠券 */
  async claim(userId: number, couponId: number) {
    const coupon = await this.couponRepo.findOne({ where: { id: couponId } });
    if (!coupon || coupon.status !== 1) {
      throw new NotFoundException('优惠券不存在或已停发');
    }
    const exists = await this.ucRepo.findOne({ where: { userId, couponId } });
    if (exists) throw new BadRequestException('已领取过该优惠券');

    const uc = this.ucRepo.create({ userId, couponId, status: 'unused' });
    await this.ucRepo.save(uc);
    return { ok: true };
  }
}
