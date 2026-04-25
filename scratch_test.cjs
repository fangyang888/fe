const fs = require('fs');

const historyRaw = fs.readFileSync('/Users/yang/fe/fe/public/history.txt', 'utf-8');
const history = historyRaw
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => line.split(',').map(n => parseInt(n.trim(), 10)));

const KILL10_PARAM_GRID = [
  { decay: 0.85, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.85, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.85, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.85, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.85, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.85, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
  { decay: 0.9, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 12 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 24 },
  { decay: 0.9, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
  { decay: 0.9, protectWindow: 2, missRiskMult: 3.5, tailBalance: false, altBonus: 18 },
  { decay: 0.95, protectWindow: 1, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 24 },
  { decay: 0.95, protectWindow: 3, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.95, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
  { decay: 0.95, protectWindow: 2, missRiskMult: 3.5, tailBalance: false, altBonus: 18 },
  { decay: 0.8, protectWindow: 2, missRiskMult: 3.0, tailBalance: true, altBonus: 18 },
  { decay: 0.8, protectWindow: 2, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.8, protectWindow: 3, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.8, protectWindow: 1, missRiskMult: 3.5, tailBalance: true, altBonus: 18 },
  { decay: 0.8, protectWindow: 2, missRiskMult: 3.0, tailBalance: false, altBonus: 18 },
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
      let rc = 0,
        rt = 0;
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
      let sk = 0,
        ap = 0;
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
  if (!tailBalance) return scored.slice(0, 10).map((c) => c.n);
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
  return selected.slice(0, 10).map((c) => c.n);
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
  return scored.slice(0, count).map((s) => s.n);
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
      const kill = kill10WithOpts(sub, opts);
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
  const validPicks = lowCVPicks.filter((n) => !top8.includes(n));
  const finalNums = [...top8, ...validPicks];
  if (finalNums.length < 10) {
    const extras = baseNums.slice(8).filter((n) => !finalNums.includes(n));
    finalNums.push(...extras);
  }
  return finalNums.slice(0, 10);
}

console.log('--- 杀码预测结果 ---');
const prediction = strategyAbsoluteSafe(history);
console.log(prediction);
