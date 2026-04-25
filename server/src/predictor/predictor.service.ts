import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

@Injectable()
export class PredictorService {
  constructor(private readonly historyService: HistoryService) {}

  // 性能优化：缓存高频计算结果
  private memoKill10 = new Map<string, any>();
  private memoKillRepulsion = new Map<string, any>();
  private memoAdaptiveOpts = new Map<number, any>();
  private memoStrategy = new Map<number, any>();
  private lastHistLength = 0;

  private checkAndClearCache(currentHistLength: number) {
    // 如果数据长度减小了（可能是数据库重置），清空缓存
    if (currentHistLength < this.lastHistLength) {
      this.memoKill10.clear();
      this.memoKillRepulsion.clear();
      this.memoAdaptiveOpts.clear();
      this.memoStrategy.clear();
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
    const backtestStats = this.runBacktest(hist, 10, 50);
    
    return {
      predictions,
      repulsionInfo,
      backtestStats
    };
  }

  // --- SERVER-SIDE PREDICTION ENGINE ---

  private getBaseParamGrid() {
    const grid = [];
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

  private buildScoreEngineWithOpts(hist: number[][], opts: any) {
    const { decay, protectWindow, missRiskMult } = opts;
    const hn = hist.length;
    const wFreq = new Array(50).fill(0);
    hist.forEach((row, idx) => {
      const age = hn - 1 - idx;
      const w = Math.pow(decay, age);
      row.forEach((n) => {
        wFreq[n] += w;
      });
    });

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
      const apps: number[] = [];
      hist.forEach((row, idx) => {
        if (row.includes(n)) apps.push(idx);
      });
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
          const apps: number[] = [];
          hist.forEach((row, idx) => {
            if (row.includes(n)) apps.push(idx);
          });
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

  private kill10WithOptsMemo(hist: number[][], opts: any) {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKill10.has(key)) return this.memoKill10.get(key);
    const res = this.kill10WithOpts(hist, opts);
    this.memoKill10.set(key, res);
    return res;
  }

  private kill10WithOpts(hist: number[][], opts: any) {
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
      if (!selected.find((s) => s.n === c.n)) selected.push(c);
    }
    return selected.slice(0, 10).map(c => ({n: c.n, w: c.w}));
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
    const DEFAULT = baseGrid[0];
    const evalWindow = Math.min(50, hist.length - 10);
    const baseResults: { opts: any; score: number }[] = [];
    
    for (const opts of baseGrid) {
      let correct = 0, total = 0;
      const start = hist.length - evalWindow;
      for (let i = start; i < hist.length - 1; i++) {
        const sub = hist.slice(0, i + 1);
        const kill = this.kill10WithOptsMemo(sub, opts).map(c => c.n);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n) => !nextSet.has(n)).length;
        total += 10;
      }
      baseResults.push({ opts, score: total > 0 ? correct / total : 0 });
    }
    baseResults.sort((a, b) => b.score - a.score);
    const top5Base = baseResults.slice(0, 5);

    // Phase 2: Fine-tune repulsion params on top-5 base sets
    const repulsionGrid = this.getRepulsionParamGrid();
    let bestOpts = { ...top5Base[0].opts, repulsionWeight: 0.5, aprioriWeight: 0.5, repulsionThreshold: 0.10 };
    let bestScore = top5Base[0].score;
    
