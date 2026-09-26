import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateRecommendations, loadCached, parseHistoryDraws, parseRecommendationText,
  validRecommendations,
} from './temaRecommendations';

const sample = `42054a.com『什么是特码』
268期（什么是特码）『菜园中有特码』 ➢➢推荐特肖:猪猴蛇羊鼠虎鸡狗牛
267期（什么是特码）『恐龙是特码』 ➢➢推荐特肖:虎羊猪蛇龙猴兔狗牛
266期（什么是特码）『月亮有特码』 ➢➢推荐特肖:龙兔蛇猪牛鼠虎鸡羊`;
const recs = () => parseRecommendationText(sample, 2026);
function history(period: number, zodiac: string, year = 2026) {
  return { year, No: period, n7: 25, numberInfos: [
    ...Array.from({ length: 6 }, () => ({ number: 1, zodiac: '猪' })),
    { number: 25, zodiac },
  ] };
}

afterEach(() => vi.unstubAllGlobals());

describe('什么是特码 recommendations', () => {
  it('parses screenshot text into separate periods and deduplicated zodiacs', () => {
    const rows = recs();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ year: 2026, period: 268, hint: '菜园中有特码', zodiacs: [...'猪猴蛇羊鼠虎鸡狗牛'], yearInferred: true });
    expect(rows[2].zodiacs).toEqual([...'龙兔蛇猪牛鼠虎鸡羊']);
    expect(validRecommendations(rows)).toBe(true);
  });
  it('ignores other columns and never borrows picks from the following period', () => {
    expect(parseRecommendationText('268期（什么是特码）暂无 267期（其他资料）推荐特肖:鼠牛', 2026)).toEqual([]);
    expect(parseRecommendationText('268期（其他资料）推荐特肖:鼠牛', 2026)).toEqual([]);
  });
  it('honors explicit years, normalizes traditional text and rejects conflicting recommendations', () => {
    expect(parseRecommendationText('2025年第001期（什麼是特碼）推薦特肖：龍、雞、豬', 2026)[0])
      .toMatchObject({ year: 2025, period: 1, yearInferred: false, zodiacs: ['龙', '鸡', '猪'] });
    expect(() => parseRecommendationText('001期（什么是特码）推荐特肖:猪 001期（什么是特码）推荐特肖:龙', 2026)).toThrow('冲突');
  });
  it('uses only the seventh zodiac, matches year+period and leaves absent draws pending', () => {
    const rows = evaluateRecommendations(recs(), parseHistoryDraws([
      history(268, '马'), history(267, '兔'), history(266, '猪', 2025),
    ]));
    expect(rows.map(row => row.state)).toEqual(['miss', 'hit', 'pending']);
    expect(rows[1].draw).toMatchObject({ number: 25, zodiac: '兔' });
  });
  it('does not score missing/mismatched seventh metadata or duplicate conflicts', () => {
    const invalid = history(268, '猪');
    invalid.numberInfos[6].number = 26;
    const draws = parseHistoryDraws([
      invalid, { year: 2026, No: 267, n7: 25 }, history(266, '猪'), history(266, '马'),
    ]);
    expect(evaluateRecommendations(recs(), draws).map(row => row.state)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(evaluateRecommendations(recs(), null).every(row => row.state === 'unknown')).toBe(true);
  });
});

describe('recommendation cache', () => {
  function storage() {
    const values = new Map<string, string>();
    const api = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    vi.stubGlobal('localStorage', api);
    return api;
  }
  it('does not request on a cache hit; explicit refresh requests again', async () => {
    storage();
    const fetcher = vi.fn(async () => recs());
    expect((await loadCached('test-hit', fetcher, validRecommendations)).cached).toBe(false);
    expect((await loadCached('test-hit', fetcher, validRecommendations)).cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await loadCached('test-hit', fetcher, validRecommendations, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent requests', async () => {
    storage();
    const fetcher = vi.fn(async () => recs());
    await Promise.all([loadCached('test-concurrent', fetcher, validRecommendations), loadCached('test-concurrent', fetcher, validRecommendations)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('refetches malformed cache and preserves good cache when refresh fails', async () => {
    const api = storage();
    api.setItem('test-malformed', '{oops');
    const fetcher = vi.fn(async () => recs());
    await loadCached('test-malformed', fetcher, validRecommendations);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const before = api.getItem('test-malformed');
    await expect(loadCached('test-malformed', async () => { throw new Error('offline'); }, validRecommendations, true)).rejects.toThrow('offline');
    expect(api.getItem('test-malformed')).toBe(before);
    await loadCached('test-malformed', fetcher, validRecommendations);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not cache empty/invalid recommendations and tolerates blocked localStorage', async () => {
    const api = storage();
    await expect(loadCached('test-empty', async () => [], validRecommendations)).rejects.toThrow('未写入缓存');
    expect(api.getItem('test-empty')).toBeNull();
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    expect((await loadCached('test-blocked', async () => recs(), validRecommendations)).persistent).toBe(false);
    const fetcher = vi.fn(async () => recs());
    expect((await loadCached('test-blocked', fetcher, validRecommendations)).cached).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
