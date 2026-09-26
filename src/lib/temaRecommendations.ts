export const TEMA_SOURCE = 'https://unspni.khale-wtg0c-nbwrcx.cyou:17455/';
const ZODIACS = '鼠牛虎兔龙蛇马羊猴鸡狗猪';

export type Recommendation = {
  year: number;
  period: number;
  hint: string;
  zodiacs: string[];
  yearInferred: boolean;
};
export type Draw = {
  year: number;
  period: number;
  number: number | null;
  zodiac: string | null;
};
export type ResultState = 'hit' | 'miss' | 'pending' | 'unknown';
export type ResultRow = Recommendation & { state: ResultState; draw: Draw | null };

function simplified(text: string): string {
  const replacements: Record<string, string> = { 龍: '龙', 雞: '鸡', 豬: '猪', 馬: '马', 碼: '码', 麼: '么', 薦: '荐' };
  return text.replace(/[龍雞豬馬碼麼薦]/g, char => replacements[char]);
}

/** Only accept period blocks explicitly labelled 什么是特码. Source highlight colors are ignored. */
export function parseRecommendationText(text: string, defaultYear: number): Recommendation[] {
  const compact = simplified(text).replace(/\s+/g, '');
  const headers = [...compact.matchAll(/(?:(20\d{2})年)?(?:第)?(\d{1,3})期[（(【『「《[：:]*什么是特码[）)】』」》\]]*/g)];
  const records = new Map<string, Recommendation>();
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    const start = header.index! + header[0].length;
    let block = compact.slice(start, headers[index + 1]?.index);
    // Never borrow a recommendation from the next period / neighbouring column.
    const nextPeriod = block.search(/(?:20\d{2}年)?(?:第)?\d{1,3}期/);
    if (nextPeriod !== -1) block = block.slice(0, nextPeriod);
    const picks = block.match(/推荐特肖[:：]?([鼠牛虎兔龙蛇马羊猴鸡狗猪、,，·.。/|\-【】[\]（）()]+)/);
    if (!picks) continue;
    const zodiacs = [...new Set(picks[1].match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g))];
    if (!zodiacs.length) continue;
    const year = header[1] ? Number(header[1]) : defaultYear;
    const period = Number(header[2]);
    if (period < 1 || period > 366) continue;
    const beforePicks = block.slice(0, picks.index);
    const hint = beforePicks.match(/[『「【《]([^』」】》]+)[』」】》]/)?.[1] ?? '';
    const record = { year, period, hint, zodiacs, yearInferred: !header[1] };
    const key = `${year}-${period}`;
    const previous = records.get(key);
    if (previous && previous.zodiacs.join('') !== zodiacs.join('')) {
      throw new Error(`来源中 ${year} 年 ${period} 期推荐存在冲突，请核对原页`);
    }
    records.set(key, record);
  }
  return [...records.values()].sort((a, b) => b.year - a.year || b.period - a.period);
}

export function parseHistoryDraws(input: unknown): Draw[] {
  if (!Array.isArray(input)) throw new Error('开奖接口返回格式错误');
  const draws = new Map<string, Draw>();
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    if (!Number.isInteger(r.year) || !Number.isInteger(r.No)) continue;
    const info = Array.isArray(r.numberInfos) && r.numberInfos.length === 7 ? r.numberInfos[6] : null;
    const number = typeof r.n7 === 'number' && Number.isInteger(r.n7) && r.n7 >= 1 && r.n7 <= 49 ? r.n7 : null;
    const zodiac = number !== null && info?.number === number && typeof info.zodiac === 'string'
      && info.zodiac.length === 1 && ZODIACS.includes(info.zodiac) ? info.zodiac : null;
    const draw = { year: r.year as number, period: r.No as number, number, zodiac };
    const key = `${draw.year}-${draw.period}`;
    const previous = draws.get(key);
    // Conflicting duplicate records must never produce a winning/losing verdict.
    draws.set(key, previous && (previous.number !== number || previous.zodiac !== zodiac)
      ? { ...draw, number: null, zodiac: null } : draw);
  }
  return [...draws.values()];
}

export function evaluateRecommendations(recommendations: Recommendation[], draws: Draw[] | null): ResultRow[] {
  const byPeriod = new Map(draws?.map(draw => [`${draw.year}-${draw.period}`, draw]));
  return recommendations.map(record => {
    const draw = byPeriod.get(`${record.year}-${record.period}`) ?? null;
    const state: ResultState = draws === null ? 'unknown' : !draw ? 'pending'
      : !draw.zodiac ? 'unknown' : record.zodiacs.includes(draw.zodiac) ? 'hit' : 'miss';
    return { ...record, state, draw };
  });
}

