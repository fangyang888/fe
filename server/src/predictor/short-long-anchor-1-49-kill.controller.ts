import { Controller, Get } from '@nestjs/common';
import { ShortLongAnchor149KillService } from './short-long-anchor-1-49-kill.service';

@Controller('api/kill/short-long-anchor-1-49')
export class ShortLongAnchor149KillController {
  constructor(private readonly service: ShortLongAnchor149KillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
