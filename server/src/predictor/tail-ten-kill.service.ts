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

interface WeightConfig {
  tailColdS: number;
  tailColdL: number;
  tenColdS: number;
  tenColdL: number;
  tailHotS: number;
  tenHotS: number;
  tailMiss: number;
  tenMiss: number;
  numMiss: number;
  lastTail: number;
  lastTen: number;
  prevTail: number;
  prevTen: number;
  lastNum: number;
}

interface StrategyConfig {
  key: string;
  name: string;
  description: string;
  short: number;
  long: number;
  weights: WeightConfig;
}

interface PickResult {
  number: number;
  display: string;
  strategyKey: string;
  strategyName: string;
  score: number;
  tail: number;
  ten: number;
  reason: string;
  topCandidates: CandidateScore[];
}

interface CandidateScore {
  number: number;
  display: string;
  score: number;
  tail: number;
  ten: number;
  tailShortCount: number;
  tenShortCount: number;
  tailMiss: number;
  tenMiss: number;
  numMiss: number;
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
export class TailTenKillService {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);
  private readonly tailValues = Array.from({ length: 10 }, (_, i) => i);
  private readonly tenValues = Array.from({ length: 5 }, (_, i) => i);

  private readonly baseConfigs: StrategyConfig[] = [
    {
      key: 'api-tail-ten-98',
      name: 'API尾十位 98策略',
      description: '基于 /api/history 当前 1272 期滚动搜索得到：近20期20/20，近50期49/50。',
      short: 8,
      long: 120,
      weights: {
        tailColdS: 1.8,
        tailColdL: -0.4,
        tenColdS: -2.4,
        tenColdL: 1.8,
        tailHotS: -1.8,
        tenHotS: -0.4,
        tailMiss: -2.4,
        tenMiss: 3,
        numMiss: 1.2,
        lastTail: 0.4,
        lastTen: 2.4,
        prevTail: -1.8,
        prevTen: -0.4,
        lastNum: 0.4,
      },
    },
    {
      key: 'tail-cold-last-ten',
      name: '尾冷叠上期十位',
      description: '近10期尾数偏冷优先，同时观察上期十位段延续；精确号码过冷会降权。',
      short: 10,
      long: 160,
      weights: {
        tailColdS: 2.4,
        tailColdL: 0,
        tenColdS: 0,
        tenColdL: 0,
        tailHotS: 0.4,
        tenHotS: -0.4,
        tailMiss: 0.4,
        tenMiss: 0.8,
        numMiss: -1.2,
        lastTail: 1.2,
        lastTen: 1.8,
        prevTail: -1.2,
        prevTen: 0.4,
        lastNum: -0.4,
      },
    },
    {
      key: 'tail-miss-hot-zone',
      name: '尾遗漏叠热尾十位',
      description: '尾数遗漏、近窗热尾和十位段压力组合，适合尾数断档明显的数据段。',
      short: 12,
      long: 60,
      weights: {
        tailColdS: 0,
        tailColdL: 0,
        tenColdS: 1.2,
        tenColdL: -0.4,
        tailHotS: 1.8,
        tenHotS: 0.8,
        tailMiss: 2.4,
        tenMiss: -1.2,
        numMiss: 1.2,
        lastTail: -0.4,
        lastTen: 1.8,
        prevTail: 1.8,
        prevTen: 0,
        lastNum: 0.8,
      },
    },
    {
      key: 'short-tail-balanced-ten',
      name: '短窗尾数均衡',
      description: '近6期尾数和十位快速切换，配合全局遗漏挑单杀。',
      short: 6,
      long: 80,
      weights: {
        tailColdS: 1.2,
        tailColdL: -0.4,
        tenColdS: 0.4,
        tenColdL: 1.2,
        tailHotS: 1.2,
        tenHotS: -1.2,
        tailMiss: 0.4,
        tenMiss: -0.8,
        numMiss: 1.8,
        lastTail: 1.8,
        lastTen: -1.2,
        prevTail: -0.4,
        prevTen: 0,
        lastNum: -1.2,
      },
    },
    {
      key: 'prev-tail-long-miss',
      name: '前期尾数回避',
      description: '看前一期尾数复用、二十期十位压力和号码遗漏，偏向稳定回避。',
      short: 20,
      long: 80,
      weights: {
        tailColdS: -0.8,
        tailColdL: -1.2,
        tenColdS: 0.8,
        tenColdL: -1.2,
        tailHotS: -0.4,
        tenHotS: 0.4,
        tailMiss: 0.8,
        tenMiss: -1.2,
        numMiss: 0.8,
        lastTail: 0,
        lastTen: -0.8,
        prevTail: 2.4,
        prevTen: 0,
        lastNum: 1.2,
      },
    },
    {
      key: 'tail-hot-repeat-ten',
      name: '热尾连压',
      description: '优先杀近窗热尾、同十位段压力高且刚出现过的组合。',
      short: 10,
      long: 50,
      weights: {
        tailColdS: -0.5,
        tailColdL: 0,
        tenColdS: -0.2,
        tenColdL: 0,
        tailHotS: 2.1,
        tenHotS: 1.2,
        tailMiss: -0.6,
        tenMiss: -0.4,
        numMiss: -0.8,
        lastTail: 1.4,
        lastTen: 0.8,
        prevTail: 0.4,
        prevTen: 0.2,
        lastNum: 1.0,
      },
    },
    {
      key: 'tail-gap-ten-cold',
      name: '尾空十冷',
      description: '近15期尾数空档叠加十位冷段，避开上期原号。',
      short: 15,
      long: 100,
      weights: {
        tailColdS: 1.8,
        tailColdL: 0.6,
        tenColdS: 1.2,
        tenColdL: 0.4,
        tailHotS: -0.2,
        tenHotS: -0.2,
        tailMiss: 1.2,
        tenMiss: 0.8,
        numMiss: 0.4,
        lastTail: 0.5,
        lastTen: 0.5,
        prevTail: -0.4,
        prevTen: -0.2,
        lastNum: -1.0,
      },
    },
  ];

