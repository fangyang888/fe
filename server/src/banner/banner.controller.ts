import { Controller, Get } from '@nestjs/common';
import { BannerService } from './banner.service';

@Controller('api/banner')
export class BannerController {
  constructor(private readonly service: BannerService) {}

  /** GET /api/banner — 轮播列表（公开） */
  @Get()
  findAll() {
    return this.service.findAll();
  }
}
