import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { loadSpider } from '../common/spider-loader';

@Injectable()
export class CrawlerService {
  async fetchUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
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
      const buffer = await response.arrayBuffer();
      const headerCharset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
      const prefix = new TextDecoder('ascii').decode(buffer.slice(0, 4096));
      const metaCharset = prefix.match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1];
      return new TextDecoder(headerCharset || metaCharset || 'utf-8').decode(buffer);
    } catch (error) {
      throw new HttpException(
        `Crawler failed to fetch ${url}: ${(error as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async fetchLotteryYear(year: number) {
    try {
      // Keep the legacy spider.js as the single source for parsing this site.
      const spider = loadSpider();
      return await spider.fetchLotteryData(year);
    } catch (error) {
      throw new HttpException(
        `Lottery spider failed for ${year}: ${(error as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
