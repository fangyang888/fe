import {
  buildLogQuery,
  buildLogResult,
  buildPathVisitQuery,
  buildPathVisitResult,
  LOG_FIELDS,
  VISIT_LOG_FIELDS,
} from './log-query.mjs';
import { ToolError } from './tool-error.mjs';

export const KIBANA_URL = 'https://elklog-ops.meiyou.com/app/home#/';

// 这些 data-test-subj 均来自当前 Kibana Discover 页面。
export const QUERY_INPUT = '[data-test-subj="queryInput"]';

const RANGE_LABELS = Object.freeze({
  'Last 15 minutes': ['Last 15 minutes', '最近 15 分钟'],
  'Last 1 hour': ['Last 1 hour', '最近 1 小时'],
  'Last 24 hours': ['Last 24 hours', '最近 24 小时'],
  Today: ['Today', '今天'],
  Yesterday: ['Yesterday', '昨天'],
});

async function setTimeRange(page, query) {
  const picker = page.locator('[data-test-subj="superDatePickerShowDatesButton"]');
  if (!(await picker.isVisible())) throw new ToolError('Kibana 时间选择器不可见，请确认当前位于 Discover。', 'QUERY_PRECONDITION');
  const labels = RANGE_LABELS[query.rangeLabel] ?? [query.rangeLabel];
  const current = await picker.innerText();
  if (labels.some((label) => current.includes(label))) return;

  await picker.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  let target;
  for (const label of labels) {
    const button = dialog.getByRole('button', { name: label, exact: true }).first();
    if (await button.count() && await button.isVisible()) {
      target = button;
      break;
    }
    const text = dialog.getByText(label, { exact: true }).first();
    if (await text.count() && await text.isVisible()) {
      target = text;
      break;
    }
  }
  if (!target) {
    await dialog.press('Escape').catch(() => {});
    throw new ToolError(`无法在 Kibana 时间选择器中找到“${query.rangeLabel}”，请检查页面版本。`, 'UNSUPPORTED_LAYOUT');
  }
  await target.click();
  await page.waitForFunction(({ selector, labels: expected }) => {
    const value = document.querySelector(selector)?.textContent ?? '';
    return expected.some((label) => value.includes(label));
  }, { selector: '[data-test-subj="superDatePickerShowDatesButton"]', labels }, { timeout: 10_000 });
}

// 此函数在浏览器内执行。仅观察 DOM，不读取 Cookie、存储或隐藏应用状态。
// 返回 false 表示还不能确认本次查询已完成，而不是“零条结果”。
export function readDiscoverResult({ previousCounter, kql, fields, limit }) {
  const readTotalHits = () => {
    const selectors = [
      '[data-test-subj="discoverQueryHits"]',
      '[data-test-subj="queryHits"]',
      '[data-test-subj="discoverTotalHits"]',
    ];
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim() ?? '';
      const match = text.match(/(?:^|\s)(\d[\d,]*)\s*(?:hits?|results?|条|个)?(?:\s|$)/i);
      if (match) return Number(match[1].replaceAll(',', ''));
    }
    return null;
  };
  const visible = (element) => Boolean(element?.getClientRects().length);
  const counterText = document.querySelector('[data-fetch-counter]')?.getAttribute('data-fetch-counter');
  if (!/^\d+$/.test(counterText ?? '') || Number(counterText) <= previousCounter) return false;
  if (document.querySelector('[data-test-subj="queryInput"]')?.value !== kql) return false;
  if (visible(document.querySelector('[data-test-subj="loadingSpinner"]'))) return false;

  // 有明确错误时不继续读取旧表格，也不返回空结果。
  if (Array.from(document.querySelectorAll('.euiCallOut--danger')).some(visible)) {
    return { state: 'error' };
  }

  if (visible(document.querySelector('[data-test-subj="discoverNoResults"]'))) {
    return { state: 'empty', records: [], renderedRows: 0 };
  }

  const container = document.querySelector('[data-test-subj="discoverDocTable"]');
  const table = document.querySelector('[data-test-subj="docTable"]');
  if (!visible(table) || container?.getAttribute('data-render-complete') !== 'true') return false;
  if (table.parentElement?.classList.contains('loading')) return false;

  const rows = Array.from(table.querySelectorAll('[data-test-subj="docTableRow"]'));
  if (!rows.length) return false;
  const allowed = new Set(fields);
  const records = rows.slice(0, limit).map((row) => {
    const record = {};
    for (const term of row.querySelectorAll('dt')) {
      const name = term.textContent.trim().replace(/:$/, '');
      // 在浏览器内先做白名单：连未允许字段的值都不读取。
      if (allowed.has(name) && term.nextElementSibling?.tagName === 'DD') {
        record[name] = term.nextElementSibling.textContent.trim().slice(0, 300);
      }
    }
    return record;
  });
  const totalHits = readTotalHits();
  return totalHits === null
    ? { state: 'results', records, renderedRows: rows.length }
    : { state: 'results', records, renderedRows: rows.length, totalHits };
}

