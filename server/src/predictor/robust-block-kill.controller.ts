import { Controller, Get } from '@nestjs/common';
import { RobustBlockKillService } from './robust-block-kill.service';

@Controller('api/kill/robust-block')
export class RobustBlockKillController {
  constructor(private readonly service: RobustBlockKillService) {}

  @Get()
  getPrediction() {
    return this.service.getPrediction();
  }
}
