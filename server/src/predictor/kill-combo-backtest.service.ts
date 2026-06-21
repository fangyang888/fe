import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { FivePeriodKillService } from './five-period-kill.service';
import { KillOneService } from './kill-one.service';
import { POneKillService } from './p-one-kill.service';

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
  actual: number[];
  rawNums: number[];
  nums: number[];
  protectedNums: number[];
  protectedRemoved: number[];
  hotProtectedRemoved: number[];
  s2RiskRemoved: number[];
  s2RiskActive: boolean;
  protectionActive: boolean;
  failed: number[];
  rawFailed: number[];
  ok: boolean;
  a: number | null;
  b: number | null;
  c?: number | null;
  baseDetails: Array<{ key: string; label: string; value: number | null }>;
  extraDetails: Array<{ key: string; value: number | null }>;
  uniqueCount: number;
}

interface PeriodSnapshot {
  period: string;
  actual: number[];
  base: number[];
  baseDetails: Array<{ key: string; label: string; value: number | null }>;
  labels: Record<string, number>;
  hotRiskNums: Set<number>;
  s2PressureRiskNums: Set<number>;
}

@Injectable()
export class KillComboBacktestService {
  private readonly memoryCache = new Map<string, any>();
  private kill5AdaptiveCache: { opts: any | null; learnedAt: number; score: number } = {
    opts: null,
    learnedAt: -1,
    score: 0,
  };
  private kill10AdaptiveCache: { opts: any | null; learnedAt: number; score: number; strategyName: string } = {
    opts: null,
    learnedAt: -1,
    score: 0,
    strategyName: '',
  };

  constructor(
    private readonly historyService: HistoryService,
    private readonly pOneKillService: POneKillService,
    private readonly killOneService: KillOneService,
    private readonly fivePeriodKillService: FivePeriodKillService,
  ) {}

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
    this.kill5AdaptiveCache = { opts: null, learnedAt: -1, score: 0 };
    this.kill10AdaptiveCache = { opts: null, learnedAt: -1, score: 0, strategyName: '' };
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

