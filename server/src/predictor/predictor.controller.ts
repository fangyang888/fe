import { Controller, Get, Post, Query } from '@nestjs/common';
import { PredictorService } from './predictor.service';

@Controller('api/predictor')
export class PredictorController {
  constructor(private readonly predictorService: PredictorService) {}

  @Get('kill')
  async getKillPredictions() {
    return this.predictorService.getKillPredictions();
  }

  @Get('markov2-position-six')
  async getMarkov2PositionSixStats() {
    return this.predictorService.getMarkov2PositionSixStats();
  }

  @Get('knn-position-five')
  async getKnnPositionFiveStats() {
    return this.predictorService.getKnnPositionFiveStats();
  }

  @Get('markov-position-eight')
  async getMarkovPositionEightStats() {
    return this.predictorService.getMarkovPositionEightStats();
  }

  @Get('frequency-position-five')
  async getFrequencyPositionFiveStats() {
    return this.predictorService.getFrequencyPositionFiveStats();
  }

  @Post('frequency-position-five/cache/refresh')
  async refreshFrequencyPositionFiveStats() {
    return this.predictorService.getFrequencyPositionFiveStats(true);
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

  @Get('kill-seven')
  async getKillSevenStats() {
    return this.predictorService.getKillSevenStats();
  }

  @Get('kill-seven/backtest')
  async getKillSevenBacktest() {
    return this.predictorService.getKillSevenBacktest();
  }

  @Post('kill-seven/cache/refresh')
  async refreshKillSevenCache() {
    return this.predictorService.refreshKillSevenCache();
  }

  @Post('kill-seven/backtest/cache/refresh')
  async refreshKillSevenBacktestCache() {
    return this.predictorService.refreshKillSevenBacktestCache();
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
