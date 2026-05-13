import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { HistoryHkService } from '../history-hk/history-hk.service';

type HistorySourceType = 'default' | 'hk';

interface PredictionResult {
  n: number;
  w: number;
}

interface PredictorOpts {
  decay: number;
  protectWindow: number;
  missRiskMult: number;
  tailBalance: boolean;
  altBonus: number;
  repulsionWeight?: number;
  aprioriWeight?: number;
  repulsionThreshold?: number;
}

interface AppearScore {
  n: number;
  appearProb: number;
  killConfidence: number;
  features: Record<string, number>;
}

export interface KillBacktestSummary {
  name: string;
  details: any[];
  overallAccuracy: number;
  allCorrectPeriods: number;
  allCorrectRate: number;
  ninePlusPeriods: number;
  ninePlusRate: number;
  totalCorrect: number;
  totalPredicted: number;
  calcPeriods: number;
  killCount: number;
  randomBaseline: {
    singleKillAccuracy: number;
    allCorrectRate: number;
    lift: number;
  };
}

interface AppearWeights {
  name: string;
  freq10: number;
  freq20: number;
  freq50: number;
  freq100: number;
  longFreq: number;
  markov: number;
  markov2: number;
  knn: number;
  bayesAppear: number;
  gapRisk: number;
}

interface SpecialWeights {
  name: string;
  freq5: number;
  freq10: number;
  freq20: number;
  freq50: number;
  longFreq: number;
  gapDue: number;
  specialMarkov: number;
  rowToSpecial: number;
  tailTrend: number;
}

interface SpecialScore {
  n: number;
  score: number;
  probability: number;
  features: Record<string, number>;
}

interface KillModelCandidate {
  n: number;
  killScore: number;
  appearProb?: number;
  features?: Record<string, number>;
}

interface KillModelOutput {
  name: string;
  displayName: string;
  candidates: KillModelCandidate[];
}

interface KillModelPerformance {
  name: string;
  displayName: string;
  weight: number;
  avgAccuracy: number;
  allCorrectRate: number;
  ninePlusRate: number;
  maxMisses: number;
  samples: number;
}

interface KillEngineResult {
  predictions: any[];
  stats: KillBacktestSummary | null;
  debug: any;
}

class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.map.get(key);
  }
  set(key: K, value: V) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value;
      firstKey && this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
  has(key: K): boolean {
    return this.map.has(key);
  }
  clear() {
    this.map.clear();
  }
}

@Injectable()
export class PredictorService {
  constructor(
    private readonly historyService: HistoryService,
    private readonly historyHkService: HistoryHkService,
  ) {}

  private readonly highConfidenceKillCount = 10;
  private readonly randomKillProb = 42 / 49;
  private readonly randomAppearProb = 7 / 49;

  // 性能优化：缓存高频计算结果，防止内存泄漏，设置最大容量 500
  private memoKill10 = new BoundedCache<string, any>(500);
  private memoKillRepulsion = new BoundedCache<string, any>(500);
  private memoAdaptiveOpts = new BoundedCache<number, any>(500);
  private memoStrategy = new BoundedCache<number, any>(500);
  private memoApriori = new BoundedCache<number, any>(500);
  private memoCrossRepulsion = new BoundedCache<string, any>(500);
  private memoKnn = new BoundedCache<number, any>(500);
  private memoNB = new BoundedCache<number, any>(500);
  private memoMarkov2 = new BoundedCache<number, any>(500);
  private memoExpertWeights = new BoundedCache<number, any>(500);
  private memoAppearScores = new BoundedCache<number, AppearScore[]>(500);
  private memoAppearWeights = new BoundedCache<number, any>(500);
  private memoKillEngine = new BoundedCache<string, KillEngineResult>(120);
  private memoHybridKill10 = new BoundedCache<string, any>(100);
  private memoCoreKillOne = new BoundedCache<string, any>(100);
  private memoHotPick = new BoundedCache<string, any>(100);
  private memoHistoricalLearning = new BoundedCache<number, any>(500);
  private memoKillPredictionResponse = new BoundedCache<string, any>(20);
  private lastHistLength = 0;
  private lastHistorySource: HistorySourceType = 'default';

  private parseHistorySourceType(type?: string): HistorySourceType {
    if (!type || type === 'default') return 'default';
    if (type === 'hk') return 'hk';
    throw new Error(`数据类型不合法：${type}`);
  }

  private async findHistoryBySource(type: HistorySourceType) {
    return type === 'hk'
      ? this.historyHkService.findAll()
      : this.historyService.findAll();
  }

  private checkAndClearCache(currentHistLength: number, source: HistorySourceType = 'default') {
    // 如果切换数据源或数据长度减小了（可能是数据库重置），清空缓存
    if (source !== this.lastHistorySource || currentHistLength < this.lastHistLength) {
      this.memoKill10.clear();
      this.memoKillRepulsion.clear();
      this.memoAdaptiveOpts.clear();
      this.memoStrategy.clear();
      this.memoApriori.clear();
      this.memoCrossRepulsion.clear();
      this.memoKnn.clear();
      this.memoNB.clear();
      this.memoMarkov2.clear();
      this.memoExpertWeights.clear();
      this.memoAppearScores.clear();
      this.memoAppearWeights.clear();
      this.memoKillEngine.clear();
      this.memoHybridKill10.clear();
      this.memoCoreKillOne.clear();
      this.memoHotPick.clear();
      this.memoHistoricalLearning.clear();
      this.memoKillPredictionResponse.clear();
    }
    this.lastHistLength = currentHistLength;
    this.lastHistorySource = source;
  }

  private getHistoryCacheKey(rawHist: any[]) {
    const last = rawHist[rawHist.length - 1];
    if (!last) return 'empty';
    const period = last.period ?? last.No ?? last.id ?? rawHist.length;
    const nums = [last.n1, last.n2, last.n3, last.n4, last.n5, last.n6, last.n7].join(',');
    return `${rawHist.length}:${period}:${nums}`;
  }

  private getHistArrayCacheKey(hist: number[][]) {
    return `${hist.length}:${hist[hist.length - 1]?.join(',') || ''}`;
  }

  private getHistoryMeta(rawHist: any[], source: HistorySourceType = 'default') {
    const last = rawHist[rawHist.length - 1];
    return {
      source: source === 'hk' ? 'database:history_hk' : 'database:history',
      count: rawHist.length,
      latest: last
        ? {
            id: last.id,
            year: last.year ?? null,
            No: last.No ?? null,
            numbers: [last.n1, last.n2, last.n3, last.n4, last.n5, last.n6, last.n7],
          }
        : null,
    };
  }

  async getKillPredictions() {
    const rawHist = await this.historyService.findAll();
    this.checkAndClearCache(rawHist.length, 'default'); // 检查是否需要清理缓存
    const responseCacheKey = this.getHistoryCacheKey(rawHist);
    if (this.memoKillPredictionResponse.has(responseCacheKey)) {
      return this.memoKillPredictionResponse.get(responseCacheKey);
    }

    const hist = rawHist.map((item) => [
      item.n1,
      item.n2,
      item.n3,
      item.n4,
      item.n5,
      item.n6,
      item.n7,
    ]);

    const { repulsionInfo } = this.strategyServerSide(hist);
    const killCount = this.highConfidenceKillCount;
    const engineResult = this.runKillEngine(hist, killCount);
    const modelPredictions =
      engineResult.predictions.length > 0
        ? engineResult.predictions
        : this.getProbabilityKillPredictions(hist, killCount);
    const hybridResult = this.buildAdaptiveHybridKill10(hist, modelPredictions);
    const coreKill = this.buildAdaptiveCoreKillOne(hist);
    const finalPredictions = hybridResult.predictions;
    const backtestStats = null;

    const response = {
      predictions: finalPredictions,
      coreKill,
      historyMeta: this.getHistoryMeta(rawHist, 'default'),
      specialCode: this.getSpecialCodePrediction(hist, 25, 15),
      repulsionInfo: {
        ...repulsionInfo,
        selectedModel:
          engineResult.debug?.selectedMode || engineResult.debug?.mode || 'ensemble',
        legacySelectedModel: engineResult.debug?.selectedMode || 'probability',
        engine: engineResult.debug,
        hybrid: hybridResult.debug,
        modelComparison:
          engineResult.debug?.variantComparison ||
          [engineResult.stats]
            .filter((stats): stats is KillBacktestSummary => Boolean(stats))
            .map((stats) => ({
              name: stats.name,
              overallAccuracy: Math.round(stats.overallAccuracy * 10) / 10,
              allCorrectRate: Math.round(stats.allCorrectRate * 10) / 10,
              ninePlusRate: Math.round(stats.ninePlusRate * 10) / 10,
              calcPeriods: stats.calcPeriods,
              killCount,
            })),
      },
      backtestStats,
      engineBacktestStats: hybridResult.stats || engineResult.stats,
      probabilityBacktestStats:
        hybridResult.stats ||
        engineResult.stats,
    };
    this.memoKillPredictionResponse.set(responseCacheKey, response);
    return response;
  }

  async getHotPickPredictionResponse(type?: string) {
    const sourceType = this.parseHistorySourceType(type);
    const rawHist = await this.findHistoryBySource(sourceType);
    this.checkAndClearCache(rawHist.length, sourceType);
    const hist = rawHist.map((item) => [
      item.n1,
      item.n2,
      item.n3,
      item.n4,
      item.n5,
      item.n6,
      item.n7,
    ]);
    const recentOccurrenceStats = this.getRecentOccurrenceStats(rawHist, 30);

    return {
      hotPick: this.buildAdaptiveHotPick(hist),
      historyMeta: this.getHistoryMeta(rawHist, sourceType),
      recentOccurrenceStats,
      hotPickKill5: this.buildHotPickKill5(hist, recentOccurrenceStats),
    };
  }

  private getRecentOccurrenceStats(rawHist: any[], windowSize = 30) {
    const recentRows = rawHist.slice(-windowSize);
    const counts = new Array(50).fill(0);

    for (const row of recentRows) {
      const nums = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7];
      for (const n of new Set(nums)) {
        if (n >= 1 && n <= 49) counts[n]++;
      }
    }

    const ranked = Array.from({ length: 49 }, (_, i) => i + 1)
      .sort((a, b) => counts[b] - counts[a] || a - b)
      .reduce<Record<number, number>>((acc, n, index) => {
        acc[n] = index + 1;
        return acc;
      }, {});

