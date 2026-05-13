import { Controller, Get, Post, Query } from '@nestjs/common';
import { PredictorService } from './predictor.service';

@Controller('api/predictor')
export class PredictorController {
  constructor(private readonly predictorService: PredictorService) {}

  @Get('kill')
  async getKillPredictions() {
    return this.predictorService.getKillPredictions();
  }

  @Post('kill/cache/clear')
  async clearKillCache() {
    return this.predictorService.clearKillCache();
  }

  @Post('kill/cache/refresh')
  async refreshKillCache() {
    return this.predictorService.refreshKillCache();
  }

  @Get('hot-pick')
  async getHotPickPredictions(@Query('type') type?: string) {
    return this.predictorService.getHotPickPredictionResponse(type);
  }

  @Post('hot-pick/cache/clear')
  async clearHotPickCache(@Query('type') type?: string) {
    return this.predictorService.clearHotPickCache(type);
  }

  @Post('hot-pick/cache/refresh')
  async refreshHotPickCache(@Query('type') type?: string) {
    return this.predictorService.refreshHotPickCache(type);
  }
}
