import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

interface SearchOptions {
  count: number;
  a: string;
  b: string;
}

interface DrawRow {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface ComboRow {
  period: string;
  nums: number[];
  failed: number[];
  ok: boolean;
  a: number | null;
  b: number | null;
  uniqueCount: number;
}

@Injectable()
export class KillComboBacktestService {
  private readonly memoryCache = new Map<string, any>();

  constructor(private readonly historyService: HistoryService) {}

  async search(options: SearchOptions, forceRefresh = false) {
    try {
      const rawRows = await this.historyService.findAll();
      const history = this.normalizeRows(rawRows);
      if (history.length < 30) {
        return {
          status: 'insufficient-history',
          message: '组合回测至少需要 30 期历史数据。',
          historyCount: history.length,
        };
      }

      const cacheKey = this.getCacheKey(options, history);
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

      const response = this.buildResponse(history, options);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`组合回测失败：${message}`);
    }
  }

  async refresh(options: SearchOptions) {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    const cacheKey = this.getCacheKey(options, history);
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

  private buildResponse(history: DrawRow[], options: SearchOptions) {
    const count = Math.max(5, Math.min(80, Math.floor(options.count || 20)));
    const periods = this.buildPeriods(history, count);
    const keys = Object.keys(periods[0]?.labels || {});
    const combos: any[] = [];

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        combos.push(this.evalCombo(periods, keys[i], keys[j]));
      }
    }

    combos.sort(
      (x, y) =>
        y.ok - x.ok ||
        x.dup - y.dup ||
        y.avgUnique - x.avgUnique ||
        x.a.localeCompare(y.a),
    );

    const single = keys
      .map((key) => this.evalCombo(periods, key, key))
      .map((item) => ({
        key: item.a,
        ok: item.ok,
        rate: item.rate,
        dup: item.dup,
        errors: periods.length - item.ok,
      }))
      .sort((a, b) => b.ok - a.ok || a.dup - b.dup || a.key.localeCompare(b.key));

    const currentA = (options.a || 'HC3').toUpperCase();
    const currentB = (options.b || 'L15').toUpperCase();
    const current = combos.find(
      (item) =>
        (item.a === currentA && item.b === currentB) ||
        (item.a === currentB && item.b === currentA),
    );
    const base4Ok = periods.filter((period) => {
      const nums = [...new Set(period.base)];
      return nums.filter((n) => period.actual.includes(n)).length === 0;
    }).length;
    const best = combos[0];
    const latest = history[history.length - 1];

