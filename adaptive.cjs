const fs = require('fs');
const text = fs.readFileSync('public/history.txt', 'utf8');
const rows = text.trim().split('\n')
  .filter(l => l.trim())
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)))
  .filter(r => r.length === 7 && r.every(n => !isNaN(n)));
const N = rows.length;

// ============================================================
// 自适应参数学习：每5期用最近20期回测，找最优参数组合
// 参数空间：重叠阈值(1-3) x 衰减系数(0.80-0.92) x 保护窗口(1-3期)
// ============================================================

function killPredict(hist, opts) {
  const { overlapThresh, decay, protectWindow, repeatThresh, skipThresh } = opts;
  const hn = hist.length;
  const lastRow = hist[hn - 1];

  // 马尔可夫相似局面
  const afterScore = new Array(50).fill(0);
  let simCount = 0;
  for (let i = 0; i < hn - 1; i++) {
    const overlap = hist[i].filter(n => lastRow.includes(n)).length;
    if (overlap >= overlapThresh) {
      hist[i + 1].forEach(n => { afterScore[n]++; });
      simCount++;
    }
  }

  // 加权冷度
  const wFreq = new Array(50).fill(0);
  hist.forEach((row, idx) => {
    const age = hn - 1 - idx;
    const w = Math.pow(decay, age);
    row.forEach(n => { wFreq[n] += w; });
  });

  // 保护集
  const protect = new Set();
  hist.slice(-protectWindow).forEach(r => r.forEach(n => protect.add(n)));

  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) continue;
    const apps = [];
    hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
    if (apps.length < 3) continue;
    const lastIdx = apps[apps.length - 1];
    // 重复率保护
    if (lastIdx === hn - 1) {
      let rc = 0, rt = 0;
      for (let j = 0; j < hn - 1; j++) {
        if (hist[j].includes(n)) { rt++; if (hist[j + 1].includes(n)) rc++; }
      }
      if (rt > 2 && rc / rt >= repeatThresh) protect.add(n);
    }
    // 跳期率保护
    if (lastIdx === hn - 2) {
      let sk = 0, ap = 0;
      for (let j = 0; j < hn - 2; j++) {
        if (hist[j].includes(n) && !hist[j + 1].includes(n)) {
          ap++; if (hist[j + 2].includes(n)) sk++;
        }
      }
      if (ap > 2 && sk / ap >= skipThresh) protect.add(n);
    }
  }

  // 综合评分：马尔可夫 + 冷度
  const scored = [];
  for (let n = 1; n <= 49; n++) {
    if (protect.has(n)) continue;
    const markovScore = simCount > 0 ? afterScore[n] / simCount : 0;
    const coldScore = wFreq[n];
    // 归一化组合
    scored.push({ n, score: markovScore * 0.6 + coldScore * 0.4 });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 4).map(x => x.n);
}

// 参数空间
const paramGrid = [];
for (const overlapThresh of [1, 2, 3]) {
  for (const decay of [0.80, 0.85, 0.90]) {
    for (const protectWindow of [2, 3]) {
      for (const repeatThresh of [0.15, 0.20, 0.25]) {
        for (const skipThresh of [0.20, 0.25, 0.30]) {
          paramGrid.push({ overlapThresh, decay, protectWindow, repeatThresh, skipThresh });
        }
      }
    }
  }
}
console.log('参数组合数:', paramGrid.length);

// 自适应策略：每5期用最近20期回测找最优参数
function adaptiveKill(hist, evalWindow = 20) {
  if (hist.length < evalWindow + 5) {
    // 数据不足时用默认参数
    return killPredict(hist, { overlapThresh: 2, decay: 0.85, protectWindow: 2, repeatThresh: 0.20, skipThresh: 0.25 });
  }

  // 用最近 evalWindow 期评估每组参数
  let bestOpts = paramGrid[0], bestScore = -1;
  for (const opts of paramGrid) {
    let correct = 0, total = 0;
    const evalStart = hist.length - evalWindow;
    for (let i = evalStart; i < hist.length - 1; i++) {
      const subHist = hist.slice(0, i + 1);
      const kill = killPredict(subHist, opts);
      const nextSet = new Set(hist[i + 1]);
      const hit = kill.filter(n => !nextSet.has(n)).length;
      correct += hit; total += 4;
    }
    const acc = correct / total;
    if (acc > bestScore) { bestScore = acc; bestOpts = opts; }
  }
  return { kill: killPredict(hist, bestOpts), bestOpts, bestScore };
}

