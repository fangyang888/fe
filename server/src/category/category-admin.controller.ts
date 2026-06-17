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
import { CategoryService } from './category.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class CategoryDto {
  name: string;
  icon?: string;
  sort?: number;
  status?: number;
}

@Controller('api/admin/category')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CategoryAdminController {
  constructor(private readonly service: CategoryService) {}

  @Get()
  @RequirePermissions('category:manage')
  findAll() {
    return this.service.findAllAdmin();
  }

  @Post()
  @RequirePermissions('category:manage')
  create(@Body() dto: CategoryDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('category:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CategoryDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('category:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
