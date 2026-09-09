import { Controller, Get, Header } from '@nestjs/common';
import { OnlineRiskRankingService } from './online-risk-ranking.service';

@Controller('api/kill/online-risk-ranking')
export class OnlineRiskRankingController {
  constructor(private readonly service: OnlineRiskRankingService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getPrediction() {
    return this.service.getPrediction();
  }
}
