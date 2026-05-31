import { Controller, Get, Post, Query } from '@nestjs/common';
import { PredictorKill2Service } from './predictor-kill2.service';

@Controller('api/predictor-opt/kill2')
export class PredictorKill2Controller {
  constructor(private readonly predictorKill2Service: PredictorKill2Service) {}

  @Get()
  async getHotPickKill2Predictions(@Query('type') type?: string) {
    return this.predictorKill2Service.getHotPickKill2PredictionResponse(type);
  }

  @Post('cache/clear')
  async clearHotPickKill2Cache(@Query('type') type?: string) {
    return this.predictorKill2Service.clearHotPickKill2Cache(type);
  }

  @Post('cache/refresh')
  async refreshHotPickKill2Cache(@Query('type') type?: string) {
    return this.predictorKill2Service.refreshHotPickKill2Cache(type);
  }
}
