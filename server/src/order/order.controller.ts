import {
  BadRequestException,
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
import { PayService } from './pay.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, Public } from '../auth/decorators';

class UpdateStatusDto {
  status: OrderStatus;
}

/** 微信支付回调通知体 */
class WxPayNotifyDto {
  resource?: {
    ciphertext: string;
    associated_data?: string;
    nonce: string;
  };
}

@Controller('api/order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(
    private readonly service: OrderService,
    private readonly payService: PayService,
  ) {}

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

  /** POST /api/order/:id/pay — 发起微信支付，返回 wx.requestPayment 参数 */
  @Post(':id/pay')
  async pay(
    @CurrentUser('userId') userId: number,
    @CurrentUser('openid') openid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const order = await this.service.findOne(userId, id);
    if (order.status !== 'unpaid') {
      throw new BadRequestException('订单状态不可支付');
    }
    return this.payService.createJsapiPayment(order, openid);
  }

  /**
   * POST /api/order/pay/notify — 微信支付结果回调（公开，无需登录）。
   * 解密通知，成功则置订单为已付款。需返回微信约定的应答体。
   */
  @Public()
  @Post('pay/notify')
  async payNotify(@Body() body: WxPayNotifyDto) {
    try {
      if (!body?.resource) throw new Error('缺少 resource');
      const data = this.payService.decryptNotifyResource(body.resource);
      if (data.trade_state === 'SUCCESS' && data.out_trade_no) {
        await this.service.markPaidByOrderNo(data.out_trade_no);
      }
      return { code: 'SUCCESS', message: '成功' };
    } catch (e) {
      // 返回非 SUCCESS，微信会按策略重试
      return { code: 'FAIL', message: (e as Error).message };
    }
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
