import { Controller, Get } from '@nestjs/common';
import { RiskControlledFiveService } from './risk-controlled-five.service';

@Controller('api/kill/risk-controlled-five')
export class RiskControlledFiveController {
  constructor(private readonly service: RiskControlledFiveService) {}

  @Get()
  getReport() {
    return this.service.getReport();
  }
}
