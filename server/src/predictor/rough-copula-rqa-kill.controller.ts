import { Controller, Get, Header } from '@nestjs/common';
import { RoughCopulaRqaKillService } from './rough-copula-rqa-kill.service';

@Controller('api/kill/rough-copula-rqa')
export class RoughCopulaRqaKillController {
  constructor(private readonly service: RoughCopulaRqaKillService) {}

  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  getPrediction() {
    return this.service.getPrediction();
  }
}