// 回测：固定参数 vs 自适应
console.log('\n=== 固定参数 vs 自适应学习 ===');

// 固定参数基线
let fixedPerfect = 0, fixedTotal = 0, fixedCorrect = 0;
const fixedOpts = { overlapThresh: 2, decay: 0.85, protectWindow: 2, repeatThresh: 0.20, skipThresh: 0.25 };
for (let i = 20; i < N - 1; i++) {
  const hist = rows.slice(0, i + 1);
  const kill = killPredict(hist, fixedOpts);
  const nextSet = new Set(rows[i + 1]);
  const hit = kill.filter(n => !nextSet.has(n)).length;
  fixedCorrect += hit; fixedTotal++;
  if (hit === 4) fixedPerfect++;
}
console.log(`固定参数: 全中${fixedPerfect}/${fixedTotal}期 (${(fixedPerfect/fixedTotal*100).toFixed(1)}%) 准确率${(fixedCorrect/fixedTotal/4*100).toFixed(1)}%`);

// 自适应（每5期重新学习，evalWindow=20）
let adaptPerfect = 0, adaptTotal = 0, adaptCorrect = 0;
let lastLearnPeriod = -1;
let cachedOpts = fixedOpts;
for (let i = 25; i < N - 1; i++) {
  const hist = rows.slice(0, i + 1);
  // 每5期重新学习
  if (i - lastLearnPeriod >= 5) {
    const res = adaptiveKill(hist, 20);
    cachedOpts = res.bestOpts;
    lastLearnPeriod = i;
  }
  const kill = killPredict(hist, cachedOpts);
  const nextSet = new Set(rows[i + 1]);
  const hit = kill.filter(n => !nextSet.has(n)).length;
  adaptCorrect += hit; adaptTotal++;
  if (hit === 4) adaptPerfect++;
}
console.log(`自适应学习: 全中${adaptPerfect}/${adaptTotal}期 (${(adaptPerfect/adaptTotal*100).toFixed(1)}%) 准确率${(adaptCorrect/adaptTotal/4*100).toFixed(1)}%`);

// 自适应（evalWindow=15）
let adapt2Perfect = 0, adapt2Total = 0, adapt2Correct = 0;
let lastLearn2 = -1;
let cached2Opts = fixedOpts;
for (let i = 25; i < N - 1; i++) {
  const hist = rows.slice(0, i + 1);
  if (i - lastLearn2 >= 5) {
    const res = adaptiveKill(hist, 15);
    cached2Opts = res.bestOpts;
    lastLearn2 = i;
  }
  const kill = killPredict(hist, cached2Opts);
  const nextSet = new Set(rows[i + 1]);
  const hit = kill.filter(n => !nextSet.has(n)).length;
  adapt2Correct += hit; adapt2Total++;
  if (hit === 4) adapt2Perfect++;
}
console.log(`自适应(窗口15): 全中${adapt2Perfect}/${adapt2Total}期 (${(adapt2Perfect/adapt2Total*100).toFixed(1)}%) 准确率${(adapt2Correct/adapt2Total/4*100).toFixed(1)}%`);

// 显示最新自适应参数
const finalRes = adaptiveKill(rows, 20);
console.log('\n当前最优参数:', JSON.stringify(finalRes.bestOpts));
console.log('最优参数评估分:', (finalRes.bestScore * 100).toFixed(1) + '%');
console.log('当期预测杀码:', finalRes.kill);
