/**
 * 多模型集成投票回测
 * 算法A：指数衰减冷度（当前主算法）
 * 算法B：马尔可夫相似局面预测
 * 算法C：遗漏周期预测
 * 投票规则：3个算法各自对49个号码打分，加权求和后选最冷的10个
 */
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, 'public/history.txt'), 'utf-8');
const history = raw.trim().split('\n')
  .map(l => l.trim()).filter(Boolean)
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 49))
  .filter(r => r.length === 7);

console.log(`\n✅ 共 ${history.length} 期数据\n`);

// ══════════════════════════════════════════
// 算法A：指数衰减冷度评分（越冷分越高）
// ══════════════════════════════════════════
function scoreA(hist, opts = {}) {
  const { decay = 0.85, protectWindow = 2, missRiskMult = 2.0 } = opts;
  const hn = hist.length;
  const wFreq = new Array(50).fill(0);
  hist.forEach((row, idx) => {
    const age = hn - 1 - idx;
    const w = Math.pow(decay, age);
    row.forEach(n => { wFreq[n] += w; });
  });
  const protect = new Set();
  hist.slice(-protectWindow).forEach(r => r.forEach(n => protect.add(n)));
  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) continue;
    const apps = [];
    hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
    if (apps.length < 3) continue;
    const lastIdx = apps[apps.length - 1];
    const gaps = [];
    for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : hn / 7;
    const lastMiss = hn - 1 - lastIdx;
    if (lastMiss >= avgGap * missRiskMult) { protect.add(n); continue; }
    if (lastIdx === hn - 1) {
      let rc = 0, rt = 0;
      for (let j = 0; j < hn - 1; j++) {
        if (hist[j].includes(n)) { rt++; if (hist[j + 1].includes(n)) rc++; }
      }
      if (rt > 2 && rc / rt >= 0.20) protect.add(n);
    }
    if (lastIdx === hn - 2) {
      let sk = 0, ap = 0;
      for (let j = 0; j < hn - 2; j++) {
        if (hist[j].includes(n) && !hist[j + 1].includes(n)) { ap++; if (hist[j + 2].includes(n)) sk++; }
      }
      if (ap > 2 && sk / ap >= 0.25) protect.add(n);
    }
  }
  // 返回每个号码的「冷度分」（越高越冷）
  const scores = new Array(50).fill(0);
  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) { scores[n] = -9999; continue; } // 保护号=强制不杀
    scores[n] = -wFreq[n]; // 频率越低冷度越高
  }
  return scores;
}

// ══════════════════════════════════════════
// 算法B：马尔可夫相似局面预测
// 找与上期最相似的历史局面，统计其下一期开了哪些号
// 「下一期出现频率越高」= 下期越可能出现 = 杀码分越低
// ══════════════════════════════════════════
function scoreB(hist, overlapThresh = 1) {
  const hn = hist.length;
  const lastRow = hist[hn - 1];
  const afterFreq = new Array(50).fill(0);
  let simCount = 0;
  for (let i = 0; i < hn - 1; i++) {
    const overlap = hist[i].filter(n => lastRow.includes(n)).length;
    if (overlap >= overlapThresh) {
      hist[i + 1].forEach(n => { afterFreq[n]++; });
      simCount++;
    }
  }
  const scores = new Array(50).fill(0);
  for (let n = 1; n <= 49; n++) {
    const freq = simCount > 0 ? afterFreq[n] / simCount : 1 / 7;
    scores[n] = -freq; // 下期出现频率越高 = 冷度越低（不应杀）
  }
  return scores;
}

// ══════════════════════════════════════════
// 算法C：遗漏周期预测
// 综合遗漏期数 + 平均间隔 + 变异系数
// 「遗漏期/平均间隔」比值越低 = 越不该出现 = 杀码分越高
// ══════════════════════════════════════════
function scoreC(hist) {
  const hn = hist.length;
  const scores = new Array(50).fill(0);
  const protect = new Set();
  hist.slice(-2).forEach(r => r.forEach(n => protect.add(n)));

  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) { scores[n] = -9999; continue; }
    const apps = [];
    hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
    if (apps.length < 2) { scores[n] = 0; continue; }
    const lastIdx = apps[apps.length - 1];
    const gaps = [];
    for (let i = 1; i < apps.length; i++) gaps.push(apps[i] - apps[i - 1]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const lastMiss = hn - 1 - lastIdx;
    const missRatio = lastMiss / (avgGap || 1);
    // 遗漏超2倍均值 → 回归风险 → 不应杀
    if (missRatio >= 2.0) { scores[n] = -9999; continue; }
    // missRatio 越低（刚出现）= 越冷 = 越应杀
    // missRatio 在 0.3~1.0 之间最适合杀
    let coldScore = 0;
    if (missRatio >= 0.3 && missRatio <= 1.2) {
      coldScore = 1.0 - Math.abs(missRatio - 0.7) / 0.7;
    } else if (missRatio < 0.3) {
      coldScore = missRatio / 0.3 * 0.5;
    } else {
      coldScore = Math.max(0, 1.5 - missRatio) * 0.5;
    }
    // CV稳定性加权
    if (apps.length >= 4) {
      const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
      const cv = avgGap > 0 ? stdDev / avgGap : 1;
      coldScore *= (1 - cv * 0.3);
    }
    scores[n] = coldScore;
  }
  return scores;
}

