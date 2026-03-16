const fs = require('fs');
const text = fs.readFileSync('public/history.txt', 'utf8');
const rows = text.trim().split('\n')
  .filter(l => l.trim())
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)))
  .filter(r => r.length === 7 && r.every(n => !isNaN(n)));
const N = rows.length;

// ============================================================
// 新思路1：马尔可夫链 - 基于上期开出的号，预测下期不会出现
// 思路：统计「某号出现后，下期哪些号绝对不会出现」
// ============================================================
function strategy_markov(hist, k=4) {
  const hn = hist.length;
  const lastRow = hist[hn-1];
  // 对每个候选号，计算「在lastRow中某号出现后，该号下期出现的次数」
  const afterScore = new Array(50).fill(0); // 越低越适合杀
  const afterCount = new Array(50).fill(0);
  for (let i = 0; i < hn-1; i++) {
    // 看上期和lastRow的交集（相似期）
    const overlap = hist[i].filter(n => lastRow.includes(n)).length;
    if (overlap >= 3) { // 上期有3+个号和当期一样 → 相似局面
      hist[i+1].forEach(n => { afterScore[n]++; afterCount[n]++; });
    }
  }
  // 找从未在相似局面后出现的号
  const never = [];
  for (let n = 1; n <= 49; n++) {
    if (lastRow.includes(n)) continue; // 上期出现的不杀
    never.push({ n, score: afterScore[n], count: afterCount[n] });
  }
  never.sort((a,b) => a.score - b.score);
  return never.slice(0, k).map(x => x.n);
}

// ============================================================
// 新思路2：号码「冷却模式」识别
// 思路：某号出现后通常需要多少期才会再出？找到处于冷却期中段的号
// ============================================================
function strategy_cooldown(hist, k=4) {
  const hn = hist.length;
  // 计算每个号的平均冷却期和当前冷却状态
  const killScore = [];
  for (let n = 1; n <= 49; n++) {
    const apps = [];
    hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
    if (apps.length < 3) { killScore.push({n, score: 0, reason:'数据不足'}); continue; }
    const lastIdx = apps[apps.length-1];
    const lastMiss = hn - 1 - lastIdx;
    // 近2期出现 → 不杀
    if (lastMiss <= 1) { killScore.push({n, score: -999, reason:'近2期热'}); continue; }
    // 计算间隔统计
    const gaps = [];
    for (let i = 1; i < apps.length; i++) gaps.push(apps[i]-apps[i-1]);
    const avgGap = gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const minGap = Math.min(...gaps);
    const maxGap = Math.max(...gaps);
    // 关键：当前遗漏在「冷却期中段」= 不太可能这期就出
    // 冷却期中段定义：lastMiss < avgGap * 0.7（刚出完，还在冷却中）
    // 且 minGap > 2（该号不会连出）
    let score = 0;
    if (lastMiss < avgGap * 0.6 && minGap > 2) {
      score = (avgGap * 0.6 - lastMiss) * 10 + minGap; // 越在冷却中段分越高
    }
    killScore.push({n, score, avgGap: avgGap.toFixed(1), lastMiss, minGap});
  }
  killScore.sort((a,b) => b.score-a.score);
  return killScore.filter(x => x.score > 0).slice(0, k).map(x => x.n);
}

// ============================================================
// 新思路3：「永不连出」过滤
// 统计哪些号从来不会在某组合后连续出现
// ============================================================
function strategy_never_repeat(hist, k=4) {
  const hn = hist.length;
  const lastRow = new Set(hist[hn-1]);
  // 对每个未在上期出现的号，计算它「在各种情况下出现」的条件概率
  const scores = [];
  for (let n = 1; n <= 49; n++) {
    if (lastRow.has(n)) continue;
    // 统计近期（近20期）出现频率
    const recent20 = hist.slice(-20).filter(r => r.includes(n)).length;
    const recent10 = hist.slice(-10).filter(r => r.includes(n)).length;
    const recent5 = hist.slice(-5).filter(r => r.includes(n)).length;
    const recent3 = hist.slice(-3).filter(r => r.includes(n)).length;
    // 使用指数加权冷度（decay=0.85）
    let wFreq = 0;
    hist.forEach((row, idx) => {
      const age = hn-1-idx;
      if (row.includes(n)) wFreq += Math.pow(0.85, age);
    });
    // 检查上期号码中，有多少个和n「从不同期出现」
    let neverTogether = 0;
    for (const last of lastRow) {
      let togetherCount = 0;
      hist.forEach(row => { if (row.includes(n) && row.includes(last)) togetherCount++; });
      if (togetherCount === 0) neverTogether++;
    }
    scores.push({ n, wFreq, recent5, recent3, recent10, recent20, neverTogether });
  }
  // 综合评分：加权频率低 + 近期冷 + 与上期号码从不同期出现
  scores.sort((a,b) => {
    const scoreA = a.wFreq * 10 - a.neverTogether * 0.5;
    const scoreB = b.wFreq * 10 - b.neverTogether * 0.5;
    return scoreA - scoreB;
  });
  return scores.slice(0, k).map(x => x.n);
}

