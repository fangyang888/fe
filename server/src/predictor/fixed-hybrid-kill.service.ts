// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

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

interface AppearScore {
  n: number;
  appearProb: number;
  killConfidence: number;
  features: Record<string, number>;
}

class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
}

@Injectable()
export class FixedHybridKillService {
  private readonly randomKillProb = 42 / 49;
  private readonly randomAppearProb = 7 / 49;
  private memoKnn = new BoundedCache<number, any>(2000);
  private memoNB = new BoundedCache<number, any>(2000);
  private memoMarkov2 = new BoundedCache<number, any>(2000);
  private memoAppearWeights = new BoundedCache<number, any>(2000);
  private memoResponse = new BoundedCache<string, any>(100);

  constructor(private readonly historyService: HistoryService) {}

  async getProbability47() {
    const rawHist = await this.historyService.findAll();
    const cacheKey = `${rawHist.length}:${rawHist[rawHist.length - 1]?.id || ''}`;
    if (this.memoResponse.has(cacheKey)) return this.memoResponse.get(cacheKey);

    const hist = rawHist.map((item) => [
      item.n1,
      item.n2,
      item.n3,
      item.n4,
      item.n5,
      item.n6,
      item.n7,
    ]);
    const modelPredictions = this.getProbabilityKillPredictions(hist, 14);
    const predictions = this.combineHybridKillPredictions(hist, modelPredictions, 4, 7, 10);
    const backtest = this.backtestHybridKill10(hist, 4, 7, 'probability', false);
    const last = rawHist[rawHist.length - 1];
    const response = {
      strategy: {
        name: 'hybrid-history-4-7-probability',
        displayName: '混合10杀 近4期/7+3 概率补位',
        window: 4,
        historyCount: 7,
        predictionCount: 3,
        baseModel: 'probability',
        guarded: false,
      },
      predictions,
      backtest,
      historyMeta: {
        source: 'database:history',
        count: rawHist.length,
        latest: last
          ? {
              id: last.id,
              year: last.year ?? null,
              No: last.No ?? null,
              numbers: [last.n1, last.n2, last.n3, last.n4, last.n5, last.n6, last.n7],
            }
          : null,
      },
      generatedAt: new Date().toISOString(),
    };
    this.memoResponse.set(cacheKey, response);
    return response;
  }

