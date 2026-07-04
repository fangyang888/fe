import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface GapCandidate {
  number: number;
  display: string;
  rank: number;
  score: number;
  miss: number;
  avgGap: number;
  sdGap: number;
  z: number;
  ratio: number;
  accel: number;
  f5: number;
  f10: number;
  f20: number;
}

@Injectable()
export class GapScoreKillService {
  constructor(private readonly historyService: HistoryService) {}

  private readonly numbers = Array.from({ length: 49 }, (_, i) => i + 1);

  async getPrediction() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 120) {
      return {
        status: 'insufficient-history',
        message: '至少需要 120 期 history 数据库历史，才能完成 gap-score-r4 回测。',
        historyCount: history.length,
      };
    }

    const prediction = this.pick(history, history.length);
    const backtest20 = this.buildBacktest(history, 20);
    const backtest50 = this.buildBacktest(history, 50);
    const backtest100 = this.buildBacktest(history, 100);
    const backtest200 = this.buildBacktest(history, 200);
    const latest = history[history.length - 1];

    return {
      source: 'database:history',
      status:
        backtest20.successRate >= 1 && backtest50.successRate >= 1
          ? 'target-met'
          : 'best-effort',
      target: {
        last20: { required: 1, met: backtest20.successRate >= 1 },
        last50: { required: 1, met: backtest50.successRate >= 1 },
      },
      currentRecommendation: {
        key: 'gapScoreR4',
        name: '固定 gap-score-r4',
        description:
          '独立于 98/99/guarded 的间隔序列实验：按号码自身出现间隔的 z-score、遗漏比例、近10频次和间隔加速打分；当首选 score>=0.1 时顺延第4名。',
        prediction,
        backtest20,
        backtest50,
        backtest100,
        backtest200,
      },
      historyMeta: {
        count: history.length,
        latest,
      },
      excluded:
        '未使用 /kill/experimental-98、/kill/experimental-99、/kill/experimental-guarded 的实验结果或特征。',
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const ranking = this.rankBase(history, t);
    const first = ranking[0];
    let selectedIndex = 0;
    let guard = '默认取间隔偏离首选';

    if (first.score >= 0.1) {
      selectedIndex = 3;
      guard = 'score>=0.1 保护：首选分数偏高，顺延第4名';
    }

    const selected = ranking[selectedIndex] || first;
    return {
      ...selected,
      strategyKey: 'gapScoreR4',
      strategyName: '固定 gap-score-r4',
      reason:
        `${guard}。当前候选${selected.display}：miss ${selected.miss}，` +
        `avg ${selected.avgGap.toFixed(1)}，z ${selected.z.toFixed(2)}，` +
        `ratio ${selected.ratio.toFixed(2)}，accel ${selected.accel}，f10 ${selected.f10}。`,
      guard,
      selectedRank: selectedIndex + 1,
      topCandidates: ranking.slice(0, 5),
    };
  }

  private rankBase(history: DrawRow[], t: number): GapCandidate[] {
    return this.numbers
      .map((number) => {
        const gaps = this.gapsBefore(history, t, number, 12);
        const miss = this.missAt(history, t, number);
        const avgGap = this.average(gaps, 24);
        const sdGap = this.std(gaps);
        const lastGap = gaps.length ? gaps[gaps.length - 1] : 24;
        const prevGap = gaps.length > 1 ? gaps[gaps.length - 2] : 24;
        const z = sdGap ? (miss - avgGap) / sdGap : 0;
        const ratio = avgGap ? miss / avgGap : 1;
        const accel = lastGap - prevGap;
        const f5 = this.freqAt(history, t, number, 5);
        const f10 = this.freqAt(history, t, number, 10);
        const f20 = this.freqAt(history, t, number, 20);
        const score =
          -Math.abs(z) * 4 -
          Math.abs(ratio - 1) * 3 -
          f10 * 0.5 +
          Math.max(0, -accel) * 0.08;

        return {
          number,
          display: this.fmt(number),
          rank: 0,
          score: Number(score.toFixed(4)),
          miss,
          avgGap,
          sdGap,
          z,
          ratio,
          accel,
          f5,
          f10,
          f20,
        };
      })
      .sort((a, b) => b.score - a.score || a.number - b.number)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }

  private buildBacktest(history: DrawRow[], count: number) {
    const start = Math.max(120, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const prediction = this.pick(history, t);
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

  private gapsBefore(history: DrawRow[], t: number, n: number, limit: number) {
    const positions = [];
    for (let i = 0; i < t; i++) {
      if (history[i].numbers.includes(n)) positions.push(i);
    }
    const recent = positions.slice(-(limit + 1));
    const gaps = [];
    for (let i = recent.length - 1; i > 0; i--) {
      gaps.push(recent[i] - recent[i - 1]);
    }
    return gaps;
  }

  private missAt(history: DrawRow[], t: number, n: number) {
    for (let i = t - 1; i >= 0; i--) {
      if (history[i].numbers.includes(n)) return t - 1 - i;
    }
    return t;
  }

  private freqAt(history: DrawRow[], t: number, n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, t - window); i < t; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
  }

  private average(values: number[], fallback = 0) {
    if (!values.length) return fallback;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private std(values: number[]) {
    if (values.length < 2) return 0;
    const mean = this.average(values);
    return Math.sqrt(this.average(values.map((value) => (value - mean) ** 2)));
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}
