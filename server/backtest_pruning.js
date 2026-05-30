require('dotenv').config();
const mysql = require('mysql2/promise');

const ALL_RULES = [
  { id: 1, name: '首尾之和', fn: (d) => ((d[0] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 2, name: '首二之和', fn: (d) => ((d[0] + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 3, name: '末二之和', fn: (d) => ((d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 4, name: '首尾之差', fn: (d) => ((d[6] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 5, name: '首二之积', fn: (d) => ((d[0] * d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 6, name: '末二之积', fn: (d) => ((d[5] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 7, name: '奇数位相加', fn: (d) => ((d[0] + d[2] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 8, name: '偶数位相加', fn: (d) => ((d[1] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 9, name: '邻号差值调整', fn: (d) => ((d[6] - d[5] + 1 - 1) % 49 + 49) % 49 + 1 },
  { id: 10, name: '前二之差', fn: (d) => ((d[1] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 11, name: '首位倍增', fn: (d) => ((2 * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 12, name: '末位倍增', fn: (d) => ((2 * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 13, name: '首尾跨度差', fn: (d) => ((d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 14, name: '中首跨度差', fn: (d) => ((d[3] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 15, name: '核心中数和', fn: (d) => ((d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 16, name: '核心后数和', fn: (d) => ((d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 17, name: '三分位相加', fn: (d) => ((d[0] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 18, name: '尾三之差', fn: (d) => ((d[6] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 19, name: '五二之差', fn: (d) => ((d[4] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 20, name: '六三之差', fn: (d) => ((d[5] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 21, name: '五一之差', fn: (d) => ((d[4] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 22, name: '尾二之差', fn: (d) => ((d[6] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 23, name: '首位加权和', fn: (d) => ((d[0] * 3 + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 24, name: '末位加权和', fn: (d) => ((d[6] * 3 + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 25, name: '中位数倍增', fn: (d) => ((d[3] * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 26, name: '中数乘积A', fn: (d) => ((d[2] * d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 27, name: '中数乘积B', fn: (d) => ((d[1] * d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 28, name: '最大值平方', fn: (d) => ((d[6] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 29, name: '最小值平方', fn: (d) => ((d[0] * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 30, name: '中位数平方', fn: (d) => ((d[3] * d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 31, name: '前四和值', fn: (d) => ((d[0] + d[1] + d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 32, name: '后四和值', fn: (d) => ((d[3] + d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 33, name: '中间四和值', fn: (d) => ((d[1] + d[2] + d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 34, name: '首尾折中差', fn: (d) => ((d[0] + d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 35, name: '次级首尾差', fn: (d) => ((d[1] + d[5] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 36, name: '内包首尾差', fn: (d) => ((d[2] + d[4] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 37, name: '极值之积', fn: (d) => ((d[0] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 38, name: '前三和值', fn: (d) => ((d[0] + d[1] + d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 39, name: '后三和值', fn: (d) => ((d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 40, name: '首尾和倍增', fn: (d) => (((d[0] + d[6]) * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 41, name: '跨度倍增', fn: (d) => ((Math.abs(d[6] - d[0]) * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 42, name: '全总和模除', fn: (d) => ((d.reduce((a, b) => a + b, 0) - 1) % 49 + 49) % 49 + 1 },
  { id: 43, name: '极值均数', fn: (d) => ((Math.floor((d[0] + d[6]) / 2) - 1) % 49 + 49) % 49 + 1 },
  { id: 44, name: '三分之二倍数', fn: (d) => ((d[2] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 45, name: '三分之四倍数', fn: (d) => ((d[4] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 46, name: '跨度五倍数', fn: (d) => (((d[6] - d[0]) * 5 - 1) % 49 + 49) % 49 + 1 },
  { id: 47, name: '奇特三和', fn: (d) => ((d[0] + d[2] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 48, name: '中枢奇和', fn: (d) => ((d[0] + d[4] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 49, name: '中枢偶和', fn: (d) => ((d[1] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 50, name: '次级混合和', fn: (d) => ((d[0] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 }
];

// 被剔除的 worst 10 公式的 ID 列表 (全量历史胜率低于 84.7%)
const WORST_IDS = [50, 39, 12, 33, 6, 41, 20, 19, 14, 16];

// 替代的 10 个高置信全新公式
const NEW_RULES = [
  { id: 101, name: '首尾三倍差', fn: (d) => ((Math.abs(d[6] - d[0]) * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 102, name: '奇位相减', fn: (d) => ((Math.abs(d[4] - d[0]) - 1) % 49 + 49) % 49 + 1 },
  { id: 103, name: '偶位相减', fn: (d) => ((Math.abs(d[5] - d[1]) - 1) % 49 + 49) % 49 + 1 },
  { id: 104, name: '中数跨度差', fn: (d) => ((Math.abs(d[4] - d[2]) - 1) % 49 + 49) % 49 + 1 },
  { id: 105, name: '核心中数积', fn: (d) => ((d[2] * d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 106, name: '首位立方模', fn: (d) => ((d[0] * d[0] * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 107, name: '次位平方模', fn: (d) => ((d[1] * d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 108, name: '首尾折中乘', fn: (d) => ((d[0] * d[3] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 109, name: '均值平方模', fn: (d) => {
      const avg = Math.floor(d.reduce((a, b) => a + b, 0) / 7);
      return ((avg * avg - 1) % 49 + 49) % 49 + 1;
    } 
  },
  { id: 110, name: '最大最小均积', fn: (d) => ((d[0] * Math.floor((d[0] + d[6]) / 2) - 1) % 49 + 49) % 49 + 1 }
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'fangyang6579',
    database: process.env.DB_NAME || 'fe_prediction',
  });

  const [rows] = await connection.execute(
    'SELECT n1, n2, n3, n4, n5, n6, n7, year, No FROM history ORDER BY year ASC, No ASC'
  );

  const history = rows.map(r => {
    const arr = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number);
    arr.sort((a, b) => a - b);
    return arr;
  });

  const windowSize = 100;
  const testPeriods = 300;
  const N = history.length;

  // 列表1：原始 50 套公式
  const rulesListA = [...ALL_RULES];

  // 列表2：仅直接剔除差公式，保留 40 套优质公式
  const rulesListB = ALL_RULES.filter(r => !WORST_IDS.includes(r.id));

  console.log(`Original Formulas count: ${rulesListA.length}`);
  console.log(`Optimized Formulas count: ${rulesListB.length}`);

  let stats = {
    original: { allCorrect: 0, total: 0 },
    optimized: { allCorrect: 0, total: 0 }
  };

  const targetThreshold = 95;
  const votingThreshold = targetThreshold - 3; // 92%

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - 1 - windowSize;

    // --- 模拟列表 A 的共识投票 ---
    const statsA = rulesListA.map(rule => {
      let sc = 0, tc = 0;
      for (let j = startIdx; j < i - 1; j++) {
        if (!history[j].includes(rule.fn(history[j - 1]))) sc++;
        tc++;
      }
      return { pred: rule.fn(prevDraw), accuracy: tc > 0 ? (sc / tc) * 100 : 0 };
    });
    
    let qualifiedA = statsA.filter(r => r.accuracy >= votingThreshold);
    if (qualifiedA.length < 15) {
      statsA.sort((a, b) => b.accuracy - a.accuracy);
      qualifiedA = statsA.slice(0, 25);
    }
    const votesA = new Array(50).fill(0);
    qualifiedA.forEach(q => votesA[q.pred]++);
    const rankedA = [];
    for(let n=1; n<=49; n++) if (votesA[n] > 0) rankedA.push({ n, v: votesA[n] });
    rankedA.sort((a,b) => b.v - a.v);
    const predsA = rankedA.slice(0, 3).map(x => x.n);
    const failedA = predsA.filter(p => currentDraw.includes(p));

    // --- 模拟列表 B 的共识投票 ---
    const statsB = rulesListB.map(rule => {
      let sc = 0, tc = 0;
      for (let j = startIdx; j < i - 1; j++) {
        if (!history[j].includes(rule.fn(history[j - 1]))) sc++;
        tc++;
      }
      return { pred: rule.fn(prevDraw), accuracy: tc > 0 ? (sc / tc) * 100 : 0 };
    });

    let qualifiedB = statsB.filter(r => r.accuracy >= votingThreshold);
    if (qualifiedB.length < 15) {
      statsB.sort((a, b) => b.accuracy - a.accuracy);
      qualifiedB = statsB.slice(0, 25);
    }
    const votesB = new Array(50).fill(0);
    qualifiedB.forEach(q => votesB[q.pred]++);
    const rankedB = [];
    for(let n=1; n<=49; n++) if (votesB[n] > 0) rankedB.push({ n, v: votesB[n] });
    rankedB.sort((a,b) => b.v - a.v);
    const predsB = rankedB.slice(0, 3).map(x => x.n);
    const failedB = predsB.filter(p => currentDraw.includes(p));

    // 记录评估
    stats.original.total++;
    if (failedA.length === 0) stats.original.allCorrect++;

    stats.optimized.total++;
    if (failedB.length === 0) stats.optimized.allCorrect++;
  }

  const originalRate = ((stats.original.allCorrect / stats.original.total) * 100).toFixed(2);
  const optimizedRate = ((stats.optimized.allCorrect / stats.optimized.total) * 100).toFixed(2);

  console.log('\n======================================================');
  console.log(`回测样本数：${testPeriods} 期 | 历史窗口：${windowSize} 期`);
  console.log('======================================================');
  console.log(`1. 原始 50 公式 (共识投票) 全对率:  ${originalRate}%`);
  console.log(`2. 优化 50 公式 (剔除劣质号) 全对率:  ${optimizedRate}%`);
  console.log(`全对概率相对变动:  ${(optimizedRate - originalRate).toFixed(2)}%`);
  console.log('======================================================');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});
