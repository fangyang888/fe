import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIBANA_URL, QUERY_INPUT, countPathVisits, searchLogs } from './kibana-query.mjs';
import { buildLogQuery, buildPathVisitQuery } from './log-query.mjs';
import { ToolError } from './tool-error.mjs';

export const SETUP_INSTRUCTIONS = '在 MCP 打开的窗口中手动登录，进入 Discover，选择 logstash-* / KQL / 默认 _source；时间范围会根据问题由工具自动设置（支持最近 15 分钟、最近 1 小时、最近 24 小时、今天和昨天）；清空旧查询和筛选标签，停止自动刷新，点击更新并关闭弹出菜单。查询期间不要手动操作页面。';
export const DEFAULT_PROFILE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'browser-profile',
  'kibana',
);

function getProfileDir() {
  const configured = process.env.ELK_MCP_PROFILE_DIR?.trim();
  return configured ? path.resolve(configured) : DEFAULT_PROFILE_DIR;
}

function launchPersistentBrowser() {
  const profileDir = getProfileDir();
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    timeout: 30_000,
  });
}

// 一个本地 MCP 进程拥有独立的持久化浏览器配置，不读取日常 Chrome 的登录状态。
export class KibanaSession {
  constructor({ launchBrowser = launchPersistentBrowser,
    queryLogs = searchLogs, operationTimeoutMs = 90_000 } = {}) {
    this.launchBrowser = launchBrowser;
    this.queryLogs = queryLogs;
    this.operationTimeoutMs = operationTimeoutMs;
    this.previousQuery = '';
    this.stopped = false;
  }

  browserConnected() {
    if (!this.browser) return false;
    if (typeof this.browser.isConnected === 'function') return this.browser.isConnected();
    const browser = typeof this.browser.browser === 'function' ? this.browser.browser() : undefined;
    return browser ? browser.isConnected() : true;
  }

  hasPage() {
    return Boolean(this.browserConnected() && this.page && !this.page.isClosed());
  }

  async disposeBrowser() {
    const browser = this.browser;
    this.browser = undefined;
    this.page = undefined;
    this.previousQuery = '';
    await browser?.close();
  }

  async run(action, signal) {
    if (this.stopped) throw new ToolError('MCP 会话已关闭，请重新连接服务。', 'SESSION_CLOSED');
    if (this.pending) throw new ToolError('浏览器正在处理另一个请求，请稍后重试。', 'BUSY');
    if (signal?.aborted) throw new ToolError('请求已取消。', 'CANCELLED');
    let interrupted;
    let cleanup;
    const interrupt = (code) => {
      interrupted ??= new ToolError(
        code === 'CANCELLED' ? '请求已取消；本服务浏览器已关闭，下一次查询需要重新登录。'
          : '浏览器操作超时；本服务浏览器已关闭，不将超时视为零条结果。', code);
      // 关闭本进程拥有的浏览器，中断 Playwright 等待；不触碰用户其他窗口。
      cleanup ??= this.disposeBrowser().catch(() => {});
    };
    const onAbort = () => interrupt('CANCELLED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => interrupt('OPERATION_TIMEOUT'), this.operationTimeoutMs);
    const checkActive = () => {
      if (interrupted) throw interrupted;
      if (this.stopped) throw new ToolError('MCP 会话已关闭。', 'SESSION_CLOSED');
    };
    // 推迟一个微任务执行，先持有锁，避免两个调用同时打开浏览器。
    const pending = Promise.resolve().then(() => action(checkActive));
    this.pending = pending;
    try {
      const result = await pending;
      checkActive();
      return result;
    } catch (error) {
      throw interrupted ?? error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      await cleanup;
      this.pending = undefined;
    }
  }

  async inspect() {
    if (!this.hasPage()) return { state: 'not_open', nextStep: '调用 open_kibana 打开独立浏览器。' };
    const url = new URL(this.page.url());
    const discover = url.origin === new URL(KIBANA_URL).origin && url.pathname === '/app/discover';
    const available = discover && await this.page.locator(QUERY_INPUT).isVisible();
    return {
      state: available ? 'discover_available' : 'needs_login_or_setup',
      // 查询框可见并不代表认证有效或所有前置条件均满足，查询时还会完整校验。
      nextStep: SETUP_INSTRUCTIONS,
      authenticationVerified: false,
      persistentLogin: true,
    };
  }

  async status(signal) {
    if (this.pending) return { state: 'busy', nextStep: '等待当前操作完成，不要同时修改页面。' };
    return this.run(() => this.inspect(), signal);
  }

  async open(signal) {
    return this.run(async (checkActive) => {
      if (!this.hasPage()) {
        await this.disposeBrowser();
        checkActive();
        const browser = await this.launchBrowser();
        // 启动过程中也可能收到取消或进程退出，不能留下迟到的浏览器。
        try { checkActive(); } catch (error) { await browser.close(); throw error; }
        this.browser = browser;
        try {
          this.page = await browser.newPage();
          this.page.setDefaultTimeout(10_000);
          await this.page.goto(KIBANA_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          checkActive();
        } catch (error) {
          await this.disposeBrowser();
          throw error;
        }
      }
      return this.inspect();
    }, signal);
  }

  async search(options, signal) {
    const query = buildLogQuery(options);
    return this.run(async () => {
      if (!this.hasPage()) {
        throw new ToolError('请先调用 open_kibana，并在弹出的窗口中手动登录和进入 Discover。', 'NOT_OPEN');
      }
      return this.queryLogs(this.page, query, {
        previousQuery: this.previousQuery,
        onQueryChanged: (kql) => { this.previousQuery = kql; },
      });
    }, signal);
  }

  async countPathVisits(options, signal) {
    const query = buildPathVisitQuery(options);
    return this.run(async () => {
      if (!this.hasPage()) {
        throw new ToolError('请先调用 open_kibana，并在弹出的窗口中手动登录和进入 Discover。', 'NOT_OPEN');
      }
      return countPathVisits(this.page, query, {
        previousQuery: this.previousQuery,
        onQueryChanged: (kql) => { this.previousQuery = kql; },
      });
    }, signal);
  }

  async close() {
    this.stopped = true;
    await this.disposeBrowser();
    await this.pending?.catch(() => {});
    await this.disposeBrowser();
  }
}