export async function searchLogs(page, options, { previousQuery = '', onQueryChanged = () => {} } = {}) {
  const query = buildLogQuery(options);
  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== new URL(KIBANA_URL).origin || currentUrl.pathname !== '/app/discover') {
    throw new ToolError('请先在指定 Kibana 网站手动登录并进入 Discover。');
  }
  if (await page.getByRole('dialog').count()) {
    throw new ToolError('Discover 页面仍有弹出菜单或对话框，请先关闭后再执行查询。');
  }

  const input = page.locator(QUERY_INPUT);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  const dataView = await page.locator('[data-test-subj="indexPattern-switch-link"]').innerText();
  if (dataView.trim() !== query.dataView) {
    throw new ToolError('第一版仅支持 logstash-*，请手动选择该数据视图。');
  }
  const language = await page.locator('[data-test-subj="switchQueryLanguageButton"]').innerText();
  if (language.trim() !== 'KQL') throw new ToolError('请先将查询语言切换为 KQL。');

  // 第一版要求清晰、可核验的初始状态，避免继承额外条件造成误判。
  await setTimeRange(page, query);
  const initialQuery = await input.inputValue();
  if (initialQuery.trim() && initialQuery !== previousQuery) {
    throw new ToolError('请先清空旧查询并点击更新；只允许自动替换本会话上次提交的查询，避免覆盖手动查询。');
  }
  if (await page.locator('[data-test-subj~="filter"]').count()) {
    throw new ToolError('请先移除已有的筛选标签，再运行本次查询。');
  }
  const selectedFields = await page.getByRole('list', { name: '选定字段', exact: true }).innerText();
  if (selectedFields.trim() !== '_source') {
    throw new ToolError('第一版需要默认 _source 表格，请先恢复选定字段为 _source。');
  }

  // 自动刷新可能使计数器变化与本次提交混淆，因此必须确认它未启动。
  await page.getByRole('button', { name: 'Date quick select', exact: true }).click();
  const dateDialog = page.getByRole('dialog');
  await dateDialog.waitFor({ state: 'visible', timeout: 10_000 });
  try {
    if (!(await dateDialog.getByRole('button', { name: '启动', exact: true }).isVisible())) {
      throw new ToolError('请先关闭自动刷新；当前无法确认刷新已停止。');
    }
  } finally {
    await dateDialog.press('Escape');
    // EUI 的关闭动画结束前，页面仍可能处于不可交互状态。
    // 仅等待 CSS 可见不足以保证输入可用，还要等菜单退出、查询框恢复可访问性。
    await dateDialog.waitFor({ state: 'hidden', timeout: 5_000 });
    await page.getByRole('textbox', {
      name: '开始键入内容，以搜索并筛选 discover 页面',
      exact: true,
    }).waitFor({ state: 'visible', timeout: 5_000 });
  }

  // 先等待初始查询完成，避免把登录后尚未结束的那次查询当作本次结果。
  const initial = await page.waitForFunction(readDiscoverResult, {
    previousCounter: -1,
    kql: initialQuery,
    fields: [],
    limit: 1,
  }, { timeout: 30_000 });
  try {
    if ((await initial.jsonValue()).state === 'error') {
      throw new ToolError('初始 Discover 页面存在查询错误，请先处理后再运行。');
    }
  } finally {
    await initial.dispose();
  }

  const previousCounterText = await page.locator('[data-fetch-counter]').getAttribute('data-fetch-counter');
  if (!/^\d+$/.test(previousCounterText ?? '')) {
    throw new ToolError('无法识别当前 Discover 的查询完成标记，请勿将此页面当作已支持版本。');
  }

  if ((await input.inputValue()) !== initialQuery) {
    throw new ToolError('等待期间查询框发生变化，已停止操作；查询运行时请不要手动操作页面。');
  }
  await input.fill(query.kql);
  if ((await input.inputValue()) !== query.kql) throw new ToolError('查询框未接受完整查询，已停止提交。');
  onQueryChanged(query.kql);
  await page.locator('[data-test-subj="querySubmitButton"]').click({ timeout: 10_000 });

  let handle;
  try {
    handle = await page.waitForFunction(readDiscoverResult, {
      previousCounter: Number(previousCounterText),
      kql: query.kql,
      fields: LOG_FIELDS,
      limit: query.limit,
    }, { timeout: 30_000 });
    return buildLogResult(await handle.jsonValue(), query);
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new ToolError('30 秒内未确认新查询完成。可能仍在加载、登录已失效或页面结构变化；不视为零条结果。', 'QUERY_TIMEOUT');
    }
    throw error;
  } finally {
    await handle?.dispose();
  }
}

