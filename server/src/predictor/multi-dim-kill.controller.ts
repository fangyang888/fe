import { Controller, Get, Query } from '@nestjs/common';
import { MultiDimKillService } from './multi-dim-kill.service';

@Controller('api/kill/multi-dim')
export class MultiDimKillController {
  constructor(private readonly multiDimKillService: MultiDimKillService) {}

  /** GET /api/kill/multi-dim?type=default|hk — 和值、奇偶大小、遗漏周期多维单杀择优 */
  @Get()
  async getPrediction(@Query('type') type?: string): Promise<any> {
    const source = type === 'hk' ? 'hk' : 'default';
    return this.multiDimKillService.getPrediction(source);
  }
}
