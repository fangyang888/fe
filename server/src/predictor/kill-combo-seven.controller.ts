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

  /** GET /api/kill/combo-seven/strict — 每一期都重新选择 98/99 策略的严格滚动回测 */
  @Get('strict')
  getComboSevenStrict(): Promise<any> {
    return this.killComboSevenService.getComboSevenStrict();
  }

  /** GET /api/kill/combo-seven/stable-five — 面向三连中的稳健 5 杀 */
  @Get('stable-five')
  getStableFive(): Promise<any> {
    return this.killComboSevenService.getStableFive();
  }
}
