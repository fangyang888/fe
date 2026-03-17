/**
 * 回测统计：10杀 / 15杀 的准确率和全中概率
 * 复用 KillPredictor 的自适应算法逻辑
 */
const fs = require('fs');
const path = require('path');

// ── 读取历史数据 ──
const raw = fs.readFileSync(path.join(__dirname, 'public/history.txt'), 'utf-8');
const history = raw.trim().split('\n')
  .map(l => l.trim()).filter(Boolean)
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 49))
  .filter(r => r.length === 7);

console.log(`\n✅ 共 ${history.length} 期数据\n`);

// ── 算法核心（与KillPredictor一致）──
function buildScoreEngineWithOpts(hist, opts) {
  const { decay, protectWindow, missRiskMult } = opts;
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
      for (let j = 0; j < hist.length - 1; j++) {
        if (hist[j].includes(n)) { rt++; if (hist[j + 1].includes(n)) rc++; }
      }
      if (rt > 2 && rc / rt >= 0.20) { protect.add(n); }
    }
    if (lastIdx === hn - 2) {
      let sk = 0, ap = 0;
      for (let j = 0; j < hist.length - 2; j++) {
        if (hist[j].includes(n) && !hist[j + 1].includes(n)) { ap++; if (hist[j + 2].includes(n)) sk++; }
      }
      if (ap > 2 && sk / ap >= 0.25) { protect.add(n); }
    }
  }
  const candidates = [];
  for (let n = 1; n <= 49; n++) {
    if (!protect.has(n)) candidates.push({ n, w: wFreq[n] });
  }
  candidates.sort((a, b) => a.w - b.w);
  return candidates;
}

function killNWithOpts(hist, opts, killCount) {
  const { tailBalance, altBonus } = opts;
  const N = hist.length;
  const candidates = buildScoreEngineWithOpts(hist, opts);
  const scored = candidates.map(c => {
    const p1 = hist[N-1]?.includes(c.n) ? 1 : 0;
    const p2 = hist[N-2]?.includes(c.n) ? 1 : 0;
    const p3 = hist[N-3]?.includes(c.n) ? 1 : 0;
    let bonus = 0;
    if (p1===1 && p2===0 && p3===1) bonus = -altBonus;
    if (p1===0 && p2===1 && p3===0) bonus = +altBonus;
    return { ...c, adjustedW: c.w + bonus };
  });
  scored.sort((a, b) => a.adjustedW - b.adjustedW);
  if (!tailBalance) return scored.slice(0, killCount).map(c => c.n);
  const tailCounts = Array(10).fill(0);
  const selected = [];
  for (const c of scored) {
    if (selected.length >= killCount) break;
    const tail = c.n % 10;
    if (tailCounts[tail] < 2) { selected.push(c); tailCounts[tail]++; }
  }
  for (const c of scored) {
    if (selected.length >= killCount) break;
    if (!selected.find(s => s.n === c.n)) selected.push(c);
  }
  return selected.slice(0, killCount).map(c => c.n);
}

// 自适应参数网格
const PARAM_GRID = [];
for (const decay of [0.80, 0.85, 0.90]) {
  for (const protectWindow of [1, 2, 3]) {
    for (const missRiskMult of [1.5, 2.0, 2.5]) {
      for (const tailBalance of [true, false]) {
        for (const altBonus of [12, 18, 24]) {
          PARAM_GRID.push({ decay, protectWindow, missRiskMult, tailBalance, altBonus });
        }
      }
    }
  }
}

function getBestOpts(hist, killCount) {
  if (hist.length < 30) return { decay:0.85, protectWindow:2, missRiskMult:2.0, tailBalance:true, altBonus:18 };
  const evalWindow = Math.min(30, hist.length - 10);
  let bestOpts = PARAM_GRID[0], bestScore = -1;
  for (const opts of PARAM_GRID) {
    let correct = 0, total = 0;
    const start = hist.length - evalWindow;
    for (let i = start; i < hist.length - 1; i++) {
      const sub = hist.slice(0, i + 1);
      const kill = killNWithOpts(sub, opts, killCount);
      const nextSet = new Set(hist[i + 1]);
      correct += kill.filter(n => !nextSet.has(n)).length;
      total += killCount;
    }
    const acc = correct / total;
    if (acc > bestScore) { bestScore = acc; bestOpts = opts; }
  }
  return bestOpts;
}

