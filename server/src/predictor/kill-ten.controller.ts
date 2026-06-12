import { Controller, Get, Post, Query } from '@nestjs/common';
import { KillTenService } from './kill-ten.service';

@Controller('api/kill-ten')
export class KillTenController {
  constructor(private readonly killTenService: KillTenService) {}

  /** GET /api/kill-ten?type=default|hk&killCount=10&lookback=20 — 预测下期不会出现的 10 个号码 */
  @Get()
  async getKillTen(
    @Query('type') type?: string,
    @Query('killCount') killCount?: string,
    @Query('lookback') lookback?: string,
  ): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    const parsedKillCount = killCount ? parseInt(killCount, 10) : 3;
    const parsedLookback = lookback ? parseInt(lookback, 10) : 20;
    return this.killTenService.getKillTen(source, parsedKillCount, parsedLookback);
  }

  /** POST /api/kill-ten/cache/refresh — 重新计算并刷新缓存 */
  @Post('cache/refresh')
  async refreshCache(
    @Query('type') type?: string,
    @Query('killCount') killCount?: string,
    @Query('lookback') lookback?: string,
  ): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    const parsedKillCount = killCount ? parseInt(killCount, 10) : 3;
    const parsedLookback = lookback ? parseInt(lookback, 10) : 20;
    return this.killTenService.refreshCache(source, parsedKillCount, parsedLookback);
  }
}
