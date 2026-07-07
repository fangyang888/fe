import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface Candidate {
  number: number;
  display: string;
  score: number;
  rank: number;
  f5: number;
  f10: number;
  f15: number;
  f20: number;
  f30: number;
  f50: number;
  miss: number;
  gap: number;
}

@Injectable()
export class ExperimentalGuardedKillService {
  constructor(private readonly historyService: HistoryService) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);

  async getPrediction() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 120) {
      return {
        status: 'insufficient-history',
        message: '至少需要 120 期 history 数据库历史，才能完成候选换位实验回测。',
        historyCount: history.length,
      };
    }

    const base = this.buildExperiment(history, false);
    const enhanced = this.buildExperiment(history, true);
    const latest = history[history.length - 1];
    const currentRecommendation = enhanced;

    return {
      source: 'database:history',
      status:
        currentRecommendation.backtest20.successRate >= 1 && currentRecommendation.backtest50.successRate >= 1
          ? 'target-met'
          : 'best-effort',
      target: {
        last20: { required: 1, met: currentRecommendation.backtest20.successRate >= 1 },
        last50: { required: 1, met: currentRecommendation.backtest50.successRate >= 1 },
      },
      currentRecommendation,
      experiments: [base, enhanced],
      historyMeta: {
        count: history.length,
        latest,
      },
      excluded:
        '未使用98页的质合/跨度/和值尾/邻号/分区方向，也未使用99页的重叠后验/尾位修正/精确三号重叠/期号相位方向。',
      generatedAt: new Date().toISOString(),
    };
  }

  buildComboReportFromRows(rawRows: any[]) {
    const history = this.normalizeRows(rawRows);
    const base = this.buildExperiment(history, false);
    const enhanced = this.buildExperiment(history, true);
    return { best: enhanced, experiments: [base, enhanced] };
  }

  private buildExperiment(history: DrawRow[], enhanced: boolean) {
    return {
      key: enhanced ? 'experimentalGuardedEnhanced' : 'experimentalGuardedBase',
      name: enhanced ? '增强候选换位单杀' : '原始候选换位单杀',
      description: enhanced
        ? '在原始三条候选换位过滤基础上，追加低频长间隔首选保护，用于提升近100期稳定性。'
        : '原始实验：先按号码自身近15期频次、遗漏、上次间隔排序，再用三条候选换位过滤避开高风险首选。',
      prediction: this.pick(history, history.length, enhanced),
      backtest20: this.buildBacktest(history, 20, enhanced),
      backtest50: this.buildBacktest(history, 50, enhanced),
      backtest100: this.buildBacktest(history, 100, enhanced),
    };
  }

  private pick(history: DrawRow[], t: number, enhanced = false) {
    const ranking = this.rankBase(history, t);
    const first = ranking[0];
    let selectedIndex = 0;
    let guard = '默认取遗漏频次首选';

    if (first.miss >= 24 && first.miss <= 32 && first.gap <= 9 && first.f15 === 0) {
      selectedIndex = 1;
      guard = '中遗漏短间隔过滤：首选 miss 24-32 且 gap <= 9，顺延第2名';
    } else if (first.miss >= 30 && first.gap <= 9 && first.f15 === 0) {
      selectedIndex = 2;
      guard = '长遗漏短间隔过滤：首选 miss >= 30 且 gap <= 9，顺延第3名';
    } else if (first.score - ranking[1].score > 0.8) {
      selectedIndex = 2;
      guard = '首选分数异常领先过滤：领先第2名超过0.8，顺延第3名';
    }

    if (
      enhanced &&
      selectedIndex === 0 &&
      first.f20 <= 1 &&
      first.miss >= 16 &&
      first.gap >= 18
    ) {
      selectedIndex = 2;
      guard = '低频长间隔首选保护：首选近20频次<=1 且 miss>=16、gap>=18，顺延第3名';
    }

    const selected = ranking[selectedIndex] || first;
    return {
      ...selected,
      strategyKey: enhanced ? 'experimentalGuardedEnhanced' : 'experimentalGuardedBase',
      strategyName: enhanced ? '增强候选换位单杀' : '原始候选换位单杀',
      reason: `${guard}。当前候选${selected.display}：近15频次${selected.f15}，遗漏${selected.miss}期，上次间隔${selected.gap}。`,
      guard,
      selectedRank: selectedIndex + 1,
      topCandidates: ranking.slice(0, 5),
    };
  }

  private rankBase(history: DrawRow[], t: number): Candidate[] {
    return this.numbers
      .map((number) => {
        const f15 = this.freqAt(history, t, number, 15);
        const f5 = this.freqAt(history, t, number, 5);
        const miss = this.missAt(history, t, number);
        const gap = this.gapAt(history, t, number);
        const score =
          -f15 * 4 +
          Math.min(miss, 100) * 0.04 +
          Math.min(gap, 80) * 0.12 -
          f5 * 0.8;
        return {
          number,
          display: this.fmt(number),
          score: Number(score.toFixed(4)),
          rank: 0,
          f5,
          f10: this.freqAt(history, t, number, 10),
          f15,
          f20: this.freqAt(history, t, number, 20),
          f30: this.freqAt(history, t, number, 30),
          f50: this.freqAt(history, t, number, 50),
          miss,
          gap,
        };
      })
      .sort((a, b) => b.score - a.score || a.number - b.number)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }

  private buildBacktest(history: DrawRow[], count: number, enhanced = false) {
    const start = Math.max(100, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const prediction = this.pick(history, t, enhanced);
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        selectedRank: prediction.selectedRank,
        success: !actual.numbers.includes(prediction.number),
        strategyKey: prediction.strategyKey,
        strategyName: prediction.strategyName,
        reason: prediction.reason,
        guard: prediction.guard,
        topCandidates: prediction.topCandidates,
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

  private freqAt(history: DrawRow[], t: number, n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, t - window); i < t; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
  }

  private missAt(history: DrawRow[], t: number, n: number) {
    for (let i = t - 1; i >= 0; i--) {
      if (history[i].numbers.includes(n)) return t - 1 - i;
    }
    return t;
  }

  private gapAt(history: DrawRow[], t: number, n: number) {
    let last = -1;
    let previous = -1;
    for (let i = t - 1; i >= 0; i--) {
      if (!history[i].numbers.includes(n)) continue;
      if (last < 0) last = i;
      else {
        previous = i;
        break;
      }
    }
    if (last < 0) return t;
    if (previous < 0) return t - last;
    return last - previous;
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
