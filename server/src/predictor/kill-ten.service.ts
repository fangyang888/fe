import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

type SourceType = 'default' | 'hk';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface KillCandidate {
  n: number;
  /** 最近 lookback 期内出现的期下标（0 = 窗口内最旧一期） */
  periods: number[];
  periodMask: number;
  appearCount: number;
  missStreak: number;
}

interface SelectionResult {
  numbers: number[];
  candidates: KillCandidate[];
  sacrificedPeriods: number[];
}

/**
 * 十码全杀：预测下期不会出现的 10 个号码。
 *
 * 选号逻辑（精确最优）：
 * 1. 统计每个号码在最近 lookback 期内的出现期集合（用 bitmask 表示）。
 * 2. DP 枚举所有期组合 mask，找出「被牺牲期数最少」且可凑齐 killCount 个号码的组合。
 * 3. 在可行号码中按遗漏期数（missStreak）降序优先选取。
 *
 * 回测口径：
 * - backtest（固定集回测）：把当前选出的 10 码直接对照最近 lookback（默认 20）期开奖，
 *   统计全杀成功的期数（与 /kill/five-period 的 historical-100 同类口径）。
 * - walkForwardBacktest（滚动回测）：每期只用该期之前的数据重新选号再验证，
 *   是诚实口径，理论期望约 C(39,7)/C(49,7) ≈ 17.9%/期，仅供参考。
 */
