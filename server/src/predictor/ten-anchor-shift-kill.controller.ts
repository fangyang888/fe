import { Controller, Get } from '@nestjs/common';
import { TenAnchorShiftKillService } from './ten-anchor-shift-kill.service';

@Controller('api/kill/ten-anchor-shift')
export class TenAnchorShiftKillController {
  constructor(private readonly service: TenAnchorShiftKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
