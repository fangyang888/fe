import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './category.entity';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryAdminController } from './category-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category])],
  controllers: [CategoryController, CategoryAdminController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
