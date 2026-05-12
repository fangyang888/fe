import { Controller, Get, Query, BadRequestException, Header } from '@nestjs/common';
import { CrawlerService } from './crawler.service';

@Controller('api/crawler')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getPageContent(@Query('url') url: string): Promise<string> {
    if (!url) {
      throw new BadRequestException('Query parameter "url" is required. Example: /api/crawler?url=https://example.com');
    }
    const html = await this.crawlerService.fetchUrl(url);
    return html;
  }

  @Get('lottery')
  async getLotteryYear(@Query('year') year: string) {
    const yearNum = parseInt(year, 10);
    if (!Number.isInteger(yearNum)) {
      throw new BadRequestException('Query parameter "year" is required. Example: /api/crawler/lottery?year=2026');
    }
    const records = await this.crawlerService.fetchLotteryYear(yearNum);
    return {
      year: yearNum,
      count: records.length,
      records,
    };
  }
}
