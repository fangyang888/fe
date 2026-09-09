import { Controller, Get, Header } from '@nestjs/common';
import { PreviousFourthService } from './previous-fourth.service';

@Controller('api/kill/previous-fourth')
export class PreviousFourthController {
  constructor(private readonly service: PreviousFourthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getPrediction() {
    return this.service.getPrediction();
  }
}
