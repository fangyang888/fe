import { Injectable } from '@nestjs/common';
import { PredictorOptService } from './predictor-opt.service';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
  has(key: K): boolean { return this.map.has(key); }
  clear() { this.map.clear(); }
}

interface CustomCandidate {
  n: number;
  killProbability: number;
  historyKillRate: number;
  recentCount: number;
  heatRank: number;
  consensus: number;
  killScore: number;
  gap: number;
  avgGap: number;
  gapRatio: number;
  cycleSafe: boolean;
}

@Injectable()
export class PredictorKill2Service {
  constructor(
    private readonly predictorOptService: PredictorOptService,
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private memoHotPickKill2Response = new BoundedCache<string, any>(100);

  private getHotPickKill2ResponseCacheKey(sourceType: string, rawHist: any[]) {
    const historyKey = (this.predictorOptService as any).getHistoryCacheKey(rawHist);
    return `predictor-opt:kill2:custom-v9:${sourceType}:${historyKey}`;
  }

  private parseHistorySourceType(type?: string): 'default' | 'hk' {
    return type === 'hk' ? 'hk' : 'default';
  }

  private findHistoryBySource(sourceType: 'default' | 'hk') {
    return sourceType === 'hk'
      ? this.historyHkService.findAll()
      : this.historyService.findAll();
  }

  /**
   * 自定义独立算号逻辑：从全局历史中提取偏态特征，为 1..49 评分
   * 评分代表排除置信度 (0..100)
   */
  private getCustomKillCandidates(hist: number[][]): CustomCandidate[] {
    const totalPeriods = hist.length;
    if (totalPeriods < 35) return [];

    const lastDraw = hist[totalPeriods - 1];
    const lastDrawSet = new Set(lastDraw);

    // 1. 计算每个号码的历史最后开出位置和全局频次
    const lastSeen = new Array(50).fill(-1);
    const gapsList: number[][] = Array.from({ length: 50 }, () => []);
    const overallCounts = new Array(50).fill(0); // 历史全局出现频次
    
    for (let i = 0; i < totalPeriods; i++) {
      const draw = hist[i];
      for (const num of draw) {
        if (num >= 1 && num <= 49) {
          overallCounts[num]++;
          if (lastSeen[num] !== -1) {
            const gap = i - lastSeen[num] - 1;
            gapsList[num].push(gap);
          }
          lastSeen[num] = i;
        }
      }
    }

    const currentGaps = new Array(50).fill(0);

    for (let num = 1; num <= 49; num++) {
      currentGaps[num] = lastSeen[num] === -1 ? totalPeriods : totalPeriods - 1 - lastSeen[num];
    }

    // 2. 近期频次统计
    const freq10 = new Array(50).fill(0);
    const freq30 = new Array(50).fill(0);

    const getFreqs = (lookback: number, targetArray: number[]) => {
      const startIdx = Math.max(0, totalPeriods - lookback);
      for (let i = startIdx; i < totalPeriods; i++) {
        for (const num of hist[i]) {
          if (num >= 1 && num <= 49) {
            targetArray[num]++;
          }
        }
      }
    };

    getFreqs(10, freq10);
    getFreqs(30, freq30);

    // 3. 计算热度排名
    const sortedByFreq30 = Array.from({ length: 49 }, (_, i) => ({
      n: i + 1,
      count: freq30[i + 1],
    })).sort((a, b) => b.count - a.count);

    const heatRanks = new Array(50).fill(49);
    sortedByFreq30.forEach((item, index) => {
      heatRanks[item.n] = index + 1;
    });

    // 4. 整合计算最终排除评分
    const candidates: CustomCandidate[] = [];

    for (let num = 1; num <= 49; num++) {
      const gap = currentGaps[num];
      const gaps = gapsList[num];
      const avgGap =
        gaps.length > 0
          ? gaps.reduce((sum, item) => sum + item, 0) / gaps.length
          : 6;
      const sortedGaps = gaps.slice().sort((a, b) => a - b);
      const p75Gap =
        sortedGaps.length > 0
          ? sortedGaps[Math.floor((sortedGaps.length - 1) * 0.75)]
          : avgGap * 1.5;
      const gapRatio = avgGap > 0 ? gap / avgGap : gap;
      const f10 = freq10[num];
      const f30 = freq30[num];
      const globalDrawRate = overallCounts[num] / totalPeriods;
      const hRank = heatRanks[num];
      
      let isNeighbor = false;
      for (const lastNum of lastDraw) {
        if (Math.abs(lastNum - num) === 1) {
          isNeighbor = true;
          break;
        }
      }

      // 使用号码自身历史周期衡量回补风险。低频或长遗漏不再直接视为适合排除。
      let appearRisk = globalDrawRate + (f10 / 10) * 0.5 + (f30 / 30) * 0.2;
      if (gap === 0) {
        appearRisk += 0.08;
      }
      if (gapRatio >= 0.55) {
        appearRisk += (gapRatio - 0.55) * 0.08;
      }
      if (gap >= 4) {
        appearRisk += 0.01;
      }
      if (isNeighbor) {
        appearRisk += 0.015;
      }

      const cycleSafe = gap <= 6 && gapRatio <= 0.9 && gap <= p75Gap * 0.7;
      const killProbability =
        Math.round(Math.min(99.5, Math.max(10.0, (1 - appearRisk) * 100)) * 10) / 10;
      
      // 计算历史杀码率 (非本号码开出的实际比例)
      const historyKillRate = Math.round((1.0 - globalDrawRate) * 1000) / 10;

      // 共识判定
      let consensus = 1;
      if (cycleSafe) consensus++;
      if (gapRatio < 0.55) consensus++;
      if (f10 <= 1) consensus++;

      candidates.push({
        n: num,
        killProbability,
        historyKillRate,
        recentCount: f30,
        heatRank: hRank,
        consensus,
        killScore: killProbability,
        gap,
        avgGap: Math.round(avgGap * 10) / 10,
        gapRatio: Math.round(gapRatio * 100) / 100,
        cycleSafe,
      });
    }

    return candidates.sort((a, b) => b.killScore - a.killScore);
  }

  private getCycleSafeCandidates(candidates: CustomCandidate[]) {
    return candidates.filter((candidate) => candidate.cycleSafe);
  }

  private selectHotPickKill2Group(qualified: CustomCandidate[], targetCount = 2): CustomCandidate[] {
    if (qualified.length < targetCount) return [];
    
    if (targetCount === 1) {
      return [
        qualified
          .slice()
          .sort((a, b) => b.killProbability - a.killProbability || b.historyKillRate - a.historyKillRate)
          .slice(0, 1)[0]
      ];
    }

    const pool = qualified
      .slice()
      .sort((a, b) => b.killProbability - a.killProbability || b.historyKillRate - a.historyKillRate)
      .slice(0, 10);

    let bestGroup: CustomCandidate[] = [];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        
        // 空间分散互斥性硬性检测
        if (a.n % 10 === b.n % 10) continue; 
        if (Math.floor((a.n - 1) / 10) === Math.floor((b.n - 1) / 10)) continue;

        const score = a.killProbability + b.killProbability + (a.consensus + b.consensus) * 2;
        if (score > bestScore) {
          bestScore = score;
          bestGroup = [a, b];
        }
      }
    }

