import { Controller, Get } from '@nestjs/common';
import { LogisticDiffusionKillService } from './logistic-diffusion-kill.service';

@Controller('api/kill/logistic-diffusion')
export class LogisticDiffusionKillController {
  constructor(private readonly service: LogisticDiffusionKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