  async refreshProbability47Cache() {
    this.memoResponse = new BoundedCache<string, any>(100);
    const response = await this.getProbability47();
    return {
      ...response,
      cacheMeta: {
        action: 'refreshed',
        hit: false,
        store: 'memory',
        key: response.historyMeta?.latest
          ? `${response.historyMeta.count}:${response.historyMeta.latest.id}`
          : `${response.historyMeta?.count || 0}:`,
        generatedAt: new Date().toISOString(),
      },
    };
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

  private getKnnPredictionsMemo(hist: number[][], k = 30): number[] {
    const key = hist.length;
    if (this.memoKnn.has(key)) return this.memoKnn.get(key);
    const res = this.getKnnPredictions(hist, k);
    this.memoKnn.set(key, res);
    return res;
  }

  private getKnnPredictions(hist: number[][], k = 30): number[] {
    if (hist.length < 10) return new Array(50).fill(0);
    const pattern = [
      new Set(hist[hist.length - 3]),
      new Set(hist[hist.length - 2]),
      new Set(hist[hist.length - 1]),
    ];
    const similarities = [];
    for (let i = 2; i < hist.length - 1; i++) {
      if (i >= hist.length - 3) continue;
      let sim = 0;
      for (let j = 0; j < 3; j++) {
        const histSet = hist[i - 2 + j];
        const patSet = pattern[j];
        let intersection = 0;
        for (const num of histSet) {
          if (patSet.has(num)) intersection++;
        }
        const weights = [0.2, 0.3, 0.5];
        sim += intersection * weights[j];
      }
      similarities.push({ index: i, sim });
    }

    similarities.sort((a, b) => b.sim - a.sim);
    const topK = similarities.slice(0, k);
    const nextFrequencies = new Array(50).fill(0);
    for (const neighbor of topK) {
      const nextRow = hist[neighbor.index + 1];
      for (const num of nextRow) nextFrequencies[num]++;
    }
    const knnProbs = new Array(50).fill(0);
    for (let i = 1; i <= 49; i++) knnProbs[i] = nextFrequencies[i] / k;
    return knnProbs;
  }

  private getNaiveBayesKillProbMemo(hist: number[][]): number[] {
    const key = hist.length;
    if (this.memoNB.has(key)) return this.memoNB.get(key);
    const res = this.getNaiveBayesKillProb(hist);
    this.memoNB.set(key, res);
    return res;
  }

  private getNaiveBayesKillProb(hist: number[][]): number[] {
    if (hist.length < 50) return new Array(50).fill(0);
    let classKill = 0;
    let classNotKill = 0;
    const countF1 = { kill: new Array(5).fill(0.1), notKill: new Array(5).fill(0.1) };
    const countF2 = { kill: new Array(4).fill(0.1), notKill: new Array(4).fill(0.1) };
    const countF3 = { kill: new Array(10).fill(0.1), notKill: new Array(10).fill(0.1) };
    const countF4 = { kill: new Array(2).fill(0.1), notKill: new Array(2).fill(0.1) };
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
    const sum = Object.values(rest).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const normalized: any = { name };
    for (const [key, value] of Object.entries(rest)) {
      normalized[key] = Math.max(0, value as number) / sum;
    }
    return normalized as AppearWeights;
  }

  private getAppearWeightCandidates(): AppearWeights[] {
    const presets: AppearWeights[] = [
      this.getDefaultAppearWeights(),
      { name: 'recent-hot-risk', freq10: 0.28, freq20: 0.24, freq50: 0.12, freq100: 0.04, longFreq: 0.06, markov: 0.1, markov2: 0.05, knn: 0.05, bayesAppear: 0.03, gapRisk: 0.03 },
      { name: 'mid-window-stable', freq10: 0.1, freq20: 0.18, freq50: 0.24, freq100: 0.14, longFreq: 0.1, markov: 0.08, markov2: 0.05, knn: 0.04, bayesAppear: 0.03, gapRisk: 0.04 },
      { name: 'transition-led', freq10: 0.1, freq20: 0.1, freq50: 0.12, freq100: 0.08, longFreq: 0.06, markov: 0.24, markov2: 0.16, knn: 0.07, bayesAppear: 0.04, gapRisk: 0.03 },
      { name: 'pattern-led', freq10: 0.1, freq20: 0.12, freq50: 0.12, freq100: 0.06, longFreq: 0.06, markov: 0.12, markov2: 0.08, knn: 0.22, bayesAppear: 0.07, gapRisk: 0.05 },
      { name: 'gap-protection', freq10: 0.1, freq20: 0.12, freq50: 0.12, freq100: 0.08, longFreq: 0.08, markov: 0.1, markov2: 0.07, knn: 0.04, bayesAppear: 0.04, gapRisk: 0.25 },
      { name: 'cold-frequency', freq10: 0.22, freq20: 0.22, freq50: 0.2, freq100: 0.12, longFreq: 0.12, markov: 0.04, markov2: 0.02, knn: 0.02, bayesAppear: 0.02, gapRisk: 0.02 },
      { name: 'low-noise-long', freq10: 0.06, freq20: 0.1, freq50: 0.22, freq100: 0.2, longFreq: 0.18, markov: 0.08, markov2: 0.04, knn: 0.03, bayesAppear: 0.03, gapRisk: 0.06 },
      { name: 'bayes-plus-transition', freq10: 0.08, freq20: 0.1, freq50: 0.12, freq100: 0.08, longFreq: 0.08, markov: 0.18, markov2: 0.1, knn: 0.06, bayesAppear: 0.16, gapRisk: 0.04 },
      { name: 'gap-and-recent', freq10: 0.24, freq20: 0.2, freq50: 0.1, freq100: 0.04, longFreq: 0.04, markov: 0.08, markov2: 0.04, knn: 0.03, bayesAppear: 0.03, gapRisk: 0.2 },
    ];
    return presets.map((p) => this.normalizeAppearWeights(p));
  }

  private getTrainedAppearWeights(hist: number[][]) {
    const key = Math.floor(hist.length / 20) * 20;
    if (this.memoAppearWeights.has(key)) return this.memoAppearWeights.get(key);
    const res = this.trainAppearWeights(hist);
    this.memoAppearWeights.set(key, res);
    return res;
  }

  private trainAppearWeights(hist: number[][]) {
    const candidates = this.getAppearWeightCandidates();
    if (hist.length < 120) {
      return { weights: this.getDefaultAppearWeights(), score: 0, evalPeriods: 0, leaderboard: [] };
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
          const killNums = this.scoreAppearRows(this.getAppearFeatureRows(subHist), weights)
            .slice(0, 10)
            .map((s) => s.n);
          const failed = killNums.filter((n) => actualSet.has(n)).length;
          const correct = killNums.length - failed;
          totalCorrect += correct;
          if (failed === 0) allCorrect++;
          if (failed <= 1) ninePlus++;
          objective += correct / 10 + (failed === 0 ? 0.08 : 0) + (failed <= 1 ? 0.025 : 0) - failed * 0.025;
          evalPeriods++;
        }
        const avgAccuracy = evalPeriods > 0 ? totalCorrect / (evalPeriods * 10) : 0;
        const allCorrectRate = evalPeriods > 0 ? allCorrect / evalPeriods : 0;
        const ninePlusRate = evalPeriods > 0 ? ninePlus / evalPeriods : 0;
        return { weights, score: evalPeriods > 0 ? objective / evalPeriods : 0, evalPeriods, avgAccuracy, allCorrectRate, ninePlusRate };
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

  private getAppearFeatureRows(hist: number[][]): Array<{ n: number; features: Record<string, number> }> {
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
      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 49 / 7;
      const gapRatio = avgGap > 0 ? currentGap / avgGap : 1;
      const stdDev = gaps.length > 0 ? Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length) : avgGap;
      const cv = avgGap > 0 ? stdDev / avgGap : 1;
      let gapRisk = this.randomAppearProb;
      if (gapRatio >= 2.5) gapRisk += 0.06;
      else if (gapRatio >= 1.4) gapRisk += 0.025;
      else if (gapRatio <= 0.25) gapRisk += 0.035;
      else if (gapRatio >= 0.6 && gapRatio <= 1.1) gapRisk -= 0.015;
      if (cv > 0.9 && currentGap <= avgGap) gapRisk += 0.015;
      rows.push({
        n,
        features: { freq10, freq20, freq50, freq100, longFreq, currentGap, avgGap, gapRatio, cv, markov: markov[n] || 0, markov2: markov2[n] || 0, knn: knn[n] || 0, bayesAppear: 1 - (bayesKill[n] || this.randomKillProb), gapRisk },
      });
    }
    return rows;
  }

