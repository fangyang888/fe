import { Controller, Get } from '@nestjs/common';
import { DualAnchor4963KillService } from './dual-anchor-49-63-kill.service';

@Controller('api/kill/dual-anchor-49-63')
export class DualAnchor4963KillController {
  constructor(private readonly service: DualAnchor4963KillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
