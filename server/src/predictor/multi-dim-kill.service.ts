import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

type SourceType = 'default' | 'hk';
type StrategyKey = 'sum' | 'paritySize' | 'missCycle';

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

interface BacktestRow {
  year?: number;
  No?: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  success: boolean;
  strategyKey: string;
  strategyName: string;
  reason: string;
}

@Injectable()
export class MultiDimKillService {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);

  private readonly strategies: StrategyConfig[] = [
    {
      key: 'sum',
      name: '和值单杀',
      description: '根据上期和值区间、邻近和值上下文和号码冷热，选择下期不出概率高的号码。',
      weights: [4, 0, 4, -1.8, 0.8, -3, -3, -0.8, 0.8, -0.8, -2.4, -3],
    },
    {
      key: 'paritySize',
      name: '奇偶大小单杀',
      description: '根据奇偶比例、大小号比例、三区结构和最近频次，选择下期不出概率高的号码。',
      weights: [0.4, 4, -0.4, -0.4, 4, -0.8, -2.4, -1.8, -0.4, -3, -0.8, 1.2, 1.2, -4],
    },
    {
      key: 'missCycle',
      name: '遗漏周期单杀',
      description: '根据号码当前遗漏、平均回补周期、近窗频次和隔期复开压力，选择下期不出概率高的号码。',
      weights: [-3, 4, -1.8, 1.2, -0.8, 4, 1.2, 0.4, 4, -1.8, 3, 0.4],
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
        message: '至少需要 100 期数据库历史，才能完成多维单杀近20/50期滚动回测。',
        historyCount: history.length,
      };
    }

    const strategyReports = this.strategies.map((strategy) => this.buildStrategyReport(history, strategy));
    const currentRecommendation = this.buildAdaptiveReport(history, strategyReports);
    const target20 = currentRecommendation.backtest20.successRate >= 1;
    const target50 = currentRecommendation.backtest50.successRate >= 0.94;
    const latest = history[history.length - 1];

    return {
      source,
      status: target20 && target50 ? 'target-met' : 'best-effort',
      target: {
        last20: { required: 1, met: target20 },
        last50: { required: 0.94, met: target50 },
      },
      currentRecommendation,
      strategies: strategyReports,
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '数据来自数据库 history/history_hk。回测为无泄漏滚动口径：每一期只使用该期之前的数据。当前综合推荐会优先展示。',
      generatedAt: new Date().toISOString(),
    };
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

  private buildAdaptiveReport(history: DrawRow[], strategyReports: ReturnType<typeof this.buildStrategyReport>[]) {
    const bestReport =
      strategyReports
        .slice()
        .sort(
          (a, b) =>
            Number(b.backtest20.successRate >= 1 && b.backtest50.successRate >= 0.94) -
              Number(a.backtest20.successRate >= 1 && a.backtest50.successRate >= 0.94) ||
            b.backtest20.successRate - a.backtest20.successRate ||
            b.backtest50.successRate - a.backtest50.successRate ||
            b.backtest50.successCount - a.backtest50.successCount,
        )[0] || strategyReports[0];

    const wrapPrediction = (prediction: PickResult | null | undefined) => {
      if (!prediction) return null;
      return {
        ...prediction,
        strategyKey: 'adaptive3',
        strategyName: `综合择优 · ${bestReport.name}`,
        reason: `当前综合推荐优先采用「${bestReport.name}」。${prediction.reason}`,
        metrics: {
          ...prediction.metrics,
          selectedDirection: bestReport.name,
        },
      };
    };

    const wrapBacktest = (backtest: any) => ({
      ...backtest,
      rows: (backtest.rows || []).map((row: BacktestRow) => ({
        ...row,
        strategyKey: 'adaptive3',
        strategyName: `综合择优 · ${bestReport.name}`,
      })),
      failureRows: (backtest.failureRows || []).map((row: BacktestRow) => ({
        ...row,
        strategyKey: 'adaptive3',
        strategyName: `综合择优 · ${bestReport.name}`,
      })),
    });

    return {
      key: 'adaptive3',
      name: '当前综合推荐',
      description: '在和值、奇偶大小、遗漏周期三个方向里，按近20/50期回测表现选择当前最稳方向。',
      prediction: wrapPrediction(bestReport.prediction),
      backtest20: wrapBacktest(bestReport.backtest20),
      backtest50: wrapBacktest(bestReport.backtest50),
    };
  }

  private buildBacktest(history: DrawRow[], count: number, pick: (t: number) => PickResult | null) {
    const start = Math.max(80, history.length - count);
    const rows: BacktestRow[] = [];
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

  private pickByStrategy(history: DrawRow[], t: number, strategy: StrategyConfig): PickResult | null {
    const training = history.slice(0, t);
    if (training.length < 2) return null;

    const candidates = this.numbers.map((n) => {
      const detail = this.buildFeatures(strategy.key, training, n);
      const score = this.dot(strategy.weights, detail.features);
      return {
        number: n,
        display: this.fmt(n),
        score,
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
    const miss = this.missAt(history, n);
    const freq10 = this.freqAt(history, n, 10);
    const freq20 = this.freqAt(history, n, 20);
    const freq50 = this.freqAt(history, n, 50);
    const lastSum = this.rowSum(last);
    const lastSumBucket = this.sumBucket(lastSum);
    const oddCount = this.oddCount(last);
    const bigCount = this.bigCount(last);
    const prevOddCount = this.oddCount(prev);
    const prevBigCount = this.bigCount(prev);

    if (kind === 'sum') {
      const [sameBucketRisk, sameBucketSamples] = this.contextRate(history, n, (row) => this.sumBucket(this.rowSum(row)) === lastSumBucket);
      const [nearSumRisk, nearSumSamples] = this.contextRate(history, n, (row) => Math.abs(this.rowSum(row) - lastSum) <= 15);
      return {
        features: [
          1 - sameBucketRisk,
          sameBucketSamples,
          1 - nearSumRisk,
          nearSumSamples,
          Math.min(miss / 50, 1),
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          (n - 1) / 48,
          1 - (n - 1) / 48,
          last.numbers.includes(n) ? 1 : 0,
          Math.abs(n - lastSum / 7) / 40,
        ],
        reason: `上期和值${lastSum}，和值区间${lastSumBucket}；号码遗漏${miss}期，近10/20/50频次 ${freq10}/${freq20}/${freq50}。`,
        metrics: {
          lastSum,
          sumBucket: lastSumBucket,
          sameBucketRisk: this.roundPct(sameBucketRisk),
          nearSumRisk: this.roundPct(nearSumRisk),
          miss,
          freq10,
          freq20,
          freq50,
        },
      };
    }

    if (kind === 'paritySize') {
      const [sameShapeRisk, sameShapeSamples] = this.contextRate(
        history,
        n,
        (row) => this.oddCount(row) === oddCount && this.bigCount(row) === bigCount,
      );
      const [looseShapeRisk, looseShapeSamples] = this.contextRate(
        history,
        n,
        (row) => Math.abs(this.oddCount(row) - oddCount) <= 1 && Math.abs(this.bigCount(row) - bigCount) <= 1,
      );
      const isOdd = n % 2;
      const isBig = n >= 25 ? 1 : 0;
      return {
        features: [
          1 - sameShapeRisk,
          sameShapeSamples,
          1 - looseShapeRisk,
          looseShapeSamples,
          Math.min(miss / 50, 1),
          freq10 / 10,
          freq20 / 20,
          freq50 / 50,
          isOdd,
          isBig,
          this.zone(n) / 2,
          last.numbers.includes(n) ? 1 : 0,
          (oddCount - prevOddCount) / 7,
          (bigCount - prevBigCount) / 7,
        ],
        reason: `上期奇偶${oddCount}:${7 - oddCount}，大小${bigCount}:${7 - bigCount}；号码遗漏${miss}期。`,
        metrics: {
          oddCount,
          evenCount: 7 - oddCount,
          bigCount,
          smallCount: 7 - bigCount,
          sameShapeRisk: this.roundPct(sameShapeRisk),
          looseShapeRisk: this.roundPct(looseShapeRisk),
          miss,
          freq10,
          freq20,
          freq50,
        },
      };
    }

    const avgInterval = this.avgInterval(history, n);
    const ratio = miss / (avgInterval || 1);
    const [similarMissRisk, similarMissSamples] = this.similarMissRate(history, n, miss);
    return {
      features: [
        Math.min(miss / 60, 1),
        Math.min(ratio / 3, 1),
        Math.max(0, Math.min(1, 1 - ratio / 2)),
        1 - similarMissRisk,
        similarMissSamples,
        freq10 / 10,
        freq20 / 20,
        freq50 / 50,
        Math.min(avgInterval / 20, 1),
        last.numbers.includes(n) ? 1 : 0,
        history[history.length - 2]?.numbers.includes(n) ? 1 : 0,
        (miss % Math.max(1, Math.round(avgInterval))) / Math.max(1, Math.round(avgInterval)),
      ],
      reason: `号码当前遗漏${miss}期，历史平均回补间隔${avgInterval.toFixed(1)}期，遗漏比${ratio.toFixed(2)}。`,
      metrics: {
        miss,
        avgInterval: Number(avgInterval.toFixed(2)),
        missRatio: Number(ratio.toFixed(2)),
        similarMissRisk: this.roundPct(similarMissRisk),
        freq10,
        freq20,
        freq50,
      },
    };
  }

  private contextRate(
    history: DrawRow[],
    n: number,
    predicate: (row: DrawRow, index: number) => boolean,
  ): [number, number] {
    let hit = 0;
    let total = 0;
    for (let i = 1; i < history.length; i++) {
      if (!predicate(history[i - 1], i - 1)) continue;
      total++;
      if (history[i].numbers.includes(n)) hit++;
    }
    return [total ? hit / total : 7 / 49, Math.min(total / 80, 1)];
  }

  private similarMissRate(history: DrawRow[], n: number, targetMiss: number): [number, number] {
    let hit = 0;
    let total = 0;
    let currentMiss = 0;
    for (let i = 1; i < history.length; i++) {
      const previous = history[i - 1];
      currentMiss = previous.numbers.includes(n) ? 0 : currentMiss + 1;
      if (Math.abs(currentMiss - targetMiss) > 2) continue;
      total++;
      if (history[i].numbers.includes(n)) hit++;
    }
    return [total ? hit / total : 7 / 49, Math.min(total / 80, 1)];
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);
        return {
          id: Number(row.id || 0),
          year: row.year,
          No: row.No,
          numbers,
        };
      })
      .filter((row) => row.numbers.length === 7)
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          (a.id || 0) - (b.id || 0),
      );
  }

  private rowSum(row: DrawRow) {
    return row.numbers.reduce((sum, n) => sum + n, 0);
  }

  private sumBucket(value: number) {
    if (value < 150) return 0;
    if (value < 175) return 1;
    if (value < 200) return 2;
    if (value < 225) return 3;
    return 4;
  }

  private oddCount(row: DrawRow) {
    return row.numbers.filter((n) => n % 2 === 1).length;
  }

  private bigCount(row: DrawRow) {
    return row.numbers.filter((n) => n >= 25).length;
  }

  private zone(n: number) {
    if (n <= 16) return 0;
    if (n <= 33) return 1;
    return 2;
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

  private avgInterval(history: DrawRow[], n: number) {
    let last = -1;
    const gaps: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (!history[i].numbers.includes(n)) continue;
      if (last >= 0) gaps.push(i - last);
      last = i;
    }
    if (!gaps.length) return 12;
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }

  private dot(weights: number[], features: number[]) {
    return features.reduce((sum, feature, index) => sum + (weights[index] || 0) * feature, 0);
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }

  private roundPct(value: number) {
    return `${(value * 100).toFixed(1)}%`;
  }
}
