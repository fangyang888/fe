import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

type SourceType = 'default' | 'hk';
type StrategyKey = 'modPrime' | 'spanRange' | 'sumTailShape' | 'neighborPressure' | 'zoneDensity';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface StrategyConfig {
  key: StrategyKey;
  name: string;
  description: string;
  weights: number[];
}

interface PickResult {
  number: number;
  display: string;
  score: number;
  strategyKey: string;
  strategyName: string;
  reason: string;
  metrics: Record<string, number | string | undefined>;
}

@Injectable()
export class ExperimentalKill98Service {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);
  private readonly primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);

  private readonly strategies: StrategyConfig[] = [
    {
      key: 'modPrime',
      name: '质合模数单杀',
      description: '结合质数/合数个数、模3/模4/模7余数压力、近期频次和遗漏。',
      weights: [-0.4, -1.8, -1.8, 0, 1.2, -2.4, -2.4, 0.4, 0.4, 2.4, -3, 4, 2.4, 1.2, -0.8, -0.4, 2.4, -0.8],
    },
    {
      key: 'spanRange',
      name: '跨度区间单杀',
      description: '结合上期最小/最大区间、跨度接近度、和值邻域和边界距离。',
      weights: [1.2, -3, 0.4, -4, -0.8, 0.4, 0.8, -0.4, -4, 4, -0.8, -1.8, -1.8, 1.8, 2.4, 2.4, -3],
    },
    {
      key: 'sumTailShape',
      name: '和值尾形态单杀',
      description: '结合和值尾数、奇偶大小形态、号码尾差和近期频次。',
      weights: [0.8, 4, -2.4, 1.2, 0.4, -0.8, 3, 1.2, -1.2, 0, 2.4, -3, -1.2, -4, 0, -0.8, -0.4],
    },
    {
      key: 'neighborPressure',
      name: '邻号压力单杀',
      description: '结合上期邻号、近邻号、连号形态和近期频次。',
      weights: [1.8, 1.8, 1.8, -0.8, 4, 3, 0.4, 3, -2.4, -0.4, -2.4, 0.8, -1.8, 0.8, -4, -4, -1.8],
    },
    {
      key: 'zoneDensity',
      name: '分区密度单杀',
      description: '结合三区/五区密度、大小号结构和分区近期压力。',
      weights: [-3, -0.8, 2.4, -1.8, 2.4, -0.4, -1.8, -0.8, 3, 0.8, -3, -4, 0.8, 2.4, -3, -4, 2.4, 0],
    },
  ];

  async getPrediction(source: SourceType = 'default') {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 100) {
      return {
        source,
        status: 'insufficient-history',
        message: '至少需要 100 期数据库历史，才能完成实验方向近20/50期滚动回测。',
        historyCount: history.length,
      };
    }

    const strategies = this.strategies.map((strategy) => this.buildStrategyReport(history, strategy));
    const best = strategies
      .slice()
      .sort(
        (a, b) =>
          Number(b.backtest20.successRate >= 1 && b.backtest50.successRate >= 0.98) -
            Number(a.backtest20.successRate >= 1 && a.backtest50.successRate >= 0.98) ||
          b.backtest50.successRate - a.backtest50.successRate ||
          b.backtest20.successRate - a.backtest20.successRate ||
          b.backtest50.successCount - a.backtest50.successCount,
      )[0];
    const latest = history[history.length - 1];

    return {
      source,
      status:
        best?.backtest20.successRate >= 1 && best?.backtest50.successRate >= 0.98
          ? 'target-met'
          : 'best-effort',
      target: {
        last20: { required: 1, met: (best?.backtest20.successRate || 0) >= 1 },
        last50: { required: 0.98, met: (best?.backtest50.successRate || 0) >= 0.98 },
      },
      currentRecommendation: best
        ? {
            key: 'experimentalBest98',
            name: '实验优选单杀',
            description: '在新实验方向里，优先选近20期100%、近50期最高的方向。',
            prediction: best.prediction && {
              ...best.prediction,
              strategyKey: 'experimentalBest98',
              strategyName: `实验优选 · ${best.name}`,
              reason: `当前实验优选采用「${best.name}」。${best.prediction.reason}`,
            },
            backtest20: this.relabelBacktest(best.backtest20, best.name),
            backtest50: this.relabelBacktest(best.backtest50, best.name),
            sourceStrategy: best.key,
          }
        : null,
      strategies,
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '独立实验接口，不影响 /api/kill/tail-ten 和 /api/kill/multi-dim。回测为无泄漏滚动口径，每期只使用该期之前的数据库数据。',
      generatedAt: new Date().toISOString(),
    };
  }

  buildComboReportFromRows(rawRows: any[]) {
    const history = this.normalizeRows(rawRows);
    const strategies = this.strategies.map((strategy) => this.buildStrategyReport(history, strategy));
    const eligibleStrategies = strategies.filter((strategy: any) => !strategy.failureGuard?.isBlocked);
    const bestPool = eligibleStrategies.length ? eligibleStrategies : strategies;
    const best = bestPool
      .slice()
      .sort(
        (a: any, b: any) =>
          Number(
            b.backtest20.successRate >= 1 &&
              b.backtest50.successRate >= 0.98 &&
              !b.failureGuard?.isBlocked,
          ) -
            Number(
              a.backtest20.successRate >= 1 &&
                a.backtest50.successRate >= 0.98 &&
                !a.failureGuard?.isBlocked,
            ) ||
          b.backtest50.successRate - a.backtest50.successRate ||
          b.backtest20.successRate - a.backtest20.successRate ||
          b.backtest50.successCount - a.backtest50.successCount,
      )[0];

    return { best, strategies };
  }

  private buildStrategyReport(history: DrawRow[], strategy: StrategyConfig) {
    return {
      key: strategy.key,
      name: strategy.name,
      description: strategy.description,
      prediction: this.pickByStrategy(history, history.length, strategy),
      backtest20: this.buildBacktest(history, 20, (t) => this.pickByStrategy(history, t, strategy)),
      backtest50: this.buildBacktest(history, 50, (t) => this.pickByStrategy(history, t, strategy)),
    };
  }

  private buildBacktest(history: DrawRow[], count: number, pick: (t: number) => PickResult | null) {
    const start = Math.max(80, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const prediction = pick(t);
      if (!prediction) continue;
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        success: !actual.numbers.includes(prediction.number),
        strategyKey: prediction.strategyKey,
        strategyName: prediction.strategyName,
        reason: prediction.reason,
      });
    }
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      isPerfect: rows.length > 0 && successCount === rows.length,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private relabelBacktest(backtest: any, strategyName: string) {
    return {
      ...backtest,
      rows: (backtest.rows || []).map((row: any) => ({
        ...row,
        strategyKey: 'experimentalBest98',
        strategyName: `实验优选 · ${strategyName}`,
      })),
      failureRows: (backtest.failureRows || []).map((row: any) => ({
        ...row,
        strategyKey: 'experimentalBest98',
        strategyName: `实验优选 · ${strategyName}`,
      })),
    };
  }

  private pickByStrategy(history: DrawRow[], t: number, strategy: StrategyConfig): PickResult | null {
    const training = history.slice(0, t);
    if (training.length < 2) return null;
    const candidates = this.numbers.map((n) => {
      const detail = this.buildFeatures(strategy.key, training, n);
      return {
        number: n,
        display: this.fmt(n),
        score: this.dot(strategy.weights, detail.features),
        detail,
      };
    });
    candidates.sort((a, b) => b.score - a.score || a.number - b.number);
    const best = candidates[0];
    if (!best) return null;
    return {
      number: best.number,
      display: best.display,
      score: Number(best.score.toFixed(4)),
      strategyKey: strategy.key,
      strategyName: strategy.name,
      reason: best.detail.reason,
      metrics: best.detail.metrics,
    };
  }

  private buildFeatures(kind: StrategyKey, history: DrawRow[], n: number) {
    const last = history[history.length - 1];
    const prev = history[history.length - 2] || last;
    const lastNumbers = new Set(last.numbers);
    const miss = this.missAt(history, n);
    const freq5 = this.freqAt(history, n, 5);
    const freq10 = this.freqAt(history, n, 10);
    const freq20 = this.freqAt(history, n, 20);
    const freq50 = this.freqAt(history, n, 50);
    const nearLast = last.numbers.some((x) => Math.abs(x - n) <= 2) ? 1 : 0;

    if (kind === 'modPrime') {
      const primeCount = this.primeCount(last);
      const mod3 = this.mod(n, 3);
      const mod4 = this.mod(n, 4);
      const mod7 = this.mod(n, 7);
      const [samePrimeRisk, samePrimeSamples] = this.contextRate(history, n, (row) => this.primeCount(row) === primeCount);
      const [mod3Risk, mod3Samples] = this.contextRate(history, n, (row) => row.numbers.filter((x) => this.mod(x, 3) === mod3).length >= 2);
      const [mod7Risk, mod7Samples] = this.contextRate(history, n, (row) => row.numbers.filter((x) => this.mod(x, 7) === mod7).length >= 1);
      return {
        features: [
          1 - samePrimeRisk,
          samePrimeSamples,
          1 - mod3Risk,
          mod3Samples,
          1 - mod7Risk,
          mod7Samples,
          this.primes.has(n) ? 1 : 0,
          primeCount / 7,
          mod3 / 2,
          mod4 / 3,
          mod7 / 6,
          Math.min(miss / 50, 1),
          freq5 / 5,
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          lastNumbers.has(n) ? 1 : 0,
          nearLast,
        ],
        reason: `上期质数${primeCount}个；号码模3=${mod3}、模7=${mod7}，遗漏${miss}期。`,
        metrics: { primeCount, mod3, mod4, mod7, miss, freq5, freq10, freq20, freq50 },
      };
    }

    if (kind === 'spanRange') {
      const sorted = this.sorted(last);
      const low = sorted[0];
      const high = sorted[sorted.length - 1];
      const span = high - low;
      const inBand = n >= low && n <= high ? 1 : 0;
      const edgeDistance = Math.min(Math.abs(n - low), Math.abs(n - high)) / 48;
      const [spanRisk, spanSamples] = this.contextRate(history, n, (row) => Math.abs(this.span(row) - span) <= 5);
      const [bandRisk, bandSamples] = this.contextRate(history, n, (row) => {
        const s = this.sorted(row);
        return n >= s[0] && n <= s[s.length - 1];
      });
      const [sumRisk, sumSamples] = this.contextRate(history, n, (row) => Math.abs(this.rowSum(row) - this.rowSum(last)) <= 20);
      return {
        features: [
          1 - spanRisk,
          spanSamples,
          1 - bandRisk,
          bandSamples,
          1 - sumRisk,
          sumSamples,
          span / 48,
          inBand,
          edgeDistance,
          n / 49,
          1 - n / 49,
          Math.min(miss / 50, 1),
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          lastNumbers.has(n) ? 1 : 0,
          nearLast,
        ],
        reason: `上期跨度${span}，区间${this.fmt(low)}-${this.fmt(high)}；号码遗漏${miss}期。`,
        metrics: { low, high, span, inBand, edgeDistance: Number(edgeDistance.toFixed(2)), miss, freq10, freq20, freq50 },
      };
    }

    if (kind === 'sumTailShape') {
      const sumTail = this.rowSum(last) % 10;
      const numberTail = n % 10;
      const oddCount = this.oddCount(last);
      const bigCount = this.bigCount(last);
      const [sameSumTailRisk, sameSumTailSamples] = this.contextRate(history, n, (row) => this.rowSum(row) % 10 === sumTail);
      const [nearSumTailRisk, nearSumTailSamples] = this.contextRate(history, n, (row) => Math.abs((this.rowSum(row) % 10) - sumTail) <= 1);
      const [shapeRisk, shapeSamples] = this.contextRate(history, n, (row) => this.oddCount(row) === oddCount || this.bigCount(row) === bigCount);
      return {
        features: [
          1 - sameSumTailRisk,
          sameSumTailSamples,
          1 - nearSumTailRisk,
          nearSumTailSamples,
          1 - shapeRisk,
          shapeSamples,
          sumTail / 9,
          numberTail / 9,
          Math.abs(numberTail - sumTail) / 9,
          oddCount / 7,
          bigCount / 7,
          Math.min(miss / 50, 1),
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          lastNumbers.has(n) ? 1 : 0,
          nearLast,
        ],
        reason: `上期和值尾${sumTail}，号码尾${numberTail}；奇数${oddCount}个，大号${bigCount}个。`,
        metrics: { sumTail, numberTail, oddCount, bigCount, miss, freq10, freq20, freq50 },
      };
    }

    if (kind === 'neighborPressure') {
      const adjacent = last.numbers.filter((x) => Math.abs(x - n) <= 1).length;
      const near2 = last.numbers.filter((x) => Math.abs(x - n) <= 2).length;
      const prevAdjacent = prev.numbers.filter((x) => Math.abs(x - n) <= 1).length;
      const [adjRisk, adjSamples] = this.contextRate(history, n, (row) => row.numbers.some((x) => Math.abs(x - n) <= 1));
      const [nearRisk, nearSamples] = this.contextRate(history, n, (row) => row.numbers.some((x) => Math.abs(x - n) <= 2));
      const [consecutiveRisk, consecutiveSamples] = this.contextRate(history, n, (row) => {
        const sorted = this.sorted(row);
        return sorted.some((x, index) => index > 0 && x - sorted[index - 1] === 1);
      });
      return {
        features: [
          1 - adjRisk,
          adjSamples,
          1 - nearRisk,
          nearSamples,
          1 - consecutiveRisk,
          consecutiveSamples,
          adjacent / 3,
          near2 / 4,
          prevAdjacent / 3,
          Math.min(miss / 50, 1),
          freq5 / 5,
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          lastNumbers.has(n) ? 1 : 0,
          n / 49,
          1 - n / 49,
        ],
        reason: `上期邻号压力${adjacent}，近邻压力${near2}；号码遗漏${miss}期。`,
        metrics: { adjacent, near2, prevAdjacent, miss, freq5, freq10, freq20, freq50 },
      };
    }

    const zone3 = this.zone3(n);
    const zone5 = this.zone5(n);
    const lastZone3Count = last.numbers.filter((x) => this.zone3(x) === zone3).length;
    const lastZone5Count = last.numbers.filter((x) => this.zone5(x) === zone5).length;
    const recentZone3 = this.countRecent(history, 20, (x) => this.zone3(x) === zone3);
    const recentZone5 = this.countRecent(history, 20, (x) => this.zone5(x) === zone5);
    const [zone3Risk, zone3Samples] = this.contextRate(history, n, (row) => row.numbers.filter((x) => this.zone3(x) === zone3).length === lastZone3Count);
    const [zone5Risk, zone5Samples] = this.contextRate(history, n, (row) => row.numbers.filter((x) => this.zone5(x) === zone5).length === lastZone5Count);
    const [sizeRisk, sizeSamples] = this.contextRate(history, n, (row) => Math.abs(this.bigCount(row) - this.bigCount(last)) <= 1);
    return {
      features: [
        1 - zone3Risk,
        zone3Samples,
        1 - zone5Risk,
        zone5Samples,
        1 - sizeRisk,
        sizeSamples,
        lastZone3Count / 7,
        lastZone5Count / 7,
        recentZone3,
        recentZone5,
        Math.min(miss / 50, 1),
        freq5 / 5,
        freq10 / 10,
        freq20 / 20,
        freq50 / 50,
        lastNumbers.has(n) ? 1 : 0,
        zone3 / 2,
        zone5 / 4,
      ],
      reason: `号码在三区${zone3 + 1}、五区${zone5 + 1}；近20期分区密度${recentZone3.toFixed(2)}/${recentZone5.toFixed(2)}。`,
      metrics: { zone3: zone3 + 1, zone5: zone5 + 1, lastZone3Count, lastZone5Count, recentZone3: Number(recentZone3.toFixed(2)), recentZone5: Number(recentZone5.toFixed(2)), miss, freq5, freq10, freq20, freq50 },
    };
  }

  private contextRate(history: DrawRow[], n: number, predicate: (row: DrawRow, index: number) => boolean): [number, number] {
    let hit = 0;
    let total = 0;
    for (let i = 1; i < history.length; i++) {
      if (!predicate(history[i - 1], i - 1)) continue;
      total++;
      if (history[i].numbers.includes(n)) hit++;
    }
    return [total ? hit / total : 7 / 49, Math.min(total / 80, 1)];
  }

  private countRecent(history: DrawRow[], window: number, predicate: (n: number) => boolean) {
    let count = 0;
    let total = 0;
    for (let i = Math.max(0, history.length - window); i < history.length; i++) {
      history[i].numbers.forEach((n) => {
        total++;
        if (predicate(n)) count++;
      });
    }
    return total ? count / total : 0;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);
        return { id: Number(row.id || 0), year: row.year, No: row.No, numbers };
      })
      .filter((row) => row.numbers.length === 7)
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          (a.id || 0) - (b.id || 0),
      );
  }

  private sorted(row: DrawRow) {
    return row.numbers.slice().sort((a, b) => a - b);
  }

  private rowSum(row: DrawRow) {
    return row.numbers.reduce((sum, n) => sum + n, 0);
  }

  private span(row: DrawRow) {
    const sorted = this.sorted(row);
    return sorted[sorted.length - 1] - sorted[0];
  }

  private primeCount(row: DrawRow) {
    return row.numbers.filter((n) => this.primes.has(n)).length;
  }

  private oddCount(row: DrawRow) {
    return row.numbers.filter((n) => n % 2 === 1).length;
  }

  private bigCount(row: DrawRow) {
    return row.numbers.filter((n) => n >= 25).length;
  }

  private zone3(n: number) {
    if (n <= 16) return 0;
    if (n <= 33) return 1;
    return 2;
  }

  private zone5(n: number) {
    if (n <= 9) return 0;
    if (n <= 19) return 1;
    if (n <= 29) return 2;
    if (n <= 39) return 3;
    return 4;
  }

  private missAt(history: DrawRow[], n: number) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].numbers.includes(n)) return history.length - 1 - i;
    }
    return history.length;
  }

  private freqAt(history: DrawRow[], n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, history.length - window); i < history.length; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
  }

  private mod(n: number, value: number) {
    return ((n % value) + value) % value;
  }

  private dot(weights: number[], features: number[]) {
    return features.reduce((sum, feature, index) => sum + (weights[index] || 0) * feature, 0);
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
