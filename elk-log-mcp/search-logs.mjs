import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { buildLogQuery } from './lib/log-query.mjs';
import { KIBANA_URL, searchLogs } from './lib/kibana-query.mjs';

let browser;
let terminal;

try {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      limit: { type: 'string', default: '10' },
      range: { type: 'string', default: 'last_15m' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log('用法：pnpm run query:logs --host api.example.com [--limit 10] [--range last_15m|last_1h|last_24h|today|yesterday]');
    console.log('查询 logstash-* 中该域名指定范围的 HTTP 5xx，最多输出 50 条白名单字段样本。');
  } else {
    const query = buildLogQuery({ host: values.host, limit: Number(values.limit), range: values.range });
    if (!stdin.isTTY) throw new Error('当前是手动登录验证阶段，请在交互式终端运行。');
    terminal = createInterface({ input: stdin, output: stdout });
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(KIBANA_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    console.log('待执行的 KQL：', query.kql);
    await terminal.question(
      '请手动登录并进入 Discover，选择 logstash-* 和默认 _source 表格；\n' +
      '查询时间范围会根据 --range 自动设置。清空旧查询和筛选，关闭自动刷新，等待页面加载完成，按回车开始。\n',
    );

    const result = await searchLogs(page, { host: query.host, limit: query.limit, range: query.range });
    console.log(JSON.stringify(result, null, 2));
    await terminal.question('查询完成，按回车关闭本次查询浏览器。\n');
  }
} catch (error) {
  console.error('日志查询失败：', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  terminal?.close();
  await browser?.close();
}
