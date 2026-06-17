import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from './coupon.entity';
import { UserCoupon } from './user-coupon.entity';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { CouponAdminController } from './coupon-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, UserCoupon])],
  controllers: [CouponController, CouponAdminController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
