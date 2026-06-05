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

interface CandidateScore {
  n: number;
  matchedSamples: number;
  failureCount: number;
  successCount: number;
  accuracy: number;
  level: number;
  featureKey: string;
  recentAppearCount: number;
  currentMissInFive: number;
  tailPressure: number;
  zonePressure: number;
  nearPressure: number;
  appearedInLatest: boolean;
}

@Injectable()
export class FivePeriodKillService implements OnModuleDestroy {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (err) => {
        console.warn('[five-period-cache] Redis error:', err.message);
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

  async getNextImpossibleNumber(source: SourceType = 'default', minSamples = 8, options: { forceRefresh?: boolean } = {}) {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    const safeMinSamples = Math.max(3, Math.min(50, Number(minSamples) || 8));
    const cacheKey = this.getResponseCacheKey(source, rawRows, safeMinSamples);

    if (!options.forceRefresh) {
      const memoryHit = this.memoryCache.get(cacheKey);
      if (memoryHit) {
        return {
          ...memoryHit,
          cacheMeta: {
            ...(memoryHit.cacheMeta || {}),
            hit: true,
            store: 'memory',
            key: cacheKey,
          },
        };
      }

      const redisHit = await this.getJsonCache<any>(cacheKey);
      if (redisHit) {
        this.memoryCache.set(cacheKey, redisHit);
        return {
          ...redisHit,
          cacheMeta: {
            ...(redisHit.cacheMeta || {}),
            hit: true,
            store: 'redis',
            key: cacheKey,
          },
        };
      }
    }

    if (history.length < 6) {
      return {
        source,
        status: 'insufficient-history',
        message: '至少需要 6 期历史数据，才能用前 5 期窗口回测下一期。',
        historyCount: history.length,
      };
    }

    const lastFive = history.slice(-5);
    const selected = this.pickCandidate(history, safeMinSamples);
    const latest = history[history.length - 1];
    const validations = this.buildRecentValidations(history, selected.level, selected.n, 20);
    const rankedCandidates = this.rankCandidates(history, safeMinSamples, selected.level).slice(0, 12);
    const strictPrediction = this.pickStrictCandidate(history, lastFive);
    const strictBacktest20 = this.buildStrictBacktest(history, 20);
    const strictBacktest50 = this.buildStrictBacktest(history, 50);

    const response = {
      source,
      status: selected.failureCount === 0 ? 'historical-100' : 'best-effort',
      prediction: {
        number: selected.n,
        display: String(selected.n).padStart(2, '0'),
        confidence: selected.accuracy,
        confidenceLabel:
          selected.failureCount === 0
            ? '当前匹配样本回测 100%'
            : `当前匹配样本回测 ${(selected.accuracy * 100).toFixed(1)}%`,
        matchedSamples: selected.matchedSamples,
        successCount: selected.successCount,
        failureCount: selected.failureCount,
        featureLevel: selected.level,
        featureKey: selected.featureKey,
        recentAppearCount: selected.recentAppearCount,
        currentMissInFive: selected.currentMissInFive,
        tailPressure: selected.tailPressure,
        zonePressure: selected.zonePressure,
        nearPressure: selected.nearPressure,
        appearedInLatest: selected.appearedInLatest,
      },
      historyMeta: {
        count: history.length,
        latest,
        lastFive,
      },
      rankedCandidates,
      recentValidation: validations,
      strictPrediction: strictPrediction
        ? {
            number: strictPrediction.n,
            display: String(strictPrediction.n).padStart(2, '0'),
            confidence: strictPrediction.accuracy,
            matchedSamples: strictPrediction.matchedSamples,
            failureCount: strictPrediction.failureCount,
            currentMissInFive: strictPrediction.currentMissInFive,
            recentAppearCount: strictPrediction.recentAppearCount,
            tailPressure: strictPrediction.tailPressure,
            zonePressure: strictPrediction.zonePressure,
            nearPressure: strictPrediction.nearPressure,
            ruleName: '严格零失败分区压力策略',
          }
        : null,
      strictBacktest20,
      strictBacktest50,
      note:
        '这里的 100% 指“当前历史库中相同前 5 期特征的滚动样本从未开出”，不是对随机开奖的绝对保证。',
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

  async refreshCache(source: SourceType = 'default', minSamples = 8) {
    const rawRows =
      source === 'hk'
        ? await this.historyHkService.findAll()
        : await this.historyService.findAll();
    const safeMinSamples = Math.max(3, Math.min(50, Number(minSamples) || 8));
    const cacheKey = this.getResponseCacheKey(source, rawRows, safeMinSamples);
    this.memoryCache.delete(cacheKey);
    const deleted = await this.deleteJsonCache(cacheKey);
    const response = await this.getNextImpossibleNumber(source, safeMinSamples, { forceRefresh: true });

    return {
      ...response,
      cacheMeta: {
        ...(response.cacheMeta || {}),
        action: 'refreshed',
        deletedBeforeRefresh: deleted,
      },
    };
  }

  private getHistoryCacheKey(rawRows: any[]) {
    const last = rawRows[rawRows.length - 1];
    if (!last) return 'empty';
    const period = last.period ?? last.No ?? last.id ?? rawRows.length;
    const nums = [last.n1, last.n2, last.n3, last.n4, last.n5, last.n6, last.n7].join(',');
    return `${rawRows.length}:${period}:${nums}`;
  }

  private getResponseCacheKey(source: SourceType, rawRows: any[], minSamples: number) {
    return `predictor:five-period-kill:v1:${source}:min${minSamples}:${this.getHistoryCacheKey(rawRows)}`;
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
          console.warn('[five-period-cache] Redis disabled:', err.message);
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
      console.warn('[five-period-cache] Redis read failed:', (err as Error).message);
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
      console.warn('[five-period-cache] Redis write failed:', (err as Error).message);
      return false;
    }
  }

  private async deleteJsonCache(key: string) {
    const client = await this.getRedisClient();
    if (!client) return false;

    try {
      return (await client.del(key)) > 0;
    } catch (err) {
      console.warn('[five-period-cache] Redis delete failed:', (err as Error).message);
      return false;
    }
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((item) => {
        const numbers = [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);

        return {
          id: item.id,
          year: item.year,
          No: item.No,
          numbers,
        };
      })
      .filter((item) => item.numbers.length === 7)
      .sort((a, b) => {
        if ((a.year || 0) !== (b.year || 0)) return (a.year || 0) - (b.year || 0);
        if ((a.No || 0) !== (b.No || 0)) return (a.No || 0) - (b.No || 0);
        return (a.id || 0) - (b.id || 0);
      });
  }

  private pickCandidate(history: DrawRow[], minSamples: number): CandidateScore {
    for (let level = 0; level <= 4; level++) {
      const ranked = this.rankCandidates(history, minSamples, level);
      const perfect = ranked.find((item) => item.failureCount === 0 && item.matchedSamples >= minSamples);
      if (perfect) return perfect;
    }

    return this.rankCandidates(history, 1, 4)[0];
  }

  private rankCandidates(history: DrawRow[], minSamples: number, level: number): CandidateScore[] {
    const lastFive = history.slice(-5);
    const candidates: CandidateScore[] = [];

    for (let n = 1; n <= 49; n++) {
      const feature = this.buildFeature(lastFive, n, level);
      let matchedSamples = 0;
      let failureCount = 0;

      for (let i = 5; i < history.length; i++) {
        const previousFive = history.slice(i - 5, i);
        if (this.buildFeature(previousFive, n, level).key !== feature.key) continue;
        matchedSamples++;
        if (history[i].numbers.includes(n)) failureCount++;
      }

      const successCount = matchedSamples - failureCount;
      const accuracy = matchedSamples > 0 ? successCount / matchedSamples : 0;
      candidates.push({
        n,
        matchedSamples,
        failureCount,
        successCount,
        accuracy,
        level,
        featureKey: feature.key,
        recentAppearCount: feature.recentAppearCount,
        currentMissInFive: feature.currentMissInFive,
        tailPressure: feature.tailPressure,
        zonePressure: feature.zonePressure,
        nearPressure: feature.nearPressure,
        appearedInLatest: feature.appearedInLatest,
      });
    }

    return candidates
      .filter((item) => item.matchedSamples >= minSamples)
      .sort(
        (a, b) =>
          b.accuracy - a.accuracy ||
          a.failureCount - b.failureCount ||
          b.matchedSamples - a.matchedSamples ||
          b.currentMissInFive - a.currentMissInFive ||
          a.n - b.n,
      );
  }

  private buildFeature(window: DrawRow[], n: number, level: number) {
    const sets = window.map((draw) => new Set(draw.numbers));
    const flat = window.flatMap((draw) => draw.numbers);
    const numberTail = n % 10;
    const numberZone = Math.floor((n - 1) / 10);
    const recentAppearCount = sets.reduce((sum, set) => sum + (set.has(n) ? 1 : 0), 0);
    let currentMissInFive = 0;

    for (let i = sets.length - 1; i >= 0; i--) {
      if (sets[i].has(n)) break;
      currentMissInFive++;
    }

    const tailPressure = flat.filter((item) => item % 10 === numberTail).length;
    const zonePressure = flat.filter((item) => Math.floor((item - 1) / 10) === numberZone).length;
    const nearPressure = flat.filter((item) => Math.abs(item - n) <= 2).length;
    const appearedInLatest = sets[sets.length - 1].has(n);

    const partsByLevel = [
      [
        recentAppearCount,
        currentMissInFive,
        Math.min(tailPressure, 4),
        Math.min(zonePressure, 8),
        Math.min(nearPressure, 4),
        appearedInLatest ? 1 : 0,
      ],
      [
        recentAppearCount,
        currentMissInFive,
        Math.min(tailPressure, 4),
        Math.min(zonePressure, 8),
        appearedInLatest ? 1 : 0,
      ],
      [recentAppearCount, currentMissInFive, Math.min(tailPressure, 4), appearedInLatest ? 1 : 0],
      [recentAppearCount, currentMissInFive, appearedInLatest ? 1 : 0],
      [recentAppearCount, Math.min(currentMissInFive, 3)],
    ];

    return {
      key: partsByLevel[level].join('|'),
      recentAppearCount,
      currentMissInFive,
      tailPressure,
      zonePressure,
      nearPressure,
      appearedInLatest,
    };
  }

  private buildRecentValidations(history: DrawRow[], level: number, selectedNumber: number, count: number) {
    const start = Math.max(5, history.length - count);
    const rows: any[] = [];

    for (let i = start; i < history.length; i++) {
      const previousFive = history.slice(i - 5, i);
      const actual = history[i];
      const ranked = this.rankForWindow(history.slice(0, i), previousFive, level);
      const top = ranked[0];

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: top?.n,
        selectedNow: top?.n === selectedNumber,
        success: top ? !actual.numbers.includes(top.n) : null,
        confidence: top?.accuracy || 0,
        matchedSamples: top?.matchedSamples || 0,
      });
    }

