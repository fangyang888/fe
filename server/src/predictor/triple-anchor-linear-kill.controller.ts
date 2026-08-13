import { Controller, Get } from '@nestjs/common';
import { TripleAnchorLinearKillService } from './triple-anchor-linear-kill.service';

@Controller('api/kill/triple-anchor-linear')
export class TripleAnchorLinearKillController {
  constructor(private readonly service: TripleAnchorLinearKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
