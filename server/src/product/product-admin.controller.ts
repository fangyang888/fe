import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { Product } from './product.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class ProductDto {
  name: string;
  price: number;
  originalPrice?: number;
  image?: string;
  stock?: number;
  sales?: number;
  categoryId?: number;
  description?: string;
  isRecommend?: number;
  status?: number;
}

/**
 * 商品后台管理。admin 角色在 PermissionGuard 里全放行，
 * 因此即使未单独配 product:manage 权限点也能访问。
 */
@Controller('api/admin/product')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProductAdminController {
  constructor(private readonly service: ProductService) {}

  /** GET /api/admin/product — 全量列表（含下架） */
  @Get()
  @RequirePermissions('product:manage')
  findAll(
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAllAdmin({
      keyword,
      categoryId: categoryId ? Number(categoryId) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('product:manage')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneAdmin(id);
  }

  @Post()
  @RequirePermissions('product:manage')
  create(@Body() dto: ProductDto): Promise<Product> {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('product:manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<ProductDto>,
  ): Promise<Product> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('product:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