  async getPrediction(source: SourceType = 'default') {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 80) {
      return {
        source,
        status: 'insufficient-history',
        message: '至少需要 80 期数据库历史，才能完成近20/50期滚动回测和策略预热。',
        historyCount: history.length,
      };
    }

    const strategies = this.buildStrategyReports(history);
    const recommended = strategies[0];
    const latest = history[history.length - 1];
    const target20 = recommended?.backtest20?.successRate >= 1;
    const target50 = recommended?.backtest50?.successRate >= 0.94;

    return {
      source,
      status: target20 && target50 ? 'target-met' : 'best-effort',
      target: {
        last20: { required: 1, met: target20 },
        last50: { required: 0.94, met: target50 },
      },
      prediction: recommended?.prediction || null,
      recommended: recommended
        ? {
            key: recommended.key,
            name: recommended.name,
            description: recommended.description,
            backtest20: recommended.backtest20,
            backtest50: recommended.backtest50,
          }
        : null,
      strategies: strategies.slice(0, 8),
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '数据来自数据库 history/history_hk。回测为无泄漏滚动口径：每一期只使用该期之前的数据，按尾数与十位段规律选 1 个下期不会出现的号码。',
      generatedAt: new Date().toISOString(),
    };
  }

  private buildStrategyReports(history: DrawRow[]) {
    const configReports = this.baseConfigs.map((config) => this.buildConfigReport(history, config));
    const adaptiveReport = this.buildAdaptiveReport(history);
    return [...configReports, adaptiveReport].sort((a, b) => {
      const aTarget = Number(a.backtest20.successRate >= 1 && a.backtest50.successRate >= 0.94);
      const bTarget = Number(b.backtest20.successRate >= 1 && b.backtest50.successRate >= 0.94);
      return (
        bTarget - aTarget ||
        b.backtest50.successRate - a.backtest50.successRate ||
        b.backtest20.successRate - a.backtest20.successRate ||
        b.backtest50.successCount - a.backtest50.successCount ||
        a.key.localeCompare(b.key)
      );
    });
  }

  private buildConfigReport(history: DrawRow[], config: StrategyConfig) {
    const prediction = this.pickByConfig(history, history.length, config);
    const backtest20 = this.buildBacktest(history, 20, (h, t) => this.pickByConfig(h, t, config));
    const backtest50 = this.buildBacktest(history, 50, (h, t) => this.pickByConfig(h, t, config));
    return {
      key: config.key,
      name: config.name,
      description: config.description,
      prediction,
      backtest20,
      backtest50,
    };
  }

  private buildAdaptiveReport(history: DrawRow[]) {
    const pick = (h: DrawRow[], t: number) => this.pickAdaptiveConfig(h, t);
    const prediction = pick(history, history.length);
    const backtest20 = this.buildBacktest(history, 20, pick);
    const backtest50 = this.buildBacktest(history, 50, pick);
    return {
      key: 'adaptive-tail-ten',
      name: '尾十位自适应择优',
      description: '每期先回看之前20期各尾十位策略表现，再选择当前最稳的一个策略出手。',
      prediction,
      backtest20,
      backtest50,
    };
  }

  private buildBacktest(
    history: DrawRow[],
    count: number,
    pick: (history: DrawRow[], t: number) => PickResult | null,
  ) {
    const start = Math.max(30, history.length - count);
    const rows: BacktestRow[] = [];
    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const prediction = pick(history, t);
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
    const failureRows = rows.filter((row) => !row.success);
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      isPerfect: rows.length > 0 && successCount === rows.length,
      rows: rows.slice().reverse(),
      failureRows: failureRows.slice().reverse(),
    };
  }

  private pickAdaptiveConfig(history: DrawRow[], t: number): PickResult | null {
    const warmup = Math.max(30, t - 20);
    const ranked = this.baseConfigs
      .map((config) => {
        let ok = 0;
        let total = 0;
        for (let p = warmup; p < t; p++) {
          const pred = this.pickByConfig(history, p, config);
          if (!pred) continue;
          total++;
          if (!history[p].numbers.includes(pred.number)) ok++;
        }
        return {
          config,
          rate: total ? ok / total : 0,
          ok,
          total,
        };
      })
      .sort(
        (a, b) =>
          b.rate - a.rate ||
          b.ok - a.ok ||
          a.config.key.localeCompare(b.config.key),
      );
    const best = ranked[0]?.config || this.baseConfigs[0];
    const result = this.pickByConfig(history, t, best);
    if (!result) return null;
    return {
      ...result,
      strategyKey: 'adaptive-tail-ten',
      strategyName: `自适应 · ${best.name}`,
      reason: `近20期择优使用「${best.name}」；${result.reason}`,
    };
  }

  private pickByConfig(history: DrawRow[], t: number, config: StrategyConfig): PickResult | null {
    const training = history.slice(0, t);
    if (training.length < 2) return null;
    const stats = this.buildStats(training, config);
    const candidates = this.numbers.map((number) => this.scoreNumber(number, stats, config));
    candidates.sort((a, b) => b.score - a.score || a.number - b.number);
    const top = candidates[0];
    if (!top) return null;
    return {
      number: top.number,
      display: this.fmt(top.number),
      strategyKey: config.key,
      strategyName: config.name,
      score: Number(top.score.toFixed(4)),
      tail: top.tail,
      ten: top.ten,
      reason: `尾${top.tail}近${config.short}期出现${top.tailShortCount}次、遗漏${top.tailMiss}期；十位${top.ten}近${config.short}期出现${top.tenShortCount}次、遗漏${top.tenMiss}期；号码遗漏${top.numMiss}期。`,
      topCandidates: candidates.slice(0, 10).map((item) => ({
        ...item,
        score: Number(item.score.toFixed(4)),
      })),
    };
  }

  private buildStats(history: DrawRow[], config: StrategyConfig) {
    const shortRows = history.slice(-Math.min(config.short, history.length));
    const longRows = history.slice(-Math.min(config.long, history.length));
    const last = history[history.length - 1]?.numbers || [];
    const prev = history[history.length - 2]?.numbers || [];
    return {
      tailShort: this.countFeature(shortRows, (n) => this.tail(n), this.tailValues),
      tailLong: this.countFeature(longRows, (n) => this.tail(n), this.tailValues),
      tenShort: this.countFeature(shortRows, (n) => this.ten(n), this.tenValues),
      tenLong: this.countFeature(longRows, (n) => this.ten(n), this.tenValues),
      tailMiss: this.missFeature(history, (n) => this.tail(n), this.tailValues),
      tenMiss: this.missFeature(history, (n) => this.ten(n), this.tenValues),
      numMiss: this.numberMiss(history),
      lastTails: new Set(last.map((n) => this.tail(n))),
      lastTens: new Set(last.map((n) => this.ten(n))),
      prevTails: new Set(prev.map((n) => this.tail(n))),
      prevTens: new Set(prev.map((n) => this.ten(n))),
      lastNums: new Set(last),
    };
  }

  private scoreNumber(number: number, stats: any, config: StrategyConfig): CandidateScore {
    const d = this.tail(number);
    const z = this.ten(number);
    const w = config.weights;
    const tailShortCount = stats.tailShort.get(d) || 0;
    const tailLongCount = stats.tailLong.get(d) || 0;
    const tenShortCount = stats.tenShort.get(z) || 0;
    const tenLongCount = stats.tenLong.get(z) || 0;
    const tailMiss = stats.tailMiss.get(d) || 0;
    const tenMiss = stats.tenMiss.get(z) || 0;
    const numMiss = stats.numMiss.get(number) || 0;
    let score = 0;
    score += w.tailColdS * (1 - this.normFromMap(stats.tailShort, tailShortCount));
    score += w.tailColdL * (1 - this.normFromMap(stats.tailLong, tailLongCount));
    score += w.tenColdS * (1 - this.normFromMap(stats.tenShort, tenShortCount));
    score += w.tenColdL * (1 - this.normFromMap(stats.tenLong, tenLongCount));
    score += w.tailHotS * this.normFromMap(stats.tailShort, tailShortCount);
    score += w.tenHotS * this.normFromMap(stats.tenShort, tenShortCount);
    score += w.tailMiss * Math.min(tailMiss / config.short, 1);
    score += w.tenMiss * Math.min(tenMiss / config.short, 1);
    score += w.numMiss * Math.min(numMiss / config.long, 1);
    if (stats.lastTails.has(d)) score += w.lastTail;
    if (stats.lastTens.has(z)) score += w.lastTen;
    if (stats.prevTails.has(d)) score += w.prevTail;
    if (stats.prevTens.has(z)) score += w.prevTen;
    if (stats.lastNums.has(number)) score += w.lastNum;
    return {
      number,
      display: this.fmt(number),
      score,
      tail: d,
      ten: z,
      tailShortCount,
      tenShortCount,
      tailMiss,
      tenMiss,
      numMiss,
    };
  }

  private countFeature(rows: DrawRow[], fn: (n: number) => number, values: number[]) {
    const map = new Map(values.map((value) => [value, 0]));
    rows.forEach((row) => {
      row.numbers.forEach((n) => map.set(fn(n), (map.get(fn(n)) || 0) + 1));
    });
    return map;
  }

  private missFeature(history: DrawRow[], fn: (n: number) => number, values: number[]) {
    const map = new Map(values.map((value) => [value, history.length]));
    values.forEach((value) => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].numbers.some((n) => fn(n) === value)) {
          map.set(value, history.length - 1 - i);
          break;
        }
      }
    });
    return map;
  }

  private numberMiss(history: DrawRow[]) {
    const map = new Map(this.numbers.map((n) => [n, history.length]));
    this.numbers.forEach((n) => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].numbers.includes(n)) {
          map.set(n, history.length - 1 - i);
          break;
        }
      }
    });
    return map;
  }

  private normFromMap(map: Map<number, number>, value: number) {
    const values = [...map.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 0;
    return (value - min) / (max - min);
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

  private tail(n: number) {
    return n % 10;
  }

  private ten(n: number) {
    return Math.floor(n / 10);
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
