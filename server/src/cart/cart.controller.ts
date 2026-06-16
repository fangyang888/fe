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
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';

class AddCartDto {
  productId: number;
  quantity?: number;
}
class UpdateQtyDto {
  quantity: number;
}
class CheckedDto {
  checked: boolean;
}

@Controller('api/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** GET /api/cart — 当前用户购物车 */
  @Get()
  getCart(@CurrentUser('userId') userId: number) {
    return this.cart.getCart(userId);
  }

  /** POST /api/cart — 加入购物车 */
  @Post()
  add(@CurrentUser('userId') userId: number, @Body() dto: AddCartDto) {
    return this.cart.add(userId, dto.productId, dto.quantity ?? 1);
  }

  /** PUT /api/cart/:id — 改数量 */
  @Put(':id')
  updateQty(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQtyDto,
  ) {
    return this.cart.updateQuantity(userId, id, dto.quantity);
  }

  /** PUT /api/cart/:id/checked — 勾选/取消 */
  @Put(':id/checked')
  setChecked(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CheckedDto,
  ) {
    return this.cart.setChecked(userId, id, dto.checked);
  }

  /** DELETE /api/cart/:id — 删除单项 */
  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cart.remove(userId, id);
  }

  /** DELETE /api/cart — 清空 */
  @Delete()
  clear(@CurrentUser('userId') userId: number) {
    return this.cart.clear(userId);
  }
}