// ── 回测函数 ──
function runBacktest(killCount) {
  const START = 30; // 至少30期才开始回测
  const results = [];

  for (let i = START; i < history.length - 1; i++) {
    const sub = history.slice(0, i + 1);
    // 每5期重新学习最优参数
    const opts = (i % 5 === 0 || i === START) ? getBestOpts(sub, killCount) : (results.length > 0 ? results[results.length-1]._opts : getBestOpts(sub, killCount));
    const kill = killNWithOpts(sub, opts, killCount);
    const nextSet = new Set(history[i + 1]);
    const failed = kill.filter(n => nextSet.has(n));
    const correct = kill.length - failed.length;
    results.push({
      period: i + 1,
      kill,
      actual: history[i + 1],
      correct,
      total: killCount,
      rate: correct / killCount,
      allCorrect: correct === killCount,
      _opts: opts,
    });
  }
  return results;
}

// ── 统计输出 ──
function printStats(killCount, results) {
  const total = results.length;
  const allCorrect = results.filter(r => r.allCorrect).length;
  const nineOrMore = results.filter(r => r.correct >= killCount - 1).length; // 漏1个
  const eightOrMore = results.filter(r => r.correct >= killCount - 2).length; // 漏2个
  const avgRate = results.reduce((s, r) => s + r.rate, 0) / total;

  // 分布统计
  const dist = {};
  results.forEach(r => {
    dist[r.correct] = (dist[r.correct] || 0) + 1;
  });

  console.log(`${'═'.repeat(55)}`);
  console.log(`  ${killCount}杀 回测结果（共 ${total} 期）`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`  全中率（${killCount}/${killCount}）：${allCorrect}/${total} = ${(allCorrect/total*100).toFixed(1)}%`);
  console.log(`  漏1个（${killCount-1}+/${killCount}）：${nineOrMore}/${total} = ${(nineOrMore/total*100).toFixed(1)}%`);
  console.log(`  漏2个（${killCount-2}+/${killCount}）：${eightOrMore}/${total} = ${(eightOrMore/total*100).toFixed(1)}%`);
  console.log(`  平均准确率：${(avgRate*100).toFixed(2)}%`);
  console.log(`  随机基准全中率：${(getRandomBaseline(killCount)*100).toFixed(2)}%`);
  console.log(`  算法提升：+${((allCorrect/total - getRandomBaseline(killCount))*100).toFixed(2)}%`);
  console.log(``);
  console.log(`  命中分布：`);
  for (let k = killCount; k >= killCount - 4; k--) {
    const cnt = dist[k] || 0;
    const bar = '█'.repeat(Math.round(cnt/total*40));
    console.log(`    ${k}/${killCount}: ${String(cnt).padStart(3)}期 ${(cnt/total*100).toFixed(1)}% ${bar}`);
  }
  console.log();
}

// 随机基准：k杀全中的纯随机概率 = C(49-7, k) / C(49, k) ≈ (42/49)*(41/48)*...*(42-k+1)/(49-k+1)
function getRandomBaseline(k) {
  let p = 1;
  for (let i = 0; i < k; i++) {
    p *= (42 - i) / (49 - i);
  }
  return p;
}

console.log('\n🔄 正在回测（每5期自适应学习，耗时较长）...\n');

const r10 = runBacktest(10);
const r15 = runBacktest(15);

printStats(10, r10);
printStats(15, r15);

// 近10期详细
console.log('═'.repeat(55));
console.log('  近10期 10杀 详细结果');
console.log('═'.repeat(55));
r10.slice(-10).forEach(r => {
  const status = r.allCorrect ? '✅全中' : r.correct >= 9 ? '⚠️9中' : r.correct >= 8 ? '🟡8中' : '❌';
  console.log(`  第${r.period}期 → ${r.correct}/10 ${status}  实际:${r.actual.join(',')}`);
});

console.log();
console.log('═'.repeat(55));
console.log('  近10期 15杀 详细结果');
console.log('═'.repeat(55));
r15.slice(-10).forEach(r => {
  const status = r.allCorrect ? '✅全中' : r.correct >= 14 ? '⚠️14中' : r.correct >= 13 ? '🟡13中' : '❌';
  console.log(`  第${r.period}期 → ${r.correct}/15 ${status}  实际:${r.actual.join(',')}`);
});

console.log('\n✅ 统计完成\n');