    return rows.reverse();
  }

  private pickStrictCandidate(trainingHistory: DrawRow[], window: DrawRow[]): CandidateScore | null {
    return this.rankForWindow(trainingHistory, window, 0)
      .filter(
        (item) =>
          item.matchedSamples >= 3 &&
          item.failureCount === 0 &&
          !item.appearedInLatest &&
          item.currentMissInFive >= 4,
      )
      .sort(
        (a, b) =>
          b.zonePressure - a.zonePressure ||
          b.matchedSamples - a.matchedSamples ||
          a.n - b.n,
      )[0] || null;
  }

  private buildStrictBacktest(history: DrawRow[], count: number) {
    const start = Math.max(5, history.length - count);
    const rows: any[] = [];

    for (let i = start; i < history.length; i++) {
      const trainingHistory = history.slice(0, i);
      const previousFive = history.slice(i - 5, i);
      const actual = history[i];
      const prediction = this.pickStrictCandidate(trainingHistory, previousFive);
      const success = prediction ? !actual.numbers.includes(prediction.n) : false;

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction?.n ?? null,
        matchedSamples: prediction?.matchedSamples ?? 0,
        confidence: prediction?.accuracy ?? 0,
        success,
      });
    }

    const successCount = rows.filter((item) => item.success).length;
    const failureCount = rows.length - successCount;

    return {
      count: rows.length,
      successCount,
      failureCount,
      successRate: rows.length > 0 ? successCount / rows.length : 0,
      isPerfect: rows.length > 0 && failureCount === 0,
      rows: rows.reverse(),
    };
  }

  private rankForWindow(trainingHistory: DrawRow[], window: DrawRow[], level: number): CandidateScore[] {
    const candidates: CandidateScore[] = [];

    for (let n = 1; n <= 49; n++) {
      const feature = this.buildFeature(window, n, level);
      let matchedSamples = 0;
      let failureCount = 0;

      for (let i = 5; i < trainingHistory.length; i++) {
        const previousFive = trainingHistory.slice(i - 5, i);
        if (this.buildFeature(previousFive, n, level).key !== feature.key) continue;
        matchedSamples++;
        if (trainingHistory[i].numbers.includes(n)) failureCount++;
      }

      const successCount = matchedSamples - failureCount;
      candidates.push({
        n,
        matchedSamples,
        failureCount,
        successCount,
        accuracy: matchedSamples > 0 ? successCount / matchedSamples : 0,
        level,
        featureKey: feature.key,
        recentAppearCount: feature.recentAppearCount,
        currentMissInFive: feature.currentMissInFive,
        tailPressure: feature.tailPressure,
        zonePressure: feature.zonePressure,
        nearPressure: feature.nearPressure,
        appearedInLatest: feature.appearedInLatest,
      });
    }

    return candidates.sort(
      (a, b) =>
        b.accuracy - a.accuracy ||
        a.failureCount - b.failureCount ||
        b.matchedSamples - a.matchedSamples ||
        b.currentMissInFive - a.currentMissInFive ||
        a.n - b.n,
    );
  }
}
