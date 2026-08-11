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
  posteriorRisk: number;
  separation: number;
  success: boolean;
};

@Injectable()
export class LogisticDiffusionKillService {
  private readonly minimumTraining = 256;
  private readonly gridSize = 31;
  private readonly gridMinimum = -4.5;
  private readonly gridMaximum = -0.3;
  private readonly diffusionSigma = 0.18;
  private readonly initialSigma = 0.6;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;
  private readonly grid = Array.from(
    { length: this.gridSize },
    (_, index) =>
      this.gridMinimum +
      (index * (this.gridMaximum - this.gridMinimum)) / (this.gridSize - 1),
  );
  private readonly transition = this.buildTransition();
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const minimumHistory = this.minimumTraining + 200;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `逻辑扩散粒子滤波至少需要${minimumHistory}期历史，才能展示完整200期走步回测。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:logistic-diffusion-v1`;
    if (this.cache?.key === cacheKey)
      return { ...this.cache.value, cache: 'hit' };

    const run = this.runFilter(history);
    const timeline = run.timeline;
    const historicalValidationRows = timeline.filter((row) =>
      this.isHistoricalValidation(row),
    );
    const prospectiveRows = timeline.filter((row) => this.isProspective(row));
    const current = run.current;

    const value = {
      status: 'frozen-observation',
      strategy: {
        key: 'logisticDiffusionParticleFilterV1',
        name: '逻辑扩散粒子滤波',
        family: 'sequential-bayesian-state-space',
        directionNovelty:
          '只维护49个号码在logit概率空间中的后验状态分布，不读取锚点公式、旧策略输出、频谱、共现矩阵、冷热评分或回测择优参数。',
        minimumTraining: this.minimumTraining,
        gridSize: this.gridSize,
        gridRange: [this.gridMinimum, this.gridMaximum],
        diffusionSigma: this.diffusionSigma,
        initialSigma: this.initialSigma,
        theoreticalBaseline: 42 / 49,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: {
          year: this.validationYear,
          No: this.validationStartNo,
        },
        description:
          '把每个号码的真实出现概率视为不可见状态，让状态在logit空间按固定扩散强度连续移动，并在每期开奖后用贝叶斯规则更新31个离散粒子的权重。',
      },
      prediction: {
        number: current.number,
        display: current.display,
        posteriorRisk: current.posteriorRisk,
        separation: current.separation,
        action: 'observe',
        actionLabel: '固定扩散强度 0.18，等待真实开奖',
        reason: `号码${current.display}的后验出现风险最低；与第二低风险号码的标准化间隔为${current.separation.toFixed(3)}。`,
      },
      riskMap: current.riskMap,
      stateDistribution: current.stateDistribution,
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
          key: 'latent-probability',
          title: '隐含概率状态',
          formula: 'zₙ,t = logit(pₙ,t)',
          description: '每个号码拥有一条不可直接观察的出现概率状态。',
        },
        {
          key: 'diffusion',
          title: '固定逻辑扩散',
          formula: 'zₜ₊₁ ∼ N(zₜ, 0.18²)',
          description: '使用冻结的0.18扩散强度传播31个状态粒子，不按结果切换。',
        },
        {
          key: 'bayesian-update',
          title: '贝叶斯更新',
          formula: 'wₜ ∝ wₜ₋₁ · Bernoulli(yₜ)',
          description: '开奖后仅根据出现或未出现更新粒子权重。',
        },
        {
          key: 'posterior-risk',
          title: '后验风险排序',
          formula: 'rₙ = E[sigmoid(zₙ)]',
          description: '选择后验期望出现风险最低的一个号码进行冻结观察。',
        },
      ],
      historyMeta: { count: history.length, latest: this.publicRow(latest) },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private runFilter(history: DrawRow[]) {
    const states = Array.from({ length: 49 }, () => this.initialState());
    const timeline: EvaluationRow[] = [];
    let current: any;

    for (let t = 0; t <= history.length; t++) {
      const risks = states.map((weights) =>
        weights.reduce(
          (sum, weight, index) => sum + weight * this.sigmoid(this.grid[index]),
          0,
        ),
      );
      const selection = this.select(risks, states);
      if (t >= this.minimumTraining) {
        if (t < history.length) {
          timeline.push({
            year: history[t].year,
            No: history[t].No,
            actualNumbers: history[t].numbers,
            predictedNumber: selection.number,
            predictedDisplay: selection.display,
            posteriorRisk: selection.posteriorRisk,
            separation: selection.separation,
            success: !history[t].numberSet.has(selection.number),
          });
        } else {
          current = selection;
        }
      }
      if (t === history.length) break;

      for (let numberIndex = 0; numberIndex < 49; numberIndex++) {
        const prior = this.grid.map((_, destination) =>
          states[numberIndex].reduce(
            (sum, weight, source) =>
              sum + weight * this.transition[source][destination],
            0,
          ),
        );
        const appeared = history[t].numberSet.has(numberIndex + 1);
        const posterior = prior.map((weight, index) => {
          const probability = this.sigmoid(this.grid[index]);
          return weight * (appeared ? probability : 1 - probability);
        });
        const total = posterior.reduce((sum, value) => sum + value, 0) || 1;
        states[numberIndex] = posterior.map((value) => value / total);
      }
    }

    return { timeline, current };
  }

  private select(risks: number[], states: number[][]) {
    const ranked = risks
      .map((risk, index) => ({ risk, index }))
      .sort((a, b) => a.risk - b.risk || a.index - b.index);
    const selected = ranked[0];
    const mean = risks.reduce((sum, risk) => sum + risk, 0) / risks.length;
    const standardDeviation = Math.sqrt(
      risks.reduce((sum, risk) => sum + (risk - mean) ** 2, 0) /
        risks.length,
    );
    const min = ranked[0].risk;
    const max = ranked[ranked.length - 1].risk;
    const range = Math.max(1e-12, max - min);
    return {
      number: selected.index + 1,
      display: String(selected.index + 1).padStart(2, '0'),
      posteriorRisk: this.round(selected.risk),
      separation: this.round(
        (ranked[1].risk - ranked[0].risk) /
          Math.max(1e-12, standardDeviation),
      ),
      riskMap: risks.map((risk, index) => ({
        number: index + 1,
        display: String(index + 1).padStart(2, '0'),
        risk: this.round(risk),
        normalizedRisk: this.round((risk - min) / range),
        selected: index === selected.index,
      })),
      stateDistribution: states[selected.index].map((weight, index) => ({
        logit: this.round(this.grid[index]),
        probability: this.round(this.sigmoid(this.grid[index])),
        weight: this.round(weight),
      })),
    };
  }

  private initialState() {
    const center = Math.log(1 / 6);
    const values = this.grid.map((value) =>
      Math.exp(-((value - center) ** 2) / (2 * this.initialSigma ** 2)),
    );
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map((value) => value / total);
  }

  private buildTransition() {
    return this.grid.map((source) => {
      const row = this.grid.map((destination) =>
        Math.exp(
          -((source - destination) ** 2) /
            (2 * this.diffusionSigma ** 2),
        ),
      );
      const total = row.reduce((sum, value) => sum + value, 0);
      return row.map((value) => value / total);
    });
  }

  private sigmoid(value: number) {
    return 1 / (1 + Math.exp(-value));
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
