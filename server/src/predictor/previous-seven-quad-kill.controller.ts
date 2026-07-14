import { Controller, Get } from '@nestjs/common';
import { PreviousSevenQuadKillService } from './previous-seven-quad-kill.service';

@Controller('api/kill/previous-seven-quad')
export class PreviousSevenQuadKillController {
  constructor(private readonly service: PreviousSevenQuadKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
