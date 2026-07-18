import { Controller, Get } from '@nestjs/common';
import { QuadraticAnchor49SevenKillService } from './quadratic-anchor-49-seven-kill.service';

@Controller('api/kill/quadratic-anchor-49-seven')
export class QuadraticAnchor49SevenKillController {
  constructor(private readonly service: QuadraticAnchor49SevenKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
