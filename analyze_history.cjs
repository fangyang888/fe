/**
 * 彩票历史数据分析脚本
 * 分析 public/history.txt 的 135 期数据
 * 算法：频率统计 + 遗漏值分析 + 马尔可夫链
 */

const fs = require('fs');
const path = require('path');

// ── 1. 读取并解析数据 ──────────────────────────────────────────
const raw = fs.readFileSync(path.join(__dirname, 'public/history.txt'), 'utf-8');
const history = raw
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line =>
    line.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 49)
  )
  .filter(row => row.length === 7);

const TOTAL = history.length;
console.log(`\n✅ 共解析 ${TOTAL} 期数据\n`);

// ── 2. 频率统计 ────────────────────────────────────────────────
const freq = new Array(50).fill(0); // index 1-49
history.forEach(row => row.forEach(n => freq[n]++));

// ── 3. 遗漏值分析 ──────────────────────────────────────────────
// 遗漏值：距离上次出现已经过了多少期
const lastSeen = new Array(50).fill(-1);
const miss = new Array(50).fill(0);

for (let i = 0; i < TOTAL; i++) {
  const row = history[i];
  for (let n = 1; n <= 49; n++) {
    if (row.includes(n)) {
      lastSeen[n] = i;
    }
  }
}
for (let n = 1; n <= 49; n++) {
  miss[n] = lastSeen[n] === -1 ? TOTAL : TOTAL - 1 - lastSeen[n];
}

// ── 4. 近20期热度 ──────────────────────────────────────────────
const RECENT_N = 20;
const recentData = history.slice(-RECENT_N);
const recentFreq = new Array(50).fill(0);
recentData.forEach(row => row.forEach(n => recentFreq[n]++));

// ── 5. 马尔可夫链：上期出现 → 本期出现的转移概率 ───────────────
// transition[i][j] = i出现时，下一期j出现的次数
const transition = Array.from({ length: 50 }, () => new Array(50).fill(0));
const transitionCount = new Array(50).fill(0);

for (let i = 0; i < TOTAL - 1; i++) {
  const cur = history[i];
  const next = history[i + 1];
  cur.forEach(a => {
    transitionCount[a]++;
    next.forEach(b => {
      transition[a][b]++;
    });
  });
}

// 基于上一期数据预测本期各号码概率
const lastRow = history[TOTAL - 1];
console.log(`📌 最后一期（第${TOTAL}期）：[${lastRow.join(', ')}]\n`);

const markovScore = new Array(50).fill(0);
lastRow.forEach(a => {
  for (let b = 1; b <= 49; b++) {
    if (transitionCount[a] > 0) {
      markovScore[b] += transition[a][b] / transitionCount[a];
    }
  }
});

// ── 6. 综合评分 ────────────────────────────────────────────────
// 热号综合得分 = 全局频率权重 + 近期频率权重 + 马尔可夫得分 - 遗漏惩罚
const scores = [];
for (let n = 1; n <= 49; n++) {
  const globalScore  = freq[n] / TOTAL;                    // 全局出现率
  const recentScore  = recentFreq[n] / RECENT_N;           // 近20期出现率
  const markov       = markovScore[n];                      // 马尔可夫得分
  const missScore    = 1 / (miss[n] + 1);                  // 遗漏越大得分越低（越冷）

  // 权重：近期热度 40% + 马尔可夫 35% + 全局频率 15% + 遗漏补偿 10%
  const total =
    recentScore  * 0.40 +
    markov       * 0.35 +
    globalScore  * 0.15 +
    missScore    * 0.10;

  scores.push({ n, total, globalScore, recentScore, markov, miss: miss[n] });
}

// 按综合得分从高到低排序
scores.sort((a, b) => b.total - a.total);

// ── 7. 输出结果 ────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  综合得分排名（预测最可能出现的号码）');
console.log('═══════════════════════════════════════════════════════');
console.log('排名  号码  综合分  全局率  近20期率  马尔可夫  遗漏期');
console.log('───────────────────────────────────────────────────────');
scores.forEach((s, idx) => {
  const rank      = String(idx + 1).padStart(2, ' ');
  const num       = String(s.n).padStart(3, ' ');
  const total     = s.total.toFixed(4);
  const global    = (s.globalScore * 100).toFixed(1) + '%';
  const recent    = (s.recentScore * 100).toFixed(1) + '%';
  const markov    = s.markov.toFixed(4);
  const missVal   = String(s.miss).padStart(2, ' ');
  console.log(`${rank}   ${num}   ${total}   ${global.padStart(6)}   ${recent.padStart(8)}   ${markov}   ${missVal}`);
});

// ── 8. 核心预测结论 ───────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  🔥 预测「最可能出现」的 8 个热号：');
const hot8 = scores.slice(0, 8).map(s => s.n).sort((a, b) => a - b);
console.log(' ', hot8.join('  '));

console.log('\n  ❄️  预测「最不可能出现」的 8 个冷号：');
const cold8 = scores.slice(-8).map(s => s.n).sort((a, b) => a - b);
console.log(' ', cold8.join('  '));

console.log('\n  📋 建议投注范围（排除热号后的 41 个）：');
const betting = scores.slice(8).map(s => s.n).sort((a, b) => a - b);
console.log(' ', betting.join('  '));

// ── 9. 各号码全期统计汇总 ─────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  各号码出现次数（全135期）');
console.log('═══════════════════════════════════════════════════════');
const freqList = [];
for (let n = 1; n <= 49; n++) freqList.push({ n, count: freq[n] });
freqList.sort((a, b) => b.count - a.count);
const rows = [];
for (let i = 0; i < freqList.length; i += 7) {
  const chunk = freqList.slice(i, i + 7);
  rows.push(chunk.map(x => `${String(x.n).padStart(2,'0')}(${String(x.count).padStart(2,' ')})`).join('  '));
}
rows.forEach(r => console.log(' ', r));

console.log('\n✅ 分析完成\n');
