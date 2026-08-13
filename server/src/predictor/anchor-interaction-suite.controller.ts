import { Controller, Get } from '@nestjs/common';
import { AnchorInteractionSuiteService } from './anchor-interaction-suite.service';

@Controller('api/kill/anchor-interaction-suite')
export class AnchorInteractionSuiteController {
  constructor(private readonly service: AnchorInteractionSuiteService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
