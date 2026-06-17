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
import { BannerService } from './banner.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class BannerDto {
  image: string;
  title?: string;
  link?: string;
  sort?: number;
  status?: number;
}

@Controller('api/admin/banner')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BannerAdminController {
  constructor(private readonly service: BannerService) {}

  @Get()
  @RequirePermissions('banner:manage')
  findAll() {
    return this.service.findAllAdmin();
  }

  @Post()
  @RequirePermissions('banner:manage')
  create(@Body() dto: BannerDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('banner:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<BannerDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('banner:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