    return {
      db: {
        rows: history.length,
        latest: {
          year: latest.year,
          No: latest.No,
          numbers: latest.numbers,
        },
      },
      theory6: this.comb(43, 7) / this.comb(49, 7),
      base4: { ok: base4Ok },
      topSingles: single.slice(0, 12),
      topCombos: combos.slice(0, 20).map((item) => ({
        pair: [item.a, item.b],
        ok: item.ok,
        rate: item.rate,
        dup: item.dup,
        avgUnique: Number(item.avgUnique.toFixed(2)),
      })),
      current: current
        ? {
            pair: [current.a, current.b],
            ok: current.ok,
            rate: current.rate,
            dup: current.dup,
            missRows: current.rows
              .filter((row: ComboRow) => !row.ok)
              .map((row: ComboRow) => ({
                period: row.period,
                failed: row.failed.map((n) => this.fmt(n)).join(' '),
                a: row.a,
                b: row.b,
                nums: row.nums.map((n) => this.fmt(n)).join(' '),
              })),
          }
        : null,
      bestRows: best
        ? best.rows.map((row: ComboRow) => ({
            period: row.period,
            result: row.ok ? '全中' : '未中',
            failed: row.failed.map((n) => this.fmt(n)).join(' '),
            nums: row.nums.map((n) => this.fmt(n)).join(' '),
          }))
        : [],
    };
  }

  private buildPeriods(history: DrawRow[], count: number) {
    const start = Math.max(0, history.length - count);
    const periods: Array<{
      period: string;
      actual: number[];
      base: number[];
      labels: Record<string, number>;
    }> = [];

    for (let t = start; t < history.length; t++) {
      const training = history.slice(0, t);
      const actual = history[t];
      const base = [
        this.pickPOne(training),
        this.pickKillOne(training),
        this.pickFivePeriodMain(training),
        this.pickFivePeriodStrict(training),
      ].filter((n): n is number => Number.isFinite(n));
      const labels: Record<string, number> = {};

      this.highConfidence4(training).forEach((n, index) => {
        labels[`HC${index + 1}`] = n;
      });
      this.likely22(training).forEach((n, index) => {
        labels[`L${index + 1}`] = n;
      });
      this.smart7(training).forEach((n, index) => {
        labels[`S${index + 1}`] = n;
      });

      periods.push({
        period: `${actual.year}-${String(actual.No).padStart(3, '0')}`,
        actual: actual.numbers,
        base,
        labels,
      });
    }

    return periods;
  }

  private evalCombo(periods: any[], a: string, b: string) {
    const rows: ComboRow[] = periods.map((period) => {
      const nums = [...period.base, period.labels[a], period.labels[b]].filter((n) =>
        Number.isFinite(n),
      );
      const unique = [...new Set(nums)];
      const failed = unique.filter((n) => period.actual.includes(n));
      return {
        period: period.period,
        nums: unique,
        failed,
        ok: failed.length === 0,
        a: period.labels[a] ?? null,
        b: period.labels[b] ?? null,
        uniqueCount: unique.length,
      };
    });
    const ok = rows.filter((row) => row.ok).length;
    return {
      a,
      b,
      ok,
      rate: ok / rows.length,
      dup: rows.filter((row) => row.uniqueCount < 6).length,
      avgUnique: rows.reduce((sum, row) => sum + row.uniqueCount, 0) / rows.length,
      rows,
    };
  }

  private highConfidence4(history: DrawRow[]) {
    if (history.length < 10) return [];
    const last = history[history.length - 1].numbers;
    const protect = new Set<number>();
    history.slice(-3).forEach((row) => row.numbers.forEach((n) => protect.add(n)));

    const scored: Array<{ n: number; score: number }> = [];
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const recentFreq = this.freq(history, history.length, n, 12);
      const weightedFreq = this.weightedFreq(history, n, 0.86);
      const miss = this.missAll(history, history.length, n);
      const nearLast = last.some((x) => Math.abs(x - n) <= 1) ? 1 : 0;
      const score = recentFreq * 4 + weightedFreq * 0.7 + nearLast * 1.2 - Math.min(miss, 16) * 0.22;
      scored.push({ n, score });
    }
    return scored
      .sort((a, b) => a.score - b.score || b.n - a.n)
      .slice(0, 4)
      .map((item) => item.n);
  }

  private likely22(history: DrawRow[]) {
    const out: Array<{ n: number; score: number }> = [];
    for (let n = 1; n <= 49; n++) {
      const appearances: number[] = [];
      history.forEach((row, index) => {
        if (row.numbers.includes(n)) appearances.push(index);
      });
      if (!appearances.length) {
        out.push({ n, score: -999 });
        continue;
      }

      const miss = history.length - 1 - appearances[appearances.length - 1];
      const avgGap =
        appearances.length >= 2
          ? appearances.slice(1).reduce((sum, index, i) => sum + index - appearances[i], 0) /
            (appearances.length - 1)
          : history.length / 7;
      const last = new Set(history[history.length - 1].numbers);
      const recent3 = history.slice(-3).filter((row) => row.numbers.includes(n)).length;
      const recent8 = this.freq(history, history.length, n, 8);
      let score = 0;

      if (avgGap > 0) {
        const ratio = miss / avgGap;
        if (ratio >= 2) score += 3;
        else if (ratio >= 1.5) score += 2;
        else if (ratio >= 1.2) score += 1.2;
        else if (ratio >= 0.9) score += 0.5;
      }
      if (last.has(n)) score += 1.1;
      if (recent3 >= 2) score += recent3 * 0.55;
      score += recent8 * 0.22;
      if ([...last].some((x) => Math.abs(x - n) === 1) && miss >= 2) score += 0.3;

      out.push({ n, score });
    }

    return out
      .sort((a, b) => b.score - a.score || a.n - b.n)
      .slice(0, 22)
      .map((item) => item.n);
  }

  private smart7(history: DrawRow[]) {
    const base10 = this.kill10Safe(history);
    const hc = this.highConfidence4(history);
    const candidates = [...base10.slice(0, 6), hc[0]].filter(Number.isFinite);
    return [...new Set(candidates)].slice(0, 7);
  }

  private kill10Safe(history: DrawRow[]) {
    const protect = new Set<number>();
    history.slice(-2).forEach((row) => row.numbers.forEach((n) => protect.add(n)));
    const scored: Array<{ n: number; score: number }> = [];

    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const miss = this.missAll(history, history.length, n);
      const recent10 = this.freq(history, history.length, n, 10);
      const recent30 = this.freq(history, history.length, n, 30);
      const weighted = this.weightedFreq(history, n, 0.9);
      const score = recent10 * 5 + recent30 * 1.2 + weighted - Math.min(miss, 18) * 0.28;
      scored.push({ n, score });
    }

    const selected: number[] = [];
    const tailCount = Array(10).fill(0);
    for (const item of scored.sort((a, b) => a.score - b.score || b.n - a.n)) {
      if (selected.length >= 10) break;
      const tail = item.n % 10;
      if (tailCount[tail] >= 2) continue;
      selected.push(item.n);
      tailCount[tail]++;
    }
    return selected;
  }

  private pickPOne(history: DrawRow[]) {
    if (history.length < 8) return this.highConfidence4(history)[0];
    const pool = this.previousFivePool(history);
    const ranked = pool
      .map((n) => {
        const stats = this.featureStats(history, n, this.pOneFeatureKey(history.slice(-5), n));
        const transitionRisk = this.transitionRisk(history, n);
        const missInFive = this.missInWindow(history.slice(-5), n);
        return {
          n,
          score:
            (stats.samples ? (stats.samples - stats.failures) / stats.samples : 0) * 100 +
            stats.samples * 2 -
            stats.failures * 18 +
            missInFive * 3 -
            transitionRisk * 28,
        };
      })
      .sort((a, b) => b.score - a.score || a.n - b.n);
    return ranked[0]?.n;
  }

  private pickKillOne(history: DrawRow[]) {
    if (!history.length) return 1;
    const voters = [
      (n: number) => this.freq(history, history.length, n, 5) * 3 + this.freq(history, history.length, n, 10),
      (n: number) => this.missAll(history, history.length, n),
      (n: number) =>
        (history[history.length - 1].numbers.includes(n) ? 100 : 0) +
        this.freq(history, history.length, n, 5) * 4,
      (n: number) => this.freq(history, history.length, n, 50) - this.missAll(history, history.length, n) * 0.4,
    ];

    const picks = voters.map((score) => this.pickByScore(history, score));
    return this.bestRecentPick(history, picks);
  }

  private pickFivePeriodMain(history: DrawRow[]) {
    if (history.length < 6) return this.highConfidence4(history)[0];
    for (let level = 0; level <= 4; level++) {
      const picked = this.rankFivePeriod(history, level).find(
        (item) => item.failureCount === 0 && item.matchedSamples >= 8,
      );
      if (picked) return picked.n;
    }
    return this.rankFivePeriod(history, 4)[0]?.n;
  }

  private pickFivePeriodStrict(history: DrawRow[]) {
    if (history.length < 6) return null;
    return (
      this.rankFivePeriod(history, 0)
        .filter(
          (item) =>
            item.matchedSamples >= 3 &&
            item.failureCount === 0 &&
            !item.appearedInLatest &&
            item.currentMissInFive >= 4,
        )
        .sort((a, b) => b.zonePressure - a.zonePressure || b.matchedSamples - a.matchedSamples || a.n - b.n)[0]
        ?.n ?? null
    );
  }

  private rankFivePeriod(history: DrawRow[], level: number) {
    const window = history.slice(-5);
    const out: Array<any> = [];
    for (let n = 1; n <= 49; n++) {
      const current = this.fiveFeature(window, n, level);
      let matchedSamples = 0;
      let failureCount = 0;
      for (let i = 5; i < history.length; i++) {
        const feature = this.fiveFeature(history.slice(i - 5, i), n, level);
        if (feature.key !== current.key) continue;
        matchedSamples++;
        if (history[i].numbers.includes(n)) failureCount++;
      }
      out.push({
        n,
        matchedSamples,
        failureCount,
        accuracy: matchedSamples ? (matchedSamples - failureCount) / matchedSamples : 0,
        ...current,
      });
    }
    return out.sort(
      (a, b) =>
        b.accuracy - a.accuracy ||
        a.failureCount - b.failureCount ||
        b.matchedSamples - a.matchedSamples ||
        b.currentMissInFive - a.currentMissInFive ||
        a.n - b.n,
    );
  }

  private fiveFeature(window: DrawRow[], n: number, level: number) {
    const flat = window.flatMap((row) => row.numbers);
    const tail = n % 10;
    const zone = Math.floor((n - 1) / 10);
    const recent = window.filter((row) => row.numbers.includes(n)).length;
    const miss = this.missInWindow(window, n);
    const tailPressure = flat.filter((x) => x % 10 === tail).length;
    const zonePressure = flat.filter((x) => Math.floor((x - 1) / 10) === zone).length;
    const nearPressure = flat.filter((x) => Math.abs(x - n) <= 2).length;
    const appearedInLatest = window[window.length - 1]?.numbers.includes(n) || false;
    const parts = [
      [recent, miss, Math.min(tailPressure, 4), Math.min(zonePressure, 8), Math.min(nearPressure, 4), appearedInLatest ? 1 : 0],
      [recent, miss, Math.min(tailPressure, 4), Math.min(zonePressure, 8), appearedInLatest ? 1 : 0],
      [recent, miss, Math.min(tailPressure, 4), appearedInLatest ? 1 : 0],
      [recent, miss, appearedInLatest ? 1 : 0],
      [recent, Math.min(miss, 3)],
    ];
    return {
      key: parts[level].join('|'),
      currentMissInFive: miss,
      zonePressure,
      appearedInLatest,
    };
  }

  private previousFivePool(history: DrawRow[]) {
    return [...new Set(history.slice(-5).flatMap((row) => row.numbers))].sort((a, b) => a - b);
  }

  private pOneFeatureKey(window: DrawRow[], n: number) {
    const flat = window.flatMap((row) => row.numbers);
    const appear = flat.filter((x) => x === n).length;
    const miss = this.missInWindow(window, n);
    const tail = flat.filter((x) => x % 10 === n % 10).length;
    const zone = flat.filter((x) => Math.floor((x - 1) / 10) === Math.floor((n - 1) / 10)).length;
    const latest = window[window.length - 1]?.numbers.includes(n) ? 1 : 0;
    return [appear, Math.min(miss, 4), Math.min(tail, 5), Math.min(zone, 8), latest].join('|');
  }

  private featureStats(history: DrawRow[], n: number, key: string) {
    let samples = 0;
    let failures = 0;
    for (let i = 5; i < history.length; i++) {
      if (!this.previousFivePool(history.slice(0, i)).includes(n)) continue;
      if (this.pOneFeatureKey(history.slice(i - 5, i), n) !== key) continue;
      samples++;
      if (history[i].numbers.includes(n)) failures++;
    }
    return { samples, failures };
  }

  private transitionRisk(history: DrawRow[], n: number) {
    if (history.length < 2) return 0;
    const anchors = history[history.length - 1].numbers;
    let seen = 0;
    let hit = 0;
    for (let i = 1; i < history.length; i++) {
      const overlap = history[i - 1].numbers.filter((x) => anchors.includes(x)).length;
      if (!overlap) continue;
      seen += overlap;
      if (history[i].numbers.includes(n)) hit += overlap;
    }
    return seen ? hit / seen : 0;
  }

  private pickByScore(history: DrawRow[], score: (n: number) => number) {
    let bestN = 1;
    let bestScore = -Infinity;
    for (let n = 1; n <= 49; n++) {
      const current = score(n);
      if (current > bestScore || (current === bestScore && n < bestN)) {
        bestN = n;
        bestScore = current;
      }
    }
    return bestN;
  }

  private bestRecentPick(history: DrawRow[], picks: number[]) {
    const unique = [...new Set(picks)];
    const ranked = unique
      .map((n) => {
        let ok = 0;
        let total = 0;
        for (let t = Math.max(10, history.length - 20); t < history.length; t++) {
          total++;
          if (!history[t].numbers.includes(n)) ok++;
        }
        return { n, rate: total ? ok / total : 0, miss: this.missAll(history, history.length, n) };
      })
      .sort((a, b) => b.rate - a.rate || b.miss - a.miss || a.n - b.n);
    return ranked[0]?.n ?? picks[0] ?? 1;
  }

  private freq(history: DrawRow[], t: number, n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, t - window); i < t; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
  }

  private weightedFreq(history: DrawRow[], n: number, decay: number) {
    let total = 0;
    for (let i = 0; i < history.length; i++) {
      if (!history[i].numbers.includes(n)) continue;
      total += Math.pow(decay, history.length - 1 - i);
    }
    return total;
  }

  private missAll(history: DrawRow[], t: number, n: number) {
    let miss = 0;
    for (let i = t - 1; i >= 0; i--) {
      if (history[i].numbers.includes(n)) break;
      miss++;
    }
    return miss;
  }

  private missInWindow(window: DrawRow[], n: number) {
    let miss = 0;
    for (let i = window.length - 1; i >= 0; i--) {
      if (window[i].numbers.includes(n)) break;
      miss++;
    }
    return miss;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: row.year,
        No: row.No,
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
      }))
      .filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || a.id - b.id);
  }

  private getCacheKey(options: SearchOptions, history: DrawRow[]) {
    const latest = history[history.length - 1];
    return `kill-combo:v2:${history.length}:${latest?.year || 0}:${latest?.No || 0}:${options.count}:${options.a.toUpperCase()}:${options.b.toUpperCase()}`;
  }

  private comb(n: number, k: number) {
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
    return result;
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
