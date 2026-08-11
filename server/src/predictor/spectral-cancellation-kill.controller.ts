import { Controller, Get } from '@nestjs/common';
import { SpectralCancellationKillService } from './spectral-cancellation-kill.service';

@Controller('api/kill/spectral-cancellation')
export class SpectralCancellationKillController {
  constructor(private readonly service: SpectralCancellationKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
