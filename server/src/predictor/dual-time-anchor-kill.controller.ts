import { Controller, Get } from '@nestjs/common';
import { DualTimeAnchorKillService } from './dual-time-anchor-kill.service';

@Controller('api/kill/dual-time-anchor')
export class DualTimeAnchorKillController {
  constructor(private readonly service: DualTimeAnchorKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
