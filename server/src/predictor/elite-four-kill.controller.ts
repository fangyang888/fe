import { Controller, Get } from '@nestjs/common';
import { EliteFourKillService } from './elite-four-kill.service';

@Controller('api/kill/elite-four')
export class EliteFourKillController {
  constructor(private readonly service: EliteFourKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