@Injectable()
export class KillTenService implements OnModuleDestroy {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (err) => {
        console.warn('[kill-ten-cache] Redis error:', err.message);
      });
    }
  }

  private readonly memoryCache = new Map<string, any>();
  private readonly cacheTtlSeconds = 12 * 60 * 60;
  private redisClient?: RedisClientType;
  private redisConnectPromise?: Promise<RedisClientType | null>;
  private redisDisabled = false;

  async onModuleDestroy() {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit();
    }
  }

  async getKillTen(
    source: SourceType = 'default',
    killCount = 3,
    lookback = 20,
    options: { forceRefresh?: boolean } = {},
  ) {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    const safeKillCount = Math.max(1, Math.min(15, Number(killCount) || 10));
    const safeLookback = Math.max(5, Math.min(20, Number(lookback) || 20));
    const cacheKey = this.getResponseCacheKey(source, rawRows, safeKillCount, safeLookback);

    if (!options.forceRefresh) {
      const memoryHit = this.memoryCache.get(cacheKey);
      if (memoryHit) {
        return {
          ...memoryHit,
          cacheMeta: { ...(memoryHit.cacheMeta || {}), hit: true, store: 'memory', key: cacheKey },
        };
      }

      const redisHit = await this.getJsonCache<any>(cacheKey);
      if (redisHit) {
        this.memoryCache.set(cacheKey, redisHit);
        return {
          ...redisHit,
          cacheMeta: { ...(redisHit.cacheMeta || {}), hit: true, store: 'redis', key: cacheKey },
        };
      }
    }

    if (history.length < safeLookback * 2 + 1) {
      return {
        source,
        status: 'insufficient-history',
        message: `至少需要 ${safeLookback * 2 + 1} 期历史数据。`,
        historyCount: history.length,
      };
    }

    const selection = this.selectKillSet(history, safeKillCount, safeLookback);
    const backtest = this.buildFixedSetBacktest(history, selection.numbers, safeLookback);
    const walkForwardBacktest = this.buildWalkForwardBacktest(history, safeKillCount, safeLookback);
    const latest = history[history.length - 1];
    // 随机开奖下杀 k 码全中的理论概率 = C(49-k,7)/C(49,7)，任何算法的期望都收敛于此
    const theoreticalRate = this.combination(49 - safeKillCount, 7) / this.combination(49, 7);

    const response = {
      source,
      // 真实口径：以滚动回测（每期只用之前数据选号）判断是否达标
      status: walkForwardBacktest.successRate >= 0.9 ? 'target-met' : 'below-target',
      targetRate: 0.9,
      theoreticalRate,
      prediction: {
        numbers: selection.numbers,
        display: selection.numbers.map((n) => String(n).padStart(2, '0')),
        killCount: safeKillCount,
        lookback: safeLookback,
        details: selection.candidates.map((c) => ({
          number: c.n,
          display: String(c.n).padStart(2, '0'),
          missStreak: c.missStreak,
          appearCountInLookback: c.appearCount,
          appearedPeriods: c.periods,
        })),
        sacrificedPeriods: selection.sacrificedPeriods,
      },
      backtest,
      walkForwardBacktest,
      // 两个“训练窗口100%”模型（40万模型搜索得到，权重固定）的近20期真实滚动回测
      trainedModels: this.buildTrainedModelReports(history, 20),
      optimizedModels: this.buildOptimizedModelReports(history, 20),
      historyMeta: {
        count: history.length,
        latest,
        lastTen: history.slice(-safeLookback),
      },
      note:
        `walkForwardBacktest（滚动回测）为真实口径：每期只用该期之前的数据重新选号验证。` +
        `杀 ${safeKillCount} 码的理论全中概率 = C(${49 - safeKillCount},7)/C(49,7) ≈ ${(theoreticalRate * 100).toFixed(1)}%/期，` +
        '随机开奖下任何算法的长期期望都收敛于该值。' +
        `backtest（固定集回测）= 当前选出的 ${safeKillCount} 码对照最近 ${safeLookback} 期，属事后口径，仅供参考，` +
        '两者均不构成对未来开奖的任何保证。',
      generatedAt: new Date().toISOString(),
      cacheMeta: {
        hit: false,
        store: 'redis',
        key: cacheKey,
        ttlSeconds: this.cacheTtlSeconds,
        generatedAt: new Date().toISOString(),
      },
    };

    const cachedInRedis = await this.setJsonCache(cacheKey, response, this.cacheTtlSeconds);
    response.cacheMeta.store = cachedInRedis ? 'redis' : 'memory';
    this.memoryCache.set(cacheKey, response);
    return response;
  }

  async refreshCache(source: SourceType = 'default', killCount = 3, lookback = 20) {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const safeKillCount = Math.max(1, Math.min(15, Number(killCount) || 10));
    const safeLookback = Math.max(5, Math.min(20, Number(lookback) || 20));
    const cacheKey = this.getResponseCacheKey(source, rawRows, safeKillCount, safeLookback);
    this.memoryCache.delete(cacheKey);
    const deleted = await this.deleteJsonCache(cacheKey);
    const response = await this.getKillTen(source, safeKillCount, safeLookback, {
      forceRefresh: true,
    });

    return {
      ...response,
      cacheMeta: {
        ...(response.cacheMeta || {}),
        action: 'refreshed',
        deletedBeforeRefresh: deleted,
      },
    };
  }

  /* ---------------- 选号核心 ---------------- */

  private buildCandidates(history: DrawRow[], lookback: number): KillCandidate[] {
    const recent = history.slice(-lookback);
    const candidates: KillCandidate[] = [];

    for (let n = 1; n <= 49; n++) {
      const periods: number[] = [];
      let periodMask = 0;
      recent.forEach((draw, idx) => {
        if (draw.numbers.includes(n)) {
          periods.push(idx);
          periodMask |= 1 << idx;
        }
      });

      let missStreak = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].numbers.includes(n)) break;
        missStreak++;
      }

      candidates.push({ n, periods, periodMask, appearCount: periods.length, missStreak });
    }

    return candidates;
  }

  /**
   * 精确求解：在最近 lookback 期中，找到被覆盖（牺牲）期数最少的期组合 mask，
   * 使得 periodMask ⊆ mask 的号码数量 ≥ killCount，再按遗漏降序取号。
   */
  private selectKillSet(history: DrawRow[], killCount: number, lookback: number): SelectionResult {
    const candidates = this.buildCandidates(history, lookback);
    const totalMasks = 1 << lookback;

    // SOS（子集和）DP：feasibleCount[mask] = periodMask ⊆ mask 的号码数量
    const feasibleCount = new Uint16Array(totalMasks);
    for (const c of candidates) feasibleCount[c.periodMask]++;
    for (let bit = 0; bit < lookback; bit++) {
      const step = 1 << bit;
      for (let mask = 0; mask < totalMasks; mask++) {
        if (mask & step) feasibleCount[mask] += feasibleCount[mask ^ step];
      }
    }

    let bestMask = totalMasks - 1;
    let bestPopcount = lookback + 1;

    for (let mask = 0; mask < totalMasks; mask++) {
      if (feasibleCount[mask] < killCount) continue;
      const pop = this.popcount(mask);
      if (pop < bestPopcount) {
        bestMask = mask;
        bestPopcount = pop;
      }
    }

    const chosen = candidates
      .filter((c) => (c.periodMask & ~bestMask) === 0)
      .sort(
        (a, b) =>
          a.appearCount - b.appearCount || b.missStreak - a.missStreak || a.n - b.n,
      )
      .slice(0, killCount);

    const sacrificed = new Set<number>();
    chosen.forEach((c) => c.periods.forEach((p) => sacrificed.add(p)));

    return {
      numbers: chosen.map((c) => c.n).sort((a, b) => a - b),
      candidates: chosen,
      sacrificedPeriods: [...sacrificed].sort((a, b) => a - b),
    };
  }

  /* ---------------- 训练模型（固定权重） ---------------- */

  /**
   * 40 万个随机特征加权模型中，唯二在 20 期训练窗口上做到 100% 的两个模型（权重已固定）。
   * 特征顺序：[遗漏期数, 近5期频率, 近10期频率, 近20期频率, 近50期频率,
   *           近10期同尾数压力, 近10期同分区压力, 近10期邻号(±2)压力, 上期是否出现]
   * 分数最高的 3 个号码即为该模型的杀 3 码预测。这里展示的是真实滚动回测。
   */
  private static readonly TRAINED_KILL3_MODELS = [
    {
      key: 'trained-a',
      name: '训练模型A（训练窗口20/20）',
      weights: [-0.432741, 0.922762, 0.533262, 0.547877, -0.264899, -0.272777, 0.62169, -0.329245, 0.328219],
    },
    {
      key: 'trained-b',
      name: '训练模型B（训练窗口20/20）',
      weights: [-0.482598, 0.225815, 0.958196, 0.570215, -0.882678, 0.888604, -0.283813, 0.348023, 0.387726],
    },
  ];

  private buildModelFeature(history: DrawRow[], t: number, n: number): number[] {
    let miss = 0;
    for (let i = t - 1; i >= 0; i--) {
      if (history[i].numbers.includes(n)) break;
      miss++;
    }
    const freq = (w: number) => {
      let c = 0;
      for (let i = t - w; i < t; i++) if (history[i].numbers.includes(n)) c++;
      return c;
    };
    const flat10: number[] = [];
    for (let i = t - 10; i < t; i++) flat10.push(...history[i].numbers);

    return [
      miss,
      freq(5),
      freq(10),
      freq(20),
      freq(50),
      flat10.filter((x) => x % 10 === n % 10).length,
      flat10.filter((x) => Math.floor((x - 1) / 10) === Math.floor((n - 1) / 10)).length,
      flat10.filter((x) => Math.abs(x - n) <= 2).length,
      history[t - 1].numbers.includes(n) ? 1 : 0,
    ];
  }

  /** 返回杀3码（按号码升序）和分数最高的 top1（模型最有把握的一杀） */
  private modelPredict(
    history: DrawRow[],
    t: number,
    weights: number[],
  ): { numbers: number[]; topNumber: number } {
    const scored: Array<[number, number]> = [];
    for (let n = 1; n <= 49; n++) {
      const fv = this.buildModelFeature(history, t, n);
      let s = 0;
      for (let j = 0; j < fv.length; j++) s += weights[j] * fv[j];
      scored.push([s, n]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const top3 = scored.slice(0, 3);
    return {
      numbers: top3.map(([, n]) => n).sort((a, b) => a - b),
      topNumber: top3[0][1],
    };
  }

  private modelScores(history: DrawRow[], t: number, weights: number[]) {
    return Array.from({ length: 49 }, (_, i) => {
      const n = i + 1;
      const fv = this.buildModelFeature(history, t, n);
      let score = 0;
      for (let j = 0; j < fv.length; j++) score += weights[j] * fv[j];
      return { n, score };
    });
  }

  private normalizeScoreMap(scores: Array<{ n: number; score: number }>) {
    const mean = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
    const variance = scores.reduce((sum, item) => sum + (item.score - mean) ** 2, 0) / scores.length;
    const sd = Math.sqrt(variance) || 1;
    return new Map(scores.map((item) => [item.n, (item.score - mean) / sd]));
  }

  private optimizedModelPredict(history: DrawRow[], t: number): { numbers: number[]; topNumber: number } {
    const [, modelB] = KillTenService.TRAINED_KILL3_MODELS;
    const bScores = this.normalizeScoreMap(this.modelScores(history, t, modelB.weights));
    const scored: Array<{ n: number; score: number; feature: number[] }> = [];

    for (let n = 1; n <= 49; n++) {
      const feature = this.buildModelFeature(history, t, n);
      const freq5 = feature[1] || 0;
      const freq10 = feature[2] || 0;
      const lastAppeared = feature[8] || 0;
      const score =
        (bScores.get(n) || 0) -
        0.15 * Math.max(0, freq10 - 1) -
        0.1 * lastAppeared -
        0.05 * freq5;
      scored.push({ n, score, feature });
    }

    scored.sort((a, b) => b.score - a.score || a.n - b.n);
    const top3 = scored.slice(0, 3);
    const topRiskSorted = [...top3].sort((a, b) => {
      const aRisk =
        (a.feature[1] || 0) * 1 +
        (a.feature[2] || 0) * 0.3 +
        (a.feature[8] || 0) * 0.5 -
        (Math.min(20, a.feature[0] || 0) / 20) * 0.4;
      const bRisk =
        (b.feature[1] || 0) * 1 +
        (b.feature[2] || 0) * 0.3 +
        (b.feature[8] || 0) * 0.5 -
        (Math.min(20, b.feature[0] || 0) / 20) * 0.4;
      return aRisk - bRisk || b.score - a.score || a.n - b.n;
    });

    return {
      numbers: top3.map(({ n }) => n).sort((a, b) => a - b),
      topNumber: topRiskSorted[0].n,
    };
  }

  /** 两个训练模型的下期预测 + 近 backtestCount 期真实滚动回测 */
  private buildTrainedModelReports(history: DrawRow[], backtestCount = 15) {
    if (history.length < 60 + backtestCount) return [];

    return KillTenService.TRAINED_KILL3_MODELS.map((model) => {
      const rows: any[] = [];
      for (let t = history.length - backtestCount; t < history.length; t++) {
        const predicted = this.modelPredict(history, t, model.weights);
        const actual = history[t];
        const appeared = predicted.numbers.filter((n) => actual.numbers.includes(n));
        rows.push({
          year: actual.year,
          No: actual.No,
          actualNumbers: actual.numbers,
          predictedKillNumbers: predicted.numbers,
          topKillNumber: predicted.topNumber,
          topKillSuccess: !actual.numbers.includes(predicted.topNumber),
          appearedKillNumbers: appeared,
          allKilled: appeared.length === 0,
        });
      }
      const successCount = rows.filter((r) => r.allKilled).length;
      const topSuccessCount = rows.filter((r) => r.topKillSuccess).length;
      const next = this.modelPredict(history, history.length, model.weights);

      return {
        key: model.key,
        name: model.name,
        killCount: 3,
        weights: model.weights,
        prediction: {
          numbers: next.numbers,
          display: next.numbers.map((n) => String(n).padStart(2, '0')),
          topNumber: next.topNumber,
          topDisplay: String(next.topNumber).padStart(2, '0'),
        },
        backtest: {
          kind: 'walk-forward',
          count: rows.length,
          successCount,
          failureCount: rows.length - successCount,
          successRate: rows.length > 0 ? successCount / rows.length : 0,
          // top1（模型最有把握的一杀）的单杀成功率，随机基线 6/7 ≈ 85.7%
          topSuccessCount,
          topSuccessRate: rows.length > 0 ? topSuccessCount / rows.length : 0,
          rows: [...rows].reverse(),
        },
      };
    });
  }

  /** 优化模型：B 主模型做热号惩罚，Top1 在候选3码内按低热风险重排。 */
  private buildOptimizedModelReports(history: DrawRow[], backtestCount = 20) {
    if (history.length < 60 + backtestCount) return [];

    const rows: any[] = [];
    for (let t = history.length - backtestCount; t < history.length; t++) {
      const predicted = this.optimizedModelPredict(history, t);
      const actual = history[t];
      const appeared = predicted.numbers.filter((n) => actual.numbers.includes(n));
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedKillNumbers: predicted.numbers,
        topKillNumber: predicted.topNumber,
        topKillSuccess: !actual.numbers.includes(predicted.topNumber),
        appearedKillNumbers: appeared,
        allKilled: appeared.length === 0,
      });
    }

    const successCount = rows.filter((r) => r.allKilled).length;
    const topSuccessCount = rows.filter((r) => r.topKillSuccess).length;
    const next = this.optimizedModelPredict(history, history.length);

    return [
      {
        key: 'optimized-b-low-risk-top',
        name: '优化B模型（热号惩罚 + ★低热重排）',
        method: 'b-model-hot-penalty-low-risk-top',
        killCount: 3,
        prediction: {
          numbers: next.numbers,
          display: next.numbers.map((n) => String(n).padStart(2, '0')),
          topNumber: next.topNumber,
          topDisplay: String(next.topNumber).padStart(2, '0'),
        },
        backtest: {
          kind: 'walk-forward',
          count: rows.length,
          successCount,
          failureCount: rows.length - successCount,
          successRate: rows.length > 0 ? successCount / rows.length : 0,
          topSuccessCount,
          topSuccessRate: rows.length > 0 ? topSuccessCount / rows.length : 0,
          rows: [...rows].reverse(),
        },
      },
    ];
  }

  private combination(n: number, k: number): number {
    let result = 1;
    for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
    return result;
  }

  private popcount(value: number): number {
    let v = value;
    let count = 0;
    while (v) {
      v &= v - 1;
      count++;
    }
    return count;
  }

  /* ---------------- 回测 ---------------- */

  /** 固定集回测：当前选出的 killSet 直接对照最近 lookback 期 */
  private buildFixedSetBacktest(history: DrawRow[], killSet: number[], lookback: number) {
    const recent = history.slice(-lookback);
    const rows = recent.map((draw) => {
      const appeared = killSet.filter((n) => draw.numbers.includes(n));
      return {
        year: draw.year,
        No: draw.No,
        actualNumbers: draw.numbers,
        predictedKillNumbers: killSet,
        appearedKillNumbers: appeared,
        allKilled: appeared.length === 0,
      };
    });

    const successCount = rows.filter((r) => r.allKilled).length;
    return {
      kind: 'fixed-set',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length > 0 ? successCount / rows.length : 0,
      isPerfect: rows.length > 0 && successCount === rows.length,
      rows: [...rows].reverse(),
    };
  }

  /** 滚动回测（诚实口径）：每期只用之前的数据重新选号 */
  private buildWalkForwardBacktest(history: DrawRow[], killCount: number, lookback: number) {
    const start = Math.max(lookback, history.length - lookback);
    const rows: any[] = [];

    for (let i = start; i < history.length; i++) {
      const training = history.slice(0, i);
      const actual = history[i];
      const selection = this.selectKillSet(training, killCount, lookback);
      const appeared = selection.numbers.filter((n) => actual.numbers.includes(n));

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedKillNumbers: selection.numbers,
        appearedKillNumbers: appeared,
        allKilled: appeared.length === 0,
      });
    }

    const successCount = rows.filter((r) => r.allKilled).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length > 0 ? successCount / rows.length : 0,
      rows: [...rows].reverse(),
    };
  }

  /* ---------------- 数据与缓存 ---------------- */

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((item) => {
        const numbers = [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);

        return { id: item.id, year: item.year, No: item.No, numbers };
      })
      .filter((item) => item.numbers.length === 7)
      .sort((a, b) => {
        if ((a.year || 0) !== (b.year || 0)) return (a.year || 0) - (b.year || 0);
        if ((a.No || 0) !== (b.No || 0)) return (a.No || 0) - (b.No || 0);
        return (a.id || 0) - (b.id || 0);
      });
  }

  private getHistoryCacheKey(rawRows: any[]) {
    const last = rawRows[rawRows.length - 1];
    if (!last) return 'empty';
    const period = last.period ?? last.No ?? last.id ?? rawRows.length;
    const nums = [last.n1, last.n2, last.n3, last.n4, last.n5, last.n6, last.n7].join(',');
    return `${rawRows.length}:${period}:${nums}`;
  }

  private getResponseCacheKey(
    source: SourceType,
    rawRows: any[],
    killCount: number,
    lookback: number,
  ) {
    return `predictor:kill-ten:v8:${source}:k${killCount}:lb${lookback}:${this.getHistoryCacheKey(rawRows)}`;
  }

  private async getRedisClient() {
    if (!this.redisClient || this.redisDisabled) return null;
    if (this.redisClient.isReady) return this.redisClient;

    if (!this.redisConnectPromise) {
      this.redisConnectPromise = this.redisClient
        .connect()
        .then(() => this.redisClient || null)
        .catch((err) => {
          this.redisDisabled = true;
          console.warn('[kill-ten-cache] Redis disabled:', err.message);
          return null;
        });
    }

    return this.redisConnectPromise;
  }

  private async getJsonCache<T>(key: string): Promise<T | null> {
    const client = await this.getRedisClient();
    if (!client) return null;

    try {
      const value = await client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err) {
      console.warn('[kill-ten-cache] Redis read failed:', (err as Error).message);
      return null;
    }
  }

  private async setJsonCache(key: string, value: any, ttlSeconds: number) {
    const client = await this.getRedisClient();
    if (!client) return false;

    try {
      await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return true;
    } catch (err) {
      console.warn('[kill-ten-cache] Redis write failed:', (err as Error).message);
      return false;
    }
  }

  private async deleteJsonCache(key: string) {
    const client = await this.getRedisClient();
    if (!client) return false;

    try {
      return (await client.del(key)) > 0;
    } catch (err) {
      console.warn('[kill-ten-cache] Redis delete failed:', (err as Error).message);
      return false;
    }
  }
}