  private scoreAppearRows(rows: Array<{ n: number; features: Record<string, number> }>, weights: AppearWeights): AppearScore[] {
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
      return { n: row.n, appearProb, killConfidence: 1 - appearProb, features: f };
    });
    scores.sort((a, b) => a.appearProb - b.appearProb);
    return scores;
  }

  private getProbabilityKillPredictionsWithWeights(hist: number[][], weights: AppearWeights, count = 10) {
    const protectedNums = this.getFailurePatternProtection(hist);
    const scores = this.scoreAppearRows(this.getAppearFeatureRows(hist), weights);
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
    return this.getProbabilityKillPredictionsWithWeights(hist, trained.weights, count);
  }

  private scoreKillPrediction(predictions: any[], actualSet: Set<number>) {
    const killNums = predictions.map((p) => p.n);
    const failed = killNums.filter((n) => actualSet.has(n));
    const correctCount = killNums.length - failed.length;
    return { predicted: killNums, failed, correctCount, accuracy: killNums.length > 0 ? (correctCount / killNums.length) * 100 : 0 };
  }

  private createVariantTracker(displayName: string) {
    return { displayName, details: [] as any[], totalCorrect: 0, totalPredicted: 0, allCorrectPeriods: 0, ninePlusPeriods: 0, maxMisses: 0 };
  }

  private addVariantResult(tracker: ReturnType<FixedHybridKillService['createVariantTracker']>, result: ReturnType<FixedHybridKillService['scoreKillPrediction']>, actual: number[], periodOffset: number, shouldKeepDetail: boolean) {
    tracker.totalCorrect += result.correctCount;
    tracker.totalPredicted += result.predicted.length;
    tracker.allCorrectPeriods += result.failed.length === 0 ? 1 : 0;
    tracker.ninePlusPeriods += result.failed.length <= 1 ? 1 : 0;
    tracker.maxMisses = Math.max(tracker.maxMisses, result.failed.length);
    if (shouldKeepDetail) {
      tracker.details.push({ periodOffset, predicted: result.predicted, actual, failed: result.failed, correctCount: result.correctCount, accuracy: result.accuracy });
    }
  }

  private summarizeVariantTracker(name: string, tracker: ReturnType<FixedHybridKillService['createVariantTracker']>, calcPeriods: number, killCount: number) {
    const overallAccuracy = tracker.totalPredicted > 0 ? (tracker.totalCorrect / tracker.totalPredicted) * 100 : 0;
    const allCorrectRate = calcPeriods > 0 ? (tracker.allCorrectPeriods / calcPeriods) * 100 : 0;
    const ninePlusRate = calcPeriods > 0 ? (tracker.ninePlusPeriods / calcPeriods) * 100 : 0;
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
      randomBaseline: { singleKillAccuracy: this.randomKillProb * 100, allCorrectRate: randomAllCorrectRate, lift: allCorrectRate - randomAllCorrectRate },
    };
  }

  private getRecentHistoryKillCandidates(hist: number[][], window: number, limit = 10) {
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
        const score = successRate * 0.72 + sampleStrength * 0.12 + recencyBonus * 0.12 - repeatPenalty;
        return { n, score, successRate, trials, lastSeenDistance: lastSeenDistance[n] || window, recentHits: recentHits[n] || 1 };
      });
    rows.sort((a, b) => b.score - a.score || b.successRate - a.successRate || a.lastSeenDistance - b.lastSeenDistance || a.n - b.n);
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
      reasons: [`近${window}期出现`, `历史杀中${Math.round(row.successRate * 100)}%`, `样本${row.trials}期`],
      features: { historyWindow: window, historySuccessRate: row.successRate, historyTrials: row.trials, lastSeenDistance: row.lastSeenDistance, recentHits: row.recentHits },
    }));
  }

  private combineHybridKillPredictions(hist: number[][], modelPredictions: any[], window: number, historyCount: number, totalCount = 10) {
    const historyCandidates = this.getRecentHistoryKillCandidates(hist, window, historyCount);
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
      selected.push({ ...candidate, source, reasons: candidate.reasons?.length > 0 ? candidate.reasons : [source === 'history' ? `近${window}期筛选` : '模型预测补位'] });
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
    return selected.slice(0, totalCount).map((item, i) => ({ ...item, tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3', blendRank: i + 1 }));
  }

  private backtestHybridKill10(hist: number[][], window: number, historyCount: number, baseModel: 'probability', useRecentRiskGuard = false) {
    const displayPeriods = 10;
    const evalWindow = Math.min(160, Math.max(50, Math.floor(hist.length * 0.2)));
    const start = Math.max(40, hist.length - evalWindow);
    const tracker = this.createVariantTracker(`混合10杀 近${window}期/${historyCount}+${10 - historyCount} 概率补位${useRecentRiskGuard ? ' 风险过滤' : ''}`);
    for (let i = start; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      const modelPredictions = this.getProbabilityKillPredictions(subHist, 14);
      const predictions = this.combineHybridKillPredictions(subHist, modelPredictions, window, historyCount, 10);
      this.addVariantResult(tracker, this.scoreKillPrediction(predictions, new Set(hist[i])), hist[i], hist.length - i, i >= hist.length - displayPeriods);
    }
    return this.summarizeVariantTracker(`hybrid-history-${window}-${historyCount}-${baseModel}${useRecentRiskGuard ? '-guarded' : ''}`, tracker, hist.length - start, 10);
  }

  private getFailurePatternProtection(hist: number[][]): Set<number> {
    const protectedNums = new Set<number>();
    if (hist.length < 30) return protectedNums;
    const hn = hist.length;
    const lastRow = new Set(hist[hn - 1]);
    const prevRow = new Set(hist[hn - 2]);
    const prevPrevRow = hn >= 3 ? new Set(hist[hn - 3]) : new Set<number>();
    const allApps = Array.from({ length: 50 }, () => [] as number[]);
    for (let i = 0; i < hn; i++) {
      for (const num of hist[i]) allApps[num].push(i);
    }
    for (let n = 1; n <= 49; n++) {
      if (prevPrevRow.has(n) && !prevRow.has(n) && !lastRow.has(n)) {
        let bounceCount = 0;
        let patternCount = 0;
        for (let i = 2; i < hn - 1; i++) {
          if (hist[i - 2].includes(n) && !hist[i - 1].includes(n) && !hist[i].includes(n)) {
            patternCount++;
            if (hist[i + 1].includes(n)) bounceCount++;
          }
        }
        if (patternCount >= 5 && bounceCount / patternCount > 0.2) protectedNums.add(n);
      }
      const apps = allApps[n];
      if (apps.length >= 5) {
        const gaps: number[] = [];
        for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        const currentGap = hn - 1 - apps[apps.length - 1];
        if (cv < 0.4 && currentGap >= avgGap * 0.8 && currentGap <= avgGap * 1.3) protectedNums.add(n);
      }
    }
    return protectedNums;
  }

  private getRandomAllKillRate(killCount: number) {
    let p = 1;
    for (let i = 0; i < killCount; i++) {
      p *= (42 - i) / (49 - i);
    }
    return p;
  }
}
