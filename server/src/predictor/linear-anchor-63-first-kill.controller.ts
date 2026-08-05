import { Controller, Get } from '@nestjs/common';
import { LinearAnchor63FirstKillService } from './linear-anchor-63-first-kill.service';

@Controller('api/kill/linear-anchor-63-first')
export class LinearAnchor63FirstKillController {
  constructor(private readonly service: LinearAnchor63FirstKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
