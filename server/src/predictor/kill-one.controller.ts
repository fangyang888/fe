import { Controller, Get, Post, Query } from '@nestjs/common';
import { KillOneService } from './kill-one.service';

@Controller('api/kill-one')
export class KillOneController {
  constructor(private readonly killOneService: KillOneService) {}

  /** GET /api/kill-one?type=default|hk&backtest=50 — 预测下期最不可能出现的 1 个号码 */
  @Get()
  async getKillOne(
    @Query('type') type?: string,
    @Query('backtest') backtest?: string,
  ): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    const parsed = backtest ? parseInt(backtest, 10) : 50;
    return this.killOneService.getKillOne(source, parsed);
  }

  /** POST /api/kill-one/cache/refresh — 重新计算并刷新缓存 */
  @Post('cache/refresh')
  async refreshCache(
    @Query('type') type?: string,
    @Query('backtest') backtest?: string,
  ): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    const parsed = backtest ? parseInt(backtest, 10) : 50;
    return this.killOneService.refreshCache(source, parsed);
  }
}
