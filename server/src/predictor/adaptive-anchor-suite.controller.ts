import { Controller, Get } from '@nestjs/common';
import { AdaptiveAnchorSuiteService } from './adaptive-anchor-suite.service';

@Controller('api/kill/adaptive-anchor-suite')
export class AdaptiveAnchorSuiteController {
  constructor(private readonly service: AdaptiveAnchorSuiteService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