    return {
      windowSize,
      actualPeriods: recentRows.length,
      latest: recentRows[recentRows.length - 1] || null,
      earliest: recentRows[0] || null,
      numbers: Array.from({ length: 49 }, (_, i) => {
        const n = i + 1;
        return {
          n,
          count: counts[n],
          rate:
            recentRows.length > 0
              ? Math.round((counts[n] / recentRows.length) * 1000) / 10
              : 0,
          rank: ranked[n],
        };
      }),
    };
  }

  private getRecentOccurrenceStatsFromHist(hist: number[][], windowSize = 30) {
    return this.getRecentOccurrenceStats(
      hist.map((row) => ({
        n1: row[0],
        n2: row[1],
        n3: row[2],
        n4: row[3],
        n5: row[4],
        n6: row[5],
        n7: row[6],
      })),
      windowSize,
    );
  }

  private getRecentModelKillRates(hist: number[][], evalPeriods = 30) {
    const start = Math.max(60, hist.length - evalPeriods);
    const stats = new Map<
      number,
      {
        samples: number;
        successes: number;
      }
    >();

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const actualSet = new Set(hist[i]);
      const modelNums = new Set<number>();

      for (const prediction of this.getProbabilityKillPredictions(subHist, 10)) {
        modelNums.add(prediction.n);
      }
      for (const prediction of this.getLowRiskKillPredictions(subHist, 10)) {
        modelNums.add(prediction.n);
      }

      for (const n of modelNums) {
        const stat = stats.get(n) || { samples: 0, successes: 0 };
        stat.samples++;
        if (!actualSet.has(n)) stat.successes++;
        stats.set(n, stat);
      }
    }

    return stats;
  }

  private getHotPickKill5Candidates(hist: number[][], occurrenceStats: any): any {
    const threshold = 94;
    const probabilityPreds = this.getProbabilityKillPredictions(hist, 49);
    const lowRiskPreds = this.getLowRiskKillPredictions(hist, 49);
    const enginePreds = this.runKillEngine(hist, 10).predictions || [];
    const hybridPreds = this.buildAdaptiveHybridKill10(hist, enginePreds).predictions || [];
    const rollingRates = this.getRecentModelKillRates(hist, 30);
    const occurrenceByNum = new Map(
      (occurrenceStats?.numbers || []).map((item: any) => [item.n, item]),
    );
    const probabilityByNum = new Map(probabilityPreds.map((item, i) => [item.n, { ...item, rank: i + 1 }]));
    const lowRiskByNum = new Map(lowRiskPreds.map((item, i) => [item.n, { ...item, rank: i + 1 }]));
    const engineByNum = new Map(enginePreds.map((item: any, i: number) => [item.n, { ...item, rank: i + 1 }]));
    const hybridByNum = new Map(hybridPreds.map((item: any, i: number) => [item.n, { ...item, rank: i + 1 }]));

    const candidates = Array.from({ length: 49 }, (_, i) => {
      const n = i + 1;
      const occurrence = occurrenceByNum.get(n) as any;
      const probability = probabilityByNum.get(n) as any;
      const lowRisk = lowRiskByNum.get(n) as any;
      const engine = engineByNum.get(n) as any;
      const hybrid = hybridByNum.get(n) as any;
      const rolling = rollingRates.get(n);
      const recentRate = occurrence?.rate || 0;
      const recentCount = occurrence?.count || 0;
      const heatRank = occurrence?.rank || 49;
      const probabilityAppear = probability?.appearProb ?? this.randomAppearProb;
      const lowRiskAppear = lowRisk?.appearProb ?? this.randomAppearProb;
      const hybridAppear = hybrid?.appearProb ?? engine?.appearProb ?? Math.min(probabilityAppear, lowRiskAppear);
      const modelKillProbability =
        (1 - (probabilityAppear * 0.25 + lowRiskAppear * 0.45 + hybridAppear * 0.3)) * 100;
      const recentColdProbability = Math.max(0, 100 - recentRate);
      const rankColdProbability = ((heatRank - 1) / 48) * 100;
      const rollingKillRate =
        rolling && rolling.samples >= 3
          ? (rolling.successes / rolling.samples) * 100
          : recentColdProbability;
      const consensus =
        (probability?.rank && probability.rank <= 10 ? 1 : 0) +
        (lowRisk?.rank && lowRisk.rank <= 10 ? 1 : 0) +
        (engine?.rank && engine.rank <= 10 ? 1 : 0) +
        (hybrid?.rank && hybrid.rank <= 10 ? 1 : 0);
      const consensusBonus = consensus * 0.7;
      const killProbability = Math.min(
        98.5,
        modelKillProbability * 0.44 +
          recentColdProbability * 0.22 +
          rankColdProbability * 0.1 +
          rollingKillRate * 0.24 +
          consensusBonus,
      );

      const reasons = [
        `近30期${recentCount}期`,
        `热度排名#${heatRank}`,
        `模型杀码${modelKillProbability.toFixed(1)}%`,
      ];
      if (rolling?.samples) {
        reasons.push(`滚动${rolling.successes}/${rolling.samples}`);
      }
      if (consensus > 0) {
        reasons.push(`模型共识${consensus}`);
      }

      return {
        n,
        killProbability: Math.round(killProbability * 10) / 10,
        modelKillProbability: Math.round(modelKillProbability * 10) / 10,
        recentColdProbability: Math.round(recentColdProbability * 10) / 10,
        rollingKillRate: Math.round(rollingKillRate * 10) / 10,
        recentCount,
        recentRate,
        heatRank,
        consensus,
        sources: {
          probabilityRank: probability?.rank || null,
          lowRiskRank: lowRisk?.rank || null,
          engineRank: engine?.rank || null,
          hybridRank: hybrid?.rank || null,
        },
        reasons,
      };
    }).sort(
      (a, b) =>
        b.killProbability - a.killProbability ||
        b.consensus - a.consensus ||
        a.recentCount - b.recentCount ||
        b.heatRank - a.heatRank,
    );

    const qualified = candidates.filter((candidate) => candidate.killProbability >= threshold);
    return {
      candidates,
      qualified,
    };
  }

  private getHotPickKill5Displayed(result: any): any[] {
    return result.predictions?.length > 0
      ? result.predictions
      : result.candidates?.slice(0, 5) || [];
  }

  private backtestHotPickKill5(hist: number[][], displayPeriods = 10): any {
    const start = Math.max(60, hist.length - displayPeriods);
    const details = [];
    let totalCorrect = 0;
    let totalPredicted = 0;
    let allCorrectPeriods = 0;

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const occurrenceStats = this.getRecentOccurrenceStatsFromHist(subHist, 30);
      const result: any = this.buildHotPickKill5(subHist, occurrenceStats, false);
      const displayed: any[] = this.getHotPickKill5Displayed(result).slice(0, 5);
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

  private buildHotPickKill5(
    hist: number[][],
    occurrenceStats: any,
    includeBacktest = true,
  ): any {
    if (hist.length < 30) {
      return {
        threshold: 94,
        selectedCount: 0,
        targetCount: 5,
        predictions: [],
        candidates: [],
        backtest: null,
        note: '历史不足30期，暂不生成94%高置信5杀。',
      };
    }

    const threshold = 94;
    const { candidates, qualified } = this.getHotPickKill5Candidates(
      hist,
      occurrenceStats,
    );
    const predictions = qualified.slice(0, 5);

    return {
      threshold,
      selectedCount: predictions.length,
      targetCount: 5,
      predictions,
      candidates: candidates.slice(0, 12),
      backtest: includeBacktest ? this.backtestHotPickKill5(hist, 10) : null,
      note:
        predictions.length >= 5
          ? '已筛出5个94%+高置信杀码。'
          : `当前只有${predictions.length}个号码达到94%阈值，未硬凑。`,
    };
  }

  // --- SERVER-SIDE PREDICTION ENGINE ---

  private getBaseParamGrid(): PredictorOpts[] {
    const grid: PredictorOpts[] = [];
    for (const decay of [0.85, 0.9, 0.95]) {
      for (const protectWindow of [1, 2]) {
        for (const missRiskMult of [3.0, 3.5]) {
          for (const tailBalance of [true, false]) {
            for (const altBonus of [12, 18]) {
              grid.push({
                decay,
                protectWindow,
                missRiskMult,
                tailBalance,
                altBonus,
              });
            }
          }
        }
      }
    }
    return grid;
  }

  private getRepulsionParamGrid() {
    const grid = [];
    for (const repulsionWeight of [0.3, 0.5, 0.7]) {
      for (const aprioriWeight of [0.3, 0.5, 0.7]) {
        for (const repulsionThreshold of [0.08, 0.1]) {
          grid.push({ repulsionWeight, aprioriWeight, repulsionThreshold });
        }
      }
    }
    return grid;
  }

  private buildScoreEngineWithOpts(hist: number[][], opts: PredictorOpts) {
    const { decay, protectWindow, missRiskMult } = opts;
    const hn = hist.length;

    // O(N) 一次性计算所有号码的出现位置
    const allApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) {
      const row = hist[i];
      for (let j = 0; j < row.length; j++) {
        allApps[row[j]].push(i);
      }
    }

    // O(N) 逆向递推计算权重频率，消除重复 Math.pow 计算
    const wFreq = new Array(50).fill(0);
    let w = 1;
    for (let i = hn - 1; i >= 0; i--) {
      const row = hist[i];
      for (let j = 0; j < row.length; j++) {
        wFreq[row[j]] += w;
      }
      w *= decay;
    }

    const protect = new Set<number>();
    const protectReason: any = {};
    const extremeMissSet = new Set<number>();

    hist.slice(-protectWindow).forEach((r) =>
      r.forEach((n) => {
        protect.add(n);
        protectReason[n] = protectReason[n] || '近' + protectWindow + '期热号';
      }),
    );

    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps = allApps[n];
      if (apps.length < 3) continue;

      const lastIdx = apps[apps.length - 1];
      const gaps = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap =
        gaps.length > 0
          ? gaps.reduce((a, b) => a + b, 0) / gaps.length
          : hn / 7;
      const lastMiss = hn - 1 - lastIdx;

      if (avgGap > 0 && lastMiss / avgGap >= 5) {
        extremeMissSet.add(n);
        protectReason[n] = '极端遗漏';
        continue;
      }
      if (lastMiss >= avgGap * missRiskMult) {
        protect.add(n);
        protectReason[n] = '遗漏回归风险';
        continue;
      }
      if (apps.length >= 4) {
        const stdDev = Math.sqrt(
          gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length,
        );
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv > 0.85 && lastMiss < avgGap * 1.5) {
          protect.add(n);
          protectReason[n] = '高变异不稳定';
          continue;
        }
      }
    }

    if (protect.size > 35) {
      const relaxedMult = missRiskMult * 1.5;
      for (let n = 1; n <= 49; n++) {
        if (!protect.has(n) || extremeMissSet.has(n)) continue;
        if (protectReason[n] && protectReason[n].startsWith('遗漏回归风险')) {
          const apps = allApps[n];
          if (apps.length < 3) continue;
          const gaps = [];
          for (let i = 1; i < apps.length; i++)
            gaps.push(apps[i] - apps[i - 1]);
          const avgGap =
            gaps.length > 0
              ? gaps.reduce((a, b) => a + b, 0) / gaps.length
              : hn / 7;
          const lastMiss = hn - 1 - apps[apps.length - 1];
          if (lastMiss < avgGap * relaxedMult) {
            protect.delete(n);
            protectReason[n] = '遗漏风险已放宽';
          }
        }
      }
    }

    const candidates = [];
    for (let n = 1; n <= 49; n++) {
      if (!protect.has(n) && !extremeMissSet.has(n))
        candidates.push({ n, w: wFreq[n], reason: protectReason[n] || '' });
    }
    candidates.sort((a, b) => a.w - b.w);
    return { candidates };
  }

  private kill10WithOptsMemo(
    hist: number[][],
    opts: PredictorOpts,
  ): PredictionResult[] {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKill10.has(key)) return this.memoKill10.get(key);
    const res = this.kill10WithOpts(hist, opts);
    this.memoKill10.set(key, res);
    return res;
  }

  private scoreKillSelection(killNums: number[], nextSet: Set<number>) {
    const failed = killNums.filter((n) => nextSet.has(n)).length;
    const correct = killNums.length - failed;
    const avgAcc = correct / killNums.length;

    // 平均杀号准确率仍是地基；0误杀给奖励，但不让小样本全中冲掉稳定性。
    return avgAcc + (failed === 0 ? 0.05 : 0) - failed * 0.03;
  }

  private getBaseAdjustedCandidates(hist: number[][], opts: PredictorOpts) {
    const { altBonus } = opts;
    const N = hist.length;
    const { candidates } = this.buildScoreEngineWithOpts(hist, opts);

    // 近期热号过滤反弹
    const last5 = hist.slice(-5);
    const hotInLast5 = new Set<number>();
    const freqLast5: Record<number, number> = {};
    last5.forEach((r) =>
      r.forEach((n) => {
        freqLast5[n] = (freqLast5[n] || 0) + 1;
        if (freqLast5[n] >= 2) hotInLast5.add(n);
      }),
    );
    const filteredCandidates = candidates.filter((c) => !hotInLast5.has(c.n));
    const source =
      filteredCandidates.length >= 10 ? filteredCandidates : candidates;

    const scored = source.map((c) => {
      const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
      const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
      const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
      let bonus = 0;
      if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -altBonus;
      if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +altBonus;
      return { ...c, adjustedW: c.w + bonus };
    });

    scored.sort((a, b) => a.adjustedW - b.adjustedW);
    return scored;
  }

  private selectKillCandidates(
    scored: any[],
    count: number,
    tailBalance: boolean,
  ) {
    if (!tailBalance)
      return scored.slice(0, count).map((c) => ({ n: c.n, w: c.w }));

    const tailCounts = Array(10).fill(0);
    const selected = [];
    for (const c of scored) {
      if (selected.length >= count) break;
      const tail = c.n % 10;
      if (tailCounts[tail] < 2) {
        selected.push(c);
        tailCounts[tail]++;
      }
    }
    for (const c of scored) {
      if (selected.length >= count) break;
      if (!selected.find((s: any) => s.n === c.n)) selected.push(c);
    }
    return selected.slice(0, count).map((c: any) => ({ n: c.n, w: c.w }));
  }

  private kill10WithOpts(hist: number[][], opts: PredictorOpts) {
    return this.selectKillCandidates(
      this.getBaseAdjustedCandidates(hist, opts),
      10,
      opts.tailBalance,
    );
  }

  private getAdaptiveKill10Opts(hist: number[][]) {
    if (this.memoAdaptiveOpts.has(hist.length))
      return this.memoAdaptiveOpts.get(hist.length);
    const res = this.getAdaptiveKill10OptsInternal(hist);
    this.memoAdaptiveOpts.set(hist.length, res);
    return res;
  }

  private getAdaptiveKill10OptsInternal(hist: number[][]) {
    // Phase 1: Find top-5 base param sets from 48 combinations
    const baseGrid = this.getBaseParamGrid();
    const evalWindow = Math.min(50, hist.length - 10);
    const baseResults: { opts: PredictorOpts; score: number }[] = [];

    for (const opts of baseGrid) {
      let correct = 0,
        total = 0;
      let objective = 0,
        evalCount = 0;
      const start = hist.length - evalWindow;
      for (let i = start; i < hist.length - 1; i++) {
        const sub = hist.slice(0, i + 1);
        const kill = this.kill10WithOptsMemo(sub, opts).map((c: any) => c.n);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n: number) => !nextSet.has(n)).length;
        objective += this.scoreKillSelection(kill, nextSet);
        evalCount++;
        total += 10;
      }
      baseResults.push({
        opts,
        score:
          evalCount > 0
            ? objective / evalCount
            : total > 0
              ? correct / total
              : 0,
      });
    }
    baseResults.sort((a, b) => b.score - a.score);
    const top5Base = baseResults.slice(0, 5);

    // Phase 2: Fine-tune repulsion params on top-5 base sets
    const repulsionGrid = this.getRepulsionParamGrid();
    let bestOpts: PredictorOpts = {
      ...top5Base[0].opts,
      repulsionWeight: 0.5,
      aprioriWeight: 0.5,
      repulsionThreshold: 0.1,
    };
    let bestScore = top5Base[0].score;

    for (const base of top5Base) {
      for (const rep of repulsionGrid) {
        const combined = { ...base.opts, ...rep };
        let correct = 0,
          total = 0;
        let objective = 0,
          evalCount = 0;
        const start = hist.length - evalWindow;
        for (let i = start; i < hist.length - 1; i++) {
          const sub = hist.slice(0, i + 1);
          const kill = this.kill10WithRepulsionMemo(sub, combined).map(
            (c: any) => c.n,
          );
          const nextSet = new Set(hist[i + 1]);
          correct += kill.filter((n: number) => !nextSet.has(n)).length;
          objective += this.scoreKillSelection(kill, nextSet);
          evalCount++;
          total += 10;
        }
        const score =
          evalCount > 0
            ? objective / evalCount
            : total > 0
              ? correct / total
              : 0;
        if (score > bestScore) {
          bestScore = score;
          bestOpts = combined;
        }
      }
    }
    return bestOpts;
  }

  /**
   * kill10 enhanced with repulsion scoring from co-occurrence matrix & Apriori rules.
   */
  private kill10WithRepulsionMemo(
    hist: number[][],
    opts: PredictorOpts,
  ): PredictionResult[] {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKillRepulsion.has(key)) return this.memoKillRepulsion.get(key);
    const res = this.kill10WithRepulsion(hist, opts);
    this.memoKillRepulsion.set(key, res);
    return res;
  }

  private getRepulsionAdjustedCandidates(
    hist: number[][],
    opts: PredictorOpts,
  ) {
    const baseCandidates = this.getBaseAdjustedCandidates(hist, opts);
    const {
      repulsionWeight = 0.5,
      aprioriWeight = 0.5,
      repulsionThreshold = 0.1,
    } = opts;

    const repulsionScores = this.getCrossPerioRepulsionScores(
      hist,
      repulsionThreshold,
    );
    const aprioriScores = this.getAprioriRepulsionRules(hist);

    // 对全量候选重排，而不是只在基础前10名里调顺序。
    const reScored = baseCandidates.map((c) => {
      const rBonus = (repulsionScores[c.n] || 0) * repulsionWeight;
      const aBonus = (aprioriScores.scores[c.n] || 0) * aprioriWeight;
      return { ...c, w: c.adjustedW - rBonus - aBonus };
    });

    reScored.sort((a, b) => a.w - b.w);
    return reScored;
  }

  private kill10WithRepulsion(hist: number[][], opts: PredictorOpts) {
    const reScored = this.getRepulsionAdjustedCandidates(hist, opts);
    return this.selectKillCandidates(reScored, 10, opts.tailBalance);
  }

  private pickLowCVFromLastRow(hist: number[][], count = 2) {
    if (hist.length < 2) return [];

    const hn = hist.length;
    // O(N) 一次性计算所有号码出现位置
    const allApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) {
      const row = hist[i];
      for (let j = 0; j < row.length; j++) {
        allApps[row[j]].push(i);
      }
    }

    const lastRow = hist[hn - 1];
    const scored = lastRow.map((n) => {
      const apps = allApps[n];
      if (apps.length < 2) return { n, cv: 1 };
      const gaps = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const stdDev = Math.sqrt(
        gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length,
      );
      const cv = avgGap > 0 ? stdDev / avgGap : 1;
      return { n, cv };
    });
    scored.sort((a, b) => a.cv - b.cv);
    return scored.slice(0, count);
  }

  private getMarkovPredictions(hist: number[][]) {
    if (hist.length < 2) return Array(50).fill(0);
    const matrix = Array(50)
      .fill(0)
      .map(() => Array(50).fill(0));
    const counts = Array(50).fill(0);

    for (let i = 0; i < hist.length - 1; i++) {
      const current = hist[i];
      const next = hist[i + 1];
      for (const n1 of current) {
        counts[n1]++;
        for (const n2 of next) {
          matrix[n1][n2]++;
        }
      }
    }

    for (let i = 1; i <= 49; i++) {
      if (counts[i] > 0) {
        for (let j = 1; j <= 49; j++) {
          matrix[i][j] = matrix[i][j] / counts[i];
        }
      }
    }

    const lastRow = hist[hist.length - 1];
    const nextProbs = Array(50).fill(0);
    for (let j = 1; j <= 49; j++) {
      let probSum = 0;
      for (const n1 of lastRow) {
        probSum += matrix[n1][j];
      }
      nextProbs[j] = probSum / lastRow.length;
    }
    return nextProbs;
  }

  // --- KNN HISTORY PATTERN MATCHING ---
  private getKnnPredictionsMemo(hist: number[][], k = 30): number[] {
    const key = hist.length;
    if (this.memoKnn.has(key)) return this.memoKnn.get(key);
    const res = this.getKnnPredictions(hist, k);
    this.memoKnn.set(key, res);
    return res;
  }

  private getKnnPredictions(hist: number[][], k = 30): number[] {
    if (hist.length < 10) return new Array(50).fill(0);

    // Pattern is the last 3 periods
    const pattern = [
      new Set(hist[hist.length - 3]),
      new Set(hist[hist.length - 2]),
      new Set(hist[hist.length - 1]),
    ];

    const similarities = [];
    // We can only check up to hist.length - 4 (because we need a "next" period to check)
    for (let i = 2; i < hist.length - 1; i++) {
      // Avoid matching with the exact recent pattern itself
      if (i >= hist.length - 3) continue;

      let sim = 0;
      for (let j = 0; j < 3; j++) {
        const histSet = hist[i - 2 + j];
        const patSet = pattern[j];
        let intersection = 0;
        for (const num of histSet) {
          if (patSet.has(num)) intersection++;
        }
        // Time-decayed similarity: more recent periods have higher weight
        // j=0 (3 ago): weight 0.2, j=1 (2 ago): weight 0.3, j=2 (1 ago): weight 0.5
        const weights = [0.2, 0.3, 0.5];
        sim += intersection * weights[j];
      }
      similarities.push({ index: i, sim });
    }

    similarities.sort((a, b) => b.sim - a.sim);
    const topK = similarities.slice(0, k);

    // Calculate frequency of next numbers in the top K most similar historical patterns
    const nextFrequencies = new Array(50).fill(0);
    for (const neighbor of topK) {
      const nextRow = hist[neighbor.index + 1];
      for (const num of nextRow) {
        nextFrequencies[num]++;
      }
    }

    // Normalize to 0-1 probability
    const knnProbs = new Array(50).fill(0);
    for (let i = 1; i <= 49; i++) {
      knnProbs[i] = nextFrequencies[i] / k;
    }

    return knnProbs;
  }

  // --- PURE TYPESCRIPT MACHINE LEARNING (NAIVE BAYES) ---
  private getNaiveBayesKillProbMemo(hist: number[][]): number[] {
    const key = hist.length;
    if (this.memoNB.has(key)) return this.memoNB.get(key);
    const res = this.getNaiveBayesKillProb(hist);
    this.memoNB.set(key, res);
    return res;
  }

  private getNaiveBayesKillProb(hist: number[][]): number[] {
    if (hist.length < 50) return new Array(50).fill(0);

    // Classes: 0 = Appeared (Not Killed), 1 = Not Appeared (Killed)
    let classKill = 0;
    let classNotKill = 0;

    // P(Feature | Class) with Laplace smoothing
    const countF1 = {
      kill: new Array(5).fill(0.1),
      notKill: new Array(5).fill(0.1),
    };
    const countF2 = {
      kill: new Array(4).fill(0.1),
      notKill: new Array(4).fill(0.1),
    };
    const countF3 = {
      kill: new Array(10).fill(0.1),
      notKill: new Array(10).fill(0.1),
    }; // Tail Digit (0-9)
    const countF4 = {
      kill: new Array(2).fill(0.1),
      notKill: new Array(2).fill(0.1),
    }; // Odd/Even (0, 1)

    const getF1Category = (gap: number) =>
      gap === 0 ? 0 : gap <= 2 ? 1 : gap <= 5 ? 2 : gap <= 10 ? 3 : 4;
    const getF2Category = (freq: number) =>
      freq === 0 ? 0 : freq === 1 ? 1 : freq === 2 ? 2 : 3;
    const getF3Category = (n: number) => n % 10;
    const getF4Category = (n: number) => n % 2;

    const lastSeen = new Array(50).fill(-1);

    for (let i = 0; i < hist.length - 1; i++) {
      const row = hist[i];
      for (let n = 1; n <= 49; n++) {
        let freq = 0;
        for (let j = Math.max(0, i - 9); j <= i; j++) {
          if (hist[j].includes(n)) freq++;
        }

        const gap = lastSeen[n] === -1 ? 10 : i - lastSeen[n];
        const f1 = getF1Category(gap);
        const f2 = getF2Category(freq);
        const f3 = getF3Category(n);
        const f4 = getF4Category(n);

        const isKilled = !hist[i + 1].includes(n);
        if (isKilled) {
          classKill++;
          countF1.kill[f1]++;
          countF2.kill[f2]++;
          countF3.kill[f3]++;
          countF4.kill[f4]++;
        } else {
          classNotKill++;
          countF1.notKill[f1]++;
          countF2.notKill[f2]++;
          countF3.notKill[f3]++;
          countF4.notKill[f4]++;
        }
      }
      for (const num of row) lastSeen[num] = i;
    }

    const currentGap = new Array(50).fill(10);
    const currentFreq = new Array(50).fill(0);
    for (let n = 1; n <= 49; n++) {
      let freq = 0;
      for (let j = Math.max(0, hist.length - 10); j < hist.length; j++) {
        if (hist[j].includes(n)) freq++;
      }
      currentFreq[n] = freq;

      let ls = -1;
      for (let j = hist.length - 1; j >= 0; j--) {
        if (hist[j].includes(n)) {
          ls = j;
          break;
        }
      }
      currentGap[n] = ls === -1 ? 10 : hist.length - 1 - ls;
    }

    const pKill = classKill / (classKill + classNotKill);
    const pNotKill = classNotKill / (classKill + classNotKill);
    const mlProbs = new Array(50).fill(0);

    for (let n = 1; n <= 49; n++) {
      const f1 = getF1Category(currentGap[n]);
      const f2 = getF2Category(currentFreq[n]);
      const f3 = getF3Category(n);
      const f4 = getF4Category(n);

      const pF1_Kill = countF1.kill[f1] / classKill;
      const pF2_Kill = countF2.kill[f2] / classKill;
      const pF3_Kill = countF3.kill[f3] / classKill;
      const pF4_Kill = countF4.kill[f4] / classKill;

      const pF1_NotKill = countF1.notKill[f1] / classNotKill;
      const pF2_NotKill = countF2.notKill[f2] / classNotKill;
      const pF3_NotKill = countF3.notKill[f3] / classNotKill;
      const pF4_NotKill = countF4.notKill[f4] / classNotKill;

      const scoreKill = pKill * pF1_Kill * pF2_Kill * pF3_Kill * pF4_Kill;
      const scoreNotKill =
        pNotKill * pF1_NotKill * pF2_NotKill * pF3_NotKill * pF4_NotKill;

      mlProbs[n] = scoreKill / (scoreKill + scoreNotKill);
    }

    return mlProbs;
  }

  // --- SECOND-ORDER MARKOV CHAIN ---
  private getMarkov2PredictionsMemo(hist: number[][]): number[] {
    const key = hist.length;
    if (this.memoMarkov2.has(key)) return this.memoMarkov2.get(key);
    const res = this.getMarkov2Predictions(hist);
    this.memoMarkov2.set(key, res);
    return res;
  }

  private getMarkov2Predictions(hist: number[][]): number[] {
    if (hist.length < 4) return new Array(50).fill(7 / 49);
    const pairTrans: Map<string, number[]> = new Map();
    const pairCounts: Map<string, number> = new Map();

    for (let i = 1; i < hist.length - 1; i++) {
      const prev = hist[i - 1];
      const curr = hist[i];
      const next = hist[i + 1];
      for (const a of prev) {
        for (const b of curr) {
          const key = `${a},${b}`;
          if (!pairTrans.has(key)) {
            pairTrans.set(key, new Array(50).fill(0));
            pairCounts.set(key, 0);
          }
          pairCounts.set(key, pairCounts.get(key)! + 1);
          for (const c of next) pairTrans.get(key)![c]++;
        }
      }
    }

    const prev = hist[hist.length - 2];
    const curr = hist[hist.length - 1];
    const nextProbs = new Array(50).fill(0);
    let totalWeight = 0;

    for (const a of prev) {
      for (const b of curr) {
        const key = `${a},${b}`;
        const count = pairCounts.get(key) || 0;
        if (count < 2) continue;
        const trans = pairTrans.get(key);
        if (!trans) continue;
        for (let j = 1; j <= 49; j++) nextProbs[j] += trans[j] / count;
        totalWeight++;
      }
    }

    if (totalWeight > 0) {
      for (let j = 1; j <= 49; j++) nextProbs[j] /= totalWeight;
    }
    return nextProbs;
  }

  private getAppearProbabilityScoresMemo(hist: number[][]): AppearScore[] {
    const key = hist.length;
    if (this.memoAppearScores.has(key)) return this.memoAppearScores.get(key)!;
    const res = this.getAppearProbabilityScores(hist);
    this.memoAppearScores.set(key, res);
    return res;
  }

  private getDefaultAppearWeights(): AppearWeights {
    return {
      name: 'balanced-default',
      freq10: 0.18,
      freq20: 0.18,
      freq50: 0.14,
      freq100: 0.08,
      longFreq: 0.1,
      markov: 0.12,
      markov2: 0.08,
      knn: 0.06,
      bayesAppear: 0.04,
      gapRisk: 0.02,
    };
  }

  private normalizeAppearWeights(weights: AppearWeights): AppearWeights {
    const { name, ...rest } = weights;
    const sum =
      Object.values(rest).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const normalized: any = { name };
    for (const [key, value] of Object.entries(rest)) {
      normalized[key] = Math.max(0, value as number) / sum;
    }
    return normalized as AppearWeights;
  }

  private getAppearWeightCandidates(): AppearWeights[] {
    const presets: AppearWeights[] = [
      this.getDefaultAppearWeights(),
      {
        name: 'recent-hot-risk',
        freq10: 0.28,
        freq20: 0.24,
        freq50: 0.12,
        freq100: 0.04,
        longFreq: 0.06,
        markov: 0.1,
        markov2: 0.05,
        knn: 0.05,
        bayesAppear: 0.03,
        gapRisk: 0.03,
      },
      {
        name: 'mid-window-stable',
        freq10: 0.1,
        freq20: 0.18,
        freq50: 0.24,
        freq100: 0.14,
        longFreq: 0.1,
        markov: 0.08,
        markov2: 0.05,
        knn: 0.04,
        bayesAppear: 0.03,
        gapRisk: 0.04,
      },
      {
        name: 'transition-led',
        freq10: 0.1,
        freq20: 0.1,
        freq50: 0.12,
        freq100: 0.08,
        longFreq: 0.06,
        markov: 0.24,
        markov2: 0.16,
        knn: 0.07,
        bayesAppear: 0.04,
        gapRisk: 0.03,
      },
      {
        name: 'pattern-led',
        freq10: 0.1,
        freq20: 0.12,
        freq50: 0.12,
        freq100: 0.06,
        longFreq: 0.06,
        markov: 0.12,
        markov2: 0.08,
        knn: 0.22,
        bayesAppear: 0.07,
        gapRisk: 0.05,
      },
      {
        name: 'gap-protection',
        freq10: 0.1,
        freq20: 0.12,
        freq50: 0.12,
        freq100: 0.08,
        longFreq: 0.08,
        markov: 0.1,
        markov2: 0.07,
        knn: 0.04,
        bayesAppear: 0.04,
        gapRisk: 0.25,
      },
      {
        name: 'cold-frequency',
        freq10: 0.22,
        freq20: 0.22,
        freq50: 0.2,
        freq100: 0.12,
        longFreq: 0.12,
        markov: 0.04,
        markov2: 0.02,
        knn: 0.02,
        bayesAppear: 0.02,
        gapRisk: 0.02,
      },
      {
        name: 'low-noise-long',
        freq10: 0.06,
        freq20: 0.1,
        freq50: 0.22,
        freq100: 0.2,
        longFreq: 0.18,
        markov: 0.08,
        markov2: 0.04,
        knn: 0.03,
        bayesAppear: 0.03,
        gapRisk: 0.06,
      },
      {
        name: 'bayes-plus-transition',
        freq10: 0.08,
        freq20: 0.1,
        freq50: 0.12,
        freq100: 0.08,
        longFreq: 0.08,
        markov: 0.18,
        markov2: 0.1,
        knn: 0.06,
        bayesAppear: 0.16,
        gapRisk: 0.04,
      },
      {
        name: 'gap-and-recent',
        freq10: 0.24,
        freq20: 0.2,
        freq50: 0.1,
        freq100: 0.04,
        longFreq: 0.04,
        markov: 0.08,
        markov2: 0.04,
        knn: 0.03,
        bayesAppear: 0.03,
        gapRisk: 0.2,
      },
    ];
    return presets.map((p) => this.normalizeAppearWeights(p));
  }

  private getTrainedAppearWeights(hist: number[][]) {
    const key = hist.length;
    if (this.memoAppearWeights.has(key)) return this.memoAppearWeights.get(key);
    const res = this.trainAppearWeights(hist);
    this.memoAppearWeights.set(key, res);
    return res;
  }

  private trainAppearWeights(hist: number[][]) {
    const candidates = this.getAppearWeightCandidates();
    if (hist.length < 120) {
      return {
        weights: this.getDefaultAppearWeights(),
        score: 0,
        evalPeriods: 0,
        leaderboard: [],
      };
    }

    const evalWindow = Math.min(160, hist.length - 80);
    const start = hist.length - evalWindow;
    const leaderboard = candidates
      .map((weights) => {
        let objective = 0;
        let totalCorrect = 0;
        let allCorrect = 0;
        let ninePlus = 0;
        let evalPeriods = 0;

        for (let i = start; i < hist.length; i++) {
          const subHist = hist.slice(0, i);
          const actualSet = new Set(hist[i]);
          const killNums = this.scoreAppearRows(
            this.getAppearFeatureRows(subHist),
            weights,
          )
            .slice(0, 10)
            .map((s) => s.n);
          const failed = killNums.filter((n) => actualSet.has(n)).length;
          const correct = killNums.length - failed;
          totalCorrect += correct;
          if (failed === 0) allCorrect++;
          if (failed <= 1) ninePlus++;
          objective +=
            correct / 10 +
            (failed === 0 ? 0.08 : 0) +
            (failed <= 1 ? 0.025 : 0) -
            failed * 0.025;
          evalPeriods++;
        }

        const avgAccuracy =
          evalPeriods > 0 ? totalCorrect / (evalPeriods * 10) : 0;
        const allCorrectRate = evalPeriods > 0 ? allCorrect / evalPeriods : 0;
        const ninePlusRate = evalPeriods > 0 ? ninePlus / evalPeriods : 0;
        return {
          weights,
          score: evalPeriods > 0 ? objective / evalPeriods : 0,
          evalPeriods,
          avgAccuracy,
          allCorrectRate,
          ninePlusRate,
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      weights: leaderboard[0].weights,
      score: leaderboard[0].score,
      evalPeriods: leaderboard[0].evalPeriods,
      leaderboard: leaderboard.slice(0, 5).map((item) => ({
        name: item.weights.name,
        score: Math.round(item.score * 10000) / 10000,
        avgAccuracy: Math.round(item.avgAccuracy * 10000) / 100,
        allCorrectRate: Math.round(item.allCorrectRate * 10000) / 100,
        ninePlusRate: Math.round(item.ninePlusRate * 10000) / 100,
        weights: item.weights,
      })),
    };
  }

  private getAppearFeatureRows(
    hist: number[][],
  ): Array<{ n: number; features: Record<string, number> }> {
    const hn = hist.length;
    if (hn === 0) return [];

    const allApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) {
      for (const n of hist[i]) allApps[n].push(i);
    }

    const markov = this.getMarkovPredictions(hist);
    const markov2 = this.getMarkov2PredictionsMemo(hist);
    const knn = this.getKnnPredictionsMemo(hist, 30);
    const bayesKill = this.getNaiveBayesKillProbMemo(hist);

    const countInWindow = (n: number, window: number) => {
      let count = 0;
      for (let i = Math.max(0, hn - window); i < hn; i++) {
        if (hist[i].includes(n)) count++;
      }
      return count;
    };

    const rows: Array<{ n: number; features: Record<string, number> }> = [];
    for (let n = 1; n <= 49; n++) {
      const apps = allApps[n];
      const longFreq = apps.length / hn;
      const freq10 = countInWindow(n, 10) / Math.min(10, hn);
      const freq20 = countInWindow(n, 20) / Math.min(20, hn);
      const freq50 = countInWindow(n, 50) / Math.min(50, hn);
      const freq100 = countInWindow(n, 100) / Math.min(100, hn);

      const lastSeen = apps.length > 0 ? apps[apps.length - 1] : -1;
      const currentGap = lastSeen >= 0 ? hn - 1 - lastSeen : hn;
      const gaps: number[] = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap =
        gaps.length > 0
          ? gaps.reduce((a, b) => a + b, 0) / gaps.length
          : 49 / 7;
      const gapRatio = avgGap > 0 ? currentGap / avgGap : 1;
      const stdDev =
        gaps.length > 0
          ? Math.sqrt(
              gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length,
            )
          : avgGap;
      const cv = avgGap > 0 ? stdDev / avgGap : 1;

      // 过久未出有回补风险，刚出/短期很热也有继续出现风险；中间区域相对适合杀码。
      let gapRisk = this.randomAppearProb;
      if (gapRatio >= 2.5) gapRisk += 0.06;
      else if (gapRatio >= 1.4) gapRisk += 0.025;
      else if (gapRatio <= 0.25) gapRisk += 0.035;
      else if (gapRatio >= 0.6 && gapRatio <= 1.1) gapRisk -= 0.015;
      if (cv > 0.9 && currentGap <= avgGap) gapRisk += 0.015;

      rows.push({
        n,
        features: {
          freq10,
          freq20,
          freq50,
          freq100,
          longFreq,
          currentGap,
          avgGap,
          gapRatio,
          cv,
          markov: markov[n] || 0,
          markov2: markov2[n] || 0,
          knn: knn[n] || 0,
          bayesAppear: 1 - (bayesKill[n] || this.randomKillProb),
          gapRisk,
        },
      });
    }

    return rows;
  }

  private scoreAppearRows(
    rows: Array<{ n: number; features: Record<string, number> }>,
    weights: AppearWeights,
  ): AppearScore[] {
    const scores = rows.map((row) => {
      const f = row.features;
      const modelAppear =
        weights.freq10 * f.freq10 +
        weights.freq20 * f.freq20 +
        weights.freq50 * f.freq50 +
        weights.freq100 * f.freq100 +
        weights.longFreq * f.longFreq +
        weights.markov * (f.markov || this.randomAppearProb) +
        weights.markov2 * (f.markov2 || this.randomAppearProb) +
        weights.knn * (f.knn || this.randomAppearProb) +
        weights.bayesAppear * (f.bayesAppear || this.randomAppearProb) +
        weights.gapRisk * f.gapRisk;
      const appearProb = Math.max(0.02, Math.min(0.45, modelAppear));
      return {
        n: row.n,
        appearProb,
        killConfidence: 1 - appearProb,
        features: f,
      };
    });

    scores.sort((a, b) => a.appearProb - b.appearProb);
    return scores;
  }

  private getAppearProbabilityScores(hist: number[][]): AppearScore[] {
    const trained = this.getTrainedAppearWeights(hist);
    return this.scoreAppearRows(
      this.getAppearFeatureRows(hist),
      trained.weights,
    );
  }

  private getProbabilityKillPredictionsWithWeights(
    hist: number[][],
    weights: AppearWeights,
    count = 10,
  ) {
    const protectedNums = this.getFailurePatternProtection(hist);
    const scores = this.scoreAppearRows(
      this.getAppearFeatureRows(hist),
      weights,
    );
    return scores
      .filter((s) => !protectedNums.has(s.n))
      .slice(0, count)
      .map((s, i) => ({
        n: s.n,
        tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
        score: Math.round(s.killConfidence * 1000) / 1000,
        appearProb: Math.round(s.appearProb * 1000) / 1000,
        experts: '出现概率',
        repulsionScore: 0,
        aprioriScore: 0,
        features: s.features,
      }));
  }

  private getProbabilityKillPredictions(hist: number[][], count = 10) {
    const trained = this.getTrainedAppearWeights(hist);
    return this.getProbabilityKillPredictionsWithWeights(
      hist,
      trained.weights,
      count,
    );
  }

  private getLowRiskKillScores(hist: number[][]): AppearScore[] {
    const protectedNums = this.getFailurePatternProtection(hist);
    const rows = this.getAppearFeatureRows(hist);

    const scores = rows
      .filter((row) => !protectedNums.has(row.n))
      .map((row) => {
        const f = row.features;
        const lastHit = f.currentGap === 0 ? 1 : 0;
        const tooFreshRisk = f.gapRatio <= 0.25 ? 0.06 : 0;
        const dueRisk = Math.max(0, Math.min(1, (f.gapRatio - 0.55) / 2.5));
        const hotRisk =
          f.freq10 * 0.3 +
          f.freq20 * 0.24 +
          f.freq50 * 0.16 +
          f.freq100 * 0.08;
        const transitionRisk =
          (f.markov || this.randomAppearProb) * 0.08 +
          (f.markov2 || this.randomAppearProb) * 0.05 +
          (f.knn || this.randomAppearProb) * 0.04;
        const danger =
          hotRisk +
          dueRisk * 0.28 +
          tooFreshRisk +
          lastHit * 0.08 +
          transitionRisk;
        const appearProb = Math.max(
          0.02,
          Math.min(0.45, this.randomAppearProb + danger * 0.35 - 0.08),
        );

        return {
          n: row.n,
          appearProb,
          killConfidence: 1 - appearProb,
          features: {
            ...f,
            lowRiskDanger: danger,
          },
        };
      });

    scores.sort(
      (a, b) =>
        a.features.lowRiskDanger - b.features.lowRiskDanger ||
        a.appearProb - b.appearProb,
    );
    return scores;
  }

  private getLowRiskKillPredictions(hist: number[][], count = 10) {
    return this.getLowRiskKillScores(hist)
      .slice(0, count)
      .map((s, i) => ({
        n: s.n,
        tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
        score: Math.round(s.killConfidence * 1000) / 1000,
        appearProb: Math.round(s.appearProb * 1000) / 1000,
        experts: '低风险',
        repulsionScore: 0,
        aprioriScore: 0,
        features: s.features,
      }));
  }

  private buildFastLearningFeatures(hist: number[][], end: number, n: number) {
    const countInWindow = (window: number) => {
      let count = 0;
      for (let i = Math.max(0, end - window); i < end; i++) {
        if (hist[i].includes(n)) count++;
      }
      return count;
    };

    let lastSeen = -1;
    const gaps: number[] = [];
    let previousSeen = -1;
    let totalSeen = 0;
    for (let i = 0; i < end; i++) {
      if (!hist[i].includes(n)) continue;
      totalSeen++;
      if (previousSeen >= 0) gaps.push(i - previousSeen);
      previousSeen = i;
      lastSeen = i;
    }

    const avgGap =
      gaps.length > 0
        ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
        : 49 / 7;
    const currentGap = lastSeen >= 0 ? end - 1 - lastSeen : end;
    const gapRatio = avgGap > 0 ? currentGap / avgGap : 1;

    return {
      freq5: countInWindow(5) / Math.min(5, end),
      freq10: countInWindow(10) / Math.min(10, end),
      freq20: countInWindow(20) / Math.min(20, end),
      freq50: countInWindow(50) / Math.min(50, end),
      freq100: countInWindow(100) / Math.min(100, end),
      longFreq: totalSeen / Math.max(1, end),
      currentGap,
      avgGap,
      gapRatio,
      recent1: countInWindow(1),
      recent3: countInWindow(3),
      recent5: countInWindow(5),
    };
  }

  private bucketLearningFeatures(features: Record<string, number>) {
    const gapBucket =
      features.gapRatio < 0.25
        ? 0
        : features.gapRatio < 0.65
          ? 1
          : features.gapRatio < 1.15
            ? 2
            : features.gapRatio < 1.8
              ? 3
              : 4;
    const freq20Bucket =
      features.freq20 <= 0.05
        ? 0
        : features.freq20 <= 0.1
          ? 1
          : features.freq20 <= 0.2
            ? 2
            : 3;
    const freq50Bucket =
      features.freq50 <= 0.08
        ? 0
        : features.freq50 <= 0.14
          ? 1
          : features.freq50 <= 0.22
            ? 2
            : 3;
    const recentBucket =
      features.recent1 > 0 ? 3 : features.recent3 > 0 ? 2 : features.recent5 > 0 ? 1 : 0;

    return {
      gapBucket,
      freq20Bucket,
      freq50Bucket,
      recentBucket,
      composite: `${gapBucket}|${freq20Bucket}|${freq50Bucket}|${recentBucket}`,
    };
  }

  private getHistoricalLearningScores(hist: number[][]): AppearScore[] {
    const key = hist.length;
    if (this.memoHistoricalLearning.has(key)) {
      return this.memoHistoricalLearning.get(key);
    }

    const protectedNums = this.getFailurePatternProtection(hist);
    const minStart = Math.max(40, Math.min(120, Math.floor(hist.length * 0.12)));
    const trainStart = Math.max(minStart, hist.length - 520);
    const currentFeatures = new Map<number, Record<string, number>>();
    const currentBuckets = new Map<number, ReturnType<PredictorService['bucketLearningFeatures']>>();

    for (let n = 1; n <= 49; n++) {
      const f = this.buildFastLearningFeatures(hist, hist.length, n);
      currentFeatures.set(n, f);
      currentBuckets.set(n, this.bucketLearningFeatures(f));
    }

    const rows = [];
    for (let n = 1; n <= 49; n++) {
      if (protectedNums.has(n)) continue;

      const current = currentFeatures.get(n)!;
      const bucket = currentBuckets.get(n)!;
      let exactTrials = 0;
      let exactAppears = 0;
      let softTrials = 0;
      let softAppears = 0;
      let weightedTrials = 0;
      let weightedAppears = 0;

      for (let i = trainStart; i < hist.length; i++) {
        const f = this.buildFastLearningFeatures(hist, i, n);
        const b = this.bucketLearningFeatures(f);
        const appeared = hist[i].includes(n) ? 1 : 0;

        if (b.composite === bucket.composite) {
          exactTrials++;
          exactAppears += appeared;
        }

        const bucketDistance =
          Math.abs(b.gapBucket - bucket.gapBucket) +
          Math.abs(b.freq20Bucket - bucket.freq20Bucket) +
          Math.abs(b.freq50Bucket - bucket.freq50Bucket) +
          Math.abs(b.recentBucket - bucket.recentBucket);
        if (bucketDistance <= 2) {
          softTrials++;
          softAppears += appeared;
        }

        const featureDistance =
          Math.abs(f.gapRatio - current.gapRatio) * 0.9 +
          Math.abs(f.freq20 - current.freq20) * 3.2 +
          Math.abs(f.freq50 - current.freq50) * 2.2 +
          Math.abs(f.freq100 - current.freq100) * 1.4 +
          Math.abs(f.recent5 - current.recent5) * 0.22;
        const weight = 1 / (1 + featureDistance);
        weightedTrials += weight;
        weightedAppears += appeared * weight;
      }

      const exactRate =
        exactTrials >= 8 ? exactAppears / exactTrials : this.randomAppearProb;
      const softRate =
        softTrials >= 18 ? softAppears / softTrials : this.randomAppearProb;
      const weightedRate =
        weightedTrials > 0 ? weightedAppears / weightedTrials : this.randomAppearProb;
      const longRate = current.longFreq || this.randomAppearProb;
      const appearProb = Math.max(
        0.025,
        Math.min(
          0.42,
          exactRate * 0.28 + softRate * 0.27 + weightedRate * 0.3 + longRate * 0.15,
        ),
      );

      rows.push({
        n,
        appearProb,
        killConfidence: 1 - appearProb,
        features: {
          ...current,
          exactTrials,
          exactRate,
          softTrials,
          softRate,
          weightedRate,
          historicalLearningProb: appearProb,
        },
      });
    }

    rows.sort(
      (a, b) =>
        a.appearProb - b.appearProb ||
        b.features.exactTrials - a.features.exactTrials ||
        a.n - b.n,
    );
    this.memoHistoricalLearning.set(key, rows);
    return rows;
  }

  private getHistoricalLearningKillPredictions(hist: number[][], count = 10) {
    return this.getHistoricalLearningScores(hist)
      .slice(0, count)
      .map((s, i) => ({
        n: s.n,
        tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
        score: Math.round(s.killConfidence * 1000) / 1000,
        appearProb: Math.round(s.appearProb * 1000) / 1000,
        experts: '历史学习',
        repulsionScore: 0,
        aprioriScore: 0,
        risk: s.appearProb <= 0.1 ? 'low' : s.appearProb <= 0.14 ? 'mid' : 'watch',
        reasons: [
          '相似历史场景',
          `精确样本${s.features.exactTrials}期`,
          `学习出现率${Math.round(s.appearProb * 100)}%`,
        ],
        features: s.features,
      }));
  }

  private normalizeMetric(value: number, floor: number, ceiling: number) {
    if (ceiling <= floor) return 0;
    return Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
  }

  private getHotPickFeatureRows(hist: number[][]) {
    const hn = hist.length;
    const lastRow = new Set(hist[hn - 1] || []);
    const rows: any[] = [];

    for (let n = 1; n <= 49; n++) {
      const apps = [];
      for (let i = 0; i < hn; i++) {
        if (hist[i].includes(n)) apps.push(i);
      }

      const countInWindow = (window: number) => {
        let count = 0;
        for (let i = Math.max(0, hn - window); i < hn; i++) {
          if (hist[i].includes(n)) count++;
        }
        return count / Math.min(window, hn);
      };

      const gaps = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap =
        gaps.length > 0
          ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
          : 49 / 7;
      const currentGap = apps.length > 0 ? hn - 1 - apps[apps.length - 1] : hn;

      rows.push({
        n,
        features: {
          freq3: countInWindow(3),
          freq5: countInWindow(5),
          freq10: countInWindow(10),
          freq20: countInWindow(20),
          freq30: countInWindow(30),
          freq50: countInWindow(50),
          longFreq: apps.length / Math.max(1, hn),
          currentGap,
          avgGap,
          gapRatio: avgGap > 0 ? currentGap / avgGap : 1,
          lastHit: lastRow.has(n) ? 1 : 0,
          tail: n % 10,
          zone: Math.floor((n - 1) / 10),
          recent30Rank: 49,
          recent30Heat: 0,
        },
      });
    }

    const recent30Ranked = [...rows].sort(
      (a, b) => b.features.freq30 - a.features.freq30 || a.n - b.n,
    );
    recent30Ranked.forEach((row, index) => {
      row.features.recent30Rank = index + 1;
      row.features.recent30Heat = this.normalizeMetric(row.features.freq30, 0.04, 0.28);
    });

    return rows;
  }

  private getHotPickTransitionScores(hist: number[][]) {
    const markov = new Array(50).fill(this.randomAppearProb);
    const markov2 = new Array(50).fill(this.randomAppearProb);
    if (hist.length < 3) return { markov, markov2 };

    const matrix = Array.from({ length: 50 }, () => new Array(50).fill(0));
    const counts = new Array(50).fill(0);
    const pairMap = new Map<string, number[]>();

    for (let i = 0; i < hist.length - 1; i++) {
      for (const a of hist[i]) {
        counts[a]++;
        for (const b of hist[i + 1]) matrix[a][b]++;
      }

      if (i === 0) continue;
      for (const a of hist[i - 1]) {
        for (const b of hist[i]) {
          const key = `${a},${b}`;
          if (!pairMap.has(key)) pairMap.set(key, new Array(50).fill(0));
          const row = pairMap.get(key)!;
          for (const n of hist[i + 1]) row[n]++;
        }
      }
    }

    const last = hist[hist.length - 1] || [];
    const prev = hist[hist.length - 2] || [];
    for (let n = 1; n <= 49; n++) {
      let markovSum = 0;
      for (const a of last) {
        markovSum += counts[a] > 0 ? matrix[a][n] / counts[a] : this.randomAppearProb;
      }
      markov[n] = last.length > 0 ? markovSum / last.length : this.randomAppearProb;

      let pairSum = 0;
      let pairCount = 0;
      for (const a of prev) {
        for (const b of last) {
          const row = pairMap.get(`${a},${b}`);
          if (!row) continue;
          const total = row.reduce((sum, value) => sum + value, 0);
          if (total <= 0) continue;
          pairSum += row[n] / Math.max(1, total / 7);
          pairCount++;
        }
      }
      if (pairCount > 0) markov2[n] = pairSum / pairCount;
    }

    return { markov, markov2 };
  }

  private getHotPickCandidates(hist: number[][], strategy = 'balanced') {
    const hn = hist.length;
    const featureRows = this.getHotPickFeatureRows(hist);
    const transitions = this.getHotPickTransitionScores(hist);

    const rows = featureRows.map((row) => {
      const f = row.features;
      const hotBlend =
        f.freq5 * 0.28 +
        f.freq10 * 0.22 +
        f.freq20 * 0.17 +
        f.freq30 * 0.15 +
        f.freq50 * 0.1 +
        f.longFreq * 0.08;
      const recent30Signal = f.freq30 * 0.72 + f.recent30Heat * 0.28;
      const gapDue = this.normalizeMetric(f.gapRatio, 0.6, 2.6);
      const overDuePenalty = this.normalizeMetric(f.gapRatio, 2.8, 4.8) * 0.08;
      const markov = transitions.markov[row.n] || this.randomAppearProb;
      const markov2 = transitions.markov2[row.n] || this.randomAppearProb;

      const scoreByStrategy: Record<string, number> = {
        balanced:
          hotBlend * 0.24 +
          markov * 0.24 +
          markov2 * 0.16 +
          gapDue * 0.14 +
          f.lastHit * 0.1 +
          f.freq3 * 0.08 -
          overDuePenalty,
        repeat:
          f.lastHit * 0.18 +
          hotBlend * 0.26 +
          markov * 0.25 +
          markov2 * 0.14 +
          gapDue * 0.08 -
          overDuePenalty,
        transition: markov * 0.55 + markov2 * 0.25 + hotBlend * 0.12 + gapDue * 0.08,
        hot: hotBlend * 0.5 + f.freq10 * 0.22 + markov * 0.14 + f.lastHit * 0.08,
        due: gapDue * 0.42 + markov * 0.2 + f.freq20 * 0.18 + hotBlend * 0.16,
        recent30:
          recent30Signal * 0.36 +
          hotBlend * 0.2 +
          markov * 0.18 +
          markov2 * 0.12 +
          gapDue * 0.08 +
          f.lastHit * 0.04 -
          overDuePenalty,
      };
      const score = scoreByStrategy[strategy] ?? scoreByStrategy.balanced;
      const appearProb = Math.max(
        0.02,
        Math.min(0.58, scoreByStrategy.balanced + hotBlend * 0.14 + f.freq30 * 0.08),
      );

      return {
        n: row.n,
        score,
        appearProb,
        reasons: [
          `热度${Math.round(hotBlend * 100)}%`,
          `近30期${Math.round(f.freq30 * Math.min(30, hn))}期/#${f.recent30Rank}`,
          `转移${Math.round(markov * 100)}%`,
          `间隔${f.currentGap}期`,
        ],
        features: {
          ...f,
          hotBlend,
          recent30Signal,
          markov,
          markov2,
          gapDue,
        },
      };
    });

    rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.appearProb - a.appearProb ||
        a.n - b.n,
    );
    return rows;
  }

  private diversifyHotPickCandidates(candidates: any[], count: number) {
    const selected = [];
    const tails = new Map<number, number>();
    const zones = new Map<number, number>();

    for (const candidate of candidates) {
      const tail = candidate.n % 10;
      const zone = Math.floor((candidate.n - 1) / 10);
      if ((tails.get(tail) || 0) >= 2) continue;
      if ((zones.get(zone) || 0) >= 3) continue;
      selected.push(candidate);
      tails.set(tail, (tails.get(tail) || 0) + 1);
      zones.set(zone, (zones.get(zone) || 0) + 1);
      if (selected.length >= count) break;
    }

    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (selected.some((item) => item.n === candidate.n)) continue;
      selected.push(candidate);
    }

    return selected;
  }

  private getHotPickPredictions(
    hist: number[][],
    count: number,
    strategy = 'balanced',
    diversified = false,
  ) {
    const candidates = this.getHotPickCandidates(hist, strategy);
    const selected = diversified
      ? this.diversifyHotPickCandidates(candidates, count)
      : candidates.slice(0, count);

    return selected
      .map((row, i) => ({
        n: row.n,
        rank: i + 1,
        score: Math.round(row.score * 1000) / 1000,
        appearProb: Math.round(row.appearProb * 1000) / 1000,
        reasons: row.reasons,
      }));
  }

  private getPoissonBinomialAtLeast(probs: number[], targetHit: number) {
    const dp = new Array(probs.length + 1).fill(0);
    dp[0] = 1;

    for (const rawProb of probs) {
      const prob = Math.max(0, Math.min(1, rawProb));
      for (let hit = probs.length; hit >= 1; hit--) {
        dp[hit] = dp[hit] * (1 - prob) + dp[hit - 1] * prob;
      }
      dp[0] *= 1 - prob;
    }

    return dp.slice(targetHit).reduce((sum, value) => sum + value, 0);
  }

  private getHotPickRollingContributions(
    hist: number[][],
    count: number,
    strategy = 'balanced',
    diversified = false,
    poolSize = 20,
    evalPeriods = 30,
  ) {
    const candidates = this.getHotPickCandidates(hist, strategy).slice(0, poolSize);
    const stats = new Map<
      number,
      {
        n: number;
        samples: number;
        hits: number;
        baseSuccesses: number;
        withSuccesses: number;
        gain: number;
        avgHitGain: number;
      }
    >();

    for (const candidate of candidates) {
      stats.set(candidate.n, {
        n: candidate.n,
        samples: 0,
        hits: 0,
        baseSuccesses: 0,
        withSuccesses: 0,
        gain: 0,
        avgHitGain: 0,
      });
    }

    const start = Math.max(50, hist.length - evalPeriods);
    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const actualSet = new Set(hist[i]);
      const basePredicted = this.getHotPickPredictions(
        subHist,
        count,
        strategy,
        diversified,
      ).map((p) => p.n);
      const baseHitCount = basePredicted.filter((n) => actualSet.has(n)).length;
      const baseSuccess = baseHitCount >= 3 ? 1 : 0;
      const subCandidates = this.getHotPickCandidates(subHist, strategy).slice(0, poolSize);

      for (const candidate of subCandidates) {
        const stat = stats.get(candidate.n);
        if (!stat) continue;
        const withPredicted = basePredicted.includes(candidate.n)
          ? basePredicted
          : [...basePredicted.slice(0, Math.max(0, count - 1)), candidate.n];
        const withHitCount = withPredicted.filter((n) => actualSet.has(n)).length;
        const withSuccess = withHitCount >= 3 ? 1 : 0;

        stat.samples++;
        stat.hits += actualSet.has(candidate.n) ? 1 : 0;
        stat.baseSuccesses += baseSuccess;
        stat.withSuccesses += withSuccess;
        stat.gain += withSuccess - baseSuccess;
        stat.avgHitGain += withHitCount - baseHitCount;
      }
    }

    return candidates.map((candidate) => {
      const stat = stats.get(candidate.n);
      const samples = stat?.samples || 0;
      const successLift = samples > 0 ? ((stat?.gain || 0) / samples) * 100 : 0;
      const hitRate = samples > 0 ? ((stat?.hits || 0) / samples) * 100 : 0;
      const avgHitLift = samples > 0 ? (stat?.avgHitGain || 0) / samples : 0;

      return {
        n: candidate.n,
        samples,
        hitRate: Math.round(hitRate * 10) / 10,
        successLift: Math.round(successLift * 10) / 10,
        avgHitLift: Math.round(avgHitLift * 1000) / 1000,
        contributionScore:
          candidate.score +
          Math.max(-0.08, Math.min(0.12, successLift / 100)) +
          Math.max(-0.04, Math.min(0.08, avgHitLift * 0.08)),
      };
    });
  }

  private getOptimizedHotPickPredictions(
    hist: number[][],
    count: number,
    strategy = 'balanced',
    diversified = false,
  ) {
    const candidates = this.getHotPickCandidates(hist, strategy).slice(0, 20);
    const contributionMap = new Map(
      this.getHotPickRollingContributions(hist, count, strategy, diversified).map((item) => [
        item.n,
        item,
      ]),
    );
    const ranked = candidates
      .map((candidate) => {
        const contribution = contributionMap.get(candidate.n);
        return {
          ...candidate,
          contribution,
          optimizedScore: contribution?.contributionScore ?? candidate.score,
        };
      })
      .sort(
        (a, b) =>
          b.optimizedScore - a.optimizedScore ||
          b.appearProb - a.appearProb ||
          a.n - b.n,
      );
    const selected = diversified
      ? this.diversifyHotPickCandidates(ranked, count)
      : ranked.slice(0, count);

    return selected.map((row, i) => ({
      n: row.n,
      rank: i + 1,
      score: Math.round(row.score * 1000) / 1000,
      optimizedScore: Math.round(row.optimizedScore * 1000) / 1000,
      appearProb: Math.round(row.appearProb * 1000) / 1000,
      contribution: row.contribution,
      reasons: row.reasons,
    }));
  }

  private backtestOptimizedHotPick(
    hist: number[][],
    count: number,
    displayPeriods = 10,
    strategy = 'balanced',
    diversified = false,
  ) {
    const start = Math.max(60, hist.length - displayPeriods);
    const details = [];
    let totalHit = 0;
    let successPeriods = 0;

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const predicted = this.getOptimizedHotPickPredictions(
        subHist,
        count,
        strategy,
        diversified,
      ).map((p) => p.n);
      const actualSet = new Set(hist[i]);
      const hitNums = predicted.filter((n) => actualSet.has(n));
      const hitCount = hitNums.length;
      totalHit += hitCount;
      if (hitCount >= 3) successPeriods++;
      details.push({
        periodOffset: hist.length - i,
        predicted,
        actual: hist[i],
        hitNums,
        hitCount,
        success: hitCount >= 3,
        accuracy: (hitCount / count) * 100,
      });
    }

    const calcPeriods = hist.length - start;
    return {
      count,
      strategy,
      diversified,
      targetHit: 3,
      calcPeriods,
      details: details.reverse(),
      totalHit,
      avgHit: calcPeriods > 0 ? totalHit / calcPeriods : 0,
      successPeriods,
      successRate: calcPeriods > 0 ? (successPeriods / calcPeriods) * 100 : 0,
      randomBaseline: this.getRandomHotPickHitAtLeastRate(count, 3) * 100,
    };
  }

  private getHotPickGroupProbability(predictions: any[], stats: any, targetHit = 3) {
    const modelRate =
      this.getPoissonBinomialAtLeast(
        predictions.map((prediction) => prediction.appearProb || this.randomAppearProb),
        targetHit,
      ) * 100;
    const randomBaseline =
      this.getRandomHotPickHitAtLeastRate(predictions.length, targetHit) * 100;
    const recentBacktestRate =
      typeof stats?.successRate === 'number' ? stats.successRate : modelRate;
    const reliability = Math.min(0.7, Math.max(0.25, (stats?.calcPeriods || 0) / 30));
    const estimatedRate = recentBacktestRate * reliability + modelRate * (1 - reliability);

    return {
      targetHit,
      count: predictions.length,
      estimatedRate: Math.round(estimatedRate * 10) / 10,
      modelRate: Math.round(modelRate * 10) / 10,
      recentBacktestRate: Math.round(recentBacktestRate * 10) / 10,
      randomBaseline: Math.round(randomBaseline * 10) / 10,
      lift: Math.round((estimatedRate - randomBaseline) * 10) / 10,
      liftRatio:
        randomBaseline > 0
          ? Math.round((estimatedRate / randomBaseline) * 100) / 100
          : null,
    };
  }

  private backtestHotPick(
    hist: number[][],
    count: number,
    displayPeriods = 10,
    strategy = 'balanced',
    diversified = false,
  ) {
    const start = Math.max(50, hist.length - displayPeriods);
    const details = [];
    let totalHit = 0;
    let successPeriods = 0;
    let maxHit = 0;
    let minHit = count;

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const predicted = this.getHotPickPredictions(
        subHist,
        count,
        strategy,
        diversified,
      ).map((p) => p.n);
      const actualSet = new Set(hist[i]);
      const hitNums = predicted.filter((n) => actualSet.has(n));
      const hitCount = hitNums.length;
      totalHit += hitCount;
      if (hitCount >= 3) successPeriods++;
      maxHit = Math.max(maxHit, hitCount);
      minHit = Math.min(minHit, hitCount);
      details.push({
        periodOffset: hist.length - i,
        predicted,
        actual: hist[i],
        hitNums,
        hitCount,
        success: hitCount >= 3,
        accuracy: (hitCount / count) * 100,
      });
    }

    const calcPeriods = hist.length - start;
    return {
      count,
      strategy,
      diversified,
      targetHit: 3,
      calcPeriods,
      details: details.reverse(),
      totalHit,
      avgHit: calcPeriods > 0 ? totalHit / calcPeriods : 0,
      successPeriods,
      successRate: calcPeriods > 0 ? (successPeriods / calcPeriods) * 100 : 0,
      maxHit,
      minHit: calcPeriods > 0 ? minHit : 0,
      randomBaseline: this.getRandomHotPickHitAtLeastRate(count, 3) * 100,
    };
  }

  private getRandomHotPickHitAtLeastRate(count: number, targetHit: number) {
    const combination = (n: number, k: number) => {
      if (k < 0 || k > n) return 0;
      let result = 1;
      for (let i = 1; i <= k; i++) {
        result = (result * (n - k + i)) / i;
      }
      return result;
    };

    const total = combination(49, count);
    let matched = 0;
    for (let hit = targetHit; hit <= Math.min(count, 7); hit++) {
      matched += combination(7, hit) * combination(42, count - hit);
    }
    return total > 0 ? matched / total : 0;
  }

  private buildAdaptiveHotPick(hist: number[][]) {
    const cacheKey = `${hist.length}:${hist[hist.length - 1]?.join(',') || ''}`;
    if (this.memoHotPick.has(cacheKey)) {
      return this.memoHotPick.get(cacheKey);
    }

    if (hist.length < 60) {
      const predictions = this.getOptimizedHotPickPredictions(hist, 10, 'balanced', true);
      const fallback = {
        mode: 'hot-pick-fallback',
        selectedCount: 10,
        targetHit: 3,
        selectedStrategy: 'balanced',
        diversified: true,
        predictions,
        selectedStats: null,
        optimizedStats: null,
        groupProbability: this.getHotPickGroupProbability(predictions, null, 3),
        contributionRanking: this.getHotPickRollingContributions(hist, 10, 'balanced', true)
          .sort((a, b) => b.contributionScore - a.contributionScore)
          .slice(0, 10),
        options: [],
        reason: 'history-too-short',
      };
      this.memoHotPick.set(cacheKey, fallback);
      return fallback;
    }

    const strategies = ['balanced', 'repeat', 'transition', 'hot', 'due', 'recent30'];
    const counts = [10];
    const rawVariants = strategies.flatMap((strategy) =>
      counts.flatMap((count) => [
        this.backtestHotPick(hist, count, 10, strategy, false),
        this.backtestHotPick(hist, count, 10, strategy, true),
      ]),
    );
    const variants: any[] = rawVariants.map((stats: any) => ({
      ...this.backtestOptimizedHotPick(
        hist,
        stats.count,
        10,
        stats.strategy,
        stats.diversified,
      ),
      rawStats: stats,
    }));
    const sixStats = variants
      .filter((stats) => stats.count === 6)
      .sort(
        (a, b) =>
          b.successRate - a.successRate ||
          b.avgHit - a.avgHit ||
          b.maxHit - a.maxHit,
      )[0];
    const shouldUseSix = false;
    const scoreVariant = (stats: any) =>
      stats.successRate * 1.2 +
      stats.avgHit * 12 +
      Math.max(0, stats.successRate - stats.randomBaseline) * 0.35 -
      stats.count * 0.8;
    const selectedStats = shouldUseSix
      ? sixStats
      : [...variants].sort(
          (a, b) =>
            scoreVariant(b) - scoreVariant(a) ||
            b.successRate - a.successRate ||
            b.avgHit - a.avgHit ||
            a.count - b.count,
        )[0];
    const selectedCount = selectedStats.count;
    const predictions = this.getOptimizedHotPickPredictions(
      hist,
      selectedCount,
      selectedStats.strategy,
      selectedStats.diversified,
    );
    const optimizedStats = this.backtestOptimizedHotPick(
      hist,
      selectedCount,
      10,
      selectedStats.strategy,
      selectedStats.diversified,
    );
    const contributionRanking = this.getHotPickRollingContributions(
      hist,
      selectedCount,
      selectedStats.strategy,
      selectedStats.diversified,
    )
      .sort((a, b) => b.contributionScore - a.contributionScore)
      .slice(0, 10);
    const result = {
      mode: 'adaptive-hot-pick',
      selectedCount,
      selectedStrategy: selectedStats.strategy,
      targetHit: 3,
      predictions,
      selectedStats: optimizedStats,
      rawSelectedStats: selectedStats.rawStats || selectedStats,
      optimizedStats,
      groupProbability: this.getHotPickGroupProbability(predictions, optimizedStats, 3),
      contributionRanking,
      options: variants
        .sort(
          (a, b) =>
            scoreVariant(b) - scoreVariant(a) ||
            b.successRate - a.successRate ||
            b.avgHit - a.avgHit ||
            a.count - b.count,
        )
        .slice(0, 6),
      reason: shouldUseSix
        ? 'six-count-passed-recent-backtest'
        : 'ten-count-group-probability',
      diversified: selectedStats.diversified,
    };
    this.memoHotPick.set(cacheKey, result);
    return result;
  }

  private normalizeCandidates(
    name: string,
    displayName: string,
    rows: Array<{
      n: number;
      raw: number;
      appearProb?: number;
      features?: Record<string, number>;
    }>,
  ): KillModelOutput {
    const rawValues = rows.map((row) => row.raw);
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const range = max - min || 1;
    const candidates = rows
      .map((row) => ({
        n: row.n,
        killScore: Math.max(0, Math.min(1, (row.raw - min) / range)),
        appearProb: row.appearProb,
        features: row.features,
      }))
      .sort((a, b) => b.killScore - a.killScore);

    return { name, displayName, candidates };
  }

  private getEngineModelOutputs(hist: number[][]): KillModelOutput[] {
    if (hist.length === 0) return [];

    const probability = this.getAppearProbabilityScores(hist);
    const lowRisk = this.getLowRiskKillScores(hist);
    const opts = this.getAdaptiveKill10Opts(hist);
    const frequencyCandidates = this.kill10WithOptsMemo(hist, opts);
    const repulsionCandidates = this.kill10WithRepulsionMemo(hist, opts);
    const markov = this.getMarkovPredictions(hist);
    const markov2 = this.getMarkov2PredictionsMemo(hist);
    const knn = this.getKnnPredictionsMemo(hist, 30);
    const bayesKill = this.getNaiveBayesKillProbMemo(hist);

    return [
      {
        name: 'probability',
        displayName: '出现概率',
        candidates: probability.map((s) => ({
          n: s.n,
          killScore: s.killConfidence,
          appearProb: s.appearProb,
          features: s.features,
        })),
      },
      {
        name: 'lowRisk',
        displayName: '低风险',
        candidates: lowRisk.map((s) => ({
          n: s.n,
          killScore: s.killConfidence,
          appearProb: s.appearProb,
          features: s.features,
        })),
      },
      this.normalizeCandidates(
        'frequency',
        '频率权重',
        frequencyCandidates.map((c) => ({ n: c.n, raw: -c.w })),
      ),
      this.normalizeCandidates(
        'repulsion',
        '排斥修正',
        repulsionCandidates.map((c) => ({ n: c.n, raw: -c.w })),
      ),
      this.normalizeCandidates(
        'markov',
        '马尔可夫',
        Array.from({ length: 49 }, (_, i) => ({
          n: i + 1,
          raw: 1 - (markov[i + 1] || this.randomAppearProb),
          appearProb: markov[i + 1] || this.randomAppearProb,
        })),
      ),
      this.normalizeCandidates(
        'markov2',
        '二阶马尔可夫',
        Array.from({ length: 49 }, (_, i) => ({
          n: i + 1,
          raw: 1 - (markov2[i + 1] || this.randomAppearProb),
          appearProb: markov2[i + 1] || this.randomAppearProb,
        })),
      ),
      this.normalizeCandidates(
        'knn',
        '相似期KNN',
        Array.from({ length: 49 }, (_, i) => ({
          n: i + 1,
          raw: 1 - (knn[i + 1] || this.randomAppearProb),
          appearProb: knn[i + 1] || this.randomAppearProb,
        })),
      ),
      this.normalizeCandidates(
        'bayes',
        '朴素贝叶斯',
        Array.from({ length: 49 }, (_, i) => ({
          n: i + 1,
          raw: bayesKill[i + 1] || this.randomKillProb,
        })),
      ),
    ];
  }

  private scoreEngineModel(
    model: KillModelOutput,
    actualSet: Set<number>,
    killCount: number,
  ) {
    const killNums = model.candidates.slice(0, killCount).map((c) => c.n);
    const failed = killNums.filter((n) => actualSet.has(n)).length;
    const correct = killNums.length - failed;
    return {
      killNums,
      failed,
      correct,
      objective:
        correct / killNums.length +
        (failed === 0 ? 0.1 : 0) +
        (failed <= 1 ? 0.035 : 0) -
        failed * 0.03,
    };
  }

  private scoreKillPrediction(predictions: any[], actualSet: Set<number>) {
    const killNums = predictions.map((p) => p.n);
    const failed = killNums.filter((n) => actualSet.has(n));
    const correctCount = killNums.length - failed.length;
    return {
      predicted: killNums,
      failed,
      correctCount,
      accuracy: killNums.length > 0 ? (correctCount / killNums.length) * 100 : 0,
    };
  }

  private createVariantTracker(displayName: string) {
    return {
      displayName,
      details: [] as any[],
      totalCorrect: 0,
      totalPredicted: 0,
      allCorrectPeriods: 0,
      ninePlusPeriods: 0,
      maxMisses: 0,
    };
  }

  private addVariantResult(
    tracker: ReturnType<PredictorService['createVariantTracker']>,
    result: ReturnType<PredictorService['scoreKillPrediction']>,
    actual: number[],
    periodOffset: number,
    shouldKeepDetail: boolean,
  ) {
    tracker.totalCorrect += result.correctCount;
    tracker.totalPredicted += result.predicted.length;
    tracker.allCorrectPeriods += result.failed.length === 0 ? 1 : 0;
    tracker.ninePlusPeriods += result.failed.length <= 1 ? 1 : 0;
    tracker.maxMisses = Math.max(tracker.maxMisses, result.failed.length);

    if (shouldKeepDetail) {
      tracker.details.push({
        periodOffset,
        predicted: result.predicted,
        actual,
        failed: result.failed,
        correctCount: result.correctCount,
        accuracy: result.accuracy,
      });
    }
  }

  private summarizeVariantTracker(
    name: string,
    tracker: ReturnType<PredictorService['createVariantTracker']>,
    calcPeriods: number,
    killCount: number,
  ): KillBacktestSummary & {
    displayName: string;
    maxMisses: number;
    selectorScore: number;
  } {
    const overallAccuracy =
      tracker.totalPredicted > 0
        ? (tracker.totalCorrect / tracker.totalPredicted) * 100
        : 0;
    const allCorrectRate =
      calcPeriods > 0 ? (tracker.allCorrectPeriods / calcPeriods) * 100 : 0;
    const ninePlusRate =
      calcPeriods > 0 ? (tracker.ninePlusPeriods / calcPeriods) * 100 : 0;
    const randomAllCorrectRate = this.getRandomAllKillRate(killCount) * 100;
    const selectorScore =
      allCorrectRate * 0.48 +
      ninePlusRate * 0.24 +
      overallAccuracy * 0.2 +
      Math.max(0, allCorrectRate - randomAllCorrectRate) * 0.08 -
      Math.max(0, tracker.maxMisses - 2) * 0.65;

    return {
      name,
      displayName: tracker.displayName,
      details: tracker.details.reverse(),
      overallAccuracy,
      allCorrectPeriods: tracker.allCorrectPeriods,
      allCorrectRate,
      ninePlusPeriods: tracker.ninePlusPeriods,
      ninePlusRate,
      totalCorrect: tracker.totalCorrect,
      totalPredicted: tracker.totalPredicted,
      calcPeriods,
      killCount,
      maxMisses: tracker.maxMisses,
      selectorScore,
      randomBaseline: {
        singleKillAccuracy: this.randomKillProb * 100,
        allCorrectRate: randomAllCorrectRate,
        lift: allCorrectRate - randomAllCorrectRate,
      },
    };
  }

  private backtestEngineModels(
    hist: number[][],
    killCount: number,
    displayPeriods = 10,
    evalWindow = 160,
  ) {
    if (hist.length < 90) return null;

    const start = Math.max(80, hist.length - evalWindow);
    const performance = new Map<string, any>();
    const variants: Record<string, ReturnType<PredictorService['createVariantTracker']>> = {
      'ensemble-current': this.createVariantTracker('当前 Ensemble'),
      'ensemble-strict-hard': this.createVariantTracker('全中优先 strictHard'),
      probability: this.createVariantTracker('出现概率'),
      'low-risk': this.createVariantTracker('低风险'),
    };

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const actualSet = new Set(hist[i]);
      const models = this.getEngineModelOutputs(subHist);
      const uniformWeights = models.map((model) => ({
        name: model.name,
        displayName: model.displayName,
        weight: 1 / models.length,
        avgAccuracy: this.randomKillProb,
        allCorrectRate: this.getRandomAllKillRate(killCount),
        ninePlusRate: 0,
        maxMisses: 0,
        samples: 0,
      }));
      const currentWeights =
        performance.size > 0
          ? this.buildEngineWeights(performance)
          : uniformWeights;
      const strictHardWeights =
        performance.size > 0
          ? this.buildAllCorrectEngineWeights(performance)
          : uniformWeights;
      const shouldKeepDetail = i >= hist.length - displayPeriods;
      const periodOffset = hist.length - i;

      const predictionsByVariant: Record<string, any[]> = {
        'ensemble-current': this.selectEnginePredictions(
          models,
          currentWeights,
          subHist,
          killCount,
        ),
        'ensemble-strict-hard': this.selectStrictHardEnginePredictions(
          models,
          strictHardWeights,
          subHist,
          killCount,
        ),
        probability: this.getProbabilityKillPredictions(subHist, killCount),
        'low-risk': this.getLowRiskKillPredictions(subHist, killCount),
      };

      for (const [name, predictions] of Object.entries(predictionsByVariant)) {
        this.addVariantResult(
          variants[name],
          this.scoreKillPrediction(predictions, actualSet),
          hist[i],
          periodOffset,
          shouldKeepDetail,
        );
      }

      for (const model of models) {
        const scored = this.scoreEngineModel(model, actualSet, killCount);
        if (!performance.has(model.name)) {
          performance.set(model.name, {
            displayName: model.displayName,
            objective: 0,
            totalCorrect: 0,
            totalPredicted: 0,
            allCorrect: 0,
            ninePlus: 0,
            maxMisses: 0,
            samples: 0,
          });
        }
        const perf = performance.get(model.name)!;
        perf.objective += scored.objective;
        perf.totalCorrect += scored.correct;
        perf.totalPredicted += scored.killNums.length;
        perf.allCorrect += scored.failed === 0 ? 1 : 0;
        perf.ninePlus += scored.failed <= 1 ? 1 : 0;
        perf.maxMisses = Math.max(perf.maxMisses, scored.failed);
        perf.samples++;
      }
    }

    const calcPeriods = hist.length - start;
    const modelPerformance = this.buildEngineWeights(performance);
    const allCorrectModelPerformance =
      this.buildAllCorrectEngineWeights(performance);
    const variantStats = Object.entries(variants)
      .map(([name, tracker]) =>
        this.summarizeVariantTracker(name, tracker, calcPeriods, killCount),
      )
      .sort((a, b) => b.selectorScore - a.selectorScore);
    const selected = variantStats[0];
    const stats: KillBacktestSummary = {
      ...selected,
      name: selected.name,
      details: selected.details,
    };

    return {
      stats,
      modelPerformance,
      allCorrectModelPerformance,
      variantStats,
      selectedMode: selected.name,
      selectedModeLabel: selected.displayName,
      startIndex: start,
    };
  }

  private buildEngineWeights(
    performance: Map<string, any>,
  ): KillModelPerformance[] {
    const rows = Array.from(performance.entries()).map(([name, perf]) => {
      const avgAccuracy =
        perf.totalPredicted > 0 ? perf.totalCorrect / perf.totalPredicted : 0;
      const allCorrectRate =
        perf.samples > 0 ? perf.allCorrect / perf.samples : 0;
      const ninePlusRate = perf.samples > 0 ? perf.ninePlus / perf.samples : 0;
      const avgObjective = perf.samples > 0 ? perf.objective / perf.samples : 0;
      const stabilityPenalty = Math.max(0, perf.maxMisses - 1) * 0.03;
      const rawWeight = Math.max(
        0.01,
        avgObjective +
          Math.max(0, avgAccuracy - this.randomKillProb) * 1.5 +
          allCorrectRate * 0.35 +
          ninePlusRate * 0.1 -
          stabilityPenalty,
      );

      return {
        name,
        displayName: perf.displayName,
        weight: rawWeight,
        avgAccuracy,
        allCorrectRate,
        ninePlusRate,
        maxMisses: perf.maxMisses,
        samples: perf.samples,
      };
    });

    const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
    return rows
      .map((row) => ({
        ...row,
        weight: row.weight / total,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  private buildAllCorrectEngineWeights(
    performance: Map<string, any>,
  ): KillModelPerformance[] {
    const rows = Array.from(performance.entries()).map(([name, perf]) => {
      const avgAccuracy =
        perf.totalPredicted > 0 ? perf.totalCorrect / perf.totalPredicted : 0;
      const allCorrectRate =
        perf.samples > 0 ? perf.allCorrect / perf.samples : 0;
      const ninePlusRate = perf.samples > 0 ? perf.ninePlus / perf.samples : 0;
      const stabilityPenalty = Math.max(0, perf.maxMisses - 1) * 0.035;
      const rawWeight = Math.max(
        0.01,
        allCorrectRate * 0.52 +
          ninePlusRate * 0.2 +
          Math.max(0, avgAccuracy - this.randomKillProb) * 0.7 -
          stabilityPenalty,
      );

      return {
        name,
        displayName: perf.displayName,
        weight: rawWeight,
        avgAccuracy,
        allCorrectRate,
        ninePlusRate,
        maxMisses: perf.maxMisses,
        samples: perf.samples,
      };
    });

    const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
    return rows
      .map((row) => ({
        ...row,
        weight: row.weight / total,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  private selectEnginePredictions(
    models: KillModelOutput[],
    modelPerformance: KillModelPerformance[],
    hist: number[][],
    killCount: number,
  ) {
    const protectedNums = this.getFailurePatternProtection(hist);
    const modelByName = new Map(models.map((model) => [model.name, model]));
    const modelRankMaps = new Map<string, Map<number, number>>();
    for (const model of models) {
      modelRankMaps.set(
        model.name,
        new Map(model.candidates.map((c, i) => [c.n, i + 1])),
      );
    }

    const appearRows = new Map(
      this.getAppearFeatureRows(hist).map((row) => [row.n, row.features]),
    );
    const rows = [];

    for (let n = 1; n <= 49; n++) {
      if (protectedNums.has(n)) continue;

      let weightedScore = 0;
      let agreement = 0;
      const modelVotes: Record<string, number> = {};
      const reasons: string[] = [];

      for (const modelPerf of modelPerformance) {
        const model = modelByName.get(modelPerf.name);
        if (!model) continue;
        const candidate = model.candidates.find((c) => c.n === n);
        if (!candidate) continue;

        const rank = modelRankMaps.get(modelPerf.name)?.get(n) || 49;
        const topVote = rank <= killCount ? modelPerf.weight : 0;
        const rankBonus = Math.max(0, (50 - rank) / 49) * 0.08;
        weightedScore +=
          (candidate.killScore + rankBonus) * modelPerf.weight;
        agreement += topVote;
        modelVotes[modelPerf.name] =
          Math.round(candidate.killScore * 1000) / 1000;
        if (rank <= killCount) reasons.push(`${modelPerf.displayName}前${killCount}`);
      }

      const f = appearRows.get(n) || {};
      const hotPenalty =
        ((f.freq10 || 0) * 0.18 +
          (f.freq20 || 0) * 0.1 +
          (f.markov || this.randomAppearProb) * 0.04 +
          (f.knn || this.randomAppearProb) * 0.03) *
        0.35;
      const consensusBonus = agreement * 0.22;
      const score = weightedScore + consensusBonus - hotPenalty;

      if ((f.gapRatio || 1) >= 0.6 && (f.gapRatio || 1) <= 1.15) {
        reasons.push('遗漏区间相对安全');
      }
      if ((f.freq20 || 0) <= this.randomAppearProb) {
        reasons.push('近20期不热');
      }
      if (agreement >= 0.45) {
        reasons.push('多模型一致');
      }

      rows.push({
        n,
        score,
        agreement,
        modelVotes,
        reasons,
        features: f,
      });
    }

    rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.agreement - a.agreement ||
        (a.features.freq20 || 0) - (b.features.freq20 || 0),
    );

    return rows.slice(0, killCount).map((row, i) => {
      const appearProb = Math.max(
        0.02,
        Math.min(0.45, 1 - Math.max(0, Math.min(0.98, row.score))),
      );
      return {
        n: row.n,
        tier: i < 2 ? 'S1' : i < 4 ? 'S2' : 'S3',
        score: Math.round(Math.max(0, Math.min(0.98, row.score)) * 1000) / 1000,
        appearProb: Math.round(appearProb * 1000) / 1000,
        experts: 'Ensemble',
        repulsionScore: 0,
        aprioriScore: 0,
        risk: row.agreement >= 0.45 ? 'low' : row.agreement >= 0.25 ? 'mid' : 'watch',
        reasons: row.reasons.slice(0, 4),
        modelVotes: row.modelVotes,
        agreement: Math.round(row.agreement * 1000) / 1000,
        features: row.features,
      };
    });
  }

  private selectStrictHardEnginePredictions(
    models: KillModelOutput[],
    modelPerformance: KillModelPerformance[],
    hist: number[][],
    killCount: number,
  ) {
    const protectedNums = this.getFailurePatternProtection(hist);
    const modelByName = new Map(models.map((model) => [model.name, model]));
    const modelRankMaps = new Map<string, Map<number, number>>();
    for (const model of models) {
      modelRankMaps.set(
        model.name,
        new Map(model.candidates.map((c, i) => [c.n, i + 1])),
      );
    }

    const appearRows = new Map(
      this.getAppearFeatureRows(hist).map((row) => [row.n, row.features]),
    );
    const rows = [];

    for (let n = 1; n <= 49; n++) {
      if (protectedNums.has(n)) continue;

      let weightedScore = 0;
      let agreement = 0;
      let topVotes = 0;
      const modelVotes: Record<string, number> = {};
      const reasons: string[] = [];

      for (const modelPerf of modelPerformance) {
        const model = modelByName.get(modelPerf.name);
        if (!model) continue;
        const candidate = model.candidates.find((c) => c.n === n);
        if (!candidate) continue;

        const rank = modelRankMaps.get(modelPerf.name)?.get(n) || 49;
        const isTop = rank <= killCount;
        if (isTop) {
          agreement += modelPerf.weight;
          topVotes++;
          reasons.push(`${modelPerf.displayName}前${killCount}`);
        }

        const rankBonus = Math.max(0, (50 - rank) / 49) * 0.05;
        weightedScore += (candidate.killScore + rankBonus) * modelPerf.weight;
        modelVotes[modelPerf.name] =
          Math.round(candidate.killScore * 1000) / 1000;
      }

      const f = appearRows.get(n) || {};
      const hotPenalty =
        ((f.freq10 || 0) * 0.25 +
          (f.freq20 || 0) * 0.14 +
          (f.markov || this.randomAppearProb) * 0.04 +
          (f.knn || this.randomAppearProb) * 0.04) *
        0.52;
      const weakPenalty = agreement < 0.28 ? 0.12 : 0;
      const score =
        weightedScore + agreement * 0.42 + topVotes * 0.012 - hotPenalty - weakPenalty;

      if (agreement >= 0.45) reasons.push('多模型强一致');
      else if (agreement >= 0.28) reasons.push('多模型一致');
      if ((f.freq20 || 0) <= this.randomAppearProb) reasons.push('近20期不热');
      if ((f.gapRatio || 1) >= 0.6 && (f.gapRatio || 1) <= 1.15) {
        reasons.push('遗漏区间相对安全');
      }

      rows.push({
        n,
        score,
        agreement,
        topVotes,
        modelVotes,
        reasons,
        features: f,
      });
    }

    rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.agreement - a.agreement ||
        b.topVotes - a.topVotes ||
        (a.features.freq20 || 0) - (b.features.freq20 || 0),
    );

    let selected = rows
      .filter((row) => row.agreement >= 0.18)
      .slice(0, killCount);
    if (selected.length < killCount) {
      for (const row of rows) {
        if (!selected.find((s) => s.n === row.n)) selected.push(row);
        if (selected.length >= killCount) break;
      }
    }

    return selected.slice(0, killCount).map((row, i) => {
      const appearProb = Math.max(
        0.02,
        Math.min(0.45, 1 - Math.max(0, Math.min(0.98, row.score))),
      );
      return {
        n: row.n,
        tier: i < 2 ? 'S1' : i < 4 ? 'S2' : 'S3',
        score: Math.round(Math.max(0, Math.min(0.98, row.score)) * 1000) / 1000,
        appearProb: Math.round(appearProb * 1000) / 1000,
        experts: 'StrictHard',
        repulsionScore: 0,
        aprioriScore: 0,
        risk: row.agreement >= 0.45 ? 'low' : row.agreement >= 0.28 ? 'mid' : 'watch',
        reasons: row.reasons.slice(0, 4),
        modelVotes: row.modelVotes,
        agreement: Math.round(row.agreement * 1000) / 1000,
        features: row.features,
      };
    });
  }

  private runKillEngine(hist: number[][], killCount: number): KillEngineResult {
    const cacheKey = `${this.getHistArrayCacheKey(hist)}:${killCount}`;
    if (this.memoKillEngine.has(cacheKey)) {
      return this.memoKillEngine.get(cacheKey)!;
    }

    const backtest = this.backtestEngineModels(
      hist,
      killCount,
      10,
      Math.min(180, Math.max(60, Math.floor(hist.length * 0.18))),
    );
    if (!backtest) {
      const fallback = {
        predictions: this.getProbabilityKillPredictions(hist, killCount),
        stats: null,
        debug: {
          mode: 'probability-fallback',
          reason: 'history-too-short',
        },
      };
      this.memoKillEngine.set(cacheKey, fallback);
      return fallback;
    }

    const models = this.getEngineModelOutputs(hist);
    const finalModelPerformance =
      backtest.selectedMode === 'ensemble-strict-hard'
        ? backtest.allCorrectModelPerformance
        : backtest.modelPerformance;
    const predictions =
      backtest.selectedMode === 'ensemble-strict-hard'
        ? this.selectStrictHardEnginePredictions(
            models,
            backtest.allCorrectModelPerformance,
            hist,
            killCount,
          )
        : backtest.selectedMode === 'probability'
          ? this.getProbabilityKillPredictions(hist, killCount)
          : backtest.selectedMode === 'low-risk'
            ? this.getLowRiskKillPredictions(hist, killCount)
            : this.selectEnginePredictions(
                models,
                backtest.modelPerformance,
                hist,
                killCount,
              );
    const topWeight = finalModelPerformance[0]?.weight || 0;
    const entropy = finalModelPerformance.reduce(
      (sum, model) =>
        model.weight > 0 ? sum - model.weight * Math.log2(model.weight) : sum,
      0,
    );

    const result = {
      predictions,
      stats: backtest.stats,
      debug: {
        mode: 'adaptive-selector',
        selectedMode: backtest.selectedMode,
        selectedModeLabel: backtest.selectedModeLabel,
        killCount,
        evalStartIndex: backtest.startIndex,
        evalPeriods: backtest.stats.calcPeriods,
        backtestSummary: {
          name: backtest.stats.name,
          overallAccuracy:
            Math.round(backtest.stats.overallAccuracy * 10) / 10,
          allCorrectRate:
            Math.round(backtest.stats.allCorrectRate * 10) / 10,
          ninePlusRate: Math.round(backtest.stats.ninePlusRate * 10) / 10,
          totalCorrect: backtest.stats.totalCorrect,
          totalPredicted: backtest.stats.totalPredicted,
          allCorrectPeriods: backtest.stats.allCorrectPeriods,
          calcPeriods: backtest.stats.calcPeriods,
          randomLift:
            Math.round(backtest.stats.randomBaseline.lift * 10) / 10,
        },
        variantComparison: backtest.variantStats.map((variant) => ({
          name: variant.name,
          displayName: variant.displayName,
          selectorScore: Math.round(variant.selectorScore * 10) / 10,
          overallAccuracy: Math.round(variant.overallAccuracy * 10) / 10,
          allCorrectRate: Math.round(variant.allCorrectRate * 10) / 10,
          ninePlusRate: Math.round(variant.ninePlusRate * 10) / 10,
          maxMisses: variant.maxMisses,
          calcPeriods: variant.calcPeriods,
          killCount: variant.killCount,
        })),
        topModel: finalModelPerformance[0]?.name || '',
        topWeight: Math.round(topWeight * 1000) / 1000,
        modelEntropy: Math.round(entropy * 1000) / 1000,
        modelPerformance: finalModelPerformance.map((model) => ({
          name: model.name,
          displayName: model.displayName,
          weight: Math.round(model.weight * 1000) / 1000,
          avgAccuracy: Math.round(model.avgAccuracy * 10000) / 100,
          allCorrectRate: Math.round(model.allCorrectRate * 10000) / 100,
          ninePlusRate: Math.round(model.ninePlusRate * 10000) / 100,
          maxMisses: model.maxMisses,
          samples: model.samples,
        })),
        guardrails: {
          protectedCount: this.getFailurePatternProtection(hist).size,
          randomSingleKillAccuracy:
            Math.round(this.randomKillProb * 10000) / 100,
          randomAllCorrectRate:
            Math.round(this.getRandomAllKillRate(killCount) * 10000) / 100,
        },
      },
    };
    this.memoKillEngine.set(cacheKey, result);
    return result;
  }

  private getRecentHistoryKillCandidates(
    hist: number[][],
    window: number,
    limit = 10,
  ) {
    const protectedNums = this.getFailurePatternProtection(hist);
    const recentRows = hist.slice(Math.max(0, hist.length - window));
    const recentSet = new Set<number>();
    const lastSeenDistance: Record<number, number> = {};
    const recentHits: Record<number, number> = {};

    recentRows.forEach((row, rowIndex) => {
      const distance = recentRows.length - rowIndex;
      row.forEach((n) => {
        recentSet.add(n);
        recentHits[n] = (recentHits[n] || 0) + 1;
        lastSeenDistance[n] = Math.min(lastSeenDistance[n] || 99, distance);
      });
    });

    const rows = Array.from(recentSet)
      .filter((n) => !protectedNums.has(n))
      .map((n) => {
        let trials = 0;
        let success = 0;
        for (let i = window; i < hist.length; i++) {
          const prior = hist.slice(i - window, i);
          if (!prior.some((row) => row.includes(n))) continue;
          trials++;
          if (!hist[i].includes(n)) success++;
        }

        const successRate = trials > 0 ? success / trials : this.randomKillProb;
        const sampleStrength = Math.min(1, trials / 24);
        const recencyBonus = 1 / (lastSeenDistance[n] || window);
        const repeatPenalty = Math.max(0, (recentHits[n] || 1) - 1) * 0.035;
        const score =
          successRate * 0.72 +
          sampleStrength * 0.12 +
          recencyBonus * 0.12 -
          repeatPenalty;

        return {
          n,
          score,
          successRate,
          trials,
          lastSeenDistance: lastSeenDistance[n] || window,
          recentHits: recentHits[n] || 1,
        };
      });

    rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.successRate - a.successRate ||
        a.lastSeenDistance - b.lastSeenDistance ||
        a.n - b.n,
    );

    return rows.slice(0, limit).map((row, i) => ({
      n: row.n,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      score: Math.round(row.score * 1000) / 1000,
      appearProb: Math.round((1 - row.successRate) * 1000) / 1000,
      experts: `近${window}期筛选`,
      repulsionScore: 0,
      aprioriScore: 0,
      risk: row.successRate >= 0.9 ? 'low' : row.successRate >= 0.84 ? 'mid' : 'watch',
      source: 'history',
      reasons: [
        `近${window}期出现`,
        `历史杀中${Math.round(row.successRate * 100)}%`,
        `样本${row.trials}期`,
      ],
      features: {
        historyWindow: window,
        historySuccessRate: row.successRate,
        historyTrials: row.trials,
        lastSeenDistance: row.lastSeenDistance,
        recentHits: row.recentHits,
      },
    }));
  }

  private combineHybridKillPredictions(
    hist: number[][],
    modelPredictions: any[],
    window: number,
    historyCount: number,
    totalCount = 10,
  ) {
    const historyCandidates = this.getRecentHistoryKillCandidates(
      hist,
      window,
      historyCount,
    );
    const selected: any[] = [];
    const selectedSet = new Set<number>();

    const pushCandidate = (candidate: any, source: 'history' | 'prediction') => {
      if (!candidate || selectedSet.has(candidate.n)) {
        const existing = selected.find((item) => item.n === candidate?.n);
        if (existing && source === 'prediction') {
          existing.source = 'history+prediction';
          existing.experts = `${existing.experts}+模型`;
          existing.reasons = [...(existing.reasons || []), '模型同时入选'].slice(0, 5);
        }
        return;
      }
      selectedSet.add(candidate.n);
      selected.push({
        ...candidate,
        source,
        reasons:
          candidate.reasons?.length > 0
            ? candidate.reasons
            : [source === 'history' ? `近${window}期筛选` : '模型预测补位'],
      });
    };

    historyCandidates.forEach((candidate) => pushCandidate(candidate, 'history'));
    modelPredictions.forEach((candidate) => {
      if (selected.length < totalCount) pushCandidate(candidate, 'prediction');
    });

    if (selected.length < totalCount) {
      const fallbacks = this.getProbabilityKillPredictions(hist, totalCount * 2);
      fallbacks.forEach((candidate) => {
        if (selected.length < totalCount) pushCandidate(candidate, 'prediction');
      });
    }

    return selected.slice(0, totalCount).map((item, i) => ({
      ...item,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      blendRank: i + 1,
    }));
  }

  private getHybridBasePredictions(
    hist: number[][],
    baseModel: 'probability' | 'low-risk' | 'historical-learning',
    count = 14,
  ) {
    if (baseModel === 'historical-learning') {
      return this.getHistoricalLearningKillPredictions(hist, count);
    }
    return baseModel === 'low-risk'
      ? this.getLowRiskKillPredictions(hist, count)
      : this.getProbabilityKillPredictions(hist, count);
  }

  private backtestHybridKill10(
    hist: number[][],
    window: number,
    historyCount: number,
    baseModel: 'probability' | 'low-risk' | 'historical-learning',
    useRecentRiskGuard = false,
  ) {
    const displayPeriods = 10;
    const evalWindow = Math.min(160, Math.max(50, Math.floor(hist.length * 0.2)));
    const start = Math.max(40, hist.length - evalWindow);
    const baseLabel =
      baseModel === 'historical-learning'
        ? '历史学习'
        : baseModel === 'low-risk'
          ? '低风险'
          : '概率';
    const tracker = this.createVariantTracker(
      `混合10杀 近${window}期/${historyCount}+${10 - historyCount} ${baseLabel}补位${
        useRecentRiskGuard ? ' 风险过滤' : ''
      }`,
    );

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const modelPredictions = this.getHybridBasePredictions(
        subHist,
        baseModel,
        14,
      );
      const predictions = this.combineHybridKillPredictions(
        subHist,
        modelPredictions,
        window,
        historyCount,
        10,
      );
      const finalPredictions = useRecentRiskGuard
        ? this.applyRecentRiskGuard(
            subHist,
            predictions,
            window,
            historyCount,
            baseModel,
          )
        : predictions;
      this.addVariantResult(
        tracker,
        this.scoreKillPrediction(finalPredictions, new Set(hist[i])),
        hist[i],
        hist.length - i,
        i >= hist.length - displayPeriods,
      );
    }

    return this.summarizeVariantTracker(
      `hybrid-history-${window}-${historyCount}-${baseModel}${
        useRecentRiskGuard ? '-guarded' : ''
      }`,
      tracker,
      hist.length - start,
      10,
    );
  }

  private getRecentSelectionRisk(
    hist: number[][],
    window: number,
    historyCount: number,
    baseModel: 'probability' | 'low-risk' | 'historical-learning',
    lookback = 50,
  ) {
    const start = Math.max(40, hist.length - lookback);
    const risks = new Map<number, { appear: number; fail: number; rankSum: number }>();

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const modelPredictions = this.getHybridBasePredictions(subHist, baseModel, 20);
      const predictions = this.combineHybridKillPredictions(
        subHist,
        modelPredictions,
        window,
        historyCount,
        10,
      );
      const actualSet = new Set(hist[i]);

      predictions.forEach((prediction, idx) => {
        const current =
          risks.get(prediction.n) || { appear: 0, fail: 0, rankSum: 0 };
        current.appear++;
        current.rankSum += idx + 1;
        if (actualSet.has(prediction.n)) current.fail++;
        risks.set(prediction.n, current);
      });
    }

    return risks;
  }

  private applyRecentRiskGuard(
    hist: number[][],
    predictions: any[],
    window: number,
    historyCount: number,
    baseModel: 'probability' | 'low-risk' | 'historical-learning',
  ) {
    const totalCount = 10;
    const risks = this.getRecentSelectionRisk(hist, window, historyCount, baseModel, 50);
    const selected: any[] = [];
    const selectedSet = new Set<number>();

    const isHighRisk = (n: number) => {
      const risk = risks.get(n);
      if (!risk || risk.appear < 1) return false;
      const failRate = risk.fail / risk.appear;
      return risk.fail >= 3 || failRate >= 0.34;
    };

    const riskScore = (candidate: any) => {
      const risk = risks.get(candidate.n);
      if (!risk) return 0;
      const failRate = risk.appear > 0 ? risk.fail / risk.appear : 0;
      const avgRank = risk.appear > 0 ? risk.rankSum / risk.appear : 99;
      return failRate * 100 + risk.fail * 4 - risk.appear * 0.3 + (avgRank <= 3 ? 5 : 0);
    };

    for (const prediction of predictions) {
      if (isHighRisk(prediction.n)) continue;
      selected.push({
        ...prediction,
        guard: risks.get(prediction.n) || null,
      });
      selectedSet.add(prediction.n);
    }

    const pool = [
      ...predictions,
      ...this.getHybridBasePredictions(hist, 'probability', 30),
      ...this.getHybridBasePredictions(hist, 'low-risk', 30),
      ...this.getHistoricalLearningKillPredictions(hist, 30),
    ]
      .filter((candidate) => !selectedSet.has(candidate.n))
      .sort(
        (a, b) =>
          riskScore(a) - riskScore(b) ||
          (a.appearProb || this.randomAppearProb) -
            (b.appearProb || this.randomAppearProb),
      );

    for (const candidate of pool) {
      if (selected.length >= totalCount) break;
      selected.push({
        ...candidate,
        source: candidate.source || 'guard-fill',
        reasons:
          candidate.reasons?.length > 0
            ? [...candidate.reasons, '近期风险过滤补位'].slice(0, 5)
            : ['近期风险过滤补位'],
        guard: risks.get(candidate.n) || null,
      });
      selectedSet.add(candidate.n);
    }

    return selected.slice(0, totalCount).map((item, i) => ({
      ...item,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      guarded: true,
    }));
  }

  private getRecentBacktestStability(stats: { details?: any[] }) {
    const details = [...(stats.details || [])];
    if (details.length === 0) {
      return {
        recentAvg: 0,
        below90: 0,
        below80: 0,
        minAccuracy: 0,
        maxBelow90Streak: 0,
        stabilityScore: 0,
      };
    }

    details.sort((a, b) => b.periodOffset - a.periodOffset);
    let below90 = 0;
    let below80 = 0;
    let streak = 0;
    let maxBelow90Streak = 0;
    let total = 0;
    let minAccuracy = 100;

    for (const item of details) {
      const accuracy = item.accuracy || 0;
      total += accuracy;
      minAccuracy = Math.min(minAccuracy, accuracy);
      if (accuracy < 90) {
        below90++;
        streak++;
        maxBelow90Streak = Math.max(maxBelow90Streak, streak);
      } else {
        streak = 0;
      }
      if (accuracy < 80) below80++;
    }

    const recentAvg = total / details.length;
    const stabilityScore =
      recentAvg -
      below90 * 7 -
      below80 * 14 -
      maxBelow90Streak * 8 -
      Math.max(0, 90 - minAccuracy) * 0.65;

    return {
      recentAvg,
      below90,
      below80,
      minAccuracy,
      maxBelow90Streak,
      stabilityScore,
    };
  }

  private buildAdaptiveHybridKill10(hist: number[][], modelPredictions: any[]) {
    const cacheKey = `${hist.length}:${hist[hist.length - 1]?.join(',') || ''}`;
    if (this.memoHybridKill10.has(cacheKey)) {
      return this.memoHybridKill10.get(cacheKey);
    }

    if (hist.length < 60) {
      const fallback = {
        predictions: modelPredictions.slice(0, 10),
        stats: null,
        debug: {
          mode: 'model-only',
          reason: 'history-too-short',
          totalCount: 10,
          historyCount: 0,
          predictionCount: 10,
        },
      };
      this.memoHybridKill10.set(cacheKey, fallback);
      return fallback;
    }

    const variants = [];
    for (const baseModel of ['probability', 'low-risk', 'historical-learning'] as const) {
      for (const window of [1, 2, 3, 4, 5, 6]) {
        for (const historyCount of [2, 3, 4, 5, 6, 7]) {
          variants.push({
            baseModel,
            window,
            historyCount,
            guarded: false,
            stats: this.backtestHybridKill10(
              hist,
              window,
              historyCount,
              baseModel,
            ),
          });
        }
      }
    }
    variants.push({
      baseModel: 'probability' as const,
      window: 1,
      historyCount: 7,
      guarded: true,
      stats: this.backtestHybridKill10(hist, 1, 7, 'probability', true),
    });

    const variantsWithStability = variants.map((variant) => ({
      ...variant,
      stability: this.getRecentBacktestStability(variant.stats),
    }));

    variants.sort(
      (a, b) =>
        this.getRecentBacktestStability(b.stats).stabilityScore -
          this.getRecentBacktestStability(a.stats).stabilityScore ||
        b.stats.overallAccuracy - a.stats.overallAccuracy ||
        b.stats.ninePlusRate - a.stats.ninePlusRate ||
        b.stats.allCorrectRate - a.stats.allCorrectRate,
    );

    const best = variants[0];
    const bestStability = this.getRecentBacktestStability(best.stats);
    const selectedModelPredictions = this.getHybridBasePredictions(
      hist,
      best.baseModel,
      14,
    );
    const rawPredictions = this.combineHybridKillPredictions(
      hist,
      selectedModelPredictions.length > 0 ? selectedModelPredictions : modelPredictions,
      best.window,
      best.historyCount,
      10,
    );
    const predictions = best.guarded
      ? this.applyRecentRiskGuard(
          hist,
          rawPredictions,
          best.window,
          best.historyCount,
          best.baseModel,
        )
      : rawPredictions;
    const historyPicked = predictions.filter((p) =>
      String(p.source || '').includes('history'),
    ).length;

    const result = {
      predictions,
      stats: best.stats,
      debug: {
        mode: 'adaptive-hybrid-10',
        totalCount: 10,
        historyWindow: best.window,
        historyCount: best.historyCount,
        actualHistoryPicked: historyPicked,
        predictionCount: 10 - historyPicked,
        baseModel: best.baseModel,
        guarded: best.guarded,
        selectedVariant: best.stats.name,
        selectedLabel: best.stats.displayName,
        selectorScore: Math.round(best.stats.selectorScore * 10) / 10,
        stabilityScore: Math.round(bestStability.stabilityScore * 10) / 10,
        recentAvgAccuracy: Math.round(bestStability.recentAvg * 10) / 10,
        recentBelow90: bestStability.below90,
        recentBelow80: bestStability.below80,
        recentMinAccuracy: bestStability.minAccuracy,
        recentMaxBelow90Streak: bestStability.maxBelow90Streak,
        overallAccuracy: Math.round(best.stats.overallAccuracy * 10) / 10,
        allCorrectRate: Math.round(best.stats.allCorrectRate * 10) / 10,
        variants: variantsWithStability
          .sort((a, b) => b.stability.stabilityScore - a.stability.stabilityScore)
          .slice(0, 8)
          .map((variant) => ({
          window: variant.window,
          baseModel: variant.baseModel,
          guarded: variant.guarded,
          historyCount: variant.historyCount,
          predictionCount: 10 - variant.historyCount,
          selectorScore: Math.round(variant.stats.selectorScore * 10) / 10,
          stabilityScore: Math.round(variant.stability.stabilityScore * 10) / 10,
          recentAvgAccuracy: Math.round(variant.stability.recentAvg * 10) / 10,
          recentBelow90: variant.stability.below90,
          recentMinAccuracy: variant.stability.minAccuracy,
          overallAccuracy: Math.round(variant.stats.overallAccuracy * 10) / 10,
          allCorrectRate: Math.round(variant.stats.allCorrectRate * 10) / 10,
          ninePlusRate: Math.round(variant.stats.ninePlusRate * 10) / 10,
        })),
      },
    };
    this.memoHybridKill10.set(cacheKey, result);
    return result;
  }

  private getCoreKillPredictionForVariant(
    hist: number[][],
    variant: {
      kind: 'history' | 'model';
      window?: number;
      baseModel?: 'probability' | 'low-risk';
    },
  ) {
    if (variant.kind === 'history') {
      return this.getRecentHistoryKillCandidates(hist, variant.window || 1, 1)[0];
    }

    const modelPredictions = this.getHybridBasePredictions(
      hist,
      variant.baseModel || 'probability',
      1,
    );
    return modelPredictions[0]
      ? {
          ...modelPredictions[0],
          source: 'core-model',
          reasons: [
            variant.baseModel === 'low-risk' ? '低风险模型首位' : '概率模型首位',
          ],
        }
      : null;
  }

  private backtestCoreKillOne(
    hist: number[][],
    variant: {
      kind: 'history' | 'model';
      window?: number;
      baseModel?: 'probability' | 'low-risk';
      name: string;
      label: string;
    },
  ) {
    const displayPeriods = 10;
    const evalWindow = Math.min(50, Math.max(30, hist.length - 30));
    const start = Math.max(30, hist.length - evalWindow);
    const tracker = this.createVariantTracker(variant.label);

    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const prediction = this.getCoreKillPredictionForVariant(subHist, variant);
      const predictions = prediction ? [prediction] : [];
      this.addVariantResult(
        tracker,
        this.scoreKillPrediction(predictions, new Set(hist[i])),
        hist[i],
        hist.length - i,
        i >= hist.length - displayPeriods,
      );
    }

    return this.summarizeVariantTracker(
      variant.name,
      tracker,
      hist.length - start,
      1,
    );
  }

  private buildAdaptiveCoreKillOne(hist: number[][]) {
    const cacheKey = `${hist.length}:${hist[hist.length - 1]?.join(',') || ''}`;
    if (this.memoCoreKillOne.has(cacheKey)) {
      return this.memoCoreKillOne.get(cacheKey);
    }

    if (hist.length < 40) {
      const fallbackPrediction = this.getProbabilityKillPredictions(hist, 1)[0] || null;
      const fallback = {
        prediction: fallbackPrediction,
        stats: null,
        debug: {
          mode: 'core-model-only',
          reason: 'history-too-short',
        },
      };
      this.memoCoreKillOne.set(cacheKey, fallback);
      return fallback;
    }

    const variants: Array<{
      kind: 'history' | 'model';
      window?: number;
      baseModel?: 'probability' | 'low-risk';
      name: string;
      label: string;
      stats?: any;
    }> = [];

    for (const window of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
      variants.push({
        kind: 'history',
        window,
        name: `core-history-${window}`,
        label: `核心一杀 近${window}期历史筛选`,
      });
    }

    variants.push(
      {
        kind: 'model',
        baseModel: 'probability',
        name: 'core-probability',
        label: '核心一杀 概率模型',
      },
      {
        kind: 'model',
        baseModel: 'low-risk',
        name: 'core-low-risk',
        label: '核心一杀 低风险模型',
      },
    );

    const scoredVariants = variants.map((variant) => ({
      ...variant,
      stats: this.backtestCoreKillOne(hist, variant),
    }));

    scoredVariants.sort(
      (a, b) =>
        b.stats.overallAccuracy - a.stats.overallAccuracy ||
        b.stats.allCorrectRate - a.stats.allCorrectRate ||
        b.stats.selectorScore - a.stats.selectorScore,
    );

    const best = scoredVariants[0];
    const prediction = this.getCoreKillPredictionForVariant(hist, best);
    const result = {
      prediction: prediction
        ? {
            ...prediction,
            tier: 'CORE',
            source: best.kind === 'history' ? 'core-history' : 'core-model',
          }
        : null,
      stats: best.stats,
      debug: {
        mode: 'adaptive-core-one',
        selectedVariant: best.name,
        selectedLabel: best.label,
        historyWindow: best.window || null,
        baseModel: best.baseModel || null,
        accuracy: Math.round(best.stats.overallAccuracy * 10) / 10,
        samples: best.stats.calcPeriods,
        variants: scoredVariants.slice(0, 6).map((variant) => ({
          name: variant.name,
          label: variant.label,
          accuracy: Math.round(variant.stats.overallAccuracy * 10) / 10,
          samples: variant.stats.calcPeriods,
        })),
      },
    };

    this.memoCoreKillOne.set(cacheKey, result);
    return result;
  }

  private getSpecialWeightCandidates(): SpecialWeights[] {
    const presets: SpecialWeights[] = [
      {
        name: 'special-balanced',
        freq5: 0.08,
        freq10: 0.12,
        freq20: 0.16,
        freq50: 0.16,
        longFreq: 0.12,
        gapDue: 0.14,
        specialMarkov: 0.1,
        rowToSpecial: 0.09,
        tailTrend: 0.03,
      },
      {
        name: 'special-recent',
        freq5: 0.18,
        freq10: 0.2,
        freq20: 0.18,
        freq50: 0.1,
        longFreq: 0.06,
        gapDue: 0.1,
        specialMarkov: 0.08,
        rowToSpecial: 0.07,
        tailTrend: 0.03,
      },
      {
        name: 'special-midfreq',
        freq5: 0.04,
        freq10: 0.08,
        freq20: 0.16,
        freq50: 0.24,
        longFreq: 0.18,
        gapDue: 0.12,
        specialMarkov: 0.08,
        rowToSpecial: 0.06,
        tailTrend: 0.04,
      },
      {
        name: 'special-gap',
        freq5: 0.04,
        freq10: 0.06,
        freq20: 0.1,
        freq50: 0.12,
        longFreq: 0.1,
        gapDue: 0.34,
        specialMarkov: 0.12,
        rowToSpecial: 0.08,
        tailTrend: 0.04,
      },
      {
        name: 'special-transition',
        freq5: 0.04,
        freq10: 0.08,
        freq20: 0.1,
        freq50: 0.12,
        longFreq: 0.08,
        gapDue: 0.1,
        specialMarkov: 0.25,
        rowToSpecial: 0.19,
        tailTrend: 0.04,
      },
    ];

    return presets.map((weights) => {
      const { name, ...rest } = weights;
      const sum = Object.values(rest).reduce((s, v) => s + v, 0) || 1;
      const normalized: any = { name };
      for (const [key, value] of Object.entries(rest)) {
        normalized[key] = value / sum;
      }
      return normalized as SpecialWeights;
    });
  }

  private getSpecialFeatureRows(hist: number[][]): SpecialScore[] {
    const hn = hist.length;
    if (hn === 0) return [];

    const specialSeq = hist.map((row) => row[6]);
    const specialApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) specialApps[specialSeq[i]].push(i);

    const countSpecialWindow = (n: number, window: number) => {
      let count = 0;
      for (let i = Math.max(0, hn - window); i < hn; i++) {
        if (specialSeq[i] === n) count++;
      }
      return count / Math.min(window, hn);
    };

    const markovCounts = Array(50)
      .fill(0)
      .map(() => Array(50).fill(0));
    const markovBase = Array(50).fill(0);
    for (let i = 0; i < hn - 1; i++) {
      markovBase[specialSeq[i]]++;
      markovCounts[specialSeq[i]][specialSeq[i + 1]]++;
    }

    const rowToSpecial = Array(50)
      .fill(0)
      .map(() => Array(50).fill(0));
    const rowSource = new Array(50).fill(0);
    for (let i = 0; i < hn - 1; i++) {
      for (const source of hist[i]) {
        rowSource[source]++;
        rowToSpecial[source][specialSeq[i + 1]]++;
      }
    }

    const lastSpecial = specialSeq[hn - 1];
    const lastRow = hist[hn - 1];
    const tailCounts = Array(10).fill(0);
    for (let i = Math.max(0, hn - 80); i < hn; i++) tailCounts[specialSeq[i] % 10]++;
    const maxTail = Math.max(...tailCounts, 1);

    const rows: SpecialScore[] = [];
    for (let n = 1; n <= 49; n++) {
      const apps = specialApps[n];
      const lastSeen = apps.length > 0 ? apps[apps.length - 1] : -1;
      const currentGap = lastSeen >= 0 ? hn - 1 - lastSeen : hn;
      const gaps: number[] = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap =
        gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 49;
      const gapRatio = avgGap > 0 ? currentGap / avgGap : 1;
      const gapDue = Math.max(0, 1 - Math.abs(gapRatio - 1) / 1.8);
      const specialMarkov =
        markovBase[lastSpecial] > 0
          ? markovCounts[lastSpecial][n] / markovBase[lastSpecial]
          : 1 / 49;
      let rowTransition = 0;
      let validSources = 0;
      for (const source of lastRow) {
        if (rowSource[source] > 0) {
          rowTransition += rowToSpecial[source][n] / rowSource[source];
          validSources++;
        }
      }
      rowTransition = validSources > 0 ? rowTransition / validSources : 1 / 49;

      rows.push({
        n,
        score: 0,
        probability: 0,
        features: {
          freq5: countSpecialWindow(n, 5),
          freq10: countSpecialWindow(n, 10),
          freq20: countSpecialWindow(n, 20),
          freq50: countSpecialWindow(n, 50),
          longFreq: apps.length / hn,
          gapDue,
          specialMarkov,
          rowToSpecial: rowTransition,
          tailTrend: tailCounts[n % 10] / maxTail,
        },
      });
    }

    return rows;
  }

  private scoreSpecialRows(rows: SpecialScore[], weights: SpecialWeights) {
    const scored = rows.map((row) => {
      const f = row.features;
      const score =
        weights.freq5 * f.freq5 +
        weights.freq10 * f.freq10 +
        weights.freq20 * f.freq20 +
        weights.freq50 * f.freq50 +
        weights.longFreq * f.longFreq +
        weights.gapDue * f.gapDue +
        weights.specialMarkov * f.specialMarkov +
        weights.rowToSpecial * f.rowToSpecial +
        weights.tailTrend * f.tailTrend;
      return {
        ...row,
        score,
        probability: Math.max(0.005, Math.min(0.18, score)),
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private trainSpecialWeights(hist: number[][], count = 20) {
    const candidates = this.getSpecialWeightCandidates();
    if (hist.length < 120) {
      return {
        weights: candidates[0],
        leaderboard: [],
        evalPeriods: 0,
      };
    }

    const evalWindow = Math.min(240, hist.length - 80);
    const start = hist.length - evalWindow;
    const leaderboard = candidates
      .map((weights) => {
        let hit = 0;
        let top10 = 0;
        let rankSum = 0;
        let evalPeriods = 0;
        for (let i = start; i < hist.length; i++) {
          const subHist = hist.slice(0, i);
          const actual = hist[i][6];
          const ranked = this.scoreSpecialRows(
            this.getSpecialFeatureRows(subHist),
            weights,
          );
          const rank = ranked.findIndex((row) => row.n === actual) + 1;
          if (rank > 0 && rank <= count) hit++;
          if (rank > 0 && rank <= 10) top10++;
          rankSum += rank || 50;
          evalPeriods++;
        }

        return {
          weights,
          hitRate: evalPeriods > 0 ? hit / evalPeriods : 0,
          top10Rate: evalPeriods > 0 ? top10 / evalPeriods : 0,
          avgRank: evalPeriods > 0 ? rankSum / evalPeriods : 50,
          evalPeriods,
        };
      })
      .sort(
        (a, b) =>
          b.hitRate - a.hitRate ||
          b.top10Rate - a.top10Rate ||
          a.avgRank - b.avgRank,
      );

    return {
      weights: leaderboard[0].weights,
      leaderboard: leaderboard.slice(0, 5).map((item) => ({
        name: item.weights.name,
        hitRate: Math.round(item.hitRate * 1000) / 10,
        top10Rate: Math.round(item.top10Rate * 1000) / 10,
        avgRank: Math.round(item.avgRank * 10) / 10,
      })),
      evalPeriods: leaderboard[0].evalPeriods,
    };
  }

  private getSpecialCodePrediction(hist: number[][], count = 20, backtestPeriods = 15) {
    const trainCount = Math.min(20, count);
    const trained = this.trainSpecialWeights(hist, trainCount);
    const predictions = this.scoreSpecialRows(
      this.getSpecialFeatureRows(hist),
      trained.weights,
    )
      .slice(0, count)
      .map((row, i) => ({
        n: row.n,
        rank: i + 1,
        score: Math.round(row.score * 10000) / 10000,
        probability: Math.round(row.probability * 1000) / 1000,
        tier: i < 5 ? 'S1' : i < 10 ? 'S2' : 'S3',
        features: row.features,
      }));

    const details = [];
    let hits = 0;
    let top10Hits = 0;
    const start = Math.max(80, hist.length - backtestPeriods);
    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const subTrained = this.trainSpecialWeights(subHist, trainCount);
      const ranked = this.scoreSpecialRows(
        this.getSpecialFeatureRows(subHist),
        subTrained.weights,
      );
      const predicted = ranked.slice(0, count).map((row) => row.n);
      const actual = hist[i][6];
      const hit = predicted.includes(actual);
      const rank = ranked.findIndex((row) => row.n === actual) + 1;
      if (hit) hits++;
      if (rank > 0 && rank <= 10) top10Hits++;
      details.push({
        periodOffset: hist.length - i,
        predicted,
        actual,
        hit,
        rank,
      });
    }

    details.reverse();
    const calcPeriods = details.length;
    return {
      count,
      trainCount,
      predictions,
      backtest: {
        details,
        calcPeriods,
        hits,
        hitRate: calcPeriods > 0 ? (hits / calcPeriods) * 100 : 0,
        top10Hits,
        top10HitRate: calcPeriods > 0 ? (top10Hits / calcPeriods) * 100 : 0,
        randomBaseline: (count / 49) * 100,
      },
      training: {
        selectedWeights: trained.weights.name,
        evalPeriods: trained.evalPeriods,
        leaderboard: trained.leaderboard,
      },
    };
  }

  // --- FAILURE PATTERN PROTECTION ---
  private getFailurePatternProtection(hist: number[][]): Set<number> {
    const protectedNums = new Set<number>();
    if (hist.length < 30) return protectedNums;

    const hn = hist.length;
    const lastRow = new Set(hist[hn - 1]);
    const prevRow = new Set(hist[hn - 2]);
    const prevPrevRow = hn >= 3 ? new Set(hist[hn - 3]) : new Set<number>();

    // Build appearance index once
    const allApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) {
      for (const num of hist[i]) allApps[num].push(i);
    }

    for (let n = 1; n <= 49; n++) {
      // Pattern 1: Bounce-back (appeared 2 ago, missing last 2, historically >20% bounce rate)
      if (prevPrevRow.has(n) && !prevRow.has(n) && !lastRow.has(n)) {
        let bounceCount = 0,
          patternCount = 0;
        for (let i = 2; i < hn - 1; i++) {
          if (
            hist[i - 2].includes(n) &&
            !hist[i - 1].includes(n) &&
            !hist[i].includes(n)
          ) {
            patternCount++;
            if (hist[i + 1].includes(n)) bounceCount++;
          }
        }
        if (patternCount >= 5 && bounceCount / patternCount > 0.2) {
          protectedNums.add(n);
        }
      }

      // Pattern 2: Regular-cycle numbers that are "due"
      const apps = allApps[n];
      if (apps.length >= 5) {
        const gaps: number[] = [];
        for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const stdDev = Math.sqrt(
          gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length,
        );
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        const currentGap = hn - 1 - apps[apps.length - 1];
        if (
          cv < 0.4 &&
          currentGap >= avgGap * 0.8 &&
          currentGap <= avgGap * 1.3
        ) {
          protectedNums.add(n);
        }
      }
    }
    return protectedNums;
  }

  // --- CROSS-PERIOD REPULSION MATRIX ---
  // Builds a 49x49 cross-period co-occurrence matrix (period T numbers → period T+1 numbers).
  // Returns a score array [0..49] where higher score = stronger repulsion from last row.
  private getCrossPerioRepulsionScores(
    hist: number[][],
    threshold = 0.1,
  ): number[] {
    const key = `${hist.length}-${threshold}`;
    if (this.memoCrossRepulsion.has(key))
      return this.memoCrossRepulsion.get(key);
    const res = this.getCrossPerioRepulsionScoresInternal(hist, threshold);
    this.memoCrossRepulsion.set(key, res);
    return res;
  }
  private getCrossPerioRepulsionScoresInternal(
    hist: number[][],
    threshold = 0.1,
  ): number[] {
    const scores = new Array(50).fill(0);
    if (hist.length < 5) return scores;

    // Build raw co-occurrence counts: coMatrix[a][b] = times 'a' in period T && 'b' in period T+1
    const coMatrix = Array(50)
      .fill(0)
      .map(() => Array(50).fill(0));
    const srcCounts = Array(50).fill(0); // how many periods each number appeared as source

    for (let i = 0; i < hist.length - 1; i++) {
      const curr = hist[i];
      const next = hist[i + 1];
      for (const a of curr) {
        srcCounts[a]++;
        for (const b of next) {
          coMatrix[a][b]++;
        }
      }
    }

    // Normalize to probabilities
    const probMatrix = Array(50)
      .fill(0)
      .map(() => Array(50).fill(0));
    for (let a = 1; a <= 49; a++) {
      if (srcCounts[a] > 0) {
        for (let b = 1; b <= 49; b++) {
          probMatrix[a][b] = coMatrix[a][b] / srcCounts[a];
        }
      }
    }

    // For each candidate number b, compute avg transition prob from last row
    // Random expectation ≈ 7/49 ≈ 0.143
    const lastRow = hist[hist.length - 1];
    const randomExpect = 7 / 49;

    for (let b = 1; b <= 49; b++) {
      let avgProb = 0;
      let validSources = 0;
      for (const a of lastRow) {
        if (srcCounts[a] >= 3) {
          // only trust sources with enough data
          avgProb += probMatrix[a][b];
          validSources++;
        }
      }
      if (validSources > 0) {
        avgProb /= validSources;
        // Repulsion score: how much below random expectation
        // If avgProb < threshold, this number is being actively repulsed
        if (avgProb < threshold) {
          // Score is proportional to how far below threshold
          scores[b] = ((threshold - avgProb) / threshold) * 10;
        }
      }
    }
    return scores;
  }

  // --- APRIORI-STYLE ASSOCIATION RULE MINING ---
  // Mines rules of the form: {A, B} in period T → ¬C in period T+1
  // Returns { scores: number[50], rules: {pair, target, support, confidence}[] }
  private getAprioriRepulsionRules(hist: number[][]): {
    scores: number[];
    rules: any[];
  } {
    const key = hist.length;
    if (this.memoApriori.has(key)) return this.memoApriori.get(key);
    const res = this.getAprioriRepulsionRulesInternal(hist);
    this.memoApriori.set(key, res);
    return res;
  }
  private getAprioriRepulsionRulesInternal(hist: number[][]): {
    scores: number[];
    rules: any[];
  } {
    const scores = new Array(50).fill(0);
    const rules: any[] = [];
    if (hist.length < 10) return { scores, rules };

    const MIN_SUPPORT = 4;
    const MIN_LIFT_ABOVE_RANDOM = 0.03;
    const lastRow = hist[hist.length - 1];
    const lastRowSet = new Set(lastRow);

    // Step 1: Find all 2-number combinations that appear in at least MIN_SUPPORT periods
    // and are present in the last row (so they're relevant for prediction)
    const pairOccurrences: Map<string, number[]> = new Map();

    for (let i = 0; i < hist.length - 1; i++) {
      const row = hist[i];
      // Generate all pairs from this row
      for (let x = 0; x < row.length; x++) {
        for (let y = x + 1; y < row.length; y++) {
          const a = Math.min(row[x], row[y]);
          const b = Math.max(row[x], row[y]);
          // Only track pairs where BOTH numbers are in the last row
          if (!lastRowSet.has(a) || !lastRowSet.has(b)) continue;
          const key = `${a},${b}`;
          if (!pairOccurrences.has(key)) pairOccurrences.set(key, []);
          pairOccurrences.get(key)!.push(i);
        }
      }
    }

    // Step 2: For each frequent pair, compute conf({A,B} → ¬C) for each target C
    for (const [pairKey, indices] of Array.from(pairOccurrences.entries())) {
      if (indices.length < MIN_SUPPORT) continue;

      const [a, b] = pairKey.split(',').map(Number);
      // Count how many times each target C appeared in the NEXT period after this pair
      const nextAppearCount: Record<number, number> = {};
      for (const idx of indices) {
        if (idx + 1 < hist.length) {
          for (const c of hist[idx + 1]) {
            nextAppearCount[c] = (nextAppearCount[c] || 0) + 1;
          }
        }
      }

      const totalNextPeriods = indices.filter(
        (idx) => idx + 1 < hist.length,
      ).length;
      if (totalNextPeriods < MIN_SUPPORT) continue;

      // For each candidate target, compute repulsion confidence
      for (let c = 1; c <= 49; c++) {
        const appeared = nextAppearCount[c] || 0;
        const notAppeared = totalNextPeriods - appeared;
        const confidence = notAppeared / totalNextPeriods;
        const liftAboveRandom = confidence - this.randomKillProb;

        if (liftAboveRandom >= MIN_LIFT_ABOVE_RANDOM) {
          rules.push({
            pair: [a, b],
            target: c,
            support: totalNextPeriods,
            confidence: Math.round(confidence * 1000) / 1000,
            lift: Math.round(liftAboveRandom * 1000) / 1000,
          });
          // Accumulate score: higher confidence & support = stronger kill signal
          scores[c] +=
            liftAboveRandom * confidence * Math.log2(totalNextPeriods + 1);
        }
      }
    }

    // Normalize scores to 0-10 range
    const maxScore = Math.max(...scores.slice(1), 0.001);
    for (let i = 1; i <= 49; i++) {
      scores[i] = (scores[i] / maxScore) * 10;
    }

    // Sort rules by confidence desc, then support desc
    rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);

    return { scores, rules: rules.slice(0, 30) }; // Return top 30 rules for display
  }

  private strategyServerSide(hist: number[][]): {
    predictions: any[];
    repulsionInfo: any;
  } {
    if (this.memoStrategy.has(hist.length))
      return this.memoStrategy.get(hist.length);
    const res = this.strategyServerSideInternal(hist);
    this.memoStrategy.set(hist.length, res);
    return res;
  }

  private strategyServerSideInternal(hist: number[][]): {
    predictions: any[];
    repulsionInfo: any;
  } {
    const opts = this.getAdaptiveKill10Opts(hist);
    const weights = this.getDynamicExpertWeights(hist, opts);

    // ========== PHASE 1: Each expert independently provides kill probabilities ==========
    const expertScores: Record<string, number[]> = {
      frequency: new Array(50).fill(0),
      repulsion: new Array(50).fill(0),
      knn: this.getKnnPredictionsMemo(hist, 30),
      markov: this.getMarkovPredictions(hist),
      markov2: this.getMarkov2PredictionsMemo(hist),
      bayes: this.getNaiveBayesKillProbMemo(hist),
    };

    // Convert frequency & repulsion into "kill probabilities"
    // For frequency, lower weight = higher kill probability
    const { candidates: baseCandidates } = this.buildScoreEngineWithOpts(
      hist,
      opts,
    );
    const maxW = Math.max(...baseCandidates.map((c) => c.w), 1);
    baseCandidates.forEach((c) => {
      expertScores.frequency[c.n] = 1 - c.w / maxW;
    });

    const repulsionCandidates = this.getRepulsionAdjustedCandidates(hist, opts);
    const repWs = repulsionCandidates.map((c) => c.w);
    const maxRepW = Math.max(...repWs, 1);
    const minRepW = Math.min(...repWs);
    repulsionCandidates.forEach((c) => {
      // Use normalized score (lower w = higher kill prob)
      expertScores.repulsion[c.n] = (maxRepW - c.w) / (maxRepW - minRepW || 1);
    });

    // ========== PHASE 2: Ensemble Scoring (Soft Voting) ==========
    const finalScores = new Array(50).fill(0);
    const expertNames: Record<number, string[]> = {};
    for (let i = 1; i <= 49; i++) expertNames[i] = [];

    for (let n = 1; n <= 49; n++) {
      for (const [expert, weight] of Object.entries(weights)) {
        const score = expertScores[expert][n];
        // For Markov/KNN, high prob means "likely to appear", so kill prob is 1 - prob
        const killProb =
          expert === 'knn' || expert === 'markov' || expert === 'markov2'
            ? 1 - score
            : score;

        finalScores[n] += killProb * (weight as number);

        if (killProb > 0.7) {
          // Threshold for display
          expertNames[n].push(this.getExpertDisplayName(expert));
        }
      }
    }

    // ========== PHASE 3: Failure pattern protection ==========
    const protectedNums = this.getFailurePatternProtection(hist);

    // ========== PHASE 4: Ranking & Selection ==========
    const repulsionThreshold = opts.repulsionThreshold || 0.1;
    const repulsionScores = this.getCrossPerioRepulsionScores(
      hist,
      repulsionThreshold,
    );
    const aprioriResult = this.getAprioriRepulsionRules(hist);
    const trainedAppear = this.getTrainedAppearWeights(hist);

    let allCandidates = Array.from({ length: 49 }, (_, i) => ({
      n: i + 1,
      score:
        finalScores[i + 1] +
        (repulsionScores[i + 1] || 0) * 0.015 +
        (aprioriResult.scores[i + 1] || 0) * 0.02,
      experts: expertNames[i + 1],
      isProtected: protectedNums.has(i + 1),
      repulsionScore: repulsionScores[i + 1] || 0,
      aprioriScore: aprioriResult.scores[i + 1] || 0,
    }));

    // Sort by final ensemble score
    let selected = allCandidates
      .filter((c) => !c.isProtected)
      .sort((a, b) => b.score - a.score);

    const ensembleNums = selected.slice(0, 10).map((c, i) => ({
      n: c.n,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      score: Math.round(c.score * 100) / 100,
      experts: c.experts.length > 0 ? c.experts.join('+') : '综合',
      repulsionScore: Math.round(c.repulsionScore * 100) / 100,
      aprioriScore: Math.round(c.aprioriScore * 100) / 100,
    }));
    const probabilityNums = this.getProbabilityKillPredictions(hist, 10);

    // Build repulsionInfo for frontend
    const repulsionInfo = {
      optimizedParams: {
        repulsionWeight: opts.repulsionWeight,
        aprioriWeight: opts.aprioriWeight,
        repulsionThreshold: opts.repulsionThreshold,
      },
      expertWeights: weights,
      topRepulsedNumbers: allCandidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 15)
        .map((x) => ({
          n: x.n,
          score: Math.round(x.score * 100) / 100,
          experts: x.experts.join('+'),
        })),
      aprioriRules: aprioriResult.rules,
      protectedCount: protectedNums.size,
      probabilityModel: {
        topLowestAppear: probabilityNums.map((p) => ({
          n: p.n,
          appearProb: p.appearProb,
          killConfidence: p.score,
        })),
        trainedWeights: trainedAppear.weights,
        trainingScore: trainedAppear.score,
        leaderboard: trainedAppear.leaderboard,
      },
      ensemblePreview: ensembleNums,
    };

    return {
      predictions: probabilityNums,
      repulsionInfo,
    };
  }

  private getExpertDisplayName(name: string): string {
    const map: any = {
      frequency: '频率',
      repulsion: '排斥',
      knn: 'KNN',
      markov: '马尔可夫',
      markov2: '马2',
      bayes: '贝叶斯',
    };
    return map[name] || name;
  }

  private getDynamicExpertWeights(hist: number[][], opts: PredictorOpts) {
    const key = hist.length;
    if (this.memoExpertWeights.has(key)) return this.memoExpertWeights.get(key);

    const evalWindow = 30; // Evaluate last 30 periods
    const experts = [
      'frequency',
      'repulsion',
      'knn',
      'markov',
      'markov2',
      'bayes',
    ];
    const performance: any = {};
    experts.forEach((e) => (performance[e] = 0));

    const start = Math.max(50, hist.length - evalWindow);
    let totalEval = 0;

    for (let i = start; i < hist.length - 1; i++) {
      const subHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);

      // Get each expert's top 10 kill suggestions
      const kills: any = {
        frequency: this.kill10WithOptsMemo(subHist, opts).map((c) => c.n),
        repulsion: this.kill10WithRepulsionMemo(subHist, opts).map((c) => c.n),
        knn: Array.from({ length: 49 }, (_, k) => ({
          n: k + 1,
          p: this.getKnnPredictionsMemo(subHist, 30)[k + 1],
        }))
          .sort((a, b) => a.p - b.p)
          .slice(0, 10)
          .map((c) => c.n),
        markov: Array.from({ length: 49 }, (_, k) => ({
          n: k + 1,
          p: this.getMarkovPredictions(subHist)[k + 1],
        }))
          .sort((a, b) => a.p - b.p)
          .slice(0, 10)
          .map((c) => c.n),
        markov2: Array.from({ length: 49 }, (_, k) => ({
          n: k + 1,
          p: this.getMarkov2PredictionsMemo(subHist)[k + 1],
        }))
          .sort((a, b) => a.p - b.p)
          .slice(0, 10)
          .map((c) => c.n),
        bayes: Array.from({ length: 49 }, (_, k) => ({
          n: k + 1,
          p: this.getNaiveBayesKillProbMemo(subHist)[k + 1],
        }))
          .sort((a, b) => b.p - a.p)
          .slice(0, 10)
          .map((c) => c.n),
      };

      for (const expert of experts) {
        performance[expert] += this.scoreKillSelection(kills[expert], nextRow);
      }
      totalEval++;
    }

    const weights: any = {};
    let sum = 0;
    for (const expert of experts) {
      const avgScore = totalEval > 0 ? performance[expert] / totalEval : 0;
      weights[expert] = Math.pow(Math.max(0, avgScore), 2);
      sum += weights[expert];
    }

    // Normalize weights
    for (const expert of experts) {
      weights[expert] = sum > 0 ? weights[expert] / sum : 1 / experts.length;
    }

    this.memoExpertWeights.set(key, weights);
    return weights;
  }

  private runBacktest(hist: number[][], displayPeriods = 10, calcPeriods = 50) {
    const actualCalcPeriods = Math.min(hist.length, calcPeriods);
    if (hist.length <= actualCalcPeriods) return null;
    const results = [];
    let totalCorrect = 0;
    let totalPredicted = 0;
    const startIndex = hist.length - actualCalcPeriods;

    for (let i = startIndex; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const actualRow = hist[i];
      const actualSet = new Set(actualRow);
      const { predictions: killNumsObj } = this.strategyServerSide(subHist);
      const killNums = killNumsObj.map((k) => k.n);
      const failed = killNums.filter((n) => actualSet.has(n));
      const correctCount = killNums.length - failed.length;
      totalCorrect += correctCount;
      totalPredicted += killNums.length;

      if (i >= hist.length - displayPeriods) {
        results.push({
          periodOffset: hist.length - i,
          predicted: killNums,
          actual: actualRow,
          failed,
          correctCount,
          accuracy: (correctCount / killNums.length) * 100,
        });
      }
    }
    results.reverse();
    const overallAccuracy =
      totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
    return {
      details: results,
      overallAccuracy,
      totalCorrect,
      totalPredicted,
      calcPeriods: actualCalcPeriods,
    };
  }

  private runProbabilityBacktest(
    hist: number[][],
    displayPeriods = 10,
    startIndex = 80,
    killCount = 10,
  ) {
    if (hist.length <= startIndex) return null;

    const results = [];
    let totalCorrect = 0;
    let totalPredicted = 0;
    let allCorrectPeriods = 0;
    let ninePlusPeriods = 0;
    const actualStartIndex = Math.max(
      10,
      Math.min(startIndex, hist.length - 1),
    );
    let trained = this.getTrainedAppearWeights(hist.slice(0, actualStartIndex));

    for (let i = actualStartIndex; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      if (i === actualStartIndex || (i - actualStartIndex) % 20 === 0) {
        trained = this.getTrainedAppearWeights(subHist);
      }
      const actualRow = hist[i];
      const actualSet = new Set(actualRow);
      const killNumsObj = this.getProbabilityKillPredictionsWithWeights(
        subHist,
        trained.weights,
        killCount,
      );
      const killNums = killNumsObj.map((k) => k.n);
      const failed = killNums.filter((n) => actualSet.has(n));
      const correctCount = killNums.length - failed.length;
      totalCorrect += correctCount;
      totalPredicted += killNums.length;
      if (failed.length === 0) allCorrectPeriods++;
      if (failed.length <= 1) ninePlusPeriods++;

      if (i >= hist.length - displayPeriods) {
        results.push({
          periodOffset: hist.length - i,
          predicted: killNums,
          actual: actualRow,
          failed,
          correctCount,
          accuracy: (correctCount / killNums.length) * 100,
        });
      }
    }

    results.reverse();
    const calcPeriods = hist.length - actualStartIndex;
    const overallAccuracy =
      totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
    const allCorrectRate =
      calcPeriods > 0 ? (allCorrectPeriods / calcPeriods) * 100 : 0;
    const ninePlusRate =
      calcPeriods > 0 ? (ninePlusPeriods / calcPeriods) * 100 : 0;
    const randomAllCorrectRate = this.getRandomAllKillRate(killCount) * 100;

    return {
      name: 'probability',
      details: results,
      overallAccuracy,
      allCorrectPeriods,
      allCorrectRate,
      ninePlusPeriods,
      ninePlusRate,
      totalCorrect,
      totalPredicted,
      calcPeriods,
      killCount,
      startIndex: actualStartIndex,
      training: {
        retrainEvery: 20,
        latestWeights: trained.weights,
        latestScore: trained.score,
        latestLeaderboard: trained.leaderboard,
      },
      randomBaseline: {
        singleKillAccuracy: this.randomKillProb * 100,
        allCorrectRate: randomAllCorrectRate,
        lift: allCorrectRate - randomAllCorrectRate,
      },
    };
  }

  private runLowRiskBacktest(
    hist: number[][],
    displayPeriods = 10,
    startIndex = 80,
    killCount = 10,
  ): KillBacktestSummary | null {
    if (hist.length <= startIndex) return null;

    const results = [];
    let totalCorrect = 0;
    let totalPredicted = 0;
    let allCorrectPeriods = 0;
    let ninePlusPeriods = 0;
    const actualStartIndex = Math.max(
      10,
      Math.min(startIndex, hist.length - 1),
    );

    for (let i = actualStartIndex; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const actualRow = hist[i];
      const actualSet = new Set(actualRow);
      const killNums = this.getLowRiskKillPredictions(subHist, killCount).map(
        (k) => k.n,
      );
      const failed = killNums.filter((n) => actualSet.has(n));
      const correctCount = killNums.length - failed.length;
      totalCorrect += correctCount;
      totalPredicted += killNums.length;
      if (failed.length === 0) allCorrectPeriods++;
      if (failed.length <= 1) ninePlusPeriods++;

      if (i >= hist.length - displayPeriods) {
        results.push({
          periodOffset: hist.length - i,
          predicted: killNums,
          actual: actualRow,
          failed,
          correctCount,
          accuracy: (correctCount / killNums.length) * 100,
        });
      }
    }

    results.reverse();
    const calcPeriods = hist.length - actualStartIndex;
    const overallAccuracy =
      totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
    const allCorrectRate =
      calcPeriods > 0 ? (allCorrectPeriods / calcPeriods) * 100 : 0;
    const ninePlusRate =
      calcPeriods > 0 ? (ninePlusPeriods / calcPeriods) * 100 : 0;
    const randomAllCorrectRate = this.getRandomAllKillRate(killCount) * 100;

    return {
      name: 'low-risk',
      details: results,
      overallAccuracy,
      allCorrectPeriods,
      allCorrectRate,
      ninePlusPeriods,
      ninePlusRate,
      totalCorrect,
      totalPredicted,
      calcPeriods,
      killCount,
      randomBaseline: {
        singleKillAccuracy: this.randomKillProb * 100,
        allCorrectRate: randomAllCorrectRate,
        lift: allCorrectRate - randomAllCorrectRate,
      },
    };
  }

  private getRandomAllKillRate(killCount: number) {
    let p = 1;
    for (let i = 0; i < killCount; i++) {
      p *= (42 - i) / (49 - i);
    }
    return p;
  }
}
