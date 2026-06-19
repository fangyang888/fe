import { Controller, Get, Post, Query } from '@nestjs/common';
import { KillComboBacktestService } from './kill-combo-backtest.service';

@Controller('api/kill-combo')
export class KillComboBacktestController {
  constructor(private readonly service: KillComboBacktestService) {}

  @Get('search')
  search(
    @Query('count') count?: string,
    @Query('a') a?: string,
    @Query('b') b?: string,
  ) {
    return this.service.search({
      count: this.parseCount(count),
      a: a || 'HC3',
      b: b || 'L15',
    });
  }

  @Post('cache/refresh')
  refresh(
    @Query('count') count?: string,
    @Query('a') a?: string,
    @Query('b') b?: string,
  ) {
    return this.service.refresh({
      count: this.parseCount(count),
      a: a || 'HC3',
      b: b || 'L15',
    });
  }

  private parseCount(value?: string) {
    const parsed = Number(value || 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.max(5, Math.min(80, Math.floor(parsed)));
  }
}
