import { Controller, Get } from '@nestjs/common';
import { AnchorPhase14KillService } from './anchor-phase-14-kill.service';

@Controller('api/kill/anchor-phase-14')
export class AnchorPhase14KillController {
  constructor(private readonly service: AnchorPhase14KillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
