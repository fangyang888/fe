import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TrackService, TrackEventDto } from './track.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class ReportDto {
  events: TrackEventDto[];
}

@Controller('api/track')
export class TrackController {
  constructor(private readonly service: TrackService) {}

  /** POST /api/track/report — 埋点批量上报（公开，未登录也采集） */
  @Post('report')
  report(@Body() dto: ReportDto) {
    return this.service.report(dto?.events || []);
  }

  /** GET /api/track/overview — 当日概览（后台看板用，需权限） */
  @Get('overview')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('stat:view')
  overview(@Query('date') date?: string) {
    return this.service.overview(date);
  }
}
