import { Controller, Get } from '@nestjs/common';
import { TailGatedDualKillService } from './tail-gated-dual-kill.service';

@Controller('api/kill/tail-gated-dual')
export class TailGatedDualKillController {
  constructor(private readonly service: TailGatedDualKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
