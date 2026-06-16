import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { UserCouponStatus } from './user-coupon.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, Public } from '../auth/decorators';

@Controller('api/coupon')
@UseGuards(JwtAuthGuard)
export class CouponController {
  constructor(private readonly service: CouponService) {}

  /** GET /api/coupon — 可领取的优惠券（公开） */
  @Public()
  @Get()
  listAvailable() {
    return this.service.listAvailable();
  }

  /** GET /api/coupon/mine — 我的优惠券 ?status=unused|used|expired */
  @Get('mine')
  listMine(
    @CurrentUser('userId') userId: number,
    @Query('status') status?: UserCouponStatus,
  ) {
    return this.service.listMine(userId, status);
  }

  /** POST /api/coupon/:id/claim — 领取 */
  @Post(':id/claim')
  claim(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.claim(userId, id);
  }
}
