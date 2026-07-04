import { Controller, Get } from '@nestjs/common';
import { GapScoreKillService } from './gap-score-kill.service';

@Controller('api/kill/gap-score')
export class GapScoreKillController {
  constructor(private readonly service: GapScoreKillService) {}

  /** GET /api/kill/gap-score — 固定 gap-f20-r2 间隔序列实验 */
  @Get()
  getPrediction(): Promise<any> {
    return this.service.getPrediction();
  }
}
