import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { BannerModule } from '../banner/banner.module';
import { CategoryModule } from '../category/category.module';
import { ProductModule } from '../product/product.module';

/**
 * 复用 banner / category / product 三个服务做聚合，不持有自己的表。
 */
@Module({
  imports: [BannerModule, CategoryModule, ProductModule],
  controllers: [HomeController],
})
export class HomeModule {}
