import { Controller, Get } from '@nestjs/common';
import { BannerService } from '../banner/banner.service';
import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';

/**
 * 首页聚合接口：一次返回 banners + categories + 推荐商品，减少首屏请求数。
 */
@Controller('api/home')
export class HomeController {
  constructor(
    private readonly banners: BannerService,
    private readonly categories: CategoryService,
    private readonly products: ProductService,
  ) {}

  /** GET /api/home（公开） */
  @Get()
  async getHome() {
    const [banners, categories, recommendProducts] = await Promise.all([
      this.banners.findAll(),
      this.categories.findAll(),
      this.products.findRecommend(10),
    ]);
    return { banners, categories, recommendProducts };
  }
}
