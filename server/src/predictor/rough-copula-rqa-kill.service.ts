import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type ModelKey = 'pawlak' | 'copula' | 'rqa';

type DrawRow = {
  id: number;
  year: number;
  No: number;
  numbers: number[];
  numberSet: Set<number>;
  bits: number[];
};

type Pick = {
  number: number;
  display: string;
  risk: number;
  separation: number;
  riskMap?: Array<{
    number: number;
    display: string;
    risk: number;
    normalizedRisk: number;
    selected: boolean;
  }>;
  diagnostic?: Record<string, number | string>;
};

type EvaluationRow = {
  year: number;
  No: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  risk: number;
  success: boolean;
};

@Injectable()
export class RoughCopulaRqaKillService {
  private readonly frozenYear = 2026;
  private readonly frozenNo = 198;
  private readonly prospectiveStartNo = 199;
  private readonly pawlakWindow = 224;
  private readonly copulaWindow = 160;
  private readonly rqaWindow = 96;
  private readonly historicalWindow = 200;
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const minimumHistory = this.pawlakWindow + this.historicalWindow;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `三模型冻结观察至少需要${minimumHistory}期有效历史。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:rough-copula-rqa-v1`;
    if (this.cache?.key === cacheKey) {
      return { ...this.cache.value, cache: 'hit' };
    }