    if (bestGroup.length === 0 && pool.length >= 2) {
      bestGroup = [pool[0], pool[1]];
    }

    return bestGroup.sort((a, b) => b.killProbability - a.killProbability || a.n - b.n);
  }

  private selectHistoricalHotPickKill2Group(
    hist: number[][],
    candidatesCache: Map<number, CustomCandidate[]>,
    targetCount = 2,
    evalPeriods = 30,
  ): { predictions: any[]; note: string; finalThreshold: number; strictValidation: boolean } {
    const start = Math.max(30, hist.length - evalPeriods);
    // 搜索高安全置信范围下的自适应阈值 (使用降序排列，优先选择置信度更高、更安全的阀值)
    const thresholds = [85.0, 84.0, 83.0, 82.0, 81.0, 80.0];
    
    // 1. 尝试 2 杀推荐
    for (const t of thresholds) {
      let hasError = false;
      
      for (let i = start; i < hist.length; i++) {
        const subHist = hist.slice(0, i);
        let subCandidates = candidatesCache.get(subHist.length);
        if (!subCandidates) {
          subCandidates = this.getCustomKillCandidates(subHist);
          candidatesCache.set(subHist.length, subCandidates);
        }
        
        // 过滤掉高遗漏冷号
        const subQualified = this.getCycleSafeCandidates(subCandidates)
          .filter((c) => c.killProbability >= t);
        const subGroup = this.selectHotPickKill2Group(subQualified, 2);

        if (subGroup.length !== 2) {
          hasError = true;
          break;
        }
        
        const actualSet = new Set(hist[i]);
        const subFailed = subGroup.filter((item) => actualSet.has(item.n));
        
        if (subFailed.length > 0) {
          hasError = true;
          break;
        }
      }
      
      if (!hasError) {
        let currentCandidates = candidatesCache.get(hist.length);
        if (!currentCandidates) {
          currentCandidates = this.getCustomKillCandidates(hist);
          candidatesCache.set(hist.length, currentCandidates);
        }
        
        const currentQualified = this.getCycleSafeCandidates(currentCandidates)
          .filter((c) => c.killProbability >= t);
        const predictions = this.selectHotPickKill2Group(currentQualified, 2);
        if (predictions.length === 2) {
          return {
            predictions,
            finalThreshold: t,
            strictValidation: true,
            note: `已通过最近 ${evalPeriods} 期自主打分算法滚动验证，在排除置信度 >= ${t}% 的双号组合中达成 100% 成功率 (0误杀)。`,
          };
        }
      }
    }

    // 2. 降级尝试 1 杀推荐 (同样使用降序排列，优先推荐高置信度阀值)
    for (const t of [85.0, 84.0, 83.0, 82.0, 81.0, 80.0]) {
      let hasError = false;
      for (let i = start; i < hist.length; i++) {
        const subHist = hist.slice(0, i);
        let subCandidates = candidatesCache.get(subHist.length);
        if (!subCandidates) {
          subCandidates = this.getCustomKillCandidates(subHist);
          candidatesCache.set(subHist.length, subCandidates);
        }
        
        const subQualified = this.getCycleSafeCandidates(subCandidates)
          .filter((c) => c.killProbability >= t);
        const subGroup = this.selectHotPickKill2Group(subQualified, 1);

        if (subGroup.length !== 1) {
          hasError = true;
          break;
        }
        
        const actualSet = new Set(hist[i]);
        const subFailed = subGroup.filter((item) => actualSet.has(item.n));
        if (subFailed.length > 0) {
          hasError = true;
          break;
        }
      }
      
      if (!hasError) {
        let currentCandidates = candidatesCache.get(hist.length);
        if (!currentCandidates) {
          currentCandidates = this.getCustomKillCandidates(hist);
          candidatesCache.set(hist.length, currentCandidates);
        }
        const currentQualified = this.getCycleSafeCandidates(currentCandidates)
          .filter((c) => c.killProbability >= t);
        const predictions = this.selectHotPickKill2Group(currentQualified, 1);
        if (predictions.length === 1) {
          return {
            predictions,
            finalThreshold: t,
            strictValidation: true,
            note: `近 ${evalPeriods} 期双号排除发生波动，系统已安全降级为 1码 排除。所荐号码通过 100% 滚动验证。`,
          };
        }
      }
    }

    let currentCandidates = candidatesCache.get(hist.length);
    if (!currentCandidates) {
      currentCandidates = this.getCustomKillCandidates(hist);
      candidatesCache.set(hist.length, currentCandidates);
    }

    const predictions = this.selectHotPickKill2Group(
      this.getCycleSafeCandidates(currentCandidates),
      targetCount,
    );
    const finalThreshold =
      predictions.length > 0
        ? Math.min(...predictions.map((item) => item.killProbability))
        : 0;

    return {
      predictions,
      finalThreshold,
      strictValidation: false,
      note: predictions.length > 0
        ? `最近 ${evalPeriods} 期未达到 100% 滚动全中条件，以下 ${predictions.length} 个号码为周期风险较低的参考排除号。历史规律不代表确定概率，请结合回测数据谨慎使用。`
        : '当前历史数据不足以筛选参考排除号，建议暂时观望。',
    };
  }

  private buildHotPickKill2(hist: number[][], candidatesCache: Map<number, CustomCandidate[]>, includeBacktest = true): any {
    if (hist.length < 35) {
      return {
        threshold: 90.0,
        selectedCount: 0,
        targetCount: 2,
        predictions: [],
        candidates: [],
        backtest: null,
        strictValidation: false,
        note: '历史期数不足35期，无法保障100%滚动成功率。',
      };
    }

    let candidates = candidatesCache.get(hist.length);
    if (!candidates) {
      candidates = this.getCustomKillCandidates(hist);
      candidatesCache.set(hist.length, candidates);
    }

    const backtestWindow = 30;
    const { predictions, note, finalThreshold, strictValidation } = this.selectHistoricalHotPickKill2Group(
      hist,
      candidatesCache,
      2,
      backtestWindow,
    );

    const backtest = includeBacktest ? this.backtestHotPickKill2(hist, candidatesCache, backtestWindow) : null;

    return {
      threshold: finalThreshold,
      selectedCount: predictions.length,
      targetCount: 2,
      predictions,
      candidates: this.getCycleSafeCandidates(candidates).slice(0, 12),
      backtest,
      strictValidation,
      note,
    };
  }

  private backtestHotPickKill2(hist: number[][], candidatesCache: Map<number, CustomCandidate[]>, displayPeriods = 30): any {
    const start = Math.max(30, hist.length - displayPeriods);
    const details = [];
    let totalCorrect = 0;
    let totalPredicted = 0;
    let allCorrectPeriods = 0;

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const result: any = this.buildHotPickKill2(subHist, candidatesCache, false);
      const displayed: any[] = result.predictions || [];
      const actualSet = new Set(hist[i]);
      const failed = displayed.filter((item: any) => actualSet.has(item.n));
      const correctCount = displayed.length - failed.length;
      
      const avgKillProbability =
        displayed.length > 0
          ? displayed.reduce((sum: number, item: any) => sum + item.killProbability, 0) /
            displayed.length
          : 0;
      const groupAllKillProbability =
        displayed.reduce(
          (product: number, item: any) => product * (item.killProbability / 100),
          1,
        ) * 100;

      totalCorrect += correctCount;
      totalPredicted += displayed.length;
      if (displayed.length > 0 && failed.length === 0) allCorrectPeriods++;

      details.push({
        periodOffset: hist.length - i,
        predicted: displayed.map((item: any) => ({
          n: item.n,
          killProbability: item.killProbability,
        })),
        actual: hist[i],
        failed: failed.map((item: any) => item.n),
        correctCount,
        accuracy: displayed.length > 0 ? (correctCount / displayed.length) * 100 : 0,
        avgKillProbability: Math.round(avgKillProbability * 10) / 10,
        groupAllKillProbability: Math.round(groupAllKillProbability * 10) / 10,
        qualifiedCount: result.selectedCount,
      });
    }

    const calcPeriods: number = details.length;
    return {
      calcPeriods,
      details: details.reverse(),
      totalCorrect,
      totalPredicted,
      overallAccuracy:
        totalPredicted > 0 ? Math.round((totalCorrect / totalPredicted) * 1000) / 10 : 0,
      allCorrectPeriods,
      allCorrectRate:
        calcPeriods > 0 ? Math.round((allCorrectPeriods / calcPeriods) * 1000) / 10 : 0,
    };
  }

  async getHotPickKill2PredictionResponse(type?: string, options: { forceRefresh?: boolean } = {}) {
    const sourceType = this.parseHistorySourceType(type);
    const rawHist = await this.findHistoryBySource(sourceType);
    
    if (options.forceRefresh) {
      this.memoHotPickKill2Response.clear();
    }
    
    const responseCacheKey = this.getHotPickKill2ResponseCacheKey(sourceType, rawHist);
    if (!options.forceRefresh && this.memoHotPickKill2Response.has(responseCacheKey)) {
      const cachedMemo = this.memoHotPickKill2Response.get(responseCacheKey);
      return {
        ...cachedMemo,
        cacheMeta: {
          ...(cachedMemo.cacheMeta || {}),
          hit: true,
          store: 'memory',
          key: responseCacheKey,
        },
      };
    }

    const cached = options.forceRefresh ? null : await (this.predictorOptService as any).getJsonCache(responseCacheKey);
    if (cached) {
      this.memoHotPickKill2Response.set(responseCacheKey, cached);
      return {
        ...cached,
        cacheMeta: {
          ...(cached.cacheMeta || {}),
          hit: true,
          store: 'redis',
          key: responseCacheKey,
        },
      };
    }

    const hist = rawHist.map((item: any) => [
      item.n1,
      item.n2,
      item.n3,
      item.n4,
      item.n5,
      item.n6,
      item.n7,
    ]);

    const candidatesCache = new Map<number, CustomCandidate[]>();
    const result = this.buildHotPickKill2(hist, candidatesCache);

    const response = {
      ...result,
      historyMeta: (this.predictorOptService as any).getHistoryMeta(rawHist, sourceType),
    };
    
    const cacheMeta = {
      hit: false,
      store: 'redis',
      key: responseCacheKey,
      ttlSeconds: (this.predictorOptService as any).predictorRedisTtlSeconds || 3600,
      generatedAt: new Date().toISOString(),
    };
    const redisResponse = {
      ...response,
      cacheMeta,
    };
    const cachedInRedis = await (this.predictorOptService as any).setJsonCache(
      responseCacheKey,
      redisResponse,
      (this.predictorOptService as any).predictorRedisTtlSeconds || 3600,
    );

    const finalResponse = {
      ...response,
      cacheMeta: {
        ...cacheMeta,
        store: cachedInRedis ? 'redis' : 'memory',
      },
    };
    this.memoHotPickKill2Response.set(responseCacheKey, finalResponse);
    return finalResponse;
  }

  async clearHotPickKill2Cache(type?: string) {
    const sourceType = this.parseHistorySourceType(type);
    const rawHist = await this.findHistoryBySource(sourceType);
    const responseCacheKey = this.getHotPickKill2ResponseCacheKey(sourceType, rawHist);
    this.memoHotPickKill2Response.clear();
    const deleted = await (this.predictorOptService as any).deleteJsonCache(responseCacheKey);

    return {
      ok: true,
      cacheMeta: {
        action: 'cleared',
        hit: false,
        deleted,
        store: deleted ? 'redis' : 'memory',
        key: responseCacheKey,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async refreshHotPickKill2Cache(type?: string) {
    const cleared = await this.clearHotPickKill2Cache(type);
    const response = await this.getHotPickKill2PredictionResponse(type, { forceRefresh: true });
    return {
      ...response,
      cacheMeta: {
        ...response.cacheMeta,
        action: 'refreshed',
        deletedBeforeRefresh: cleared.cacheMeta.deleted,
      },
    };
  }
}
