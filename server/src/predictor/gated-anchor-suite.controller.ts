import { Controller, Get } from '@nestjs/common';
import { GatedAnchorSuiteService } from './gated-anchor-suite.service';

@Controller('api/kill/gated-anchor-suite')
export class GatedAnchorSuiteController {
  constructor(private readonly service: GatedAnchorSuiteService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
