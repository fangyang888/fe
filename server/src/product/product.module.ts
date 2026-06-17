import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductAdminController } from './product-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductController, ProductAdminController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
