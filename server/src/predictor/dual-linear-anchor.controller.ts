import { Controller, Get, Query } from '@nestjs/common';
import { DualLinearAnchorService } from './dual-linear-anchor.service';

@Controller('api/kill/dual-linear-anchor')
export class DualLinearAnchorController {
  constructor(private readonly service: DualLinearAnchorService) {}
  @Get()
  getPrediction(@Query('mode') mode?: string) {
    return this.service.getPrediction(mode === 'latest');
  }
}
