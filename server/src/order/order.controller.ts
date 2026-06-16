import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService, CreateOrderDto } from './order.service';
import { OrderStatus } from './order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';

class UpdateStatusDto {
  status: OrderStatus;
}

@Controller('api/order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly service: OrderService) {}

  /** GET /api/order/summary — 各状态订单数量 */
  @Get('summary')
  summary(@CurrentUser('userId') userId: number) {
    return this.service.summary(userId);
  }

  /** GET /api/order — 订单列表 ?status=&page=&pageSize= */
  @Get()
  findAll(
    @CurrentUser('userId') userId: number,
    @Query('status') status?: OrderStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(
      userId,
      status,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 10,
    );
  }

  /** GET /api/order/:id — 订单详情 */
  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(userId, id);
  }

  /** POST /api/order — 用购物车勾选项下单 */
  @Post()
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateOrderDto) {
    return this.service.createFromCart(userId, dto);
  }

  /** PUT /api/order/:id/status — 状态流转（付款/发货/收货等） */
  @Put(':id/status')
  updateStatus(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.updateStatus(userId, id, dto.status);
  }
}
