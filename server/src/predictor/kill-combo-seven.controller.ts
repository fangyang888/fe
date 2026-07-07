import { Controller, Get, Query } from '@nestjs/common';
import { KillComboSevenService } from './kill-combo-seven.service';

@Controller('api/kill/combo-seven')
export class KillComboSevenController {
  constructor(private readonly killComboSevenService: KillComboSevenService) {}

  /** GET /api/kill/combo-seven?count=10 — 四页实验组合 7 杀滚动回测 */
  @Get()
  getComboSeven(@Query('count') count?: string): Promise<any> {
    return this.killComboSevenService.getComboSeven(count ? parseInt(count, 10) : 10);
  }
}
