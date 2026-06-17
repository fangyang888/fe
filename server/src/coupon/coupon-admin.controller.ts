import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CouponType } from './coupon.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class CouponDto {
  name: string;
  type: CouponType;
  value: number;
  minSpend?: number;
  expireAt?: Date;
  status?: number;
}

@Controller('api/admin/coupon')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CouponAdminController {
  constructor(private readonly service: CouponService) {}

  @Get()
  @RequirePermissions('coupon:manage')
  findAll() {
    return this.service.listAllAdmin();
  }

  @Post()
  @RequirePermissions('coupon:manage')
  create(@Body() dto: CouponDto) {
    return this.service.createCoupon(dto);
  }

  @Put(':id')
  @RequirePermissions('coupon:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CouponDto>) {
    return this.service.updateCoupon(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('coupon:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeCoupon(id);
  }
}
