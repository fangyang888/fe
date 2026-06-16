import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('api/product')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  /** GET /api/product — 列表，支持 ?categoryId=&keyword=&page=&pageSize=&sort= */
  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: 'sales' | 'price' | 'newest',
  ) {
    return this.service.findAll({
      categoryId: categoryId ? Number(categoryId) : undefined,
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sort,
    });
  }

  /** GET /api/product/:id — 商品详情 */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
