import { Controller, Get } from '@nestjs/common';
import { DynamicSevenKillService } from './dynamic-seven-kill.service';

@Controller('api/kill/dynamic-seven')
export class DynamicSevenKillController {
  constructor(private readonly dynamicSevenKillService: DynamicSevenKillService) {}

  @Get()
  getDynamicSeven() {
    return this.dynamicSevenKillService.getDynamicSeven();
  }
}
