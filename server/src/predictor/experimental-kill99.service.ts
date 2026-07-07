import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type StrategyKey = 'pairAfter' | 'pairAfterTailNeutral' | 'pairExact3' | 'phaseNo';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface PickResult {
  number: number;
  display: string;
  score: number;
  strategyKey: StrategyKey;
  strategyName: string;
  reason: string;
  metrics: Record<string, number | string | undefined>;
}

interface StrategyConfig {
  key: StrategyKey;
  name: string;
  description: string;
  pick: (history: DrawRow[], t: number) => PickResult | null;
}

@Injectable()
export class ExperimentalKill99Service {
  constructor(private readonly historyService: HistoryService) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);
  private readonly pickCache = new Map<string, PickResult | null>();

  async getPrediction() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    this.pickCache.clear();

    if (history.length < 120) {
      return {
        source: 'history',
        status: 'insufficient-history',
        message: '至少需要 120 期 history 数据库历史，才能完成 99 新实验近20/50期滚动回测。',
        historyCount: history.length,
      };
    }

    const strategies = this.getStrategies().map((strategy) => this.buildStrategyReport(history, strategy));
    const best = strategies
      .slice()
      .sort(
        (a, b) =>
          Number(b.backtest20.successRate >= 1 && b.backtest50.successRate >= 0.98) -
            Number(a.backtest20.successRate >= 1 && a.backtest50.successRate >= 0.98) ||
          b.backtest50.successRate - a.backtest50.successRate ||
          b.backtest20.successRate - a.backtest20.successRate ||
          b.backtest50.successCount - a.backtest50.successCount ||
          this.strategyPriority(b.key) - this.strategyPriority(a.key),
      )[0];
    const latest = history[history.length - 1];

    return {
      source: 'history',
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
            key: 'experimental99',
            name: '99新实验优选单杀',
            description: '只在双号重叠后验家族、精确三号重叠、期号相位这些非98方向里，选择近20/50期表现最稳的方向。',
            prediction: best.prediction && {
              ...best.prediction,
              strategyKey: 'experimental99',
              strategyName: `99新实验优选 · ${best.name}`,
              reason: `当前新实验优选采用「${best.name}」。${best.prediction.reason}`,
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
        '99新实验只使用数据库 history 表；已去掉 98 实验里的质合模数、跨度区间、和值尾、邻号、分区等方向。回测为无泄漏滚动口径。',
      generatedAt: new Date().toISOString(),
    };
  }

  buildComboReportFromRows(rawRows: any[]) {
    const history = this.normalizeRows(rawRows);
    this.pickCache.clear();
    const strategies = this.getStrategies().map((strategy) => this.buildStrategyReport(history, strategy));
    const best = strategies
      .slice()
      .sort(
        (a, b) =>
          Number(b.backtest20.successRate >= 1 && b.backtest50.successRate >= 0.98) -
            Number(a.backtest20.successRate >= 1 && a.backtest50.successRate >= 0.98) ||
          b.backtest50.successRate - a.backtest50.successRate ||
          b.backtest20.successRate - a.backtest20.successRate ||
          b.backtest50.successCount - a.backtest50.successCount ||
          this.strategyPriority(b.key) - this.strategyPriority(a.key),
      )[0];

    return { best, strategies };
  }

  private getStrategies(): StrategyConfig[] {
    return [
      {
        key: 'pairAfter',
        name: '双号重叠后验单杀',
        description: '历史上上一期与当前上期至少重叠两个号时，统计下一期各号码的加权出现风险。',
        pick: (history, t) => this.pickCached('pairAfter', history, t, () => this.pickPairAfter(history, t)),
      },
      {
        key: 'pairAfterTailNeutral',
        name: '双号重叠叠尾位轻修正',
        description: '在双号重叠后验基础上，给相同尾位历史样本轻微加权，用于观察稳定性。',
        pick: (history, t) => this.pickCached('pairAfterTailNeutral', history, t, () => this.pickPairAfterTailNeutral(history, t)),
      },
      {
        key: 'pairExact3',
        name: '精确三号重叠单杀',
        description: '只统计历史上上一期与当前上期恰好重叠三个号的样本，作为更严格的观察方向。',
        pick: (history, t) => this.pickCached('pairExact3', history, t, () => this.pickPairExact3(history, t)),
      },
      {
        key: 'phaseNo',
        name: '期号相位单杀',
        description: '只看期号余数相位和号码近期冷热，不使用质合、跨度、和值等98特征。',
        pick: (history, t) => this.pickCached('phaseNo', history, t, () => this.pickPhaseNo(history, t)),
      },
    ];
  }

  private buildStrategyReport(history: DrawRow[], strategy: StrategyConfig) {
    return {
      key: strategy.key,
      name: strategy.name,
      description: strategy.description,
      prediction: strategy.pick(history, history.length),
      backtest20: this.buildBacktest(history, 20, strategy),
      backtest50: this.buildBacktest(history, 50, strategy),
    };
  }

  private buildBacktest(history: DrawRow[], count: number, strategy: StrategyConfig) {
    const start = Math.max(100, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const prediction = strategy.pick(history, t);
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
        strategyKey: 'experimental99',
        strategyName: `99新实验优选 · ${strategyName}`,
      })),
      failureRows: (backtest.failureRows || []).map((row: any) => ({
        ...row,
        strategyKey: 'experimental99',
        strategyName: `99新实验优选 · ${strategyName}`,
      })),
    };
  }

  private strategyPriority(key: StrategyKey) {
    const priority: Record<StrategyKey, number> = {
      pairAfter: 4,
      pairAfterTailNeutral: 3,
      pairExact3: 2,
      phaseNo: 1,
    };
    return priority[key] || 0;
  }

  private pickCached(key: StrategyKey, history: DrawRow[], t: number, build: () => PickResult | null) {
    const cacheKey = `${key}:${t}`;
    if (this.pickCache.has(cacheKey)) return this.pickCache.get(cacheKey) || null;
    const value = build();
    this.pickCache.set(cacheKey, value);
    return value;
  }

  private pickPairAfter(history: DrawRow[], t: number) {
    const training = history.slice(0, t);
    const last = training[training.length - 1];
    if (!last) return null;

    const ranked = this.numbers
      .map((n) => {
        let hit = 0;
        let weightedTotal = 0;
        let samples = 0;
        for (let i = 1; i < training.length; i++) {
          const overlap = training[i - 1].numbers.filter((x) => last.numbers.includes(x)).length;
          if (overlap < 2) continue;
          const weight = (overlap * (overlap - 1)) / 2;
          samples++;
          weightedTotal += weight;
          if (training[i].numbers.includes(n)) hit += weight;
        }
        const risk = weightedTotal ? hit / weightedTotal : 7 / 49;
        const freq5 = this.freqAt(training, n, 5);
        const freq20 = this.freqAt(training, n, 20);
        const score =
          (1 - risk) * 5.5 +
          Math.min(weightedTotal / 180, 1) -
          freq5 * 1.1 -
          freq20 * 0.22 +
          (last.numbers.includes(n) ? 0.5 : 0);
        return this.makePick(n, score, 'pairAfter', '双号重叠后验单杀', `相似重叠样本${samples}期，加权出现风险${(risk * 100).toFixed(1)}%；近5/20频次${freq5}/${freq20}。`, {
          samples,
          weightedTotal: Number(weightedTotal.toFixed(1)),
          risk: Number(risk.toFixed(4)),
          freq5,
          freq20,
        });
      })
      .sort((a, b) => b.score - a.score || a.number - b.number);
    return ranked[0] || null;
  }

  private pickPairAfterTailNeutral(history: DrawRow[], t: number) {
    const training = history.slice(0, t);
    const last = training[training.length - 1];
    if (!last) return null;

    const ranked = this.numbers
      .map((n) => {
        let hit = 0;
        let weightedTotal = 0;
        let samples = 0;
        for (let i = 1; i < training.length; i++) {
          const prev = training[i - 1];
          const overlap = prev.numbers.filter((x) => last.numbers.includes(x)).length;
          if (overlap < 2) continue;
          const tailBoost = prev.numbers.some((x) => this.tail(x) === this.tail(n)) ? 0.35 : 0;
          const weight = (overlap * (overlap - 1)) / 2 + tailBoost;
          samples++;
          weightedTotal += weight;
          if (training[i].numbers.includes(n)) hit += weight;
        }
        const risk = weightedTotal ? hit / weightedTotal : 7 / 49;
        const freq5 = this.freqAt(training, n, 5);
        const freq20 = this.freqAt(training, n, 20);
        const score =
          (1 - risk) * 5.2 +
          Math.min(weightedTotal / 180, 1) -
          freq5 * 1.05 -
          freq20 * 0.2 +
          (last.numbers.includes(n) ? 0.45 : 0);
        return this.makePick(n, score, 'pairAfterTailNeutral', '双号重叠叠尾位轻修正', `重叠样本${samples}期，尾位轻修正后风险${(risk * 100).toFixed(1)}%；近5/20频次${freq5}/${freq20}。`, {
          samples,
          weightedTotal: Number(weightedTotal.toFixed(1)),
          risk: Number(risk.toFixed(4)),
          freq5,
          freq20,
          tail: this.tail(n),
        });
      })
      .sort((a, b) => b.score - a.score || a.number - b.number);
    return ranked[0] || null;
  }

  private pickPairExact3(history: DrawRow[], t: number) {
    const training = history.slice(0, t);
    const last = training[training.length - 1];
    if (!last) return null;

    const ranked = this.numbers
      .map((n) => {
        let hit = 0;
        let total = 0;
        for (let i = 1; i < training.length; i++) {
          const overlap = training[i - 1].numbers.filter((x) => last.numbers.includes(x)).length;
          if (overlap !== 3) continue;
          total++;
          if (training[i].numbers.includes(n)) hit++;
        }
        const risk = total ? hit / total : 7 / 49;
        const freq5 = this.freqAt(training, n, 5);
        const freq20 = this.freqAt(training, n, 20);
        const score =
          (1 - risk) * 5 +
          Math.min(total / 40, 1) -
          freq5 * 1.05 -
          freq20 * 0.2;
        return this.makePick(n, score, 'pairExact3', '精确三号重叠单杀', `恰好三号重叠样本${total}期，出现风险${(risk * 100).toFixed(1)}%；近5/20频次${freq5}/${freq20}。`, {
          samples: total,
          risk: Number(risk.toFixed(4)),
          freq5,
          freq20,
        });
      })
      .sort((a, b) => b.score - a.score || a.number - b.number);
    return ranked[0] || null;
  }

  private pickPhaseNo(history: DrawRow[], t: number) {
    const training = history.slice(0, t);
    const last = training[training.length - 1];
    if (!last) return null;

    const ranked = this.numbers
      .map((n) => {
        const miss = this.missAt(training, n);
        const freq10 = this.freqAt(training, n, 10);
        const freq30 = this.freqAt(training, n, 30);
        const [mod7Risk, mod7Samples] = this.contextRate(training, n, (row) => (row.No || 0) % 7 === (last.No || 0) % 7);
        const [mod13Risk, mod13Samples] = this.contextRate(training, n, (row) => (row.No || 0) % 13 === (last.No || 0) % 13);
        const [yearMod5Risk, yearMod5Samples] = this.contextRate(
          training,
          n,
          (row) => row.year === last.year && (row.No || 0) % 5 === (last.No || 0) % 5,
        );
        const score =
          (1 - mod7Risk) * 2.2 +
          mod7Samples +
          (1 - mod13Risk) * 2.6 +
          mod13Samples +
          (1 - yearMod5Risk) * 1.2 -
          freq10 * 0.65 -
          freq30 * 0.12 +
          Math.min(miss / 35, 1) * 0.25;
        return this.makePick(n, score, 'phaseNo', '期号相位单杀', `期号相位：No%7=${(last.No || 0) % 7}、No%13=${(last.No || 0) % 13}；号码近10频次${freq10}。`, {
          noMod7: (last.No || 0) % 7,
          noMod13: (last.No || 0) % 13,
          miss,
          freq10,
          freq30,
          mod7Samples,
          mod13Samples,
          yearMod5Samples,
        });
      })
      .sort((a, b) => b.score - a.score || a.number - b.number);
    return ranked[0] || null;
  }

  private makePick(
    number: number,
    score: number,
    strategyKey: StrategyKey,
    strategyName: string,
    reason: string,
    metrics: Record<string, number | string | undefined>,
  ): PickResult {
    return {
      number,
      display: this.fmt(number),
      score: Number(score.toFixed(4)),
      strategyKey,
      strategyName,
      reason,
      metrics,
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

  private tail(n: number) {
    return n % 10;
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