    const currentA = (options.a || 'HC1').toUpperCase();
    const currentB = (options.b || 'S2').toUpperCase();
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
    const fallbackKeys = ['HC1', 'L15', 'S2'];
    const fallbackTri = this.evalComboSet(periods, fallbackKeys);
    const latest = history[history.length - 1];
    const nextSnapshot = this.buildPredictionSnapshot(history);

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
      triTarget: {
        required: Math.min(17, count),
        met: fallbackTri.ok >= Math.min(17, count),
        bestOk: fallbackTri.ok,
        count,
        bestKeys: fallbackKeys,
        bestRate: fallbackTri.rate,
      },
      fallbackTri: {
        keys: fallbackKeys,
        ok: fallbackTri.ok,
        rate: fallbackTri.rate,
        dup: fallbackTri.dup,
        avgUnique: Number(fallbackTri.avgUnique.toFixed(2)),
        rows: this.formatRows(fallbackTri.rows),
        missRows: fallbackTri.rows
          .filter((row: ComboRow) => !row.ok)
          .map((row: ComboRow) => ({
            period: row.period,
            failed: row.failed.map((n) => this.fmt(n)).join(' '),
            nums: row.nums.map((n) => this.fmt(n)).join(' '),
          })),
      },
      nextPrediction: {
        current: current ? this.formatNextPrediction(nextSnapshot, current.a, current.b, current.rows) : null,
        best: best ? this.formatNextPrediction(nextSnapshot, best.a, best.b, best.rows) : null,
        fallbackTri: this.formatNextPredictionSet(nextSnapshot, fallbackKeys, fallbackTri.rows),
      },
      current: current
        ? {
            pair: [current.a, current.b],
            ok: current.ok,
            rate: current.rate,
            dup: current.dup,
            rows: this.formatRows(current.rows),
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
        ? this.formatRows(best.rows)
        : [],
    };
  }

  private formatRows(rows: ComboRow[]) {
    return rows.map((row) => ({
      period: row.period,
      result: row.ok ? '全中' : '未中',
      actual: row.actual.map((n) => this.fmt(n)).join(' '),
      baseDetails: row.baseDetails.map((item) => ({
        ...item,
        value: item.value === null ? null : this.fmt(item.value),
      })),
      extraDetails: row.extraDetails.map((item) => ({
        ...item,
        value: item.value === null ? null : this.fmt(item.value),
      })),
      failed: row.failed.map((n) => this.fmt(n)).join(' '),
      rawFailed: row.rawFailed.map((n) => this.fmt(n)).join(' '),
      nums: row.nums.map((n) => this.fmt(n)).join(' '),
      rawNums: row.rawNums.map((n) => this.fmt(n)).join(' '),
      protectedRemoved: row.protectedRemoved.map((n) => this.fmt(n)).join(' '),
      hotProtectedRemoved: row.hotProtectedRemoved.map((n) => this.fmt(n)).join(' '),
      s2RiskRemoved: row.s2RiskRemoved.map((n) => this.fmt(n)).join(' '),
      s2RiskActive: row.s2RiskActive,
      protectionActive: row.protectionActive,
    }));
  }

  private buildPredictionSnapshot(history: DrawRow[]): PeriodSnapshot {
    const baseDetails = this.buildBaseDetails(history);
    const base = baseDetails.map((item) => item.value).filter((n): n is number => Number.isFinite(n));
    const labels: Record<string, number> = {};

    this.highConfidence4(history).forEach((n, index) => {
      labels[`HC${index + 1}`] = n;
    });
    this.likely22(history).forEach((n, index) => {
      labels[`L${index + 1}`] = n;
    });
    this.smart7(history).forEach((n, index) => {
      labels[`S${index + 1}`] = n;
    });

    const latest = history[history.length - 1];
    return {
      period: `${latest.year}-${String((latest.No || 0) + 1).padStart(3, '0')}`,
      actual: [],
      base,
      baseDetails,
      labels,
      hotRiskNums: this.buildHotRiskSet(history),
      s2PressureRiskNums: this.buildS2PressureRiskSet(history, labels),
    };
  }

  private formatNextPrediction(snapshot: PeriodSnapshot, a: string, b: string, rows: ComboRow[] = []) {
    return this.formatNextPredictionSet(snapshot, [a, b], rows);
  }

  private formatNextPredictionSet(snapshot: PeriodSnapshot, keys: string[], rows: ComboRow[] = []) {
    const rawNums = [...snapshot.base, ...keys.map((key) => snapshot.labels[key])].filter((n) =>
      Number.isFinite(n),
    );
    const rawUnique = [...new Set(rawNums)];
    const protectionActive = this.shouldActivateProtection(rows);
    const hotProtectedRemoved = protectionActive
      ? rawUnique.filter((n) => snapshot.hotRiskNums.has(n))
      : [];
    const s2RiskRemoved = keys.includes('S2')
      ? rawUnique.filter((n) => snapshot.s2PressureRiskNums.has(n))
      : [];
    const protectedRemoved = [...new Set([...hotProtectedRemoved, ...s2RiskRemoved])];
    const unique = rawUnique.filter((n) => !protectedRemoved.includes(n));
    return {
      pair: keys,
      period: snapshot.period,
      nums: unique.map((n) => this.fmt(n)).join(' '),
      rawNums: rawUnique.map((n) => this.fmt(n)).join(' '),
      protectedRemoved: protectedRemoved.map((n) => this.fmt(n)).join(' '),
      hotProtectedRemoved: hotProtectedRemoved.map((n) => this.fmt(n)).join(' '),
      s2RiskRemoved: s2RiskRemoved.map((n) => this.fmt(n)).join(' '),
      s2RiskActive: s2RiskRemoved.length > 0,
      protectionActive,
      baseDetails: snapshot.baseDetails.map((item) => ({
        ...item,
        value: item.value === null ? null : this.fmt(item.value),
      })),
      extraDetails: keys.map((key) => ({
        key,
        value: snapshot.labels[key] ? this.fmt(snapshot.labels[key]) : null,
      })),
    };
  }

  private buildBaseDetails(training: DrawRow[]) {
    const pOne = this.pOneKillService.pickForHistory(training)?.number ?? null;
    const killOne = this.killOneService.pickForHistory(training);
    const fiveMain = this.fivePeriodKillService.pickMainForHistory(training, 8)?.n ?? null;
    const fiveStrict = this.fivePeriodKillService.pickStrictForHistory(training)?.n ?? null;
    return [
      { key: 'p_one', label: '/kill/p_one', value: pOne },
      { key: 'kill_one', label: '/kill/one', value: killOne },
      { key: 'five_main', label: '/kill/five-period 主', value: fiveMain },
      { key: 'five_strict', label: '/kill/five-period 严', value: fiveStrict },
    ];
  }

  private buildPeriods(history: DrawRow[], count: number) {
    const start = Math.max(0, history.length - count);
    const periods: PeriodSnapshot[] = [];

    for (let t = start; t < history.length; t++) {
      const training = history.slice(0, t);
      const actual = history[t];
      const baseDetails = this.buildBaseDetails(training);
      const base = baseDetails.map((item) => item.value).filter((n): n is number => Number.isFinite(n));
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
        baseDetails,
        labels,
        hotRiskNums: this.buildHotRiskSet(training),
        s2PressureRiskNums: this.buildS2PressureRiskSet(training, labels),
      });
    }

    return periods;
  }

  private evalCombo(periods: any[], a: string, b: string) {
    const combo = this.evalComboSet(periods, [a, b]);
    return {
      ...combo,
      a,
      b,
    };
  }

  private evalComboSet(periods: any[], keys: string[]) {
    const rows: ComboRow[] = [];

    periods.forEach((period) => {
      const nums = [...period.base, ...keys.map((key) => period.labels[key])].filter((n) =>
        Number.isFinite(n),
      );
      const rawUnique = [...new Set(nums)];
      const protectionActive = this.shouldActivateProtection(rows);
      const hotProtectedRemoved = protectionActive
        ? rawUnique.filter((n) => period.hotRiskNums.has(n))
        : [];
      const s2RiskRemoved = keys.includes('S2')
        ? rawUnique.filter((n) => period.s2PressureRiskNums.has(n))
        : [];
      const protectedRemoved = [...new Set([...hotProtectedRemoved, ...s2RiskRemoved])];
      const unique = rawUnique.filter((n) => !protectedRemoved.includes(n));
      const rawFailed = rawUnique.filter((n) => period.actual.includes(n));
      const failed = unique.filter((n) => period.actual.includes(n));
      rows.push({
        period: period.period,
        actual: period.actual,
        rawNums: rawUnique,
        nums: unique,
        protectedNums: unique,
        protectedRemoved,
        hotProtectedRemoved,
        s2RiskRemoved,
        s2RiskActive: s2RiskRemoved.length > 0,
        protectionActive,
        failed,
        rawFailed,
        ok: failed.length === 0,
        a: period.labels[keys[0]] ?? null,
        b: period.labels[keys[1]] ?? null,
        c: keys[2] ? period.labels[keys[2]] ?? null : null,
        baseDetails: period.baseDetails,
        extraDetails: keys.map((key) => ({ key, value: period.labels[key] ?? null })),
        uniqueCount: unique.length,
      });
    });
    const ok = rows.filter((row) => row.ok).length;
    return {
      keys,
      a: keys[0],
      b: keys[1],
      ok,
      rate: ok / rows.length,
      dup: rows.filter((row) => row.uniqueCount < Math.min(7, 4 + keys.length)).length,
      avgUnique: rows.reduce((sum, row) => sum + row.uniqueCount, 0) / rows.length,
      rows,
    };
  }

  private shouldActivateProtection(rows: ComboRow[]) {
    return rows.slice(-3).some((row) => row.rawFailed.length > 0);
  }

  private buildHotRiskSet(history: DrawRow[]) {
    const risk = new Set<number>();
    for (let n = 1; n <= 49; n++) {
      if (this.isHotRisk(history, n)) risk.add(n);
    }
    return risk;
  }

  private isHotRisk(history: DrawRow[], n: number) {
    const last = history[history.length - 1]?.numbers || [];
    const freq = (window: number) =>
      history.slice(-window).filter((row) => row.numbers.includes(n)).length;
    const f5 = freq(5);
    const f10 = freq(10);
    return f5 >= 2 || (last.includes(n) && f10 >= 2);
  }

  private buildS2PressureRiskSet(history: DrawRow[], labels: Record<string, number>) {
    const risk = new Set<number>();
    const s2 = labels.S2;
    if (Number.isFinite(s2) && this.isS2PressureRisk(history, s2)) {
      risk.add(s2);
    }
    return risk;
  }

  private isS2PressureRisk(history: DrawRow[], n: number) {
    if (!Number.isFinite(n) || history.length < 10) return false;
    const last = history[history.length - 1]?.numbers || [];
    const nearNums = this.nearNums(n);
    const nearLast = nearNums.filter((num) => last.includes(num)).length;
    const near10 = this.countRecentMatches(history, 10, (num) => nearNums.includes(num));
    const sameTail10 = this.countRecentMatches(
      history,
      10,
      (num) => num !== n && num % 10 === n % 10,
    );
    const miss = this.missingSpan(history, n);
    return miss >= 10 && nearLast >= 1 && near10 >= 8 && sameTail10 >= 6;
  }

  private nearNums(n: number) {
    return [n - 2, n - 1, n + 1, n + 2].filter((num) => num >= 1 && num <= 49);
  }

  private countRecentMatches(history: DrawRow[], window: number, predicate: (n: number) => boolean) {
    return history.slice(-window).reduce(
      (sum, row) => sum + row.numbers.filter((num) => predicate(num)).length,
      0,
    );
  }

  private missingSpan(history: DrawRow[], n: number) {
    for (let i = history.length - 1, span = 0; i >= 0; i--, span++) {
      if (history[i].numbers.includes(n)) return span;
    }
    return history.length;
  }

  private highConfidence4(history: DrawRow[]) {
    if (history.length < 10) return [];
    const hist = this.toMatrix(history);
    return this.killPredictWithOpts(hist, this.getAdaptiveKill5Opts(hist));
  }

  private likely22(history: DrawRow[]) {
    const hist = this.toMatrix(history);
    const out: Array<{ n: number; score: number }> = [];
    const lastRow = new Set(hist[hist.length - 1] || []);

    for (let n = 1; n <= 49; n++) {
      let score = 0;
      const appearances: number[] = [];
      let lastMiss = hist.length;

      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(n)) {
          lastMiss = hist.length - 1 - i;
          break;
        }
      }
      hist.forEach((row, index) => {
        if (row.includes(n)) appearances.push(index);
      });
      if (!appearances.length) continue;

      const avgGap =
        appearances.length >= 2
          ? appearances.slice(1).reduce((sum, index, i) => sum + index - appearances[i], 0) /
            (appearances.length - 1)
          : hist.length / 7;

      if (appearances.length >= 2) {
        const missRatio = lastMiss / avgGap;
        if (missRatio >= 2) score += 3;
        else if (missRatio >= 1.5) score += 2;
        else if (missRatio >= 1.2) score += 1.2;
        else if (missRatio >= 0.9) score += 0.5;
      }
      if (lastRow.has(n)) {
        let rc = 0;
        let rt = 0;
        for (let i = 0; i < hist.length - 1; i++) {
          if (hist[i].includes(n)) {
            rt++;
            if (hist[i + 1].includes(n)) rc++;
          }
        }
        score += (rt > 1 ? rc / rt : 0.14) * 2.5;
      }
      if (hist.length >= 2 && hist[hist.length - 2].includes(n) && !lastRow.has(n)) score += 0.4;
      const c3 = hist.slice(-3).filter((row) => row.includes(n)).length;
      if (c3 >= 2) score += c3 * 0.5;
      if (appearances.length >= 3) {
        const gaps = appearances.slice(1).map((index, i) => index - appearances[i]);
        const stdDev = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv < 0.5 && lastMiss >= avgGap * 0.8 && lastMiss <= avgGap * 1.5) score += (1 - cv) * 1.2;
      }
      if ([...lastRow].some((x) => Math.abs(x - n) === 1) && lastMiss >= 2) score += 0.3;

      if (score > 0) out.push({ n, score });
    }

    return out
      .sort((a, b) => b.score - a.score)
      .slice(0, 22)
      .map((item) => item.n);
  }

  private smart7(history: DrawRow[]) {
    const hist = this.toMatrix(history);
    if (hist.length < 15) return [];

    const testPeriods = Math.min(35, hist.length - 15);
    const kill10Backtest: any[] = [];
    const kill5Backtest: any[] = [];
    for (let i = hist.length - testPeriods - 1; i < hist.length - 1; i++) {
      const testHist = hist.slice(0, i + 1);
      const nextSet = new Set(hist[i + 1]);
      const kill5 = this.strategyKill5Matrix(testHist);
      kill5Backtest.push({
        actual: hist[i + 1],
        killNums: kill5.map((item) => item.num),
        failed: kill5.map((item) => item.num).filter((n) => nextSet.has(n)),
      });

      const subOpts = this.getAdaptiveKill10Opts(testHist).opts;
      const kill10 = this.strategyAbsoluteSafeMatrix(testHist, subOpts);
      kill10Backtest.push({
        actual: hist[i + 1],
        killNums: kill10.map((item) => item.num),
        failed: kill10.map((item) => item.num).filter((n) => nextSet.has(n)),
      });
    }

    const current10 = this.strategyAbsoluteSafeMatrix(hist, this.getAdaptiveKill10Opts(hist).opts);
    const kill10ErrCount: Record<number, number> = {};
    const kill10AppearCount: Record<number, number> = {};
    kill10Backtest.forEach((bt) => {
      bt.killNums.forEach((n: number) => {
        kill10AppearCount[n] = (kill10AppearCount[n] || 0) + 1;
        if (bt.failed.includes(n)) kill10ErrCount[n] = (kill10ErrCount[n] || 0) + 1;
      });
    });
    const selected6 = current10
      .map((item) => {
        const appear = kill10AppearCount[item.num] || 1;
        const errors = kill10ErrCount[item.num] || 0;
        return { ...item, errors, appear, errorRate: errors / appear };
      })
      .sort((a, b) => a.errorRate - b.errorRate || a.errors - b.errors)
      .slice(0, 6)
      .map((item) => item.num);

    const current4 = this.strategyKill5Matrix(hist);
    const kill5ErrCount: Record<number, number> = {};
    const kill5AppearCount: Record<number, number> = {};
    kill5Backtest.forEach((bt) => {
      bt.killNums.forEach((n: number) => {
        kill5AppearCount[n] = (kill5AppearCount[n] || 0) + 1;
        if (bt.failed.includes(n)) kill5ErrCount[n] = (kill5ErrCount[n] || 0) + 1;
      });
    });
    const selected1 = current4
      .map((item) => {
        const appear = kill5AppearCount[item.num] || 1;
        const errors = kill5ErrCount[item.num] || 0;
        return { ...item, errors, appear, errorRate: errors / appear };
      })
      .sort((a, b) => a.errorRate - b.errorRate || a.errors - b.errors)[0]?.num;

    return [...selected6, ...(selected1 ? [selected1] : [])];
  }

  private toMatrix(history: DrawRow[]) {
    return history.map((row) => row.numbers);
  }

  private getKill5ParamGrid() {
    const grid: any[] = [];
    for (const overlapThresh of [1, 2, 3]) {
      for (const decay of [0.8, 0.85, 0.9]) {
        for (const protectWindow of [2, 3]) {
          for (const repeatThresh of [0.15, 0.2, 0.25]) {
            for (const skipThresh of [0.2, 0.25, 0.3]) {
              grid.push({ overlapThresh, decay, protectWindow, repeatThresh, skipThresh });
            }
          }
        }
      }
    }
    return grid;
  }

  private killPredictWithOpts(hist: number[][], opts: any) {
    const { overlapThresh, decay, protectWindow, repeatThresh, skipThresh } = opts;
    const hn = hist.length;
    const lastRow = hist[hn - 1];
    const afterScore = new Array(50).fill(0);
    let simCount = 0;
    for (let i = 0; i < hn - 1; i++) {
      const overlap = hist[i].filter((n) => lastRow.includes(n)).length;
      if (overlap >= overlapThresh) {
        hist[i + 1].forEach((n) => afterScore[n]++);
        simCount++;
      }
    }

    const wFreq = new Array(50).fill(0);
    hist.forEach((row, idx) => {
      const weight = Math.pow(decay, hn - 1 - idx);
      row.forEach((n) => (wFreq[n] += weight));
    });

    const protect = new Set<number>();
    hist.slice(-protectWindow).forEach((row) => row.forEach((n) => protect.add(n)));
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps: number[] = [];
      hist.forEach((row, idx) => {
        if (row.includes(n)) apps.push(idx);
      });
      if (apps.length < 3) continue;
      const lastIdx = apps[apps.length - 1];
      if (lastIdx === hn - 1) {
        let rc = 0;
        let rt = 0;
        for (let j = 0; j < hn - 1; j++) {
          if (hist[j].includes(n)) {
            rt++;
            if (hist[j + 1].includes(n)) rc++;
          }
        }
        if (rt > 2 && rc / rt >= repeatThresh) protect.add(n);
      }
      if (lastIdx === hn - 2) {
        let sk = 0;
        let ap = 0;
        for (let j = 0; j < hn - 2; j++) {
          if (hist[j].includes(n) && !hist[j + 1].includes(n)) {
            ap++;
            if (hist[j + 2].includes(n)) sk++;
          }
        }
        if (ap > 2 && sk / ap >= skipThresh) protect.add(n);
      }
    }

    const scored: Array<{ n: number; score: number }> = [];
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const markovScore = simCount > 0 ? afterScore[n] / simCount : 0;
      scored.push({ n, score: markovScore * 0.6 + wFreq[n] * 0.4 });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 4).map((item) => item.n);
  }

  private getAdaptiveKill5Opts(hist: number[][]) {
    const defaultOpts = {
      overlapThresh: 1,
      decay: 0.8,
      protectWindow: 1,
      repeatThresh: 0.15,
      skipThresh: 0.2,
    };
    if (hist.length < 25) return defaultOpts;
    if (this.kill5AdaptiveCache.opts && hist.length - this.kill5AdaptiveCache.learnedAt < 5) {
      return this.kill5AdaptiveCache.opts;
    }

    let bestOpts = defaultOpts;
    let bestScore = -1;
    for (const opts of this.getKill5ParamGrid()) {
      let correct = 0;
      let total = 0;
      const evalStart = hist.length - 20;
      for (let i = evalStart; i < hist.length - 1; i++) {
        const kill = this.killPredictWithOpts(hist.slice(0, i + 1), opts);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n) => !nextSet.has(n)).length;
        total += 4;
      }
      const acc = correct / total;
      if (acc > bestScore) {
        bestScore = acc;
        bestOpts = opts;
      }
    }
    this.kill5AdaptiveCache = { opts: bestOpts, learnedAt: hist.length, score: bestScore };
    return bestOpts;
  }

  private strategyKill5Matrix(hist: number[][]) {
    if (hist.length < 10) return [];
    const kill = this.killPredictWithOpts(hist, this.getAdaptiveKill5Opts(hist));
    return kill.map((n, i) => ({
      num: n,
      score: -(i + 1),
      label: i < 2 ? '极冷' : '冷号',
      tier: i < 2 ? 'S1' : 'S2',
    }));
  }

  private getKill10ParamGrid() {
    return [
      { decay: 0.85, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.85, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.85, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.85, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.85, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.85, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
      { decay: 0.9, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 12 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 24 },
      { decay: 0.9, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
      { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: false, altBonus: 18 },
      { decay: 0.95, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 24 },
      { decay: 0.95, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.95, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
      { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: false, altBonus: 18 },
      { decay: 0.8, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
      { decay: 0.8, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.8, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.8, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
      { decay: 0.8, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
    ];
  }

  private buildScoreEngineWithOpts(hist: number[][], opts: any) {
    const { decay, protectWindow, missRiskMult } = opts;
    const hn = hist.length;
    const wFreq = new Array(50).fill(0);
    hist.forEach((row, idx) => {
      const weight = Math.pow(decay, hn - 1 - idx);
      row.forEach((n) => (wFreq[n] += weight));
    });

    const protect = new Set<number>();
    const extremeMissSet = new Set<number>();
    hist.slice(-protectWindow).forEach((row) => row.forEach((n) => protect.add(n)));
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps: number[] = [];
      hist.forEach((row, idx) => {
        if (row.includes(n)) apps.push(idx);
      });
      if (apps.length < 3) continue;
      const gaps = apps.slice(1).map((idx, i) => idx - apps[i]);
      const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
      const lastMiss = hn - 1 - apps[apps.length - 1];
      if (avgGap > 0 && lastMiss / avgGap >= 5) {
        extremeMissSet.add(n);
        continue;
      }
      if (lastMiss >= avgGap * missRiskMult) {
        protect.add(n);
        continue;
      }
      if (apps.length >= 4) {
        const stdDev = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv > 0.85 && lastMiss < avgGap * 1.5) {
          protect.add(n);
          continue;
        }
      }
      const lastIdx = apps[apps.length - 1];
      if (lastIdx === hn - 1) {
        let rc = 0;
        let rt = 0;
        for (let j = 0; j < hist.length - 1; j++) {
          if (hist[j].includes(n)) {
            rt++;
            if (hist[j + 1].includes(n)) rc++;
          }
        }
        if (rt > 2 && rc / rt >= 0.2) protect.add(n);
      }
      if (lastIdx === hn - 2) {
        let sk = 0;
        let ap = 0;
        for (let j = 0; j < hist.length - 2; j++) {
          if (hist[j].includes(n) && !hist[j + 1].includes(n)) {
            ap++;
            if (hist[j + 2].includes(n)) sk++;
          }
        }
        if (ap > 2 && sk / ap >= 0.25) protect.add(n);
      }
    }

    const candidates: Array<{ n: number; w: number }> = [];
    for (let n = 1; n <= 49; n++) {
      if (!protect.has(n) && !extremeMissSet.has(n)) candidates.push({ n, w: wFreq[n] });
    }
    return candidates.sort((a, b) => a.w - b.w);
  }

  private kill10WithOptsMatrix(hist: number[][], opts: any) {
    const scored = this.buildScoreEngineWithOpts(hist, opts).map((item) => {
      const n = item.n;
      const p1 = hist[hist.length - 1]?.includes(n) ? 1 : 0;
      const p2 = hist[hist.length - 2]?.includes(n) ? 1 : 0;
      const p3 = hist[hist.length - 3]?.includes(n) ? 1 : 0;
      let bonus = 0;
      if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -opts.altBonus;
      if (p1 === 0 && p2 === 1 && p3 === 0) bonus = opts.altBonus;
      return { ...item, adjustedW: item.w + bonus };
    }).sort((a, b) => a.adjustedW - b.adjustedW);

    if (!opts.tailBalance) return scored.slice(0, 10).map((item) => item.n);
    const selected: any[] = [];
    const tails = Array(10).fill(0);
    for (const item of scored) {
      if (selected.length >= 10) break;
      const tail = item.n % 10;
      if (tails[tail] < 2) {
        selected.push(item);
        tails[tail]++;
      }
    }
    for (const item of scored) {
      if (selected.length >= 10) break;
      if (!selected.find((x) => x.n === item.n)) selected.push(item);
    }
    return selected.slice(0, 10).map((item) => item.n);
  }

  private getAdaptiveKill10Opts(hist: number[][]) {
    const defaultOpts = { decay: 0.9, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 };
    if (hist.length < 30) return { opts: defaultOpts, score: 0, learnedAt: hist.length };
    if (this.kill10AdaptiveCache.opts && hist.length - this.kill10AdaptiveCache.learnedAt < 5) {
      return this.kill10AdaptiveCache;
    }

    let bestOpts = defaultOpts;
    let bestScore = -1;
    const evalWindow = Math.min(30, hist.length - 10);
    for (const opts of this.getKill10ParamGrid()) {
      let correct = 0;
      let total = 0;
      for (let i = hist.length - evalWindow; i < hist.length - 1; i++) {
        const kill = this.kill10WithOptsMatrix(hist.slice(0, i + 1), opts);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n) => !nextSet.has(n)).length;
        total += 10;
      }
      const acc = correct / total;
      if (acc > bestScore) {
        bestScore = acc;
        bestOpts = opts;
      }
    }
    this.kill10AdaptiveCache = {
      opts: bestOpts,
      learnedAt: hist.length,
      score: bestScore,
      strategyName: `decay=${bestOpts.decay} win=${bestOpts.protectWindow} miss=${bestOpts.missRiskMult} tail=${bestOpts.tailBalance} alt=${bestOpts.altBonus}`,
    };
    return this.kill10AdaptiveCache;
  }

  private pickLowCVFromLastRow(hist: number[][], count = 2) {
    if (hist.length < 2) return [];
    const scored = hist[hist.length - 1].map((n) => {
      const apps: number[] = [];
      hist.forEach((row, idx) => {
        if (row.includes(n)) apps.push(idx);
      });
      if (apps.length < 2) return { n, cv: 1 };
      const gaps = apps.slice(1).map((idx, i) => idx - apps[i]);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const stdDev = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - avgGap) ** 2, 0) / gaps.length);
      return { n, cv: avgGap > 0 ? stdDev / avgGap : 1 };
    });
    return scored.sort((a, b) => a.cv - b.cv).slice(0, count).map((item) => item.n);
  }

  private strategyAbsoluteSafeMatrix(hist: number[][], adaptiveOpts: any) {
    if (hist.length < 10) return [];
    const baseNums = this.kill10WithOptsMatrix(hist, adaptiveOpts);
    const top8 = baseNums.slice(0, 8);
    const validPicks = this.pickLowCVFromLastRow(hist, 2).filter((n) => !top8.includes(n));
    const finalNums = [...top8, ...validPicks];
    if (finalNums.length < 10) {
      finalNums.push(...baseNums.slice(8).filter((n) => !finalNums.includes(n)));
    }
    return finalNums.slice(0, 10).map((n, i) => ({
      num: n,
      score: -(i + 1),
      label: i < 3 ? '极冷' : i < 6 ? '冷号' : i < 8 ? '低频' : '上期低CV',
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : i < 8 ? 'S3' : 'C2',
    }));
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
    return `kill-combo:v9-raw-trigger-s2:${history.length}:${latest?.year || 0}:${latest?.No || 0}:${options.count}:${options.a.toUpperCase()}:${options.b.toUpperCase()}`;
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
