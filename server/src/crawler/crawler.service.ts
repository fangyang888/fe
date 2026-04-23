import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class CrawlerService {
  async fetchUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      throw new HttpException(
        `Crawler failed to fetch ${url}: ${(error as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
