import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';

class AddFavoriteDto {
  productId: number;
}

@Controller('api/favorite')
@UseGuards(JwtAuthGuard)
export class FavoriteController {
  constructor(private readonly service: FavoriteService) {}

  /** GET /api/favorite — 我的收藏 */
  @Get()
  list(@CurrentUser('userId') userId: number) {
    return this.service.list(userId);
  }

  /** GET /api/favorite/check/:productId — 是否已收藏 */
  @Get('check/:productId')
  check(
    @CurrentUser('userId') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.service.isFavorite(userId, productId);
  }

  /** POST /api/favorite — 添加收藏 */
  @Post()
  add(@CurrentUser('userId') userId: number, @Body() dto: AddFavoriteDto) {
    return this.service.add(userId, dto.productId);
  }

  /** DELETE /api/favorite/:productId — 取消收藏 */
  @Delete(':productId')
  remove(
    @CurrentUser('userId') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.service.remove(userId, productId);
  }
}
