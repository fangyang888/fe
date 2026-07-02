import { Controller, Get } from '@nestjs/common';
import { ExperimentalKill99Service } from './experimental-kill99.service';

@Controller('api/kill/experimental-99')
export class ExperimentalKill99Controller {
  constructor(private readonly experimentalKill99Service: ExperimentalKill99Service) {}

  /** GET /api/kill/experimental-99 — 仅使用 history 表的新实验方向 */
  @Get()
  async getPrediction(): Promise<any> {
    return this.experimentalKill99Service.getPrediction();
  }
}
