import fs from 'fs';
import path from 'path';

function loadHist(): number[][] {
  const content = fs.readFileSync(path.join(process.cwd(), 'public', 'history.txt'), 'utf-8');
  return content.trim().split('\n').map(line => {
    return line.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
  }).filter(row => row.length === 7).reverse();
}

class PredictorService {
  private getBaseParamGrid() {
    const grid: any[] = [];
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
    const grid: any[] = [];
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
      row.forEach((n) => { wFreq[n] += w; });
    });
    const protect = new Set<number>();
    const protectReason: any = {};
    const extremeMissSet = new Set<number>();
    hist.slice(-protectWindow).forEach((r) =>
      r.forEach((n) => { protect.add(n); protectReason[n] = protectReason[n] || "近" + protectWindow + "期热号"; }),
    );
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps: number[] = [];
      hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
      if (apps.length < 3) continue;
      const lastIdx = apps[apps.length - 1];
      const gaps: number[] = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
      const lastMiss = hn - 1 - lastIdx;
      if (avgGap > 0 && lastMiss / avgGap >= 5) { extremeMissSet.add(n); continue; }
      if (lastMiss >= avgGap * missRiskMult) { protect.add(n); continue; }
      if (apps.length >= 4) {
        const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv > 0.85 && lastMiss < avgGap * 1.5) { protect.add(n); continue; }
      }
    }
    if (protect.size > 35) {
      const relaxedMult = missRiskMult * 1.5;
      for (let n = 1; n <= 49; n++) {
        if (!protect.has(n) || extremeMissSet.has(n)) continue;
        const apps: number[] = [];
        hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
        if (apps.length < 3) continue;
        const gaps: number[] = [];
        for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
        const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
        const lastMiss = hn - 1 - apps[apps.length - 1];
        if (lastMiss < avgGap * relaxedMult) { protect.delete(n); }
      }
    }
    const candidates: any[] = [];
    for (let n = 1; n <= 49; n++) {
      if (!protect.has(n) && !extremeMissSet.has(n))
        candidates.push({ n, w: wFreq[n], reason: '' });
    }
    candidates.sort((a, b) => a.w - b.w);
    return { candidates };
  }

  private kill10WithOpts(hist: number[][], opts: any) {
    const { tailBalance, altBonus } = opts;
    const N = hist.length;
    const { candidates } = this.buildScoreEngineWithOpts(hist, opts);
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
    const selected: any[] = [];
    for (const c of scored) {
      if (selected.length >= 10) break;
      const tail = c.n % 10;
      if (tailCounts[tail] < 2) { selected.push(c); tailCounts[tail]++; }
    }
    for (const c of scored) {
      if (selected.length >= 10) break;
      if (!selected.find((s: any) => s.n === c.n)) selected.push(c);
    }
    return selected.slice(0, 10).map(c => ({n: c.n, w: c.w}));
  }

  private getAdaptiveKill10Opts(hist: number[][]) {
    const baseGrid = this.getBaseParamGrid();
    const evalWindow = Math.min(50, hist.length - 10);
    const baseResults: { opts: any; score: number }[] = [];
    for (const opts of baseGrid) {
      let correct = 0, total = 0;
      const start = hist.length - evalWindow;
      for (let i = start; i < hist.length - 1; i++) {
        const sub = hist.slice(0, i + 1);
        const kill = this.kill10WithOpts(sub, opts).map(c => c.n);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter((n) => !nextSet.has(n)).length;
        total += 10;
      }
      baseResults.push({ opts, score: total > 0 ? correct / total : 0 });
    }
    baseResults.sort((a, b) => b.score - a.score);
    const top5Base = baseResults.slice(0, 5);
    const repulsionGrid = this.getRepulsionParamGrid();
    let bestOpts = { ...top5Base[0].opts, repulsionWeight: 0.5, aprioriWeight: 0.5, repulsionThreshold: 0.10 };
    let bestScore = top5Base[0].score;
    for (const base of top5Base) {
      for (const rep of repulsionGrid) {
        const combined = { ...base.opts, ...rep };
        let correct = 0, total = 0;
        const start = hist.length - evalWindow;
        for (let i = start; i < hist.length - 1; i++) {
          const sub = hist.slice(0, i + 1);
          const kill = this.kill10WithRepulsion(sub, combined).map(c => c.n);
          const nextSet = new Set(hist[i + 1]);
          correct += kill.filter((n) => !nextSet.has(n)).length;
          total += 10;
        }
        const acc = total > 0 ? correct / total : 0;
        if (acc > bestScore) { bestScore = acc; bestOpts = combined; }
      }
    }
    return bestOpts;
  }

  private kill10WithRepulsion(hist: number[][], opts: any) {
    let baseNums = this.kill10WithOpts(hist, opts);
    const { repulsionWeight = 0.5, aprioriWeight = 0.5, repulsionThreshold = 0.10 } = opts;
    const repulsionScores = this.getCrossPerioRepulsionScores(hist, repulsionThreshold);
    const aprioriScores = this.getAprioriRepulsionRules(hist);
    const reScored = baseNums.map(c => ({
      ...c,
      w: c.w - (repulsionScores[c.n] || 0) * repulsionWeight - (aprioriScores.scores[c.n] || 0) * aprioriWeight
    }));
    reScored.sort((a, b) => a.w - b.w);
    return reScored.slice(0, 10);
  }

  private pickLowCVFromLastRow(hist: number[][], count = 2) {
    if (hist.length < 2) return [];
    const lastRow = hist[hist.length - 1];
    const scored = lastRow.map((n) => {
      const apps: number[] = [];
      hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
      if (apps.length < 2) return { n, cv: 1 };
      const gaps: number[] = [];
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
      for (const n1 of hist[i]) {
        counts[n1]++;
        for (const n2 of hist[i + 1]) { matrix[n1][n2]++; }
      }
    }
    for (let i = 1; i <= 49; i++) {
      if (counts[i] > 0) { for (let j = 1; j <= 49; j++) { matrix[i][j] /= counts[i]; } }
    }
    const lastRow = hist[hist.length - 1];
    const nextProbs = Array(50).fill(0);
    for (let j = 1; j <= 49; j++) {
      let probSum = 0;
      for (const n1 of lastRow) { probSum += matrix[n1][j]; }
      nextProbs[j] = probSum / lastRow.length;
    }
    return nextProbs;
  }

  // === NEW: 2nd-order Markov (FIXED) ===
  private getMarkovOrder2Predictions(hist: number[][]) {
    if (hist.length < 3) return Array(50).fill(0);
    // Use compressed state: for each pair (a from T-2, b from T-1), count transitions to c at T
    const stateCount = new Map<string, number>();
    const transCount = new Map<string, number>();

    for (let i = 0; i < hist.length - 2; i++) {
      for (const a of hist[i]) {
        for (const b of hist[i + 1]) {
          const keyAB = `${a},${b}`;
          stateCount.set(keyAB, (stateCount.get(keyAB) || 0) + 1);
          for (const c of hist[i + 2]) {
            const keyABC = `${a},${b},${c}`;
            transCount.set(keyABC, (transCount.get(keyABC) || 0) + 1);
          }
        }
      }
    }

    const secondLastRow = hist[hist.length - 2];
    const lastRow = hist[hist.length - 1];
    const nextProbs = Array(50).fill(0);

    for (let c = 1; c <= 49; c++) {
      let probSum = 0;
      let validStates = 0;
      for (const a of secondLastRow) {
        for (const b of lastRow) {
          const keyAB = `${a},${b}`;
          const sc = stateCount.get(keyAB) || 0;
          if (sc >= 2) { // Only trust states with enough data
            const keyABC = `${a},${b},${c}`;
            probSum += (transCount.get(keyABC) || 0) / sc;
            validStates++;
          }
        }
      }
      nextProbs[c] = validStates > 0 ? probSum / validStates : 0;
    }
    return nextProbs;
  }

  private getCrossPerioRepulsionScores(hist: number[][], threshold = 0.10): number[] {
    const scores = new Array(50).fill(0);
    if (hist.length < 5) return scores;
    const coMatrix = Array(50).fill(0).map(() => Array(50).fill(0));
    const srcCounts = Array(50).fill(0);
    for (let i = 0; i < hist.length - 1; i++) {
      for (const a of hist[i]) {
        srcCounts[a]++;
        for (const b of hist[i + 1]) { coMatrix[a][b]++; }
      }
    }
    const probMatrix = Array(50).fill(0).map(() => Array(50).fill(0));
    for (let a = 1; a <= 49; a++) {
      if (srcCounts[a] > 0) { for (let b = 1; b <= 49; b++) { probMatrix[a][b] = coMatrix[a][b] / srcCounts[a]; } }
    }
    const lastRow = hist[hist.length - 1];
    for (let b = 1; b <= 49; b++) {
      let avgProb = 0, validSources = 0;
      for (const a of lastRow) {
        if (srcCounts[a] >= 3) { avgProb += probMatrix[a][b]; validSources++; }
      }
      if (validSources > 0) {
        avgProb /= validSources;
        if (avgProb < threshold) { scores[b] = (threshold - avgProb) / threshold * 10; }
      }
    }
    return scores;
  }

  private getAprioriRepulsionRules(hist: number[][]): { scores: number[]; rules: any[] } {
    const scores = new Array(50).fill(0);
    const rules: any[] = [];
    if (hist.length < 10) return { scores, rules };
    const MIN_SUPPORT = 3, MIN_CONFIDENCE = 0.85;
    const lastRow = hist[hist.length - 1];
    const lastRowSet = new Set(lastRow);
    const pairOccurrences: Map<string, number[]> = new Map();
    for (let i = 0; i < hist.length - 1; i++) {
      const row = hist[i];
      for (let x = 0; x < row.length; x++) {
        for (let y = x + 1; y < row.length; y++) {
          const a = Math.min(row[x], row[y]), b = Math.max(row[x], row[y]);
          if (!lastRowSet.has(a) || !lastRowSet.has(b)) continue;
          const key = `${a},${b}`;
          if (!pairOccurrences.has(key)) pairOccurrences.set(key, []);
          pairOccurrences.get(key)!.push(i);
        }
      }
    }
    for (const [pairKey, indices] of pairOccurrences.entries()) {
      if (indices.length < MIN_SUPPORT) continue;
      const nextAppearCount: Record<number, number> = {};
      for (const idx of indices) {
        if (idx + 1 < hist.length) { for (const c of hist[idx + 1]) { nextAppearCount[c] = (nextAppearCount[c] || 0) + 1; } }
      }
      const totalNextPeriods = indices.filter(idx => idx + 1 < hist.length).length;
      if (totalNextPeriods < MIN_SUPPORT) continue;
      for (let c = 1; c <= 49; c++) {
        const appeared = nextAppearCount[c] || 0;
        const confidence = (totalNextPeriods - appeared) / totalNextPeriods;
        if (confidence >= MIN_CONFIDENCE) {
          rules.push({ pair: pairKey.split(',').map(Number), target: c, support: totalNextPeriods, confidence });
          scores[c] += confidence * Math.log2(totalNextPeriods + 1);
        }
      }
    }
    const maxScore = Math.max(...scores.slice(1), 0.001);
    for (let i = 1; i <= 49; i++) { scores[i] = (scores[i] / maxScore) * 10; }
    rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);
    return { scores, rules: rules.slice(0, 30) };
  }

  // === V1: Original strategy ===
  public strategyV1(hist: number[][]): { predictions: any[] } {
    const opts = this.getAdaptiveKill10Opts(hist);
    let baseNums = this.kill10WithRepulsion(hist, opts);
    const markovProbs = this.getMarkovPredictions(hist);
    baseNums = baseNums.filter(c => markovProbs[c.n] <= 0.22);

    const lowCVPicks = this.pickLowCVFromLastRow(hist, 2);
    const top8 = baseNums.slice(0, 8);
    const top8Nums = top8.map(c => c.n);
    const validPicks = lowCVPicks.filter((p) => !top8Nums.includes(p.n)).map(p => ({ n: p.n, tier: 'C2' }));
    const finalNums: any[] = [...top8.map((c, i) => ({ n: c.n, tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3' })), ...validPicks];
    if (finalNums.length < 10) {
      const extras = baseNums.slice(8).filter((c) => !finalNums.find(f => f.n === c.n));
      extras.forEach(e => finalNums.push({ n: e.n, tier: 'S3' }));
    }
    if (finalNums.length < 10) {
      const fallback = this.kill10WithOpts(hist, opts);
      for (const f of fallback) {
        if (!finalNums.find(fn => fn.n === f.n)) finalNums.push({ n: f.n, tier: 'S3' });
        if (finalNums.length >= 10) break;
      }
    }
    return { predictions: finalNums.slice(0, 10) };
  }

  // === V2: Markov-2 baked into scoring + macro protect in score engine ===
  private kill10V2(hist: number[][], opts: any) {
    const { decay, protectWindow, missRiskMult, tailBalance, altBonus } = opts;
    const hn = hist.length;
    const N = hn;

    // Weighted frequency
    const wFreq = new Array(50).fill(0);
    hist.forEach((row, idx) => {
      const age = hn - 1 - idx;
      const w = Math.pow(decay, age);
      row.forEach((n) => { wFreq[n] += w; });
    });

    // Markov order-1 + order-2 blended probabilities
    const m1 = this.getMarkovPredictions(hist);
    const m2 = this.getMarkovOrder2Predictions(hist);
    const markovBlend = Array(50).fill(0);
    for (let n = 1; n <= 49; n++) markovBlend[n] = m1[n] * 0.6 + m2[n] * 0.4;

    // Macro: parity stats over last 3 periods
    let recentOdd = 0, recentEven = 0;
    for (let i = Math.max(0, hn - 3); i < hn; i++)
      hist[i].forEach(n => n % 2 !== 0 ? recentOdd++ : recentEven++);
    const totalRecent = recentOdd + recentEven;
    const parityRatio = totalRecent > 0 ? recentOdd / totalRecent : 0.5;

    // Macro: zone stats over last 3 periods (1-16, 17-33, 34-49)
    let z1 = 0, z2 = 0, z3 = 0;
    for (let i = Math.max(0, hn - 3); i < hn; i++)
      hist[i].forEach(n => { if (n <= 16) z1++; else if (n <= 33) z2++; else z3++; });

    // Build protect set
    const protect = new Set<number>();
    hist.slice(-protectWindow).forEach((r) => r.forEach((n) => protect.add(n)));
    for (let n = 1; n <= 49; n++) {
      if (protect.has(n)) continue;
      const apps: number[] = [];
      hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
      if (apps.length < 3) continue;
      const gaps: number[] = [];
      for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const lastMiss = hn - 1 - apps[apps.length - 1];
      if (avgGap > 0 && lastMiss / avgGap >= 5) continue; // extreme miss, can kill
      if (lastMiss >= avgGap * missRiskMult) { protect.add(n); continue; }
      if (apps.length >= 4) {
        const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv > 0.85 && lastMiss < avgGap * 1.5) { protect.add(n); continue; }
      }
    }

    // Relax if too many protected
    if (protect.size > 35) {
      for (let n = 1; n <= 49; n++) {
        if (protect.size <= 35) break;
        if (!protect.has(n)) continue;
        const inRecent = hist.slice(-protectWindow).some(r => r.includes(n));
        if (!inRecent && markovBlend[n] <= 0.19) protect.delete(n);
      }
    }

    const candidates: any[] = [];
    for (let n = 1; n <= 49; n++) {
      if (!protect.has(n)) {
        // Soft macro penalty instead of hard block
        let macroPenalty = 0;
        // Parity: penalize killing the underrepresented parity
        if (parityRatio > 0.67 && n % 2 === 0) macroPenalty -= 5; // protect evens
        if (parityRatio < 0.33 && n % 2 !== 0) macroPenalty -= 5; // protect odds
        // Zone: penalize killing from underrepresented zones
        if (n <= 16 && z1 < 3) macroPenalty -= 4;
        if (n > 16 && n <= 33 && z2 < 3) macroPenalty -= 4;
        if (n > 33 && z3 < 3) macroPenalty -= 4;
        candidates.push({ n, w: wFreq[n] });
      }
    }
    candidates.sort((a, b) => a.w - b.w);

    // Hot-in-last-5 filter
    const hotInLast5 = new Set<number>();
    const freqLast5: Record<number, number> = {};
    hist.slice(-5).forEach(r => r.forEach(n => {
      freqLast5[n] = (freqLast5[n] || 0) + 1;
      if (freqLast5[n] >= 2) hotInLast5.add(n);
    }));
    const filtered = candidates.filter(c => !hotInLast5.has(c.n));

    // Alt-pattern scoring
    const scored = filtered.map((c) => {
      const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
      const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
      const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
      let bonus = 0;
      if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -altBonus;
      if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +altBonus;
      // Markov blend penalty (order-1 + order-2): riskier numbers get pushed up
      const markovPenalty = markovBlend[c.n] * 50;
      return { ...c, adjustedW: c.w + bonus + markovPenalty };
    });
    scored.sort((a, b) => a.adjustedW - b.adjustedW);

    if (!tailBalance) return scored.slice(0, 10).map(c => ({n: c.n, w: c.w}));
    const tailCounts = Array(10).fill(0);
    const selected: any[] = [];
    for (const c of scored) {
      if (selected.length >= 10) break;
      const tail = c.n % 10;
      if (tailCounts[tail] < 2) { selected.push(c); tailCounts[tail]++; }
    }
    for (const c of scored) {
      if (selected.length >= 10) break;
      if (!selected.find((s: any) => s.n === c.n)) selected.push(c);
    }
    return selected.slice(0, 10).map(c => ({n: c.n, w: c.w}));
  }

  public strategyV2(hist: number[][]): { predictions: any[] } {
    // Use the same grid-search optimized opts, but feed them to V2 kill pipeline
    const opts = this.getAdaptiveKill10Opts(hist);
    let baseNums = this.kill10V2(hist, opts);

    const lowCVPicks = this.pickLowCVFromLastRow(hist, 2);
    const top8 = baseNums.slice(0, 8);
    const top8Nums = top8.map(c => c.n);
    const validPicks = lowCVPicks.filter((p) => !top8Nums.includes(p.n)).map(p => ({ n: p.n, tier: 'C2' }));
    const finalNums: any[] = [...top8.map((c, i) => ({ n: c.n, tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3' })), ...validPicks];
    if (finalNums.length < 10) {
      const extras = baseNums.slice(8).filter((c) => !finalNums.find(f => f.n === c.n));
      extras.forEach(e => finalNums.push({ n: e.n, tier: 'S3' }));
    }
    if (finalNums.length < 10) {
      const fallback = this.kill10WithOpts(hist, opts);
      for (const f of fallback) {
        if (!finalNums.find(fn => fn.n === f.n)) finalNums.push({ n: f.n, tier: 'S3' });
        if (finalNums.length >= 10) break;
      }
    }
    return { predictions: finalNums.slice(0, 10) };
  }

  public runBacktest(hist: number[][], calcPeriods = 50) {
    const actualCalcPeriods = Math.min(hist.length - 20, calcPeriods);
    if (actualCalcPeriods <= 0) { console.log('Not enough data'); return null; }

    let totalCorrectV1 = 0, totalCorrectV2 = 0;
    let totalPredictedV1 = 0, totalPredictedV2 = 0;
    let v1Wins = 0, v2Wins = 0, ties = 0;

    const startIndex = hist.length - actualCalcPeriods;
    console.log(`Backtesting ${actualCalcPeriods} periods (index ${startIndex} to ${hist.length - 1})...`);

    for (let i = startIndex; i < hist.length; i++) {
      const subHist = hist.slice(0, i);
      if (subHist.length < 15) continue;
      const actualSet = new Set(hist[i]);

      const { predictions: pV1 } = this.strategyV1(subHist);
      const { predictions: pV2 } = this.strategyV2(subHist);

      const k1 = pV1.map(k => k.n);
      const k2 = pV2.map(k => k.n);

      const correctV1 = k1.filter(n => !actualSet.has(n)).length;
      const correctV2 = k2.filter(n => !actualSet.has(n)).length;

      totalCorrectV1 += correctV1;
      totalPredictedV1 += k1.length;
      totalCorrectV2 += correctV2;
      totalPredictedV2 += k2.length;

      if (correctV1 > correctV2) v1Wins++;
      else if (correctV2 > correctV1) v2Wins++;
      else ties++;
    }

    const accV1 = totalPredictedV1 > 0 ? (totalCorrectV1 / totalPredictedV1 * 100).toFixed(2) : '0';
    const accV2 = totalPredictedV2 > 0 ? (totalCorrectV2 / totalPredictedV2 * 100).toFixed(2) : '0';

    console.log('\n=== RESULTS ===');
    console.log(`V1 (original):       ${accV1}% (${totalCorrectV1}/${totalPredictedV1})`);
    console.log(`V2 (markov2+macro):  ${accV2}% (${totalCorrectV2}/${totalPredictedV2})`);
    console.log(`V1 wins: ${v1Wins}, V2 wins: ${v2Wins}, ties: ${ties}`);
    console.log(`Improvement: ${(parseFloat(accV2) - parseFloat(accV1)).toFixed(2)}%`);
  }
}

const hist = loadHist();
console.log(`Loaded ${hist.length} periods`);
const s = new PredictorService();
s.runBacktest(hist, 50);
