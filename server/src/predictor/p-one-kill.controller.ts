import { Controller, Get, Query } from '@nestjs/common';
import { POneKillService } from './p-one-kill.service';

@Controller('api/kill/p-one')
export class POneKillController {
  constructor(private readonly pOneKillService: POneKillService) {}

  /** GET /api/kill/p-one?type=default|hk — 从前 5 期号码里选 1 个下期不会开的号码 */
  @Get()
  async getPrediction(@Query('type') type?: string): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    return this.pOneKillService.getPrediction(source);
  }
}