type CacheEntry<T> = { version: 1; savedAt: string; data: T };
const memory = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<Loaded<unknown>>>();
export type Loaded<T> = CacheEntry<T> & { cached: boolean; persistent: boolean };

/** A cache hit performs zero requests; only a successful validated response is saved. */
export async function loadCached<T>(
  key: string,
  loader: () => Promise<T>,
  valid: (value: unknown) => value is T,
  refresh = false,
): Promise<Loaded<T>> {
  let stored: CacheEntry<T> | undefined;
  let persistent = true;
  try {
    const json = localStorage.getItem(key);
    if (json) {
      const value = JSON.parse(json);
      if (value?.version === 1 && typeof value.savedAt === 'string'
        && Number.isFinite(Date.parse(value.savedAt)) && valid(value.data)) stored = value;
    }
  } catch { persistent = false; }
  const remembered = memory.get(key);
  if (!stored && remembered && valid(remembered.data)) {
    stored = remembered as CacheEntry<T>;
    persistent = false;
  }
  if (!refresh && stored) return { ...stored, cached: true, persistent };
  const running = inFlight.get(key);
  if (running) return running as Promise<Loaded<T>>;
  const request = (async () => {
    const data = await loader();
    if (!valid(data)) throw new Error('数据格式不完整，未写入缓存');
    const entry: CacheEntry<T> = { version: 1, savedAt: new Date().toISOString(), data };
    memory.set(key, entry);
    try {
      localStorage.setItem(key, JSON.stringify(entry));
      persistent = true;
    }
    catch { persistent = false; }
    return { ...entry, cached: false, persistent };
  })();
  inFlight.set(key, request);
  try { return await request; } finally { inFlight.delete(key); }
}

export function validRecommendations(value: unknown): value is Recommendation[] {
  return Array.isArray(value) && value.length > 0 && value.every(r => r && Number.isInteger(r.year)
    && r.year >= 2000 && r.year <= 2100 && Number.isInteger(r.period) && r.period > 0 && r.period <= 366
    && typeof r.hint === 'string' && typeof r.yearInferred === 'boolean' && Array.isArray(r.zodiacs)
    && r.zodiacs.length > 0 && r.zodiacs.every((z: unknown) => typeof z === 'string' && z.length === 1 && ZODIACS.includes(z)));
}

export function validDraws(value: unknown): value is Draw[] {
  return Array.isArray(value) && value.every(r => r && Number.isInteger(r.year) && Number.isInteger(r.period)
    && (r.number === null || (Number.isInteger(r.number) && r.number >= 1 && r.number <= 49))
    && (r.zodiac === null || (typeof r.zodiac === 'string' && r.zodiac.length === 1 && ZODIACS.includes(r.zodiac))));
}

async function fetchHtml(url: string): Promise<Document> {
  const response = await fetch(`/api/crawler?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`来源网页请求失败（HTTP ${response.status}），请稍后重试`);
  // DOMParser creates an inert document. Never inject source HTML into the live page.
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach(node => node.remove());
  return doc;
}

export async function fetchRecommendations(year: number): Promise<Recommendation[]> {
  const queue = [TEMA_SOURCE];
  const visited = new Set<string>();
  let failed = false;
  while (queue.length && visited.size < 8) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    let doc: Document;
    try { doc = await fetchHtml(url); }
    catch (error) {
      if (url === TEMA_SOURCE) throw error;
      failed = true;
      continue;
    }
    const records = parseRecommendationText(doc.body.textContent ?? '', year);
    if (records.length) return records;
    const links = [...doc.querySelectorAll('a[href]')]
      .filter(node => simplified(node.textContent ?? '').replace(/\s/g, '').includes('什么是特码'))
      .map(node => node.getAttribute('href'));
    const frames = [...doc.querySelectorAll('iframe[src], frame[src]')].map(node => node.getAttribute('src'));
    for (const ref of [...links, ...frames]) {
      if (!ref) continue;
      try {
        const next = new URL(ref, url);
        next.hash = '';
        if (next.origin === new URL(TEMA_SOURCE).origin && !visited.has(next.href) && !queue.includes(next.href)) queue.push(next.href);
      } catch { /* Ignore malformed source links. */ }
    }
  }
  throw new Error(failed ? '栏目子页面连接失败，请稍后重试' : '未找到“什么是特码”的推荐特肖，来源结构可能已变化');
}

export async function fetchDraws(year: number): Promise<Draw[]> {
  const response = await fetch(`/api/history?year=${year}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`开奖数据请求失败（HTTP ${response.status}）`);
  return parseHistoryDraws(await response.json());
}
