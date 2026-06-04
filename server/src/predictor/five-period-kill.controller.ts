import { Controller, Get, Query } from '@nestjs/common';
import { FivePeriodKillService } from './five-period-kill.service';

@Controller('api/five-period-kill')
export class FivePeriodKillController {
  constructor(private readonly fivePeriodKillService: FivePeriodKillService) {}

  @Get()
  async getNextImpossibleNumber(
    @Query('type') type?: string,
    @Query('minSamples') minSamples?: string,
  ): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    const parsedMinSamples = minSamples ? parseInt(minSamples, 10) : 8;
    return this.fivePeriodKillService.getNextImpossibleNumber(source, parsedMinSamples);
  }
}
