import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year: number;
  No: number;
  numbers: number[];
  numberSet: Set<number>;
};
type RankedNumber = { number: number; risk: number; rank: number };
type Expert = { key: string; label: string; family: string; picks: RankedNumber[] };
type AdaptiveConfig = { lookback: number; eta: number; prior: number };
type Prediction = {
  candidates: Array<{
    number: number;
    display: string;
    riskIndex: number;
    familyVotes: number;
    supportSources: string[];
  }>;
  expertWeights: Array<{ key: string; label: string; recentRate: number; weight: number }>;
  strategy: string;
};
type EvaluationRow = {
  year: number;
  No: number;
  actualNumbers: number[];
  picks: number[];
  appeared: number[];
  success: boolean;
};

@Injectable()
export class RiskControlledFiveService {
  private readonly minimumHistory = 260;
  private readonly validationStartIndex = 839;
  private readonly blindStart = { year: 2026, No: 139 };
  private readonly blindEnd = { year: 2026, No: 198 };
  private readonly liveStart = { year: 2026, No: 199 };
  private readonly tierConfigs: Record<number, AdaptiveConfig | null> = {
    3: { lookback: 60, eta: 20, prior: 10 },
    4: { lookback: 160, eta: 20, prior: 10 },
    5: null,
  };
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getReport() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < this.minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `实时自学习引擎至少需要 ${this.minimumHistory} 期历史。`,
      };
    }
    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:adaptive-v2`;
    if (this.cache?.key === cacheKey) return { ...this.cache.value, cache: 'hit' };

    const gaps = this.buildGapMatrix(history);
    const expertCache = new Map<number, Expert[]>();
    const predictionCache = new Map<string, Prediction>();
    const blindStartIndex = history.findIndex((row) => this.isPeriod(row, this.blindStart));
    const blindEndIndex = history.findIndex((row) => this.isPeriod(row, this.blindEnd));
    const developmentEnd = blindStartIndex >= 0 ? blindStartIndex : history.length;
    const liveIndex = history.findIndex((row) => this.isPeriod(row, this.liveStart));

    const predict = (t: number, count: number) => {
      const key = `${t}:${count}`;
      const cached = predictionCache.get(key);
      if (cached) return cached;
      const result = this.vetoPrediction(history, gaps, t, count);
      predictionCache.set(key, result);
      return result;
    };

    const tiers = [3, 4, 5].map((count) => {
      const current = predict(history.length, count);
      const validationRows = this.evaluate(
        history,
        Math.min(this.validationStartIndex, developmentEnd),
        developmentEnd,
        count,
        predict,
      );
      const blindRows =
        blindStartIndex >= 0
          ? this.evaluate(
              history,
              blindStartIndex,
              blindEndIndex >= blindStartIndex ? blindEndIndex + 1 : history.length,
              count,
              predict,
            )
          : [];
      const liveRows =
        liveIndex >= 0 ? this.evaluate(history, liveIndex, history.length, count, predict) : [];
      return {
        count,
        strategy: current.strategy,
        numbers: current.candidates.slice(0, count),
        numberValues: current.candidates.slice(0, count).map((item) => item.number),
        expertWeights: current.expertWeights,
        theoreticalBaseline: this.theoreticalRate(count),
        validation: this.summarize(validationRows),
        blindTest: this.summarize(blindRows, true),
        live: this.summarize(liveRows, true),
      };
    });

    const value = {
      status: 'ready',
      engine: {
        name: '实时多尺度缺席学习引擎',
        version: 'MULTI-VETO-V3',
        state: 'online-learning',
        statement:
          '主模型先选出8个低风险候选，再由前5期位置偏移、5期状态块、10期状态块和相似状态逐层否决可能拖累整组的号码。不同档位使用独立否决门槛。',
        independence:
          '不调用旧项目的固定锚点、期号公式或旧杀码服务。所有回测均严格只读取目标期之前的数据。',
        warning:
          '这是风险排序而非确定性预测。实时学习改善了历史样本表现，但无法保证下一期或连续多期命中。',
        learningRules: [
          '3码：位置偏移＋5/10期状态块＋相似状态四层否决',
          '4码：位置偏移＋5/10期状态块三层否决',
          '5码：三层否决，并保留少量连续风险排序',
        ],
      },
      split: {
        totalHistory: history.length,
        development: {
          count: developmentEnd,
          end: developmentEnd ? this.period(history[developmentEnd - 1]) : null,
        },
        blindTest: {
          frozen: true,
          start: this.blindStart,
          end: this.blindEnd,
          count:
            blindStartIndex >= 0
              ? Math.max(0, Math.min(history.length - 1, blindEndIndex) - blindStartIndex + 1)
              : 0,
        },
        liveStart: this.liveStart,
      },
      current: {
        target: this.nextPeriod(latest),
        tiers,
        candidatePool: predict(history.length, 3).candidates.slice(0, 12),
        latestActual: { period: this.period(latest), numbers: latest.numbers },
      },
      historyMeta: {
        count: history.length,
        latest: {
          id: latest.id,
          year: latest.year,
          No: latest.No,
          numbers: latest.numbers,
        },
      },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private adaptivePredict(
    history: DrawRow[],
    gaps: number[][],
    t: number,
    count: number,
    config: AdaptiveConfig,
    expertCache: Map<number, Expert[]>,
  ): Prediction {
    const experts = this.expertsAt(history, gaps, t, expertCache);
    const baseline = this.theoreticalRate(count);
    const weightedExperts = experts.map((expert) => {
      let successes = 0;
      let samples = 0;
      for (let s = Math.max(this.minimumHistory, t - config.lookback); s < t; s++) {
        const pastExpert = this.expertsAt(history, gaps, s, expertCache).find(
          (item) => item.key === expert.key,
        )!;
        if (pastExpert.picks.slice(0, count).every((item) => !history[s].numberSet.has(item.number))) {
          successes++;
        }
        samples++;
      }
      const recentRate = (successes + config.prior * baseline) / (samples + config.prior);
      const weight = Math.exp(config.eta * (recentRate - baseline));
      return { ...expert, recentRate, weight };
    });
    const totalWeight = weightedExperts.reduce((sum, expert) => sum + expert.weight, 0);
    const candidates = Array.from({ length: 49 }, (_, index) => {
      const number = index + 1;
      let riskIndex = 0;
      const supportSources: string[] = [];
      const families = new Set<string>();
      for (const expert of weightedExperts) {
        const item = expert.picks.find((candidate) => candidate.number === number)!;
        riskIndex += expert.weight * (item.rank / 48);
        if (item.rank < count + 3) {
          supportSources.push(expert.label);
          families.add(expert.family);
        }
      }
      return {
        number,
        display: String(number).padStart(2, '0'),
        riskIndex: riskIndex / totalWeight,
        familyVotes: families.size,
        supportSources,
      };
    }).sort(
      (a, b) =>
        a.riskIndex - b.riskIndex ||
        b.familyVotes - a.familyVotes ||
        a.number - b.number,
    );
    return {
      candidates,
      expertWeights: weightedExperts
        .map((expert) => ({
          key: expert.key,
          label: expert.label,
          recentRate: expert.recentRate,
          weight: expert.weight,
        }))
        .sort((a, b) => b.weight - a.weight),
      strategy: `${count === 3 ? '60' : '160'}期在线专家学习`,
    };
  }

  private expertsAt(
    history: DrawRow[],
    gaps: number[][],
    t: number,
    cache: Map<number, Expert[]>,
  ) {
    const cached = cache.get(t);
    if (cached) return cached;
    const experts: Expert[] = [];
    for (const window of [24, 48, 96, 160, 240]) {
      experts.push({
        key: `freq-${window}`,
        label: `${window}期稳定频率`,
        family: '稳定频率',
        picks: this.rank(
          Array.from({ length: 49 }, (_, index) => {
            const number = index + 1;
            let hits = 0;
            for (let s = Math.max(0, t - window); s < t; s++) {
              if (history[s].numberSet.has(number)) hits++;
            }
            return { number, risk: (hits + 2) / (Math.min(window, t) + 14) };
          }),
        ),
      });
    }
    for (const halfLife of [3, 6, 12, 24]) {
      experts.push({
        key: `ewma-${halfLife}`,
        label: `${halfLife}期半衰实时频率`,
        family: '实时频率',
        picks: this.rank(
          Array.from({ length: 49 }, (_, index) => {
            const number = index + 1;
            let hits = 0;
            let weights = 0;
            for (let s = Math.max(0, t - 120); s < t; s++) {
              const weight = Math.exp(-(t - 1 - s) / halfLife);
              hits += weight * (history[s].numberSet.has(number) ? 1 : 0);
              weights += weight;
            }
            return { number, risk: (hits + 0.5) / (weights + 3.5) };
          }),
        ),
      });
    }
    experts.push({
      key: 'gap-hazard',
      label: '间隔条件风险',
      family: '间隔状态',
      picks: this.rank(
        Array.from({ length: 49 }, (_, index) => {
          const number = index + 1;
          const bucket = Math.min(10, gaps[t][number]);
          let samples = 0;
          let hits = 0;
          for (let s = Math.max(60, t - 420); s < t; s++) {
            if (Math.min(10, gaps[s][number]) !== bucket) continue;
            samples++;
            if (history[s].numberSet.has(number)) hits++;
          }
          return { number, risk: (hits + 5 * (7 / 49)) / (samples + 5) };
        }),
      ),
    });
    const currentState = history[t - 1].numberSet;
    experts.push({
      key: 'state-neighbors',
      label: '相似状态邻居',
      family: '状态邻居',
      picks: this.rank(
        Array.from({ length: 49 }, (_, index) => {
          const number = index + 1;
          let hits = 0;
          let weights = 0;
          for (let s = Math.max(1, t - 420); s < t; s++) {
            let overlap = 0;
            for (const value of history[s - 1].numbers) if (currentState.has(value)) overlap++;
            if (!overlap) continue;
            const weight = overlap * overlap;
            weights += weight;
            if (history[s].numberSet.has(number)) hits += weight;
          }
          return { number, risk: (hits + 4 * (7 / 49)) / (weights + 4) };
        }),
      ),
    });
    cache.set(t, experts);
    return experts;
  }

  private blockGuardedFive(history: DrawRow[], gaps: number[][], t: number): Prediction {
    const base = this.staticRisk(history, gaps, t);
    const block5 = this.blockStateRank(history, t, 5);
    const block10 = this.blockStateRank(history, t, 10);
    const candidates = Array.from({ length: 49 }, (_, index) => {
      const number = index + 1;
      const baseRank = base.findIndex((item) => item.number === number) / 48;
      const blockRank =
        (block5.find((item) => item.number === number)!.rank +
          block10.find((item) => item.number === number)!.rank) /
        96;
      return {
        number,
        display: String(number).padStart(2, '0'),
        riskIndex: 0.9 * baseRank + 0.1 * blockRank,
        familyVotes: 3,
        supportSources: ['实时主模型', '5期状态块', '10期状态块'],
      };
    }).sort((a, b) => a.riskIndex - b.riskIndex || a.number - b.number);
    return {
      candidates,
      expertWeights: [
        { key: 'realtime-base', label: '实时主模型', recentRate: 0, weight: 0.9 },
        { key: 'block-5-10', label: '5/10期状态块', recentRate: 0, weight: 0.1 },
      ],
      strategy: '5期＋10期状态块过滤',
    };
  }

  private vetoPrediction(
    history: DrawRow[],
    gaps: number[][],
    t: number,
    count: number,
  ): Prediction {
    const configs: Record<
      number,
      {
        signals: Array<'modular' | 'block5' | 'block10' | 'state'>;
        cutoff: number;
        penalty: number;
        signalWeight: number;
      }
    > = {
      3: {
        signals: ['modular', 'block5', 'block10', 'state'],
        cutoff: 28,
        penalty: 0.08,
        signalWeight: 0,
      },
      4: {
        signals: ['modular', 'block5', 'block10'],
        cutoff: 28,
        penalty: 0.15,
        signalWeight: 0,
      },
      5: {
        signals: ['modular', 'block5', 'block10'],
        cutoff: 34,
        penalty: 0.15,
        signalWeight: 0.05,
      },
    };
    const config = configs[count];
    const base = this.staticRisk(history, gaps, t);
    const signalMap = {
      modular: this.modularRank(history, t),
      block5: this.blockStateRank(history, t, 5),
      block10: this.blockStateRank(history, t, 10),
      state: this.stateNeighborRank(history, t),
    };
    const labels = {
      modular: '前5期位置偏移',
      block5: '5期状态块',
      block10: '10期状态块',
      state: '相似状态',
    };
    const signals = config.signals.map((key) => ({ key, values: signalMap[key] }));
    const candidates = base
      .slice(0, 8)
      .map((item, baseRank) => {
        const ranks = signals.map(({ values }) =>
          values.findIndex((candidate) => candidate.number === item.number),
        );
        const vetoSources = signals
          .filter((_, index) => ranks[index] >= config.cutoff)
          .map(({ key }) => labels[key]);
        const vetoCount = vetoSources.length;
        const meanRank =
          ranks.reduce((sum, value) => sum + value, 0) / (ranks.length * 48);
        return {
          number: item.number,
          display: String(item.number).padStart(2, '0'),
          riskIndex:
            baseRank / 48 +
            config.penalty * vetoCount +
            config.signalWeight * meanRank,
          familyVotes: config.signals.length - vetoCount,
          supportSources: config.signals
            .filter((_, index) => ranks[index] < config.cutoff)
            .map((key) => labels[key]),
          vetoCount,
          vetoSources,
          signalRanks: ranks,
        };
      })
      .sort((a, b) => a.riskIndex - b.riskIndex || a.number - b.number);
    return {
      candidates,
      expertWeights: config.signals.map((key) => ({
        key,
        label: labels[key],
        recentRate: 0,
        weight: 1 / config.signals.length,
      })),
      strategy: `${config.signals.length}层风险否决`,
    };
  }

  private modularRank(history: DrawRow[], t: number) {
    const lag = 5;
    const window = 300;
    const source = history[t - lag].numbers;
    const risk = Array(50).fill(0);
    for (let position = 0; position < 7; position++) {
      const deltaCounts = Array(50).fill(0);
      let samples = 0;
      for (let s = Math.max(lag, t - window); s < t; s++) {
        const pastSource = history[s - lag].numbers[position];
        for (const target of history[s].numbers) {
          deltaCounts[this.wrap(target - pastSource)]++;
        }
        samples += 7;
      }
      for (let number = 1; number <= 49; number++) {
        const delta = this.wrap(number - source[position]);
        risk[number] += (deltaCounts[delta] + 3 / 7) / (samples + 21);
      }
    }
    return this.rank(
      Array.from({ length: 49 }, (_, index) => ({
        number: index + 1,
        risk: risk[index + 1] / 7,
      })),
    );
  }

  private stateNeighborRank(history: DrawRow[], t: number) {
    const current = history[t - 1].numberSet;
    const hits = Array(50).fill(0);
    let weightSum = 0;
    for (let s = Math.max(1, t - 420); s < t; s++) {
      let overlap = 0;
      for (const number of history[s - 1].numbers) if (current.has(number)) overlap++;
      if (!overlap) continue;
      const weight = overlap * overlap;
      weightSum += weight;
      for (const number of history[s].numbers) hits[number] += weight;
    }
    return this.rank(
      Array.from({ length: 49 }, (_, index) => ({
        number: index + 1,
        risk: (hits[index + 1] + 4 * (7 / 49)) / (weightSum + 4),
      })),
    );
  }

  private modularThree(history: DrawRow[], gaps: number[][], t: number): Prediction {
    const base = this.staticRisk(history, gaps, t);
    const lag = 5;
    const window = 300;
    const source = history[t - lag].numbers;
    const risk = Array(50).fill(0);
    for (let position = 0; position < 7; position++) {
      const deltaCounts = Array(50).fill(0);
      let samples = 0;
      for (let s = Math.max(lag, t - window); s < t; s++) {
        const pastSource = history[s - lag].numbers[position];
        for (const target of history[s].numbers) {
          deltaCounts[this.wrap(target - pastSource)]++;
        }
        samples += 7;
      }
      for (let number = 1; number <= 49; number++) {
        const delta = this.wrap(number - source[position]);
        risk[number] += (deltaCounts[delta] + 3 / 7) / (samples + 21);
      }
    }
    const modular = this.rank(
      Array.from({ length: 49 }, (_, index) => ({
        number: index + 1,
        risk: risk[index + 1] / 7,
      })),
    );
    const candidates = Array.from({ length: 49 }, (_, index) => {
      const number = index + 1;
      const baseRank = base.findIndex((item) => item.number === number) / 48;
      const modularRank = modular.findIndex((item) => item.number === number) / 48;
      return {
        number,
        display: String(number).padStart(2, '0'),
        riskIndex: 0.9 * baseRank + 0.1 * modularRank,
        familyVotes: 2,
        supportSources: ['实时主模型', '前5期位置动态偏移'],
      };
    }).sort((a, b) => a.riskIndex - b.riskIndex || a.number - b.number);
    return {
      candidates,
      expertWeights: [
        { key: 'realtime-base', label: '实时主模型', recentRate: 0, weight: 0.9 },
        { key: 'lag5-modular', label: '前5期位置动态偏移', recentRate: 0, weight: 0.1 },
      ],
      strategy: '前5期位置动态偏移',
    };
  }

  private staticRisk(history: DrawRow[], gaps: number[][], t: number) {
    return this.rank(
      Array.from({ length: 49 }, (_, index) => {
        const number = index + 1;
        let longHits = 0;
        let realtimeHits = 0;
        let weights = 0;
        for (let s = t - 240; s < t; s++) {
          if (history[s].numberSet.has(number)) longHits++;
          const weight = Math.exp(-(t - 1 - s) / 6);
          realtimeHits += weight * (history[s].numberSet.has(number) ? 1 : 0);
          weights += weight;
        }
        const longRisk = (longHits + 2) / 254;
        const realtimeRisk = (realtimeHits + 0.5) / (weights + 3.5);
        return {
          number,
          risk: 0.45 * longRisk + 0.55 * realtimeRisk + 0.04 * (Math.min(gaps[t][number], 15) / 15),
        };
      }),
    );
  }

  private blockStateRank(history: DrawRow[], t: number, size: number) {
    return this.rank(
      Array.from({ length: 49 }, (_, index) => {
        const number = index + 1;
        let currentCount = 0;
        for (let s = Math.max(0, t - size); s < t; s++) {
          if (history[s].numberSet.has(number)) currentCount++;
        }
        const state = Math.min(2, currentCount);
        let samples = 0;
        let hits = 0;
        for (let s = Math.max(size * 8, t - 480); s < t; s += size) {
          let pastCount = 0;
          for (let p = s - size; p < s; p++) {
            if (history[p].numberSet.has(number)) pastCount++;
          }
          if (Math.min(2, pastCount) !== state) continue;
          samples++;
          if (history[s].numberSet.has(number)) hits++;
        }
        return { number, risk: (hits + 6 * (7 / 49)) / (samples + 6) };
      }),
    );
  }

  private rank(items: Array<{ number: number; risk: number }>): RankedNumber[] {
    return items
      .sort((a, b) => a.risk - b.risk || a.number - b.number)
      .map((item, rank) => ({ ...item, rank }));
  }

  private wrap(value: number) {
    return ((value - 1) % 49 + 49) % 49 + 1;
  }

  private buildGapMatrix(history: DrawRow[]) {
    const gaps = Array.from({ length: history.length + 1 }, () => Array(50).fill(30));
    const lastSeen = Array(50).fill(-31);
    for (let t = 0; t <= history.length; t++) {
      for (let number = 1; number <= 49; number++) {
        gaps[t][number] = Math.min(30, t - 1 - lastSeen[number]);
      }
      if (t < history.length) {
        for (const number of history[t].numbers) lastSeen[number] = t;
      }
    }
    return gaps;
  }

  private evaluate(
    history: DrawRow[],
    start: number,
    end: number,
    count: number,
    predict: (t: number, count: number) => Prediction,
  ) {
    const rows: EvaluationRow[] = [];
    for (let t = Math.max(this.minimumHistory, start); t < Math.min(end, history.length); t++) {
      const picks = predict(t, count).candidates.slice(0, count).map((item) => item.number);
      const appeared = picks.filter((number) => history[t].numberSet.has(number));
      rows.push({
        year: history[t].year,
        No: history[t].No,
        actualNumbers: history[t].numbers,
        picks,
        appeared,
        success: appeared.length === 0,
      });
    }
    return rows;
  }

  private summarize(rows: EvaluationRow[], includeRows = false) {
    const successCount = rows.filter((row) => row.success).length;
    let running = 0;
    let maxStreak = 0;
    for (const row of rows) {
      if (row.success) {
        running++;
        maxStreak = Math.max(maxStreak, running);
      } else running = 0;
    }
    return {
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      maxStreak,
      currentStreak: running,
      latestRows: includeRows ? rows.slice(-12).reverse() : [],
      failureRows: includeRows ? rows.filter((row) => !row.success).slice(-10).reverse() : [],
    };
  }

  private theoreticalRate(count: number) {
    return this.comb(49 - count, 7) / this.comb(49, 7);
  }
  private comb(n: number, k: number) {
    let value = 1;
    for (let index = 1; index <= k; index++) value = (value * (n - k + index)) / index;
    return value;
  }
  private isPeriod(row: DrawRow, period: { year: number; No: number }) {
    return row.year === period.year && row.No === period.No;
  }
  private period(row: DrawRow) {
    return { year: row.year, No: row.No };
  }
  private nextPeriod(latest: DrawRow) {
    const nextNo = latest.No + 1;
    const lastNoOfYear = latest.year % 4 === 0 ? 366 : 365;
    return nextNo > lastNoOfYear ? { year: latest.year + 1, No: 1 } : { year: latest.year, No: nextNo };
  }
  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number);
        return {
          id: Number(row.id || 0),
          year: Number(row.year || 0),
          No: Number(row.No || 0),
          numbers,
          numberSet: new Set(numbers),
        };
      })
      .filter(
        (row) =>
          row.year > 0 &&
          row.No > 0 &&
          row.numbers.every((number) => number >= 1 && number <= 49),
      )
      .sort((a, b) => a.year - b.year || a.No - b.No || a.id - b.id);
  }
}
