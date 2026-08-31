import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// 当前仅验证页面连接，不保存登录状态，也不读取或导出日志正文。
const kibanaUrl = 'https://elklog-ops.meiyou.com/app/home#/';
const terminal = createInterface({ input: stdin, output: stdout });
let browser;

try {
  if (!stdin.isTTY) {
    throw new Error('请在交互式终端运行 npm run check:kibana，以便手动确认登录。');
  }

  browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(kibanaUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await terminal.question(
    '请在打开的浏览器中手动登录并进入 Discover，然后回到终端按回车。\n',
  );

  // 此名称来自当前 Kibana 中文页面；页面语言或版本变化时需要重新确认。
  const searchBox = page.getByRole('textbox', {
    name: '开始键入内容，以搜索并筛选 discover 页面',
    exact: true,
  });

  if (!(await searchBox.isVisible())) {
    throw new Error(
      '未找到 Discover 日志查询框。请确认已经登录、进入 Discover，且页面已加载完成。',
    );
  }

  console.log('页面标题：', await page.title());
  console.log('找到日志查询框：true');
  await terminal.question('检查完成，按回车关闭本次验证浏览器。\n');
} catch (error) {
  console.error(
    'Kibana 连接验证失败：',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  terminal.close();
  await browser?.close();
}
