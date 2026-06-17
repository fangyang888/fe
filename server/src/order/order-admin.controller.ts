import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderStatus } from './order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class StatusDto {
  status: OrderStatus;
}

/** 订单后台管理（跨用户）。admin 角色全放行。 */
@Controller('api/admin/order')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrderAdminController {
  constructor(private readonly service: OrderService) {}

  /** GET /api/admin/order — 全量订单 ?status=&page=&pageSize= */
  @Get()
  @RequirePermissions('order:manage')
  findAll(
    @Query('status') status?: OrderStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.adminFindAll(
      status,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Get(':id')
  @RequirePermissions('order:manage')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.adminFindOne(id);
  }

  /** PUT /api/admin/order/:id/status — 改状态（如发货） */
  @Put(':id/status')
  @RequirePermissions('order:manage')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StatusDto,
  ) {
    return this.service.adminUpdateStatus(id, dto.status);
  }
}
