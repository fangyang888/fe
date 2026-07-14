import { Controller, Get } from '@nestjs/common';
import { QuadraticAnchor53KillService } from './quadratic-anchor-53-kill.service';

@Controller('api/kill/quadratic-anchor-53')
export class QuadraticAnchor53KillController {
  constructor(private readonly service: QuadraticAnchor53KillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
