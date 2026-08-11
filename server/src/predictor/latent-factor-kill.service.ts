import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

type EvaluationRow = {
  year?: number;
  No?: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  reconstructedRisk: number;
  separation: number;
  success: boolean;
};

@Injectable()
export class LatentFactorKillService {
  private readonly window = 192;
  private readonly factorCount = 4;
  private readonly powerIterations = 14;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const minimumHistory = this.window + 500;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `低秩动态因子至少需要${minimumHistory}期历史，才能展示完整500期走步回测。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:latent-factor-v1`;
    if (this.cache?.key === cacheKey)
      return { ...this.cache.value, cache: 'hit' };

    const timeline = this.buildTimeline(history);
    const current = this.analyze(history, history.length, true);
    const historicalValidationRows = timeline.filter((row) =>
      this.isHistoricalValidation(row),
    );
    const prospectiveRows = timeline.filter((row) => this.isProspective(row));

    const value = {
      status: 'frozen-observation',
      strategy: {
        key: 'lowRankDynamicFactorV1',
        name: '低秩动态因子',
        family: 'latent-state-space',
        directionNovelty:
          '只分析49维二值出现矩阵的协方差低秩结构与因子时间动态，不读取锚点公式、共现投票、频谱周期、冷热遗漏或旧策略输出。',
        window: this.window,
        factorCount: this.factorCount,
        powerIterations: this.powerIterations,
        forecast: 'AR(1)',
        theoreticalBaseline: 42 / 49,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: {
          year: this.validationYear,
          No: this.validationStartNo,
        },
        description:
          '把最近192期构成49维二值矩阵，提取4个主协方差因子，对每条因子轨迹作固定AR(1)一步预测，再重构49个号码的下一期风险。',
      },
      prediction: {
        number: current.number,
        display: current.display,
        reconstructedRisk: current.reconstructedRisk,
        separation: current.separation,
        action: 'observe',
        actionLabel: '模型已冻结，等待真实开奖',
        reason: `号码${current.display}的四因子重构风险最低；与第二低风险号码的标准化间隔为${current.separation.toFixed(3)}。`,
      },
      factors: current.factors,
      factorMap: current.factorMap,
      backtests: {
        backtest20: this.summarize(timeline.slice(-20)),
        backtest50: this.summarize(timeline.slice(-50)),
        backtest100: this.summarize(timeline.slice(-100)),
        backtest200: this.summarize(timeline.slice(-200)),
        backtest500: this.summarize(timeline.slice(-500)),
      },
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
      methodology: [
        {
          key: 'matrix',
          title: '构建出现矩阵',
          description:
            '最近192期中，每个号码出现记为1、未出现记为0，得到192×49矩阵。',
        },
        {
          key: 'compress',
          title: '协方差压缩',
          description: '固定提取4个主方向，把49条轨迹压缩成4条潜在因子。',
        },
        {
          key: 'forecast',
          title: '因子预测',
          description: '分别用固定AR(1)模型外推每条因子的下一步状态。',
        },
        {
          key: 'reconstruct',
          title: '重构风险',
          description: '把预测因子映射回49个号码，选择重构风险最低的一码。',
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
      const prediction = this.analyze(history, t, false);
      const actual = history[t];
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        reconstructedRisk: prediction.reconstructedRisk,
        separation: prediction.separation,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return rows;
  }

  private analyze(history: DrawRow[], t: number, detailed: boolean) {
    const start = t - this.window;
    const counts = Array(49).fill(0);
    const cooccurrence = Array.from({ length: 49 }, () => Array(49).fill(0));
    for (let s = start; s < t; s++) {
      const indexes = history[s].numbers.map((number) => number - 1);
      for (const i of indexes) counts[i]++;
      for (const i of indexes) for (const j of indexes) cooccurrence[i][j]++;
    }
    const means = counts.map((count) => count / this.window);
    const covariance = cooccurrence.map((row, i) =>
      row.map((value, j) => value / this.window - means[i] * means[j]),
    );
    const basis = this.decompose(covariance);
    const factorStates = basis.map((vector) => {
      const meanProjection = this.dot(means, vector);
      const series: number[] = [];
      for (let s = start; s < t; s++) {
        let score = -meanProjection;
        for (const number of history[s].numbers) score += vector[number - 1];
        series.push(score);
      }
      let numerator = 0;
      let denominator = 0;
      for (let s = 1; s < series.length; s++) {
        numerator += series[s] * series[s - 1];
        denominator += series[s - 1] * series[s - 1];
      }
      const phi = Math.max(
        -0.98,
        Math.min(0.98, denominator ? numerator / denominator : 0),
      );
      const forecast = phi * series[series.length - 1];
      return {
        phi,
        forecast,
        series,
        eigenvalue: this.dot(vector, this.multiply(covariance, vector)),
      };
    });
    const risks = means.map((mean, index) =>
      basis.reduce(
        (risk, vector, factor) =>
          risk + vector[index] * factorStates[factor].forecast,
        mean,
      ),
    );
    const ranked = risks
      .map((risk, index) => ({ risk, index }))
      .sort((a, b) => a.risk - b.risk || a.index - b.index);
    const selectedIndex = ranked[0].index;
    const riskMean = risks.reduce((sum, risk) => sum + risk, 0) / risks.length;
    const riskSd = Math.sqrt(
      risks.reduce((sum, risk) => sum + (risk - riskMean) ** 2, 0) /
        risks.length,
    );
    const separation =
      (ranked[1].risk - ranked[0].risk) / Math.max(1e-9, riskSd);
    const basic = {
      number: selectedIndex + 1,
      display: String(selectedIndex + 1).padStart(2, '0'),
      reconstructedRisk: this.round(risks[selectedIndex]),
      separation: this.round(separation),
    };
    if (!detailed) return basic as any;

    const minRisk = ranked[0].risk;
    const maxRisk = ranked[ranked.length - 1].risk;
    const riskRange = Math.max(1e-9, maxRisk - minRisk);
    const contributionScales = basis.map((vector, factor) =>
      Math.max(
        ...vector.map((loading) =>
          Math.abs(loading * factorStates[factor].forecast),
        ),
        1e-9,
      ),
    );
    return {
      ...basic,
      factors: factorStates.map((state, index) => {
        const recent = state.series.slice(-32);
        const scale = Math.max(...recent.map((value) => Math.abs(value)), 1e-9);
        return {
          index: index + 1,
          phi: this.round(state.phi),
          forecast: this.round(state.forecast),
          eigenvalue: this.round(state.eigenvalue),
          selectedContribution: this.round(
            basis[index][selectedIndex] * state.forecast,
          ),
          recentSeries: recent.map((value) => this.round(value / scale)),
        };
      }),
      factorMap: risks.map((risk, index) => ({
        number: index + 1,
        display: String(index + 1).padStart(2, '0'),
        risk: this.round(risk),
        normalizedRisk: this.round((risk - minRisk) / riskRange),
        selected: index === selectedIndex,
        contributions: basis.map((vector, factor) =>
          this.round(
            (vector[index] * factorStates[factor].forecast) /
              contributionScales[factor],
          ),
        ),
      })),
    } as any;
  }

  private decompose(covariance: number[][]) {
    const basis: number[][] = [];
    for (let factor = 0; factor < this.factorCount; factor++) {
      let vector = Array.from(
        { length: 49 },
        (_, index) =>
          Math.sin((index + 1) * (factor + 1) * 1.61803398875) +
          0.2 * Math.cos((index + 3) * (factor + 2)),
      );
      vector = this.orthogonalize(vector, basis);
      for (let iteration = 0; iteration < this.powerIterations; iteration++) {
        vector = this.orthogonalize(this.multiply(covariance, vector), basis);
      }
      basis.push(vector);
    }
    return basis;
  }

  private orthogonalize(vector: number[], basis: number[][]) {
    const result = [...vector];
    for (const previous of basis) {
      const projection = this.dot(result, previous);
      for (let i = 0; i < result.length; i++)
        result[i] -= projection * previous[i];
    }
    const norm = Math.sqrt(this.dot(result, result)) || 1;
    return result.map((value) => value / norm);
  }

  private multiply(matrix: number[][], vector: number[]) {
    return matrix.map((row) => this.dot(row, vector));
  }

  private dot(left: number[], right: number[]) {
    let value = 0;
    for (let i = 0; i < left.length; i++) value += left[i] * right[i];
    return value;
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

  private summarize(rows: EvaluationRow[], includeRows = false) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'strict-walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      ...(includeRows
        ? {
            rows: rows.slice().reverse(),
            failureRows: rows.filter((row) => !row.success).reverse(),
          }
        : {}),
    };
  }

  private publicRow(row: DrawRow) {
    return { id: row.id, year: row.year, No: row.No, numbers: row.numbers };
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: Number(row.year),
        No: Number(row.No),
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(
          Number,
        ),
      }))
      .filter(
        (row) =>
          new Set(row.numbers).size === 7 &&
          row.numbers.every(
            (number) => Number.isInteger(number) && number >= 1 && number <= 49,
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
