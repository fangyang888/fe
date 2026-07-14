import { Controller, Get } from '@nestjs/common';
import { StateRiskKillService } from './state-risk-kill.service';

@Controller('api/kill/state-risk')
export class StateRiskKillController {
  constructor(private readonly service: StateRiskKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