// ══════════════════════════════════════════
// 集成投票：加权融合三个算法的评分
// ══════════════════════════════════════════
function ensembleKill(hist, killCount, weights = [0.45, 0.30, 0.25], opts = {}) {
  const sA = scoreA(hist, opts);
  const sB = scoreB(hist);
  const sC = scoreC(hist);

  // 各算法分数归一化到 [0,1]
  function normalize(arr) {
    const valid = arr.filter(v => v > -9000);
    if (valid.length === 0) return arr.map(() => 0);
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    return arr.map(v => v <= -9000 ? -9999 : (v - min) / range);
  }

  const nA = normalize(sA);
  const nB = normalize(sB);
  const nC = normalize(sC);

  const combined = new Array(50).fill(0);
  for (let n = 1; n <= 49; n++) {
    if (nA[n] <= -9000 || nB[n] <= -9000 || nC[n] <= -9000) {
      combined[n] = -9999;
      continue;
    }
    combined[n] = nA[n] * weights[0] + nB[n] * weights[1] + nC[n] * weights[2];
  }

  // 冷热交替检测加分
  const N = hist.length;
  for (let n = 1; n <= 49; n++) {
    if (combined[n] <= -9000) continue;
    const p1 = hist[N-1]?.includes(n) ? 1 : 0;
    const p2 = hist[N-2]?.includes(n) ? 1 : 0;
    const p3 = hist[N-3]?.includes(n) ? 1 : 0;
    if (p1 === 1 && p2 === 0 && p3 === 1) combined[n] -= 0.15; // 交替出=下期可能冷
    if (p1 === 0 && p2 === 1 && p3 === 0) combined[n] += 0.15; // 交替缺=下期可能热
  }

  // 按综合分从高到低排序，取前 killCount
  const candidates = [];
  for (let n = 1; n <= 49; n++) {
    if (combined[n] > -9000) candidates.push({ n, score: combined[n] });
  }
  candidates.sort((a, b) => b.score - a.score);

  // 尾数平衡
  const tailCounts = Array(10).fill(0);
  const selected = [];
  for (const c of candidates) {
    if (selected.length >= killCount) break;
    const tail = c.n % 10;
    if (tailCounts[tail] < 2) { selected.push(c.n); tailCounts[tail]++; }
  }
  for (const c of candidates) {
    if (selected.length >= killCount) break;
    if (!selected.includes(c.n)) selected.push(c.n);
  }
  return selected.slice(0, killCount);
}

// ══════════════════════════════════════════
// 自适应权重学习（每5期更新一次）
// ══════════════════════════════════════════
const WEIGHT_GRID = [];
for (const wA of [0.3, 0.4, 0.5, 0.6]) {
  for (const wB of [0.2, 0.3, 0.4]) {
    const wC = Math.round((1 - wA - wB) * 10) / 10;
    if (wC >= 0.1 && wC <= 0.4) WEIGHT_GRID.push([wA, wB, wC]);
  }
}

const OPTS_GRID = [
  { decay: 0.80, protectWindow: 2, missRiskMult: 2.0 },
  { decay: 0.85, protectWindow: 2, missRiskMult: 2.0 },
  { decay: 0.90, protectWindow: 1, missRiskMult: 1.5 },
  { decay: 0.85, protectWindow: 3, missRiskMult: 2.5 },
];

let cachedWeights = [0.45, 0.30, 0.25];
let cachedOpts = OPTS_GRID[1];
let cacheLearnedAt = -1;

function getAdaptiveParams(hist, killCount) {
  if (hist.length < 30) return { weights: cachedWeights, opts: cachedOpts };
  if (cacheLearnedAt > 0 && hist.length - cacheLearnedAt < 5) {
    return { weights: cachedWeights, opts: cachedOpts };
  }
  const evalWindow = Math.min(25, hist.length - 10);
  let bestWeights = cachedWeights, bestOpts = cachedOpts, bestScore = -1;
  for (const opts of OPTS_GRID) {
    for (const weights of WEIGHT_GRID) {
      let correct = 0, total = 0;
      const start = hist.length - evalWindow;
      for (let i = start; i < hist.length - 1; i++) {
        const sub = hist.slice(0, i + 1);
        const kill = ensembleKill(sub, killCount, weights, opts);
        const nextSet = new Set(hist[i + 1]);
        correct += kill.filter(n => !nextSet.has(n)).length;
        total += killCount;
      }
      const acc = correct / total;
      if (acc > bestScore) { bestScore = acc; bestWeights = weights; bestOpts = opts; }
    }
  }
  cachedWeights = bestWeights;
  cachedOpts = bestOpts;
  cacheLearnedAt = hist.length;
  return { weights: bestWeights, opts: bestOpts };
}

