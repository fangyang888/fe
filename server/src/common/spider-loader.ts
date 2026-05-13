import { existsSync } from 'fs';
import { join, resolve } from 'path';

export function loadSpider() {
  const candidates = [
    process.env.SPIDER_PATH ? resolve(process.env.SPIDER_PATH) : undefined,
    join(process.cwd(), 'spider.js'),
    join(process.cwd(), 'server', 'spider.js'),
    join(process.cwd(), 'dist', 'spider.js'),
    join(__dirname, '..', '..', 'spider.js'),
    join(__dirname, '..', '..', '..', 'spider.js'),
  ].filter((path): path is string => Boolean(path));

  const spiderPath = candidates.find((path) => existsSync(path));
  if (!spiderPath) {
    throw new Error(`找不到 spider.js，已尝试：${candidates.join(', ')}`);
  }

  delete require.cache[require.resolve(spiderPath)];
  return require(spiderPath);
}
