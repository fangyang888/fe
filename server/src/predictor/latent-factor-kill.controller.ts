import { Controller, Get } from '@nestjs/common';
import { LatentFactorKillService } from './latent-factor-kill.service';

@Controller('api/kill/latent-factor')
export class LatentFactorKillController {
  constructor(private readonly service: LatentFactorKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
