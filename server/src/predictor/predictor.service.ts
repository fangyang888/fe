import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

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

class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}
  
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value;
     firstKey && this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
  has(key: K): boolean { return this.map.has(key); }
  clear() { this.map.clear(); }
}

@Injectable()
export class PredictorService {
  constructor(private readonly historyService: HistoryService) {}

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
  private lastHistLength = 0;

  private checkAndClearCache(currentHistLength: number) {
    // 如果数据长度减小了（可能是数据库重置），清空缓存
    if (currentHistLength < this.lastHistLength) {
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
    }
    this.lastHistLength = currentHistLength;
  }

  async getKillPredictions() {
    const rawHist = await this.historyService.findAll();
    this.checkAndClearCache(rawHist.length); // 检查是否需要清理缓存
    
    const hist = rawHist.map(item => [
      item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7
    ]);
    
    const { predictions, repulsionInfo } = this.strategyServerSide(hist);
    const backtestStats = this.runBacktest(hist, 10, 100);
    
    return {
      predictions,
      repulsionInfo,
      backtestStats
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
              grid.push({ decay, protectWindow, missRiskMult, tailBalance, altBonus });
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
        for (const repulsionThreshold of [0.08, 0.10]) {
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
        protectReason[n] = protectReason[n] || "近" + protectWindow + "期热号";
      }),
    );
    
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps = allApps[n];
      if (apps.length < 3) continue;
      
      const lastIdx = apps[apps.length - 1];
      const gaps = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
      const lastMiss = hn - 1 - lastIdx;
      
