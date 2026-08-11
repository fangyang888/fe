import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
  numberSet: Set<number>;
};

type EvaluationRow = {
  year?: number;
  No?: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  robustRisk: number;
  separation: number;
  success: boolean;
};

@Injectable()
export class RobustBlockKillService {
  private readonly window = 192;
  private readonly blockCount = 8;
  private readonly blockSize = 24;
  private readonly iqrPenalty = 0.25;
  private readonly meanTieBreaker = 0.001;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const minimumHistory = this.window + 200;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `分布鲁棒块一致性至少需要${minimumHistory}期历史，才能展示完整200期走步回测。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:robust-block-v1`;
    if (this.cache?.key === cacheKey)
      return { ...this.cache.value, cache: 'hit' };

    const timeline = this.buildTimeline(history);
    const current = this.pick(history, history.length, true);
    const historicalValidationRows = timeline.filter((row) =>
      this.isHistoricalValidation(row),
    );
    const prospectiveRows = timeline.filter((row) => this.isProspective(row));

    const value = {
      status: 'frozen-observation',
      strategy: {
        key: 'distributionallyRobustBlockConsensusV1',
        name: '分布鲁棒块一致性',
        family: 'distributionally-robust-optimization',
        directionNovelty:
          '只比较8个固定时间块中的最坏出现风险与块间离散度，不读取锚点公式、旧策略输出、频谱、共现矩阵、状态滤波或动态调参结果。',
        window: this.window,
        blockCount: this.blockCount,
        blockSize: this.blockSize,
        iqrPenalty: this.iqrPenalty,
        meanTieBreaker: this.meanTieBreaker,
        theoreticalBaseline: 42 / 49,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: {
          year: this.validationYear,
          No: this.validationStartNo,
        },
        description:
          '把最近192期固定切成8个连续24期块，不追求平均值最低，而是最小化号码在任一时间块中的最坏出现风险，并用块间四分位差惩罚不稳定候选。',
      },
      prediction: {
        number: current.number,
        display: current.display,
        robustRisk: current.robustRisk,
        worstBlockRate: current.worstBlockRate,
        meanBlockRate: current.meanBlockRate,
        blockIqr: current.blockIqr,
        separation: current.separation,
        action: 'observe',
        actionLabel: '固定 8×24 期分块，等待真实开奖',
        reason: `号码${current.display}的最坏块风险与块间波动组合得分最低；标准化分离度为${current.separation.toFixed(3)}。`,
      },
      riskMap: current.riskMap,
      blockProfile: current.blockProfile,
      backtests: this.backtests(timeline),
      historicalValidation: {
        ...this.summarize(historicalValidationRows),
        kind: 'held-out-walk-forward',
        range: { from: { year: 2025, No: 1 }, to: { year: 2026, No: 198 } },
      },
      validation: {
        ...this.summarize(prospectiveRows, true),
        kind: 'prospective-frozen',
        start: { year: this.validationYear, No: this.validationStartNo },
        message: prospectiveRows.length
          ? `已累计${prospectiveRows.length}期冻结后真实结果。`
          : '从2026-199开始记录，不回填历史结果。',
      },
      walkForwardCurve: this.buildCurve(timeline.slice(-120), 20),
      methodology: [
        {
          key: 'partition',
          title: '固定分块',
          formula: '192 = 8 × 24',
          description: '最近192期固定拆成8个连续时间块，不移动块边界找高分。',
        },
        {
          key: 'worst-case',
          title: '最坏块风险',
          formula: 'rmax = max(r₁…r₈)',
          description: '优先控制候选号码在任何单个时间块中的最高出现率。',
        },
        {
          key: 'dispersion',
          title: '波动惩罚',
          formula: 'score = rmax + 0.25·IQR',
          description: '用固定四分位差惩罚块间表现不一致的号码。',
        },
        {
          key: 'consensus',
          title: '鲁棒一致选择',
          formula: 'n* = argmin score(n)',
          description: '选择最坏风险与跨块波动同时较低的一码进行冻结观察。',
        },
      ],
      historyMeta: { count: history.length, latest: this.publicRow(latest) },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private buildTimeline(history: DrawRow[]): EvaluationRow[] {
    const rows: EvaluationRow[] = [];
    for (let t = this.window; t < history.length; t++) {
      const prediction = this.pick(history, t, false);
      rows.push({
        year: history[t].year,
        No: history[t].No,
        actualNumbers: history[t].numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        robustRisk: prediction.robustRisk,
        separation: prediction.separation,
        success: !history[t].numberSet.has(prediction.number),
      });
    }
    return rows;
  }

  private pick(history: DrawRow[], t: number, detailed: boolean) {
    const candidates = Array.from({ length: 49 }, (_, numberIndex) => {
      const blockRates = Array.from({ length: this.blockCount }, (_, block) => {
        const start = t - this.window + block * this.blockSize;
        let appearances = 0;
        for (let s = start; s < start + this.blockSize; s++) {
          if (history[s].numberSet.has(numberIndex + 1)) appearances++;
        }
        return appearances / this.blockSize;
      });
      const sorted = [...blockRates].sort((a, b) => a - b);
      const worstBlockRate = Math.max(...blockRates);
      const meanBlockRate =
        blockRates.reduce((sum, rate) => sum + rate, 0) / blockRates.length;
      const blockIqr = sorted[5] - sorted[1];
      const robustRisk =
        worstBlockRate +
        this.iqrPenalty * blockIqr +
        this.meanTieBreaker * meanBlockRate;
      return {
        number: numberIndex + 1,
        display: String(numberIndex + 1).padStart(2, '0'),
        blockRates,
        worstBlockRate,
        meanBlockRate,
        blockIqr,
        robustRisk,
      };
    });
    const ranked = [...candidates].sort(
      (a, b) => a.robustRisk - b.robustRisk || a.number - b.number,
    );
    const selected = ranked[0];
    const mean =
      candidates.reduce((sum, item) => sum + item.robustRisk, 0) /
      candidates.length;
    const standardDeviation = Math.sqrt(
      candidates.reduce(
        (sum, item) => sum + (item.robustRisk - mean) ** 2,
        0,
      ) / candidates.length,
    );
    const min = ranked[0].robustRisk;
    const max = ranked[ranked.length - 1].robustRisk;
    const range = Math.max(1e-12, max - min);
    const basic = {
      number: selected.number,
      display: selected.display,
      robustRisk: this.round(selected.robustRisk),
      worstBlockRate: this.round(selected.worstBlockRate),
      meanBlockRate: this.round(selected.meanBlockRate),
      blockIqr: this.round(selected.blockIqr),
      separation: this.round(
        (ranked[1].robustRisk - ranked[0].robustRisk) /
          Math.max(1e-12, standardDeviation),
      ),
    };
    if (!detailed) return basic as any;

    return {
      ...basic,
      riskMap: candidates.map((item) => ({
        number: item.number,
        display: item.display,
        risk: this.round(item.robustRisk),
        normalizedRisk: this.round((item.robustRisk - min) / range),
        selected: item.number === selected.number,
      })),
      blockProfile: selected.blockRates.map((rate, block) => {
        const startIndex = t - this.window + block * this.blockSize;
        const endIndex = startIndex + this.blockSize - 1;
        return {
          block: block + 1,
          rate: this.round(rate),
          appearances: Math.round(rate * this.blockSize),
          count: this.blockSize,
          from: this.publicPeriod(history[startIndex]),
          to: this.publicPeriod(history[endIndex]),
          worst: rate === selected.worstBlockRate,
        };
      }),
    } as any;
  }

  private backtests(rows: EvaluationRow[]) {
    return {
      backtest10: this.summarize(rows.slice(-10)),
      backtest20: this.summarize(rows.slice(-20)),
      backtest50: this.summarize(rows.slice(-50)),
      backtest100: this.summarize(rows.slice(-100)),
      backtest200: this.summarize(rows.slice(-200)),
    };
  }

  private summarize(rows: EvaluationRow[], includeRows = false) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'strict-walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      ...(includeRows ? { rows: rows.slice().reverse() } : {}),
    };
  }

  private buildCurve(rows: EvaluationRow[], window: number) {
    return rows.map((row, index) => {
      const sample = rows.slice(Math.max(0, index - window + 1), index + 1);
      return {
        year: row.year,
        No: row.No,
        rate: sample.filter((item) => item.success).length / sample.length,
        count: sample.length,
      };
    });
  }

  private isHistoricalValidation(row: EvaluationRow) {
    return (
      Number(row.year) >= 2025 &&
      (Number(row.year) < this.validationYear ||
        Number(row.No) < this.validationStartNo)
    );
  }

  private isProspective(row: EvaluationRow) {
    return (
      Number(row.year) > this.validationYear ||
      (Number(row.year) === this.validationYear &&
        Number(row.No) >= this.validationStartNo)
    );
  }

  private publicPeriod(row: DrawRow) {
    return { year: row.year, No: row.No };
  }

  private publicRow(row: DrawRow) {
    return { id: row.id, year: row.year, No: row.No, numbers: row.numbers };
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [
          row.n1,
          row.n2,
          row.n3,
          row.n4,
          row.n5,
          row.n6,
          row.n7,
        ].map(Number);
        return {
          id: Number(row.id || 0),
          year: Number(row.year),
          No: Number(row.No),
          numbers,
          numberSet: new Set(numbers),
        };
      })
      .filter(
        (row) =>
          new Set(row.numbers).size === 7 &&
          row.numbers.every(
            (number) =>
              Number.isInteger(number) && number >= 1 && number <= 49,
          ),
      )
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          a.id - b.id,
      );
  }

  private round(value: number) {
    return Number(value.toFixed(6));
  }
}
