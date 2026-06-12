import { Controller, Get, Post } from '@nestjs/common';
import { FixedHybridKillService } from './fixed-hybrid-kill.service';

@Controller('api/fixed-hybrid-kill')
export class FixedHybridKillController {
  constructor(private readonly fixedHybridKillService: FixedHybridKillService) {}

  @Get('probability-4-7')
  async getProbability47() {
    return this.fixedHybridKillService.getProbability47();
  }

  @Post('probability-4-7/cache/refresh')
  async refreshProbability47Cache() {
    return this.fixedHybridKillService.refreshProbability47Cache();
  }
}