    const cutoffExclusive = this.cutoffExclusive(history);
    if (cutoffExclusive < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '2026-198冻结点之前没有足够数据生成固定200期历史基线。',
      };
    }

    const timelineStart = Math.max(
      this.pawlakWindow,
      cutoffExclusive - this.historicalWindow,
    );
    const rqaPicks = this.runRqa(history, timelineStart);
    const timelines: Record<ModelKey, EvaluationRow[]> = {
      pawlak: [],
      copula: [],
      rqa: [],
    };

    for (let t = timelineStart; t < history.length; t++) {
      const picks: Record<ModelKey, Pick> = {
        pawlak: this.pickPawlak(history, t, false),
        copula: this.pickCopula(history, t, false),
        rqa: rqaPicks.get(t)!,
      };
      for (const key of Object.keys(picks) as ModelKey[]) {
        const pick = picks[key];
        timelines[key].push({
          year: history[t].year,
          No: history[t].No,
          actualNumbers: history[t].numbers,
          predictedNumber: pick.number,
          predictedDisplay: pick.display,
          risk: pick.risk,
          success: !history[t].numberSet.has(pick.number),
        });
      }
    }

    const current: Record<ModelKey, Pick> = {
      pawlak: this.pickPawlak(history, history.length, true),
      copula: this.pickCopula(history, history.length, true),
      rqa: rqaPicks.get(history.length)!,
    };
    const modelDefinitions = this.modelDefinitions();
    const models = (Object.keys(current) as ModelKey[]).map((key) => {
      const historicalRows = timelines[key].filter((row) =>
        this.isAtOrBeforeFreeze(row),
      );
      const prospectiveRows = timelines[key].filter((row) =>
        this.isProspective(row),
      );
      return {
        ...modelDefinitions[key],
        prediction: {
          ...current[key],
          action: 'observe',
          actionLabel: '参数已冻结，等待下一期真实开奖',
        },
        backtests: this.backtests(historicalRows),
        validation: {
          ...this.summarize(prospectiveRows, true),
          kind: 'prospective-frozen',
          start: { year: this.frozenYear, No: this.prospectiveStartNo },
        },
      };
    });

    const value = {
      status: 'frozen-observation',
      title: '三方向冻结观察台',
      frozenAt: { year: this.frozenYear, No: this.frozenNo },
      prospectiveStart: { year: this.frozenYear, No: this.prospectiveStartNo },
      theoreticalBaseline: 42 / 49,
      lockPolicy: {
        parametersFrozen: true,
        historicalBaselineEndsAt: {
          year: this.frozenYear,
          No: this.frozenNo,
        },
        prospectiveStatisticsStartAt: {
          year: this.frozenYear,
          No: this.prospectiveStartNo,
        },
        description:
          '算法、窗口、特征、平滑常数、学习率和并列规则全部冻结；2026-199起只追加走步预测结果，不把新结果并入冻结历史基线。',
      },
      models,
      historyMeta: {
        count: history.length,
        latest: this.publicRow(latest),
        nextPeriod: this.nextPeriod(latest),
      },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private modelDefinitions(): Record<ModelKey, any> {
    return {
      pawlak: {
        key: 'pawlakRoughLowerApproximationV1',
        shortKey: 'pawlak',
        rank: 1,
        name: 'Pawlak 粗糙集下近似',
        family: 'rough-set-theory',
        color: '#62e6b5',
        frozenParameters: {
          window: this.pawlakWindow,
          frequencyWindows: [8, 24],
          residueModulus: 7,
          laplacePrior: [1, 7],
        },
        description:
          '用上一期状态、8期与24期出现层级及模7邻域构造等价类，按同类历史中的下一期出现风险选择最低号码。',
      },
      copula: {
        key: 'laggedUpperTailCopulaV1',
        shortKey: 'copula',
        rank: 2,
        name: '尾部 Copula 依赖',
        family: 'copula-tail-dependence',
        color: '#67b7ff',
        frozenParameters: {
          window: this.copulaWindow,
          jointPrior: 0.5,
          marginalPrior: 1,
          positiveTailOnly: true,
        },
        description:
          '估计上一期活跃号码与下一期候选号码之间的正向尾部依赖，只聚合当前已激活来源的条件风险。',
      },
      rqa: {
        key: 'recurrenceQuantificationOnlineLogitV1',
        shortKey: 'rqa',
        rank: 3,
        name: '递归量化分析 RQA',
        family: 'recurrence-quantification-analysis',
        color: '#c89cff',
        frozenParameters: {
          window: this.rqaWindow,
          embeddingDimension: 4,
          featureCount: 8,
          initialLearningRate: 0.06,
          learningDecay: 100,
          l2: 0.003,
        },
        description:
          '把每个号码的0/1轨迹嵌入四阶状态，提取复现率、确定性、状态熵与翻转率，再由固定在线逻辑规则估计风险。',
      },
    };
  }

  private pickPawlak(history: DrawRow[], t: number, detailed: boolean): Pick {
    const start = Math.max(24, t - this.pawlakWindow);
    const maps = Array.from(
      { length: 49 },
      () => new Map<string, [number, number]>(),
    );
    for (let k = start; k < t; k++) {
      for (let j = 0; j < 49; j++) {
        const key = this.pawlakAttribute(history, j, k);
        const cell = maps[j].get(key) || [0, 0];
        cell[0] += history[k].bits[j];
        cell[1] += 1;
        maps[j].set(key, cell);
      }
    }
    const candidates = Array.from({ length: 49 }, (_, j) => {
      const attribute = this.pawlakAttribute(history, j, t);
      const [cellHits, support] = maps[j].get(attribute) || [0, 0];
      return {
        number: j + 1,
        risk: (cellHits + 1) / (support + 7),
        support,
        cellHits,
        attribute,
      };
    });
    const pick = this.finalizePick(candidates, detailed);
    const selected = candidates[pick.number - 1];
    pick.diagnostic = {
      equivalenceClass: selected.attribute,
      support: selected.support,
      historicalAppearances: selected.cellHits,
      smoothedRisk: this.round(selected.risk),
    };
    return pick;
  }

  private pawlakAttribute(history: DrawRow[], j: number, t: number) {
    let count8 = 0;
    let count24 = 0;
    let residueNeighbors = 0;
    for (let i = t - 8; i < t; i++) count8 += history[i].bits[j];
    for (let i = t - 24; i < t; i++) count24 += history[i].bits[j];
    for (const number of history[t - 1].numbers) {
      if ((number - (j + 1)) % 7 === 0) residueNeighbors++;
    }
    return `${history[t - 1].bits[j]}|${Math.min(2, count8)}|${Math.min(4, Math.floor(count24 / 2))}|${Math.min(2, residueNeighbors)}`;
  }

  private pickCopula(history: DrawRow[], t: number, detailed: boolean): Pick {
    const start = Math.max(1, t - this.copulaWindow);
    const candidates = Array.from({ length: 49 }, (_, target) => {
      let weightedRisk = 0;
      let totalLift = 0;
      let activeSources = 0;
      for (let source = 0; source < 49; source++) {
        let both = 0;
        let sourceCount = 0;
        let targetCount = 0;
        let count = 0;
        for (let k = start; k < t; k++) {
          const x = history[k - 1].bits[source];
          const y = history[k].bits[target];
          both += x * y;
          sourceCount += x;
          targetCount += y;
          count++;
        }
        const joint = (both + 0.5) / (count + 2);
        const px = (sourceCount + 1) / (count + 2);
        const py = (targetCount + 1) / (count + 2);
        const tailLift = Math.max(0, joint / (px * py) - 1);
        if (history[t - 1].bits[source]) {
          activeSources++;
          weightedRisk += tailLift * ((both + 1) / (sourceCount + 7));
          totalLift += tailLift;
        }
      }
      return {
        number: target + 1,
        risk: totalLift ? weightedRisk / totalLift : 1 / 7,
        totalLift,
        activeSources,
      };
    });
    const pick = this.finalizePick(candidates, detailed);
    const selected = candidates[pick.number - 1];
    pick.diagnostic = {
      activeSources: selected.activeSources,
      positiveTailWeight: this.round(selected.totalLift),
      conditionalRisk: this.round(selected.risk),
    };
    return pick;
  }

  private runRqa(history: DrawRow[], recordFrom: number) {
    const weights = Array.from({ length: 49 }, () => new Array(8).fill(0));
    const result = new Map<number, Pick>();
    let step = 0;
    for (let t = 32; t <= history.length; t++) {
      const features = Array.from({ length: 49 }, (_, j) =>
        this.rqaFeatures(history, j, t),
      );
      const candidates = features.map((feature, j) => ({
        number: j + 1,
        risk: this.sigmoid(this.dot(weights[j], feature)),
        feature,
      }));
      if (t >= recordFrom) {
        const pick = this.finalizePick(candidates, t === history.length);
        const selected = candidates[pick.number - 1];
        pick.diagnostic = {
          recurrenceRate: this.round(selected.feature[2]),
          determinism: this.round(selected.feature[3]),
          stateEntropy: this.round(selected.feature[5]),
          transitionRate: this.round(selected.feature[6]),
        };
        result.set(t, pick);
      }
      if (t === history.length) break;
      step++;
      const learningRate = 0.06 / Math.sqrt(1 + step / 100);
      for (let j = 0; j < 49; j++) {
        const error = history[t].bits[j] - candidates[j].risk;
        for (let d = 0; d < 8; d++) {
          weights[j][d] +=
            learningRate * (error * features[j][d] - 0.003 * weights[j][d]);
        }
      }
    }
    return result;
  }

  private rqaFeatures(history: DrawRow[], j: number, t: number) {
    const start = Math.max(0, t - this.rqaWindow);
    const sequence = history.slice(start, t).map((row) => row.bits[j]);
    const states: number[] = [];
    for (let i = 3; i < sequence.length; i++) {
      states.push(
        sequence[i - 3] * 8 +
          sequence[i - 2] * 4 +
          sequence[i - 1] * 2 +
          sequence[i],
      );
    }
    const stateCounts = new Array(16).fill(0);
    const transitionCounts = Array.from({ length: 16 }, () =>
      new Array(16).fill(0),
    );
    for (const state of states) stateCounts[state]++;
    for (let i = 0; i + 1 < states.length; i++) {
      transitionCounts[states[i]][states[i + 1]]++;
    }
    const length = Math.max(1, states.length);
    let recurrencePairs = 0;
    let diagonalPairs = 0;
    let entropy = 0;
    for (const count of stateCounts) {
      recurrencePairs += (count * (count - 1)) / 2;
      if (count) {
        const probability = count / length;
        entropy -= probability * Math.log(probability);
      }
    }
    for (const row of transitionCounts) {
      for (const count of row) diagonalPairs += (count * (count - 1)) / 2;
    }
    const currentState = states[states.length - 1] || 0;
    let transitions = 0;
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] !== sequence[i - 1]) transitions++;
    }
    const mean =
      sequence.reduce((sum, value) => sum + value, 0) /
      Math.max(1, sequence.length);
    const pairDenominator = Math.max(1, (length * (length - 1)) / 2);
    return [
      1,
      mean,
      recurrencePairs / pairDenominator,
      diagonalPairs / Math.max(1, recurrencePairs),
      stateCounts[currentState] / length,
      entropy / Math.log(16),
      transitions / Math.max(1, sequence.length - 1),
      sequence[sequence.length - 1] || 0,
    ];
  }

  private finalizePick(candidates: any[], detailed: boolean): Pick {
    const ranked = [...candidates].sort(
      (a, b) => a.risk - b.risk || a.number - b.number,
    );
    const selected = ranked[0];
    const mean =
      candidates.reduce((sum, item) => sum + item.risk, 0) / candidates.length;
    const standardDeviation = Math.sqrt(
      candidates.reduce((sum, item) => sum + (item.risk - mean) ** 2, 0) /
        candidates.length,
    );
    const min = ranked[0].risk;
    const max = ranked[ranked.length - 1].risk;
    const range = Math.max(1e-12, max - min);
    return {
      number: selected.number,
      display: String(selected.number).padStart(2, '0'),
      risk: this.round(selected.risk),
      separation: this.round(
        (ranked[1].risk - ranked[0].risk) / Math.max(1e-12, standardDeviation),
      ),
      ...(detailed
        ? {
            riskMap: candidates.map((item) => ({
              number: item.number,
              display: String(item.number).padStart(2, '0'),
              risk: this.round(item.risk),
              normalizedRisk: this.round((item.risk - min) / range),
              selected: item.number === selected.number,
            })),
          }
        : {}),
    };
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
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      ...(includeRows ? { rows: rows.slice().reverse() } : {}),
    };
  }

  private cutoffExclusive(history: DrawRow[]) {
    const firstAfter = history.findIndex(
      (row) =>
        row.year > this.frozenYear ||
        (row.year === this.frozenYear && row.No > this.frozenNo),
    );
    return firstAfter === -1 ? history.length : firstAfter;
  }

  private isAtOrBeforeFreeze(row: { year: number; No: number }) {
    return (
      row.year < this.frozenYear ||
      (row.year === this.frozenYear && row.No <= this.frozenNo)
    );
  }

  private isProspective(row: { year: number; No: number }) {
    return (
      row.year > this.frozenYear ||
      (row.year === this.frozenYear && row.No >= this.prospectiveStartNo)
    );
  }

  private nextPeriod(row: DrawRow) {
    return { year: row.year, No: row.No + 1 };
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
        const bits = new Array(49).fill(0);
        for (const number of numbers) bits[number - 1] = 1;
        return {
          id: Number(row.id || 0),
          year: Number(row.year),
          No: Number(row.No),
          numbers,
          numberSet: new Set(numbers),
          bits,
        };
      })
      .filter(
        (row) =>
          Number.isInteger(row.year) &&
          Number.isInteger(row.No) &&
          new Set(row.numbers).size === 7 &&
          row.numbers.every(
            (number) => Number.isInteger(number) && number >= 1 && number <= 49,
          ),
      )
      .sort((a, b) => a.year - b.year || a.No - b.No || a.id - b.id);
  }

  private sigmoid(value: number) {
    if (value > 30) return 1;
    if (value < -30) return 0;
    return 1 / (1 + Math.exp(-value));
  }

  private dot(a: number[], b: number[]) {
    let value = 0;
    for (let i = 0; i < a.length; i++) value += a[i] * b[i];
    return value;
  }

  private round(value: number) {
    return Number(value.toFixed(6));
  }
}
