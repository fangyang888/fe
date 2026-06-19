import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface SearchOptions {
  count: number;
  a: string;
  b: string;
}

@Injectable()
export class KillComboBacktestService {
  private readonly memoryCache = new Map<string, any>();

  async search(options: SearchOptions, forceRefresh = false) {
    const cacheKey = this.getCacheKey(options);
    const cached = this.memoryCache.get(cacheKey);
    if (cached && !forceRefresh) {
      return {
        ...cached,
        cacheMeta: {
          ...(cached.cacheMeta || {}),
          hit: true,
          store: 'memory',
          key: cacheKey,
        },
      };
    }

    const response = await this.runScript(options);
    const cachedResponse = {
      ...response,
      cacheMeta: {
        hit: false,
        store: 'memory',
        key: cacheKey,
        generatedAt: new Date().toISOString(),
      },
    };
    this.memoryCache.set(cacheKey, cachedResponse);
    return cachedResponse;
  }

  async refresh(options: SearchOptions) {
    const cacheKey = this.getCacheKey(options);
    const deletedBeforeRefresh = this.memoryCache.delete(cacheKey);
    const response = await this.search(options, true);
    return {
      ...response,
      cacheMeta: {
        ...(response.cacheMeta || {}),
        action: 'refreshed',
        deletedBeforeRefresh,
      },
    };
  }

  private getCacheKey(options: SearchOptions) {
    return `kill-combo:${options.count}:${options.a.toUpperCase()}:${options.b.toUpperCase()}`;
  }

  private async runScript(options: SearchOptions) {
    const scriptPath = join(process.cwd(), 'scripts', 'kill-combo-backtest.cjs');

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          scriptPath,
          '--count',
          String(options.count),
          '--a',
          options.a.toUpperCase(),
          '--b',
          options.b.toUpperCase(),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DB_HOST: process.env.DB_HOST || '127.0.0.1',
            NODE_PATH: join(process.cwd(), 'node_modules'),
          },
          maxBuffer: 20 * 1024 * 1024,
          timeout: 40 * 60 * 1000,
        },
      );

      return JSON.parse(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`组合回测失败：${message}`);
    }
  }
}
