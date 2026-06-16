import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

type SourceType = 'default' | 'hk';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface CandidateMetric {
  n: number;
  appearInFive: number;
  missInFive: number;
  freq10: number;
  freq20: number;
  freq50: number;
  missAll: number;
  tailPressure: number;
  zonePressure: number;
  nearPressure: number;
  transitionRisk: number;
  featureAccuracy: number;
  featureSamples: number;
  featureFailures: number;
}

interface Strategy {
  key: string;
  name: string;
  pick: (history: DrawRow[], t: number) => PickResult | null;
}

interface PickResult {
  number: number;
  strategyKey: string;
  strategyName: string;
  metrics?: CandidateMetric;
}

@Injectable()
export class POneKillService {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private metricCache = new Map<string, CandidateMetric>();
  private rankingCache = new Map<number, CandidateMetric[]>();
  private pickCache = new Map<string, PickResult | null>();

  async getPrediction(source: SourceType = 'default') {
    this.metricCache.clear();
    this.rankingCache.clear();
    this.pickCache.clear();

    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 75) {
      return {
        source,
        status: 'insufficient-history',
        message: '至少需要 75 期历史数据，才能完成前 5 期候选、近 20/50 期滚动回测与策略预热。',
        historyCount: history.length,
      };
    }

    const prediction = this.pickAdaptive(history, history.length);
    const backtest20 = this.buildBacktest(history, 20);
    const backtest50 = this.buildBacktest(history, 50);
    const candidateRanking = this.rankCandidates(history, history.length).slice(0, 16);
    const latest = history[history.length - 1];
    const lastFive = history.slice(-5);
    const target20 = backtest20.successRate >= 1;
    const target50 = backtest50.successRate > 0.94;

