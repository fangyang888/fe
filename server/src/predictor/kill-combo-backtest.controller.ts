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
      a: a || 'HC1',
      b: b || 'S2',
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
      a: a || 'HC1',
      b: b || 'S2',
    });
  }

  @Get('smart7-position-stats')
  smart7PositionStats() {
    return this.service.getSmart7PositionStats();
  }

  @Post('smart7-position-stats/cache/refresh')
  refreshSmart7PositionStats() {
    return this.service.getSmart7PositionStats(true);
  }

  @Get('kill10-position-stats')
  kill10PositionStats() {
    return this.service.getKill10PositionStats();
  }

  @Post('kill10-position-stats/cache/refresh')
  refreshKill10PositionStats() {
    return this.service.getKill10PositionStats(true);
  }

  private parseCount(value?: string) {
    const parsed = Number(value || 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.max(5, Math.min(80, Math.floor(parsed)));
  }
}
