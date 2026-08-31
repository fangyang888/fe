import { ToolError } from './tool-error.mjs';

// 查询条件固定为：指定域名、受限时间范围、HTTP 5xx。
// 暂不接受任意 KQL、任意索引或任意输出字段。
export const LOG_FIELDS = Object.freeze([
  '@timestamp',
  'http_Host',
  'method',
  'status',
  'request_time',
  'upstream_response_time',
]);

export const VISIT_LOG_FIELDS = Object.freeze([
  '@timestamp',
  'http_Host',
  'url_path',
  'method',
  'status',
]);

export const TIME_RANGES = Object.freeze({
  last_15m: { label: 'Last 15 minutes', from: 'now-15m', to: 'now' },
  last_1h: { label: 'Last 1 hour', from: 'now-1h', to: 'now' },
  last_24h: { label: 'Last 24 hours', from: 'now-24h', to: 'now' },
  today: { label: 'Today', from: 'now/d', to: 'now' },
  yesterday: { label: 'Yesterday', from: 'now-1d/d', to: 'now/d' },
});

function validatePath(value) {
  const path = typeof value === 'string' ? value.trim() : '';
  if (!/^\/[^\s"'<>]{0,2047}$/.test(path)) {
    throw new ToolError('url_path 必须是以 / 开头的路径，不能包含空白、引号或尖括号。', 'INVALID_QUERY');
  }
  return path;
}

export function buildLogQuery({ host, limit = 10, range = 'last_15m' } = {}) {
  const domain = typeof host === 'string' ? host.trim().toLowerCase() : '';
  const labels = domain.split('.');
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new ToolError('host（CLI: --host）必须是具体域名，不要带协议、端口、路径或通配符。', 'INVALID_QUERY');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ToolError('limit（CLI: --limit）必须是 1 到 50 之间的整数。', 'INVALID_QUERY');
  }
  const selectedRange = TIME_RANGES[range];
  if (!selectedRange) throw new ToolError('range 只支持 last_15m、last_1h、last_24h、today 或 yesterday。', 'INVALID_QUERY');

  return {
    host: domain,
    limit,
    range,
    rangeLabel: selectedRange.label,
    dataView: 'logstash-*',
    timeRange: { from: selectedRange.from, to: selectedRange.to },
    kql: [
      `http_Host: "${domain}"`,
      `@timestamp >= ${selectedRange.from}`,
      `@timestamp <= ${selectedRange.to}`,
      'status >= 500',
      'status < 600',
    ].join(' and '),
  };
}

export function buildPathVisitQuery({ host, hosts = [], url_path, range = 'today', limit = 500 } = {}) {
  const explicitHost = typeof host === 'string' && host.trim() ? host : '';
  const domains = explicitHost
    ? [buildLogQuery({ host: explicitHost, limit: 1 }).host]
    : [...new Set((Array.isArray(hosts) ? hosts : []).map((item) => buildLogQuery({ host: item, limit: 1 }).host))];
  const path = validatePath(url_path);
  const selectedRange = TIME_RANGES[range];
  if (!selectedRange) {
    throw new ToolError('range 只支持 last_15m、last_1h、last_24h、today 或 yesterday。', 'INVALID_QUERY');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ToolError('limit 必须是 1 到 500 之间的整数。', 'INVALID_QUERY');
  }

  const timeRange = { from: selectedRange.from, to: selectedRange.to };
  const hostClause = domains.length === 0
    ? []
    : [domains.length === 1
      ? `http_Host: "${domains[0]}"`
      : `(${domains.map((domain) => `http_Host: "${domain}"`).join(' or ')})`];
  return {
    host: domains.length === 1 ? domains[0] : null,
    hosts: domains,
    url_path: path,
    range,
    rangeLabel: selectedRange.label,
    limit,
    dataView: 'logstash-*',
    timeRange,
    kql: hostClause.concat([`url_path: "${path}"`], [
      `@timestamp >= ${selectedRange.from}`,
      `@timestamp <= ${selectedRange.to}`,
    ])
      .join(' and '),
  };
}

function duration(value) {
  // 不猜测单位；多段上游耗时、缺失值和非数字内容暂不输出。
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestamp(value) {
  if (typeof value !== 'string') return null;
  const englishDate = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4} @ \d{2}:\d{2}:\d{2}\.\d{3}$/;
  const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return englishDate.test(value) || isoDate.test(value) ? value : null;
}

export function buildLogResult(snapshot, query) {
  if (!['results', 'empty'].includes(snapshot?.state)) {
    throw new ToolError('未确认查询成功，不将加载失败或未知页面当作零条结果。', 'QUERY_FAILED');
  }

  const logs = snapshot.state === 'empty' ? [] : snapshot.records.slice(0, query.limit).map((record) => {
    const host = String(record.http_Host ?? '').toLowerCase();
    const status = /^5\d{2}$/.test(String(record.status)) ? Number(record.status) : null;
    if (host !== query.host || status === null) {
      throw new ToolError('结果域名或状态码与查询条件不符，已停止输出，请检查页面筛选和字段映射。', 'RESULT_MISMATCH');
    }

    // 即使上游传入完整 _source，也不会把未列出的字段扩散到输出。
    return {
      '@timestamp': timestamp(record['@timestamp']),
      http_Host: host,
      method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)$/.test(record.method)
        ? record.method : null,
      status,
      request_time: duration(record.request_time),
      upstream_response_time: duration(record.upstream_response_time),
    };
  });

  if (snapshot.state === 'results' && logs.length === 0) {
    throw new ToolError('页面显示有结果，但无法提取 _source 字段；请检查表格布局。', 'UNSUPPORTED_LAYOUT');
  }

  return {
    query,
    returnedCount: logs.length,
    totalMatches: snapshot.state === 'empty' ? 0 : null,
    truncated: snapshot.state === 'empty' ? false : snapshot.renderedRows > query.limit ? true : null,
    scope: 'visible_page_sample',
    durationUnit: 'unverified',
    warnings: [
      '仅提取当前已渲染页面的有限样本，不代表全部日志，不能据此计算全量错误率。',
      '不输出用户标识、IP、认证头、请求体、原始消息或可能含标识信息的 URL 路径。',
      '时间沿用页面显示格式，耗时沿用原字段数值；时区和单位需另行核实。',
    ],
    logs,
  };
}

export function buildPathVisitResult(snapshot, query) {
  if (!['results', 'empty'].includes(snapshot?.state)) {
    throw new ToolError('未确认查询成功，不将加载失败或未知页面当作零条访问量。', 'QUERY_FAILED');
  }
  if (snapshot.state === 'empty') {
    return {
      query,
      count: 0,
      exact: true,
      scope: 'matching_documents',
      warnings: [],
    };
  }

  const totalHits = Number.isSafeInteger(snapshot.totalHits) && snapshot.totalHits >= 0
    ? snapshot.totalHits
    : null;
  const sampleCount = Array.isArray(snapshot.records) ? snapshot.records.length : 0;
  const count = totalHits ?? sampleCount;
  return {
    query,
    count,
    exact: totalHits !== null,
    scope: totalHits === null ? 'visible_page_sample' : 'matching_documents',
    sampleCount,
    warnings: totalHits === null
      ? ['当前 Kibana 页面未提供可读取的命中总数，count 仅为当前已渲染页面样本，不代表全量访问量。']
      : [],
  };
}