    return {
      source,
      status: target20 && target50 ? 'target-met' : 'best-effort',
      target: {
        last20: { required: 1, met: target20 },
        last50: { required: 0.94, met: target50 },
      },
      prediction: prediction
        ? {
            number: prediction.number,
            display: this.fmt(prediction.number),
            strategyKey: prediction.strategyKey,
            strategyName: prediction.strategyName,
            metrics: prediction.metrics,
          }
        : null,
      backtest20,
      backtest50,
      candidateRanking: candidateRanking.map((item) => ({
        ...item,
        display: this.fmt(item.n),
      })),
      historyMeta: {
        count: history.length,
        latest,
        lastFive,
        candidatePool: this.getPreviousFivePool(history, history.length).map((n) => ({
          number: n,
          display: this.fmt(n),
        })),
      },
      note:
        '本接口每次只从目标期之前 5 期出现过的号码里选择 1 个杀号。回测为无泄漏滚动口径：每一期只使用该期之前的数据库数据。',
      generatedAt: new Date().toISOString(),
    };
  }

  private buildBacktest(history: DrawRow[], count: number) {
    const rows: any[] = [];
    const start = Math.max(55, history.length - count);

    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const pick = this.pickAdaptive(history, t);
      const success = pick ? !actual.numbers.includes(pick.number) : false;

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        candidatePool: this.getPreviousFivePool(history, t),
        predictedNumber: pick?.number ?? null,
        predictedDisplay: pick ? this.fmt(pick.number) : '--',
        strategyKey: pick?.strategyKey ?? null,
        strategyName: pick?.strategyName ?? null,
        success,
      });
    }

    const successCount = rows.filter((row) => row.success).length;
    const failureCount = rows.length - successCount;

    return {
      count: rows.length,
      successCount,
      failureCount,
      successRate: rows.length > 0 ? successCount / rows.length : 0,
      isPerfect: rows.length > 0 && failureCount === 0,
      rows: rows.reverse(),
    };
  }

  private pickAdaptive(history: DrawRow[], t: number): PickResult | null {
    const strategies = this.getStrategies();
    const scored = strategies.map((strategy) => {
      const recent10 = this.scoreStrategy(history, t, strategy, 10);
      const recent20 = this.scoreStrategy(history, t, strategy, 20);
      const recent50 = this.scoreStrategy(history, t, strategy, 50);
      const pick = this.pickWithCache(history, t, strategy);
      return { strategy, pick, recent10, recent20, recent50 };
    });

    return (
      scored
        .filter((item) => item.pick)
        .sort(
          (a, b) =>
            Number(b.recent20.successRate >= 1) - Number(a.recent20.successRate >= 1) ||
            b.recent50.successRate - a.recent50.successRate ||
            b.recent20.successRate - a.recent20.successRate ||
            b.recent10.successRate - a.recent10.successRate ||
            b.recent20.successCount - a.recent20.successCount ||
            b.recent50.successCount - a.recent50.successCount ||
            a.strategy.key.localeCompare(b.strategy.key),
        )[0]?.pick || null
    );
  }

  private scoreStrategy(history: DrawRow[], t: number, strategy: Strategy, count: number) {
    let successCount = 0;
    let total = 0;
    const start = Math.max(55, t - count);

    for (let p = start; p < t; p++) {
      const pick = this.pickWithCache(history, p, strategy);
      if (!pick) continue;
      total++;
      if (!history[p].numbers.includes(pick.number)) successCount++;
    }

    return {
      successCount,
      total,
      successRate: total > 0 ? successCount / total : 0,
    };
  }

  private pickWithCache(history: DrawRow[], t: number, strategy: Strategy): PickResult | null {
    const key = `${strategy.key}:${t}`;
    if (this.pickCache.has(key)) return this.pickCache.get(key) || null;
    const pick = strategy.pick(history, t);
    this.pickCache.set(key, pick);
    return pick;
  }

  private getStrategies(): Strategy[] {
    const scoreStrategy = (key: string, name: string, score: (m: CandidateMetric) => number): Strategy => ({
      key,
      name,
      pick: (history, t) => this.pickByScore(history, t, key, name, score),
    });

    return [
      scoreStrategy('feature-zero', '同类五期特征零失败优先', (m) => m.featureAccuracy * 1000 + m.featureSamples * 4 - m.featureFailures * 80 + m.missInFive),
      scoreStrategy('transition-low', '转移风险最低', (m) => -m.transitionRisk * 100 + m.featureAccuracy * 10 + m.missInFive),
      scoreStrategy('hot-repeat-block', '五期高频防重开', (m) => m.appearInFive * 20 + m.freq20 * 2 - m.missAll * 0.15),
      scoreStrategy('wide-hot-block', '中长热号回落', (m) => m.freq50 * 3 + m.freq20 * 2 + m.tailPressure),
      scoreStrategy('latest-hot-block', '最新期出现优先排除', (m) => (m.missInFive === 0 ? 80 : 0) + m.freq10 * 4 + m.nearPressure),
      scoreStrategy('tail-pressure', '尾数压力排除', (m) => m.tailPressure * 8 + m.appearInFive * 6 + m.featureAccuracy * 5),
      scoreStrategy('zone-pressure', '分区压力排除', (m) => m.zonePressure * 5 + m.freq20 * 2 + m.featureAccuracy * 6),
      scoreStrategy('cold-in-window', '五期内转冷排除', (m) => m.missInFive * 18 + m.missAll * 0.6 - m.freq10),
      scoreStrategy('balanced-low-risk', '低转移高样本综合', (m) => m.featureAccuracy * 60 + m.featureSamples * 2 - m.transitionRisk * 40 + m.appearInFive * 3),
      scoreStrategy(
        'rolling-window-optimized',
        '滚动窗口优化公式',
        (m) =>
          -7.2 * m.appearInFive -
          21.64 * m.missInFive -
          22.79 * m.freq10 +
          12.16 * m.freq20 +
          10.34 * m.freq50 -
          0.93 * m.missAll -
          18.36 * m.tailPressure +
          12.64 * m.zonePressure -
          24.76 * m.nearPressure -
          113.25 * m.transitionRisk +
          107.55 * m.featureAccuracy -
          16.47 * m.featureSamples -
          10.57 * m.featureFailures,
      ),
    ];
  }

  private pickByScore(
    history: DrawRow[],
    t: number,
    key: string,
    name: string,
    score: (m: CandidateMetric) => number,
  ): PickResult | null {
    const ranked = this.rankCandidates(history, t);
    const best = ranked
      .map((metrics) => ({ metrics, score: score(metrics) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.metrics.featureAccuracy - a.metrics.featureAccuracy ||
          b.metrics.featureSamples - a.metrics.featureSamples ||
          b.metrics.missInFive - a.metrics.missInFive ||
          a.metrics.n - b.metrics.n,
      )[0];

    if (!best) return null;
    return {
      number: best.metrics.n,
      strategyKey: key,
      strategyName: name,
      metrics: best.metrics,
    };
  }

  private rankCandidates(history: DrawRow[], t: number): CandidateMetric[] {
    const cached = this.rankingCache.get(t);
    if (cached) return cached;

    const ranking = this.getPreviousFivePool(history, t)
      .map((n) => this.buildMetric(history, t, n))
      .sort(
        (a, b) =>
          b.featureAccuracy - a.featureAccuracy ||
          b.featureSamples - a.featureSamples ||
          a.featureFailures - b.featureFailures ||
          b.missInFive - a.missInFive ||
          a.transitionRisk - b.transitionRisk ||
          a.n - b.n,
      );
    this.rankingCache.set(t, ranking);
    return ranking;
  }

  private buildMetric(history: DrawRow[], t: number, n: number): CandidateMetric {
    const cacheKey = `${t}:${n}`;
    const cached = this.metricCache.get(cacheKey);
    if (cached) return cached;

    const window = history.slice(t - 5, t);
    const flat = window.flatMap((row) => row.numbers);
    const appearInFive = flat.filter((x) => x === n).length;
    const missInFive = this.missInWindow(window, n);
    const featureStats = this.featureStats(history, t, n, this.featureKey(window, n));

    const metric = {
      n,
      appearInFive,
      missInFive,
      freq10: this.freq(history, t, n, 10),
      freq20: this.freq(history, t, n, 20),
      freq50: this.freq(history, t, n, 50),
      missAll: this.missAll(history, t, n),
      tailPressure: flat.filter((x) => x % 10 === n % 10).length,
      zonePressure: flat.filter((x) => Math.floor((x - 1) / 10) === Math.floor((n - 1) / 10)).length,
      nearPressure: flat.filter((x) => Math.abs(x - n) <= 2).length,
      transitionRisk: this.transitionRisk(history, t, n),
      featureAccuracy: featureStats.samples > 0 ? (featureStats.samples - featureStats.failures) / featureStats.samples : 0,
      featureSamples: featureStats.samples,
      featureFailures: featureStats.failures,
    };
    this.metricCache.set(cacheKey, metric);
    return metric;
  }

  private featureStats(history: DrawRow[], t: number, n: number, key: string) {
    let samples = 0;
    let failures = 0;

    for (let i = 5; i < t; i++) {
      const previousFive = history.slice(i - 5, i);
      if (!this.getPreviousFivePool(history, i).includes(n)) continue;
      if (this.featureKey(previousFive, n) !== key) continue;
      samples++;
      if (history[i].numbers.includes(n)) failures++;
    }

    return { samples, failures };
  }

  private featureKey(window: DrawRow[], n: number) {
    const flat = window.flatMap((row) => row.numbers);
    const appear = flat.filter((x) => x === n).length;
    const miss = this.missInWindow(window, n);
    const tail = flat.filter((x) => x % 10 === n % 10).length;
    const zone = flat.filter((x) => Math.floor((x - 1) / 10) === Math.floor((n - 1) / 10)).length;
    const latest = window[window.length - 1]?.numbers.includes(n) ? 1 : 0;
    return [appear, Math.min(miss, 4), Math.min(tail, 5), Math.min(zone, 8), latest].join('|');
  }

  private transitionRisk(history: DrawRow[], t: number, n: number) {
    if (t < 8) return 0;
    const anchors = history[t - 1].numbers;
    let seen = 0;
    let hit = 0;

    for (let i = 1; i < t; i++) {
      const overlap = history[i - 1].numbers.filter((x) => anchors.includes(x)).length;
      if (overlap === 0) continue;
      seen += overlap;
      if (history[i].numbers.includes(n)) hit += overlap;
    }

    return seen > 0 ? hit / seen : 0;
  }

  private getPreviousFivePool(history: DrawRow[], t: number) {
    return [...new Set(history.slice(t - 5, t).flatMap((row) => row.numbers))].sort((a, b) => a - b);
  }

  private freq(history: DrawRow[], t: number, n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, t - window); i < t; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
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
      .map((item) => {
        const numbers = [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);
        return { id: item.id, year: item.year, No: item.No, numbers };
      })
      .filter((item) => item.numbers.length === 7)
      .sort((a, b) => {
        if ((a.year || 0) !== (b.year || 0)) return (a.year || 0) - (b.year || 0);
        if ((a.No || 0) !== (b.No || 0)) return (a.No || 0) - (b.No || 0);
        return (a.id || 0) - (b.id || 0);
      });
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