export async function countPathVisits(page, options, { previousQuery = '', onQueryChanged = () => {} } = {}) {
  const query = buildPathVisitQuery(options);
  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== new URL(KIBANA_URL).origin || currentUrl.pathname !== '/app/discover') {
    throw new ToolError('请先在指定 Kibana 网站手动登录并进入 Discover。');
  }
  if (await page.getByRole('dialog').count()) {
    throw new ToolError('Discover 页面仍有弹出菜单或对话框，请先关闭后再执行查询。');
  }

  const input = page.locator(QUERY_INPUT);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  const dataView = await page.locator('[data-test-subj="indexPattern-switch-link"]').innerText();
  if (dataView.trim() !== query.dataView) throw new ToolError('第一版仅支持 logstash-*，请手动选择该数据视图。');
  const language = await page.locator('[data-test-subj="switchQueryLanguageButton"]').innerText();
  if (language.trim() !== 'KQL') throw new ToolError('请先将查询语言切换为 KQL。');

  await setTimeRange(page, query);
  const initialQuery = await input.inputValue();
  if (initialQuery.trim() && initialQuery !== previousQuery) {
    throw new ToolError('请先清空旧查询并点击更新；只允许自动替换本会话上次提交的查询。');
  }
  if (await page.locator('[data-test-subj~="filter"]').count()) {
    throw new ToolError('请先移除已有的筛选标签，再运行本次查询。');
  }
  const selectedFields = await page.getByRole('list', { name: '选定字段', exact: true }).innerText();
  if (selectedFields.trim() !== '_source') throw new ToolError('第一版需要默认 _source 表格，请先恢复选定字段为 _source。');

  await page.getByRole('button', { name: 'Date quick select', exact: true }).click();
  const dateDialog = page.getByRole('dialog');
  await dateDialog.waitFor({ state: 'visible', timeout: 10_000 });
  try {
    if (!(await dateDialog.getByRole('button', { name: '启动', exact: true }).isVisible())) {
      throw new ToolError('请先关闭自动刷新；当前无法确认刷新已停止。');
    }
  } finally {
    await dateDialog.press('Escape');
    await dateDialog.waitFor({ state: 'hidden', timeout: 5_000 });
    await page.getByRole('textbox', {
      name: '开始键入内容，以搜索并筛选 discover 页面',
      exact: true,
    }).waitFor({ state: 'visible', timeout: 5_000 });
  }

  const initial = await page.waitForFunction(readDiscoverResult, {
    previousCounter: -1,
    kql: initialQuery,
    fields: [],
    limit: 1,
  }, { timeout: 30_000 });
  try {
    if ((await initial.jsonValue()).state === 'error') throw new ToolError('初始 Discover 页面存在查询错误，请先处理后再运行。');
  } finally {
    await initial.dispose();
  }

  const previousCounterText = await page.locator('[data-fetch-counter]').getAttribute('data-fetch-counter');
  if (!/^\d+$/.test(previousCounterText ?? '')) throw new ToolError('无法识别当前 Discover 的查询完成标记。');
  if ((await input.inputValue()) !== initialQuery) throw new ToolError('等待期间查询框发生变化，已停止操作。');
  await input.fill(query.kql);
  if ((await input.inputValue()) !== query.kql) throw new ToolError('查询框未接受完整查询，已停止提交。');
  onQueryChanged(query.kql);
  await page.locator('[data-test-subj="querySubmitButton"]').click({ timeout: 10_000 });

  let handle;
  try {
    handle = await page.waitForFunction(readDiscoverResult, {
      previousCounter: Number(previousCounterText),
      kql: query.kql,
      fields: VISIT_LOG_FIELDS,
      limit: query.limit,
    }, { timeout: 30_000 });
    return buildPathVisitResult(await handle.jsonValue(), query);
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new ToolError('30 秒内未确认新查询完成，不视为零条访问量。', 'QUERY_TIMEOUT');
    throw error;
  } finally {
    await handle?.dispose();
  }
}
