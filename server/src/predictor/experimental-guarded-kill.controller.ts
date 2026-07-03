import { Controller, Get } from '@nestjs/common';
import { ExperimentalGuardedKillService } from './experimental-guarded-kill.service';

@Controller('api/kill/experimental-guarded')
export class ExperimentalGuardedKillController {
  constructor(private readonly service: ExperimentalGuardedKillService) {}

  /** GET /api/kill/experimental-guarded — 非98/99重复方向：遗漏频次 + 候选换位过滤 */
  @Get()
  getPrediction(): Promise<any> {
    return this.service.getPrediction();
  }
}