    for (const base of top5Base) {
      for (let rep of repulsionGrid) {
        const combined = { ...base.opts, ...rep };
        let correct = 0, total = 0;
        const start = hist.length - evalWindow;
        for (let i = start; i < hist.length - 1; i++) {
          const sub = hist.slice(0, i + 1);
          const kill = this.kill10WithRepulsionMemo(sub, combined).map(c => c.n);
          const nextSet = new Set(hist[i + 1]);
          correct += kill.filter((n) => !nextSet.has(n)).length;
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
  private kill10WithRepulsionMemo(hist: number[][], opts: any) {
    const key = `${hist.length}-${JSON.stringify(opts)}`;
    if (this.memoKillRepulsion.has(key)) return this.memoKillRepulsion.get(key);
    const res = this.kill10WithRepulsion(hist, opts);
    this.memoKillRepulsion.set(key, res);
    return res;
  }

  private kill10WithRepulsion(hist: number[][], opts: any) {
    let baseNums = this.kill10WithOpts(hist, opts);
    const { repulsionWeight = 0.5, aprioriWeight = 0.5, repulsionThreshold = 0.10 } = opts;

    // Cross-period repulsion bonus
    const repulsionScores = this.getCrossPerioRepulsionScores(hist, repulsionThreshold);
    // Apriori rule bonus
    const aprioriScores = this.getAprioriRepulsionRules(hist);

    const enhanced = baseNums.map(c => {
      const rBonus = (repulsionScores[c.n] || 0) * repulsionWeight;
      const aBonus = (aprioriScores.scores[c.n] || 0) * aprioriWeight;
      return { ...c, w: c.w + rBonus + aBonus };
    });
    // Higher combined score = more likely to be killed (lower w was better before, now bonus pushes good kills up)
    // Since original sort was ascending (lowest w = best kill candidate), we keep that
    // but repulsion bonus is positive for numbers that SHOULD be killed, so we need to subtract
    const reScored = enhanced.map(c => ({
      ...c,
      w: c.w - (repulsionScores[c.n] || 0) * repulsionWeight - (aprioriScores.scores[c.n] || 0) * aprioriWeight
    }));
    reScored.sort((a, b) => a.w - b.w);
    return reScored.slice(0, 10);
  }

  private pickLowCVFromLastRow(hist: number[][], count = 2) {
    if (hist.length < 2) return [];
    const lastRow = hist[hist.length - 1];
    const hn = hist.length;
    const scored = lastRow.map((n) => {
      const apps: number[] = [];
      hist.forEach((row, idx) => {
        if (row.includes(n)) apps.push(idx);
      });
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

  // --- CROSS-PERIOD REPULSION MATRIX ---
  // Builds a 49x49 cross-period co-occurrence matrix (period T numbers → period T+1 numbers).
  // Returns a score array [0..49] where higher score = stronger repulsion from last row.
  private getCrossPerioRepulsionScores(hist: number[][], threshold = 0.10): number[] {
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
    for (const [pairKey, indices] of pairOccurrences.entries()) {
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
    let baseNums = this.kill10WithRepulsionMemo(hist, opts);
    
    // Server Extra: Markov Penalty Filtering
    // We heavily penalize numbers that have a high markov transition probability.
    const markovProbs = this.getMarkovPredictions(hist);
    baseNums = baseNums.filter(c => {
      // average prob is around 7/49 = 0.142
      // If a number has > 0.25 probability to appear from markov chain, it's dangerous to kill
      if (markovProbs[c.n] > 0.22) return false;
      return true;
    });

    // Gather repulsion info for response
    const repulsionThreshold = opts.repulsionThreshold || 0.10;
    const repulsionScores = this.getCrossPerioRepulsionScores(hist, repulsionThreshold);
    const aprioriResult = this.getAprioriRepulsionRules(hist);

    const lowCVPicks = this.pickLowCVFromLastRow(hist, 2);
    const top8 = baseNums.slice(0, 8);
    const top8Nums = top8.map(c => c.n);
    
    const validPicks = lowCVPicks.filter((p) => !top8Nums.includes(p.n)).map(p => ({ n: p.n, reason: "上期低CV", tier: "C2" }));
    const finalNums = [...top8.map((c, i) => ({
      n: c.n,
      tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3',
      repulsionScore: Math.round((repulsionScores[c.n] || 0) * 100) / 100,
      aprioriScore: Math.round((aprioriResult.scores[c.n] || 0) * 100) / 100,
    })), ...validPicks];
    
    if (finalNums.length < 10) {
      const extras = baseNums.slice(8).filter((c) => !finalNums.find(f => f.n === c.n));
      extras.forEach(e => finalNums.push({ n: e.n, tier: 'S3', repulsionScore: 0, aprioriScore: 0 }));
    }
    
    // Fill if still < 10 (due to markov filter dropping too many)
    if (finalNums.length < 10) {
      const fallback = this.kill10WithOpts(hist, opts);
      for (const f of fallback) {
        if (!finalNums.find(fn => fn.n === f.n)) {
          finalNums.push({ n: f.n, tier: 'S3', repulsionScore: 0, aprioriScore: 0 });
        }
        if (finalNums.length >= 10) break;
      }
    }

    // Build repulsionInfo for frontend
    const repulsionInfo = {
      optimizedParams: {
        repulsionWeight: opts.repulsionWeight,
        aprioriWeight: opts.aprioriWeight,
        repulsionThreshold: opts.repulsionThreshold,
      },
      topRepulsedNumbers: Array.from({ length: 49 }, (_, i) => ({
        n: i + 1,
        repulsionScore: Math.round((repulsionScores[i + 1] || 0) * 100) / 100,
        aprioriScore: Math.round((aprioriResult.scores[i + 1] || 0) * 100) / 100,
      }))
        .filter(x => x.repulsionScore > 0 || x.aprioriScore > 0)
        .sort((a, b) => (b.repulsionScore + b.aprioriScore) - (a.repulsionScore + a.aprioriScore))
        .slice(0, 15),
      aprioriRules: aprioriResult.rules,
    };
    
    return {
      predictions: finalNums.slice(0, 10),
      repulsionInfo,
    };
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