// ============================================================
// 回测对比
// ============================================================
function backtest(stratFn, label, k=4) {
  let perfect=0, total=0, correct=0;
  for (let i = 15; i < N-1; i++) {
    const hist = rows.slice(0, i+1);
    const kill = stratFn(hist, k);
    if (kill.length < k) continue;
    const nextSet = new Set(rows[i+1]);
    const hit = kill.filter(n => !nextSet.has(n)).length;
    correct += hit;
    total++;
    if (hit === k) perfect++;
  }
  const pct = (perfect/total*100).toFixed(1);
  const acc = (correct/total/k*100).toFixed(1);
  console.log(`${label}: 全中${perfect}/${total}期 (${pct}%) | 准确率${acc}%`);
  return { perfect, total, pct: parseFloat(pct) };
}

console.log('=== 新思路对比（杀4个）===');
backtest(strategy_markov, '思路1-马尔可夫相似局面');
backtest(strategy_cooldown, '思路2-冷却期中段');
backtest(strategy_never_repeat, '思路3-永不连出加权');

// 当前算法作为基准
function strategy_current(hist, k=4) {
  const hn = hist.length;
  const wFreq = new Array(50).fill(0);
  hist.forEach((row, idx) => {
    const age = hn-1-idx; const w = Math.pow(0.85, age);
    row.forEach(n => { wFreq[n]+=w; });
  });
  const protect = new Set();
  hist.slice(-2).forEach(r => r.forEach(n => protect.add(n)));
  for (let n=1;n<=49;n++) {
    if (protect.has(n)) continue;
    const apps=[];
    hist.forEach((row,idx)=>{if(row.includes(n))apps.push(idx);});
    if (apps.length<3) continue;
    const lastIdx=apps[apps.length-1];
    if (lastIdx===hn-1){let rc=0,rt=0;for(let j=0;j<hist.length-1;j++){if(hist[j].includes(n)){rt++;if(hist[j+1].includes(n))rc++;}}if(rt>2&&rc/rt>=0.20){protect.add(n);}}
    if (lastIdx===hn-2){let sk=0,ap=0;for(let j=0;j<hist.length-2;j++){if(hist[j].includes(n)&&!hist[j+1].includes(n)){ap++;if(hist[j+2].includes(n))sk++;}}if(ap>2&&sk/ap>=0.25){protect.add(n);}}
  }
  const cands=[];
  for(let n=1;n<=49;n++){if(!protect.has(n))cands.push({n,w:wFreq[n]});}
  cands.sort((a,b)=>a.w-b.w);
  return cands.slice(0,k).map(x=>x.n);
}
backtest(strategy_current, '当前算法(基准)');

// 组合：当前 ∩ 思路3（两个都认为应该杀才杀）
function strategy_intersection(hist, k=4) {
  const cur = new Set(strategy_current(hist, k+4));
  const nr = new Set(strategy_never_repeat(hist, k+4));
  const both = [];
  for (let n=1;n<=49;n++) {
    if (cur.has(n) && nr.has(n)) both.push(n);
  }
  // 不够就用当前算法补
  const wFreq = new Array(50).fill(0);
  hist.forEach((row,idx)=>{const age=hist.length-1-idx;const w=Math.pow(0.85,age);row.forEach(n=>{wFreq[n]+=w;});});
  both.sort((a,b)=>wFreq[a]-wFreq[b]);
  return both.slice(0,k);
}
backtest(strategy_intersection, '组合：当前∩永不连出');
