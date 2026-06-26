import { Controller, Get, Query } from '@nestjs/common';
import { TailTenKillService } from './tail-ten-kill.service';

@Controller('api/kill/tail-ten')
export class TailTenKillController {
  constructor(private readonly tailTenKillService: TailTenKillService) {}

  /** GET /api/kill/tail-ten?type=default|hk — 根据尾数与十位规律预测下期不会出现的 1 个号码 */
  @Get()
  async getPrediction(@Query('type') type?: string): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    return this.tailTenKillService.getPrediction(source);
  }
}
