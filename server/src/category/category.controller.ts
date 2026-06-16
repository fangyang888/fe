import { Controller, Get } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('api/category')
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /** GET /api/category — 分类列表（公开） */
  @Get()
  findAll() {
    return this.service.findAll();
  }
}
