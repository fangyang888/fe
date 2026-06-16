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
import { PermissionService } from './permission.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class CreatePermissionDto {
  code: string;
  name: string;
  group?: string;
}

@Controller('api/permission')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(private readonly perms: PermissionService) {}

  /** GET /api/permission — 权限点列表（前端渲染分配树用） */
  @Get()
  @RequirePermissions('permission:list')
  findAll() {
    return this.perms.findAll();
  }

  @Post()
  @RequirePermissions('permission:create')
  create(@Body() dto: CreatePermissionDto) {
    return this.perms.create(dto);
  }

  @Delete(':id')
  @RequirePermissions('permission:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.perms.remove(id);
  }
}
