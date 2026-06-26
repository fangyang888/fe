import { Controller, Get, Query } from '@nestjs/common';
import { ExperimentalKill98Service } from './experimental-kill98.service';

@Controller('api/kill/experimental-98')
export class ExperimentalKill98Controller {
  constructor(private readonly experimentalKill98Service: ExperimentalKill98Service) {}

  /** GET /api/kill/experimental-98?type=default|hk — 独立实验方向，寻找近50期98%+单杀 */
  @Get()
  async getPrediction(@Query('type') type?: string): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    return this.experimentalKill98Service.getPrediction(source);
  }
}