// ══════════════════════════════════════════
// 回测
// ══════════════════════════════════════════
function runEnsembleBacktest(killCount) {
  const START = 30;
  const results = [];
  let lastParams = null;

  for (let i = START; i < history.length - 1; i++) {
    const sub = history.slice(0, i + 1);
    if (i % 5 === 0 || !lastParams) {
      lastParams = getAdaptiveParams(sub, killCount);
    }
    const { weights, opts } = lastParams;
    const kill = ensembleKill(sub, killCount, weights, opts);
    const nextSet = new Set(history[i + 1]);
    const failed = kill.filter(n => nextSet.has(n));
    const correct = kill.length - failed.length;
    results.push({
      period: i + 1,
      kill, actual: history[i + 1],
      correct, total: killCount,
      rate: correct / killCount,
      allCorrect: correct === killCount,
    });
  }
  return results;
}

function printStats(label, results) {
  const total = results.length;
  const killCount = results[0].total;
  const allCorrect = results.filter(r => r.allCorrect).length;
  const miss1 = results.filter(r => r.correct >= killCount - 1).length;
  const miss2 = results.filter(r => r.correct >= killCount - 2).length;
  const avg = results.reduce((s, r) => s + r.rate, 0) / total;
  let baseline = 1;
  for (let i = 0; i < killCount; i++) baseline *= (42 - i) / (49 - i);

  const dist = {};
  results.forEach(r => { dist[r.correct] = (dist[r.correct] || 0) + 1; });

  console.log(`${'═'.repeat(58)}`);
  console.log(`  ${label}（共 ${total} 期）`);
  console.log(`${'═'.repeat(58)}`);
  console.log(`  全中率（${killCount}/${killCount}）：${allCorrect}/${total} = ${(allCorrect/total*100).toFixed(1)}%`);
  console.log(`  漏1个（${killCount-1}+）：${miss1}/${total} = ${(miss1/total*100).toFixed(1)}%`);
  console.log(`  漏2个（${killCount-2}+）：${miss2}/${total} = ${(miss2/total*100).toFixed(1)}%`);
  console.log(`  平均准确率：${(avg*100).toFixed(2)}%`);
  console.log(`  随机基准全中率：${(baseline*100).toFixed(2)}%`);
  console.log(`  算法提升：+${((allCorrect/total - baseline)*100).toFixed(2)}%`);
  console.log(`  命中分布：`);
  for (let k = killCount; k >= killCount - 4; k--) {
    const cnt = dist[k] || 0;
    const bar = '█'.repeat(Math.round(cnt/total*40));
    console.log(`    ${k}/${killCount}: ${String(cnt).padStart(3)}期 ${(cnt/total*100).toFixed(1)}% ${bar}`);
  }
  console.log();
}

// ══════════════════════════════════════════
// 对比：旧算法 vs 集成投票
// ══════════════════════════════════════════
console.log('🔄 正在运行集成投票回测（耗时较长）...\n');

const r10 = runEnsembleBacktest(10);
printStats('10杀 集成投票（三模型）', r10);

// 近10期详细
console.log('═'.repeat(58));
console.log('  近10期 10杀 详细结果');
console.log('═'.repeat(58));
r10.slice(-10).forEach(r => {
  const status = r.allCorrect ? '✅全中' : r.correct >= 9 ? '⚠️9中' : r.correct >= 8 ? '🟡8中' : '❌';
  console.log(`  第${r.period}期 → ${r.correct}/10 ${status}  实际:[${r.actual.join(',')}]`);
});

console.log('\n' + '═'.repeat(58));
console.log('  对比总结');
console.log('═'.repeat(58));
console.log('  旧算法（单模型自适应）：全中率 20.2%，平均准确率 87.17%');
const newAllCorrect = r10.filter(r => r.allCorrect).length;
const newAvg = r10.reduce((s, r) => s + r.rate, 0) / r10.length;
console.log(`  新算法（三模型集成）：全中率 ${(newAllCorrect/r10.length*100).toFixed(1)}%，平均准确率 ${(newAvg*100).toFixed(2)}%`);
const diff = newAllCorrect/r10.length - 0.202;
console.log(`  变化：${diff >= 0 ? '+' : ''}${(diff*100).toFixed(1)}%`);
console.log('\n✅ 完成\n');