      if (avgGap > 0 && lastMiss / avgGap >= 5) {
        extremeMissSet.add(n);
        protectReason[n] = "极端遗漏";
        continue;
      }
      if (lastMiss >= avgGap * missRiskMult) {
        protect.add(n);
        protectReason[n] = "遗漏回归风险";
        continue;
      }
      if (apps.length >= 4) {
        const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv > 0.85 && lastMiss < avgGap * 1.5) {
          protect.add(n);
          protectReason[n] = "高变异不稳定";
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
          for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
          const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
          const lastMiss = hn - 1 - apps[apps.length - 1];
          if (lastMiss < avgGap * relaxedMult) {
            protect.delete(n);
            protectReason[n] = "遗漏风险已放宽";
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

  private kill10WithOptsMemo(hist: number[][], opts: PredictorOpts): PredictionResult[] {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKill10.has(key)) return this.memoKill10.get(key);
    const res = this.kill10WithOpts(hist, opts);
    this.memoKill10.set(key, res);
    return res;
  }

  private kill10WithOpts(hist: number[][], opts: PredictorOpts) {
    const { tailBalance, altBonus } = opts;
    const N = hist.length;
    const { candidates } = this.buildScoreEngineWithOpts(hist, opts);
    
    // 近期热号过滤反弹
    const last5 = hist.slice(-5);
    const hotInLast5 = new Set<number>();
    const freqLast5: Record<number, number> = {};
    last5.forEach(r => r.forEach(n => {
      freqLast5[n] = (freqLast5[n] || 0) + 1;
      if (freqLast5[n] >= 2) hotInLast5.add(n);
    }));
    const filteredCandidates = candidates.filter(c => !hotInLast5.has(c.n));
  
    const scored = filteredCandidates.map((c) => {
      const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
      const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
      const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
      let bonus = 0;
      if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -altBonus;
      if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +altBonus;
      return { ...c, adjustedW: c.w + bonus };
    });
    
    scored.sort((a, b) => a.adjustedW - b.adjustedW);
    
    if (!tailBalance) return scored.slice(0, 10).map(c => ({n: c.n, w: c.w}));
    
    const tailCounts = Array(10).fill(0);
    const selected = [];
    for (const c of scored) {
      if (selected.length >= 10) break;
      const tail = c.n % 10;
      if (tailCounts[tail] < 2) {
        selected.push(c);
        tailCounts[tail]++;
      }
    }
    for (const c of scored) {
      if (selected.length >= 10) break;
      if (!selected.find((s: any) => s.n === c.n)) selected.push(c);
    }
    return selected.slice(0, 10).map((c: any) => ({n: c.n, w: c.w}));
  }

  private getAdaptiveKill10Opts(hist: number[][]) {
    if (this.memoAdaptiveOpts.has(hist.length)) return this.memoAdaptiveOpts.get(hist.length);
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
      let correct = 0, total = 0;
      const start = hist.length - evalWindow;
      for (let i = start; i < hist.length - 1; i++) {
        const sub = hist.slice(0, i + 1);
        const kill = this.kill10WithOptsMemo(sub, opts).map((c: any) => c.n);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n: number) => !nextSet.has(n)).length;
        total += 10;
      }
      baseResults.push({ opts, score: total > 0 ? correct / total : 0 });
    }
    baseResults.sort((a, b) => b.score - a.score);
    const top5Base = baseResults.slice(0, 5);

    // Phase 2: Fine-tune repulsion params on top-5 base sets
    const repulsionGrid = this.getRepulsionParamGrid();
    let bestOpts: PredictorOpts = { ...top5Base[0].opts, repulsionWeight: 0.5, aprioriWeight: 0.5, repulsionThreshold: 0.10 };
    let bestScore = top5Base[0].score;
    
    for (const base of top5Base) {
      for (const rep of repulsionGrid) {
        const combined = { ...base.opts, ...rep };
        let correct = 0, total = 0;
        const start = hist.length - evalWindow;
        for (let i = start; i < hist.length - 1; i++) {
          const sub = hist.slice(0, i + 1);
          const kill = this.kill10WithRepulsionMemo(sub, combined).map((c: any) => c.n);
          const nextSet = new Set(hist[i + 1]);
          correct += kill.filter((n: number) => !nextSet.has(n)).length;
          total += 10;
        }
        const acc = total > 0 ? correct / total : 0;
        if (acc > bestScore) {
          bestScore = acc;
          bestOpts = combined;
        }
      }
    }
    return bestOpts;
  }

  /**
   * kill10 enhanced with repulsion scoring from co-occurrence matrix & Apriori rules.
   */
  private kill10WithRepulsionMemo(hist: number[][], opts: PredictorOpts): PredictionResult[] {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKillRepulsion.has(key)) return this.memoKillRepulsion.get(key);
    const res = this.kill10WithRepulsion(hist, opts);
    this.memoKillRepulsion.set(key, res);
    return res;
  }

  private kill10WithRepulsion(hist: number[][], opts: PredictorOpts) {
    const baseNums = this.kill10WithOpts(hist, opts);
    const { repulsionWeight = 0.5, aprioriWeight = 0.5, repulsionThreshold = 0.10 } = opts;

    // Cross-period repulsion bonus
    const repulsionScores = this.getCrossPerioRepulsionScores(hist, repulsionThreshold);
    // Apriori rule bonus
    const aprioriScores = this.getAprioriRepulsionRules(hist);

    // 修复 Bug：降低排斥得分高的号码的权重 w，使其更容易被选中作为杀号（在排序中排到更前面）
    const reScored = baseNums.map(c => {
      const rBonus = (repulsionScores[c.n] || 0) * repulsionWeight;
      const aBonus = (aprioriScores.scores[c.n] || 0) * aprioriWeight;
      return { ...c, w: c.w - rBonus - aBonus };
    });
    
    reScored.sort((a, b) => a.w - b.w);
    return reScored.slice(0, 10);
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
      const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
      const cv = avgGap > 0 ? stdDev / avgGap : 1;
      return { n, cv };
    });
    scored.sort((a, b) => a.cv - b.cv);
    return scored.slice(0, count);
  }

  private getMarkovPredictions(hist: number[][]) {
    if (hist.length < 2) return Array(50).fill(0);
    const matrix = Array(50).fill(0).map(() => Array(50).fill(0));
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
      new Set(hist[hist.length - 1])
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
    const countF1 = { kill: new Array(5).fill(0.1), notKill: new Array(5).fill(0.1) }; 
    const countF2 = { kill: new Array(4).fill(0.1), notKill: new Array(4).fill(0.1) };
    const countF3 = { kill: new Array(10).fill(0.1), notKill: new Array(10).fill(0.1) }; // Tail Digit (0-9)
    const countF4 = { kill: new Array(2).fill(0.1), notKill: new Array(2).fill(0.1) };  // Odd/Even (0, 1)

    const getF1Category = (gap: number) => gap === 0 ? 0 : gap <= 2 ? 1 : gap <= 5 ? 2 : gap <= 10 ? 3 : 4;
    const getF2Category = (freq: number) => freq === 0 ? 0 : freq === 1 ? 1 : freq === 2 ? 2 : 3;
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
        
        const isKilled = !hist[i+1].includes(n);
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
         if (hist[j].includes(n)) { ls = j; break; }
       }
       currentGap[n] = ls === -1 ? 10 : (hist.length - 1) - ls;
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
      const scoreNotKill = pNotKill * pF1_NotKill * pF2_NotKill * pF3_NotKill * pF4_NotKill;

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
        let bounceCount = 0, patternCount = 0;
        for (let i = 2; i < hn - 1; i++) {
          if (hist[i - 2].includes(n) && !hist[i - 1].includes(n) && !hist[i].includes(n)) {
            patternCount++;
            if (hist[i + 1].includes(n)) bounceCount++;
          }
        }
        if (patternCount >= 5 && bounceCount / patternCount > 0.20) {
          protectedNums.add(n);
        }
      }

      // Pattern 2: Regular-cycle numbers that are "due"
      const apps = allApps[n];
      if (apps.length >= 5) {
        const gaps: number[] = [];
        for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        const currentGap = (hn - 1) - apps[apps.length - 1];
        if (cv < 0.4 && currentGap >= avgGap * 0.8 && currentGap <= avgGap * 1.3) {
          protectedNums.add(n);
        }
      }
    }
    return protectedNums;
  }

  // --- CROSS-PERIOD REPULSION MATRIX ---
  // Builds a 49x49 cross-period co-occurrence matrix (period T numbers → period T+1 numbers).
  // Returns a score array [0..49] where higher score = stronger repulsion from last row.
  private getCrossPerioRepulsionScores(hist: number[][], threshold = 0.10): number[] {
    const key = `${hist.length}-${threshold}`;
    if (this.memoCrossRepulsion.has(key)) return this.memoCrossRepulsion.get(key);
    const res = this.getCrossPerioRepulsionScoresInternal(hist, threshold);
    this.memoCrossRepulsion.set(key, res);
    return res;
  }
  private getCrossPerioRepulsionScoresInternal(hist: number[][], threshold = 0.10): number[] {
    const scores = new Array(50).fill(0);
    if (hist.length < 5) return scores;

    // Build raw co-occurrence counts: coMatrix[a][b] = times 'a' in period T && 'b' in period T+1
    const coMatrix = Array(50).fill(0).map(() => Array(50).fill(0));
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
    const probMatrix = Array(50).fill(0).map(() => Array(50).fill(0));
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
        if (srcCounts[a] >= 3) { // only trust sources with enough data
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
          scores[b] = (threshold - avgProb) / threshold * 10;
        }
      }
    }
    return scores;
  }

  // --- APRIORI-STYLE ASSOCIATION RULE MINING ---
  // Mines rules of the form: {A, B} in period T → ¬C in period T+1
  // Returns { scores: number[50], rules: {pair, target, support, confidence}[] }
  private getAprioriRepulsionRules(hist: number[][]): { scores: number[]; rules: any[] } {
    const key = hist.length;
    if (this.memoApriori.has(key)) return this.memoApriori.get(key);
    const res = this.getAprioriRepulsionRulesInternal(hist);
    this.memoApriori.set(key, res);
    return res;
  }
  private getAprioriRepulsionRulesInternal(hist: number[][]): { scores: number[]; rules: any[] } {
    const scores = new Array(50).fill(0);
    const rules: any[] = [];
    if (hist.length < 10) return { scores, rules };

    const MIN_SUPPORT = 3;
    const MIN_CONFIDENCE = 0.85;
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

      const totalNextPeriods = indices.filter(idx => idx + 1 < hist.length).length;
      if (totalNextPeriods < MIN_SUPPORT) continue;

      // For each candidate target, compute repulsion confidence
      for (let c = 1; c <= 49; c++) {
        const appeared = nextAppearCount[c] || 0;
        const notAppeared = totalNextPeriods - appeared;
        const confidence = notAppeared / totalNextPeriods;

        if (confidence >= MIN_CONFIDENCE) {
          rules.push({
            pair: [a, b],
            target: c,
            support: totalNextPeriods,
            confidence: Math.round(confidence * 1000) / 1000
          });
          // Accumulate score: higher confidence & support = stronger kill signal
          scores[c] += confidence * Math.log2(totalNextPeriods + 1);
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

  private strategyServerSide(hist: number[][]): { predictions: any[]; repulsionInfo: any } {
    if (this.memoStrategy.has(hist.length)) return this.memoStrategy.get(hist.length);
    const res = this.strategyServerSideInternal(hist);
    this.memoStrategy.set(hist.length, res);
    return res;
  }

  private strategyServerSideInternal(hist: number[][]): { predictions: any[]; repulsionInfo: any } {
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
    const { candidates: baseCandidates } = this.buildScoreEngineWithOpts(hist, opts);
    const maxW = Math.max(...baseCandidates.map(c => c.w), 1);
    baseCandidates.forEach(c => {
      expertScores.frequency[c.n] = 1 - (c.w / maxW);
    });

    const repulsionKill = this.kill10WithRepulsionMemo(hist, opts);
    const maxRepW = Math.max(...repulsionKill.map(c => Math.abs(c.w)), 1);
    const minRepW = Math.min(...repulsionKill.map(c => c.w));
    repulsionKill.forEach(c => {
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
        const killProb = (expert === 'knn' || expert === 'markov' || expert === 'markov2') 
          ? (1 - score) 
          : score;
        
        finalScores[n] += killProb * (weight as number);
        
        if (killProb > 0.7) { // Threshold for display
           expertNames[n].push(this.getExpertDisplayName(expert));
        }
      }
    }

    // ========== PHASE 3: Failure pattern protection ==========
    const protectedNums = this.getFailurePatternProtection(hist);

    // ========== PHASE 4: Ranking & Selection ==========
    const repulsionThreshold = opts.repulsionThreshold || 0.10;
    const repulsionScores = this.getCrossPerioRepulsionScores(hist, repulsionThreshold);
    const aprioriResult = this.getAprioriRepulsionRules(hist);

    let allCandidates = Array.from({ length: 49 }, (_, i) => ({
      n: i + 1,
      score: finalScores[i + 1],
      experts: expertNames[i + 1],
      isProtected: protectedNums.has(i + 1),
      repulsionScore: repulsionScores[i + 1] || 0,
      aprioriScore: aprioriResult.scores[i + 1] || 0,
    }));

    // Sort by final ensemble score
    let selected = allCandidates
      .filter(c => !c.isProtected)
      .sort((a, b) => b.score - a.score);

    const finalNums = selected.slice(0, 10).map((c, i) => ({
      n: c.n,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      score: Math.round(c.score * 100) / 100,
      experts: c.experts.length > 0 ? c.experts.join('+') : '综合',
      repulsionScore: Math.round(c.repulsionScore * 100) / 100,
      aprioriScore: Math.round(c.aprioriScore * 100) / 100,
    }));

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
        .map(x => ({
          n: x.n,
          score: Math.round(x.score * 100) / 100,
          experts: x.experts.join('+'),
        })),
      aprioriRules: aprioriResult.rules,
      protectedCount: protectedNums.size,
    };

    return {
      predictions: finalNums,
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
      bayes: '贝叶斯'
    };
    return map[name] || name;
  }

  private getDynamicExpertWeights(hist: number[][], opts: PredictorOpts) {
    const key = hist.length;
    if (this.memoExpertWeights.has(key)) return this.memoExpertWeights.get(key);

    const evalWindow = 30; // Evaluate last 30 periods
    const experts = ['frequency', 'repulsion', 'knn', 'markov', 'markov2', 'bayes'];
    const performance: any = {};
    experts.forEach(e => performance[e] = 0);

    const start = Math.max(50, hist.length - evalWindow);
    let totalEval = 0;

    for (let i = start; i < hist.length - 1; i++) {
      const subHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);
      
      // Get each expert's top 10 kill suggestions
      const kills: any = {
        frequency: this.kill10WithOptsMemo(subHist, opts).map(c => c.n),
        repulsion: this.kill10WithRepulsionMemo(subHist, opts).map(c => c.n),
        knn: Array.from({length: 49}, (_, k) => ({n: k+1, p: this.getKnnPredictionsMemo(subHist, 30)[k+1]}))
              .sort((a,b) => a.p - b.p).slice(0, 10).map(c => c.n),
        markov: Array.from({length: 49}, (_, k) => ({n: k+1, p: this.getMarkovPredictions(subHist)[k+1]}))
                .sort((a,b) => a.p - b.p).slice(0, 10).map(c => c.n),
        markov2: Array.from({length: 49}, (_, k) => ({n: k+1, p: this.getMarkov2PredictionsMemo(subHist)[k+1]}))
                 .sort((a,b) => a.p - b.p).slice(0, 10).map(c => c.n),
        bayes: Array.from({length: 49}, (_, k) => ({n: k+1, p: this.getNaiveBayesKillProbMemo(subHist)[k+1]}))
               .sort((a,b) => b.p - a.p).slice(0, 10).map(c => c.n),
      };

      for (const expert of experts) {
        const correct = kills[expert].filter((n: number) => !nextRow.has(n)).length;
        performance[expert] += correct / 10;
      }
      totalEval++;
    }

    const weights: any = {};
    let sum = 0;
    for (const expert of experts) {
      const avgAcc = totalEval > 0 ? performance[expert] / totalEval : 0.85; // Default 85%
      // Use square of accuracy to penalize low performance more heavily
      weights[expert] = Math.pow(avgAcc, 2);
      sum += weights[expert];
    }

    // Normalize weights
    for (const expert of experts) {
      weights[expert] = weights[expert] / sum;
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
      const killNums = killNumsObj.map(k => k.n);
      const failed = killNums.filter(n => actualSet.has(n));
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
          accuracy: (correctCount / killNums.length) * 100
        });
      }
    }
    results.reverse();
    const overallAccuracy = totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
    return { details: results, overallAccuracy, totalCorrect, totalPredicted, calcPeriods: actualCalcPeriods };
  }
}
