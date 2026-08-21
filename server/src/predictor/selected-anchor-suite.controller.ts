import { Controller, Get } from '@nestjs/common';
import { SelectedAnchorSuiteService } from './selected-anchor-suite.service';

@Controller('api/kill/selected-anchor-suite')
export class SelectedAnchorSuiteController {
  constructor(private readonly service: SelectedAnchorSuiteService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
