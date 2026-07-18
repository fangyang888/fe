import { Controller, Get } from '@nestjs/common';
import { QuadraticAnchor17FirstKillService } from './quadratic-anchor-17-first-kill.service';

@Controller('api/kill/quadratic-anchor-17-first')
export class QuadraticAnchor17FirstKillController {
  constructor(private readonly service: QuadraticAnchor17FirstKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
