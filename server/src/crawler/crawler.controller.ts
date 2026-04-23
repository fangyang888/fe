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
}
