import { Controller, Get, Query } from '@nestjs/common';
import { StockService } from './stock.service';

@Controller('api/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /** GET /api/stock/health */
  @Get('health')
  health(): Promise<unknown> {
    return this.stockService.getHealth();
  }

  /** GET /api/stock/analyze?query=600519 */
  @Get('analyze')
  analyze(@Query('query') query?: string): Promise<unknown> {
    return this.stockService.analyze(query);
  }

  /** GET /api/stock/quotes?codes=600519,600733 */
  @Get('quotes')
  quotes(@Query('codes') codes?: string): Promise<unknown> {
    return this.stockService.getQuotes(codes);
  }

  /** GET /api/stock/picks?limit=10&refresh=1 */
  @Get('picks')
  picks(
    @Query('limit') limit?: string,
    @Query('refresh') refresh?: string,
  ): Promise<unknown> {
    return this.stockService.getPicks(limit, refresh);
  }
}
