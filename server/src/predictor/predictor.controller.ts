import { Controller, Get } from '@nestjs/common';
import { PredictorService } from './predictor.service';

@Controller('api/predictor')
export class PredictorController {
  constructor(private readonly predictorService: PredictorService) {}

  @Get('kill')
  async getKillPredictions() {
    return this.predictorService.getKillPredictions();
  }
}
