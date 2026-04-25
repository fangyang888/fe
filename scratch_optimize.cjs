const fs = require('fs');

const historyRaw = fs.readFileSync('/Users/yang/fe/fe/public/history.txt', 'utf-8');
const histData = historyRaw
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => line.split(',').map(n => parseInt(n.trim(), 10)));

const KILL10_PARAM_GRID = [
  { decay: 0.85, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
];

function buildScoreEngineWithOpts(hist, opts) {
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
  const protect = new Set();
  const protectReason = {};
  const extremeMissSet = new Set();
  
  hist.slice(-protectWindow).forEach((r) =>
    r.forEach((n) => {
      protect.add(n);
      protectReason[n] = protectReason[n] || "近" + protectWindow + "期热号";
    }),
  );
  
  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) continue;
    const apps = [];
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
    if (lastIdx === hn - 1) {
      let rc = 0, rt = 0;
      for (let j = 0; j < hist.length - 1; j++) {
        if (hist[j].includes(n)) {
          rt++;
          if (hist[j + 1].includes(n)) rc++;
        }
      }
      if (rt > 2 && rc / rt >= 0.2) {
        protect.add(n);
        protectReason[n] = "重复率高";
      }
    }
    if (lastIdx === hn - 2) {
      let sk = 0, ap = 0;
      for (let j = 0; j < hist.length - 2; j++) {
        if (hist[j].includes(n) && !hist[j + 1].includes(n)) {
          ap++;
          if (hist[j + 2].includes(n)) sk++;
        }
      }
      if (ap > 2 && sk / ap >= 0.25) {
        protect.add(n);
        protectReason[n] = "跳期率高";
      }
    }
  }
  
  if (protect.size > 35) {
    const relaxedMult = missRiskMult * 1.5;
    for (let n = 1; n <= 49; n++) {
      if (!protect.has(n) || extremeMissSet.has(n)) continue;
      if (protectReason[n] && protectReason[n].startsWith('遗漏回归风险')) {
        const apps = [];
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

function kill10WithOpts(hist, opts) {
  const { tailBalance, altBonus } = opts;
  const N = hist.length;
  const { candidates } = buildScoreEngineWithOpts(hist, opts);
  const scored = candidates.map((c) => {
    const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
    const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
    const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
    let bonus = 0;
    if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -altBonus;
    if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +altBonus;
    return { ...c, adjustedW: c.w + bonus };
  });
  
  scored.sort((a, b) => a.adjustedW - b.adjustedW);
  if (!tailBalance) return scored.slice(0, 10);
  
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
  return selected.slice(0, 10);
}

function pickLowCVFromLastRow(hist, count = 2) {
  if (hist.length < 2) return [];
  const lastRow = hist[hist.length - 1];
  const hn = hist.length;
  const scored = lastRow.map((n) => {
    const apps = [];
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

function getAdaptiveKill10Opts(hist) {
  const DEFAULT = { decay: 0.9, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 };
  const evalWindow = Math.min(30, hist.length - 10);
  let bestOpts = DEFAULT, bestScore = -1;
  for (const opts of KILL10_PARAM_GRID) {
    let correct = 0, total = 0;
    const start = hist.length - evalWindow;
    for (let i = start; i < hist.length - 1; i++) {
      const sub = hist.slice(0, i + 1);
      const kill = kill10WithOpts(sub, opts).map(c => c.n);
      const nextSet = new Set(hist[i + 1]);
      correct += kill.filter((n) => !nextSet.has(n)).length;
      total += 10;
    }
    const acc = correct / total;
    if (acc > bestScore) {
      bestScore = acc;
      bestOpts = opts;
    }
  }
  return bestOpts;
}

function strategyAbsoluteSafe(hist) {
  const opts = getAdaptiveKill10Opts(hist);
  const baseNums = kill10WithOpts(hist, opts);
  const lowCVPicks = pickLowCVFromLastRow(hist, 2);
  
  const top8 = baseNums.slice(0, 8);
  const top8Nums = top8.map(c => c.n);
  
  const validPicks = lowCVPicks.filter((p) => !top8Nums.includes(p.n)).map(p => ({ n: p.n, reason: "上期低CV", tier: "C2" }));
  const finalNums = [...top8.map((c, i) => ({ ...c, tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3' })), ...validPicks];
  
  if (finalNums.length < 10) {
    const extras = baseNums.slice(8).filter((c) => !finalNums.find(f => f.n === c.n));
    extras.forEach(e => finalNums.push({ ...e, tier: 'S3' }));
  }
  return finalNums.slice(0, 10);
}

function strategyEnhanced(hist) {
  const opts = getAdaptiveKill10Opts(hist);
  const { candidates } = buildScoreEngineWithOpts(hist, opts);
  
  // Protect numbers that appeared >= 2 times in the last 5 periods
  const last5 = hist.slice(-5);
  const hotInLast5 = new Set();
  const freqLast5 = {};
  last5.forEach(r => r.forEach(n => {
    freqLast5[n] = (freqLast5[n] || 0) + 1;
    if (freqLast5[n] >= 2) hotInLast5.add(n);
  }));
  
  const filteredCandidates = candidates.filter(c => !hotInLast5.has(c.n));
  
  const N = hist.length;
  const scored = filteredCandidates.map((c) => {
    const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
    const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
    const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
    let bonus = 0;
    if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -opts.altBonus;
    if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +opts.altBonus;
    return { ...c, adjustedW: c.w + bonus };
  });
  
  scored.sort((a, b) => a.adjustedW - b.adjustedW);
  
  const baseNums = scored.slice(0, 15).map(c => c.n); // take more to allow filtering
  
  // test static opts
function findBestStaticOpts() {
  let bestAcc = 0;
  let bestOpts = null;
  for (const opts of KILL10_PARAM_GRID) {
    function staticStrategy(hist) {
      const { candidates } = buildScoreEngineWithOpts(hist, opts);
      const last5 = hist.slice(-5);
      const hotInLast5 = new Set();
      const freqLast5 = {};
      last5.forEach(r => r.forEach(n => {
        freqLast5[n] = (freqLast5[n] || 0) + 1;
        if (freqLast5[n] >= 2) hotInLast5.add(n);
      }));
      const filtered = candidates.filter(c => !hotInLast5.has(c.n));
      const N = hist.length;
      const scored = filtered.map((c) => {
        const p1 = hist[N - 1]?.includes(c.n) ? 1 : 0;
        const p2 = hist[N - 2]?.includes(c.n) ? 1 : 0;
        const p3 = hist[N - 3]?.includes(c.n) ? 1 : 0;
        let bonus = 0;
        if (p1 === 1 && p2 === 0 && p3 === 1) bonus = -opts.altBonus;
        if (p1 === 0 && p2 === 1 && p3 === 0) bonus = +opts.altBonus;
        return { ...c, adjustedW: c.w + bonus };
      });
      scored.sort((a, b) => a.adjustedW - b.adjustedW);
      if (!opts.tailBalance) return scored.slice(0, 10).map(c => ({n: c.n}));
      
      const tailCounts = Array(10).fill(0);
      const selected = [];
      for (const c of scored) {
        if (selected.length >= 10) break;
        const tail = c.n % 10;
        if (tailCounts[tail] < 2) { selected.push(c); tailCounts[tail]++; }
      }
      for (const c of scored) {
        if (selected.length >= 10) break;
        if (!selected.find((s) => s.n === c.n)) selected.push(c);
      }
      return selected.slice(0, 10).map(c => ({n: c.n}));
    }
    const acc = runBacktest(histData, 10, staticStrategy);
    if (acc > bestAcc) {
      bestAcc = acc;
      bestOpts = opts;
    }
  }
  console.log("Best Static Opts Acc:", bestAcc, bestOpts);
}
findBestStaticOpts();

  const lowCVPicks = pickLowCVFromLastRow(hist, 2);
  const top8 = baseNums.slice(0, 8);
  const top8Nums = top8;
  const validPicks = lowCVPicks.filter((p) => !top8Nums.includes(p)).map(p => ({ n: p, reason: "上期低CV", tier: "C2" }));
  const finalNums = [...top8.map((n, i) => ({ n, tier: i < 3 ? 'S1' : i < 6 ? 'S2' : 'S3' })), ...validPicks];
  
  if (finalNums.length < 10) {
    const extras = baseNums.slice(8).filter((c) => !finalNums.find(f => f.n === c));
    extras.forEach(e => finalNums.push({ n: e, tier: 'S3' }));
  }
  return finalNums.slice(0, 10);
}

function runBacktest(hist, periods = 10, predictFunc) {
  let totalCorrect = 0;
  let totalPredicted = 0;
  const startIndex = hist.length - periods;
  for (let i = startIndex; i < hist.length; i++) {
    const subHist = hist.slice(0, i);
    const actualRow = hist[i];
    const killNumsObj = predictFunc(subHist);
    const killNums = killNumsObj.map(k => k.n || k);
    const actualSet = new Set(actualRow);
    const failed = killNums.filter(n => actualSet.has(n));
    const correctCount = killNums.length - failed.length;
    totalCorrect += correctCount;
    totalPredicted += killNums.length;
  }
  return totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;
}

console.log("Current Accuracy 10 periods: ", runBacktest(histData, 10, strategyAbsoluteSafe).toFixed(2), "%");

// Test Lowest Frequency Strategy
function testLowestFreq(hist) {
  const hn = hist.length;
  const freqs = Array(50).fill(0);
  // look at last 20 periods
  const lookback = Math.min(20, hn);
  hist.slice(-lookback).forEach(r => r.forEach(n => freqs[n]++));
  
  const candidates = [];
  for (let n = 1; n <= 49; n++) {
    candidates.push({ n, freq: freqs[n] });
  }
  candidates.sort((a, b) => a.freq - b.freq);
  return candidates.slice(0, 10);
}
console.log("Lowest Freq 10 periods: ", runBacktest(histData, 10, testLowestFreq).toFixed(2), "%");
console.log("Lowest Freq 50 periods: ", runBacktest(histData, 50, testLowestFreq).toFixed(2), "%");



