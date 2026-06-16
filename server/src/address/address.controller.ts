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
import { AddressService, AddressDto } from './address.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';

@Controller('api/address')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly service: AddressService) {}

  /** GET /api/address — 地址列表 */
  @Get()
  findAll(@CurrentUser('userId') userId: number) {
    return this.service.findAll(userId);
  }

  /** GET /api/address/:id */
  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(userId, id);
  }

  /** POST /api/address — 新增 */
  @Post()
  create(@CurrentUser('userId') userId: number, @Body() dto: AddressDto) {
    return this.service.create(userId, dto);
  }

  /** PUT /api/address/:id — 修改 */
  @Put(':id')
  update(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<AddressDto>,
  ) {
    return this.service.update(userId, id, dto);
  }

  /** PUT /api/address/:id/default — 设为默认 */
  @Put(':id/default')
  setDefault(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.setDefault(userId, id);
  }

  /** DELETE /api/address/:id */
  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(userId, id);
  }
}
