import { Controller, Get } from '@nestjs/common';
import { TieredKillComboService } from './tiered-kill-combo.service';

@Controller('api/kill/tiered-combo')
export class TieredKillComboController {
  constructor(private readonly service: TieredKillComboService) {}

  @Get()
  getReport() {
    return this.service.getReport();
  }
}
